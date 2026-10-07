# Linux client through the hosted relay: a Claude Code session in a Linux VM drives the Mac mini (issue #54)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, Phase E (items 1 and 6, plus the clean-up of
item 7), re-run with a Linux client against the standing relay of issue #53
(`docs/evidence/2026-10-06-hosted-relay-acceptance.md`, whose items this run reproduces one for one). Branch
`feat/linux-client-acceptance` (worktree `/Users/new/Developer/GitHub/cua-wt-54`), docs only; the mini ran `main` at
`eeef390`, the relay `a1870fb` (the commits between change no relay code). Date: 2026-10-06, times UTC (PDT + 7).

**Verdict: PASS.** A headless `claude -p` in an arm64 Ubuntu VM, with only the relayed `cua_repl` server configured,
typed into TextEdit on the mini and read the text back, opened, read and closed a tab in the mini's Chrome `school`
profile, and got a 45 s `js` result that was still running when the relay restarted. The mini's `run/` was clean after
each session, and the client credential appears 0 times in the VM's transcripts.

## The client

| | |
|---|---|
| Machine | Tart VM `cua-linux` on the MacBook (Phase F's VM): Ubuntu 24.04, kernel `7.0.0-38-generic` aarch64, NAT address `192.168.64.3`, user `admin` |
| Claude Code | `npm install -g @anthropic-ai/claude-code` (7 s) → `/usr/local/bin/claude`, **2.1.292**, the MacBook's version; Node 22.23.3 |
| Model access | the same as the MacBook's: `ANTHROPIC_BASE_URL=http://127.0.0.1:8641` (the owner's local gateway on the MacBook) with its token. The VM reached the gateway through a reverse SSH tunnel held from the MacBook for the run (`ssh -N -R 127.0.0.1:8641:127.0.0.1:8641 cua-linux`); the token went to the VM through stdin into a 0600 file, sourced by the run script, never on a command line. No login, no API key |
| `~/.claude/settings.json` (VM, 0600) | written fresh, not copied: the gateway URL, the owner's model-alias variables, and the owner's elicitation hook (below). Nothing else of the MacBook's settings |
| MCP configuration | `~/.config/cua-relay/mini.mcp.json` copied from the MacBook by `scp` into a 0700 directory, mode 0600: one HTTP server `cua_repl` at `https://178-104-102-73.sslip.io/d/nuadM-MUKSbSN4L59EffLQ/mcp` with the client bearer |
| Invocation | `claude -p "<prompt>" --strict-mcp-config --mcp-config ~/.config/cua-relay/mini.mcp.json --allowedTools mcp__cua_repl --output-format stream-json --verbose`, from `/tmp/cua-accept-54` |

**The elicitation hook.** The owner's MacBook answers cua's per-app and per-site approvals with an `Elicitation` hook
matching `cua_repl|plugin:cua:cua_repl` that runs `bash $HOME/.claude/hooks/cua-approve.sh`, a one-line `jq` that
prints `{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{}}}`. The VM got the same
matcher and the same script (`jq` 1.7 was already installed); without it a headless `claude -p` cannot answer the
first app approval. Proof it fired is on the mini (item 2).

Both legs went over the internet: the client to Caddy from the VM through the MacBook's NAT (Caddy saw it as
`128.54.129.17`), the mini's WebSocket from its own address (`128.54.162.190`).

## Item 1: lifecycle by curl from the VM through Caddy — PASS (23:55:07 to 23:55:17)

A script on the VM read the URL and bearer from the 0600 file into a 0600 header file for `curl -H @file`, never
printing it (curl 8.5.0):

```
== 23:55:07.011 initialize
HTTP/2 200
content-type: application/json
mcp-session-id: 513d0b65-024a-4db5-b952-f1bcdf56cac7
via: 1.1 Caddy
{"pv":"2025-11-25","server":{"name":"rmcp","version":"1.5.0"},"instructions_chars":2045}
== 23:55:09.015 notifications/initialized
HTTP 202
== 23:55:09.880 tools/list
HTTP/2 200
cache-control: no-cache, no-transform
content-type: text/event-stream
x-accel-buffering: no
retry: 15000
id: 1-0
event: priming
data: {}
["js","js_reset","end_task","secrets_list","profiles_list"]
== 23:55:10.584 no session header
HTTP 400
== no bearer
HTTP 401
== 23:55:16.869 DELETE
HTTP 200
== 23:55:17.731 DELETE again
HTTP 404
```

