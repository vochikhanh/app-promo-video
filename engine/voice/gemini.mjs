// Gemini TTS provider (default).
//
// Reads the WHOLE script in one take (one continuous, natural-sounding performance) steered by a
// "director profile", then cuts the take at the silences between paragraphs and asks Gemini to
// transcribe every piece to make sure each cut landed in the right place. A bad take is re-read
// (up to 3 times); after that it falls back to one request per line. You never have to listen.
//
// Lessons from production:
// - Per-line emotion tags like [excited] made the voice jumpy and anxious. One shared director
//   profile, no per-line tags, sounded far more natural (judge scores 9–10 vs 5–6).
// - Pick the voice by letting Gemini listen to a few candidates and score them.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { duration, ffmpeg, UserError } from '../lib.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
export const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview'
export const DEFAULT_VOICE = 'Leda'
export const DEFAULT_CHECK_MODEL = 'gemini-flash-latest'

/**
 * @param {string[]} said    lines to speak (lexicon already applied), one per speaking scene
 * @param {(string|null)[]} moods  optional per-line mood (off by default, see notes above)
 * @returns {Promise<{file: string, duration: number}[]>}
 */
export async function speakAll(said, moods, cacheDir, cfg, key, log) {
  if (!key) throw new UserError('GEMINI_API_KEY is not set, so the Gemini voice cannot run.',
    'Put GEMINI_API_KEY=... in .env (see .env.example), or build without a voice: add --no-voice.\n' +
    'You can also switch providers in ads.json › voice.provider (see docs/voice.md).')
  fs.mkdirSync(cacheDir, { recursive: true })
  const model = cfg.model || DEFAULT_MODEL, voice = cfg.voice || DEFAULT_VOICE
  const tagged = said.map((t, i) => moods[i] ? `[${moods[i]}] ${t}` : t)
  const director = (Array.isArray(cfg.director) ? cfg.director.join('\n') : cfg.director || '').trim()
  if (said.length === 1) return [await single(tagged[0])]

  let problem = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const hash = createHash('sha1').update(`${model}|${voice}|${director}|${attempt}|${tagged.join('\n\n')}`).digest('hex').slice(0, 16)
    const base = path.join(cacheDir, `take-${hash}`)
    if (fs.existsSync(`${base}.json`)) {
      const segs = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'))
      if (segs.every(s => fs.existsSync(s.file))) return segs
    }
    if (fs.existsSync(`${base}.bad`)) { problem = fs.readFileSync(`${base}.bad`, 'utf8'); continue }
    if (!fs.existsSync(`${base}.wav`)) {
      log(`  voice: reading the whole script in one take (${model}, ${voice})${attempt > 1 ? `, attempt ${attempt}` : ''}`)
      await synth(`${director}\n${tagged.join('\n\n')}`, `${base}.wav`, model, voice, key)
    }
    const cuts = boundaries(`${base}.wav`, said)
    if (!cuts) { problem = 'could not find a pause between every pair of lines'; fs.writeFileSync(`${base}.bad`, problem); continue }
    const segs = cuts.map(([a, b], i) => {
      const file = `${base}-${String(i).padStart(2, '0')}.wav`
      ffmpeg(['-ss', a.toFixed(3), '-to', b.toFixed(3), '-i', `${base}.wav`, '-af', TRIM, `${file}.tmp.wav`], 'cutting the voice take')
      const d = duration(`${file}.tmp.wav`)
      // 60 ms fade-out so the joint between two scenes never clicks.
      ffmpeg(['-i', `${file}.tmp.wav`, '-af', `afade=t=out:st=${Math.max(0, d - 0.06).toFixed(3)}:d=0.06`, file], 'fading the voice cut')
      fs.rmSync(`${file}.tmp.wav`)
      return { file, duration: duration(file) }
    })
    if (cfg.verify === false) { fs.writeFileSync(`${base}.json`, JSON.stringify(segs)); return segs }
    log('  voice: checking every cut with a Gemini transcription')
    problem = await verify(segs, said, key, cfg.checkModel || DEFAULT_CHECK_MODEL)
    if (!problem) { fs.writeFileSync(`${base}.json`, JSON.stringify(segs)); return segs }
    fs.writeFileSync(`${base}.bad`, problem)
    log(`  ⚠ take ${attempt} did not cut cleanly (${problem}); reading again`)
  }
  log(`  ⚠ falling back to one request per line: ${problem}`)
  const out = []
  for (const t of tagged) out.push(await single(t))
  return out

  async function single(text) {
    const file = path.join(cacheDir, `line-${createHash('sha1').update(`${model}|${voice}|${director}|${text}`).digest('hex').slice(0, 16)}.wav`)
    if (!fs.existsSync(file)) {
      await synth(`${director}\n${text}`, `${file}.raw.wav`, model, voice, key)
      ffmpeg(['-i', `${file}.raw.wav`, '-af', TRIM, file], 'trimming the voice line')
      fs.rmSync(`${file}.raw.wav`)
    }
    return { file, duration: duration(file) }
  }
}

