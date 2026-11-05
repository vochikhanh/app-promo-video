# Voice-over

The voice decides the pace of the whole video: every scene lasts exactly as long as its line
takes to say, plus a short `tail`. Captions are timed from the same audio.

## Providers

`ads.json › voice.provider`:

| Provider | Needs | Quality | Notes |
|---|---|---|---|
| `gemini` (default) | `GEMINI_API_KEY` | ★★★★★ | Whole-script take, director profile, automatic cut check. |
| `none` (or `--no-voice`) | nothing | | Captions + music only. Scene length from `readingSpeed` (characters per second). |
| `command` | any local TTS CLI | varies | macOS `say`, Piper, espeak-ng, Coqui… |
| `./path/to/provider.mjs` | your code | varies | OpenAI, ElevenLabs, Azure, Polly, a self-hosted model… |

### Gemini (default)

```json
"voice": {
  "provider": "gemini",
  "model": "gemini-3.1-flash-tts-preview",
  "voice": "Leda",
  "director": [
    "# AUDIO PROFILE: Maya, 27, a cheerful {LANG} lifestyle creator with a bright, warm, smiling voice.",
    "## THE SCENE: Recording the voice-over of a short, fun mobile app ad, talking to friends.",
    "### DIRECTOR'S NOTES",
    "Style: Friendly, upbeat and playful, smiling while speaking, natural conversational intonation, light emphasis on key words. Not salesy, never shouting, same energy from start to finish.",
    "Pace: Fast and lively like a social media ad, yet smooth, no choppy breaks inside sentences. Leave a clear one-second pause between paragraphs.",
    "Accent: Natural {LANG}.",
    "#### TRANSCRIPT"
  ]
}
```

How it works:

1. **One take for the whole script.** All lines are sent in one request, separated by blank
   lines, after the director profile. A single performance has consistent energy and natural
   transitions; line-by-line requests sound like 7 different takes stitched together.
2. **Cut at the pauses.** `ffmpeg silencedetect` finds every pause; for each boundary the engine
   picks the longest pause near where it *should* be (by each line's share of the characters).
   The "clear one-second pause between paragraphs" in the profile is what makes this reliable.
3. **Check every cut.** Each piece is transcribed by a Gemini text model and compared with the
   line (word-level edit distance, lenient on the first/last words because numbers and brand
   names are often heard differently). A bad take is re-read, up to 3 times, then the engine
   falls back to one request per line. You never listen to anything.
4. **Normalize and cache.** Loudness to −16 LUFS, 48 kHz, edges trimmed, a 60 ms fade-out so
   joints never click. Takes are cached by `(model, voice, director, text)`, so changing CSS, colors
   or screenshots never re-runs TTS.

Models change. If you get "model not found", list what your key can use:

```bash
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" | grep -o '"models/[^"]*tts[^"]*"'
```

### The director profile

The profile is the single biggest quality lever. It tells the model **who** is speaking, **where**,
**how** and **at what pace**. `{LANG}` is replaced by `lang.<code>.accent` ("American English",
"Vietnamese", "Brazilian Portuguese"), so one profile serves every language.

What we learned:

- **One shared profile, no per-line emotion tags.** Tagging each line (`[excited]`, `[whispering]`)
  made the voice swing between moods and sound anxious. Judges scored it 5–6/10 for steadiness;
  the same script with a single calm, warm profile scored 9–10. The engine supports `mood` per
  scene and `voice.moods: true` for per-type tags, but both are off by default for this reason.
- **Describe a person, not a voice.** "Maya, 27, a cheerful lifestyle creator talking to friends"
  gives warmer reads than "female, energetic".
- **Ask for the paragraph pause explicitly.** It makes the automatic cut reliable.
- **"Not salesy, never shouting, same energy from start to finish"** prevents the infomercial ramp.
- `speed: 1.05` in `ads.json` gives a social-ad tempo without changing the pitch.

### Choosing a voice

Let Gemini listen instead of you:

```bash
npm run voices -- "Snap a photo and get a care plan in seconds." --voices Leda,Puck,Kore,Aoede,Charon --project examples/starter
```

Each voice reads the line with your project's director profile; Gemini scores each take 1–10 and
the list is printed best first. The original production run picked **Leda** (9–10/10 in both
Vietnamese and English).

### Pronunciation: `lexicon`

```json
"lang": { "en": { "lexicon": { "SQL": "sequel", "GIF": "jif" } } }
```

The voice reads the replacement; the captions keep the written word. Matching is whole-word and
Unicode-aware.

## Plugging in another TTS

### A command-line tool

The command is an argv array (no shell, so no quoting problems). Placeholders: `{text}`,
`{textFile}`, `{out}`, `{lang}`. Set `stdin: true` to pipe the text in, and `ext` to the format
the tool writes.

macOS built-in voices (free, offline, good for drafts):

```json
"voice": { "provider": "command", "command": ["say", "-v", "Samantha", "-r", "190", "-o", "{out}", "-f", "{textFile}"], "ext": "aiff" }
```

[Piper](https://github.com/rhasspy/piper) (free, offline, neural):

```json
"voice": { "provider": "command", "command": ["piper", "--model", "en_US-lessac-medium.onnx", "--output_file", "{out}"], "stdin": true }
```

### A JavaScript module

```js
// my-tts.mjs, next to ads.json
export default async function synthesize({ text, out, lang, config, env }) {
  // call any API, write an audio file (any format ffmpeg can read) to `out`
}
```

```json
"voice": { "provider": "./my-tts.mjs", "voice": "…", "anything": "you need" }
```

The whole `voice` block is passed as `config`, `process.env` as `env` (with `.env` loaded).
Ready-made examples: [`examples/voice-providers/openai.mjs`](../examples/voice-providers/openai.mjs),
[`examples/voice-providers/elevenlabs.mjs`](../examples/voice-providers/elevenlabs.mjs).

Non-Gemini providers are called once per line (no whole-take cut), then trimmed, normalized and
cached the same way. Per-language overrides go in `lang.<code>.voice`, e.g. a different voice ID.

## No voice at all

```bash
npm run build -- scripts/launch-en.json --no-voice
```

Scenes are timed at `readingSpeed` characters per second (default 15, about 170 words per minute;
lower it to 12 for a calmer read), captions follow that timing, music and SFX still play. Good
for silent autoplay placements, and for checking motion before spending on TTS.
