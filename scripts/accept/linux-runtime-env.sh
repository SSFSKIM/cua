#!/bin/bash
# The environment of M6a's live Linux runs (#171 M6a, T6; the M6a pre-flight §5.2, "The environment"), the same on both
# venues and shared by doctor, the applications and the serve. It runs one command inside:
#   - a home of the run's: HOME, the XDG directories and an empty ~/.config/claude-secrets under <run dir>/user, and
#     CUA_HOME there unless the caller names one;
#   - XDG_RUNTIME_DIR, a directory of the run's, mode 0700;
#   - a private X server (xvfb-run picks a free display from :99; never :0) with Openbox: DISPLAY and XAUTHORITY;
#   - a private session bus inside it (dbus-run-session), its address DBUS_SESSION_BUS_ADDRESS: a bare runner has none,
#     and installing D-Bus and AT-SPI starts none;
#   - accessibility turned on before any application starts, with doctor's own command (A11Y_ENABLE_COMMAND,
#     src/runtime/linux-desktop.mjs);
#   - CUA_SHIM_SANDBOX unset, so the sandbox mode is `scoped`: the wrapper refuses to start with it set.
# Nothing of the caller's desktop passes in: DISPLAY, XAUTHORITY, the bus address and WAYLAND_DISPLAY are unset first.
#
#   scripts/accept/linux-runtime-env.sh <run dir> -- <command> [args...]   exits with the command's status
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
    for _ in $(seq 50); do xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && break; sleep 0.1; done
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
[ -z "${CUA_SHIM_SANDBOX+set}" ] || { echo "linux-runtime-env: CUA_SHIM_SANDBOX is set ('$CUA_SHIM_SANDBOX'); these runs are scoped, so it must be unset" >&2; exit 2; }
mkdir -p "$1"
run="$(cd "$1" && pwd)"
shift 2
user="$run/user"
mkdir -p "$user/.config/claude-secrets" "$user/.local/share" "$user/.local/state" "$user/.cache"
mkdir -p -m 0700 "$run/xdg-runtime"
chmod 0700 "$run/xdg-runtime" "$user/.config/claude-secrets"
unset DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS WAYLAND_DISPLAY
export HOME="$user" XDG_CONFIG_HOME="$user/.config" XDG_DATA_HOME="$user/.local/share" XDG_STATE_HOME="$user/.local/state" \
  XDG_CACHE_HOME="$user/.cache" XDG_RUNTIME_DIR="$run/xdg-runtime" CUA_HOME="${CUA_HOME:-$user/.local/share/cua}"
exec 3>&2
exec xvfb-run -a -s '-screen 0 1920x1080x24 -nolisten tcp' "$0" --display-stage -- "$@"
