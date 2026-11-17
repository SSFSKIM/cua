#!/bin/bash
# task 72 fix wave: the idle sittings whose acquire found another holder's load, again (the brief's rule), on harness
# e4dda851 and the engine of 7a965d12, each under the host lock; sit.sh now starts each once the load has gone
F=$HOME/.local/share/cua-171/task72fix
L=$HOME/.local/share/cua-171/locked.sh
H=e4dda851
C=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
N=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" \
  'fix2-element|probe|--plan element --trials 3' \
  'fix2-element-old|probeold|--plan element --trials 3 --family writer-root,calc' \
  'fix2-hierarchy|probe|--plan hierarchy --trials 2 --family impress'
echo "step 1 $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" "fix2-first|probe|--plan first --newest $N"
echo "step 2 $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix2-drag-writer|drag|--family writer --ops select,select-unprimed --trials 10'
echo "step 3 $?"
