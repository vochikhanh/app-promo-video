// Let Gemini watch / listen / look and answer, so an AI agent never has to ingest video frames.
//
//   promo-video judge <file> ["question"] [--model gemini-flash-latest]
//   promo-video voices "<a line from your script>" [--voices Leda,Puck,Kore,Aoede] [--lang en]
//
// Videos are sent as a small 540p proxy (cheaper, faster, and under the inline upload limit).
import fs from 'node:fs'
import path from 'node:path'
import { ffmpeg, tmpDir, UserError } from './lib.mjs'
import { DEFAULT_CHECK_MODEL, DEFAULT_MODEL, synth } from './voice/gemini.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4',
  '.wav': 'audio/wav', '.mp3': 'audio/mp3', '.m4a': 'audio/aac', '.aac': 'audio/aac',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
}

export const RUBRIC = `You are reviewing a short mobile app ad before it goes live.
Answer in this exact format, one line each, no preamble:
HOOK: <1-10> <does the first 2 seconds make you want to keep watching? why, in under 15 words>
TEXT: <1-10> <is every headline, chip and caption fully readable, never clipped, overlapping or covered?>
SYNC: <1-10> <do captions and visuals match what the voice is saying at that moment?>
VOICE: <1-10> <natural, warm, clear, steady energy? any glitches, cut words or odd pauses?>
PACE: <1-10> <too slow, too rushed, or right for a social ad?>
CTA: <1-10> <is it obvious what to do and where to get it at the end?>
FIX: <the single most valuable change, or "none">`

const IMAGE_RUBRIC = `These are layout previews of a short mobile app ad (one frame per scene).
List ONLY real problems, one per line, as "scene N: problem": text clipped or running off the frame,
text overlapping the device or another element, unreadable contrast, empty or broken images.
If there are none, answer exactly: OK`

export async function judge(file, question, { model = DEFAULT_CHECK_MODEL } = {}) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new UserError('judge needs GEMINI_API_KEY.', 'Put it in .env (see .env.example) or export it in your shell.')
  if (!fs.existsSync(file)) throw new UserError(`File not found: ${file}`)
  const ext = path.extname(file).toLowerCase()
  const mime = MIME[ext]
  if (!mime) throw new UserError(`judge cannot send ${ext} files.`, `Supported: ${Object.keys(MIME).join(' ')}`)
  let send = file
  let tmp = null
  if (mime.startsWith('video/')) {
    tmp = tmpDir('promo-judge-')
    send = path.join(tmp, 'proxy.mp4')
    ffmpeg(['-i', file, '-vf', "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', '-b:a', '64k', send], 'making a review proxy')
  }
  const bytes = fs.readFileSync(send)
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  if (bytes.length > 19 * 1024 * 1024) throw new UserError(`${path.basename(file)} is too large to send inline (${(bytes.length / 1048576).toFixed(1)} MB).`, 'Trim it first, e.g. ffmpeg -i in.mp4 -t 30 short.mp4')
  const prompt = question || (mime.startsWith('image/') ? IMAGE_RUBRIC : RUBRIC)
  return ask(model, key, [{ inline_data: { mime_type: send === file ? mime : 'video/mp4', data: bytes.toString('base64') } }, { text: prompt }])
}

async function ask(model, key, parts) {
  let res, json
  try {
    res = await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts }] }) })
    json = await res.json()
  } catch (e) { throw new UserError(`Could not reach Gemini: ${e.message}`) }
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('')
  if (!res.ok || !text) throw new UserError(`Gemini ${model} answered HTTP ${res.status}: ${json?.error?.message || JSON.stringify(json).slice(0, 300)}`,
    res.status === 404 ? 'Pass --model with a current Gemini model name.' : res.status === 429 ? 'Rate limited: wait a minute and retry.' : undefined)
  return text.trim()
}

/** Read one line in several voices, then let Gemini score each take. Writes out/voices/<voice>.wav. */
export async function audition(line, { voices, model, lang, outDir, director }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new UserError('voices needs GEMINI_API_KEY.')
  fs.mkdirSync(outDir, { recursive: true })
  const rows = []
  for (const v of voices) {
    const file = path.join(outDir, `${v}.wav`)
    if (!fs.existsSync(file)) await synth(`${director ? director + '\n' : ''}${line}`, file, model || DEFAULT_MODEL, v, key)
    const verdict = await judge(file, `This is a voice-over take for a cheerful ${lang} mobile app ad. Score it 1-10 for naturalness, warmth and clarity, and note any mispronunciation. Answer as one line: "<score>/10 <reason in under 15 words>"`)
    rows.push({ voice: v, file, verdict: verdict.split('\n')[0] })
  }
  return rows.sort((a, b) => parseFloat(b.verdict) - parseFloat(a.verdict))
}
