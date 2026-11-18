#!/bin/bash
# Task 96 (pre-flight §7.2's checks before the pilot, as amended for GCE): each read recorded, nothing changed.
set -u
D=/Users/new/.local/share/cua-171
ACC=$D/m5/pilot-arm64/home
R=$D/m5/pilot-arm64/install-home
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64
X() { DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 10 "$@"; }
echo "== $(date -u +%FT%TZ) checks on $(hostname)"
echo "-- uname -m: $(uname -m); kernel $(uname -r); $(lsb_release -ds); cores $(nproc); mem $(free -g | awk '/^Mem/{print $2" GB"}'); TZ $(timedatectl show -p Timezone --value 2>/dev/null)"
echo "-- the user: $(id); home $HOME; passwd home $(getent passwd "$(id -un)" | cut -d: -f6)"
echo "-- :0's session: $(loginctl list-sessions --no-legend | tr -s ' ' | tr '\n' ';')"
for s in $(loginctl list-sessions --no-legend | awk '{print $1}'); do echo "   session $s: $(loginctl show-session "$s" -p Name -p Display -p Type -p Class -p State -p Remote | tr '\n' ' ')"; done
echo "-- /dev/dri: $(ls /dev/dri 2>&1)"
echo "-- Xorg on :0: $(pgrep -a Xorg | cut -c1-200)"
xl=$(ls -t /var/log/Xorg.0.log "$HOME/.local/share/xorg/Xorg.0.log" 2>/dev/null | head -1)
echo "   log $xl"
grep -E 'LoadModule: "(dummy|modesetting|fbdev)"|\(II\) (DUMMY|modeset)\(0\)|Using config file|Using config directory|Virtual size|Output .* connected|Modeline "1280x800"' "$xl" 2>/dev/null | head -12 | sed 's/^/   /'
echo "   /etc/X11/xorg.conf.d: $(ls /etc/X11/xorg.conf.d 2>&1)"
X xdpyinfo | grep -E 'dimensions|resolution|depth of root|vendor string|vendor release|number of screens' | sed 's/^/   xdpyinfo: /'
X xrandr --query 2>&1 | head -3 | sed 's/^/   xrandr: /'
echo "   window manager: $(X xprop -root _NET_SUPPORTING_WM_CHECK 2>&1 | cut -c1-80); $(pgrep -a openbox | cut -c1-100)"
echo "   pointer: $(X xdotool getmouselocation 2>&1)"
echo "   windows on :0: $(X xdotool search --onlyvisible --name . 2>/dev/null | wc -l) visible"
for w in $(X xdotool search --onlyvisible --class google-chrome 2>/dev/null); do echo "   chrome window $w: $(X xprop -id "$w" WM_CLASS 2>&1) $(X xdotool getwindowgeometry "$w" 2>&1 | tr '\n' ' ')"; done
echo "   the owner-side Chrome (autostart, Default profile): $(pgrep -a -f 'chrome --profile-directory=Default' | head -2 | cut -c1-160 | tr '\n' ';')"
echo "-- AT-SPI: $(X dbus-send --session --print-reply --dest=org.a11y.Bus /org/a11y/bus org.freedesktop.DBus.Properties.Get string:org.a11y.Status string:IsEnabled 2>&1 | tail -1 | tr -s ' ')"
echo "-- Node: system $(command -v node) $(node --version); the run's $(PATH=$D/node24/bin:$PATH command -v node) $(PATH=$D/node24/bin:$PATH node --version)"
echo "-- Chrome: $(google-chrome --version) via $(command -v google-chrome); held: $(apt-mark showhold | tr '\n' ' '); policy $(cat /etc/opt/chrome/policies/managed/cua.json)"
echo "-- Firefox: $(PATH=$D/task59/bin:$PATH command -v firefox) -> $(readlink -f $D/task59/bin/firefox); $($D/task59/bin/firefox --version 2>&1)"
echo "-- snap browsers: $(snap list 2>/dev/null | awk 'NR>1{print $1}' | grep -E 'firefox|chromium' || echo none); on PATH: firefox=$(command -v firefox || echo none) chromium=$(command -v chromium chromium-browser 2>/dev/null || echo none)"
echo "-- engine: $(sha256sum "$ACC/engine/linux/cua-engine" | cut -d' ' -f1) $("$ACC/engine/linux/cua-engine" --version); $(file -b "$ACC/engine/linux/cua-engine" | cut -c1-90)"
echo "-- vendor builds:"
for b in "$ACC/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64" \
         "$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64" \
         "$D/vendor/deb-26.1111/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64"; do
  echo "   $(sha256sum "$b" | cut -c1-16)… $b"
done
echo "-- cua doctor (the pilot home, DISPLAY=:0, CUA_NATIVE_ENGINE=cua):"
cd "$G"
env -u CUA_LINUX_ENGINE_BIN PATH=$D/node24/bin:$PATH HOME="$R" XDG_CONFIG_HOME="$R/.config" XDG_DATA_HOME="$R/.local/share" XDG_STATE_HOME="$R/.local/state" \
  XDG_CACHE_HOME="$R/.cache" CUA_HOME="$ACC" CUA_NATIVE_ENGINE=cua DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority XDG_RUNTIME_DIR=/run/user/$(id -u) \
  node bin/cua.mjs doctor 2>&1 | sed 's/^/   /'
echo "   doctor exit ${PIPESTATUS[0]}"
echo "-- the secret store of the run home: $(ls -A "$R/.config/claude-secrets" | wc -l) entries"
echo "-- the host lock: $(tail -1 $D/host-lock.log | cut -c1-120); hold-sittings $([ -e $D/hold-sittings ] && echo PRESENT || echo absent)"
echo "-- /tmp/cua171-run-*: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
