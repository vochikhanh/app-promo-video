# Optional: screen recordings

Screenshots are the default because they are fast, free, and look great once the device floats,
punches and zooms. Record the screen only when **motion is the selling point**: a swipe, a
spinning wheel, a drag-and-drop, a game.

Recordings and stills mix freely: `screens/wheel.mov` next to `screens/today.png`.

## 1. Give your app a demo mode (strongly recommended)

Hands-free, repeatable recordings come from launch flags your app reads in debug builds:

| Flag | Effect |
|---|---|
| `DEMO=<screen>` | open straight on one screen |
| `SAMPLE_DATA=1` | load cheerful fixture data, never real user data |
| `ADS=off` | hide ads and promos |
| `AUTOPLAY=1` | start self-running animations (a wheel spins, a chart fills) |
| `TODAY=2026-05-12` | freeze the date so every take matches |

On iOS, read them with `ProcessInfo.processInfo.environment["DEMO"]`; on Android, with intent
extras.

## 2. Record

### iOS Simulator

```bash
BUNDLE=com.example.app engine/rec-ios.sh <simulator-udid> wheel en 8 DEMO=wheel SAMPLE_DATA=1 AUTOPLAY=1
```

Writes `screens/wheel.mov`. The script starts recording **before** launching the app so the first
frames and autoplay animations are captured. Find UDIDs with `xcrun simctl list devices booted`.

- Use a dedicated simulator for recordings.
- Accept permission prompts (notifications, camera, location) once before recording, or they
  will cover every take.
- Set a clean status bar: `xcrun simctl status_bar <udid> override --time 9:41 --batteryLevel 100 --cellularBars 4`

### Android emulator or device

```bash
adb shell am start -n com.example.app/.MainActivity --es DEMO wheel --es SAMPLE_DATA 1
adb shell screenrecord --time-limit 8 /sdcard/wheel.mp4
adb pull /sdcard/wheel.mp4 screens/wheel.mp4
```

Clean status bar: `adb shell settings put global sysui_demo_allowed 1`, then
`adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941`.

### Desktop / web

Any recorder works (QuickTime, OBS, `ffmpeg -f avfoundation`). Crop to the app area and use
`"device": "card"`, or record a mobile-sized browser window for the phone frame.

## 3. Find where the content is ready (`from`)

A recording usually starts with a launch screen or a loading state. Measure the second when the
real content appears instead of guessing:

```bash
ffmpeg -i screens/wheel.mov -vf "select='gt(scene,0.04)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'
```

The first big scene change after launch is your `from`. To see the recording without opening it:

```bash
promo-video sheet screens/wheel.mov     # 6 frames in one strip
```

```json
{ "type": "phone", "clip": "wheel", "from": 1.8, "rate": 1.2, "say": "…", "big": "…" }
```

`rate` speeds playback up (1.2–1.5 keeps slow animations snappy). Re-measure `from` every time you
re-record.

Frames are extracted once at 30 fps into `.cache/frames/` (keyed by file content), so replacing a
recording automatically refreshes them.
