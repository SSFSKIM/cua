#!/bin/bash
# Task 130: one traced drop-signals run on x64, on a private display of its own (never :0), under the host lock
# (holder task130-x64). Every engine's X connections go through xtrace with timestamps.
# usage: trace-x64.sh <name> <trials> <load factor|0> [extra harness args]
set -u
D=/Users/new/.local/share/cua-171
T=$D/task130
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t130-a959
name=$1; trials=$2; load=$3; shift 3
OUT=$T/x64/$name
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { echo "disk ${f}G"; exit 9; }
[ -e "$OUT" ] && { echo "$OUT exists"; exit 2; }
mkdir -p "$OUT/traces"
export T130_TRACE_DIR=$OUT/traces
export T130_BIN_pinned=$D/m5/home-x64-042/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
export T130_BIN_newest=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
export T130_BIN_cua=${T130_BIN_cua:-$D/m5/home-x64-042/engine/linux/cua-engine}
L=()
[ "$load" != 0 ] && L=(--load-factor "$load")
cd "$W" || exit 2
"$D/locked.sh" task130-x64 env CUA_HOME="$D/m5/home-x64-042" PATH="$D/task59/bin:$PATH" \
  timeout -s TERM -k 60 45m node "$T/t130-run.mjs" "$W" "$OUT" --experiment drop-signals --family chrome \
  --plan t14-long-vendor --trials "$trials" "${L[@]}" --engine-stats \
  --vendor "$T/bin/trace-pinned" --newest "$T/bin/trace-newest" --cua "$T/bin/trace-cua" "$@" --run "dev-t130-$name"
