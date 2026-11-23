#!/bin/bash
# Task 87 (ruling 721): the five /tmp/cua171-run-* directories found before V3's pilot, each recorded (owner, mode,
# mtime in UTC, size, files, its Desktop layout and the run tags inside it), then removed when every marker holds:
# owned by this account, mode 700, the harness's SCRATCH_PREFIX, the Desktop's layout (home/, session/session.conf
# listening under the directory itself, tmp/), a named run tag, and no process naming it in its argv or environment.
# usage: leftover-scratch.sh record|remove
set -u
DIRS="7nTGZK AdXsUJ OJWaJi lLeOBG q8ExPO"
for id in $DIRS; do
  d=/tmp/cua171-run-$id
  [ -d "$d" ] || { echo "$d: gone"; continue; }
  owner=$(stat -c %U "$d"); mode=$(stat -c %a "$d")
  mtime=$(date -u -d "@$(stat -c %Y "$d")" +%FT%TZ)
  tags=$( { ls "$d"; grep -rahoE 'cua171-diff-[A-Za-z0-9-]+' "$d/chrome-profile" 2>/dev/null; } | grep -oE 'cua171-diff-[A-Za-z0-9-]+-[0-9a-f]{8}' | sort -u | tr '\n' ' ')
  layout=yes
  for p in home session/session.conf tmp; do [ -e "$d/$p" ] || layout=no; done
  grep -q "unix:dir=$d/session/bus" "$d/session/session.conf" 2>/dev/null || layout=no
  # the last character bracketed, so grep (which /proc lists while it reads) does not count its own argv
  procs=$(grep -l "cua171-run-${id%?}[${id: -1}]"/proc/[0-9]*/cmdline /proc/[0-9]*/environ 2>/dev/null | wc -l)
  echo "$d owner=$owner mode=$mode mtime=$mtime size=$(du -sh "$d" | cut -f1) files=$(find "$d" | wc -l) layout=$layout procs=$procs tags=[$tags]"
  echo "  top: $(ls -A "$d" | tr '\n' ' ')"
  if [ "${1:-record}" = remove ]; then
    if [ "$owner" = "$(id -un)" ] && [ "$mode" = 700 ] && [ "$layout" = yes ] && [ "$procs" -eq 0 ] && [ -n "$tags" ]; then
      rm -rf "$d" && echo "  removed"
    else
      echo "  KEPT: a marker does not hold"
    fi
  fi
done
