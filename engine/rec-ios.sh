#!/bin/bash
# Optional: record a real screen of your iOS app in the Simulator (screenshots are usually enough).
#
#   BUNDLE=com.example.app engine/rec-ios.sh <simulator-udid> <out-name> <lang> <seconds> [KEY=VALUE ...]
#
# Run it from your video project. It quits the app, starts recording, launches the app with each
# KEY=VALUE passed as an environment variable (SIMCTL_CHILD_KEY=VALUE, readable via
# ProcessInfo.processInfo.environment), waits <seconds>, stops, and writes screens/<out-name>.mov.
#
# Give your app a demo mode so recordings are hands-free and repeatable, e.g.
#   DEMO=checkout  open straight on one screen
#   SAMPLE_DATA=1  load cheerful fixture data, never real user data
#   ADS=off        hide ads
#   AUTOPLAY=1     start self-running animations
# Use a dedicated simulator, and accept any permission prompts (notifications, camera...) once
# before recording, or they will cover every take.
set -euo pipefail
UDID="${1:?simulator udid (xcrun simctl list devices)}" NAME="${2:?output name}" LANG_="${3:?language, e.g. en}" SECS="${4:?seconds}"
shift 4
: "${BUNDLE:?set BUNDLE=<your app bundle id>}"
mkdir -p screens
xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
sleep 0.5
# start recording BEFORE launching, so the first frames and any autoplay animation are captured
xcrun simctl io "$UDID" recordVideo --codec h264 --force "screens/$NAME.mov" >/dev/null 2>&1 &
REC=$!
sleep 1.2
ENV_ARGS=()
for kv in "$@"; do ENV_ARGS+=("SIMCTL_CHILD_$kv"); done
env ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} xcrun simctl launch "$UDID" "$BUNDLE" -AppleLanguages "($LANG_)" -AppleLocale "$LANG_" >/dev/null
sleep "$SECS"
kill -INT $REC
wait $REC 2>/dev/null || true
echo "screens/$NAME.mov"
echo "next: find when the screen has finished loading (the scene's \"from\"):"
echo "  ffmpeg -i screens/$NAME.mov -vf \"select='gt(scene,0.04)',showinfo\" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'"
