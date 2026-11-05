#!/bin/bash
# Task 61's sittings on the final build, one after the other (each refuses to start beside another stress-ng):
# the idle control, every kind at twice the load, and click-then-paste through the focus-timer experiment at twice the
# load on the final engine and on the engine before task 61 (the judge's and the audits' check).
set -u
here=$(dirname "$0")
. "$here/paths.sh"
final=c595f4f67c7b540d2d81261aeba6c41bbdd1510c
before=6dbc0057603f387946231006b7f54cf99ae767bb
h=c595f4f6
bash "$here/qt-sitting.sh" final-idle "$h" "$final" pinned,released,shipped,control click kate,qtcreator 0
bash "$here/qt-sitting.sh" final-load2 "$h" "$final" pinned,released,shipped,control click,key-click,press_key,drag,scroll kate,qtcreator 2
for spec in shipped=$final before=$before; do
  label=${spec%%=*}
  bash "$here/sitting.sh" "$T61/harness-$h" "click-paste-$label-load2" --experiment focus-timer --cua "$(musl "${spec#*=}")" \
    --lanes shipped --scenarios click-paste --family kate,qtcreator --load-factor 2
done
