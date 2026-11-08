#!/bin/bash
# #328's jobs (scripts/probe-328/measure.mjs), one GROUP per job:
#   smoke   every block once on a few trials, to check the kit
#   appkit  Probe328's four scroll views, TextEdit and Finder's list: the posted factorial, its one-factor splits, the
#           element routes, #324's point below the window, the active-app control and the at-the-end case
#   apps    Notes, System Settings, Mail, Catalyst328 (our own) and a system Catalyst app
#   web     SwiftUI328, Safari, Chrome for Testing, Firefox (the read-back on pages that do scroll), main's engine, and
#           #324's own scroll cells re-run on main (scripts/probe-324/measure.mjs, unpatched)
set -u
T="$RUNNER_TEMP"
common=(--t328 "$T/t328" --app "$T/Probe328.app/Contents/MacOS/Probe328" --cover "$T/Cover328.app/Contents/MacOS/Probe328"
        --swiftui "$T/SwiftUI328.app/Contents/MacOS/SwiftUI328" --engine "$T/eng/release/cua-engine" --catalyst-app "$T/Catalyst328.app")
catalyst=$(head -1 "$T/probe-328/catalyst.txt" 2>/dev/null)
m() { echo "== $(date -u +%H:%M:%S) $1"; node scripts/probe-328/measure.mjs --block "$1" "${common[@]}" --out "$T/probe-328/$2" "${@:3}"; }
# #324's scroll cells as #324 ran them, on main unpatched: the scroll aimed at the centre of the text area's whole frame.
repro324() {
  echo "== $(date -u +%H:%M:%S) repro324"
  r=(--engine "$T/eng/release/cua-engine" --win "$T/p321-win" --ax "$T/ax324" --app "$T/Probe324.app/Contents/MacOS/Probe324" --modes main --reps "$1")
  node scripts/probe-324/measure.mjs --block textedit "${r[@]}" --cells scroll/text --out "$T/probe-328/repro324-textedit"
  node scripts/probe-324/measure.mjs --block appkit "${r[@]}" --cells scroll/notes --out "$T/probe-328/repro324-appkit"
}
case "$GROUP" in
  smoke)
    m probe smoke-probe --sets smoke,outside
    m textedit smoke-textedit --sets smoke,outside
    m swiftui smoke-swiftui --sets smoke
    m catalyst328 smoke-catalyst328 --sets smoke
    m settings smoke-settings --sets smoke
    m notes smoke-notes --sets smoke
    if [ -n "$catalyst" ]; then m catalyst smoke-catalyst --sets smoke --catalyst "$catalyst"; fi
    m engine smoke-engine --reps 1
    repro324 1 ;;
  smoke2)
    # The blocks the second smoke left open: Catalyst (no AXScrollArea), Notes' content, Settings' pane, SwiftUI's List.
    m catalyst328 smoke2-catalyst328 --sets smoke
    if [ -n "$catalyst" ]; then m catalyst smoke2-catalyst --sets smoke --catalyst "$catalyst"; fi
    m notes smoke2-notes --sets smoke
    m settings smoke2-settings --sets smoke
    m swiftui smoke2-swiftui --sets smoke ;;
  appkit)
    m probe probe --sets full,split,routes,outside,active,bottom --reps 2
    m textedit textedit --sets full,split,routes,outside,active,bottom --reps 2
    m finder finder --sets full,split,routes --reps 2 ;;
  apps)
    m notes notes --sets full,split,routes --reps 1
    m settings settings --sets full,split,routes --reps 1
    m mail mail --sets routes --reps 1
    m catalyst328 catalyst328 --sets full,split,routes --reps 1
    if [ -n "$catalyst" ]; then m catalyst catalyst --sets full,split,routes --reps 1 --catalyst "$catalyst"; fi ;;
  followup)
    # What run 42526444701 left open: Firefox's read-back (no AXScrollArea: its AXWebArea), Chrome's with the tracked
    # element mid-viewport, Notes with a body that scrolls, Stocks past its first-run sheet.
    m firefox followup-firefox --sets web,routes,bottom --reps 3
    m chrome followup-chrome --sets web,bottom --reps 2
    m safari followup-safari --sets web --reps 1
    m notes followup-notes --sets full,split,routes --reps 1
    if [ -n "$catalyst" ]; then m catalyst followup-catalyst --sets full,split,routes --reps 1 --catalyst "$catalyst"; fi ;;
  followup2)
    # Firefox with Gecko's accessibility forced on (run 42529832136's scan read only its window buttons).
    m firefox followup2-firefox --sets web,routes,bottom --reps 3 ;;
  web)
    m swiftui swiftui --sets full,split,routes --reps 1
    m safari safari --sets web,routes,bottom --reps 3
    m chrome chrome --sets web,routes,bottom --reps 3
    m firefox firefox --sets web,routes,bottom --reps 3
    m engine engine --reps 3
    repro324 4 ;;
  *) echo "unknown group $GROUP"; exit 2 ;;
esac
echo "== $(date -u +%H:%M:%S) done"
