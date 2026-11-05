// Friendly validation for ads.json and script files. The JSON Schemas in schema/ describe the same
// rules for editors and agents; this file gives precise, human error messages at build time.
import fs from 'node:fs'
import path from 'node:path'

export const SCENE_TYPES = ['chat', 'phone', 'text', 'trio', 'end']
export const MUSIC_STYLES = ['bright', 'warm', 'playful', 'none']
export const MEDIA = { video: ['.mov', '.mp4', '.webm', '.m4v'], image: ['.png', '.jpg', '.jpeg', '.webp'] }

/** Returns { errors: string[], warnings: string[] }. */
export function validate(spec, config, project) {
  const errors = [], warnings = []
  const err = (where, msg) => errors.push(`${where}: ${msg}`)
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

  // ---- ads.json
  if (!config.appName) err('ads.json', 'missing "appName"')
  if (!config.lang || typeof config.lang !== 'object') err('ads.json', 'missing "lang" (one block per language, e.g. { "en": { "accent": "American English" } })')
  if (!config.themes || !Object.keys(config.themes).length) err('ads.json', 'missing "themes" (at least one { "c1", "c2" } color pair)')
  for (const [k, t] of Object.entries(config.themes || {})) for (const c of ['c1', 'c2']) {
    if (!t[c]) err(`ads.json › themes.${k}`, `missing "${c}" color`)
  }
  if (config.icon && !fs.existsSync(path.resolve(project, config.icon))) err('ads.json › icon', `file not found: ${config.icon}`)

  // ---- script
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) { err('script', '"scenes" must be a non-empty array'); return { errors, warnings } }
  const lang = spec.lang || config.defaultLang
  if (!lang) err('script', 'missing "lang" (and no "defaultLang" in ads.json)')
  else if (config.lang && !config.lang[lang]) err('script › lang', `"${lang}" has no block in ads.json › lang (have: ${Object.keys(config.lang).join(', ') || 'none'})`)
  const theme = spec.theme || Object.keys(config.themes || {})[0]
  if (spec.theme && config.themes && !config.themes[spec.theme]) err('script › theme', `"${spec.theme}" is not in ads.json › themes (have: ${Object.keys(config.themes).join(', ')})`)
  if (spec.music != null && !MUSIC_STYLES.includes(spec.music)) err('script › music', `"${spec.music}" is not a style (use ${MUSIC_STYLES.join(', ')})`)
  void theme

  spec.scenes.forEach((s, i) => {
    const at = `scene ${i + 1}${s.type ? ` (${s.type})` : ''}`
    if (!SCENE_TYPES.includes(s.type)) { err(at, `"type" must be one of ${SCENE_TYPES.join(', ')} (got ${JSON.stringify(s.type)})`); return }
    if (s.say != null && typeof s.say !== 'string') err(at, '"say" must be a string')
    if (!s.say && s.duration == null) warn(at, 'no "say" and no "duration": the scene will last "min" seconds (default 1.6)')
    if (s.say) {
      const words = s.say.trim().split(/\s+/).length
      if (words > 22) warn(at, `"say" has ${words} words; 8–15 reads best, long lines feel slow`)
    }
    if (s.big) {
      const lines = s.big.split('\n')
      if (lines.length > 3) warn(at, `"big" has ${lines.length} lines; keep it to 2 (overflows in 1:1)`)
      const longest = Math.max(...lines.map(l => l.replace(/\*/g, '').length))
      if (longest > 22) warn(at, `a "big" line has ${longest} characters; ~18 max fits every aspect (break with \\n)`)
      if ((s.big.match(/\*/g) || []).length % 2) err(at, '"big" has an unmatched * (wrap highlighted words as *like this*)')
    }
    if (s.type === 'phone') {
      const clips = s.clips || (s.clip ? [s] : [])
      if (!clips.length) err(at, 'needs "clip" (a file name in screens/, without extension) or "clips": [{ "clip", "label" }]')
      for (const c of clips) if (c.clip && !findMedia(project, lang, c.clip)) {
        err(at, `no media for clip "${c.clip}": put screens/${lang}-${c.clip}.png (or .jpg/.webp/.mov/.mp4) or screens/${c.clip}.png`)
      }
      if (s.device && !['phone', 'card'].includes(s.device)) err(at, '"device" must be "phone" or "card"')
      if (s.zoom) {
        for (const k of ['s', 'x', 'y']) if (typeof s.zoom[k] !== 'number') err(at, `"zoom.${k}" must be a number (s = scale like 1.3, x/y = 0..1 focus point)`)
      }
      if ((s.chips || []).length > 4) warn(at, 'more than 4 chips: only 4 default positions exist')
    }
    if (s.type === 'chat') {
      if (!s.chat || !Array.isArray(s.chat.msgs) || !s.chat.msgs.length) err(at, 'needs "chat": { "title", "msgs": [{ "who", "text" }] }')
      else s.chat.msgs.forEach((m, j) => { if (!m.emoji && (!m.text || (!m.who && !m.me))) err(`${at} › msg ${j + 1}`, 'needs "text" and "who" (or "me": true), or "emoji"') })
    }
    if (s.type === 'trio') {
      const items = s.items || config.lang?.[lang]?.features
      if (!items?.length) err(at, 'needs "items" in the scene or "features" in ads.json › lang.' + lang)
      else if (items.length > 4) warn(at, `${items.length} tiles; 3 fit best, 4 max`)
      for (const it of items || []) if (it.icon && !fs.existsSync(path.resolve(project, it.icon))) err(at, `tile icon not found: ${it.icon}`)
    }
    if (s.type === 'end' && !s.cta) warn(at, 'no "cta" text: the button will be empty')
  })
  if (spec.scenes[0]?.type !== 'chat' && spec.scenes[0]?.type !== 'text') warnings.push('scene 1: tip: open with a "chat" or "text" hook; the first 2 seconds decide whether people keep watching')
  if (spec.scenes.at(-1)?.type !== 'end') warnings.push(`scene ${spec.scenes.length}: tip: finish with an "end" scene (call to action)`)
  return { errors, warnings }
}

/** screens/<lang>-<clip>.<ext> first, then screens/<clip>.<ext>. */
export function findMedia(project, lang, clip) {
  const dir = path.join(project, 'screens')
  for (const base of [`${lang}-${clip}`, clip]) for (const ext of [...MEDIA.video, ...MEDIA.image]) {
    for (const e of [ext, ext.toUpperCase()]) {
      const f = path.join(dir, base + e)
      if (fs.existsSync(f)) return f
    }
  }
  return null
}
