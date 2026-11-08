#!/bin/bash
# #328's jobs (scripts/probe-328/measure.mjs), one GROUP per job:
#   smoke   every block once on a few trials, to check the kit
#   appkit  Probe328's four scroll views, TextEdit and Finder's list: the posted factorial, its one-factor splits, the
#           element routes, the active-app control and the at-the-end case
#   apps    Notes, System Settings, Mail, a Catalyst app if the image has one
#   web     SwiftUI328, Safari, Chrome for Testing, Firefox (the read-back on pages that do scroll), main's engine
set -u
T="$RUNNER_TEMP"
common=(--t328 "$T/t328" --app "$T/Probe328.app/Contents/MacOS/Probe328" --cover "$T/Cover328.app/Contents/MacOS/Probe328"
        --swiftui "$T/SwiftUI328.app/Contents/MacOS/SwiftUI328" --engine "$T/eng/release/cua-engine")
catalyst=$(head -1 "$T/probe-328/catalyst.txt" 2>/dev/null)
m() { echo "== $(date -u +%H:%M:%S) $1"; node scripts/probe-328/measure.mjs --block "$1" "${common[@]}" --out "$T/probe-328/$2" "${@:3}"; }
case "$GROUP" in
  smoke)
    m probe smoke-probe --sets smoke
    m textedit smoke-textedit --sets smoke
    m finder smoke-finder --sets smoke
    m swiftui smoke-swiftui --sets smoke
    m safari smoke-safari --sets smoke
    m settings smoke-settings --sets smoke
    m notes smoke-notes --sets smoke
    m mail smoke-mail --sets smoke
    if [ -n "$catalyst" ]; then m catalyst smoke-catalyst --sets smoke --catalyst "$catalyst"; fi
    m engine smoke-engine --reps 1 ;;
  appkit)
    m probe probe --sets full,split,routes,active,bottom --reps 2
    m textedit textedit --sets full,split,routes,active,bottom --reps 2
    m finder finder --sets full,split,routes --reps 2 ;;
  apps)
    m notes notes --sets full,split,routes --reps 1
    m settings settings --sets full,split,routes --reps 1
    m mail mail --sets full,routes --reps 1
    if [ -n "$catalyst" ]; then m catalyst catalyst --sets full,split,routes --reps 1 --catalyst "$catalyst"; fi ;;
  web)
    m swiftui swiftui --sets full,split,routes --reps 1
    m safari safari --sets web,routes,bottom --reps 3
    m chrome chrome --sets web,routes,bottom --reps 3
    m firefox firefox --sets web,routes,bottom --reps 3
    m engine engine --reps 3 ;;
  *) echo "unknown group $GROUP"; exit 2 ;;
esac
echo "== $(date -u +%H:%M:%S) done"
