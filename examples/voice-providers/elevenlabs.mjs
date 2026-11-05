// Example voice provider: ElevenLabs.
//
// ads.json:
//   "voice": {
//     "provider": "../voice-providers/elevenlabs.mjs",
//     "voiceId": "<a voice id from your ElevenLabs library>",
//     "model": "eleven_multilingual_v2",
//     "ext": "mp3"
//   }
// .env: ELEVENLABS_API_KEY=...
//
// Not exercised by the maintainers' test run: treat it as a starting point.
import fs from 'node:fs'

export default async function synthesize({ text, out, config, env }) {
  const key = env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (add it to .env)')
  if (!config.voiceId) throw new Error('set ads.json › voice.voiceId')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: config.model || 'eleven_multilingual_v2' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`)
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))
}
