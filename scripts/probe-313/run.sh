#!/bin/bash
# #313's hosted A/B: one group's cells on A (main, $RUNNER_TEMP/eng-a) and B (the fix, $RUNNER_TEMP/eng-b), one engine
# process per cell and head, the heads' order alternating by repetition (odd: A first).
#   GROUP=<safari|firefox|safari-x|firefox-x|native|native-x|raw|latency|safari-caret|chrome> REP=<n> scripts/probe-313/run.sh
set -u
T="$RUNNER_TEMP"; OUT="$T/probe-313"; AX="$T/p313-ax"
mkdir -p "$OUT"
CFT_BIN='/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
STABLE_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
stamp() { echo "== $(date -u +%H:%M:%S) $*"; }
if [ $((REP % 2)) -eq 1 ]; then heads="a b"; chromes="cft stable"; else heads="b a"; chromes="stable cft"; fi
export P313_REP="$REP" P282_REP="$REP" P283_REP="$REP"
for h in $heads; do
  E="$T/eng-$h/release/cua-engine"
  if [ "$h" = a ]; then export P313_HEAD=a P313_HEAD_COMMIT="$P313_A_REF"; else export P313_HEAD=b P313_HEAD_COMMIT="$P313_B_REF"; fi
  case "$GROUP" in
    safari|firefox)
      export P287_BROWSER="$GROUP"
      stamp "$h $GROUP web"; node scripts/probe-313/web.mjs --engine "$E" --ax "$AX" --out "$OUT/$h/$GROUP/web"
      stamp "$h $GROUP 282"; node scripts/probe-282/probe.mjs --main "$E" --branch "$E" --hit "$T/p282-hit" --cells e-shared/textarea-element --out "$OUT/$h/$GROUP/282" ;;
    safari-x|firefox-x)
      # A coordinate click on the textarea (unchanged by the fix) for its effect on the window order, and once per job
      # the raw writes (raw.mjs) that say which accessibility write focuses the field and which raises the browser.
      export P287_BROWSER="${GROUP%-x}"
      stamp "$h ${GROUP%-x} 282 coordinate"; node scripts/probe-282/probe.mjs --main "$E" --branch "$E" --hit "$T/p282-hit" --cells b-shared/textarea,c-dedicated/textarea --out "$OUT/$h/${GROUP%-x}/282"
      if [ "$h" = "${heads%% *}" ]; then stamp "${GROUP%-x} raw"; node scripts/probe-313/raw.mjs --engine "$E" --ax283 "$T/p283-ax" --out "$OUT/raw/${GROUP%-x}"; fi ;;
    raw)
      # The raw writes alone, Safari then Firefox, once per job.
      if [ "$h" = "${heads%% *}" ]; then for b in safari firefox; do export P287_BROWSER="$b"; stamp "$b raw"; node scripts/probe-313/raw.mjs --engine "$E" --ax283 "$T/p283-ax" --out "$OUT/raw/$b"; done; fi ;;
    safari-caret)
      # The Safari by-token cells alone, the textarea filled so the caret's place is checkable (P313_FILLED).
      export P287_BROWSER=safari P313_FILLED="${P313_FILLED:-1}"
      stamp "$h safari caret"; node scripts/probe-313/web.mjs --engine "$E" --ax "$AX" --cells "${P313_CELLS:-}" --out "$OUT/$h/safari/web" ;;
    latency)
      # Firefox's focus read-back after AXPress (main's route), on A only.
      if [ "$h" = a ]; then export P287_BROWSER=firefox; stamp "a firefox latency"; node scripts/probe-313/latency.mjs --engine "$E" --ax "$AX" --poll "$T/p313-poll" --n 20 --out "$OUT/a/firefox/latency"; fi ;;
    native)
      stamp "$h native"; node scripts/probe-313/native.mjs --engine "$E" --ax "$AX" --app "$T/Probe313.app/Contents/MacOS/Probe313" --cells app/,textedit/,finder/,settings/ --out "$OUT/$h/native" ;;
    native-x)
      stamp "$h native x"; node scripts/probe-313/native.mjs --engine "$E" --ax "$AX" --app "$T/Probe313.app/Contents/MacOS/Probe313" --cells x/ --out "$OUT/$h/native" ;;
    chrome)
      for b in $chromes; do
        if [ "$b" = cft ]; then bin="$CFT_BIN"; else bin="$STABLE_BIN"; fi
        export P287_BROWSER=chrome P287_CHROME="$bin"
        stamp "$h $b web"; node scripts/probe-313/web.mjs --engine "$E" --ax "$AX" --out "$OUT/$h/$b/web"
        stamp "$h $b 282"; node scripts/probe-282/probe.mjs --main "$E" --branch "$E" --hit "$T/p282-hit" --cells e-shared/textarea-element --out "$OUT/$h/$b/282"
        stamp "$h $b 283"; node scripts/probe-283/ab.mjs --main "$E" --branch "$E" --ax "$T/p283-ax" --cells branch/ --out "$OUT/$h/$b/283"
      done ;;
    *) echo "unknown group $GROUP"; exit 2 ;;
  esac
done
stamp done
