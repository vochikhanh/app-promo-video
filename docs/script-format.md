# Script format

A video project is a folder:

```
my-video/
├── ads.json            brand, voice, colors, languages (shared by every script)
├── scripts/
│   ├── launch-en.json  one file = one video (rendered in every aspect ratio)
│   └── launch-vi.json
├── screens/            your screenshots, product photos or screen recordings
│   ├── today.png       used by every language…
│   └── vi-today.png    …unless a <lang>- version exists
├── assets/             app icon, feature-tile icons
├── out/                renders (git-ignored)
└── .cache/             frames, voice takes, music, SFX (git-ignored, safe to delete)
```

Both files have JSON Schemas ([`schema/script.schema.json`](../schema/script.schema.json),
[`schema/config.schema.json`](../schema/config.schema.json)). Add a `"$schema"` line and VS Code,
Cursor or any JSON-aware editor will autocomplete and validate as you type. `promo-video check
<script>` runs the same checks from the terminal, with friendlier messages.

## The script

```json
{
  "$schema": "../../../schema/script.schema.json",
  "lang": "en",
  "theme": "garden",
  "music": "bright",
  "scenes": [
    { "type": "chat",  "say": "…", "big": "…", "chat": { "title": "…", "msgs": [ … ] } },
    { "type": "phone", "say": "…", "big": "One list,\n*whole home*", "clip": "today" },
    { "type": "trio",  "say": "…", "big": "Everything,\n*one app*" },
    { "type": "end",   "say": "…", "tag": "…", "cta": "Get Pocket Garden", "confetti": 0.5, "hold": 1 }
  ]
}
```

| Field | Default | Meaning |
|---|---|---|
| `lang` | `ads.json › defaultLang` | Language code. Needs a block in `ads.json › lang`. Picks screens `screens/<lang>-<clip>.*` first. |
| `theme` | first theme | Key of `ads.json › themes`. |
| `colors` | | Override `c1`, `c2`, `glow`, `hl` for this video only. |
| `music` | `bright` | `bright`, `warm`, `playful` or `none`. See [music-and-sound.md](music-and-sound.md). |
| `tail` | `ads.json › tail` or 0.2 | Seconds after each line before the cut. |
| `badges` | `ads.json › badges` | Store pills on the end card. |
| `captions` | `true` | `false` hides burned-in captions (the `.vtt` is still written). |
| `brand` | `true` | `false` hides the corner logo. |
| `sfx` | `true` | `false` removes whoosh / pop / ding. |
| `angle` | | Free text describing the idea. Ignored by the engine. |
| `scenes` | | Ordered list. See [scene-types.md](scene-types.md). |

### Fields every scene understands

| Field | Meaning |
|---|---|
| `type` | `chat`, `text`, `phone`, `trio` or `end`. |
| `say` | The voice-over line. **8–15 words.** The scene lasts as long as the line takes to say, plus `tail`. |
| `cap` | Caption text when it should differ from what is said (e.g. you spell a brand phonetically in `say`). Prefer `lexicon` instead. |
| `big` | Headline. `*stars*` highlight words in the theme's `hl` color, `\n` breaks lines. Two lines of ~18 characters at most. |
| `sub` | Smaller line under the headline. |
| `min` | Minimum length in seconds (default 1.6). |
| `hold` | Extra seconds after the line. Use ~1.0 on the end card so the CTA can breathe. |
| `duration` | Fixed length for a scene **without** `say`. |
| `confetti` | Second (within the scene) to burst confetti, with a "ding". |
| `still` | Which second `stills` captures (default: 80% through the scene). |
| `mood` | Emotion tag for this one line. Use rarely; see [voice.md](voice.md). |

**You never write timings.** Scene length comes from the voice. Caption words are timed by
spreading the spoken duration over the words by letter count. Chat messages, chips and headline
words have sensible default delays that you can override (`at`, `gap`, `shakeAt`).

## ads.json

```json
{
  "appName": "Pocket Garden",
  "url": "pocketgarden.example",
  "icon": "assets/icon.svg",
  "badges": ["App Store", "Google Play"],
  "defaultLang": "en",
  "aspects": ["9x16", "1x1", "16x9", "4x5"],
  "speed": 1.05,
  "tail": 0.16,
  "musicVolume": 0.24,
  "readingSpeed": 15,
  "voice": { "provider": "gemini", "model": "gemini-3.1-flash-tts-preview", "voice": "Leda", "director": ["…"] },
  "themes": { "garden": { "c1": "#2FB36B", "c2": "#14614A", "glow": "#B8F27A", "hl": "#FFE27A" } },
  "lang": {
    "en": {
      "accent": "American English",
      "chunk": 4,
      "lexicon": { "SQL": "sequel" },
      "features": [{ "name": "Plant ID", "desc": "Snap a photo, get a care plan", "color": "#2E9E5B", "icon": "assets/scan.svg" }]
    }
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `appName`, `url`, `icon` | | Corner brand and end card. Paths are relative to the project. |
| `badges` | App Store, Google Play | `[]` hides the pills (web apps, physical products). |
| `aspects` | 9x16, 1x1, 16x9 | Rendered by `build` unless `--aspects` is given. |
| `speed` | 1 | Voice tempo, pitch preserved. 1.05 makes most TTS voices sound like a social ad. |
| `tail` | 0.2 | Pause after each line. 0.12–0.2 feels snappy. |
| `musicVolume` | 0.22 | Music level before it ducks under the voice. |
| `readingSpeed` | 15 | Characters per second used with `--no-voice` and in `stills`. |
| `fonts` | | Extra `@font-face` entries `{ family, src, weight }` stacked before Be Vietnam Pro. Needed for CJK, Arabic, Hebrew, Thai, Devanagari… |
| `voice` | gemini | See [voice.md](voice.md). Can be overridden per language in `lang.<code>.voice`. |
| `themes` | | Named color sets: `c1`/`c2` gradient, `glow` background blob, `hl` highlight. |
| `lang.<code>.accent` | | Replaces `{LANG}` in the director profile. |
| `lang.<code>.chunk` | 4 | Max words per caption phrase. Use 3 for long-word languages (German), 5–6 for CJK if you split words. |
| `lang.<code>.lexicon` | | How to *say* a word. Captions keep the written form. |
| `lang.<code>.features` | | Default tiles for `trio` scenes. |

## Aspect ratios

| Flag | Size | Where |
|---|---|---|
| `9x16` (`v`) | 1080×1920 | TikTok, Reels, Shorts, Stories, App Store / Play preview |
| `1x1` (`s`) | 1080×1080 | Feeds, Google Ads |
| `16x9` (`h`) | 1920×1080 | YouTube, Google Ads, websites |
| `4x5` (`f`) | 1080×1350 | Facebook / Instagram feed |

One stage renders all four. Layout differences live in CSS under `body.v`, `.s`, `.h` and `.f` in
[`engine/stage.html`](../engine/stage.html). For 1:1, 16:9 and 4:5 the text sits on the left and
the device on the right; for 9:16 the text is on top.

## Outputs

| File | What |
|---|---|
| `out/<name>-<aspect>.mp4` | H.264 + AAC, 30 fps, `+faststart` (plays while downloading) |
| `out/<name>-<aspect>-cover.jpg` | Thumbnail: the hook scene with all of its text on screen |
| `out/<name>.vtt` | WebVTT captions, phrase by phrase, for platforms that take a caption file |
| `out/stills/<name>/<aspect>-NN.jpg` | One frame per scene (from `stills`) |
| `out/stills/<name>/sheet-<aspect>.jpg` | All scenes of one aspect in one image |