const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,afade=t=in:d=0.02'

export async function synth(prompt, out, model, voice, key) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  }
  for (let attempt = 1; ; attempt++) {
    let res, json = null, text = ''
    try {
      res = await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) })
      text = await res.text()
      try { json = JSON.parse(text) } catch {}
    } catch (e) { text = e.message }
    const data = json?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData
    if (data) {
      const rate = (data.mimeType.match(/rate=(\d+)/) || [])[1] || '24000'
      fs.writeFileSync(`${out}.pcm`, Buffer.from(data.data, 'base64'))
      ffmpeg(['-f', 's16le', '-ar', rate, '-ac', '1', '-i', `${out}.pcm`, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', out], 'decoding Gemini audio')
      fs.rmSync(`${out}.pcm`)
      return
    }
    const status = res?.status
    if (status === 400 || status === 401 || status === 403 || status === 404 || attempt >= 4) {
      const msg = json?.error?.message || text.slice(0, 300)
      const hint = status === 404 ? `Model "${model}" was not found. Set ads.json › voice.model to a current Gemini TTS model (see https://ai.google.dev/gemini-api/docs/speech-generation).`
        : status === 400 && /voice/i.test(msg) ? `Voice "${voice}" is not available. Pick one of the Gemini prebuilt voices (Leda, Puck, Kore, Charon, Aoede, …).`
        : status === 401 || status === 403 ? 'Check GEMINI_API_KEY (and that the Generative Language API is enabled for it).'
        : status === 429 ? 'Rate limit or quota reached. Wait a minute and run again: finished takes are cached.'
        : 'Run again (finished takes are cached) or build with --no-voice.'
      throw new UserError(`Gemini TTS failed${status ? ` (HTTP ${status})` : ''}: ${msg}`, hint)
    }
    await new Promise(r => setTimeout(r, (status === 429 ? 8000 : 1500) * attempt))
  }
}

/** [start, end] seconds of every line: the longest pauses near where each line should end (by character share). */
function boundaries(file, texts) {
  const total = duration(file)
  const raw = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.2', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const silences = []
  for (const m of raw.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) {
    const start = Number(m[1]), end = Number(m[2])
    if (start > 0.05 && end < total - 0.05) silences.push({ start, end, mid: (start + end) / 2, dur: end - start })
  }
  const all = texts.reduce((a, t) => a + t.length, 0)
  const cuts = []
  let floor = 0, acc = 0
  for (let k = 0; k < texts.length - 1; k++) {
    acc += texts[k].length
    const expected = total * acc / all
    const window = Math.max(1.5, total * 0.08)
    const pick = silences
      .filter(s => s.mid > floor + 0.5 && Math.abs(s.mid - expected) <= window)
      .map(s => ({ ...s, score: s.dur * 2 - Math.abs(s.mid - expected) / window }))
      .sort((a, b) => b.score - a.score)[0]
    if (!pick) return null
    cuts.push(pick.mid)
    floor = pick.mid
  }
  const edges = [0, ...cuts, total]
  return texts.map((_, i) => [edges[i], edges[i + 1]])
}

/** Transcribe each piece. Numbers and brand names are often heard differently, so a moderate match passes when either end matches. */
async function verify(segs, texts, key, model) {
  const norm = s => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
  for (const [i, seg] of segs.entries()) {
    const mp3 = `${seg.file}.mp3`
    ffmpeg(['-i', seg.file, '-ar', '16000', '-ac', '1', '-b:a', '48k', mp3], 'encoding a check clip')
    const audio = fs.readFileSync(mp3).toString('base64')
    fs.rmSync(mp3)
    let heard = ''
    try {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'audio/mp3', data: audio } }, { text: 'Transcribe every word spoken in this audio, verbatim. Output only the transcript.' }] }] }),
      })
      if (!res.ok) return null // the check is a safety net: never block a build because it failed
      heard = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    } catch { return null }
    const want = norm(texts[i]), got = norm(heard)
    const score = similarity(want, got)
    const ends = s => { const w = s.split(' '); return [w.slice(0, 2).join(' '), w.slice(-2).join(' ')] }
    const [wa, wz] = ends(want), [ga, gz] = ends(got)
    if (score < 0.7 && !(score >= 0.5 && (wa === ga || wz === gz))) return `line ${i + 1} matched ${Math.round(score * 100)}%: heard "${heard.trim().slice(0, 60)}"`
  }
  return null
}

function similarity(a, b) {
  const x = a.split(' '), y = b.split(' ')
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)])
  for (let j = 1; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length, 1)
}
