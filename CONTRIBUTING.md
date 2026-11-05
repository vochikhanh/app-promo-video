# Contributing

Thanks for helping! Good first contributions:

- **Scene types:** a before/after split, a testimonial card, a stats counter, a map pin…
- **Music styles:** a new entry in `STYLES` in `engine/music.py` (stdlib only, please).
- **Voice providers:** a module in `examples/voice-providers/` for another TTS service.
- **Layouts:** better positions for an aspect ratio, RTL support, new themes.
- **Docs:** clearer explanations, translations of the README, troubleshooting entries.

## Ground rules

1. **Determinism.** Every frame must be a pure function of (scene index, time). No timers, CSS
   transitions, `Date.now()` or unseeded `Math.random()` in `stage.html`.
2. **No new runtime dependencies** unless there is no reasonable alternative. The engine runs on
   Node + puppeteer-core + ffmpeg + Python's standard library, and that is a feature.
3. **Friendly errors.** Anything a user can cause should throw `UserError(message, hint)` with a fix.
4. **All four aspects.** A visual change must look right in 9:16, 4:5, 1:1 and 16:9.
5. **Clean content.** Cheerful sample data; no copyrighted images, logos or audio; no secrets.

## Workflow

```bash
npm install
npm run doctor
node engine/cli.mjs check  examples/starter/scripts/launch-en.json
node engine/cli.mjs stills examples/starter/scripts/launch-en.json --aspects all
node engine/cli.mjs build  examples/starter/scripts/launch-en.json --no-voice --aspects 9x16
```

Attach the relevant contact sheets (`examples/starter/out/stills/launch-en/sheet-*.jpg`) to your PR
when you change anything visual. If you add a field, update `engine/validate.mjs`, the JSON
Schema in `schema/`, and the docs in `docs/`.

Code style: ES modules, 2-space indent, no semicolons, comments explain *why*.

By contributing you agree that your contribution is licensed under the MIT License.
