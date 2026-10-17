# Part 2: the cua-remote skill flow against `repl-m5t5r1-mini-browser` (2026-10-17, 00:19–00:22 UTC)

Client: this Mac's installed cua plugin (0.11.0) `cua_repl` server, through its tools, as `skills/cua-remote/SKILL.md`
Part B describes. The device was added with `node bin/cua.mjs devices add repl-m5t5r1-mini-browser --relay
https://178-104-102-73.sslip.io --device Vu5kX8vUd7cYoR6CwjG_-w`; `devices list --json` showed `credentialStored:true`
before the endpoint started. Each step below is quoted from the tool result (safe fields only).

| Step | Result |
|---|---|
| `devices_list` | `repl-m5t5r1-mini-browser` `online`; `mini` (resident) `online`; current `local` |
| `devices_use repl-m5t5r1-mini-browser` | `status: ok`, previous `local`; the returned js description is the owned facade's (no `iab`/`mcpapps` rows, "Native computer APIs are disabled."): browser-only surfaces |
| `profiles_list` | `ssfs` `ready:true`, extensionInstanceId `3b45d47c-…` (the prepared binding) |
| js: `cua.getBrowser({extensionInstanceId})` | first-use documentation; selected browser `Service: cua browser service 0.1.0` |
| js: `createBrowserTab(..., "http://127.0.0.1:48741/")` | harness-owned one-page loopback fixture on the mini (tracked PID, stopped afterwards); initial state `heading "ready"`, `button "Press"` |
| js: observe / act / verify | `{"before":"ready","after":"clicked","verified":true}` (locator textContent, getByRole click, textContent) |
| `js_reset` | `js kernel reset` |
| js after reset | fresh bootstrap documentation emitted again; `{"tabBound":false,"browserBound":false}` |
| `devices_use local` with the task open | refused: `a task is open on repl-m5t5r1-mini-browser: call end_task there first, then devices_use` `{"status":"error","code":"task_open"}` |
| `end_task` | `{"status":"ended","ended":true}` |
| `devices_use local` | `status: ok`, previous `repl-m5t5r1-mini-browser` |

The proof tab was already gone when rebinding after the reset (`Tab not found`): agent-created tabs are ephemeral in the
cua browser service.

Elicitation: not exercised live through this endpoint. On a browser-only own-host route with cua's browser service no
production code issues `elicitation/create`: the cua browser service "asks for no approvals of its own" (its selected
browser documentation), `nodeRepl.createElicitation` is a privileged worker API that cells cannot reach, secrets are off on
the endpoint and its trusted services are the production ones. An elicitation would also open a dialog in the owner's
Claude Code session, which an unattended executor may not answer. The relay leg is covered by
`test/mcp-devices.test.mjs` ("an elicitation from the device reaches the local client as cua-device-<n>, and its answer
returns under the device's id, unchanged") and the own host's accept/decline/cancel by the services suite (M2–M5).

Host attestation: the plugin's `devices_use` passes on only the device's `instructions` (src/mcp/target.mjs), not its
`serverInfo`, and Claude Code does not show tool-result `_meta` to the model (the getBrowser result above, saved by the
client, has no `_meta` or `cua/replHost`). The endpoint's answering host is attested by the harness: `attestations/start-cua.json`
(initialize `cua-repl-host 0.5.0`, a real js result with `_meta['cua/replHost'] {host:'cua',version:'0.5.0'}`, the managed
Node witness `<home>/node/24.22.0/bin/node` v24.22.0 under the owned agent), and by `samples/part2.jsonl`: every sample of
the owned agent's subtree during this flow shows 1 cua supervisor and 0 vendor node_repl/launcher processes whenever a
session runtime (anchor) was live.

Resident endpoint `mini` (vendor-routed, not own-host proof): `devices_use mini` returned the vendor facade's js
description (`iab`, `mcpapps` rows); one js cell `nodeRepl.write("resident-check")` (no UI API) returned the vendor
first-call document (`target: "linux" | "mac" | "windows"`, Orbit text) and `resident-check`; `samples/resident-check.jsonl`
taken during that session shows the resident agent's subtree with 1 vendor node_repl, 1 vendor launcher, 0 cua supervisors.
`end_task` ended, then `devices_use local`. The resident agent and checkout were otherwise untouched.
