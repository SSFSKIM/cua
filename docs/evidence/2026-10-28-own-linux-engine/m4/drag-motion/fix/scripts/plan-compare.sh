#!/bin/bash
# The drag plans (pointer.rs drag_plan, resting and not) of every path the recorded drag sittings sent, on two
# commits' sources: the planning functions are cut from each commit's pointer.rs as they stand, compiled side by side,
# and run on the same paths. Writes paths.tsv and plans.tsv to the out dir; prints the summary; exit 0 when every
# plan is equal.
# usage: plan-compare.sh <old commit> <new commit|worktree> <out dir> <results.jsonl.gz...>
set -euo pipefail
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
old=$1; new=$2; out=$3; shift 3
mkdir -p "$out"
src() {
  if [ "$1" = worktree ]; then cat "$wt/native/linux-engine/src/engine/pointer.rs"
  else git -C "$wt" show "$1:native/linux-engine/src/engine/pointer.rs"; fi
}
cut_plan() {  # from drag_samples' doc comment to the line before rests_before's doc comment
  python3 -I -c '
import sys
s = sys.stdin.read()
a = s.index("/// Every pointer sample a drag visits after its press")
b = s.index("/// Whether a drag rests before its sample")
print(s[a:b])'
}
{
  echo '#![allow(dead_code)]'
  echo 'mod old {'; src "$old" | cut_plan; echo '}'
  echo 'mod new {'; src "$new" | cut_plan; echo '}'
  cat <<'RS'
use std::io::BufRead;
fn main() {
    let (mut paths, mut differ) = (0, 0);
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let (label, pts) = line.split_once('\t').unwrap();
        let points: Vec<(i16, i16)> = pts
            .split(' ')
            .map(|p| {
                let (x, y) = p.split_once(',').unwrap();
                (x.parse().unwrap(), y.parse().unwrap())
            })
            .collect();
        paths += 1;
        let mut same = true;
        for rests in [false, true] {
            let (a, b) = (old::drag_plan(&points, rests), new::drag_plan(&points, rests));
            if a.samples != b.samples || a.rests != b.rests {
                same = false;
            }
        }
        let p = new::drag_plan(&points, true);
        println!(
            "{}\t{label}\t{pts}\tsamples {}\trests {:?}",
            if same { "same" } else { "DIFFER" },
            p.samples.len(),
            p.rests
        );
        if !same {
            differ += 1;
        }
    }
    println!("{paths} distinct paths, {differ} with a different plan");
    std::process::exit(if differ == 0 { 0 } else { 1 });
}
RS
} > "$out/compare.rs"
rustc --edition 2024 -O -o "$out/compare" "$out/compare.rs"
python3 -I - "$@" > "$out/paths.tsv" <<'PY'
import sys, gzip, json
seen = {}
for f in sys.argv[1:]:
    with gzip.open(f, "rt") as fh:
        for line in fh:
            r = json.loads(line)
            if r.get("kind") != "drag-run" or not r.get("path") or str(r.get("drag", "")).startswith("handle"):
                continue
            key = " ".join(f"{p['x']},{p['y']}" for p in r["path"])
            seen.setdefault(key, f"{r['family']}:{r['drag']}")
for key, label in seen.items():
    print(f"{label}\t{key}")
PY
"$out/compare" < "$out/paths.tsv" > "$out/plans.tsv"
tail -n 1 "$out/plans.tsv"
