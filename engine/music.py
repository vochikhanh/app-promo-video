#!/usr/bin/env python3
"""Royalty-free background music, synthesized from scratch (Python standard library only, no samples):

    python3 engine/music.py <style> <seconds> <out.wav> [--bpm N] [--seed N]

Styles:
  bright   upbeat pop, 118 BPM, I-V-vi-IV in C. Works for most app ads.
  warm     softer, 96 BPM, half-time kick. Lifestyle, family, wellness.
  playful  bouncy, 124 BPM, light swing and a bell "ting" every other bar. Games, fun utilities.

Each instrument is a waveform function times an envelope: a sine pad, a triangle bass, a bright
arpeggio with a few harmonics, and a synthesized kick / clap / hi-hat. The last bar drops the drums
and the track fades out, so it always ends cleanly on the call to action. Output: 32 kHz mono WAV
(the mixer resamples it). Deterministic: same arguments, same file.
"""
from __future__ import annotations

import math
import random
import struct
import sys
import wave

RATE = 32000

STYLES = {
    # bpm, chords (MIDI notes) one per bar, arpeggio pattern (index into the chord), swing
    "bright": dict(bpm=118, chords=[[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], arp=[0, 1, 2, 1, 0, 2, 1, 2], swing=0.0),
    "warm": dict(bpm=96, chords=[[57, 60, 64], [53, 57, 60], [55, 59, 62], [60, 64, 67]], arp=[0, 2, 1, 2, 0, 1, 2, 1], swing=0.0),
    "playful": dict(bpm=124, chords=[[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], arp=[0, 1, 2, 3, 2, 1, 0, 2], swing=0.08),
}


def hz(note: float) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def render(style: str, secs: float, bpm: float | None = None, seed: int = 7) -> list[float]:
    st = STYLES[style]
    beat = 60.0 / (bpm or st["bpm"])
    n = int(secs * RATE)
    buf = [0.0] * n
    rnd = random.Random(seed)

    def add(start: float, dur: float, fn, gain: float) -> None:
        a = int(start * RATE)
        b = min(n, a + int(dur * RATE))
        for i in range(max(0, a), b):
            buf[i] += gain * fn((i - a) / RATE)

    bars = int(secs / (beat * 4)) + 1
    end_fade = secs - 1.2
    for bar in range(bars):
        t0 = bar * beat * 4
        if t0 >= secs:
            break
        chord = st["chords"][bar % len(st["chords"])]
        last = t0 + beat * 4 > end_fade
        # pad: soft sine chord for the whole bar
        for note in chord:
            f = hz(note)
            add(t0, beat * 4, lambda t, f=f: math.sin(2 * math.pi * f * t) * min(1, t / 0.25) * math.exp(-t * 0.35), 0.045)
        # bass: root note every half beat, triangle wave
        fb = hz(chord[0] - 24)
        for k in range(8):
            add(t0 + k * beat / 2, beat / 2, lambda t, f=fb: (2 / math.pi) * math.asin(math.sin(2 * math.pi * f * t)) * math.exp(-t * 6), 0.22)
        # arpeggio: chord tones an octave up, eighth notes, a few harmonics for sparkle
        for k, idx in enumerate(st["arp"]):
            note = chord[idx % 3] + 12 + (12 if idx == 3 else 0)
            f = hz(note)
            at = t0 + k * beat / 2 + (st["swing"] * beat if k % 2 else 0)
            add(at, beat * 0.45, lambda t, f=f: (math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t) + 0.12 * math.sin(6 * math.pi * f * t)) * math.exp(-t * 9), 0.07)
        if style == "playful" and bar % 2 == 1:  # bell "ting" at the end of every other bar
            f = hz(chord[2] + 24)
            add(t0 + beat * 3.5, 0.6, lambda t, f=f: math.sin(2 * math.pi * f * t) * math.exp(-t * 5), 0.06)
        if last:
            continue
        # drums: kick on every beat (half-time for "warm"), clap on 2 and 4, off-beat hi-hat
        for k in range(4):
            at = t0 + k * beat
            if not (style == "warm" and k % 2 == 1):
                add(at, 0.35, lambda t: math.sin(2 * math.pi * (45 * t + 75 / 30 * (1 - math.exp(-30 * t)))) * math.exp(-t * 9), 0.55)
            if k % 2 == 1:
                add(at, 0.18, lambda t: (rnd.random() * 2 - 1) * math.exp(-t * 28), 0.08 if style == "warm" else 0.16)
            add(at + beat / 2, 0.05, lambda t: (rnd.random() * 2 - 1) * math.exp(-t * 90), 0.06)
    return buf


def write(buf: list[float], out: str) -> None:
    n = len(buf)
    peak = max(1e-9, max(abs(x) for x in buf))
    fade_in, fade_out = int(0.03 * RATE), int(1.0 * RATE)
    frames = bytearray()
    g0 = 0.85 / peak
    for i, x in enumerate(buf):
        g = g0
        if i < fade_in:
            g *= i / fade_in
        if i > n - fade_out:
            g *= max(0.0, (n - i) / fade_out)
        frames += struct.pack("<h", int(max(-1, min(1, x * g)) * 32767))
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))


def main() -> None:
    args = sys.argv[1:]
    opts = {}
    for flag in ("--bpm", "--seed"):
        if flag in args:
            i = args.index(flag)
            opts[flag] = float(args[i + 1])
            del args[i:i + 2]
    if len(args) != 3 or args[0] not in STYLES:
        sys.exit(f"usage: music.py <{'|'.join(STYLES)}> <seconds> <out.wav> [--bpm N] [--seed N]")
    style, secs, out = args[0], float(args[1]), args[2]
    write(render(style, secs, opts.get("--bpm"), int(opts.get("--seed", 7))), out)


if __name__ == "__main__":
    main()
