# Playbook for AI agents: great videos, few tokens

This engine was designed to be driven by an AI coding agent (Codex, Gemini CLI,
Cursor, Copilot…). Video is the most expensive thing an agent can look at, so the whole workflow is
arranged so the agent **writes JSON and reads text**, and almost never looks at pixels.

## The rules

1. **Edit JSON (and occasionally CSS). Nothing else.** The engine is stable: don't read
   `build.mjs` or `stage.html` "to understand it". When a layout tweak is needed, `grep -n` for the
   selector in `engine/stage.html` and read only those lines.
2. **Never put a video, or a pile of frames, into your own context.**
   - Layout check: `stills` writes one contact sheet per aspect (`out/stills/<name>/sheet-<aspect>.jpg`).
     Look at **one** sheet, not the individual stills. Start with 9:16 and 1:1, the tightest layouts.
   - A recording you need to understand: `promo-video sheet screens/x.mov` makes one 6-frame strip.
3. **Delegate watching and listening to Gemini.** `promo-video judge out/x-9x16.mp4` returns a
   7-line scorecard (hook, text, sync, voice, pace, CTA, top fix). `judge` on a contact sheet lists
   layout problems or says `OK`. Gemini Flash takes video natively and costs a fraction of a cent
   per review. The voice step already verifies every cut by transcription: you never need to listen.
4. **Check layout before rendering.** `stills` takes ~2 s and calls no API. A full 4-aspect render
   takes 2–3 minutes of CPU but zero tokens. Only render once the sheets look right.
5. **Everything is cached.** Voice takes are keyed by (model, voice, director, text); media frames
   by file content; music and SFX by parameters. Changing colors, CSS, chips, screenshots or zoom
   costs no TTS. Changing a `say` line re-reads the whole take (it is one performance).
6. **Measure with commands, not eyes.**
   - Length: `ffprobe -v error -show_entries format=duration -of csv=p=0 out/x-9x16.mp4`
   - Loudness: `ffmpeg -i out/x-9x16.mp4 -af ebur128 -f null - 2>&1 | grep "I:"`
   - When a recording finishes loading: `ffmpeg -i screens/x.mov -vf "select='gt(scene,0.04)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'`
7. **Run long commands in the background** and wait for completion instead of polling. Each video
   prints one line (`✓ out/launch-en-9x16.mp4 (26.2s)`); `--quiet` prints only results.
8. **Translate, don't rewrite.** A second language is a copy of the script with `say`, `big`,
   `sub`, `chips` and chat text translated. Voice accent, captions, caption phrasing and localized
   screenshots (`screens/<lang>-<clip>.png`) follow automatically.

## The loop

```
ask (5 questions) → screens/ → script JSON → check → stills → read 1–2 sheets → fix
                 → build (background) → judge → fix the one thing it names → done
```

### 1. Ask (one message, five questions)

1. What is the product, and who is it for?
2. The 1–3 benefits that matter most (outcomes, not features)?
3. Languages, and which aspect ratios / platforms?
4. Where do people get it (store names, URL), and what should the button say?
5. Can you share 3–6 screenshots or product photos, one per benefit? (Brand color and icon too.)

Default to **screenshots**. Suggest a screen recording only when motion is the selling point and
the user can record (see [recording.md](recording.md)).

### 2. Set up

```bash
promo-video new my-video     # after `npm link` in the repo; or: node <repo>/engine/cli.mjs new my-video
```

Put the images in `my-video/screens/` with short names (`today.png`, `scan.png`). Edit
`ads.json`: `appName`, `url`, `icon`, `badges`, one theme with the brand color, `lang` blocks,
`features` for the trio scene.

### 3. Write the script

Start from `scripts/launch-en.json`. Hook → one `phone` scene per benefit → optional `trio` →
`end`. Each `say` is 8–15 words; each `big` is two short lines with one `*highlight*`. See
[scene-types.md](scene-types.md) and [design-tips.md](design-tips.md).

### 4. Validate and preview

```bash
promo-video check scripts/launch-en.json
promo-video stills scripts/launch-en.json --aspects 9x16,1x1
```

Read `out/stills/launch-en/sheet-9x16.jpg` and `sheet-1x1.jpg` (two small images). Typical
fixes: shorten a headline line, add `\n`, move a chip with `pos`, change `zoom.y`. If you would
rather not look at all: `promo-video judge out/stills/launch-en/sheet-1x1.jpg`.

### 5. Render and review

```bash
promo-video build scripts/launch-en.json            # background it; ~2–3 min for 4 aspects
promo-video judge out/launch-en-9x16.mp4
```

Apply the `FIX` line if it is concrete, rebuild (voice is cached unless you changed `say`), and
report the output paths to the user. Don't loop more than twice on subjective scores.

## Cost reference (one 25-second video)

| Step | Tokens for the agent | API cost |
|---|---|---|
| Writing the script | ~2–4k output | |
| `check` + `stills` + reading 2 sheets | ~3k input | none |
| Voice take + cut check (Gemini) | none | ~1 TTS request + 7 short transcriptions |
| Rendering 4 aspects | none | none (local CPU) |
| `judge` on the video | ~150 input (the scorecard) | one Gemini Flash call on a 540p proxy |

Compare: putting 30 frames of video into an agent's context costs tens of thousands of tokens
and catches less than the judge does.

## Anti-patterns

- Reading `engine/*` in full every session.
- Screenshotting the browser or opening every still "to be sure".
- Writing scene durations or caption timings by hand.
- Re-rendering all aspects to test a text change (use `stills`, or `--aspects 9x16`).
- Adding per-line emotion tags to "make the voice more exciting" (it gets jumpy; see [voice.md](voice.md)).
- Inventing features, prices or claims the user did not give you.
