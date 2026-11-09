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
repro324() {  # <reps> [engine dir, default eng] [output suffix]
  echo "== $(date -u +%H:%M:%S) repro324 ${2:-eng}"
  r=(--engine "$T/${2:-eng}/release/cua-engine" --win "$T/p321-win" --ax "$T/ax324" --app "$T/Probe324.app/Contents/MacOS/Probe324" --modes main --reps "$1")
  node scripts/probe-324/measure.mjs --block textedit "${r[@]}" --cells scroll/text --out "$T/probe-328/repro324-textedit${3:-}"
  node scripts/probe-324/measure.mjs --block appkit "${r[@]}" --cells scroll/notes --out "$T/probe-328/repro324-appkit${3:-}"
}
# The A/B (ruling b1921fc3's gates): head a = main ($T/eng), head b = the branch ($T/eng-b); one engine process alive at
# a time, each head's cells run in turn on the same apps.
engdir() { if [ "$1" = a ]; then echo eng; else echo eng-b; fi; }
sweep() {  # <head> <app>
  echo "== $(date -u +%H:%M:%S) sweep $2 $1"
  node scripts/probe-328/sweep.mjs --app "$2" --engine "$T/$(engdir "$1")/release/cua-engine" --head "$1" --t328 "$T/t328" \
    --cover "$T/Cover328.app/Contents/MacOS/Probe328" --probe-app "$T/Probe328.app/Contents/MacOS/Probe328" --out "$T/probe-328/ab-sweep-$2-$1"
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
  ab-native)
    # The spike's engine cells (coordinate, element, #324's point, at the end) on Probe328, TextEdit, SwiftUI328,
    # Catalyst328, Finder and Settings' sidebar and pane, #324's own cells, and the native still sweep, per head.
    for h in a b; do
      e="$T/$(engdir $h)/release/cua-engine"
      echo "== $(date -u +%H:%M:%S) engine $h"
      node scripts/probe-328/measure.mjs --block engine --engine "$e" --t328 "$T/t328" --app "$T/Probe328.app/Contents/MacOS/Probe328" \
        --cover "$T/Cover328.app/Contents/MacOS/Probe328" --swiftui "$T/SwiftUI328.app/Contents/MacOS/SwiftUI328" \
        --catalyst-app "$T/Catalyst328.app" --reps 3 --out "$T/probe-328/ab-engine-$h"
      repro324 2 "$(engdir $h)" "-$h"
      for app in textedit finder probe; do sweep $h $app; done
    done ;;
  ab-web)
    # Gate (b)'s nested web cells at the engine's own page-sized delta, and the browsers' still sweep, per head.
    for h in a b; do
      for b in safari chrome firefox; do
        echo "== $(date -u +%H:%M:%S) confirm $b $h"
        node scripts/probe-328/confirm.mjs --browser "$b" --t328 "$T/t328" --cover "$T/Cover328.app/Contents/MacOS/Probe328" \
          --engine "$T/$(engdir $h)/release/cua-engine" --pages 1 --reps 4 --out "$T/probe-328/ab-confirm-$b-$h"
        sweep $h $b
      done
    done ;;
  ab-sweep)
    # Gate (a) again, each cell's points planned from its own screenshot (run 42536017630's were planned from the first
    # observation, and windows that had shrunk put some edge pixels outside their cells' screenshots).
    for h in a b; do for app in textedit finder probe safari chrome firefox; do sweep $h $app; done; done ;;
  ab-final-web)
    # The fix head's confirming pass (ruling e70575e5), web: gate (b)'s cells, pageEnd and divEnd, per head.
    for h in a b; do
      for b in safari chrome firefox; do
        echo "== $(date -u +%H:%M:%S) confirm $b $h"
        node scripts/probe-328/confirm.mjs --browser "$b" --t328 "$T/t328" --cover "$T/Cover328.app/Contents/MacOS/Probe328" \
          --engine "$T/$(engdir $h)/release/cua-engine" --pages 1 --reps 4 --cells divTop,div,iframe,hdiv,raf,mid,late,smooth,pageEnd,divEnd \
          --out "$T/probe-328/ab-confirm-$b-$h"
      done
    done ;;
  ab-final-native)
    # The native engine cells (Catalyst over 4 repetitions among them), then a short edge and corner re-check of gate (a).
    for h in a b; do
      e="$T/$(engdir $h)/release/cua-engine"
      echo "== $(date -u +%H:%M:%S) engine $h"
      node scripts/probe-328/measure.mjs --block engine --engine "$e" --t328 "$T/t328" --app "$T/Probe328.app/Contents/MacOS/Probe328" \
        --cover "$T/Cover328.app/Contents/MacOS/Probe328" --swiftui "$T/SwiftUI328.app/Contents/MacOS/SwiftUI328" \
        --catalyst-app "$T/Catalyst328.app" --reps 4 --out "$T/probe-328/ab-engine-$h"
    done
    for h in a b; do for app in textedit probe safari chrome; do
      echo "== $(date -u +%H:%M:%S) sweep $app $h (edges and corners)"
      node scripts/probe-328/sweep.mjs --app "$app" --engine "$T/$(engdir $h)/release/cua-engine" --head "$h" --t328 "$T/t328" --kinds edge,corner \
        --cover "$T/Cover328.app/Contents/MacOS/Probe328" --probe-app "$T/Probe328.app/Contents/MacOS/Probe328" --out "$T/probe-328/ab-sweep-$app-$h"
    done; done ;;
  ab-short)
    # A short confirming pass on a fix head: Settings' sidebar and pane, the Probe328, TextEdit and Finder cells (their ends
    # among them), every browser's pageEnd, and div and late as a sanity row, per head.
    for h in a b; do
      echo "== $(date -u +%H:%M:%S) engine $h"
      node scripts/probe-328/measure.mjs --block engine --engine "$T/$(engdir $h)/release/cua-engine" --t328 "$T/t328" --app "$T/Probe328.app/Contents/MacOS/Probe328" \
        --cover "$T/Cover328.app/Contents/MacOS/Probe328" --swiftui "$T/SwiftUI328.app/Contents/MacOS/SwiftUI328" \
        --catalyst-app "$T/Catalyst328.app" --engine-apps settings,probe,textedit,finder --reps 4 --out "$T/probe-328/ab-engine-$h"
      for b in safari chrome firefox; do
        echo "== $(date -u +%H:%M:%S) confirm $b $h"
        node scripts/probe-328/confirm.mjs --browser "$b" --t328 "$T/t328" --cover "$T/Cover328.app/Contents/MacOS/Probe328" \
          --engine "$T/$(engdir $h)/release/cua-engine" --pages 1 --reps 4 --cells pageEnd,div,late --out "$T/probe-328/ab-confirm-$b-$h"
      done
    done ;;
  ab-pass)
    # A confirming pass on a fix head: the nested web cells (clipped hit, div, iframe, horizontal, scripted) and divEnd.
    for h in a b; do
      for b in safari chrome firefox; do
        echo "== $(date -u +%H:%M:%S) confirm $b $h"
        node scripts/probe-328/confirm.mjs --browser "$b" --t328 "$T/t328" --cover "$T/Cover328.app/Contents/MacOS/Probe328" \
          --engine "$T/$(engdir $h)/release/cua-engine" --pages 1 --reps 4 --cells divTop,div,iframe,hdiv,raf,mid,divEnd \
          --out "$T/probe-328/ab-confirm-$b-$h"
      done
    done ;;
  confirmb)
    # Gate (b)'s early read (ruling b1921fc3): main's engine scrolls nested web scrollers, t328 emulates the approved
    # confirmation around it, the page's scroll events are the truth (scripts/probe-328/confirm.mjs).
    for b in safari chrome firefox; do
      echo "== $(date -u +%H:%M:%S) confirm $b"
      node scripts/probe-328/confirm.mjs --browser "$b" --t328 "$T/t328" --cover "$T/Cover328.app/Contents/MacOS/Probe328" \
        --engine "$T/eng/release/cua-engine" --reps "${REPS:-5}" --out "$T/probe-328/confirmb-$b"
    done ;;
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
