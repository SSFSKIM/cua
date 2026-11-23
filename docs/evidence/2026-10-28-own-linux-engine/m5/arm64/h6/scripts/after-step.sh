#!/bin/bash
# Task 122 (from task 109's): what is read from a :0 step's directory right after it ends, display-free and read-only (sitting.sh runs it
# after each step): (1) its audit rows' kept traces (rulings 858(b), 863): how many audit rows, how many carry
# `kept_traces` with files, the files' count and whether each exists; (2) `rejudge-audit.mjs` over the step dir, which
# must reproduce the stored findings (every run: moved 0, unkept 0, not incomplete, foreign now = stored); (3) the
# settle counter (`settle-check.mjs`). Counts and the scripts' own lines only.
# usage: after-step.sh <step dir> <out file>
set -u
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6
S=$1; F=$2
{
  echo "== after-step $(date -u +%FT%TZ) $S"
  echo "--- kept traces"
  node -e '
    const fs = require("fs"), path = require("path"), zlib = require("zlib");
    const dir = process.argv[1];
    let file = ["run/results.jsonl", "run/results.jsonl.gz"].map((p) => path.join(dir, p)).find(fs.existsSync);
    if (!file) { console.log("no results.jsonl"); process.exit(1); }
    let b = fs.readFileSync(file); if (file.endsWith(".gz")) b = zlib.gunzipSync(b);
    const rows = b.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const audits = rows.filter((r) => r.kind === "audit");
    const withFiles = audits.filter((r) => r.kept_traces?.files?.length);
    const files = withFiles.flatMap((r) => r.kept_traces.files);
    const missing = files.filter((f) => !fs.existsSync(path.join(path.dirname(file), f)));
    const unkept = audits.filter((r) => !r.kept_traces?.files?.length).map((r) => `${r.engine} ${r.scene} ${r.op}: ${r.kept_traces?.reason ?? "no kept_traces"}`);
    console.log(`audit rows ${audits.length}, with kept_traces files ${withFiles.length}, files ${files.length}, missing ${missing.length}`);
    for (const u of unkept) console.log(`  unkept: ${u}`);
    process.exit(audits.length && withFiles.length === audits.length && !missing.length ? 0 : 1);
  ' "$S"
  echo "kept-traces exit $?"
  echo "--- rejudge-audit"
  node "$G/scripts/linux-engine-diff/rejudge-audit.mjs" "$S" > "$F.rejudge.jsonl"
  c=$?
  echo "rejudge-audit exit $c"
  node -e '
    const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const runs = lines.filter((l) => "audits" in l);
    const rows = lines.filter((l) => !("audits" in l));
    let same = true;
    for (const r of runs) {
      const eq = r.moved === 0 && r.unkept === 0 && !r.incomplete && r.foreign_now.length === r.foreign_stored;
      same &&= eq;
      console.log(`run ${r.run}: audits ${r.audits}, moved ${r.moved}, unkept ${r.unkept}, incomplete ${r.incomplete ?? "no"}, foreign stored ${r.foreign_stored}, now ${r.foreign_now.length}: ${eq ? "reproduces" : "DIFFERS"}`);
    }
    console.log(`row lines (moved or unkept): ${rows.length}`);
    console.log(runs.length && same && !rows.length ? "rejudge: reproduces the stored findings" : "rejudge: DIFFERS from the stored findings");
  ' "$F.rejudge.jsonl"
  echo "--- settle-check"
  node "$G/scripts/linux-engine-gate/settle-check.mjs" "$S"
  echo "settle-check exit $?"
} > "$F" 2>&1
