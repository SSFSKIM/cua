#!/bin/bash
# #321's candidate runs: one part on one engine ($RUNNER_TEMP/eng, main's or a candidate's), every click watched.
#   VARIANT=<main|a|b|hold> PART=<k282-1|k282-2|page-1|page-2|ctl-chrome|ctl-ff-native> scripts/probe-321/run.sh
set -u
T="$RUNNER_TEMP"; OUT="$T/probe-321/$VARIANT/$PART"; E="$T/eng/release/cua-engine"
mkdir -p "$OUT"
export P321_VARIANT="$VARIANT" P321_WIN="$T/p321-win" P313_HEAD="$VARIANT"
defaults write com.apple.TextEdit ApplePersistenceIgnoreState -bool YES
defaults write com.apple.TextEdit NSQuitAlwaysKeepsWindows -bool NO
stamp() { echo "== $(date -u +%H:%M:%S) $*"; }
case "$PART" in
  k282-*)
    # #282's original cells in Safari, ten repetitions, each cell on a fresh Safari and engine process.
    export P287_BROWSER=safari
    for r in 1 2 3 4 5 6 7 8 9 10; do
      pkill -x TextEdit; sleep 1
      stamp "$VARIANT 282 rep $r"
      node scripts/probe-282/probe.mjs --main "$E" --branch "$E" --hit "$T/p282-hit" --cells a-main/textarea,b-shared/checkbox,b-noobs/checkbox,b-shared/button,b-shared/textarea,c-dedicated/textarea,b-shared/toolbar-reload,geometry --out "$OUT/r$r"
    done ;;
  page-*)
    export P287_BROWSER=safari
    stamp "$VARIANT safari page"; node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --batches 2 --clicks 5 --out "$OUT/safari" ;;
  ctl-chrome)
    export P287_BROWSER=chrome
    stamp "$VARIANT cft page"; node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --batches 2 --clicks 5 --out "$OUT/cft" ;;
  ctl-ff-native)
    export P287_BROWSER=firefox
    stamp "$VARIANT firefox page"; node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --batches 2 --clicks 5 --out "$OUT/firefox"
    stamp "$VARIANT textedit"; node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --native --app "$T/Probe313.app/Contents/MacOS/Probe313" --batches 2 --clicks 5 --out "$OUT/textedit" ;;
  *) echo "unknown part $PART"; exit 2 ;;
esac
stamp done
