#!/bin/bash
# #287: one group's kit cells on main's engine (built by the workflow at $RUNNER_TEMP/eng/release/cua-engine), on each
# browser the group names. Chrome groups run Chrome for Testing (the control) and stable Chrome in one job, the order
# alternating by repetition (odd: CfT first). Every kit runs unchanged bar scripts/probe-287/patch-kits.py's switches;
# A/B kits get main as both heads, with P287_HEADS (one head) or P287_SLOTS (two observations) so the time is not doubled.
#   GROUP=<group> REP=<n> scripts/probe-287/run.sh
set -u
T="$RUNNER_TEMP"; OUT="$T/probe-287"; ENG="$T/eng/release/cua-engine"
mkdir -p "$OUT"
CFT_BIN='/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
STABLE_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export P282_REP="$REP" P283_REP="$REP" P288_REP="$REP" P296_REP="$REP" P305_REP="$REP" P304_REP="$REP"
export P282_MAIN_COMMIT="$GITHUB_SHA" P283_MAIN_COMMIT="$GITHUB_SHA" P283_BRANCH_COMMIT="$GITHUB_SHA" P288_MAIN_COMMIT="$GITHUB_SHA" \
  P288_BRANCH_COMMIT="$GITHUB_SHA" P296_MAIN_COMMIT="$GITHUB_SHA" P296_BRANCH_COMMIT="$GITHUB_SHA" P305_MAIN_COMMIT="$GITHUB_SHA" \
  P305_BRANCH_COMMIT="$GITHUB_SHA" P304_A_COMMIT="$GITHUB_SHA" P304_B_COMMIT="$GITHUB_SHA"
chromes() { if [ $((REP % 2)) -eq 1 ]; then echo "cft stable"; else echo "stable cft"; fi; }
bin_of() { if [ "$1" = cft ]; then echo "$CFT_BIN"; else echo "$STABLE_BIN"; fi; }
stamp() { echo "== $(date -u +%H:%M:%S) $*"; }

