# Device multiplexing (Phase G): one server drives every device, live on the two Macs through the hosted relay

Acceptance items 13 to 18 of `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md` (Phase G, issue #70), on
the standing setup of `docs/evidence/2026-10-06-hosted-relay-acceptance.md` and
`docs/evidence/2026-10-07-reverse-remote-acceptance.md`: the relay `https://178-104-102-73.sslip.io` (Hetzner, Caddy in
front, unit `cua-relay`), the mini enrolled as `nuadM-MUKSbSN4L59EffLQ` and the MacBook as `jMTkLnzn-rsbzoZAHJ8EbQ`,
both launchd agents connected and running `main` (`d1ab9dd`), untouched throughout. The client side ran the branch
`feat/device-multiplexing` (the MacBook's worktree `cua-wt-70`, and on the mini a detached worktree of the same head
beside its main checkout) through a temporary MCP config registering the worktree's `cua-shim.mjs` as `cua_repl` with
`CUA_SHIM_SURFACES=computer,browser`, driven by Claude Code 2.1.292:

```sh
claude -p --strict-mcp-config --mcp-config /tmp/g70-accept.mcp.json --allowedTools mcp__cua_repl \
  --output-format stream-json --verbose '<prompt>' > /tmp/g70-run-<n>.jsonl
```

App and site approvals were answered by the cua plugin's own `Elicitation` hook (matcher
`cua_repl|plugin:cua:cua_repl`, installed on both Macs), which matches the temporary server's name. Date 2026-10-07,
times UTC. The MacBook ran node v22.23.2, the mini nvm's node v24.18.0 and `~/.local/bin/claude`.

**Verdict: PASS, after one fix the live run required** (`54603ef`, below). Items 13 to 18 passed in both directions,
item 15 included both times (one relay restart per direction). Two attempts of item 14's Chrome step failed on the
mini while its network was degraded and then cut for about ten minutes; the run after it came back passed whole.

## The fix the run required: notes the model never saw

In the first item 14 run (04:40), `devices_use mini` answered and every tool moved to the mini, but the model reported
"no host notes came back". The answer's text carried them; the model never saw the text. Claude Code 2.1.292 maps a
successful MCP result that has `structuredContent` to the JSON of that structured content alone, dropping every text
block (`cli.pretty.js`: `if (e.structuredContent == null) return G(e.content); return [...non-text blocks, {type:
"text", text: JSON(structuredContent)}]`); the stream-json transcript shows the tool result as
`{"status":"ok","device":"mini","previous":"local"}` while `tool_use_result` still held the full answer. Error results
keep their text, which is why `task_open` read in full.

`54603ef` puts what the model must read in the structured content too: `devices_use` answers
`{status, device, previous, note, hostNotes}` for a device and `{status, device: "local", previous, note}` for the way
back (the text keeps the note and the notes once, plus a JSON line of the three fields), and a lazily opened device
session's "new session, REPL state is fresh" note is added as `"cua/note"` to a device result that has structured
content (a routed `profiles_list` or `secrets_list`; a `js` result has none, so its text note was already seen).
Tests: `test/mcp-devices.test.mjs` asserts both views; the suite stayed 777 pass, 0 fail, 1 skipped. From the next
run on, the model quoted the mini's first notes line, `UI automation through cua_repl using the initialized cua API.`

## 13. Registry (MacBook)

```
$ node bin/cua.mjs devices import ~/.config/cua-relay/mini.mcp.json
registered mini: device nuadM-MUKSbSN4L59EffLQ on https://178-104-102-73.sslip.io; credential stored under CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ
$ node bin/cua.mjs devices import ~/.config/cua-relay/mini.mcp.json        # again
already registered mini: device nuadM-MUKSbSN4L59EffLQ on https://178-104-102-73.sslip.io; credential unchanged under CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ
$ node bin/cua.mjs devices list
mini  nuadM-MUKSbSN4L59EffLQ  https://178-104-102-73.sslip.io  credential stored
```

`--json` forms: `{"entry": "unchanged", "credential": "unchanged", "clientSecretKey": "CUA_DEVICE_nuadM_…"}` and
`{"devices": [{"name": "mini", …, "credentialStored": true}]}`. `~/.config/cua/devices.json` came out 0600 in a 0700
directory. The client credential, read from the client config inside a counting script and never printed, occurs 0
times in the captured output of every command above.

## 14. MacBook → mini, one session

Run `14c`, 05:01:49 to 05:04:03 (136 s, 21 turns):

