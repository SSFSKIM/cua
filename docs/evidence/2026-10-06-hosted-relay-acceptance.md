# Hosted relay: cua-relay on a Hetzner server behind Caddy, acceptance 6 re-run (issue #53)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, Phase E acceptance item 6 (and item 1 through the
relay), re-run against a standing relay instead of Phase E's ngrok tunnel
(`docs/evidence/2026-10-06-phase-e-remote-acceptance.md`). Branch `feat/hosted-relay` (worktree
`/Users/new/Developer/GitHub/cua-wt-53`); the relay and the mini both ran `main` at `a1870fb`, because the branch
changes only deployment files and docs. Date: 2026-10-06, times UTC (PDT + 7).

**Verdict: PASS.** The relay runs at `https://178-104-102-73.sslip.io` with a Let's Encrypt certificate; the Mac mini's
launchd agent dials it; from the MacBook a native action and a Chrome tab worked through it, and a relay restart in the
middle of a 45 s `js` call delivered that call's result. This is the standing setup and was left running.

## The server

| | |
|---|---|
| Hetzner project / hcloud context | `cua` |
| Server | `cua-relay`, id **169121500**, `cx23` (2 shared vCPU, 4 GB, 40 GB), `nbg1`, `ubuntu-24.04`, created 23:30:10 |
| Address | primary IPv4 `cua-relay` (id 153903401) **178.104.102.73**, `auto_delete` off so the host name survives a rebuild; IPv6 `2a01:4f8:1c1a:81d3::/64` |
| Host | **`178-104-102-73.sslip.io`**; certificate `CN=178-104-102-73.sslip.io`, issuer Let's Encrypt `YE1`, expires 2027-01-04 (Caddy renews it) |
| Firewall | Hetzner firewall `cua-relay` (id 11749368): TCP 22, 80, 443 in, nothing else. The relay listens on `127.0.0.1:7800` only |
| Software | Caddy 2.11.7 (official apt repo), Node 22.23.3 (NodeSource), relay at `/opt/cua` `a1870fb`, unit `cua-relay.service` (user `cua-relay`), both units enabled |
| Cost | `cx23` lists at $6.49 a month in nbg1 (`hcloud server-type describe cx23`, this account's currency), 20 TiB traffic included |

Created with `relay/deploy/create-server.sh` (16:30:01 to 16:31:59 PDT, 1 min 58 s from nothing to a TLS answer;
output abridged; the review fold-back later made the script also require the relay's `401` behind Caddy):

```
creating cua-relay (cx23, nbg1) at 178.104.102.73, ref main
server id 169121500
waiting for cloud-init on root@178.104.102.73
status: done … errors: []                         # cloud-init finished 84 s after boot
waiting for https://178-104-102-73.sslip.io/ (Caddy obtains its certificate)
relay up: agents enrol with  cua remote enroll --relay wss://178-104-102-73.sslip.io/ws
```

A second run refused: `a server named cua-relay already exists in context cua; use update.sh to change it` (exit 1).
`update.sh --ref main` (fetch, `npm ci`, restart) took 8 s and the agent was back in 1 s.

Through Caddy before any device: `GET /` `200 cua-relay`; `POST /d/x/mcp` `401`.

## Enrolment and the launchd job (step 1)

On the mini over SSH, with nvm's node v24.18.0 (the only node its application firewall allows), in the main checkout:

```sh
node bin/cua.mjs remote enroll --relay wss://178-104-102-73.sslip.io/ws --json > <0600 file>
```

The mini had no enrolment (Phase E removed it), so this minted device `nuadM-MUKSbSN4L59EffLQ`. The JSON was split on
the mini: the `devicesEntry` (hashes only) into a `devices.json`, the client credential into a 0600 file copied to the
MacBook without being displayed, and the JSON deleted. Then, from the MacBook:

```
relay/deploy/update.sh --devices devices.json
#   devices.json: 1 device(s) … cua-relay: listening on http://127.0.0.1:7800 (… 1 device)
```

Before the mini dialled: client credential `503 cua-relay: device offline`, no bearer `401`. Then on the mini
`node bin/cua.mjs agent install --surfaces computer,browser`:

```
installed the launchd job com.ssfskim.cua.agent …
  runs    /Users/new/.nvm/versions/node/v24.18.0/bin/node /Users/new/Developer/GitHub/cua/bin/cua.mjs agent run --relay
  status  running, pid 34137
pass agent.installed …; pass agent.running pid 34137, launchd job gui/501/com.ssfskim.cua.agent
pass agent.enrolled device nuadM-MUKSbSN4L59EffLQ, relay wss://178-104-102-73.sslip.io/ws
pass agent.console this user's session (uid 501) is on the console and the screen is unlocked
```

Relay journal: `23:32:48 cua-relay: device nuadM-MUKSbSN4L59EffLQ online`; agent log `relay: connected to
wss://178-104-102-73.sslip.io/ws`.

## Item 1 through the hosted relay (curl from the MacBook)

`initialize` (offering `2025-11-25`): `HTTP/2 200`, `content-type: application/json`, `Mcp-Session-Id`,
`via: 1.1 Caddy`, `rmcp 1.5.0`, negotiated `2025-11-25`, instructions 2045 characters. `notifications/initialized`
`202`. `tools/list`: `200 text/event-stream`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`, and the
named priming event arrived intact through Caddy (`retry: 15000` / `id: 1-0` / `event: priming` / `data: {}`); tools
`js`, `js_reset`, `end_task`, `secrets_list`, `profiles_list`. No session header `400`. `DELETE` `200`, then `404`; the
mini's `run/` entry appeared and went.

## Item 6: native action and Chrome through the relay (step 2, 23:33:29 to 23:36:04)

The client was this MacBook's Claude Code 2.1.292, `claude -p … --strict-mcp-config --mcp-config <0600 file>`, the
file naming one HTTP server `cua_repl` at `https://178-104-102-73.sslip.io/d/nuadM-MUKSbSN4L59EffLQ/mcp` with the
client bearer (the shape in the Phase E evidence), owner's elicitation hook enabled. Init: `cua_repl` `connected`.

- **Native:** TextEdit got a new document, the marker `CUA-53-HOSTED-1791329609` typed and read back exactly from the
  accessibility tree, the window closed with 삭제 (Don't Save). TextEdit had been sitting on its Open panel, so the
  first typing went to the panel's file list (type-to-select, nothing opened); the model used the panel's New Document
  button instead.
- **Chrome:** `profiles_list`: `school` ready (`34e8eab6…`), so no wake was needed; bound, `createBrowserTab` opened
  `https://github.com/SSFSKIM/cua`, title `GitHub - SSFSKIM/cua: Native macOS computer use for Claude Code through
  OpenAI's Codex computer-use stack (a Claude Code plugin) · GitHub`, the tab closed (the profile's other tabs left).
- `end_task` `ended`. App approvals answered by the hook: `elicitation/create 0 … answered accept after 365 ms`,
  `elicitation/create 1 … after 420 ms`.
- Client credential occurrences in the stream-json transcript, its stderr and `~/.claude/projects/-private-tmp-cua-accept-53`: 0.

## Item 6: relay restart during a long `js` call — PASS

`claude -p` (2.1.292) made four calls on one session: a quick `js`, a `js` waiting 45 s, another quick `js`, `end_task`
(the cells write their timestamps with `nodeRepl.write`). A watcher restarted the relay 12 s into the long call with
`ssh root@… systemctl restart cua-relay`. Caddy's access log (enabled for this, see below) shows the client's side:

| UTC | What |
|---|---|
| 23:41:03.101 | long cell starts on the mini (its own timestamp) |
| 23:41:18 | relay `SIGTERM: closing`, `device … offline (code 1006)`, new process `listening`; the POST and the standing GET end in Caddy's log, `/ws` `101` closed after 50.9 s |
| 23:41:18 to :19 | agent `relay: connection lost (code 1006); retrying in 1 s`, then `reconnected`; relay `device … online` |
| 23:41:33 | client reconnects `GET /d/…/mcp` with **`Last-Event-Id: 3-0`** for the same session (15 s, the `retry` hint) |
| 23:41:48.107 | cell finishes; that GET (14.6 s) delivers `inflight-done started 2026-10-06T23:41:03.101Z finished 2026-10-06T23:41:48.107Z` |
| 23:42:00 | next `js` on the same session, no `initialize` anywhere: `after-restart 2026-10-06T23:42:00.126Z`; then `end_task` `ended` |

The client credential appears 0 times in Caddy's log: Caddy writes the header as `Authorization: ["REDACTED"]`.

Two earlier tries are not counted: the first prompt used top-level `return` (the REPL refuses it, `Illegal return
statement`), the second relied on a cell's last expression (the runtime returns nothing for it). A third, without
Caddy's access log, passed the same way (restart 23:39:21, result `finished 2026-10-06T23:39:51.254Z` delivered,
`after-restart 23:39:53.846Z`), but left no client-side proof of the resume, hence the run above.

**Clean-up:** `claude -p` sends no `DELETE` (Phase E Findings 3), so each run left its ended session until the next
`initialize` evicted it (`evicted, being Idle, for a new session at the cap of 1`); the last one was deleted by hand
(`DELETE` `200`, `closed (eof, code 0)`). `run/` then held only `8dea2c54…`, the owner's unrelated stdio `cua serve`
from the main checkout (running 21 h, as in Phase E).

## Findings

1. **Caddy needs nothing special.** WebSocket upgrades and SSE pass with `reverse_proxy` alone plus `flush_interval -1`
   on `/d/*`; unlike ngrok's edge, Caddy forwards the priming event byte for byte. A `systemctl reload caddy` closes the
   agent's WebSocket with `1001`; the agent redials after its 1 s backoff.
2. **Access log.** Added to the Caddyfile during the run (`log`, to the journal) and kept: it is the only record of
   the client's resumes and reconnects, and Caddy redacts `Authorization` in it. The URI carries the device id, which
   the relay already logs, and the response headers carry `Mcp-Session-Id` values (useless without the bearer).
3. **Claude Code 2.1.292 probes a newer protocol first.** Before `initialize` it sends `POST` with
   `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method: server/discover`; the agent answers `400` and the client falls back
   to `initialize` at `2025-11-25` with no visible effect. Recorded in `tech-debt-tracker.md` (the gate will need the new version
   when the runtime and clients move to it).
4. **Primary IP.** `create-server.sh` reserves the IPv4 as a named primary IP before creating the server, so the
   sslip.io name is known before cloud-init renders the Caddyfile and survives deleting and recreating the server.

## What is left running (the standing setup)

- Hetzner server `cua-relay` (169121500) with `cua-relay.service` and Caddy, at `https://178-104-102-73.sslip.io`.
- The mini's launchd job `com.ssfskim.cua.agent` (`agent run --relay`, nvm node v24.18.0, main checkout) dialling
  `wss://178-104-102-73.sslip.io/ws` as device `nuadM-MUKSbSN4L59EffLQ`.
- The client configuration (URL and bearer) in `~/.config/cua-relay/mini.mcp.json` on the MacBook (0600, directory
  0700), for `claude --mcp-config` or to copy into `claude mcp add`; it is the only copy of the client credential
  (`cua remote enroll --rotate` on the mini replaces it, followed by `update.sh --devices`).

## What it did not prove

- A cloud or Linux client: the client was the MacBook, over the internet to the relay.
- A server reboot (the units are enabled, but the server was not rebooted).
- An outage longer than Claude Code's resume window.
