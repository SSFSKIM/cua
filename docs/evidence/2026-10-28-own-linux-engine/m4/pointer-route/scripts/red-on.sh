#!/bin/bash
# Task 71: a new in-crate test run against an older commit's engine, to show it fails there (RED): the commit's
# native/linux-engine exported apart, the test file copied in with the module line and the fault hook's variant it
# needs (the hook itself is not wired there, so the test sees the old behaviour), then that one test with the gate's
# flags under xvfb. Run it under the host lock.
# usage: red-on.sh <commit> <test file under src/engine/> <test name filter>
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
commit=$1
file=$2
filter=$3
root=$T/red/$commit
rm -rf "$root"
mkdir -p "$root"
git -C "$WT" archive "$commit" native/linux-engine | tar -x -C "$root"
e=$root/native/linux-engine
cp "$WT/native/linux-engine/src/engine/$file" "$e/src/engine/$file"
mod=${file%.rs}
printf '#[cfg(test)]\nmod %s;\n' "$mod" >> "$e/src/engine.rs"
python3 -I - "$e/src/fault.rs" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
a = "    MenuLookup,\n}"
assert a in s
s = s.replace(a, "    MenuLookup,\n    /// task 71's RED: the variant alone, never reached in this commit's engine.\n    PointerSent,\n}", 1)
open(p, 'w').write(s)
EOF
cd "$e"
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --bin cua-engine -- --test-threads 1 "$filter"
