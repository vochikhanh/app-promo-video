# Music and sound

Everything you hear is generated on your machine. There are no sample files and no licenses to
track, and every render is deterministic.

## Music: `engine/music.py`

Pure Python standard library (no numpy). Each instrument is a waveform times an envelope:

| Part | Sound |
|---|---|
| Pad | soft sine chord for the whole bar |
| Bass | triangle wave on the root, every half beat |
| Arpeggio | chord tones an octave up, eighth notes, a few harmonics for sparkle |
| Drums | synthesized kick (pitch-dropping sine), clap and hi-hat (decaying noise) |

| Style | Tempo | Feel | Good for |
|---|---|---|---|
| `bright` | 118 BPM | I–V–vi–IV pop | most app ads |
| `warm` | 96 BPM | half-time kick, softer clap | lifestyle, family, wellness, finance |
| `playful` | 124 BPM | light swing, a bell every other bar | games, fun utilities, kids |
| `none` | | silence | |

The last bar drops the drums and the track fades out over 1 s, so it lands cleanly on the CTA.

Run it on its own:

```bash
python3 engine/music.py warm 24 out/test.wav --bpm 100 --seed 3
```

**Add a style:** add an entry to `STYLES` (tempo, four chords as MIDI note lists, an arpeggio
pattern, swing), then add the name to `MUSIC_STYLES` in `engine/validate.mjs` and to the schema.

**Use your own track instead:** replace the music step in `engine/build.mjs` (search for
`music.py`) with a copy of your file, trimmed to `total` seconds. Keep the ducking chain below.

## Sound effects

Made with `ffmpeg -f lavfi` the first time and cached in `.cache/sfx/`:

| Effect | When | Recipe |
|---|---|---|
| whoosh | 0.14 s before every cut | pink noise, band-passed 700–7000 Hz, exponential fade in/out |
| pop | each chat message | sine sweeping down from 1400 Hz, fast decay |
| ding | `confetti` | three-partial bell (E6, B6, E7), slow decay |

`"sfx": false` in a script turns them off.

## Mix

```
voice lines (padded to scene length) ─┬─ amix with SFX ─┬───────────────── amix ─ alimiter ─ AAC 160k
                                      │                 └ key ┐
music ─ volume(musicVolume) ──────────┴──────── sidechaincompress (threshold 0.03, ratio 5, 20/300 ms)
```

The music **ducks automatically** whenever the voice (or an SFX) plays, then swells back in the
pauses. Voice lines are normalized to −16 LUFS, and a limiter at −0.4 dBFS keeps the final mix
from clipping. Platforms re-normalize loudness anyway; this keeps the voice clearly on top.
