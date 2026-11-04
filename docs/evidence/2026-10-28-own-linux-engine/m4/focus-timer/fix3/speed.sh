#!/bin/bash
# Task 56 fix 3's paste speed series, idle, on a private Xvfb with Openbox (priv-run.mjs): the differential run's text
# scenes whose paste the fix touches, gedit (GTK 3, flagged), chrome-textarea (Chromium, the sync alone) and
# gnome-text-editor (GTK 4, flagged; dedicated), against the pinned and newest vendor builds, on the musl build of
# 391c6395, --dev. Then the same run's ops on the musl build of 3c99d1fe's engine (418f1e26, before fix 3), for the
# fix's own cost apart from the bar.
set -u
t=/Users/new/.local/share/cua-171/task56-fix3
c=391c63958ea82d5a4eb636a51218d8fbad2bcc50
h=$t/live/$c
b=/Users/new/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
old=/Users/new/.local/share/cua-171/task56/build/418f1e267ca01a43e213f3116545241045dec178/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
VENDOR=/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
cd "$t" || exit 2
for which in ${WHICH:-new old}; do
  bin=$b; [ "$which" = old ] && bin=$old
  out=$t/runs/speed${TAG:-}-$which
  mkdir -p "$out"
  timeout 7200 node priv-run.mjs "$h" "$out" -- --dev --vendor "$VENDOR" --newest "$NEWEST" --cua "$bin" \
    --scene ${SCENES:-gedit,chrome-textarea,gnome-text-editor} --ops ${OPS:-type_text,type_text_selection,clipboard_write} \
    --run "t56-fix3-speed${TAG:-}-$which" --out "$out/run" > "$out/run.log" 2>&1
  echo "speed $which exit $? $(date +%T)"
done