During a 5 s hold the mini's `run/` held `513d0b65…` (directory, `.pid`, `.sock`) beside the owner's unrelated stdio
`cua serve` `8dea2c54…`; after the `DELETE` only `8dea2c54…` remained, agent log `session 513d0b65…: closed (eof, code 0)`.

## Items 2 and 3: native action and Chrome on the mini — PASS (23:57:58 to 23:58:48)

One `claude -p` run (47.1 s, 12 turns, `claude-opus-5-5[1m]`); init `mcp_servers: [{"name":"cua_repl","status":"connected"}]`;
11 tool calls, all on `cua_repl` (`js` ×9, `profiles_list`, `end_task`).

- **Native (TextEdit):** TextEdit opened on its Open panel; the model used New Document and switched the document to
  plain text, typed `CUA-54-LINUX-1791331077`, and read it back exactly from the accessibility tree
  (`텍스트 엔트리 영역 (settable) Value: CUA-54-LINUX-1791331077, ID: First Text View`). It closed the window with
  `버튼 삭제, ID: DontSaveButton` (Don't Save); nothing was saved.
- **Chrome:** `profiles_list` → `school` ready, `extensionInstanceId` `34e8eab6…` (no wake needed; `ssfs` not ready,
  `chrome_data_unreadable`, not touched). Bound with `cua.getBrowser({extensionInstanceId})`; `createBrowserTab`
  (timeout 90 000 ms) opened `https://github.com/SSFSKIM/cua`, tab `1030401784`, title `GitHub - SSFSKIM/cua: Native
  macOS computer use for Claude Code through OpenAI's Codex computer-use stack (a Claude Code plugin) · GitHub`; that
  tab closed, the profile's other two tabs left open.
- `end_task` → `{"status":"ended","ended":true}`.
- **Approvals answered by the VM's hook** (mini's agent log):
  ```
  session 512a14fe-…: elicitation/create 0 sent to the client
  session 512a14fe-…: elicitation/create 0 answered accept after 755 ms
  session 512a14fe-…: elicitation/create 1 sent to the client
  session 512a14fe-…: elicitation/create 1 answered accept after 459 ms
  ```

## Item 4: relay restart during a long `js` call — PASS (23:59:14 to 00:00:17)

`claude -p` made four calls on one session: a quick `js`, a `js` waiting 45 s (`timeout_ms` 120000), another quick
`js`, `end_task`, each cell writing its timestamps with `nodeRepl.write`. A watcher on the MacBook polled the VM's
stream-json for the long call's `tool_use` (seen 23:59:23), waited 11 s, then ran
`ssh root@178.104.102.73 systemctl restart cua-relay` (the SSH round trip put the restart at 23:59:37.49, 14.5 s into
the call). Relay journal, Caddy's access log (header columns abridged; `Authorization` is `REDACTED` on every line) and
the cells' own timestamps:

