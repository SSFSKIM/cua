# Phase E execution report (E1–E4)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md` (dispatched at `2ae0113` on main). Branch `feat/phase-e`, worktree `/Users/new/Developer/GitHub/cua-wt-phase-e` (the main checkout stayed on `main` throughout). Commit range `2ae0113..HEAD` (this report's commit is the last). Board: issue #11. Phase F is a separate executor's; it branched from E1's `4595f84` and merges after this.

## Status

DONE. E1–E4 are ticked in the spec's Progress, each reviewed clean. Phase E acceptance items 1–7 passed live, with the MacBook as client and the Mac mini as device. Item 6 ran through a public TLS tunnel. Evidence: `docs/evidence/2026-10-06-phase-e-remote-acceptance.md`.

Tests at `5c6310f`:
- `npm test`: 635/635 (baseline 515/515).
- In a copy without `node_modules`: 607 pass, 28 skipped with "needs the ws package: run npm ci", 0 fail.

## How it ran

The controller was doperpowers:subagent-driven-execution, with a fresh opus `task-executor` per milestone. The sol and astra routes were at their usage limits (until Oct 9), so:
- every task review ran as `doperpowers:task-reviewer` with `model: opus`;
- the whole-branch review ran as an opus general-purpose reviewer with the reviewer-high brief, the fallback the dispatch named.

The ledger is `.doperpowers/sde/2026-10-06-remote-and-linux-design/progress.md` (gitignored), with `task-1..5-report.md` beside it.

### Pre-flight (`cacde63`)

- Both Macs' main checkouts stay on `main`, and milestone code runs from branch worktrees.
- The acceptance client is `claude -p --strict-mcp-config --mcp-config <file>`, naming the HTTP server `cua_repl`. This leaves the owner's live user-scope `cua_repl` untouched.
- With nobody at the mini's console, E1's LAN proof starts the agent from a one-shot `launchctl bootstrap gui/501` job loaded over SSH. I verified that it runs in the Aqua session.

### E1: HTTP server mode

Code `ba2c799..4595f84`. Review fixes `052e124` and `ee6362c`.
- **Priming event.** It was added before review, after reading Claude Code's bundled transport: the client resumes a dropped POST stream only if it saw an event id.
- **Review-driven changes:**
  - `retry: 15000`: without it the client makes two reconnect attempts about 2.5 s apart, then gives up.
  - Keepalive comments.
  - Busy rules for a client that vanished mid-approval.
  - Cancellation ends only a request withdrawn before dispatch.
  - Release failures are logged instead of crashing the agent.
- **Live LAN proof** (acceptance 1–4 and 7). It found that Claude Code offers protocol `2025-11-25`, which the runtime accepts and E1's fixed list refused. Fixed in `2ed7a22`: the gate also accepts the session's negotiated version.

### E2: launchd agent, console check, doctor rows

Code `9d96899`, `3296f8d`. Fixes `894c543` and `262739a`.
- **Pre-review decisions:**
  - `KeepAlive {SuccessfulExit: false}`, with 4001/4003 exiting 0, so there is no 10 s flap.
  - All four `agent.*` rows read `skip` on an unenrolled Mac.
  - The agent log gets `… sent` / `… answered <action> after <ms> ms` lines for server requests. Acceptance 5's "answered without a human" needed them.
- **Acceptance 5** passed on the mini through launchd:
  - installed over SSH with nvm's node, which is the binary the firewall allows;
  - a bootout/bootstrap cycle;
  - items 2 and 3 with the owner's hook enabled, approvals answered in 90 and 264 ms;
  - no TCC prompt.
- **The locked-screen clause** was proven on the MacBook, which was locked by the owner's absence, so the mini stayed usable.

### E3: relay and agent

Code `8e3e00f..264e615`. Fixes:
- `5bfd657`, for one Important finding (refused upgrade sockets were never destroyed) plus minors: 90 s replay grace, 4 MB and 32 MB bounds, `no-transform`.
- `e517313`, after the live run: ngrok's edge re-serialises SSE and dropped the empty-data priming event, so Claude Code hung on an in-flight call across a relay restart. The priming event is now `event: priming` / `data: {}`.

