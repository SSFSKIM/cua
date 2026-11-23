#!/bin/bash
# task 121 (ruling 931.4): the engine's late-take tests fail when the after-release watch is shortened below the take
# time or removed. A copy of native/linux-engine (the worktree's own is never changed), mutated, the two live tests run
# as ci-gate's engine-linux runs them (--features live, a private Xvfb, its own session bus). The output is the record.
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
M=$T/mutation
rm -rf "$M/src-copy"
mkdir -p "$M"
rsync -a --exclude target "$repo/native/linux-engine/" "$M/src-copy/"
cd "$M/src-copy"
export CARGO_TARGET_DIR=$M/target
TESTS="a_take_up_to_700_ms_after_a_plain_drag_s_release_is_reported_and_one_later_is_not a_late_take_into_a_chromium_window_the_engine_lets_drop_is_cancelled_on_the_drag_s_route_and_reported_by_every_reply"
run_tests() {
  local name=$1
  echo "=== $name: $(grep -n 'pub const LATE_TAKE_WATCH' src/dnd.rs) / $(grep -n -A2 'pub fn late_watch_end' src/dnd.rs | tail -2 | tr '\n' ' ')"
  for t in $TESTS; do
    CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
      cargo test --release --locked --features live --test live_device -- --exact "$t" --test-threads 1 > "$M/$name.$t.log" 2>&1
    echo "$name $t exit $?"
    grep -E "^test |panicked|assertion|left:|right:|test result" "$M/$name.$t.log" | head -12
  done
}
cp src/dnd.rs "$M/dnd.rs.orig"
run_tests baseline
sed -i 's/pub const LATE_TAKE_WATCH: Duration = Duration::from_millis(700);/pub const LATE_TAKE_WATCH: Duration = Duration::from_millis(400);/' src/dnd.rs
run_tests shortened-400
cp "$M/dnd.rs.orig" src/dnd.rs
python3 - <<'PY'
p='src/dnd.rs'
s=open(p).read()
old="""    let end = released + LATE_TAKE_WATCH;
    held_until.map_or(end, |held| end.max(held + SETTLE))"""
new="""    let _ = (LATE_TAKE_WATCH, held_until);
    released"""
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
run_tests removed
cp "$M/dnd.rs.orig" src/dnd.rs
diff -q "$M/dnd.rs.orig" "$repo/native/linux-engine/src/dnd.rs" && echo "the worktree's dnd.rs untouched"
