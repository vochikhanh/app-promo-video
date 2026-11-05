// Render one script into every requested aspect ratio.
//
//   voice (cached) → scene durations → frames via headless Chrome (stage.html) → ffmpeg
//   + synthesized music + generated SFX, ducked under the voice → out/<name>-<aspect>.mp4 + .vtt
//
// `stills: true` skips audio entirely and saves one frame per scene per aspect, plus a contact
// sheet per aspect, so layout can be reviewed from a single small image.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ASPECTS, ENGINE, ROOT, UserError, duration, ffmpeg, findChrome, findProject, python, readJson, rel, requireTools } from './lib.mjs'
import { MEDIA, findMedia, validate } from './validate.mjs'
import { speak } from './voice/index.mjs'

const FPS = 30
const LEAD = 0.03 // seconds of silence before each line

export async function build(o) {
  const log = o.quiet ? () => {} : (...a) => console.log(...a)
  requireTools('ffmpeg', 'ffprobe', ...(o.stills || o.noMusic ? [] : ['python3']))
  const scriptFile = path.resolve(o.script)
  const project = findProject(scriptFile, o.project)
  const spec = readJson(scriptFile, 'Script')
  const config = readJson(path.join(project, 'ads.json'), 'ads.json')
  const { errors, warnings } = validate(spec, config, project)
  if (errors.length) throw new UserError(`${rel(scriptFile)} has ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`, 'Fix them and run again (`promo-video check <script>` validates without rendering).')
  if (!o.quiet) for (const w of warnings) console.warn(`  note: ${w}`)

  const lang = spec.lang || config.defaultLang
  const L = config.lang[lang]
  const name = path.basename(scriptFile, '.json')
  const aspects = o.aspects || (config.aspects ? config.aspects.map(a => Object.keys(ASPECTS).find(k => ASPECTS[k].tag === a || k === a)) : ['v', 's', 'h'])
  const outDir = path.join(project, 'out')
  const cache = path.join(project, '.cache')
  const work = path.join(cache, 'work', name)
  fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(work, { recursive: true })
  const scenes = spec.scenes.map(s => ({ ...s, clips: s.clips?.map(c => ({ ...c })) }))

  // ---- media → JPEG frames in .cache/frames/<id>/ (30 fps, 640 px wide). A still image is one frame:
  // the stage holds the last frame, so the image stays put while the phone floats and zooms.
  const frames = {}
  for (const s of scenes) for (const c of s.clips || (s.clip ? [s] : [])) {
    const src = findMedia(project, lang, c.clip)
    const st = fs.statSync(src)
    const id = `${path.basename(src, path.extname(src))}-${createHash('sha1').update(`${src}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 8)}`
    c.media = id
    const dir = path.join(cache, 'frames', id)
    if (!fs.existsSync(path.join(dir, '00001.jpg'))) {
      fs.mkdirSync(dir, { recursive: true })
      const still = MEDIA.image.includes(path.extname(src).toLowerCase())
      ffmpeg(['-i', src, ...(still ? ['-frames:v', '1', '-vf', 'scale=640:-2'] : ['-vf', `fps=${FPS},scale=640:-2`]), '-q:v', '3', path.join(dir, '%05d.jpg')], `reading ${rel(src)}`)
    }
    frames[id] = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length
  }

  // ---- voice
  const lexicon = Object.entries(L.lexicon || {})
  const pronounce = t => lexicon.reduce((s, [w, said]) => s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu'), said), t)
  const tail = spec.tail ?? config.tail ?? 0.2
  const cps = config.readingSpeed ?? 15 // characters per second when there is no voice
  const voiceCfg = { ...(config.voice || {}), ...(L.voice || {}) }
  if (voiceCfg.director) voiceCfg.director = [].concat(voiceCfg.director).map(l => l.replaceAll('{LANG}', L.accent || lang))
  const silent = o.stills || o.noVoice || voiceCfg.provider === 'none'
  let voice = scenes.map(() => null)
  if (!silent) {
    const speaking = scenes.map((s, i) => s.say?.trim() ? i : -1).filter(i => i >= 0)
    const got = await speak({ texts: speaking.map(i => pronounce(scenes[i].say.trim())), scenes: speaking.map(i => scenes[i]), cacheDir: path.join(cache, 'voice'), voice: voiceCfg, lang, project, log })
    speaking.forEach((i, k) => { voice[i] = got[k] })
    const speed = config.speed ?? 1
    if (speed !== 1) voice = voice.map((v, i) => {
      if (!v) return v
      const f = path.join(work, `_fast-${i}.wav`)
      ffmpeg(['-i', v.file, '-af', `atempo=${speed}`, f], 'changing voice speed')
      return { file: f, duration: duration(f) }
    })
  }
  const spoken = (s, i) => voice[i]?.duration ?? (s.say ? s.say.length / cps : 0)
  scenes.forEach((s, i) => {
    s.duration = s.duration != null && !s.say ? s.duration : Math.max(s.min ?? 1.6, spoken(s, i) + (s.say ? LEAD + tail : 0) + (s.hold ?? 0))
  })
  const total = scenes.reduce((a, s) => a + s.duration, 0)

  // word timings for captions: spread the spoken duration over the words by letter count
  function timing(s, i) {
    const text = (s.cap ?? s.say ?? '').trim()
    if (!text) return []
    const ws = text.split(/\s+/)
    const len = spoken(s, i)
    const weight = ws.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5)
    const sum = weight.reduce((a, b) => a + b, 0)
    let at = LEAD
    return ws.map((w, k) => { const a = at; at += len * weight[k] / sum; return { w, a, b: at } })
  }

  const fileUrl = p => pathToFileURL(path.resolve(project, p)).href
  const features = (L.features || []).map(a => ({ ...a, icon: a.icon ? fileUrl(a.icon) : null }))
  const data = {
    scenes: scenes.map(s => ({ ...s, items: s.items?.map(a => ({ ...a, icon: a.icon ? fileUrl(a.icon) : null })) })),
    theme: { ...config.themes[spec.theme || Object.keys(config.themes)[0]], ...(spec.colors || {}) },
    frames, frameDir: pathToFileURL(path.join(cache, 'frames')).href,
    icon: config.icon ? fileUrl(config.icon) : '', features, chunk: L.chunk || 4,
    appName: config.appName, url: config.url || '', badges: spec.badges || config.badges || ['App Store', 'Google Play'],
    fonts: (config.fonts || []).map(f => ({ ...f, src: fileUrl(f.src) })),
    noCaptions: o.noCaptions || spec.captions === false, noBrand: spec.brand === false,
  }

  // ---- audio, mixed once and shared by every aspect
  let audio = null
  if (!o.stills) {
    const parts = scenes.map((s, i) => {
      const p = path.join(work, `_v${i}.wav`)
      if (voice[i]) ffmpeg(['-i', voice[i].file, '-af', `adelay=${Math.round(LEAD * 1000)},apad=whole_dur=${s.duration.toFixed(3)}`, '-ar', '48000', '-ac', '1', p], 'padding a voice line')
      else ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono`, '-t', s.duration.toFixed(3), p], 'making silence')
      return p
    })
    fs.writeFileSync(path.join(work, 'v.txt'), parts.map(p => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'))
    const vt = path.join(work, 'voice.wav')
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'v.txt'), '-c', 'copy', vt], 'joining voice lines')
    // SFX, generated with ffmpeg (no sample files): whoosh on every cut, pop per chat message, ding on confetti
    const sfx = path.join(cache, 'sfx')
    fs.mkdirSync(sfx, { recursive: true })
    const mk = (n, args) => { const f = path.join(sfx, n); if (!fs.existsSync(f)) ffmpeg([...args, '-ar', '48000', '-ac', '1', f], `making ${n}`); return f }
    const whoosh = mk('whoosh.wav', ['-f', 'lavfi', '-i', 'anoisesrc=d=0.32:c=pink:a=0.6:r=48000', '-af', 'highpass=f=700,lowpass=f=7000,afade=t=in:d=0.16:curve=exp,afade=t=out:st=0.16:d=0.16,volume=0.30'])
    const pop = mk('pop.wav', ['-f', 'lavfi', '-i', "aevalsrc='0.7*sin(2*PI*(500+900*exp(-30*t))*t)*exp(-22*t)':s=48000:d=0.18"])
    const ding = mk('ding.wav', ['-f', 'lavfi', '-i', "aevalsrc='0.35*(sin(2*PI*1318*t)+0.6*sin(2*PI*1976*t)+0.3*sin(2*PI*2637*t))*exp(-4*t)':s=48000:d=1.2"])
    const ev = []
    if (spec.sfx !== false) {
      let at = 0
      for (const [i, s] of scenes.entries()) {
        if (i > 0) ev.push([whoosh, at - 0.14])
        if (s.type === 'chat') s.chat.msgs.forEach((m, j) => ev.push([pop, at + (m.at ?? (0.12 + j * (s.gap || 0.32)))]))
        if (s.confetti != null) ev.push([ding, at + s.confetti])
        at += s.duration
      }
    }
    const style = o.noMusic ? 'none' : (spec.music || 'bright')
    const music = path.join(work, 'music.wav')
    if (style === 'none') ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=32000:cl=mono', '-t', total.toFixed(2), music], 'making silence')
    else {
      const r = spawnSync(python(), [path.join(ENGINE, 'music.py'), style, total.toFixed(2), music], { encoding: 'utf8' })
      if (r.status !== 0) throw new UserError('Music synthesis failed.', (r.stderr || r.error?.message || '').trim())
    }
    const inputs = ['-i', vt, ...ev.flatMap(([f]) => ['-i', f]), '-i', music]
    const m = ev.length + 1
    const graph = (ev.length ? ev.map(([, t], k) => `[${k + 1}]adelay=${Math.max(0, Math.round(t * 1000))}[e${k}]`).join(';') + ';' : '') +
      `[0]${ev.map((_, k) => `[e${k}]`).join('')}amix=inputs=${ev.length + 1}:normalize=0:duration=first[vs];[vs]asplit[vs1][key];` +
      `[${m}]aresample=48000,volume=${config.musicVolume ?? 0.22}[bed];[bed][key]sidechaincompress=threshold=0.03:ratio=5:attack=20:release=300[duck];` +
      `[vs1][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`
    audio = path.join(work, 'mix.wav')
    ffmpeg([...inputs, '-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-ac', '2', audio], 'mixing audio')
  }

  // ---- picture
  let puppeteer
  try { puppeteer = createRequire(path.join(ROOT, 'package.json'))('puppeteer-core') } catch {
    throw new UserError('puppeteer-core is not installed.', `Run \`npm install\` in ${ROOT}.`)
  }
  const browser = await puppeteer.launch({ executablePath: findChrome(o.chrome), headless: true, protocolTimeout: 600000, args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--no-sandbox'] })
  const results = []
  const stillDir = path.join(outDir, 'stills', name)
  if (o.stills) { fs.rmSync(stillDir, { recursive: true, force: true }); fs.mkdirSync(stillDir, { recursive: true }) }
  try {
    await Promise.all(aspects.map(async a => {
      const { w, h, tag } = ASPECTS[a]
      const page = await browser.newPage()
      const pageErrors = []
      page.on('pageerror', e => pageErrors.push(e.message))
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
      await page.goto(pathToFileURL(path.join(ENGINE, 'stage.html')).href, { waitUntil: 'load' })
      await page.evaluate(d => window.setup(d), { ...data, aspect: a })
      await page.evaluate(() => document.fonts.ready)
      const draw = (i, t, cap, el) => page.evaluate((i, t, cap, total, el) => window.frame(i, t, cap, total, el), i, t, cap, total, el)
      if (o.stills) {
        for (const [i, s] of scenes.entries()) {
          const t = s.still ?? s.duration * 0.8
          await draw(i, t, { words: timing(s, i), at: t * 0.6 }, 0)
          await page.screenshot({ path: path.join(stillDir, `${tag}-${String(i + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 85 })
        }
        // one contact sheet per aspect: review the whole video from one small image
        const sheet = path.join(stillDir, `sheet-${tag}.jpg`)
        const cols = Math.min(scenes.length, a === 'h' ? 4 : 7), rows = Math.ceil(scenes.length / cols)
        const tw = a === 'h' ? 480 : 270
        ffmpeg(['-framerate', '1', '-i', path.join(stillDir, `${tag}-%02d.jpg`), '-vf', `scale=${tw}:-2,tile=${cols}x${rows}:padding=8:color=white`, '-frames:v', '1', '-q:v', '4', sheet], 'making the contact sheet')
        results.push(sheet)
        if (pageErrors.length) throw new UserError(`The stage reported errors (${tag}): ${pageErrors.join('; ')}`)
        return
      }
      const video = path.join(outDir, `${name}-${tag}.mp4`)
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', String(o.crf ?? 20), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', video],
      { stdio: ['pipe', 'inherit', 'inherit'] })
      const done = new Promise((ok, bad) => ff.on('close', c => c === 0 ? ok() : bad(new UserError(`ffmpeg exited with ${c} while encoding ${rel(video)}.`))))
      let elapsed = 0
      for (const [i, s] of scenes.entries()) {
        const ws = timing(s, i)
        const n = Math.round(s.duration * FPS)
        for (let f = 0; f < n; f++) {
          const t = f / FPS
          await draw(i, t, { words: ws, at: t }, elapsed)
          const shot = await page.screenshot({ type: 'jpeg', quality: 92, optimizeForSpeed: true })
          if (!ff.stdin.write(shot)) await new Promise(r => ff.stdin.once('drain', r))
        }
        elapsed += s.duration
        if (o.progress) o.progress(tag, i + 1, scenes.length)
      }
      ff.stdin.end()
      await done
      if (pageErrors.length) throw new UserError(`The stage reported errors (${tag}): ${pageErrors.join('; ')}`)
      // cover image = the middle of the hook scene, when all of its text is on screen
      await draw(0, Math.min(2.2, scenes[0].duration - 0.1), null, 0)
      await page.screenshot({ path: path.join(outDir, `${name}-${tag}-cover.jpg`), type: 'jpeg', quality: 90 })
      results.push(video)
      log(`✓ ${rel(video)} (${total.toFixed(1)}s)`)
    }))
  } finally { await browser.close() }

  if (o.stills) {
    log(`✓ stills: ${rel(stillDir)}/ (~${total.toFixed(1)}s video) · review sheet-*.jpg first`)
    return { stills: results, total }
  }

  // ---- WebVTT captions, same phrase rule as chunks() in stage.html
  const stamp = x => { const ms = Math.round(x * 1000); return `${String(Math.floor(ms / 3.6e6)).padStart(2, '0')}:${String(Math.floor(ms / 6e4) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}` }
  const cues = []
  let el = 0
  for (const [i, s] of scenes.entries()) {
    const ws = timing(s, i), n = L.chunk || 4
    const groups = []; let cur = []
    for (const [k, w] of ws.entries()) {
      cur.push(w)
      const left = ws.length - k - 1
      const P = /[,.!?:;…]$/, next = ws[k + 1]
      if ((P.test(w.w) && cur.length >= 2) || cur.length > n || (cur.length === n && !(left === 1 || (next && P.test(next.w))))) { groups.push(cur); cur = [] }
    }
    if (cur.length) groups.push(cur)
    groups.forEach((g, k) => cues.push(`${stamp(el + g[0].a)} --> ${stamp(el + (groups[k + 1]?.[0].a ?? s.duration))}\n${g.map(w => w.w).join(' ')}`))
    el += s.duration
  }
  const vtt = path.join(outDir, `${name}.vtt`)
  fs.writeFileSync(vtt, `WEBVTT\n\n${cues.join('\n\n')}\n`)
  log(`✓ ${rel(vtt)}`)
  return { videos: results, vtt, total }
}