Acceptance 6 passed through `cua-relay` on the MacBook, behind ngrok:
- trycloudflare's API timed out;
- Tailscale Funnel/HTTPS is not enabled on the tailnet;
- no cloud host was online.

What passed through the tunnel:
- Acceptance 1 again.
- Items 2 and 3.
- A relay restart mid-`js`, with the result delivered via `Last-Event-ID: 2-0`.
- The next call on the same session, without re-initialising.

### E4: evidence, README, retrospective

Evidence and README at `f897183`.

The whole-branch review found one Important issue: a running agent never followed `enroll --rotate`, the only revocation. Its minors are the six items below. Fixed in `1ec4c47..98cf4a8`:
- the agent follows `device.json`;
- a newer GET replaces the standing stream;
- pending approvals are bounded by their call;
- `wss:` relay URLs only, or `ws:` to loopback;
- the relay endpoint hint;
- agent limits are carried into the job.

The same wave applied an eviction refinement found in acceptance: neither Claude Code mode sends DELETE, so a session whose client left mid-task becomes evictable after 60 s with no stream. It also corrected the evidence doc's address claim.

The re-review found only minors, fixed in `5c6310f`:
- fragment URLs are refused, and dial failures are retried instead of thrown;
- rotation ends open sessions;
- log noise is reduced.

The loop stopped there. Rotation was proven live: the old credential got 401, the new one 200, and the agent pid was unchanged. Items 2 and 3 were re-run through the relay on the final code. Outcomes & Retrospective is written in the spec.

## Environment and judgement calls

- **Board.** I moved #11 with the issue-tracker scripts, as the dispatch brief instructed. This executor role's default is never to write the board, and the brief's explicit instruction overrode it.
- **Firewall.** The mini's application firewall allows only nvm's node v24.18.0 to accept connections; Homebrew node 26.4 is not listed. All `--http` listeners ran under nvm's node, and `agent install` prints which node the firewall judges.
- **Tunnel.** ngrok used the owner's existing ngrok configuration. The tunnel ran only for the proof and was stopped afterwards. Every request through it needed the client credential.
- **Credentials.** The client credential lived in 0600 files under `~/.cua-phase-e` on the MacBook and was never printed. Grep counts of it in every client transcript were 0. The files were deleted at teardown.
- **State left behind:** none.
  - Mini: job uninstalled, enrolment removed (doctor `agent.*` rows read `skip`), worktree removed, main checkout untouched.
  - MacBook: relay and tunnel stopped. The temporary `CUA_HOME` used for the locked-screen proof was removed.
  - One owner-side `cua serve` run entry (`8dea2c54…`) existed on the mini throughout; it is the owner's live stdio server and was never touched.
- **The repo-facts manifest is absent** (`.doperpowers/repo-facts.md` does not exist).

## Residue

These deserve their own tickets:

1. **A hosted relay for real use.** v1 ran the relay only behind a temporary tunnel. Real use needs a stable host behind nginx or Caddy, or Tailscale HTTPS/Funnel. Funnel needs the owner to enable it in the tailnet admin console. `relay/README.md` has the proxy requirements.
2. **Acceptance from a cloud or Linux client.** Item 6's client was the MacBook over the internet. A cloud VM client (Phase F's VM is a candidate) and an nginx-fronted relay remain unexercised.
3. **Reboot and login proof for the launchd job.** Item 5 used the bootout/bootstrap cycle. A real reboot, with auto-login and the job starting at login, was not run. The same goes for the locked-screen refusal on the device itself through launchd, and the `onConsole: false` branch (another user at the console).
4. **`scripts/accept-native.mjs` requires `doctor.ok`.** On an enrolled Mac with a locked screen, `agent.console` now fails, so that acceptance script refuses. Exempting `agent.*` rows there, or documenting it, is a small follow-up.
