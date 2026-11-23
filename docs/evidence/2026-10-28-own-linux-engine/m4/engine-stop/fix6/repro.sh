#!/bin/bash
# The reviewer's two reproducers on a private Xvfb.  usage: repro.sh <label> <engine>
d=<fix5>
mkdir -p "$d/probes"
for which in final-record kill-failure; do
  out=$d/probes/repro-$which-$1.log
  echo "stress-ng: $(pgrep -c -x stress-ng)" > "$out"
  timeout 60 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" node <review>/task57-review5-$which.mjs "$2" >> "$out" 2>&1
  echo "exit $?" >> "$out"
  node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").find(x=>x.startsWith("{"));if(!l){console.log(process.argv[2],"no result");process.exit()}const j=JSON.parse(l);console.log(process.argv[2],JSON.stringify({exit:j.exit,writer:j.writer,keysAfterShim:j.keysAfterShim,shim:j.shimStderr}))' "$out" "$which"
done
