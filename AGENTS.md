# AGENTS.md

Instructions for AI coding agents (Codex, Gemini CLI, Cursor, Copilot, Aider…) working
in or with this repository.

## What this repo is

A code-driven video engine. Input: a project folder with `ads.json`, `scripts/*.json` and
`screens/*` (screenshots, product photos or recordings). Output: promo videos in 9:16, 4:5, 1:1
and 16:9 with voice-over, captions, music and SFX. The canonical task workflow is in
[`SKILL.md`](SKILL.md); follow it when a user asks for a video.

## Setup and commands

```bash
npm install            # one dependency: puppeteer-core (uses the system Chrome)
npm run doctor         # Node 18+, ffmpeg/ffprobe, Python 3, Chrome, GEMINI_API_KEY
npm run demo           # renders examples/starter without any API key
```

| Task | Command |
|---|---|
| New project | `node engine/cli.mjs new <dir>` |
| Validate a script | `node engine/cli.mjs check <script.json>` |
| Layout preview (no API) | `node engine/cli.mjs stills <script.json> [--aspects 9x16,1x1]` |
| Render | `node engine/cli.mjs build <script.json> [--aspects …] [--no-voice] [--no-music]` |
| AI review of a video/image | `node engine/cli.mjs judge <file> ["question"]` |
| Pick a voice | `node engine/cli.mjs voices "<line>" --project <dir>` |

Secrets: `GEMINI_API_KEY` in the environment or in `.env` (repo root or project). Never print it,
never commit `.env`, never paste it into files.

## How to work efficiently

- **Write JSON, not code.** Scripts are validated by `engine/validate.mjs` and described by
  `schema/script.schema.json` and `schema/config.schema.json`. Read the schema instead of the engine.
- **Never ingest video.** Review layout through `out/stills/<name>/sheet-<aspect>.jpg` (one image
  per aspect), and finished videos through `judge` (a text scorecard from Gemini).
- **Renders are slow but token-free**: run `build` as a background job and wait for it.
- **Caches** live in `<project>/.cache/`; deleting it is always safe.
- Details: [docs/agent-playbook.md](docs/agent-playbook.md).

## Changing the engine

| File | Role |
|---|---|
| `engine/cli.mjs` | Command parsing, `.env` loading, `new`, `doctor`, `sheet` |
| `engine/build.mjs` | Pipeline: frames → voice → durations → audio mix → Chrome frames → ffmpeg → `.vtt` |
| `engine/stage.html` | The visual stage. `setup(data)` + `frame(i, t)` must stay pure functions of time |
| `engine/validate.mjs` | Friendly script/config validation |
| `engine/voice/index.mjs` | Voice provider dispatch (`gemini`, `none`, `command`, module path) |
| `engine/voice/gemini.mjs` | Whole-take TTS, silence cutting, transcription check |
| `engine/judge.mjs` | Gemini review + voice audition |
| `engine/music.py` | Stdlib-only music synth |
| `engine/lib.mjs` | Errors, Chrome detection, project lookup, ffmpeg wrapper |

Conventions: ES modules, no build step, no new runtime dependencies without a strong reason,
2-space indent, no semicolons. User-facing failures throw `UserError(message, hint)`.

Before opening a PR:

```bash
node engine/cli.mjs check examples/starter/scripts/launch-en.json
node engine/cli.mjs stills examples/starter/scripts/launch-en.json --aspects all
node engine/cli.mjs build examples/starter/scripts/launch-en.json --no-voice --aspects 9x16
```

and look at the contact sheets for every aspect if you touched `stage.html`.

## Content rules

- Example and sample data must be cheerful and everyday (trips, meals, plants, birthdays).
  No funerals, illness or other sad or sensitive themes.
- No third-party logos, photos or copyrighted artwork in the repo; mock screens are drawn in code
  (`tools/mock-screens.html`, regenerate with `npm run mocks`).
- Never commit renders, caches or `.env`.
