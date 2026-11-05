#!/bin/bash
# The _XEMBED_INFO survey (task 61, fix 2; the design session's ruling, 2026-11-05): which application families carry
# _XEMBED_INFO on their top-level windows and on the windows under them. Each application runs alone on a private
# Xvfb (xvfb-run -a, never :0) with Openbox, a session bus of its own, and a home and XDG directories of its own; a
# browser on a profile of the run's. dump-xembed.py lists every window of the application's X client.
# usage: survey.sh <out.jsonl> [label ...]
set -u
out=$1; shift
here=$(cd "$(dirname "$0")" && pwd)
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
quiet=$wt/native/linux-engine/tests/dbus-daemon-quiet
pages=$wt/scripts/linux-engine-diff/pages
old=$HOME/.local/share/cua-171/task61fix/probes
firefox=$HOME/.local/share/cua-171/task59/bin/firefox
electron=$wt/node_modules/electron/dist/electron
qt6v=$(dpkg-query -W -f '${Version}' libqt6core6t64 | cut -d+ -f1)
qt5v=$(dpkg-query -W -f '${Version}' libqt5core5t64 | cut -d+ -f1)
gtk3v=$(dpkg-query -W -f '${Version}' libgtk-3-0t64 | cut -d- -f1)
gtk4v=$(dpkg-query -W -f '${Version}' libgtk-4-1 | cut -d+ -f1)
apps=(
  "Qt 5 (PyQt5, native child)|$qt5v|python3 $old/native-control.py cua171-survey qt5|8"
  "Qt 6 (PyQt6, native child)|$qt6v|python3 $old/native-control.py cua171-survey qt6|8"
  "Qt 5 (kate)|$qt5v|kate|12"
  "Qt 6 (qtcreator)|$qt6v|qtcreator -settingspath SCRATCH/qtc|15"
  "Qt 6 (designer)|$qt6v|/usr/lib/qt6/bin/designer|10"
  "GTK 3 (window and modal dialog)|$gtk3v|python3 $old/gtk-modal.py cua171-survey gtk3|8"
  "GTK 4 (window and modal dialog)|$gtk4v|python3 $old/gtk-modal.py cua171-survey gtk4|10"
  "GTK 3 (gedit)|$gtk3v|gedit --standalone|10"
  "GTK 4 (gnome-text-editor)|$gtk4v|gnome-text-editor --standalone|12"
  "VTE (gnome-terminal)|$(dpkg-query -W -f '${Version}' gnome-terminal)|gnome-terminal|10"
  "Firefox (Mozilla deb)|$("$firefox" --version 2>/dev/null | awk '{print $3}')|$firefox --no-remote --new-instance --profile SCRATCH/profile file://$pages/matrix.html|25"
  "Chrome|$(google-chrome --version | awk '{print $3}')|google-chrome --user-data-dir=SCRATCH/profile --no-first-run --no-default-browser-check --password-store=basic file://$pages/matrix.html|20"
  "Electron (cua page app)|$(cat "$wt/node_modules/electron/dist/version")|$electron $pages/electron-page --cua-page=file://$pages/matrix.html --cua-user-data=SCRATCH/electron|20"
  "Java Swing (OpenJDK)|$(java -version 2>&1 | head -1 | awk -F'"' '{print $2}')|java $here/java/Survey.java swing|20"
  "Java AWT (OpenJDK)|$(java -version 2>&1 | head -1 | awk -F'"' '{print $2}')|java $here/java/Survey.java awt|20"
  "Tk (wish)|$(echo 'puts [info patchlevel]; exit' | tclsh)|wish $here/survey.tcl|8"
  "LibreOffice Writer (gtk3 VCL)|$(soffice --version | awk '{print $2}')|env SAL_USE_VCLPLUGIN=gtk3 soffice --writer --norestore|25"
  "LibreOffice Writer (gen VCL, X11)|$(soffice --version | awk '{print $2}')|env SAL_USE_VCLPLUGIN=gen soffice --writer --norestore|25"
  "xterm (Xaw)|$(xterm -version)|xterm|5"
)
for entry in "${apps[@]}"; do
  IFS='|' read -r label version cmd settle <<<"$entry"
  if [ $# -gt 0 ]; then
    want=0; for l in "$@"; do [ "$label" = "$l" ] && want=1; done
    [ $want = 1 ] || continue
  fi
  scratch=$(mktemp -d /tmp/cua171-survey-XXXXXX)
  mkdir -p "$scratch"/{config,data,cache,state,profile,electron,qtc}
  cmd=${cmd//SCRATCH/$scratch}
  HOME=$scratch XDG_CONFIG_HOME=$scratch/config XDG_DATA_HOME=$scratch/data XDG_CACHE_HOME=$scratch/cache \
    XDG_STATE_HOME=$scratch/state GSETTINGS_BACKEND=memory GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb \
    timeout 150 xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$quiet" -- bash -c '
      openbox --sm-disable >/dev/null 2>&1 &
      sleep 1
      setsid $3 >/dev/null 2>&1 &
      app=$!
      for _ in $(seq 120); do
        n=$(xprop -root _NET_CLIENT_LIST 2>/dev/null | grep -o "0x[0-9a-f]*" | wc -l)
        [ "$n" -gt 0 ] && break; sleep 0.5
      done
      sleep $4
      python3 "$5" "$1" "$2"
      kill -TERM -$app 2>/dev/null; sleep 1; kill -KILL -$app 2>/dev/null
      kill %1 2>/dev/null; true' _ "$label" "$version" "$cmd" "$settle" "$here/dump-xembed.py" >> "$out" 2>/dev/null
  rm -rf "$scratch"
done
