#!/bin/bash
# #321's A/B: one part on both heads ($RUNNER_TEMP/engA, origin/main's; $RUNNER_TEMP/engB, the fix's), each repetition on
# a fresh engine process per head, the heads' order alternating by repetition (A first on odd ones), every click watched.
#   PART=<k282-1..4|page-1|page-2|ctl-chrome|ctl-textedit> scripts/probe-321/run.sh
set -u
T="$RUNNER_TEMP"
export P321_WIN="$T/p321-win"
defaults write com.apple.TextEdit ApplePersistenceIgnoreState -bool YES
defaults write com.apple.TextEdit NSQuitAlwaysKeepsWindows -bool NO
stamp() { echo "== $(date -u +%H:%M:%S) $*"; }
order() { if [ $(( $1 % 2 )) -eq 1 ]; then echo A B; else echo B A; fi; }
use() { export P321_VARIANT="$1" P313_HEAD="$1" P313_REP="$2"; E="$T/eng$1/release/cua-engine"; }
case "$PART" in
  k282-*)
    # #282's original cells in Safari, five repetitions per part (part n: 5n-4 to 5n), each cell on a fresh Safari and
    # engine process.
    export P287_BROWSER=safari
    n=${PART#k282-}
    for r in $(seq $(( 5 * n - 4 )) $(( 5 * n ))); do
      for h in $(order "$r"); do
        use "$h" "$r"
        pkill -x TextEdit; sleep 1
        stamp "$h 282 rep $r"
        node scripts/probe-282/probe.mjs --main "$E" --branch "$E" --hit "$T/p282-hit" --cells a-main/textarea,b-shared/checkbox,b-noobs/checkbox,b-shared/button,b-shared/textarea,c-dedicated/textarea,b-shared/toolbar-reload,geometry --out "$T/probe-321/$h/$PART/r$r"
      done
    done ;;
  page-*)
    # Safari's page clicks: two batches of five per head per part (part n: batches 2n-1 and 2n).
    export P287_BROWSER=safari
    n=${PART#page-}
    for b in $(( 2 * n - 1 )) $(( 2 * n )); do
      for h in $(order "$b"); do
        use "$h" "$b"; stamp "$h safari page batch $b"
        node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --batch "$b" --batches 1 --clicks 5 --out "$T/probe-321/$h/$PART/b$b/safari"
      done
    done ;;
  ctl-chrome)
    export P287_BROWSER=chrome
    for b in 1 2; do
      for h in $(order "$b"); do
        use "$h" "$b"; stamp "$h cft page batch $b"
        node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --batch "$b" --batches 1 --clicks 5 --out "$T/probe-321/$h/$PART/b$b/cft"
      done
    done ;;
  ctl-textedit)
    for b in 1 2; do
      for h in $(order "$b"); do
        use "$h" "$b"; stamp "$h textedit batch $b"
        node scripts/probe-321/deliver.mjs --engine "$E" --win "$P321_WIN" --native --app "$T/Probe313.app/Contents/MacOS/Probe313" --batch "$b" --batches 1 --clicks 5 --out "$T/probe-321/$h/$PART/b$b/textedit"
      done
    done ;;
  *) echo "unknown part $PART"; exit 2 ;;
esac
stamp done
