#!/bin/bash
# Task 63's follow-up sittings into the evidence directory (fix/followup/), then their analyses.
set -eu
T=$HOME/.local/share/cua-171/task63
E=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/foreground-raise
python3 -I "$T/scripts/copy-evidence.py" "$T/runs" "$E" fu-cell-load2=fix/followup/activate-click-load2
python3 -I "$T/scripts/copy-evidence.py" "$T/runs/fu-device-load2" "$E" run=fix/followup/device-load2
for f in order.jsonl session.jsonl watchdog.jsonl stdout.log; do
  python3 -I -c 'import sys,os,gzip
src,dst=sys.argv[1:]; home=os.path.expanduser("~"); t=os.path.join(home,".local/share/cua-171/task63")
text=open(src,errors="replace").read().replace(t,"<task63>").replace(home,"<home>").encode()
if len(text)>512*1024:
  with open(dst+".gz","wb") as raw, gzip.GzipFile(fileobj=raw,mode="wb",mtime=0) as g: g.write(text)
else: open(dst,"wb").write(text)' "$T/runs/fu-device-load2/$f" "$E/fix/followup/device-load2/$f"
done
cp "$T/runs/followup-chain.log" "$E/fix/followup/chain.log"
"$T/scripts/summarize.sh" "$E" fix/followup/activate-click-load2
mkdir -p "$E/fix/followup/scripts"
cp "$T/scripts/followup-chain.sh" "$T/scripts/copy-followup.sh" "$E/fix/followup/scripts/"
du -sh "$E/fix/followup"
