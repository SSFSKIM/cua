#!/bin/bash
# Task 103: the live proof's outputs, from the two D1 pilots (switch off, opt-in on). Run from the worktree.
# usage: collect.sh   (writes proof/out/*)
set -u
T=/Users/new/.local/share/cua-171/task103
P=$T/proof
O=$P/out
rm -rf "$O" "$P/copyA" "$P/copyB"
mkdir -p "$O"
OFF=$T/out-off/D1.development-run.pilot
ON=$T/out-on/D1.development-run.pilot

echo "== settle-check, switch off" > "$O/checker.txt"
node scripts/linux-engine-gate/settle-check.mjs "$OFF" >> "$O/checker.txt"; echo "exit $?" >> "$O/checker.txt"
echo "== settle-check, opt-in" >> "$O/checker.txt"
node scripts/linux-engine-gate/settle-check.mjs "$ON" >> "$O/checker.txt"; echo "exit $?" >> "$O/checker.txt"

# the judge and report twice over the opt-in run's records: as recorded, and with the stats files and the record removed
cp -a "$ON/run" "$P/copyA"
cp -a "$ON/run" "$P/copyB"
rm -rf "$P/copyB/engine-stats" "$P/copyB/settle-counts.json"
HEAD_HARNESS=scripts/linux-engine-diff RUN_DIR=$P/copyA node "$P/judge-report.mjs" > "$O/judge-report.recorded.txt" 2>&1
HEAD_HARNESS=scripts/linux-engine-diff RUN_DIR=$P/copyB node "$P/judge-report.mjs" > "$O/judge-report.stats-removed.txt" 2>&1
{
  echo "== files in each copy"
  (cd "$P/copyA" && find . -type f | sort) | sed 's/^/recorded: /'
  (cd "$P/copyB" && find . -type f | sort) | sed 's/^/stats removed: /'
  echo "== sha256"
  sha256sum "$O/judge-report.recorded.txt" "$O/judge-report.stats-removed.txt"
  if cmp "$O/judge-report.recorded.txt" "$O/judge-report.stats-removed.txt"; then echo "judge and report: BYTE-IDENTICAL"; else echo "judge and report: DIFFERENT"; fi
  echo "== summary.md written by the run itself vs each copy's"
  sha256sum "$ON/run/summary.md" "$P/copyA/summary.md" "$P/copyB/summary.md"
} > "$O/identity.txt"

# the parsed stream carries no stats line: the run's rows, its logs, and the step's own stdout and stderr
{
  for f in "$ON/run/results.jsonl" "$ON/stdout.log" "$ON/stderr.log" "$OFF/run/results.jsonl"; do
    [ -e "$f" ] || { echo "$f: absent"; continue; }
    echo "$f: lines $(wc -l < "$f"), drop_settles $(grep -c drop_settles "$f"), '{\"stats\"' $(grep -c '{"stats"' "$f"), engine_stats $(grep -c engine_stats "$f"), untied_stats $(grep -c untied_stats "$f")"
  done
  echo "== the opt-in run's stats files"
  for f in "$ON"/run/engine-stats/*; do echo "$(basename "$f"): $(wc -l < "$f") lines, last drop_settles $(grep -o '"drop_settles":{[^}]*}' "$f" | tail -1)"; done
  echo "== row keys of drag-run rows, off vs on (the same set)"
  for d in "$OFF" "$ON"; do node -e 'const fs=require("fs");const k=new Set();for(const l of fs.readFileSync(process.argv[1],"utf8").trim().split("\n")){const r=JSON.parse(l);if(r.kind==="drag-run")Object.keys(r).forEach(x=>k.add(x))}console.log([...k].sort().join(","))' "$d/run/results.jsonl"; done
} > "$O/stream.txt"

# each engine of each run: lane, pid, build, argv, stats, lines, counter, what was sent
for m in off on; do
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const p of r.processes) for (const e of p.engines) console.log([e.lane, e.pid, e.build, JSON.stringify(e.argv.slice(1)), e.stats, e.lines, JSON.stringify(e.drop_settles), e.recorded, "ended=" + e.ended, "final=" + e.final, JSON.stringify(e.sent)].join("\t"));
  ' "$T/out-$m/D1.development-run.pilot/run/settle-counts.json" > "$O/engines-$m.tsv"
done
cat "$O/checker.txt" "$O/identity.txt"
