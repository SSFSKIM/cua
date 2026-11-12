#!/bin/bash
# Task 73's third fix wave: tables.md from the sittings (scripts/table.mjs), to stdout.
cd /Users/new/.local/share/cua-171/task73fix3/runs || exit 1
t=../scripts/table.mjs
echo "# T17's third fix wave: the drop-signals tallies (scripts/table.mjs)"
echo
echo "## The counted sittings, 83dd7e5b's release build"
echo
node $t idle3=idle3/run/results.jsonl gate3=gate3/run/results.jsonl load3=load3/run/results.jsonl
echo
echo "## RED and GREEN"
echo
node $t red-slow=red-slow/run/results.jsonl red-moved=red-moved/run/results.jsonl green-moved-p3=green-moved-p3/run/results.jsonl green-slow=green-slow/run/results.jsonl green-moved=green-moved/run/results.jsonl
echo
echo "## The pilots"
echo
node $t pilot-slow=pilot-slow/run/results.jsonl pilot-moved=pilot-moved/run/results.jsonl pilot-fix3=pilot-fix3/run/results.jsonl
