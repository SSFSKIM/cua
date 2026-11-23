#!/bin/bash
# RED for the shim's stderr write: a shim whose stderr reader is gone, after a release it could not make (no display).
# usage: stderr-gone.sh <engine>
E=$1
t=$(mktemp -d)
prog='{ printf '"'"'cuaH\001\001\000\000\001\062'"'"'; head -c 118 /dev/zero; } > "$CUA_ENGINE_HELD_RECORD"; sleep 0.2; exit 3'
env -u DISPLAY TMPDIR="$t" "$E" launcher-shim $$ sh -c "$prog" 2>&1 >/dev/null | true
echo "the shim's status: ${PIPESTATUS[0]}"
env -u DISPLAY TMPDIR="$t" "$E" launcher-shim $$ sh -c "$prog" 2>&1 >/dev/null | cat
echo "with its stderr read: ${PIPESTATUS[0]}"
rmdir "$t"
