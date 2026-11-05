# Scene types

Five building blocks cover almost every app or product ad. A strong default order:

```
chat or text  →  phone × 3–5  →  trio (optional)  →  end
   hook            one benefit       "and more"         call to action
                   per scene
```

## `chat`: the group-chat hook

A messaging card slides up and messages pop in one by one, each with a "pop" sound. Then the card
shakes. It works because everyone recognizes the situation before they recognize the product.

```json
{
  "type": "chat",
  "say": "Three roommates, twelve plants, and nobody remembers who watered what.",
  "big": "Three roommates,\n*one thirsty* fern",
  "gap": 0.42,
  "shakeAt": 2.4,
  "chat": {
    "title": "Flat 4B",
    "subtitle": "3 members",
    "color": "#2E9E5B",
    "msgs": [
      { "who": "Mia", "color": "#EC6A8C", "text": "Did anyone water the fern?" },
      { "who": "Leo", "color": "#3B82F6", "text": "I thought you did yesterday" },
      { "me": true, "text": "Okay. We need a system." },
      { "me": true, "emoji": "🤯" }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `chat.title`, `subtitle`, `color`, `badge` | Header of the chat card. `badge` defaults to the title's first letter. |
| `msgs[].who`, `text`, `color` | A message from someone else (left, white bubble, colored avatar). |
| `msgs[].me` | Your message (right, theme color). |
| `msgs[].emoji` | A big emoji instead of a bubble. Rendered with the system emoji font. |
| `msgs[].at` | Exact second for this message (default `0.12 + index × gap`). |
| `gap` | Seconds between messages (default 0.32). |
| `shakeAt` | Second when the card shakes: the "chaos" beat. Put it right after the last message. |

Tips: 3–5 short messages, the last one is the pain in the user's own words. Keep it light and
everyday: a trip, a shared flat, a team lunch, a birthday. Never use sad or sensitive situations.

## `text`: a kinetic statement

Big centered words pop in one by one, with a slow push-in. Use it as an alternative hook ("Your
plants have been waiting for this"), as a bridge between two phone scenes, or for a bold claim.

```json
{ "type": "text", "say": "Your plants have been waiting for this.", "big": "Meet your\n*plant buddy*", "sub": "Care made simple" }
```

## `phone`: your screen in a device

The workhorse. One benefit per scene: one screenshot, one line, one headline, 0–2 chips.

```json
{
  "type": "phone",
  "clip": "scan",
  "say": "Not sure what a plant needs? Snap a photo and get a care plan in seconds.",
  "big": "Snap it,\n*know it*",
  "zoom": { "s": 1.35, "x": 0.5, "y": 0.76, "at": 1.4 },
  "chips": [{ "text": "Plant ID" }]
}
```

| Field | Meaning |
|---|---|
| `clip` | Media name in `screens/` without extension or language prefix. `scan` finds `screens/en-scan.png`, then `screens/scan.png` (also `.jpg .jpeg .webp .mov .mp4 .webm .m4v`). |
| `clips` | Several media in one scene, split evenly, each with a `label` pill: `[{ "clip": "today", "label": "Today" }, { "clip": "reminders", "label": "Reminders" }]` |
| `device` | `phone` (default) or `card`: a 4:5 rounded card without a bezel, for product photos, illustrations, web pages. |
| `fit` | `cover` (default, fills and crops) or `contain` (whole image, may letterbox). |
| `zoom` | Magnify the screen around a point. `s` scale (1.2–1.5), `x`/`y` focus from 0 to 1 (0.5, 0.8 = lower middle), `at` start second. The device stays in place, so the layout never shifts. |
| `chips` | Up to 4 floating benefit pills: `{ "text": "Plant ID", "icon": "✨", "at": 0.9, "pos": [600, 640] }`. Without `icon` a small dot in the theme color is shown. |
| `tilt` | Resting rotation in degrees (try -4 or 3). |
| `from`, `rate` | Recordings only: start second and playback speed. |

**Motion you get for free:** the device slides up with a tilt when it enters; when the previous
scene was also a phone, it stays put and "punches" while the old screen slides away. It floats
gently the whole time, and each headline word pops in.

**Stills vs recordings.** Screenshots are the fast, cheap default and look great: the motion
comes from the device, the zoom and the text. Use a screen recording only when the motion is the
point (a swipe, an animation, a game). See [recording.md](recording.md).

**Best screenshot size:** portrait at phone ratio, e.g. 1080×2400, 1179×2556, 1290×2796. Other
ratios work but get cropped (`cover`). Images are downscaled to 640 px wide for the frame cache,
which is plenty at video size.

## `trio`: feature tiles

Three (up to four) tiles slide in one after another. A good "and there is more" beat before the
end card.

```json
{ "type": "trio", "say": "Water plans, plant ID and daily tips, all in one app.", "big": "Everything,\n*one app*" }
```

Tiles come from `ads.json › lang.<code>.features`, or from the scene's own `items`:

```json
"items": [
  { "name": "Plant ID", "desc": "Snap a photo, get a care plan", "color": "#2E9E5B", "icon": "assets/scan.svg" }
]
```

Without an `icon` the tile shows the name's first letter. White glyph SVGs on a colored tile look best.

## `end`: the call to action

App icon, name, a one-line promise, a pulsing button, store pills and the URL, with confetti.

```json
{ "type": "end", "say": "Get Pocket Garden today and give your plants some love!", "tag": "Happy plants, happy home", "cta": "Get Pocket Garden", "confetti": 0.5, "hold": 1.0 }
```

| Field | Meaning |
|---|---|
| `tag` | One-line promise under the name. |
| `cta` | Button text. Verb + product: "Get Pocket Garden", "Try it free", "Shop now". |
| `title` | Defaults to `appName`. |
| `badges` | Override the store pills (`[]` hides them). |
| `url` | Override the URL (`""` hides it). |
| `hold` | Keep ~1 s so the CTA stays on screen after the voice ends. |

## Adding your own scene type

1. In `engine/stage.html › setup()`, add an `else if (s.type === 'mytype')` branch that builds the HTML.
2. In `frame()`, animate it as a pure function of `t` (seconds into the scene). No timers, no CSS
   transitions, no `Math.random()`: use the seeded pattern from `drawFx()` if you need randomness.
3. Add CSS for `.v`, `.s`, `.h` and `.f`.
4. Add the type to `SCENE_TYPES` in `engine/validate.mjs` and to `schema/script.schema.json`.
5. Check it with `stills --aspects all`.
