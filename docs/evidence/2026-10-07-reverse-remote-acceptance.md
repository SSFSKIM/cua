# Reverse remote control: the MacBook as a target through the hosted relay, driven from the Mac mini

The reverse of `docs/evidence/2026-10-06-hosted-relay-acceptance.md`: there the mini was the target and the MacBook the
client; here the MacBook is enrolled and runs the agent, and the mini's Claude Code drives it through the same hosted
relay (the standing Hetzner server and Caddy from that document; its host is not repeated here). Both Macs ran `main`
at `f719b54`. Date: 2026-10-07, times UTC (PDT + 7).

**Verdict: PASS.** The MacBook enrolled, its launchd agent dialled the relay, and from the mini a native action
(TextEdit) and a Chrome tab (profile `personal`) worked on the MacBook; no session was left behind and the client
credential appears nowhere in the mini's transcripts. This is now part of the standing setup and was left running.

## Enrolment (MacBook)

In the main checkout, with nvm's node v22.23.2 (`node_modules/ws` present):

```sh
node bin/cua.mjs remote enroll --relay wss://<relay>/ws --json > <0600 file in a 0700 temp dir>
```

Minted device **`jMTkLnzn-rsbzoZAHJ8EbQ`**. The JSON was split by a node script without displaying the credential:
the client configuration into `~/.config/cua-relay/macbook.mcp.json` (0600, directory 0700), the same shape as
`mini.mcp.json` (one `type: http` server `cua_repl` at `https://<relay>/d/jMTkLnzn-rsbzoZAHJ8EbQ/mcp` with an
`Authorization: Bearer …` header); the `devicesEntry` (hashes only) into a temp file. The JSON was then deleted.

## The relay's table (one restart)

The server's `devices.json` held the mini (`nuadM-MUKSbSN4L59EffLQ`) and the Linux VM (`94_bOP7hRpkMAtKwYEOGQg`). Before
restarting: the relay journal's last line was 00:16:58 and Caddy had logged no `/d/` request in the preceding 30
minutes, so no client channel was open. The MacBook's line was merged into the fetched file (3 devices) and sent:

```
relay/deploy/update.sh --devices <merged file>        # 10.4 s
#   devices.json: 3 device(s) … listening on http://127.0.0.1:7800 (… 3 devices)
01:39:23 cua-relay: SIGTERM: closing
01:39:23 cua-relay: device nuadM-MUKSbSN4L59EffLQ offline (WebSocket closed, code 1006)
01:39:23 cua-relay: listening … 3 devices
01:39:25 cua-relay: device nuadM-MUKSbSN4L59EffLQ online            # mini back after 2 s
```

The Linux VM was already offline before the restart (its last `offline` was 00:16:58) and stays in the table.

## The agent (MacBook)

`node bin/cua.mjs agent install` (relay mode, no `--http`). No dialog of any kind appeared (relay mode only dials out).

```
installed the launchd job com.ssfskim.cua.agent …
  runs    /Users/new/.nvm/versions/node/v22.23.2/bin/node /Users/new/Developer/GitHub/cua/bin/cua.mjs agent run --relay
  status  running, pid 38960
```

`node bin/cua.mjs doctor --json` exit 0, the four agent rows:

```
pass agent.installed  …com.ssfskim.cua.agent.plist: node …/v22.23.2/bin/node, runs …/bin/cua.mjs agent run --relay
pass agent.running    pid 38960, launchd job gui/501/com.ssfskim.cua.agent
pass agent.enrolled   device jMTkLnzn-rsbzoZAHJ8EbQ, relay wss://<relay>/ws
pass agent.console    this user's session (uid 501) is on the console and the screen is unlocked
```

Relay: `01:39:35 cua-relay: device jMTkLnzn-rsbzoZAHJ8EbQ online`; agent log `relay: connected to wss://<relay>/ws as
device jMTkLnzn-rsbzoZAHJ8EbQ`. The agent's start-up sweep left alone one ownerless `run/` entry (`955ec878…`, from
2026-10-05) as designed.

## The client (mini)

`macbook.mcp.json` copied with `scp` to the mini's `~/.config/cua-relay/` (0600, directory 0700). The mini's
`~/.claude/settings.json` already had the Elicitation hook (matcher `cua_repl|plugin:cua:cua_repl`, `bash
$HOME/.claude/hooks/cua-approve.sh`, which answers accept), identical to the MacBook's, so nothing was changed there.
Each run, in `/private/tmp/cua-rev-accept` on the mini with nvm node v24.18.0 on `PATH`:

