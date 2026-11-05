# Troubleshooting

Start with `npm run doctor`: it checks Node, ffmpeg, ffprobe, Python, puppeteer-core, Chrome and
the API key, and prints the fix for anything missing.

## Setup

| Symptom | Fix |
|---|---|
| `Could not find Google Chrome, Chromium or Edge` | Install Chrome, or set `CHROME_PATH` (or `--chrome`). Headless-only machines: `npx @puppeteer/browsers install chrome-headless-shell@stable`, then point `CHROME_PATH` at the printed binary. |
| `puppeteer-core is not installed` | `npm install` in the repo folder. The engine resolves it from there even when your project lives elsewhere. |
| `"ffmpeg" is not installed` | macOS `brew install ffmpeg`, Ubuntu `sudo apt install ffmpeg`, Windows `winget install ffmpeg`. |
| `python3` not found on Windows | `set PYTHON=python` (the engine uses `$PYTHON` if set). |
| Chrome crashes in Docker / CI | Add `--disable-dev-shm-usage` to the launch args in `engine/build.mjs`, or run with `--shm-size=1g`. `--no-sandbox` is already set. |
| `Could not find ads.json above …` | Run from inside a project, pass `--project <dir>`, or create one with `promo-video new`. |

## Voice

| Symptom | Fix |
|---|---|
| `GEMINI_API_KEY is not set` | Copy `.env.example` to `.env` in the repo or project and add the key, or build with `--no-voice`. |
| `HTTP 404 … model not found` | TTS models get renamed. List yours (see [voice.md](voice.md#gemini-default)) and set `ads.json › voice.model`. |
| `HTTP 429` | Quota or rate limit. Wait a minute and rerun: finished takes are cached. |
| `take N did not cut cleanly`, then "one request per line" | The voice ran lines together. Make sure the director profile asks for "a clear one-second pause between paragraphs", and that lines end with punctuation. Per-line fallback still works; it just sounds slightly less continuous. |
| A word is mispronounced | Add it to `lang.<code>.lexicon` (`"GIF": "jif"`). Captions keep the spelling. |
| Voice sounds jumpy or over-acted | Remove `mood` from scenes and `voice.moods`; describe a calm, warm person in the director profile. |
| You want to force a new take | Change the wording slightly, or delete `.cache/voice/`. |

## Picture

| Symptom | Fix |
|---|---|
| Headline wraps into 3–4 lines or covers the device in 1:1 / 4:5 | Shorten lines to ~18 characters and break with `\n`. |
| A chip covers the headline | Give it `"pos": [x, y]` (pixels in the frame, applies to every aspect) or drop it in the 1:1 version. |
| Zoom crops the part you wanted | Move the focus: `zoom.y` 0.2 = top of the screen, 0.8 = bottom; lower `zoom.s`. |
| Screen is black or white at the start | It's a recording that starts before the content loads: measure `from` (see [recording.md](recording.md)). |
| Changed a screenshot but the old one shows | Frames are keyed by file size and modification time. If you copied a file preserving its timestamp, `touch` it or delete `.cache/frames/`. |
| Emoji show as boxes | The system lacks a color emoji font (common on minimal Linux): `apt install fonts-noto-color-emoji`. |
| Text in Japanese, Chinese, Arabic… shows as boxes | Add a font to `ads.json › fonts` (e.g. Noto Sans JP, OFL) for that language. |
| `The stage reported errors` | A JavaScript error in `stage.html`, usually from a custom edit. The message names it. |

## Output

| Symptom | Fix |
|---|---|
| Rendering is slow | ~1 min per aspect for 25 s is normal (screenshots at 30 fps). Render only what you need with `--aspects`, use `stills` for layout work, and run builds in the background. |
| File is too big for an ad platform | `--crf 23` (smaller, still clean). |
| Platform wants captions as a file | Upload `out/<name>.vtt`; use `"captions": false` to avoid double captions. |
| `judge`: file too large | It already sends a 540p proxy; for very long videos trim first. |
