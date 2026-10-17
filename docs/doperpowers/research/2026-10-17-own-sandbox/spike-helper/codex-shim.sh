#!/bin/bash
# cua #115 spike shim: logs each invocation, then forwards to the relocated CodexCLI.app codex, or (mode refuse)
# refuses `app-server`. The mode is read from ./mode beside this script at each invocation.
D="$(cd "$(dirname "$0")" && pwd)"
REAL="$HOME/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex"
LOG="$D/../shim.log"
MODE="$(cat "$D/mode" 2>/dev/null || echo forward)"
NOW="$(/usr/bin/perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03d", strftime("%Y-%m-%dT%H:%M:%S", localtime $t), ($t-int $t)*1000')"
PCMD="$(/bin/ps -o command= -p "$PPID" 2>/dev/null | /usr/bin/cut -c1-240)"
ARGV="$(printf '%q ' "$@" | /usr/bin/cut -c1-600)"
printf '%s mode=%s pid=%s ppid=%s parent=[%s] cwd=%s CODEX_HOME=%s argv=%s\n' "$NOW" "$MODE" "$$" "$PPID" "$PCMD" "$PWD" "${CODEX_HOME-<unset>}" "$ARGV" >> "$LOG"
if [ "$MODE" = refuse ] && [ "$1" = app-server ]; then
  echo "cua codex launcher: app-server is not supported (spike refuse mode)" >&2
  exit 1
fi
if [ "$1" = app-server ]; then
  # Forwarded app-server: the helper's requests (method names only) and the responses' shape (id, result keys or the
  # error message) are logged; payload values are not. Then the exit status and duration.
  T0="$(/usr/bin/perl -MTime::HiRes=time -e 'print time')"
  FILTER_IN='$|=1; print STDOUT $_; if (/"method"\s*:\s*"([^"]+)"/) { my $m = $1; my $id = /"id"\s*:\s*(\d+)/ ? $1 : "-"; open L, ">>", $ENV{SPIKE_LOG}; print L "  $ENV{SPIKE_PID} helper->app-server id=$id method=$m\n"; close L }'
  FILTER_OUT='$|=1; print STDOUT $_; my $id = /^\{"id"\s*:\s*(\d+)/ || /"id"\s*:\s*(\d+)/ ? $1 : "-"; my $what = /"error"\s*:\s*\{.*?"message"\s*:\s*"([^"]*)"/ ? "error=$1" : /"result"\s*:\s*\{(.{0,300})/ ? "result: " . join(",", ($1 =~ /"([A-Za-z_]+)"\s*:/g)) : /"method"\s*:\s*"([^"]+)"/ ? "notification/request method=$1" : "other"; open L, ">>", $ENV{SPIKE_LOG}; print L "  $ENV{SPIKE_PID} app-server->helper id=$id $what\n"; close L'
  export SPIKE_LOG="$LOG" SPIKE_PID="$$"
  /usr/bin/perl -ne "$FILTER_IN" | "$REAL" "$@" | /usr/bin/perl -ne "$FILTER_OUT"
  RC=("${PIPESTATUS[@]}")
  T1="$(/usr/bin/perl -MTime::HiRes=time -e 'print time')"
  printf '  %s app-server exit=%s (filters %s/%s) after %.3f s\n' "$$" "${RC[1]}" "${RC[0]}" "${RC[2]}" "$(echo "$T1 - $T0" | /usr/bin/bc -l)" >> "$LOG"
  exit "${RC[1]}"
fi
exec "$REAL" "$@"
