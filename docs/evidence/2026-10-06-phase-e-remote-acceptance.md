# Phase E evidence: remote control acceptance (items 1–7)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, milestones E1–E4, acceptance items 1–7. Branch
`feat/phase-e` (worktree `/Users/new/Developer/GitHub/cua-wt-phase-e` on both Macs; their main checkouts stayed on
`main`). Date: 2026-10-06, times PDT. Pinned runtime `26.928.40906-darwin-arm64` (serverInfo `rmcp 1.5.0`), the Mac's
real `CUA_HOME` (installed runtime, `school` profile bound).

**Verdict: items 1–7 all PASS.** Items 1–4 and 7 over the LAN path (E1), item 5 through the launchd job (E2), item 6
and item 1 again through `cua-relay` behind a public TLS tunnel (E3). Two defects surfaced only against live clients
and were fixed on the branch before the passing runs: the protocol-version gate (`2ed7a22`) and the priming event's
shape (`e517313`). Neither headless `claude -p` nor interactive Claude Code sends `DELETE` when it ends.

## Setup

| | |
|---|---|
| Controlled device | the Mac mini (macOS, Korean UI), uid 501, nobody at its console during the whole run. Agent node: nvm `v24.18.0` (see Findings 5). |
| Client | the MacBook. Claude Code `2.1.287` for headless runs (`claude -p`), `2.1.291` for interactive runs (in `tmux`). |
| Mini's LAN address | `100.112.79.211`, the mini's `en0` address on the network it shares with the MacBook (the MacBook's `en0` is `100.112.102.248`, one hop away). The mini's tailnet address, `100.92.238.1`, was not used, so the LAN runs were plain HTTP on that network, not inside Tailscale. The agent bound exactly that address, never `0.0.0.0`. |
| Client credential | held on the MacBook in a 0600 file and read into `$T` for curl; never printed. |
| Branch heads | item 1 `dd7fa6c`; items 2–4 and 7 `2ed7a22`; item 5 `262739a`; item 6 `5bfd657`, its restart proof `e517313`. |

**How the agent got into the GUI session without a person.** SSH was used on the mini only for file operations and
`launchctl`. A process started from an SSH shell has no Keychain or TCC (`docs/evidence/second-mac-acceptance.md`), but
a job loaded with `launchctl bootstrap gui/501 <plist>` from that shell runs in the `Aqua` session (pre-flight:
`launchctl managername` inside the job prints `Aqua`, the SSH shell itself `Background`). For items 1–4 and 7 the agent
therefore ran as a one-shot job, `/tmp/com.ssfskim.cua.e1proof.plist`, whose program was nvm's node with
`bin/cua.mjs agent run --http 100.112.79.211:7801` and `CUA_SHIM_SURFACES=computer,browser` in its environment
(`CUA_AGENT_MAX_SESSIONS=2` added for item 7's cap-2 step). This is the "console Terminal" of the acceptance text: the
same session, reached by the vehicle E2 ships. Item 5 used E2's own `cua agent install`.

**The acceptance client.** The MacBook's user-scope `cua_repl` is the owner's live stdio registration, which
`claude mcp add … cua_repl` would have replaced. Every Claude Code client therefore ran with
`--strict-mcp-config --mcp-config <file>`, the file naming one HTTP server `cua_repl` (the name the owner's
elicitation hook matches) with the endpoint URL and an `Authorization: Bearer` header, of this shape:

```json
{"mcpServers": {"cua_repl": {"type": "http", "url": "http://100.112.79.211:7801/mcp",
  "headers": {"Authorization": "Bearer <client credential>"}}}}
```

Headless runs were `claude -p … --strict-mcp-config --mcp-config <file>` with stream-json output, in
`/private/tmp/cua-accept`. `claude mcp add --transport http cua_repl …` remains the README's instruction for a real
client.

**The relay for item 6, and why a tunnel.** `cua-relay` ran on the MacBook on loopback
(`node relay/server.mjs --port 7800 --devices <file>`), published by `ngrok http 127.0.0.1:7800` at
`https://twopenny-lindy-joyously.ngrok-free.dev`, with TLS terminated by ngrok. No cloud host was available (the
owner's Linux tailnet machines were offline) and Tailscale Funnel is not enabled on the tailnet; the first choice, a
Cloudflare quick tunnel, failed: `api.trycloudflare.com` answered the tunnel request in 18 s, past `cloudflared`'s
client timeout, on four tries. Because the relay listened only on the MacBook's loopback, the mini could reach it only
as `wss://twopenny-lindy-joyously.ngrok-free.dev/ws` and the client only as
`https://twopenny-lindy-joyously.ngrok-free.dev/d/<device>/mcp`: both legs crossed the internet through a real TLS
proxy, and neither used the LAN or the tailnet. The device id is abbreviated here (`vI10bo5i…`); every request still
needs the client credential.

## Item 1: HTTP session lifecycle — PASS (LAN, 03:42, `dd7fa6c`)

Agent log: `cua agent: listening on http://100.112.79.211:7801/mcp (device vI10bo5i…; at most 1 session, idle after 15 min)`.

```sh
M=http://100.112.79.211:7801/mcp
curl -s -D- $M -H "Authorization: Bearer $T" -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

| Request (curl from the MacBook) | Answer |
|---|---|
| `initialize`, bearer, no session header | `200`, `Content-Type: application/json`, `Mcp-Session-Id: fe411940-4181-47c8-9a70-46afe29c22d3`; serverInfo `rmcp 1.5.0`; `instructions` 2045 characters (the host notes) |
| `notifications/initialized` on the session | `202` |
| `tools/list` on the session | `200 text/event-stream`; the stream opens with `retry: 15000` / `id: 1-0` / `data: ` (the priming event as it was then; see Findings 2); tools `js`, `js_reset`, `end_task`, `secrets_list`, `profiles_list` |
| any POST without the bearer | `401` |
| a request without `Mcp-Session-Id` | `400` |
| `initialize` with a session header | `400` |
| `ls $CUA_HOME/run` on the mini (SSH) before DELETE | `fe411940…` with its `.pid` and `.sock` (beside `8dea2c54…`, the owner's own unrelated stdio `cua serve`) |
| `DELETE` | `200`; agent log `session fe411940-…: closed (eof, code 0)` |
| the same id afterwards | `404` |
| `ls $CUA_HOME/run` after | only `8dea2c54…` |

## Items 2 and 3: native action and Chrome over HTTP — PASS (LAN, 03:47, `2ed7a22`)

First attempt (at `dd7fa6c`): `claude -p` reported `cua_repl` failed, `400 cua: unsupported MCP-Protocol-Version
(supported: 2025-03-26, 2025-06-18)`. Cause and fix in Findings 1.

Passing run, `claude -p` 2.1.287, owner's hook enabled; the stream-json init line showed `cua_repl` connected.

- Item 2: a `js` cell opened TextEdit, made a new document, typed `CUA-E1-LAN-1791283554`, read back
  `"CUA-E1-LAN-1791283554"` from the accessibility tree, took a screenshot (the evidence that the mini's screen showed
  it; nobody was at the screen), closed the window with 삭제 (Don't Save), and `end_task` answered `ended`.
- Item 3: `profiles_list` returned `school` ready with instance id `34e8eab6…`; `cua.getBrowser` bound it;
  `createBrowserTab` opened `https://github.com/SSFSKIM/cua` and read the title `GitHub - SSFSKIM/cua: Native macOS
  computer use for Claude Code through OpenAI's Codex computer-use stack (a Claude Code plugin) · GitHub`; the tab was
  closed; `end_task` `ended`.
- Occurrences of the client credential in the stream-json transcript and in
  `~/.claude/projects/-private-tmp-cua-accept`: 0.
- After `claude -p` exited, its session `c0ad1223-23e6-4328-aa7f-d6a60d3d30c0` was still in the mini's `run/`:
  `claude -p` sent no `DELETE`. The session was left for item 7's idle close.

## Item 4: elicitation crosses the wire — PASS (LAN, 04:05, `2ed7a22`)

Interactive Claude Code 2.1.291 in `tmux`, `claude --settings '{"disableAllHooks":true}' --strict-mcp-config
--mcp-config <file>`, prompt: bind Calculator with `cua.getApp('com.apple.calculator')`, call `getAXState()`, report
the window title, call `end_task`. The mini's runtime raised the first-use approval, and the MacBook's Claude Code
showed it (pane capture):

```
MCP server "cua_repl" requests your input

Allow Computer Use to use "Calculator"?

❯ Accept    Decline
```

Accept (Enter) let the call proceed: window title `계산기` (Calculator), `end_task` `ended`. On `/exit` the session
`b32cef41…` stayed in `run/`: interactive Claude Code sent no `DELETE` either.

## Item 5: launchd session, hook enabled — PASS (mini 04:40–04:50, `262739a`; locked clause on the MacBook)

Over SSH, with nvm's node:

```sh
node bin/cua.mjs agent install --http 100.112.79.211:7801 --surfaces computer,browser
#   installed com.ssfskim.cua.agent; runs <nvm node> …/bin/cua.mjs agent run --http 100.112.79.211:7801; status running, pid 3124
launchctl bootout gui/501/com.ssfskim.cua.agent && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.ssfskim.cua.agent.plist
#   running, pid 3472 (launchctl print: state = running); agent.log: SIGTERM, then a fresh "listening on" line
node bin/cua.mjs doctor --json | jq '.checks[] | select(.name | startswith("agent."))'
#   pass agent.installed; pass agent.running (pid 3472, gui/501/com.ssfskim.cua.agent); pass agent.enrolled (local only);
#   pass agent.console (uid 501 on the console, unlocked)
```

No permission prompt appeared and none was answered: the launchd-started agent reached Accessibility, Screen Recording
and Chrome without one (E2's delegated unknown).

Items 2 and 3 through that job, `claude -p`, owner's hook **enabled**: marker `CUA-E2-LAUNCHD-1791285846` typed and
read back through the accessibility tree; `school` bound; the `github.com/SSFSKIM/cua` title read; the tab closed;
`end_task` `ended` twice; credential occurrences 0. The agent log shows the app approvals answered with no human:
`elicitation/create 0 sent to the client` / `answered accept after 90 ms`, and `elicitation/create 1 …` `answered
accept after 264 ms`.

The session was then closed with a `DELETE` (sent by hand, since `claude -p` sends none): `200`, `closed (eof, code 0)`;
`run/` held only the owner's unrelated stdio entry, and doctor's `agent.*` rows all still passed (the agent survived).

**Locked screen.** Proven on the MacBook, which the owner's absence had locked (Findings 4 says why not the mini). In
a temporary `CUA_HOME` (runtimes symlinked from the real one), enrolled:

- `cua doctor`: `fail agent.console this user's session is on the console but the screen is locked: remote js calls
  are refused (console_locked) until it is unlocked`.
- `agent run --http 127.0.0.1:7899`, then a `js` call: tool error `cua: the Mac's screen is locked or the session is
  not on the console; unlock it and retry`, `{"code":"console_locked"}`; agent log `js refused: the screen is locked
  (console_locked)`.
- The temporary home was removed afterwards.

## Item 6: through the relay — PASS (`5bfd657`, restart proof at `e517313`)

Before the mini dialled: a request with the client credential answered `503 cua-relay: device offline`; one without a
bearer `401`.

On the mini: `remote enroll --relay wss://twopenny-lindy-joyously.ngrok-free.dev/ws` on the enrolled device updated the
relay URL in place (no rotation; device id unchanged), the `devices.json` line went into the relay's file, and
`agent install --surfaces computer,browser` replaced item 5's job with one running `agent run --relay` (no `--http`).
Agent log `relay: connected to wss://…/ws`; relay log `device vI10bo5i… online`; doctor `agent.*` all pass, enrolled
naming the relay.

- **Item 1 through the relay** (curl to the public URL): `initialize` `200 application/json` with `Mcp-Session-Id`;
  `tools/list` `200 text/event-stream` with `cache-control: no-cache, no-transform` and `x-accel-buffering: no`, five
  tools; no bearer `401`, no session header `400`, `initialize` with a session header `400`; `DELETE` `200`, then
  `404`; `run/` clean.
- **Items 2 and 3 through the relay** (`claude -p`, hook enabled): marker `CUA-E3-RELAY-1791288322` read back;
  `school` bound; title read; tab closed; app approvals `answered accept after 167 ms` and `158 ms`; credential
  occurrences 0.
- **Relay restart, first try (05:07, `5bfd657`) — failed, fixed.** Interactive Claude Code 2.1.291 had a 45 s `js` in
  flight; the relay got SIGINT at 05:07:20 and was restarted at 05:07:25. The agent logged `connection lost (code
  1006); retrying in 1 s`, two `502`s, then `reconnected` at 05:07:28. The client hung: ngrok's request log shows the
  POST cut at 13.6 s and then only the standing GET reconnecting (05:07:36) without `Last-Event-ID`. Cause in
  Findings 2; fix `e517313`.
- **Eviction in real use.** That interactive client's `initialize` evicted the Idle session `c83b194a…` left by the
  earlier `claude -p`.
- **Relay restart, second try (05:14, `e517313`) — PASS.** The named priming event (`event: priming`, `data: {}`) now
  arrived through ngrok. Session `8667ebf0…`, a 45 s `js` in flight; relay SIGINT 05:14:37, restarted 05:14:42; agent
  `connection lost (code 1006); retrying in 1 s`, `502`, `502`, `reconnected` (ngrok: `/ws` `101` at 05:14:44). The
  client resumed: ngrok logged `GET … Last-Event-Id 2-0` for session `8667ebf0` at 05:14:53 (15 s after the cut, the
  `retry` hint), held it 21 s, and it delivered the in-flight cell's result `inflight-done 2026-10-06T12:15:15.081Z`.
  The next `js` on the same session, with no `initialize` anywhere in ngrok's log, returned `after-restart
  2026-10-06T12:16:08.232Z`; `end_task` `ended`.
- **DELETE on exit:** headless `claude -p` 2.1.287, no (items 2/3); interactive 2.1.291 on `/exit`, no (item 4).

## Item 7: idle, cap and eviction — PASS (LAN, 04:02–04:10, `2ed7a22`)

- **Idle close.** Session `c0ad1223…`, left by `claude -p` with its task ended and no `DELETE`: the agent logged `idle
  for 900 s; closing it` and `closed (eof, code 0)`; its `run/` entry was gone and the id answered `404`.
- **Eviction at cap 1.** Session A `f4060a8b…` initialized and given no task; session B's `initialize` answered `200`,
  with the log line `session f4060a8b…: evicted, being Idle, for a new session at the cap of 1`; A then `404`.
- **503 at cap 1.** B running a 20 s `js` call; C's `initialize`: `503`
  `{"code":-32000,"message":"cua: session limit reached (1)"}`. B's `js` stream carried the retry/priming event, then
  `id: 1-1` with the response; `end_task` `ended`; `DELETE` B `200`.
- **Cap 2.** The one-shot job with `CUA_AGENT_MAX_SESSIONS=2` (log `at most 2 sessions`). Two `claude -p` sessions
  (`ad20bf00…`, `bc9304be…`) each bound TextEdit and read its accessibility state (window `열기`, its Open panel) in
  turn, and both were left open. `launchctl bootout` of the job (SIGTERM): `SIGTERM: closing every session`, both
  `closed (signal, code 0)`; `run/` held only the owner's unrelated entry; no agent process was left.

## Findings

1. **Protocol `2025-11-25`.** Claude Code 2.1.287 offers `2025-11-25` (its latest), the runtime agrees to it (curl:
   offer `2025-11-25` → `2025-11-25`; offer `2026-06-30` → `2025-11-25`), and the client then sends
   `MCP-Protocol-Version: 2025-11-25`, which E1's fixed list `{2025-03-26, 2025-06-18}` answered `400`. The earlier
   m3 evidence of `2025-06-18` was what that client offered then, not the runtime's ceiling. Fix `2ed7a22`: the gate
   accepts the version the session negotiated in its `InitializeResult` as well as `2025-03-26`, `2025-06-18` and
   `2025-11-25` (spec Decision Log).
2. **ngrok drops the empty-data priming event.** The tunnel's edge re-serialises SSE: bytes leaving the relay on
   loopback were `retry: 15000\nid: 2-0\ndata: \n\n`, the same event through `*.ngrok-free.dev` arrived as
   `id: 3-0\nretry: 15000\n\n`, the empty `data:` line dropped and fields reordered. An event without a data line is
   never dispatched, so Claude Code never recorded the priming id and did not resume the cut `js` call. Fix
   `e517313`: the priming event is `retry: 15000\nid: <stream>-0\nevent: priming\ndata: {}\n\n`, a named event with a
   body, which the proxy keeps and the client records the id of and otherwise ignores. Keepalive comments are probably
   dropped by the same edge (not verified); they still keep the proxy's upstream leg busy.
3. **Neither Claude Code mode sends `DELETE`.** Headless `claude -p` 2.1.287 on exit and interactive 2.1.291 on
   `/exit` both left their sessions on the Mac. Sessions end by the idle close (15 min) or by eviction when the next
   client initializes; item 6 saw that eviction happen in ordinary use. A session left with its task open (no
   `end_task`) is not evictable, so it holds a cap-1 device until the idle close.
4. **The locked-screen clause ran on the MacBook, not the mini.** Nobody could unlock the mini for E3 and E4 for 7–8
   hours, so it was never locked on purpose. The MacBook, locked by the owner's absence, carried both lock signals the
   console reader honours (`IOConsoleLocked` true on `Root`, `CGSSessionScreenIsLocked` true in the session's
   `IOConsoleUsers` entry); the unlocked mini at 04:30 showed `IOConsoleLocked` false and no
   `CGSSessionScreenIsLocked` key.
5. **nvm node and the firewall.** The mini's application firewall is on and lists only nvm's `node` v24.18.0 as allowed
   for incoming connections; Homebrew's `node` 26.4.0, the one on `PATH`, is not listed, so an `--http` listener under
   it would raise the "accept incoming connections?" dialog at an unattended console. Every `--http` agent ran nvm's
   node, and `agent install` records the node that ran it, which is therefore the binary the firewall judges. Relay
   mode dials out and is unaffected.
6. **No TCC prompt for the launchd agent.** A `gui/501` job reached Accessibility, Screen Recording, the browser route
   and the app-approval path with no dialog (the grants already existed on the mini for the helper).

## After the whole-branch review (05:55–06:05 PDT, branch de3f5a3)

The branch review's fixes changed the agent (it follows `device.json`; a newer GET replaces the standing stream;
pending approvals are bounded by their call; a session abandoned mid-task is evictable after 60 s), so the relay path
was re-run on the final code, with the mini's job reinstalled from the worktree at de3f5a3:

- **Rotation without a restart.** `remote enroll --rotate --json` on the mini (its output, which carries the new client
  credential once, went to a 0600 file and was copied to the MacBook without being displayed); the new `devices.json`
  line went to the relay, which was restarted. The agent (pid 59683 before and after; no restart) logged `relay:
  connection lost (code 1006)`, `device.json changed: credentials re-derived (device vI10bo5i…, relay wss://…/ws; …)`,
  one `502`, then `relay: reconnected`. Through the public URL the old client credential's `initialize` was `401` and
  the new one's `200` (session deleted, `200`).
- **Items 2 and 3 again through the relay** (`claude -p`, hook enabled, the rotated credential): marker
  `CUA-E4-FINAL-1791290904` typed and read back through the accessibility tree, the document closed with 삭제; `school`
  bound, the repository page's title read, the tab closed; `end_task` twice. Agent log: `elicitation/create 0 …
  answered accept after 369 ms`, `elicitation/create 1 … answered accept after 174 ms`. The credential occurs 0 times
  in the transcript.

## What it did not prove

- A reboot: item 5 used the `bootout`/`bootstrap` cycle the acceptance allows instead.
- The locked-screen refusal through a launchd job on the controlled device: it ran on the MacBook from a temporary
  home on loopback. The `onConsole: false` branch (another user at the screen) was not exercised live.
- A cloud or Linux client, and a relay behind nginx: the client was the MacBook and the TLS proxy was ngrok's edge
  (both legs over the internet, as above).
  Later runs: a hosted relay behind Caddy (`2026-10-06-hosted-relay-acceptance.md`, #53) and a Linux client through
  it (`2026-10-06-linux-client-relay-acceptance.md`, #54); nginx is still unexercised.
- A relay outage longer than Claude Code's resume window (two attempts spaced by the 15 s `retry` hint), and Claude
  Code's behaviour on a `404` for an ended session.

## Afterwards

After the final live check on the review's last fix (5c6310f: a `js` call and `end_task` through the relay, then
`DELETE`), the mini's job was removed with `cua agent uninstall`, its enrolment (`remote/device.json`) deleted so its
doctor's `agent.*` rows read `skip` again, and its branch worktree removed; its main checkout was not touched. The
relay and the ngrok tunnel on the MacBook were stopped and the client credential files deleted. `npm test` at
5c6310f: 635/635; in a copy without `node_modules`: 607 pass, 28 skipped (`needs the ws package`), 0 fail.
