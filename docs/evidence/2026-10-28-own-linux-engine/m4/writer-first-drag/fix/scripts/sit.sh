#!/bin/bash
# task 72 fix wave: one or more sittings on the export of a harness commit, under the host lock (the caller takes it).
# Each step is `<name>|<kind>|<args...>`: kind `probe` (writer-drag.mjs through the evidence's probe.sh, the pinned
# build beside the candidate), `drag` (the drag experiment through private.sh) or `settle` (the settle experiment,
# which starts its own private Xvfb), or `probeold` (as `probe`, on task 72's accdc6c5 build in the cua lane). The
# candidate is the engine binary.
# usage: sit.sh <harness commit> <candidate> '<step>'...
set -u
F=$HOME/.local/share/cua-171/task72fix
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
S=$W/docs/evidence/2026-10-28-own-linux-engine/m4/writer-first-drag/scripts
export T=$F WT=$W
. "$S/env.sh"
OLD=$HOME/.local/share/cua-171/task72/build/accdc6c5601bc65f534cea448dbae216e4f34672/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
commit=$(git -C "$W" rev-parse --short=8 "$1")
cand=$2
shift 2
h=$F/harness-$commit
if [ ! -d "$h" ]; then
  bash "$S/export-harness.sh" "$commit" > "$F/export-$commit.log" 2>&1 || { echo "export failed"; exit 4; }
fi
status=0
for step in "$@"; do
  IFS='|' read -r name kind rest <<< "$step"
  read -r -a args <<< "$rest"
  rm -rf "$F/runs/$name"
  # an idle sitting starts once the previous holder's load has gone (the 1-minute load under 1.0, at most 5 minutes)
  if [[ "$rest" != *--load* ]]; then
    for k in $(seq 1 60); do awk '{exit !($1 < 1.0)}' /proc/loadavg && break; sleep 5; done
  fi
  echo "sitting $name starts $(date -u +%T) load=$(cut -d' ' -f1-3 /proc/loadavg)"
  case $kind in
    probe) "$S/probe.sh" "$h" "$name" "$cand" "${args[@]}" > "$F/$name.out" 2>&1 ;;
    probeold) "$S/probe.sh" "$h" "$name" "$OLD" "${args[@]}" > "$F/$name.out" 2>&1 ;;
    drag) "$S/private.sh" "$h" "$name" --experiment drag --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" --run "t72f-$name" "${args[@]}" > "$F/$name.out" 2>&1 ;;
    settle)
      guard
      mkdir -p "$F/runs/$name"
      (cd "$h" && node scripts/linux-engine-diff.mjs --experiment settle --cua "$cand" --out "$F/runs/$name" --run "t72f-$name" "${args[@]}") > "$F/$name.out" 2>&1 ;;
    *) echo "unknown kind $kind"; exit 2 ;;
  esac
  s=$?
  echo "sitting $name ($kind) exit $s $(date -u +%T)"
  [ "$s" = 0 ] || status=$s
done
exit $status
