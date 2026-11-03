# #171 task 44: the repro's one way to an X server, sourced by its scripts. `start_own_x` starts an Xvfb of the
# script's own with -displayfd, so the display is the server's choice and never one another server (a person's) has,
# and sets DISPLAY to it only once that server named it and is alive; anything else exits the script before anything
# reaches a display. `mark_private` sets the private mark on that display and reads it back, and `require_private`
# refuses a display without it. The load and the RECORD client refuse an unmarked display on their own too (flood's
# fence test; xprobe record-run). XVFB (default Xvfb) names the server binary, for the fence test.

PRIVATE_MARK=CUA171_PRIVATE_DISPLAY

# start_own_x [log]: an Xvfb of the script's own; sets OWN_XVFB (its pid) and exports DISPLAY, or exits 2.
start_own_x() {
  local log="${1:-/dev/null}" dir n
  dir=$(mktemp -d)
  "${XVFB:-Xvfb}" -displayfd 3 -noreset -nolisten tcp -screen 0 1280x800x24 3>"$dir/display" >"$log" 2>&1 &
  OWN_XVFB=$!
  for _ in $(seq 100); do
    # a complete line: the number and its newline (a command substitution drops a trailing newline)
    if [ -s "$dir/display" ] && [ -z "$(tail -c1 "$dir/display")" ]; then break; fi
    kill -0 "$OWN_XVFB" 2>/dev/null || { echo "the X server did not start (see $log); nothing was run" >&2; rm -rf "$dir"; exit 2; }
    sleep 0.1
  done
  n=$(head -n1 "$dir/display" 2>/dev/null)
  rm -rf "$dir"
  if ! [[ "$n" =~ ^[0-9]+$ ]] || ! kill -0 "$OWN_XVFB" 2>/dev/null; then
    kill -KILL "$OWN_XVFB" 2>/dev/null
    echo "the X server named no display (${n:-nothing}); nothing was run" >&2
    exit 2
  fi
  export DISPLAY=":$n"
}

# require_private: exits 2 unless DISPLAY's root carries the private mark.
require_private() {
  timeout 5 xprop -root "$PRIVATE_MARK" 2>/dev/null | grep -q "^$PRIVATE_MARK(STRING) = \"1\"" || {
    echo "refusing $DISPLAY: it is not marked $PRIVATE_MARK, so it may be a person's display" >&2
    exit 2
  }
}

# mark_private: the mark set on DISPLAY (a server of the script's own, start_own_x) and read back.
mark_private() {
  timeout 5 xprop -root -f "$PRIVATE_MARK" 8s -set "$PRIVATE_MARK" 1
  require_private
}
