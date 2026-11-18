#!/bin/bash
# Task 96: print each engine's drag answer in one events scenario from E1 records (read only).
# usage: scenario-rows.sh <scenario> <results.jsonl[.gz]>...
S=$1; shift
for f in "$@"; do
  echo "## $f"
  case "$f" in *.gz) gzip -dc "$f" ;; *) cat "$f" ;; esac | node -e '
const rows=require("fs").readFileSync(0,"utf8").trim().split("\n").map(JSON.parse);
for (const r of rows.filter(x=>x.kind==="events"&&x.scenario===process.argv[1])) {
  for (const [eng,recs] of Object.entries(r.records)) { const c=recs.find(s=>s.command==="drag"); if (c) console.log("  ", eng, "drag", JSON.stringify(c.answer), c.ms, "ms; events", (c.events||[]).map(e=>e.type).join("/"), "suffix", (c.suffix||[]).map(e=>e.type).join("/")); }
  console.log("   differences", JSON.stringify(r.differences).slice(0,300));
}' "$S"
done
