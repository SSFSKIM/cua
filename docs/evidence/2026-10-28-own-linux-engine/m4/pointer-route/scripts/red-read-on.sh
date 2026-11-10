#!/bin/bash
# Task 71's fix wave: red-on.sh for a test that injects at the pointer's reads (`Identity::PointerRead`). The older
# commit's engine gets that variant and its hook at the top of `Engine::pointer_within` (a hook that runs a test's
# closure before the read and changes nothing else), then the test file and the one test, as red-on.sh does. Run it
# under the host lock.
# usage: red-read-on.sh <commit> <test file under src/engine/> <test name filter>
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
commit=$1
file=$2
filter=$3
root=$T/red/$commit-read
rm -rf "$root"
mkdir -p "$root"
git -C "$WT" archive "$commit" native/linux-engine | tar -x -C "$root"
e=$root/native/linux-engine
cp "$WT/native/linux-engine/src/engine/$file" "$e/src/engine/$file"
python3 -I - "$e" <<'EOF'
import sys
e = sys.argv[1]
def edit(path, a, b):
    p = f'{e}/{path}'
    s = open(p).read()
    assert a in s, (path, a)
    open(p, 'w').write(s.replace(a, b, 1))
edit('src/fault.rs', "    PointerSent,\n}", "    PointerSent,\n    /// the fix wave's RED: the hook alone, before each pointer read.\n    PointerRead,\n}")
edit('src/engine/way.rs', "    pub(super) fn pointer_within(&self, window: Window) -> bool {\n",
     "    pub(super) fn pointer_within(&self, window: Window) -> bool {\n        #[cfg(test)]\n        crate::fault::identity(crate::fault::Identity::PointerRead);\n")
EOF
cd "$e"
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --bin cua-engine -- --test-threads 1 "$filter"
