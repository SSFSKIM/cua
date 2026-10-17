#!/bin/sh
# The mini's frontmost application after a run (the own-sandbox spec's Decision Log, "native runs on the mini"): prints
# its bundle id and exits 1 when it is a system prompt only the owner can answer (UserNotificationCenter,
# SecurityAgent, CoreServicesUIAgent), so the sequence stops there.
front=$(ssh -o BatchMode=yes mini 'lsappinfo info -only bundleid "$(lsappinfo front)"' | sed -n 's/.*bundleID="\(.*\)".*/\1/p')
echo "$(date -u +%FT%TZ) front=${front:-unknown}"
case "$front" in
  com.apple.UserNotificationCenter|com.apple.SecurityAgent|com.apple.coreservices.uiagent) exit 1 ;;
esac
exit 0
