#!/usr/bin/env bash
# Stands in for xprobe record-run in repro-stall.sh (REC=this): flood's `slowrec`, reading as fast as data comes, with
# $CONTEXTS contexts (1: everything on one; 2: errors on their own, xprobe's shape). Its arguments are ignored. Like
# every flood mode it refuses a display not marked private (task 44).
HERE=$(cd "$(dirname "$0")" && pwd)
echo '{"kind":"ready","ms":0}'
exec "${FLOOD:-$HERE/flood/target/release/task41-flood}" slowrec "${CONTEXTS:-2}" 65536 0 0
