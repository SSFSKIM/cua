#!/bin/bash
# task 72 fix wave: the confirmation of the drag settle at 25 ms on Writer's drag cell (the shipped lane, T8's rule),
# idle and at twice the load, on harness 9c6543b9 and the engine of 7a965d12, each under the host lock
F=$HOME/.local/share/cua-171/task72fix
L=$HOME/.local/share/cua-171/locked.sh
H=9c6543b9
C=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix-confirm-idle|settle|--family writer --kinds drag --lanes shipped'
echo "confirm idle $?"
"$L" task72fix timeout 2700 "$F/sit.sh" $H "$C" 'fix-confirm-load2|settle|--family writer --kinds drag --lanes shipped --load --load-factor 2'
echo "confirm load2 $?"
