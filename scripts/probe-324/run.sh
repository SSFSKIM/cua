#!/bin/bash
# #324's jobs (scripts/probe-324/measure.mjs), one GROUP per job:
#   smoke     every block once, few cells, to check the kit
#   safari    Safari's survey: main, press and c, $REPS repetitions
#   native    Probe324.app behind TextEdit, then TextEdit behind Probe324.app: main, press and c, $REPS repetitions
#   residue   #321's residue: Safari page coordinate clicks, main, ev and ev300 alternating by batch, $BATCHES batches
set -u
T="$RUNNER_TEMP"
common=(--engine "$T/eng/release/cua-engine" --win "$T/p321-win" --ax "$T/ax324" --app "$T/Probe324.app/Contents/MacOS/Probe324")
stamp() { echo "== $(date -u +%H:%M:%S) $*"; }
case "$GROUP" in
  smoke)
    stamp safari
    node scripts/probe-324/measure.mjs --block safari "${common[@]}" --modes main,press,c --reps 1 \
      --cells sv/name,sv/notes-focused,st/area,coord/name+type+key,scroll/page,drag/plain --out "$T/probe-324/smoke-safari"
    stamp appkit
    node scripts/probe-324/measure.mjs --block appkit "${common[@]}" --modes main,press --reps 1 \
      --cells sv/field,sv/notes,st/field-focused,coord/notes+type+key,scroll/notes,drag/notes --out "$T/probe-324/smoke-appkit"
    stamp textedit
    node scripts/probe-324/measure.mjs --block textedit "${common[@]}" --modes main,press --reps 1 --out "$T/probe-324/smoke-textedit"
    stamp residue
    node scripts/probe-324/measure.mjs --block residue "${common[@]}" --modes main,ev300 --batches 2 --clicks 2 --out "$T/probe-324/smoke-residue" ;;
  safari)
    stamp safari
    node scripts/probe-324/measure.mjs --block safari "${common[@]}" --modes main,press,c --reps "${REPS:-8}" --out "$T/probe-324/safari" ;;
  native)
    stamp appkit
    node scripts/probe-324/measure.mjs --block appkit "${common[@]}" --modes main,press,c --reps "${REPS:-6}" --out "$T/probe-324/appkit"
    stamp textedit
    node scripts/probe-324/measure.mjs --block textedit "${common[@]}" --modes main,press,c --reps "${REPS:-6}" --out "$T/probe-324/textedit" ;;
  residue)
    stamp residue
    node scripts/probe-324/measure.mjs --block residue "${common[@]}" --modes main,ev,ev300 --batches "${BATCHES:-30}" --clicks 5 --out "$T/probe-324/residue" ;;
  *) echo "unknown group $GROUP"; exit 2 ;;
esac
stamp done
