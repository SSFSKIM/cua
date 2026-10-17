#!/usr/bin/env bash
# Runs the function-hook mods' tests. `claude plugin test <dir>` takes a
# plugin folder and runs every *.test.ts under it; the mods and their tests
# are staged as a copy in a plugin folder of their own, so the run sees only
# the hooks module (not the MCP server the real manifest starts) and the
# repository's own node tests stay with `npm test` (the runner refuses
# symlinks as path traversal).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

mkdir -p "$stage/.claude-plugin" "$stage/hooks" "$stage/tests"
printf '{ "name": "cua-mods", "version": "0.0.0" }\n' > "$stage/.claude-plugin/plugin.json"
printf '{ "modules": ["./mods/register.tsx"] }\n' > "$stage/hooks/hooks.json"
cp -R "$root/hooks/mods" "$stage/hooks/mods"
cp -R "$root/tests/mods" "$stage/tests/mods"

claude plugin test "$stage"

# The vendored guard's Bash restoration rule, proved by execution under bash and
# zsh (tests/mods/guard/shell-exec.ts, run by bun: it starts processes, which a
# kit test does not).
for need in bun /bin/bash /bin/zsh; do
  command -v "$need" >/dev/null || { echo "the mods tests need $need" >&2; exit 1; }
done
bun "$root/tests/mods/guard/shell-exec.ts"