case "$GROUP" in
  recon)
    node scripts/probe-287/recon.mjs --engine "$ENG" --ax "$T/axrecon" --out "$OUT/recon" ;;
  firefox-recon)
    node scripts/probe-287/recon.mjs --engine "$ENG" --ax "$T/axrecon" --targets firefox,firefox-force,firefox-big,chrome-big,safari,chrome --timeline --out "$OUT/recon" ;;
  chrome-a)
    for b in $(chromes); do
      export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")"
      stamp "$b 282"; node scripts/probe-282/probe.mjs --main "$ENG" --branch "$ENG" --hit "$T/p282-hit" --cells b-,c-,geometry,obs,btn --out "$OUT/$b/282"
      stamp "$b 283"; node scripts/probe-283/ab.mjs --main "$ENG" --branch "$ENG" --ax "$T/p283-ax" --cells branch/ --out "$OUT/$b/283"
      stamp "$b 288p"; node scripts/probe-288/probe.mjs --engine "$ENG" --ax "$T/p288-ax" --cells t/none,t/role,t/manual,t/eui,g/,e/none --out "$OUT/$b/288p"
    done ;;
  chrome-b)
    for b in $(chromes); do
      export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")"
      stamp "$b 288 live"; node scripts/probe-288/live.mjs --main "$ENG" --branch "$ENG" --ax "$T/p288-ax" --cells c1/branch,c2/branch,c3/branch,c4/branch,c5/branch,c6/branch --out "$OUT/$b/288live"
      stamp "$b 294"; node scripts/probe-294/live.mjs --engine "$ENG" --tool "$T/p294-tool" --cells c/layout-noeng --out "$OUT/$b/294"
    done ;;
  chrome-s296)
    for b in $(chromes); do
      export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")" P287_HEADS=branch
      for g in chrome final; do stamp "$b 296 $g"; node scripts/probe-296/ab.mjs --group "$g" --branch "$ENG" --main "$ENG" --app "$T/Probe296.app/Contents/MacOS/Probe296" --out "$OUT/$b/296-$g"; done
    done ;;
  chrome-s305)
    for b in $(chromes); do
      export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")" P287_HEADS=branch
      stamp "$b 305"; node scripts/probe-305/ab.mjs --group chrome --parts sweep,popover --main "$ENG" --branch "$ENG" --tool "$T/probe-tool" --out "$OUT/$b/305"
    done ;;
  chrome-cov-a|chrome-cov-b|chrome-cov-c)
    for b in $(chromes); do
      export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")" P287_SLOTS=2
      stamp "$b 304 ${GROUP#chrome-cov-}"; node scripts/probe-304/ab.mjs --group "chrome-${GROUP#chrome-cov-}" --a "$ENG" --b "$ENG" --tool "$T/probe-tool" --out "$OUT/$b/304"
    done ;;
  safari-a)
    export P287_BROWSER=safari
    stamp "safari 282"; node scripts/probe-282/probe.mjs --main "$ENG" --branch "$ENG" --hit "$T/p282-hit" --cells b-shared,c-,geometry,obs,btn --out "$OUT/safari/282"
    stamp "safari 283"; node scripts/probe-283/ab.mjs --main "$ENG" --branch "$ENG" --ax "$T/p283-ax" --cells branch/ --out "$OUT/safari/283" ;;
  firefox-a)
    export P287_BROWSER=firefox
    stamp "firefox 282"; node scripts/probe-282/probe.mjs --main "$ENG" --branch "$ENG" --hit "$T/p282-hit" --cells b-shared,c-,geometry,obs,btn --out "$OUT/firefox/282"
    stamp "firefox 283"; node scripts/probe-283/ab.mjs --main "$ENG" --branch "$ENG" --ax "$T/p283-ax" --cells branch/ --out "$OUT/firefox/283" ;;
  firefox-s296)
    export P287_BROWSER=firefox P287_HEADS=branch
    stamp "firefox 296"; node scripts/probe-296/ab.mjs --group firefox --branch "$ENG" --main "$ENG" --app "$T/Probe296.app/Contents/MacOS/Probe296" --out "$OUT/firefox/296" ;;
  firefox-s305)
    export P287_BROWSER=firefox P287_HEADS=branch P287_SWEEP_FRAMES=1
    stamp "firefox 305"; node scripts/probe-305/ab.mjs --group firefox --parts sweep --main "$ENG" --branch "$ENG" --tool "$T/probe-tool" --out "$OUT/firefox/305" ;;
  firefox-cov)
    export P287_BROWSER=firefox P287_SLOTS=2
    stamp "firefox 304"; node scripts/probe-304/ab.mjs --group firefox --a "$ENG" --b "$ENG" --tool "$T/probe-tool" --out "$OUT/firefox/304" ;;
  vscode-a)
    stamp "vscode electron"; P287_REP="$REP" node scripts/probe-287/electron.mjs --engine "$ENG" --ax "$T/axrecon" --cells "${P287_CELLS:-}" --out "$OUT/vscode/electron" ;;
  vscode-s305)
    export P287_HEADS=branch
    stamp "vscode 305"; node scripts/probe-305/ab.mjs --group vscode --parts sweep --main "$ENG" --branch "$ENG" --tool "$T/probe-tool" --out "$OUT/vscode/305" ;;
  keys-x)
    # #287's follow-up to the ⌘L cells: a key with no visible effect, and ⌘L closed by Escape, before the click.
    for b in $(chromes) safari firefox; do
      case "$b" in cft|stable) export P287_BROWSER=chrome P287_CHROME="$(bin_of "$b")" ;; *) export P287_BROWSER="$b" ;; esac
      stamp "$b 282 x"; node scripts/probe-282/probe.mjs --main "$ENG" --branch "$ENG" --hit "$T/p282-hit" --cells x-,e-,b-shared/cmdL --out "$OUT/$b/282x"
    done ;;
  *) echo "unknown group $GROUP"; exit 2 ;;
esac
stamp done