| Step | Answer |
|---|---|
| `devices_list` | `{"status":"ok","current":"local","devices":[{"name":"local","status":"online"},{"name":"mini","deviceId":"nuadM-MUKSbSN4L59EffLQ","relay":"https://178-104-102-73.sslip.io","status":"online"}]}` |
| `devices_use mini` | `{"status":"ok","device":"mini","previous":"local","note":"cua: every tool (js, js_reset, end_task, secrets_list, profiles_list) now drives mini, …","hostNotes":"UI automation through cua_repl using the initialized cua API. …"}` |
| TextEdit on the mini | new document, plain text, marker typed; read back `텍스트 엔트리 영역 (settable) Value: G70-MINI-185539, ID: First Text View`; closed with 삭제 (Don't Save) |
| Chrome on the mini | `profiles_list`: `school` ready (`34e8eab6-…`); bound by that id; `example.com` opened, title `Example Domain`; tab closed (0 tabs of the session left) |
| `devices_use local` before `end_task` | `cua: a task is open on mini: call end_task there first, then devices_use` / `{"status":"error","code":"task_open"}` |
| `end_task` | `{"status":"ended","ended":true,"taskId":"8d6d80c9-…"}` |
| `devices_use local` | `{"status":"ok","device":"local","previous":"mini","note":"cua: every tool now drives this machine (local) again, …"}` |
| local `js` | `SK.local` (the MacBook), through `await import('node:os')` (`require` is not defined in the REPL) |

The mini's agent: one session, `a31b42e6…`, two approvals answered (`elicitation/create 0 answered accept after 4706
ms`, `1 … after 1203 ms`: the local client's hook, through the relay and the local server), then `closed (eof, code
0)`: the device session's `DELETE` after `end_task` (Caddy: `DELETE 200`). The mini's `$CUA_HOME/run` held no entry of
any acceptance session afterwards (two new entries there belonged to an interactive `claude --resume` on the mini,
started 05:01:33, whose own `cua serve` processes own them).

**The two attempts before it.** Run `14` (04:40) passed every step but Chrome: `nameSession`, `createBrowserTab` and
`tabs.list()` on the mini all failed `Unable to load browser request-header policy. Retry the browser command.`, which
the vendor's browser service throws when its Statsig client fails to initialize (a network fetch on the mini). Run `14b`
(04:49, with the fix) failed the same step with `nodeRepl.fetch request failed`, its first `getState()` timed out at 30
s, and its `devices_list` read the mini `offline` `timeout` (Caddy: that probe `POST 499` after 2.77 s, the client
having given up at 3 s). The model in that run saw a page in the mini's Chrome reporting that reCAPTCHA could not
connect. From about 04:59 the mini did not answer on its tailnet address at all (SSH and ping timed out; Tailscale
listed it offline) until 05:01:10. Between those runs the standalone route (item 18, 04:49) opened the same tab on the
mini without error. Every other step of `14` and `14b` passed as in `14c`.

## 15. Resumption across a relay restart (MacBook → mini)

Before the restart, Caddy's log over the preceding 30 minutes held only this acceptance's requests (84, all on
`/d/nuadM…`) and the relay's journal no client activity of anyone else. Run `15`: `devices_use mini`, then
one `js` of `await new Promise(r => setTimeout(r, 45000))` with `timeout_ms` 150000. A watcher restarted the relay
(`systemctl restart cua-relay`, once) 12 s after the call was issued.

```
05:04:56.795  js issued (stream-json)
05:05:12.892  cua-relay: SIGTERM: closing / both devices offline (1006) / restarted, listening 05:05:13.120
05:05:15.786  cua-relay: device nuadM-MUKSbSN4L59EffLQ online           # mini agent: "relay: connection lost (code 1006); retrying in 1 s", "reconnected"
Caddy  05:05:12.894  POST  aborting with incomplete response           # the js call's stream, cut
Caddy  05:05:13.706  GET 503  Last-Event-Id: 1-0                         # device not back yet
Caddy  05:05:14.891  GET 503  Last-Event-Id: 1-0
Caddy  05:05:42.827  GET 200  Last-Event-Id: 1-0, 25.7 s                 # the resumed stream, carrying the answer
05:05:43.080  js result in the same call; _meta {"codex/nodeReplExecutionDurationMs": 45196, "cua/device": "mini"}
```

No second `initialize` reached the device (the only POSTs were the initialize, `initialized`, the cut `js`, then
`end_task`), and the agent logged one session, closed by the `DELETE` after `end_task`. The result was the device
runtime's answer to that very cell (its 45.2 s execution time in `_meta`); its text was the API document, which the
pinned runtime returns in place of a fresh REPL's first cell's value, so the cell's own marker was not printed (the
mini→MacBook run below put a `getState()` first).

## 16. Reserved keys on the local target (MacBook)

Run `16`, 04:58:24 to 04:59:31:

- `secrets_list`: `{"status":"ok","labels":[]}`. The store then held one key, `CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ` (`cua
  secrets list` in the terminal shows it), so the omission is the whole answer; the mini's run below shows an ordinary
  key listed beside an omitted one.
- TextEdit, new plain-text document, text view focused, `typeText("{{secret:CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ}}")`:
  `cua: keys starting CUA_DEVICE_ are device credentials, which are never entered; nothing was entered
  [secret_reserved]`. The text view read back with no value; the document was closed unsaved; `end_task` `ended`.
- The mini's client credential occurs 0 times in every stream-json output and stderr of this acceptance (`14`, `14b`,
  `14c`, `15`, `16`, `18`) and in each run's Claude Code transcript (`~/.claude/projects/-private-tmp-g4-run*/`), counted
  with `grep -c -F` against the value read from `~/.config/cua-relay/mini.mcp.json` inside the command. The MacBook's
  own client credential (from `macbook.mcp.json`) occurs 0 times in the same files.

## 17. Mini → MacBook

On the mini, in a detached worktree of the branch head (`54603ef`) beside its main checkout, which stayed on `main`:

- **13.** `devices import ~/.config/cua-relay/macbook.mcp.json`: `registered macbook: device jMTkLnzn-rsbzoZAHJ8EbQ on
  https://178-104-102-73.sslip.io; credential stored under CUA_DEVICE_jMTkLnzn_rsbzoZAHJ8EbQ`; again: `entry`
  `unchanged`, `credential` `unchanged`; `devices list`: `macbook … credential stored`. Credential count in the output: 0.
- **14.** 05:09:15 to 05:11:45 (150 s, 21 turns): `devices_list` `macbook` `online`, `current` `local`; `devices_use
  macbook` ok with its notes; TextEdit on the MacBook read back `Value: G70-MACBOOK-822997`, closed unsaved; Chrome
  profile `school` (`af96e8b8-…`) bound, `example.com` opened, title `Example Domain`, closed; `devices_use local` before
  `end_task` refused `task_open`; after `end_task`, `devices_use local` ok and the local `js` read `Mac-mini.local`. The
  MacBook's agent: one session `0cf21ec0…`, two approvals answered (989 and 910 ms), `closed (eof, code 0)`; the
  MacBook's `run/` gained no entry. The model sent `end_task` and `devices_use local` in parallel there; the switch
  waited for the `end_task` in flight and then succeeded, as designed.
- **16.** 05:12:10 to 05:13:39, on the mini's local target: `secrets_list` `{"status":"ok","labels":["UCSD_PASSWORD"]}`
  (the store also holds `CUA_DEVICE_jMTkLnzn_rsbzoZAHJ8EbQ`, omitted); `typeText("{{secret:CUA_DEVICE_jMTkLnzn_
  rsbzoZAHJ8EbQ}}")` into a TextEdit document on the mini refused `secret_reserved`, the text view empty, closed unsaved.
- **15.** No client traffic on the relay since the previous run (Caddy, 05:11:50 to 05:14:03, empty). Run 05:14:34 to
  05:16:44: `devices_use macbook`, `getState()`, then the 45 s cell, issued 05:15:14.378; the relay restarted at
  05:15:32.70 (about 18 s in: the watcher read the mini's transcript over SSH, which was slow again); the MacBook's agent
  `connection lost (code 1006); retrying in 1 s` / `reconnected`; Caddy `POST` cut at 05:15:32.706, `GET 503
  Last-Event-Id: 2-0` at 05:15:33.431, `GET 200 Last-Event-Id: 2-0` (25.1 s) ending 05:16:00.406; the result arrived in
  the same call at 05:16:00.552 with `codex/nodeReplExecutionDurationMs` 45039 (`completed with no output`: the cell's
  last expression is not echoed). One session on the MacBook, closed by the `DELETE` after `end_task`.
- The MacBook's client credential occurs 0 times in the mini's stream-json outputs, their stderr and the three
  transcripts (`~/.claude/projects/-private-tmp-g4m-run*/`).

## 18. Regression

- `npm test`: 778 tests, 777 pass, 0 fail, 1 skipped (704 before Phase G).
- The standalone registration, `claude -p --strict-mcp-config --mcp-config ~/.config/cua-relay/mini.mcp.json` as it
  is, 04:49:11 to 04:49:40: `js` read `Mac-mini.local`; `profiles_list`, `school` bound, `example.com` opened (title
  `Example Domain`) and closed; `end_task` `ended`. As before, `claude -p` sent no `DELETE`: its session
  (`fdb3aee7…`) was evicted, being Idle, by the next run's `initialize`.

## Observations

- A device that is slow to answer reads `offline` `timeout` in `devices_list` while `devices_use` still works (14b):
  the probe's 3 s bound covers the relay round trip and the device's answer, so a congested device can read offline
  for that moment. The status is the probe's, at that instant.
- Device approvals reach the local client and are answered by its hook in 0.9 to 4.7 s through the relay; the
  standalone route's are answered in about 0.4 s. The extra time is the local Claude Code's hook run and one more hop.
- The MacBook's screen was locked when the run began (doctor's `agent.console fail`, `IOConsoleLocked` true); the live
  steps waited until it was unlocked. Before that, from 03:53 to 04:00, the relay's journal showed its agent
  reconnecting repeatedly (`two pings without a pong`; `ENETUNREACH` in the agent's log) while its network was away;
  it was steady during the runs.
- The pinned runtime returns the API document in place of the value of a fresh REPL's first cell, so after each
  `devices_use` (a new session) the first `js` should be an entry-point call; the models did this on their own except
  where the prompt dictated the first cell (item 15, first direction).

## What it did not prove

- `locked` from `devices_list` and the device-side `Cua-Console` header, and the reserved prefix enforced by a device:
  both agents run `main`, which has neither; unit tests cover them (G2, G1).
- A Linux device behind the plugin route (its notes would differ; `devices_use` returns whatever the device sends).
