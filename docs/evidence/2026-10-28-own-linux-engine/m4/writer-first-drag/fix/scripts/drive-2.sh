#!/bin/bash
# task 72 fix wave: T8's Writer settle cells on the corrected aim, searched from the 0 ms control, idle and at twice the
# load, on harness 114da008 and the engine of 7a965d12, each under the host lock
F=$HOME/.local/share/cua-171/task72fix
L=$HOME/.local/share/cua-171/locked.sh
H=114da008
C=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix-settle-idle|settle|--family writer'
echo "settle idle $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix-settle-load2|settle|--family writer --load --load-factor 2'
echo "settle load2 $?"
