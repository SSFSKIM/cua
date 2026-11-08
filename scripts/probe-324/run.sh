#!/bin/bash
# #324's jobs (scripts/probe-324/measure.mjs), one GROUP per job:
#   smoke     every block once, few cells, to check the kit
#   safari    Safari's survey: main, press and c, $REPS repetitions
#   native    Probe324.app behind TextEdit, then TextEdit behind Probe324.app: main, press and c, $REPS repetitions
#   residue   #321's residue: Safari page coordinate clicks, main, ev and ev300 alternating by batch, $BATCHES batches
#   run2      the second run (below)
#   run3      the third run (below)
#   ab-*      #324's hosted A/B of fix/324-caret-first against main (below): ab-safari, ab-native, ab-cap
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
  run2)
    # The second run: the WebKit fields' set_value and select_text on main against press and caret-first, ten repetitions;
    # select_text on the AppKit text view (a unique text); #321's residue with a slow activation injected on every click.
    stamp safari2
    node scripts/probe-324/measure.mjs --block safari "${common[@]}" --modes main,press,caret --reps 10 \
      --cells sv/name,sv/notes,st/filled,st/area --out "$T/probe-324/safari2"
    stamp appkit2
    node scripts/probe-324/measure.mjs --block appkit "${common[@]}" --modes main,press --reps 4 --cells st/notes,st/notes-focused --out "$T/probe-324/appkit2"
    stamp slow
    node scripts/probe-324/measure.mjs --block residue "${common[@]}" --modes main,ev,ev300 --batches 12 --clicks 5 --delay 100-190 --out "$T/probe-324/slow" ;;
  run3)
    # The third run: caret-first against press on the WebKit fields (run 42472740707's caret mode never reached
    # focusField: the patch gated press mode alone), eight repetitions.
    stamp safari3
    node scripts/probe-324/measure.mjs --block safari "${common[@]}" --modes press,caret --reps 8 \
      --cells sv/name,sv/notes,st/filled,st/area --out "$T/probe-324/safari3" ;;
  ab-*)
    # #324's hosted A/B: A = main ($T/eng-a), B = fix/324-caret-first ($T/eng-b), BS = B with caretFirstCoversSecureFields
    # on ($T/eng-bs), each patched for logging only (patch-log.py); one engine process alive at a time.
    ab=(--engine "$T/eng-a/release/cua-engine" --win "$T/p321-win" --ax "$T/ax324" --app "$T/Probe324.app/Contents/MacOS/Probe324"
        --bins "a=$T/eng-a/release/cua-engine,b=$T/eng-b/release/cua-engine,bs=$T/eng-bs/release/cua-engine")
    m=measure.mjs
    case "$GROUP" in
      ab-safari)
        stamp safari shared
        node scripts/probe-324/$m --block safari "${ab[@]}" --modes a,b --reps 20 --cells sv/name,sv/notes,st/filled,st/area --out "$T/probe-324/safari-shared"
        stamp safari dedicated
        node scripts/probe-324/$m --block safari "${ab[@]}" --desktop dedicated --modes a,b --reps 6 --cells sv/name,sv/notes,st/filled,st/area --out "$T/probe-324/safari-dedicated"
        stamp safari password
        node scripts/probe-324/$m --block safari "${ab[@]}" --modes a,b,bs --reps 20 --cells sv/secret --out "$T/probe-324/safari-password" ;;
      ab-native)
        stamp appkit
        node scripts/probe-324/$m --block appkit "${ab[@]}" --modes a,b --reps 6 --cells sv/field,sv/notes,st/field,st/notes --out "$T/probe-324/appkit"
        stamp textedit
        node scripts/probe-324/$m --block textedit "${ab[@]}" --modes a,b --reps 6 --cells sv/text,st/text --out "$T/probe-324/textedit"
        stamp chrome
        node scripts/probe-324/$m --block safari --browser chrome "${ab[@]}" --modes a,b --reps 3 --cells sv/name,coord/button --out "$T/probe-324/chrome"
        stamp firefox
        node scripts/probe-324/$m --block safari --browser firefox "${ab[@]}" --modes a,b --reps 3 --cells sv/name,coord/button --out "$T/probe-324/firefox" ;;
      ab-cap)
        stamp cap natural
        node scripts/probe-324/$m --block residue "${ab[@]}" --modes a,b --batches 20 --clicks 5 --out "$T/probe-324/cap-natural"
        stamp cap delayed
        node scripts/probe-324/$m --block residue "${ab[@]}" --modes a,b --batches 12 --clicks 5 --delay 100-190 --out "$T/probe-324/cap-delayed" ;;
      *) echo "unknown group $GROUP"; exit 2 ;;
    esac ;;
  *) echo "unknown group $GROUP"; exit 2 ;;
esac
stamp done
