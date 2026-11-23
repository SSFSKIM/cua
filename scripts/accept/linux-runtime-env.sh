#!/bin/bash
# The environment of M6a's live Linux runs (#171 M6a, T6; the M6a pre-flight §5.2, "The environment"), the same on both
# venues and shared by doctor, the applications and the serve. It runs one command inside:
#   - the run's homes and variables from linux-runtime-env.mjs: a fresh user HOME under <run dir>/user (its XDG
#     directories and an empty, 0700 ~/.config/claude-secrets), a fresh 0700 XDG_RUNTIME_DIR, a run-owned and fresh
#     CUA_HOME, and nothing of the caller's display, session bus, accessibility bus or session manager (app-env.mjs's
#     lists); it refuses CUA_SHIM_SANDBOX set, a reused HOME and a CUA_HOME outside the run or already there;
#   - a private X server (xvfb-run picks a free display from :99; never :0) with Openbox, which must come up: DISPLAY
#     and XAUTHORITY;
#   - a private session bus inside it (dbus-run-session), its address DBUS_SESSION_BUS_ADDRESS: a bare runner has none,
#     and installing D-Bus and AT-SPI starts none;
#   - accessibility turned on before any application starts, with doctor's own command (A11Y_ENABLE_COMMAND,
#     src/runtime/linux-desktop.mjs).
#
#   scripts/accept/linux-runtime-env.sh <run dir> -- <command> [args...]   exits with the command's status; 2 when the
#                                                                          environment cannot be made
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

case "${1:-}" in
  --display-stage)
    # Inside xvfb-run: Openbox, then the bus.
    shift; [ "$1" = -- ] && shift
    # xvfb-run folds the command's standard error into its output; the caller's standard error waits on fd 3.
    exec 2>&3 3>&-
    case "${DISPLAY:-}" in :0|:0.*|'') echo "linux-runtime-env: refusing display '${DISPLAY:-}': the run's display is private" >&2; exit 2 ;; esac
    openbox > "$XDG_RUNTIME_DIR/openbox.log" 2>&1 &
    wm=$!
    trap 'kill "$wm" 2>/dev/null || true' EXIT
    ready=
    for _ in $(seq 50); do
      if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id'; then ready=1; break; fi
      sleep 0.1
    done
    if [ -z "$ready" ]; then
      echo "linux-runtime-env: Openbox did not come up on $DISPLAY in 5 s (no _NET_SUPPORTING_WM_CHECK); its log:" >&2
      tail -n 20 "$XDG_RUNTIME_DIR/openbox.log" >&2 || true
      exit 2
    fi
    status=0
    dbus-run-session --dbus-daemon="$here/linux-runtime-env-daemon.sh" -- "$0" --bus-stage -- "$@" || status=$?
    exit "$status"
    ;;
  --bus-stage)
    # Inside the bus: accessibility on, then the command.
    shift; [ "$1" = -- ] && shift
    enable="$(node --input-type=module -e "import {A11Y_ENABLE_COMMAND} from '$repo/src/runtime/linux-desktop.mjs'; process.stdout.write(A11Y_ENABLE_COMMAND)")"
    # shellcheck disable=SC2086 # the command is doctor's, one word per argument, none quoted
    $enable > /dev/null
    exec "$@"
    ;;
esac

[ $# -ge 3 ] && [ "$2" = -- ] || { echo "usage: linux-runtime-env.sh <run dir> -- <command> [args...]" >&2; exit 2; }
run="$1"
shift 2
lines="$(node "$here/linux-runtime-env.mjs" "$run")" || exit 2
eval "$lines"
exec 3>&2
exec xvfb-run -a -s '-screen 0 1920x1080x24 -nolisten tcp' "$0" --display-stage -- "$@"
