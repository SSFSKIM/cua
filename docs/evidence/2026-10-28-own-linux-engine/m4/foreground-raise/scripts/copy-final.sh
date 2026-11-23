#!/bin/bash
# The final sittings and the device run into the evidence directory, then their analyses.
set -eu
T=$HOME/.local/share/cua-171/task63
E=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/foreground-raise
python3 -I "$T/scripts/copy-evidence.py" "$T/runs" "$E" final-gtk4-load2=final/gtk4-load2 final-gtk4-idle=final/gtk4-idle \
  final-others-load2=final/others-load2 final-others-idle=final/others-idle base-qt-load2=before/qt-load2
python3 -I "$T/scripts/copy-evidence.py" "$T/runs/final-device" "$E" run=final/device
for f in order.jsonl session.jsonl watchdog.jsonl stdout.log; do
  python3 -I -c 'import sys,os,gzip
src,dst=sys.argv[1:]; home=os.path.expanduser("~"); t=os.path.join(home,".local/share/cua-171/task63")
text=open(src,errors="replace").read().replace(t,"<task63>").replace(home,"<home>").encode()
if len(text)>512*1024:
  with open(dst+".gz","wb") as raw, gzip.GzipFile(fileobj=raw,mode="wb",mtime=0) as g: g.write(text)
else: open(dst,"wb").write(text)' "$T/runs/final-device/$f" "$E/final/device/$f"
done
"$T/scripts/summarize.sh" "$E" final/gtk4-load2 final/gtk4-idle final/others-load2 final/others-idle before/qt-load2
du -sh "$E"
