#!/bin/bash
# a scratch private Xvfb: can a second slave pointer join the core master?
set -u
Xvfb :173 -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb173.log 2>&1 &
xp=$!
sleep 1
export DISPLAY=:173
xinput list
xinput create-master probe
id=$(xinput list --id-only 'probe XTEST pointer')
echo "probe xtest id=$id"
xinput reattach "$id" 'Virtual core pointer'; echo "reattach rc=$?"
xinput list
kill $xp
