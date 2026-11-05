#!/usr/bin/env bash
# The release build's resolved features (x86_64 and aarch64 musl, no dev edges), before (380b132b) and after (HEAD).
set -eu
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
OUT="$HOME/.local/share/cua-171/task27/feature-graph"
mkdir -p "$OUT"
for target in x86_64-unknown-linux-musl aarch64-unknown-linux-musl; do
  for side in before after; do
    if [ "$side" = before ]; then m="$HOME/.local/share/cua-171/task27/before-380b132b/native/linux-engine/Cargo.toml"; else m="$WT/native/linux-engine/Cargo.toml"; fi
    cargo tree --offline --locked --manifest-path "$m" --target "$target" -e no-dev --prefix none --format '{p} [{f}]' \
      | sed -e 's# (/[^)]*)##' | sort -u > "$OUT/$side-$target.txt"
  done
  echo "== $target: before vs after (no output means identical)"
  diff "$OUT/before-$target.txt" "$OUT/after-$target.txt" || true
  echo "== $target after: x11rb and rustix"
  grep -e '^x11rb ' -e '^rustix ' "$OUT/after-$target.txt"
done