```sh
~/.local/bin/claude -p --strict-mcp-config --mcp-config ~/.config/cua-relay/macbook.mcp.json \
  --allowedTools mcp__cua_repl --output-format stream-json --verbose '<prompt>'
```

Claude Code 2.1.292; init in both runs `{"name":"cua_repl","status":"connected"}`.

### (a) profiles_list and a native action, 01:40:09 to 01:42:30 (136.5 s, 11 turns)

- `profiles_list`: `personal` ready (`94c9fc71…`), `school` ready, `work` not ready (`extension_not_installed`).
- TextEdit opened on its Open panel; the model used the panel's New Document button, made the document plain text,
  and typed the marker. The accessibility tree read it back exactly:
  `2 텍스트 엔트리 영역 (settable) Value: CUA-REV-1791337209, ID: First Text View`.
- `⌘W`, then 삭제 (Don't Save): the 무제 window was gone in the accessibility tree and a screenshot. TextEdit, left
  running, showed its Open panel again (its idle state with no document); the model clicked 취소 once and left it.
- `end_task`: `{"status":"ended","ended":true,…}`.
- App approval, answered by the mini's hook through the relay: `session 8c25f626…: elicitation/create 0 answered
  accept after 533 ms`.

### (b) Chrome, profile `personal`, 01:43:05 to 01:45:01 (112.1 s, 10 turns)

- `profiles_list`: `personal` ready, so no wake was needed. Bound with
  `cua.getBrowser({extensionInstanceId: "94c9fc71-4bfb-4a14-9d99-2caf6eebbabd"})`.
- `createBrowserTab` at `https://github.com/SSFSKIM/cua`, title read verbatim: `SSFSKIM/cua: Native macOS computer use
  for Claude Code through OpenAI's Codex computer-use stack (a Claude Code plugin)`.
- The tab closed; the model compared the profile's tabs before and after: 10 other tabs, the same ids.
- `end_task` `ended`. Approval: `session d282e596…: elicitation/create 0 answered accept after 850 ms`.
- `initialize` for (b) evicted (a)'s ended session: `session 8c25f626…: evicted, being Idle, for a new session at the
  cap of 1` / `closed (eof, code 0)`.

### (c) Clean-up and the credential

- `claude -p` sends no `DELETE` (Phase E Findings 3), so (b)'s session stayed in the MacBook's `$CUA_HOME/run`. Deleted
  from the mini through the relay with curl (bearer read from the config into a 0600 header file, `-H @file`, removed
  after): `DELETE 200`, a second `DELETE 404`; agent `session d282e596…: closed (eof, code 0)`. `run/` was then
  identical to its listing taken before (a) (the owner's unrelated stdio servers only).
- Client credential occurrences, counted by a script that read it from the config without printing it: the mini's
  whole `~/.claude/projects` (75,429 files, 34.9 GB) **0**; the two stream-json transcripts and their stderr **0**;
  Caddy's journal for the run **0** (it writes the header as `REDACTED`).
- Caddy's access log for `/d/jMTkLnzn…`: `POST 200` ×18, `POST 202` ×4, `GET 200` ×2 (plus 2 client-closed GETs),
  `DELETE 200`, `DELETE 404`, and `POST 400` ×2: Claude Code's `server/discover` probe at a newer protocol version
  before falling back to `initialize`, as in the hosted-relay run (its Finding 3).

## What is left running (standing setup)

- The MacBook's launchd job `com.ssfskim.cua.agent` (`agent run --relay`, nvm node v22.23.2, main checkout) dialling
  the relay as device `jMTkLnzn-rsbzoZAHJ8EbQ`. After moving or upgrading that node, run `cua agent install` again.
- The relay's `devices.json` with three devices: the mini, the Linux VM and the MacBook.
- The client configuration for the MacBook in `~/.config/cua-relay/macbook.mcp.json` on the mini (0600, directory 0700)
  and on the MacBook (the same file, the enrolment's output). From the mini: `claude --mcp-config
  ~/.config/cua-relay/macbook.mcp.json`, or copy the URL and bearer into `claude mcp add`. `cua remote enroll --rotate`
  on the MacBook replaces the credential (then `update.sh --devices` with the new line, and both files rewritten).

## What it did not prove

- The MacBook asleep or locked while driven (it was awake and unlocked; that refusal is covered by `console_locked`).
- A relay restart during a call against this device (shown for the mini in the hosted-relay run; the transport is the
  same).
