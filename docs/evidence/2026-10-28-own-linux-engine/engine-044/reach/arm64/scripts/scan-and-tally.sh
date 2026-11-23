#!/bin/bash
# Task 147: the evidence's scans saved beside it (token-shaped strings; key codes, with no :0 title list since nothing
# connected to :0), and item 1's settle rests tallied per step from the committed rows.
set -u
T=/Users/new/.local/share/cua-171/task147
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h9-reach-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/arm64
bash "$T/scan-evidence.sh" "$E" > "$T/scan-token.txt"; echo "token scan exit $?"
printf '' | node "$T/privacy-scan.mjs" "$E" > "$T/privacy-scan.txt"
cp "$T/scan-token.txt" "$T/privacy-scan.txt" "$E/scripts/"
cat "$E/scripts/scan-token.txt"; tail -1 "$E/scripts/privacy-scan.txt"
for s in H1 H2 L4a; do
  zcat "$E/out/$s.pinned-release/run/results.jsonl.gz" | node -e '
    const rows = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((r) => r.kind === "drop-signal");
    const by = {}, fam = {};
    for (const r of rows) { const s = r.drop_cursor?.settle ?? r.handle?.drop_cursor?.settle; const k = s ? String(s.rest_ms) : "none"; by[k] = (by[k] || 0) + 1; fam[r.family] = (fam[r.family] || 0) + 1; }
    console.log(`${process.argv[1]}: ${rows.length} drop rows ${JSON.stringify(fam)}; rest_ms of the settle records ${JSON.stringify(by)}`);' "$s"
done | tee "$E/out/settle-rests.txt"
