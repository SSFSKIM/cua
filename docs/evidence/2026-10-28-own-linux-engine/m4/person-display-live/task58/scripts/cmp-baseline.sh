#!/bin/bash
# compares two owner-check readings, leaving out times, mtimes and socket listings
f() { grep -v '^==\|^mtime\|^bus_0\|x socket\|^chrome-named' "$1"; }
diff <(f "$1") <(f "$2") && echo "same (apart from times, mtimes and sockets)"
