# Design tips: what makes these ads work

These rules come from a production run of 48 ads (6 angles × 2 languages × 4 aspect ratios) for a
consumer app, reviewed scene by scene. They are opinions with evidence behind them, not laws.

## Story

**One angle per video.** "Split trip costs without the drama" beats "an app with 12 features".
Make several short videos with one angle each instead of one long tour.

**Hook in the first 2 seconds, with a situation, not the product.** People scroll past ads; they
stop for something they recognize. The `chat` hook works because a group chat full of "who paid
for what???" is instantly familiar. Show the problem, then the product.

**Structure:** hook (2–3 s) → 3–5 benefit scenes (3–4 s each) → optional "and more" → CTA (3–4 s).
Total 20–30 s. Shorter is fine for Stories and Shorts; longer than 35 s loses most viewers.

**One benefit per scene, phrased as an outcome.** "Know who owes who at a glance", not "Balance
screen". The headline is the outcome, the screenshot is the proof, the chip is a detail.

**Say it in 8–15 words.** Longer lines make slow scenes; shorter lines make the voice sound
choppy. Read it aloud: if you need a breath, split it.

**End with a verb.** "Get Pocket Garden", "Try it free", "Shop the collection". Name the product
in the last spoken line.

## Words on screen

- **Headline: 2 lines, ~18 characters each.** Break lines yourself with `\n`. In 1:1 and 4:5 the
  text column is narrow, so long lines wrap into 3–4 lines and crowd the device.
- **Highlight 1–3 words** with `*stars*`: the outcome, not the filler ("Reminders that *just work*").
- **Chips: 2–4 words**, a concrete detail or proof point ("21 days and counting", "No account needed").
  At most 2 per scene.
- **Captions are on by default** because most social video plays muted. Phrases are ~4 words
  and break at punctuation; the spoken word lights up. Keep `chunk` at 3–4.
- Avoid claims you cannot show ("#1 app"), prices (they change and trigger ad-policy review), and
  features that are not live in the store the ad points to.

## Color

- Each video has a **theme**: `c1` (top-left of the gradient and the accent), `c2` (bottom-right),
  `glow` (a soft moving blob), `hl` (highlighted words). Use your brand color for `c1` and a
  darker, more saturated neighbor for `c2`.
- `hl` must contrast with both gradient ends. Warm yellow (`#FFE27A`) works on most cool and green
  themes; on a yellow or orange theme use a deep purple or navy.
- Different angles can use different themes; viewers notice variety in a feed.
- White text needs a mid-to-dark background: test `c1` against white at WCAG AA (4.5:1 for small
  text; the headline is large, so 3:1 is the floor).

## Screens and data

- **Real screens of the real product**, with cheerful, believable sample data: a weekend trip, a
  team lunch, a birthday dinner, a houseplant. Never sad or sensitive situations (illness,
  funerals, debt collection). Never real customer data.
- Make sample data **specific**: "Dinner at Marco's · $86" beats "Item 1 · $10".
- Hide personal details: status bar carriers, real names, emails, account numbers.
- Same device chrome across all screens (all iPhone or all Android, same light/dark mode).
- Localize the screens too. `screens/vi-today.png` is picked automatically for `"lang": "vi"`.

## Sound

- A voice-over raises completion rates even though most people watch muted: it sets the pace,
  and the captions it drives are what muted viewers read.
- The music ducks under the voice automatically. If it still feels busy, lower `musicVolume` to
  0.18 rather than turning it off: silence between lines feels empty.
- SFX are tiny on purpose: a whoosh on every cut, a pop per chat message, a ding with confetti.

## Per platform

| Platform | Aspect | Notes |
|---|---|---|
| TikTok, Reels, Shorts, Stories | 9:16 | Keep text out of the bottom ~20% and right ~15% (UI overlays). Captions sit at ~5% from the bottom: fine for Shorts; for Reels you may want `captions: false` and rely on the platform's own. |
| Facebook / Instagram feed | 4:5 | Most screen area in the feed. Many advertisers' best performer. |
| Google Ads (App, Demand Gen, YouTube) | 16:9, 1:1, 9:16 | Upload all three so the system can place the ad anywhere. |
| App Store / Play preview | 9:16 (portrait) | Store previews have their own rules (no prices, real app footage, length limits): check current guidelines before uploading. |
