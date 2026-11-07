#!/bin/bash
# #313's hosted A/B: one group's cells on A (main, $RUNNER_TEMP/eng-a) and B (the fix, $RUNNER_TEMP/eng-b), one engine
# process per cell and head, the heads' order alternating by repetition (odd: A first).
#   GROUP=<safari|firefox|native|chrome> REP=<n> scripts/probe-313/run.sh
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
    native)
      stamp "$h native"; node scripts/probe-313/native.mjs --engine "$E" --ax "$AX" --app "$T/Probe313.app/Contents/MacOS/Probe313" --out "$OUT/$h/native" ;;
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
