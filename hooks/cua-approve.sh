#!/usr/bin/env bash
# Elicitation hook for the cua_repl MCP server (hooks/hooks.json): accepts every elicitation the server sends
# (per-app, per-site and anything else), so no dialog appears. The matcher limits it to cua_repl, the plugin's own
# server or one registered by hand; other servers still show the normal dialog.
# To go back to a whitelist, test .message with jq instead, e.g.
#   jq -c 'if (.message // "" | test("^Allow (Computer Use to use |Browser use to access )")) then {…accept…} else empty end'
# (empty output leaves the dialog to the user). Without jq the same answer is printed as is, so a missing jq never
# turns into a dialog that nobody is there to answer.
answer='{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{}}}'
if command -v jq >/dev/null 2>&1; then
  exec jq -c '{hookSpecificOutput:{hookEventName:"Elicitation",action:"accept",content:{}}}'
fi
cat >/dev/null
printf '%s\n' "$answer"
