#!/bin/bash
# task 72 fix wave: the counted sittings on harness 114da008 and the engine of 7a965d12, each step under the host lock
# (at most 45 minutes each). Each step's own output is in $F/<name>.out and its run in $F/runs/<name>.
F=$HOME/.local/share/cua-171/task72fix
L=$HOME/.local/share/cua-171/locked.sh
H=114da008
C=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" \
  'fix-element|probe|--plan element --trials 3' \
  'fix-element-old|probeold|--plan element --trials 3 --family writer-root,calc' \
  'fix-hierarchy|probe|--plan hierarchy --trials 2 --family impress'
echo "step 1 $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" "fix-first|probe|--plan first --newest $HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
echo "step 2 $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix-drag-writer|drag|--family writer --ops select,select-unprimed --trials 10'
echo "step 3 $?"
