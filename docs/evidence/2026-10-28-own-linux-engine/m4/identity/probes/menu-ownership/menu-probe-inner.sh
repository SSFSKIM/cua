#!/usr/bin/env bash
# Inside dbus-run-session on a private Xvfb: a fresh Chrome (its own profile) on a two-paragraph page; one web node's
# showContextMenu; then what the accessibility bus says about the menu that opened: where it hangs, its relations.
set -u
ENGINE="$1"
OUT="$2"
export DISPLAY=:97
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.freedesktop.DBus.Properties.Set org.a11y.Status IsEnabled '<true>' >/dev/null
A11Y=$(gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.a11y.Bus.GetAddress | sed -E "s/^\('(.*)',\)$/\1/")
echo "a11y $A11Y" > "$OUT/log.txt"
PROFILE=$(mktemp -d)
google-chrome --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --force-renderer-accessibility \
  --window-position=0,0 --window-size=800,600 \
  "data:text/html,<title>menu-probe</title><p id=a>alpha paragraph text</p><p>beta paragraph</p>" \
  >"$OUT/chrome.stderr" 2>&1 &
CHROME=$!
sleep 6; ls -la /run/user/501/at-spi/ >> "$OUT/log.txt"
call() { gdbus call --address "$A11Y" "$@"; }
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | "$ENGINE" server > "$OUT/windows.json" 2>/dev/null
WID=$(python3 -I -c 'import json,sys; w=json.loads(open(sys.argv[1]).readline())["output"]; print([x["id"] for x in w if "menu-probe" in x.get("title","")][0])' "$OUT/windows.json")
echo "window $WID" >> "$OUT/log.txt"
printf '{"id":1,"command":"get_window_state","input":{"window":{"id":%s},"include_screenshot":false}}\n' "$WID" | "$ENGINE" server > "$OUT/state.json" 2>/dev/null
python3 -I - "$OUT/state.json" > "$OUT/target.txt" <<'EOF'
import json, sys
s = json.loads(open(sys.argv[1]).readline())["output"]
def walk(n):
    yield n
    for c in n.get("children", []):
        yield from walk(c)
for n in walk(s["ax_tree"]):
    acts = n.get("actions") or []
    if n.get("role") in ("paragraph",) and any(a.lower() == "showcontextmenu" for a in acts):
        idx = [a.lower() for a in acts].index("showcontextmenu")
        print(n["id"], idx, n.get("role"), n.get("name"))
        break
EOF
cat "$OUT/target.txt" >> "$OUT/log.txt"
read -r ID IDX _ < "$OUT/target.txt"
BUS="${ID%%:/*}"; PATH_="/${ID#*:/}"
echo "bus $BUS path $PATH_ idx $IDX" >> "$OUT/log.txt"
ROOT=/org/a11y/atspi/accessible/root
call --dest "$BUS" --object-path "$ROOT" --method org.a11y.atspi.Accessible.GetChildren > "$OUT/children-before.txt"
call --dest "$BUS" --object-path "$PATH_" --method org.a11y.atspi.Action.DoAction "$IDX" >> "$OUT/log.txt"
sleep 1.5
call --dest "$BUS" --object-path "$ROOT" --method org.a11y.atspi.Accessible.GetChildren > "$OUT/children-after.txt"
python3 -I - "$OUT/children-before.txt" "$OUT/children-after.txt" > "$OUT/new.txt" <<'EOF'
import re, sys
paths = lambda f: re.findall(r"'(/org/a11y/atspi/accessible/[^']+)'", open(f).read())
before = set(paths(sys.argv[1]))
for p in paths(sys.argv[2]):
    if p not in before: print(p)
EOF
echo "--- new app children" >> "$OUT/log.txt"
cat "$OUT/new.txt" >> "$OUT/log.txt"
describe() {
  local p="$1" depth="$2"
  {
    echo "== $p (depth $depth)"
    echo -n "role: "; call --dest "$BUS" --object-path "$p" --method org.a11y.atspi.Accessible.GetRoleName
    echo -n "name: "; call --dest "$BUS" --object-path "$p" --method org.freedesktop.DBus.Properties.Get org.a11y.atspi.Accessible Name
    echo -n "parent: "; call --dest "$BUS" --object-path "$p" --method org.freedesktop.DBus.Properties.Get org.a11y.atspi.Accessible Parent
    echo -n "relations: "; call --dest "$BUS" --object-path "$p" --method org.a11y.atspi.Accessible.GetRelationSet
    echo -n "attributes: "; call --dest "$BUS" --object-path "$p" --method org.a11y.atspi.Accessible.GetAttributes
    echo -n "extents: "; call --dest "$BUS" --object-path "$p" --method org.a11y.atspi.Component.GetExtents 0
  } >> "$OUT/log.txt" 2>&1
  if [ "$depth" -lt 3 ]; then
    for c in $(call --dest "$BUS" --object-path "$p" --method org.a11y.atspi.Accessible.GetChildren | grep -o "/org/a11y/atspi/accessible/[^']*"); do
      describe "$c" $((depth + 1))
    done
  fi
}
for p in $(cat "$OUT/new.txt"); do describe "$p" 0; done
echo "--- the target element's relations" >> "$OUT/log.txt"
call --dest "$BUS" --object-path "$PATH_" --method org.a11y.atspi.Accessible.GetRelationSet >> "$OUT/log.txt" 2>&1
echo "--- the frame's relations" >> "$OUT/log.txt"
for c in $(cat "$OUT/children-before.txt" | grep -o "/org/a11y/atspi/accessible/[^']*"); do
  { echo "frame $c"; call --dest "$BUS" --object-path "$c" --method org.a11y.atspi.Accessible.GetRelationSet; } >> "$OUT/log.txt" 2>&1
done
echo "--- X11 override-redirect windows" >> "$OUT/log.txt"
for w in $(xwininfo -root -children | grep -o '0x[0-9a-f]*' | tail -n +2); do
  if xwininfo -id "$w" -all 2>/dev/null | grep -q 'Override Redirect State: yes'; then
    if xwininfo -id "$w" | grep -q 'Map State: IsViewable'; then
      { echo "or $w"; xprop -id "$w" WM_TRANSIENT_FOR _NET_WM_WINDOW_TYPE WM_CLASS 2>&1; xwininfo -id "$w" | grep -E 'Absolute|Width|Height'; } >> "$OUT/log.txt"
    fi
  fi
done
kill "$CHROME" 2>/dev/null; pkill -f "^/opt/google/chrome/chrome .*user-data-dir=$PROFILE"; sleep 1
rm -rf "$PROFILE"