| UTC | What |
|---|---|
| 23:59:15 | `POST` `400` with `Mcp-Method: server/discover` (Claude Code's probe of `2026-07-28`, as in #53), then `initialize` `200`, session `6a364fea…` |
| 23:59:17 | the client's standing `GET` opens |
| 23:59:20.139 | `before 2026-10-06T23:59:20.139Z` |
| 23:59:22.995 | long cell starts on the mini (its own timestamp); its `POST` stream opens 23:59:23 |
| 23:59:37.487 | relay `SIGTERM: closing`, `device nuadM-MUKSbSN4L59EffLQ offline (WebSocket closed, code 1006)`; Caddy `aborting with incomplete response … unexpected EOF` for the `GET` and the long `POST`, `/ws` `101` closed after 970.7 s |
| 23:59:37.795 | new relay process `listening on http://127.0.0.1:7800 … 1 device` |
| 23:59:39.302 | agent `relay: connection lost (code 1006); retrying in 1 s`, `reconnected`; relay `device … online` |
| 23:59:53 | client reconnects `GET /d/…/mcp` with **`Last-Event-Id: 3-0`** for session `6a364fea…` (15 s after the cut, the `retry` hint) |
| 00:00:07.996 | cell finishes; that `GET` (15 s) delivers `inflight-done started 2026-10-06T23:59:22.995Z finished 2026-10-07T00:00:07.996Z` |
| 00:00:10.181 | next `js` on the same session, no new `initialize`: `after-restart 2026-10-07T00:00:10.181Z`; then `end_task` `{"status":"ended","ended":true,…}` |

The client's stderr was empty and its init again showed `cua_repl` `connected`. As in #53 the model, seeing only
results, reported that nothing showed a restart: the resume is invisible to it.

## Item 5: `run/` clean on the mini after `end_task` — PASS

`claude -p` sends no `DELETE` (Phase E Findings 3), so each run's ended session stayed in `run/` until deleted by hand
from the VM, the same way #53 did:

```
23:58:59 DELETE 512a14fe-5cd0-4b07-823f-3456107cf5d7 HTTP 200     # items 2–3; agent: closed (eof, code 0)
00:01:07 DELETE 6a364fea-5337-44f2-9ee6-97a6502acfb2 HTTP 200     # item 4;   agent: closed (eof, code 0)
```

After each, `run/` on the mini held only `8dea2c54…`, the owner's unrelated stdio `cua serve` from the main checkout
(pid 65275, running 21 h 42 min).

## Item 6: credential exposure on the client — PASS

Counted on the VM by a script that loaded each secret into a variable and printed only counts:

```
client credential occurrences in ~/.claude/projects: 0          # 3 sessions, 4 files, incl. a persisted tool result
client credential occurrences in run outputs (stream-json, stderr): 0
client credential occurrences anywhere under ~/.claude: 0
gateway token occurrences under ~/.claude and run outputs: 0
sanity (the config itself contains it): 1
```

Caddy's log carries `Authorization: ["REDACTED"]` for every client and agent request in the run.

## Findings

1. **A fresh Linux Claude Code needs nothing cua-specific beyond the two files.** `npm install -g`, the MCP config
   and the elicitation hook were the whole client set-up; `claude -p` with `--strict-mcp-config` connected on the first
   try, and the behaviour through the relay (the `server/discover` probe, the `Last-Event-Id` resume after 15 s, no
   `DELETE` on exit) matched the MacBook client of #53 exactly.
2. **The approval hook lives on the client.** Approvals are elicitations answered by the Claude Code that called, so
   the hook has to be installed where the client runs (here the VM), not on the Mac; README "Remote control" already
   says a headless `claude -p` has nobody else to answer them. The owner's hook accepts every elicitation (site
   approvals too), where the README's example accepts app approvals only; the VM got the owner's form.

## What is left running

- The standing setup, unchanged: the relay `cua-relay` behind Caddy, the mini's launchd agent connected as device
  `nuadM-MUKSbSN4L59EffLQ`, `school` bound.
- On the VM: Claude Code 2.1.292, `~/.claude/settings.json` and `~/.claude/hooks/cua-approve.sh` (no secrets), the
  run directory `/tmp/cua-accept-54` (stream-json, no credentials).
- Removed at the end: the VM's copy of the client credential (`~/.config/cua-relay/mini.mcp.json`), the gateway token
  file, and the reverse tunnel. The MacBook's `~/.config/cua-relay/mini.mcp.json` is again the only copy of the
  client credential. To use the VM as a client again: `scp -p` that file back into a 0700
  `~/.config/cua-relay/` on the VM and give its Claude Code model access (the tunnel and token above, or its own login).

## What it did not prove

- A client in a cloud data centre: the VM is a NAT guest on the MacBook, so its traffic left through the MacBook's
  uplink and its model access went through the MacBook's gateway. The MCP leg (VM → Caddy → relay → mini) did not use
  the LAN or the tunnel.
- A relay behind nginx: the standing relay uses Caddy, and the nginx block in `relay/README.md` is still not exercised.
- An x64 Linux client (the VM is arm64; the client is Node and Claude Code, so nothing architecture-specific is expected).
