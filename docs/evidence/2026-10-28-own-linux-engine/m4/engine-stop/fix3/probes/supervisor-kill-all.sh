#!/bin/bash
# The supervisor-kill probes: fix 2's head (d80f5719, exported), the fix-3 head, and the host before T7b (f59575fb),
# each held/unheld, sandboxed and disabled.
d=<probes>
wt=<worktree>
B=$d/build/d4f1faee820fed776fa160f54fc864519663702c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
old=$d/tree-d80f5719
if [ ! -d "$old" ]; then
  mkdir -p "$old"
  git -C "$wt" archive d80f5719 bin src package.json runtime | tar -x -C "$old"
  ln -s "$wt/node_modules" "$old/node_modules"
fi
control=~/.local/share/cua-171/task57/control-f59575fb
for mode in held unheld; do
  for sb in scoped disabled; do
    extra=(); [ $sb = disabled ] && extra=(CUA_SHIM_SANDBOX=disabled)
    for t in head:$wt fix2:$old pre-t7b:$control; do
      name=${t%%:*}; root=${t#*:}
      bash $d/probe-supervisor-kill.sh $name-$mode-$sb "$root" "$B" $mode "${extra[@]}" | grep -E 'summary|before the kill|keys after|stopped after'
    done
  done
done
