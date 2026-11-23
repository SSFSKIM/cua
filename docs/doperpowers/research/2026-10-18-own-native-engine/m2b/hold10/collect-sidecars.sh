#!/bin/bash
set -euo pipefail
source /Users/new/.claude/jobs/1ea561bc/tmp/117/hold10-20261023-184-188/env.sh
label=${1:?phase label}
run=${2:-$R}
case "$label" in *[!A-Za-z0-9_-]*) exit 2;; esac
for file in activation-guards finder-steps; do
  ssh -o BatchMode=yes mini "cat '$run/$file.jsonl'" > "$O/$label-$file-all.jsonl"
done
node --input-type=module -e 'import fs from "node:fs";const [root,label]=process.argv.slice(1);for(const name of ["activation-guards","finder-steps"]){const p=`${root}/${label}-${name}`;const rows=fs.readFileSync(p+"-all.jsonl","utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter(r=>r.at>=Date.parse("2026-10-23T21:24:00Z"));fs.writeFileSync(p+".jsonl",rows.map(r=>JSON.stringify(r)).join("\n")+"\n");console.log(`${name}: ${rows.length} current-hold records`);}' "$O" "$label"
