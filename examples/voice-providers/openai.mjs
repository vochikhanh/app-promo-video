// Example voice provider: OpenAI text-to-speech.
//
// ads.json:
//   "voice": {
//     "provider": "../voice-providers/openai.mjs",   // path relative to your project folder
//     "model": "gpt-4o-mini-tts",
//     "voice": "coral",
//     "director": "Cheerful, warm lifestyle creator. Upbeat, smiling, never salesy."
//   }
// .env: OPENAI_API_KEY=...
//
// A provider receives one line at a time and must write an audio file at `out` (any format ffmpeg
// reads). The engine trims silence, normalises loudness, caches by (config + text) and times the
// scene to the result. Not exercised by the maintainers' test run: treat it as a starting point.
import fs from 'node:fs'

export default async function synthesize({ text, out, config, env }) {
  const key = env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set (add it to .env)')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini-tts',
      voice: config.voice || 'coral',
      input: text,
      instructions: [].concat(config.director || []).join('\n') || undefined,
      response_format: 'wav',
    }),
  })
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`)
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))
}
