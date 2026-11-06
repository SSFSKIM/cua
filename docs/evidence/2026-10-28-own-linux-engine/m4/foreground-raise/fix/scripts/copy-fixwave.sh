#!/bin/bash
# Task 63's fix-wave sittings and device run into the evidence directory (fix/), then their analyses.
set -eu
T=$HOME/.local/share/cua-171/task63
E=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/foreground-raise
python3 -I "$T/scripts/copy-evidence.py" "$T/runs" "$E" fixw-cell-before-load2=fix/activate-click-before-load2 \
  fixw-cell-load2=fix/activate-click-load2 fixw-cell-idle=fix/activate-click-idle fixw-gtk4-load2=fix/gtk4-load2 \
  fixw-gtk4-idle=fix/gtk4-idle fixw-others-load2=fix/others-load2 fixw-others-idle=fix/others-idle
python3 -I "$T/scripts/copy-evidence.py" "$T/runs/fixw-device" "$E" run=fix/device
for f in order.jsonl session.jsonl watchdog.jsonl stdout.log; do
  python3 -I -c 'import sys,os,gzip
src,dst=sys.argv[1:]; home=os.path.expanduser("~"); t=os.path.join(home,".local/share/cua-171/task63")
text=open(src,errors="replace").read().replace(t,"<task63>").replace(home,"<home>").encode()
if len(text)>512*1024:
  with open(dst+".gz","wb") as raw, gzip.GzipFile(fileobj=raw,mode="wb",mtime=0) as g: g.write(text)
else: open(dst,"wb").write(text)' "$T/runs/fixw-device/$f" "$E/fix/device/$f"
done
"$T/scripts/summarize.sh" "$E" fix/activate-click-before-load2 fix/activate-click-load2 fix/activate-click-idle \
  fix/gtk4-load2 fix/gtk4-idle fix/others-load2 fix/others-idle
mkdir -p "$E/fix/scripts"
cp "$T/scripts/fixwave-chain.sh" "$T/scripts/copy-fixwave.sh" "$T/scripts/live.sh" "$E/fix/scripts/"
du -sh "$E/fix"
