// Voice-over dispatcher. ads.json › voice.provider picks how lines become audio:
//
//   "gemini"  (default) whole-script take, cut at pauses, verified by transcription (voice/gemini.mjs)
//   "none"    no voice: scene length comes from reading speed, captions + music still play
//   "command" any CLI that writes an audio file, e.g. macOS `say`, Piper, espeak-ng
//   "./my-tts.mjs"  a JS module in your project: export default async ({ text, out, lang, config, env }) => {}
//
// Every non-Gemini line is normalised the same way (48 kHz mono WAV, loudness −16 LUFS, edges trimmed)
// and cached by a hash of (provider config + text), so re-renders after a CSS tweak cost nothing.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { duration, ffmpeg, UserError } from '../lib.mjs'
import { speakAll } from './gemini.mjs'

/** Optional per-scene-type mood tags (off unless voice.moods = true; a scene's own "mood" always wins). */
const MOOD = {
  chat: 'storytelling, a little conspiratorial',
  text: 'confident, emphatic',
  phone: 'clear, upbeat',
  trio: 'upbeat, counting off',
  end: 'warm, friendly, smiling',
}

/**
 * @param {{ texts: string[], scenes: object[], cacheDir: string, voice: object, lang: string, project: string, log: Function }} o
 * @returns {Promise<{file: string, duration: number}[]>} one entry per text
 */
export async function speak({ texts, scenes, cacheDir, voice, lang, project, log }) {
  const provider = voice.provider || 'gemini'
  const moods = scenes.map(s => s.mood || (voice.moods ? MOOD[s.type] : null))
  if (provider === 'gemini') return speakAll(texts, moods, path.join(cacheDir, 'gemini'), voice, process.env.GEMINI_API_KEY, log)

  let synthesize
  if (provider === 'command') synthesize = commandProvider(voice)
  else if (/\.(m?js)$/.test(provider)) {
    const file = path.resolve(project, provider)
    if (!fs.existsSync(file)) throw new UserError(`Voice provider module not found: ${file}`, 'ads.json › voice.provider is resolved relative to the project folder.')
    const mod = await import(pathToFileURL(file).href)
    synthesize = mod.default || mod.synthesize
    if (typeof synthesize !== 'function') throw new UserError(`${provider} must export a default async function ({ text, out, lang, config, env }).`)
  } else throw new UserError(`Unknown voice provider "${provider}".`, 'Use "gemini", "none", "command" or a path to a .mjs module (see docs/voice.md).')

  const dir = path.join(cacheDir, 'lines')
  fs.mkdirSync(dir, { recursive: true })
  const out = []
  for (const [i, text] of texts.entries()) {
    const said = moods[i] && voice.moodsInText ? `[${moods[i]}] ${text}` : text
    const hash = createHash('sha1').update(JSON.stringify({ voice, said, lang })).digest('hex').slice(0, 16)
    const file = path.join(dir, `${hash}.wav`)
    if (!fs.existsSync(file)) {
      const raw = path.join(dir, `${hash}.raw.${voice.ext || 'wav'}`)
      log(`  voice: line ${i + 1}/${texts.length} via ${provider}`)
      await synthesize({ text: said, out: raw, lang, config: voice, env: process.env })
      if (!fs.existsSync(raw) || !fs.statSync(raw).size) throw new UserError(`Voice provider "${provider}" did not write ${raw}.`)
      ffmpeg(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.02', '-ar', '48000', '-ac', '1', file], 'normalising a voice line')
      fs.rmSync(raw, { force: true })
    }
    out.push({ file, duration: duration(file) })
  }
  return out
}

/**
 * voice.command: array of args (no shell). Placeholders: {text}, {textFile}, {out}, {lang}.
 * voice.stdin: true pipes the text to stdin. voice.ext: extension the tool writes (default "wav").
 *   macOS:  { "provider": "command", "command": ["say", "-v", "Samantha", "-o", "{out}", "-f", "{textFile}"], "ext": "aiff" }
 *   Piper:  { "provider": "command", "command": ["piper", "--model", "en_US-lessac-medium.onnx", "--output_file", "{out}"], "stdin": true }
 */
function commandProvider(voice) {
  if (!Array.isArray(voice.command) || !voice.command.length) throw new UserError('voice.provider is "command" but voice.command is missing.', 'Example: "command": ["say", "-o", "{out}", "-f", "{textFile}"], "ext": "aiff"')
  return async ({ text, out, lang }) => {
    const textFile = `${out}.txt`
    fs.writeFileSync(textFile, text)
    const args = voice.command.map(a => a.replaceAll('{text}', text).replaceAll('{textFile}', textFile).replaceAll('{out}', out).replaceAll('{lang}', lang))
    const r = spawnSync(args[0], args.slice(1), { input: voice.stdin ? text : undefined, encoding: 'utf8' })
    fs.rmSync(textFile, { force: true })
    if (r.error) throw new UserError(`Voice command "${args[0]}" could not start: ${r.error.message}`, 'Check voice.command in ads.json and that the tool is installed.')
    if (r.status !== 0) throw new UserError(`Voice command exited with ${r.status}.`, (r.stderr || '').trim().split('\n').slice(-4).join('\n'))
  }
}
