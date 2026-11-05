---
name: app-promo-video
description: Make short promo or ad videos for an app or product (TikTok, Reels, Shorts, YouTube, Google Ads, Meta) from a few screenshots or product photos, with an AI voice-over, word-timed captions, synthesized music and sound effects, rendered in 9:16, 4:5, 1:1 and 16:9 from one JSON script. Use when the user wants a promo, ad, launch or explainer video for an app, website or product, wants batches of videos in several languages, or wants an existing promo re-cut for another format. The agent only writes JSON; rendering is local and reviewing is delegated to Gemini, so token use stays low.
---

# App promo video

You write a JSON script; the engine in this folder renders it. Every frame comes from an HTML stage
in headless Chrome, the voice from Gemini TTS (or another provider, or none), and music and sound
from code. **You never watch the video.** You check layout on one contact sheet per format and let
`judge` (Gemini) review the finished cut.

The engine is `engine/cli.mjs` (`node <this folder>/engine/cli.mjs …`, or `promo-video …` after
`npm link`). Run `npm install` in this folder once, then `npm run doctor`.

## Workflow

1. **Ask once, briefly:** product and audience; the 1–3 benefits that matter (as outcomes);
   languages and formats; store names, URL and button text; 3–6 screenshots or product photos,
   one per benefit. Default to screenshots. Suggest screen recordings only when motion is the
   selling point ([docs/recording.md](docs/recording.md)).
2. **Create the project:** `promo-video new <dir>`. Put the images in `<dir>/screens/` with short
   names (`today.png`); localized copies are `screens/<lang>-today.png`. Edit `<dir>/ads.json`:
   `appName`, `url`, `icon`, `badges`, one theme in the brand color, `lang` blocks, `features`.
3. **Write `scripts/<angle>-<lang>.json`:** a `chat` or `text` hook → one `phone` scene per benefit →
   optional `trio` → `end`. Each `say` is 8–15 words. Each `big` is 2 lines of ≤18 characters with
   one `*highlight*`. No timings: scene length follows the voice.
   Reference: [docs/script-format.md](docs/script-format.md), [docs/scene-types.md](docs/scene-types.md).
4. **Check and preview, no API calls:**
   `promo-video check <script>` then `promo-video stills <script> --aspects 9x16,1x1`.
   Look at **only** `out/stills/<name>/sheet-9x16.jpg` and `sheet-1x1.jpg`. Fix overflowing
   headlines (`\n`, shorter words), chip positions (`pos`) and zoom focus (`zoom.y`).
5. **Render in the background:** `promo-video build <script>` (all formats in `ads.json › aspects`,
   about 1 min per format). No `GEMINI_API_KEY`? Add `--no-voice` and tell the user.
6. **Review without watching:** `promo-video judge out/<name>-9x16.mp4` prints a 7-line scorecard.
   Apply its `FIX` line if it is concrete and rebuild once (the voice is cached unless `say` changed).
7. **Other languages:** copy the script, translate `say`, `big`, `sub`, `chips` and chat text, set
   `lang`. Accent, captions and `screens/<lang>-*` follow automatically.
8. **Report** the output paths (`out/*.mp4`, covers, `.vtt`) and what the judge said.

## Rules that keep quality high and tokens low

- Edit JSON and, rarely, CSS. Don't read `engine/*` in full; `grep -n` for the bit you need.
- Never load videos or many frames into your context. One contact sheet, or `judge`, or `sheet`.
- One shared director profile for the voice; no per-line emotion tags (they sound jumpy).
- Cheerful, specific sample data. No sad or sensitive scenarios, no prices, no features that are not live.
- Run renders in the background and wait for them; don't poll.
- Never commit renders (`out/`, `.cache/` and `*.mp4` are git-ignored) or `.env`.

More: [docs/agent-playbook.md](docs/agent-playbook.md) (token budget, the loop, anti-patterns),
[docs/design-tips.md](docs/design-tips.md) (hooks, copy, color), [docs/voice.md](docs/voice.md)
(director profile, choosing a voice, other TTS providers), [docs/troubleshooting.md](docs/troubleshooting.md).
