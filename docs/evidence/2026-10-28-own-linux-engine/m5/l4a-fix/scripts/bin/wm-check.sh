#!/bin/bash
# Task 98 (the controller's point 1): what an unsolicited _NET_WM_PING answer does under the VMs' window manager. On a
# private Xvfb of its own, Openbox runs with its debug output on, and the engine's live test of the sync runs beside
# it: a window that answers pings sends each answer to the root, where Openbox reads it. The check prints Openbox's
# own lines for those answers ("Got PONG with id ... but not waiting for one": it drops them), whether Openbox is still
# the window manager after them, and the test's result. Run under the host lock.
# usage: wm-check.sh <checkout>
set -u
G=$1
D=/Users/new/.local/share/cua-171
OUT=$D/task98/out/wm-check
mkdir -p "$OUT"
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: nothing starts"; exit 5; }
cd "$G/native/linux-engine" || exit 2
unset DISPLAY XAUTHORITY
cat > "$OUT/inner.sh" <<EOF
#!/bin/bash
openbox --debug > "$OUT/openbox.log" 2>&1 &
OB=\$!
for i in \$(seq 1 50); do xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && break; sleep 0.1; done
echo "display \$DISPLAY; window manager before: \$(xprop -root _NET_SUPPORTING_WM_CHECK | cut -c1-80)"
"$D/bin/cargo" test --features live --bin cua-engine -- --test-threads 1 a_sync_is_answered 2>&1 | grep -E '^test |test result'
code=\${PIPESTATUS[0]}
sleep 1
echo "window manager after: \$(xprop -root _NET_SUPPORTING_WM_CHECK | cut -c1-80); openbox alive: \$(kill -0 \$OB 2>/dev/null && echo yes || echo no)"
kill \$OB 2>/dev/null
exit \$code
EOF
chmod +x "$OUT/inner.sh"
"$D/locked.sh" m5-l4a timeout -s TERM -k 120 20m xvfb-run -a dbus-run-session --dbus-daemon="$G/native/linux-engine/tests/dbus-daemon-quiet" -- "$OUT/inner.sh"
code=$?
echo "openbox's lines about pings: $(grep -ci 'pong' "$OUT/openbox.log")"
grep -i 'pong' "$OUT/openbox.log" | head -4
exit $code
