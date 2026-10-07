# cua's own Chrome extension and native host (board #10, option B)

## Purpose

Today cua drives Chrome through OpenAI's "ChatGPT" Chrome extension and its signed native host, and that route only
works after a Codex login (`cua login`), because the extension's `getInfo` answer makes the vendor service look up the
caller's identity before every browser request. After this change a user installs cua's own extension ("cua") from
the Chrome Web Store (or loads it unpacked), runs `cua chrome register`, and the browser surface works with **no
ChatGPT or OpenAI account at all**: `cua doctor` passes with `codex.login` skipped, `cua profiles bind <key>` binds the
profile, and the agent's `cua.getBrowser(...)`/`createBrowserTab` calls behave exactly as before, because the agent-facing
API (the vendor's `browser-service.mjs`, pinned inside the runtime) is unchanged. The cloud VM template then provisions
a browser-capable device unattended (no ChatGPT sign-in, no `cua login`), and a user's Mac is onboarded without a
ChatGPT account. The OpenAI extension route keeps working side by side until cua's Store listing is live; its removal
is a later ticket.

The owner's stated reason for this initiative (2026-10-07) is "users without a ChatGPT account"; the two other reasons
on the table (independence from OpenAI's update cadence and policy, lifting the vendor API's limits such as the 3 s
locator cap and read-only `evaluate`) are served partly (the first) or not at all (the second). The second needs cua's
own service in place of the vendor's (the session's "option C"); the extension built here is designed so that C reuses
it unchanged.

## Progress

- [x] (2026-10-07) Research: the installed extension's code and the readable desktop bundle read; facts recorded below.
- [x] (2026-10-07) Design approved by the owner in a live brainstorming session (name "cua", user-tab claims included,
      Web Store unlisted distribution, minimal popup, vendor route kept until the listing is live).
- [ ] S0 — spike: the vendor service without `agentRequestHeaderEnabled`, no login, normal network; dead backend paths.
- [ ] H1 — the host and its contract with the vendor service, proven against a fake extension.
- [ ] H2 — registration, launch, discovery, binding and doctor for the cua route (code and tests, no live Chrome).
- [ ] H3 — the extension; live acceptance on this Mac from a scratch home with no login.
- [ ] H4 — Linux: the Tart VM and the cloud VM template, unattended.
- [ ] H5 — packaging, docs, the Store listing (owner action) and the acceptance section as written.

## Facts this design rests on

Read on 2026-10-07; citations are to the readable vendor tree `~/codex-app-src/readable/chatgpt-26.928.40906/` (`BS` =
`cua_node/@oai/browser-desktop/scripts/browser-service.mjs`, the runtime's pinned service) and to the installed
extension `hehggadaopoacecdllhhajmbjkdcmajg` 1.26.901.11451 (`EXT` = its `background.js`, minified to 14 lines, cited as
line:column). The desktop bundle contains the host side only; the extension is not in it.

- **Three layers.** (L1) The vendor service runs inside the node REPL that `cua serve` launches and gives the agent
  94 command types (17 `playwright_locator_*`, 11 Playwright page commands, 8 `cua_*` coordinate inputs, 2 `tab_ax_*`,
  screenshots, dialogs, clipboard, …; defined at BS:31979–35713). (L2) It talks to a **backend** over a Unix socket:
  u32 length-prefixed JSON-RPC 2.0, 23 request methods (client class at BS:67808–68110), one notification it sends
  (`webMcpToolInvoked`), and from the backend it expects the request `ping` (answered "pong", BS:68147) and the
  notifications `onCDPEvent`, `onCDPDetach`, `onPageEvent`, `onDownloadChange`. (L3) The vendor's native host
  `extension-host` (Rust, 1 MB, signed) is a content-blind relay: `strings` on it has no backend method name at all;
  it bridges the socket to Chrome native messaging, checks the socket peer's code signature, and proxies the side
  panel's app-server. The extension implements every backend method itself (EXT L8:C63748 `Kf`, per-session logic
  `Rs` at L8:C71868) and maps `executeCdp` to `chrome.debugger.sendCommand` (L8:C87929). It builds no accessibility
  tree and runs no page logic: page intelligence is all in L1 (`browser-accessibility.wasm.br` beside BS).
- **The login chain.** The extension's `getInfo` always carries `agentRequestHeaderEnabled` (EXT L8:C68493, a local
  flag false by default). When that field is present, the service runs `readRequestHeaderEnabled` before every backend
  request except `getInfo` (BS:68066–68092, wired at BS:68363); it awaits the identity promise or throws "Browser
  request-header policy requires caller identity." (BS:17686–17692); the identity comes from
  `https://chatgpt.com/backend-api/aura/identity` through node_repl's authenticated fetch, which asks `codex app-server`
  for the token under `CODEX_HOME` (BS:17655–17668, 17727–17735; measured in `docs/evidence/m9-original-chrome.md`
  55–73). When the field is **absent** the check is skipped (measured in `docs/evidence/m7-chrome-contract.md`
  118–133, under `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`; the normal-network case is S0's question). Nothing else on
  the browser route needs the login; native control never did.
- **Backend discovery.** `BROWSER_USE_BACKEND_PATHS` (absolute socket paths, `:`-separated) is used verbatim when set
  (BS:67723–67742); otherwise the service scans `/tmp/codex-browser-use` (BS:10567), a directory shared by every user
  on the machine. With `BROWSER_USE_AVAILABLE_BACKENDS=chrome` (set by `src/runtime/launch.mjs`) a backend is kept
  when its `getInfo` has `type:"extension"`; the availability name of that type is `chrome`.
- **Profile identity.** `getInfo.metadata.extensionInstanceId` is a UUID the extension keeps in `chrome.storage.local`
  under the key `extensionInstanceId` (EXT L14:C19175). When `metadata.extensionId` and `extensionInstanceId` are
  both present, the service reads Chrome's `Local State` and copies that extension's `Local Extension Settings`
  LevelDB to match a profile display name into `profileName` (BS:67352–67470). cua's own directory map
  (`src/profiles/directory-map.mjs`) reads the same LevelDB key for the same purpose, and `src/profiles/bind.mjs`
  binds by that mapping.
- **The vendor extension's semantics that the host notes already teach**: agent-created tabs are closed at turn end
  unless marked `handoff` or `deliverable` (`markTab {tabId, status}`; `finalizeTabs`), agent tabs live in a tab group
  named by `nameSession`, a session is `{session_id, turn_id, session_context}` on every request but `getInfo`,
  `turnEnded`, `ping`. The extension pings its host every 30 s and detaches every debugger when a ping fails
  (EXT L14:C9737); `getInfo` awaits its feature-flag client (3 s identity + 10 s Statsig timeouts), which can exceed the
  service's discovery timeout right after a service-worker start (inferred, not measured).
- **M7's adapter** `scripts/probe/chrome/adapter.mjs` already implements the backend side for seven methods
  (`getInfo getTabs createTab attach detach executeCdp turnEnded`) plus `onCDPEvent`/`onCDPDetach`, with child
  sessions, exact `No handler registered for method: <m>` fallbacks and ownership rules; `scripts/probe/chrome/
  {backend-server,frame,fake-extension,scenarios,vendor-layer}.mjs` are its socket server, framing, synthetic peer,
  15 fixture scenarios and the harness that runs the real vendor service against an owned backend
  (`node scripts/probe-chrome-contract.mjs --vendor`).

## Design

### Shape: thin extension, thick host

The vendor pairs a thick extension (session, tab leases, cleanup, 84 KB) with a content-blind host. cua inverts it:
the **extension** exposes Chrome's primitives (tabs, tab groups, `chrome.debugger`) over native messaging and keeps no
session state beyond "which tabs' debuggers do I hold"; the **host**, a Node program Chrome spawns per profile,
implements the vendor backend protocol with all session, turn and ownership semantics. Reasons: the host is tested in
`node:test` against a fake extension (the M7 pattern), while extension code is only testable live; the extension then
changes rarely, so Store re-reviews are rare; and option C needs exactly this extension (a CDP relay Playwright can
connect to), so it is built once. The alternative, porting the vendor extension's shape, was rejected for those three
reasons.

```
Claude Code ── cua serve (node REPL + vendor browser-service, L1)
                  │ Unix socket, u32-framed JSON-RPC 2.0: the vendor backend protocol (L2), unchanged
                  ▼
            cua host  src/chrome/host.mjs   (one per Chrome profile, spawned by Chrome, Node)
                  │ Chrome native messaging (stdio, u32-framed JSON): the cua extension protocol (~12 primitives)
                  ▼
            cua extension  extension/   (MV3 service worker + popup) ── chrome.debugger / chrome.tabs ──▶ tabs
```

### The extension (`extension/`)

Manifest V3, name **cua**, permissions `debugger`, `nativeMessaging`, `tabs`, `tabGroups`, `storage`; no
`host_permissions` and no content scripts (nothing runs in pages; the cursor overlay, favicon badges and popup
interception of the vendor extension are not reproduced). The manifest carries a `key` so the unpacked load and the
Store build share one extension id; that id is the constant `CUA_EXTENSION_ID` in `src/chrome/extension.mjs` and is
what registration, binding, doctor and the cloud template use. The extension's version is its own (Store review unit),
not cua's package version.

The service worker connects to the native host `io.github.ssfskim.cua` as soon as it starts, sends `hello`, and
reconnects every 5 s while disconnected (a `chrome.alarms` backup every minute keeps a suspended worker trying). When
the port drops, it detaches every debugger it holds: a host that is gone cannot clean up, so the extension does. It
keeps the instance id under `chrome.storage.local.extensionInstanceId` (the same key the vendor and cua's directory
map read), minted on first run.

Agent-created tabs are created inactive (`active:false`) so the user's focus is not taken, and are placed in a tab
group titled **cua** in their window (the only visible product semantic kept from the vendor: the user sees which
tabs not to touch). Chrome's own "cua started debugging this browser" infobar is the consent surface; the extension
adds none.

The popup (plain HTML + ES module, no build step) shows: host connected / disconnected (with the host name), the
instance id's first 8 characters (for a human to match against `cua profiles bind` output), and the count of tabs
whose debugger it holds. Nothing else.

### The extension protocol (extension ↔ host)

JSON-RPC 2.0 over native messaging, both directions, the same peer conventions as the vendor wire so M7's
`frame.mjs`/peer code is reused: numeric ids from 1 per direction, an error reply is `{code, message}` and rejects with
the bare message, an unknown method answers `No handler registered for method: <m>`. The methods are in Interfaces and
Dependencies; they are Chrome API primitives with Chrome's own error strings passed through, nothing interpreted.

### The host (`src/chrome/host.mjs`)

Spawned by Chrome through the launcher script registration writes (below); stdin/stdout are the native-messaging
port; stderr goes to `$CUA_HOME/chrome/logs/<instanceId>.log` (truncated at start; Chrome discards stderr). It exits
when the port closes (Chrome closed, extension disabled or reloaded) after releasing every socket client.

**Backend protocol coverage.** The host answers the vendor service's 23 methods as follows; everything not listed
answers the exact `No handler registered for method: <m>` string so the service takes its own fallbacks.

| Group | Methods | Behaviour |
|---|---|---|
| Core | `getInfo`, `getTabs`, `createTab`, `attach`, `detach`, `executeCdp`, `turnEnded`, `ping` | As M7's adapter, promoted: ownership enforced in the host, CDP passed through unchanged (the service issues ~127 distinct CDP methods and `tab_cdp_call` lets the agent issue more; a fixed allowlist would break it). `ping` is answered by the service, not sent by the host; the host sends none. |
| Frames | `attachTarget`, `detachTarget` | Child sessions from `Target.attachedToTarget` keep `{tabId, sessionId}`; a target names at most one of `sessionId`/`targetId` (M7 facts). |
| User tabs | `getUserTabs`, `claimUserTab`, `getCommittedTabUrl` | `getUserTabs` lists tabs in the profile that no session owns (id, title, url); `claimUserTab` makes the tab the session's (attach follows as a separate `attach`); the service's origin-access elicitation happens before and is not the host's concern. `getCommittedTabUrl` returns the tab's current committed URL. |
| Marking | `markTab`, `nameSession` | `markTab {tabId, status: "handoff"\|"deliverable"}` records the mark; `nameSession` renames the session's tab group. |
| No-op | `moveMouse` | Succeeds, does nothing (no overlay). |
| Fallback | `executeCdpWithCachedExpression`, `executeTabRead`, `followSessionTab`, `allowDownload`, `browserAuthNewTargetProtection`, `executeUnhandledCommand`, `getUserHistory`, … | `No handler registered for method: <m>` |
| Notifications sent | `onCDPEvent {source:{tabId, sessionId?}, method, params}`, `onCDPDetach {tabId, reason}` | Every `chrome.debugger` event/detach for a tab a session owns, forwarded unfiltered. `onPageEvent`, `onDownloadChange` are never sent. |

**`getInfo`** is `{type:"extension", family:"chrome", name:"cua", version:<extension version>, capabilities:{browser:[],
tab:[]}, metadata:{extensionId: CUA_EXTENSION_ID, extensionInstanceId}}` — and **no `agentRequestHeaderEnabled`**.
That omission is what removes the login (Facts, "The login chain"). Omitting a field the pinned service treats as
optional is honest about what the backend can do (it cannot add agent request headers) and is stable under cua's
version pin; it is not a bypass flag. `metadata.extensionId` is included so the service's own `profileName`
enrichment keeps labelling bind candidates.

**Sessions, turns, ownership.** The host serves several socket clients at once (one per `cua serve`, and this Mac
runs several Claude Code sessions). State: `clients` (socket → set of session ids), `sessions` (session_id →
{client, turn_id, tabs: tabId → {createdByUs, mark, attached, children}}). A session is created by the first request
carrying its `session_id`; `session_context` is accepted but not enforced (the vendor extension's `cached` check
protects a product cua does not have). A tab is owned by at most one session; `attach`/`executeCdp`/`detach` on a tab
another session owns is refused with the message `tab owned by another session`. `turnEnded {session_id}` detaches the
session's debuggers and closes its created tabs whose mark is absent; marked tabs stay open and leave the session's
ownership. A client disconnect runs `turnEnded` for each of its sessions. A `chrome.debugger` detach initiated by the
user (the infobar's Cancel, reason `canceled_by_user`) is forwarded as `onCDPDetach` and never re-attached: the user
released it. Attach on `Another debugger is already attached` is a refusal, not a retry.

**Socket placement and discovery.** Sockets live in `$CUA_HOME/chrome/backends/` (mode 0700, created by registration).
After `hello` the host reads `$CUA_HOME/profiles.json`: when a registered profile is bound to this instance id, the
socket is `<profileKey>.sock`; otherwise `<instanceId>.sock`. `cua serve` and the inventory (`src/profiles/inventory.mjs`)
set `BROWSER_USE_BACKEND_PATHS` to the `<key>.sock` path of every registered profile plus every `<instanceId>.sock`
present in the directory at launch — so a Chrome opened after `cua serve` started is found at its pre-listed path.
This lifts the one-VM-per-user limit the shared `/tmp/codex-browser-use` imposed on Linux. It depends on the service
tolerating listed paths with no listener; S0 measures that, and if it fails, the host puts its socket in the vendor
directory instead and `BROWSER_USE_BACKEND_PATHS` stays unset (the design's fallback, decided here so the executor does
not have to).

### Registration, launch, binding, doctor (`cua chrome …`, `cua serve`, `cua profiles …`, `cua doctor`)

`cua chrome register` becomes the cua route's registration: it writes `$CUA_HOME/chrome/host` (a shell launcher that
`exec`s the current Node — `process.execPath`, as `cua agent install` records it — with `<checkout>/src/chrome/host.mjs`),
creates `$CUA_HOME/chrome/backends/`, and writes the native-messaging manifest `io.github.ssfskim.cua.json`
(`allowed_origins: ["chrome-extension://<CUA_EXTENSION_ID>/"]`, description "cua browser native messaging host",
`type: stdio`) into every browser directory `browsersFor` lists, in the vendor's byte format (`manifestText`). It
never touches `com.openai.codexextension.json`, so `--replace`, the backups and the "desktop rewrites it" warning do not
apply to this route. The vendor route's registration stays reachable as `cua chrome register --vendor [--replace]`
and `cua chrome unregister --vendor`, unchanged, until the removal ticket. `cua chrome unregister` removes cua's
manifests and launcher. The registration record `$CUA_HOME/chrome/registration.json` gains `route: "cua"|"vendor"`.

`cua serve` (browser surface) adds `BROWSER_USE_BACKEND_PATHS` as above; nothing else in `src/runtime/launch.mjs`
changes. `src/profiles/chrome.mjs` exports `CUA_EXTENSION_ID` next to `OPENAI_EXTENSION_ID`; the directory map and the
profile status checks take the cua id (the vendor id only under the `--vendor` route). The bind rule is unchanged.

Doctor rows: `chrome.extension.<key>` reports the cua extension's presence in the profile directory;
`chrome.host.registered` reports the `io.github.ssfskim.cua` manifest and whether its path is cua's launcher;
`chrome.hosts.live` counts sockets in `$CUA_HOME/chrome/backends/` that accept a connection (a dead socket file is
removed, not counted); `codex.login` becomes `skip` with the text "not needed: the cua extension route needs no Codex
login (the ChatGPT extension route does)" unless the vendor route is registered, in which case it stays as today.
`chrome.host.config` (the vendor host's config file) is reported only under the vendor route.

### Distribution

`npm run extension:pack` zips `extension/` to `dist/cua-extension-<version>.zip` (no build step: the directory is the
extension). The owner lists it on the Chrome Web Store as **unlisted** (developer registration, one-time fee, upload,
review of a few days): reachable by link, auto-updating, installable by enterprise policy on Linux. Until the listing
is live, and on developer machines, the extension is loaded unpacked from `<checkout>/extension`
(`chrome://extensions` → Developer mode → Load unpacked), or on Linux by `--load-extension=<checkout>/extension` on
Chrome's command line, which `deploy/cloud-vm/cua-provision.sh` can set because it owns the desktop session's Chrome
launch. After listing, the template's `ExtensionInstallForcelist` names `CUA_EXTENSION_ID` with the Web Store update
URL (the line that names the OpenAI id today). The `key` in the manifest keeps the id identical across all three.

### What users see change

- README "Chrome" section: install the cua extension (Store link or unpacked), `cua chrome register`, `cua profiles
  add/bind`; the ChatGPT extension, `cua login` and `--replace` move to a "ChatGPT extension route (until removal)"
  subsection. "The server's Codex login" is rewritten as optional.
- `skills/cua-remote/SKILL.md` Part A step 2: browser prerequisites no longer include `cua login`.
- `deploy/cloud-vm/cua-provision.sh` + README: the owner checklist loses "ChatGPT sign-in" and `cua login --device-auth`;
  provisioning ends with a browser-ready device.
- Host notes, `profiles_list`, the secret wrappers (`src/services/browser.mjs`), `verify.mjs` and the acceptance runners:
  unchanged, because the agent-facing API is the same vendor service.

### Out of scope

Replacing the vendor service (option C); removing the vendor route, `cua login`, M12's host placement and
`chrome.host.config` (a follow-up ticket after the Store listing is live); MAWS's in-app browser; downloads, file
choosers, page events, WebMCP, browser management (they answer `No handler`, as the vendor's fallbacks expect); the
cursor overlay and favicon badges; Windows.

## Acceptance

All from the repository root unless stated. "Scratch home" means `CUA_HOME=$(mktemp -d /tmp/cua-h.XXXXXX)` with
`cua install` run in it and **never** `cua login`: it proves the no-login claim. Chrome is the owner's running Chrome;
profile `personal` is `Default`.

1. **No-login browser surface, end to end.** In a scratch home: `cua chrome register` (exit 0, prints the browsers
   written), the extension loaded unpacked in `personal`, popup shows "host: connected io.github.ssfskim.cua";
   `cua profiles add personal --chrome-profile Default`, `cua profiles bind personal` → `bound (automatic, by
   directory)`; `cua doctor --json` → `ok:true`, `codex.login: skip`, `chrome.extension.personal: pass`,
   `chrome.host.registered: pass (cua: io.github.ssfskim.cua …)`, `chrome.hosts.live: pass (1)`;
   `CUA_SHIM_SURFACES=browser node verify.mjs` → exit 0, `problems: []`;
   `node scripts/accept-chrome.mjs --live --profile personal --report <path>` → every scenario PASS, including the
   secret-substitution cell (`{{secret:…}}` filled into the loopback form, value absent from the report).
2. **The vendor manifest is untouched.** sha256 of every `com.openai.codexextension.json` under the browsers'
   `NativeMessagingHosts` before and after 1 is equal.
3. **User-tab claim.** With a loopback page opened as the user (not by the agent) in `personal`, the agent's
   `js` lists it through the vendor `user` tabs API, claims it, Chrome shows the debugger infobar, the origin-access
   elicitation reaches the client and is accepted by the plugin's hook, and the agent reads the page's marker. The
   tab stays open after `end_task`.
4. **Turn end.** Within one task the agent creates two tabs and marks one `handoff`; after `end_task` the unmarked
   tab is closed and the marked one remains, outside the cua tab group's ownership (the popup's held-tab count is 0).
5. **Several clients.** Two `cua serve` processes on the same host (two Claude Code sessions, or the acceptance runner
   twice in parallel) each drive their own tab in `personal`; neither sees the other's tab in `getTabs`, and a tab
   owned by one is refused to the other with `tab owned by another session`.
6. **Chrome after serve.** With `cua serve` already running, quitting and reopening Chrome makes the profile usable
   again without restarting `cua serve` (the socket reappears at its pre-listed path).
7. **Linux, unattended.** `deploy/cloud-vm/create-hetzner.sh` (or the Tart VM `cua-linux` with the same provisioning
   script) with no ChatGPT sign-in and no `cua login`: `cua doctor --json` `ok:true` with `chrome.hosts.live: pass (1)`,
   `CUA_SHIM_SURFACES=browser node verify.mjs` exit 0, `node scripts/accept/linux-chrome.mjs` PASS; the printed owner
   checklist contains neither sign-in step.
8. **Store build.** `npm run extension:pack` writes `dist/cua-extension-<version>.zip`; installed from the Store
   (after the owner's listing), `chrome://extensions` shows the same id as the unpacked load, and 1 passes with the
   Store install. (Gated on the owner's listing; recorded BLOCKED until then.)
9. **Vendor route unchanged.** `cua chrome register --vendor` behaves as `cua chrome register` did before this
   change (its tests pass unmodified apart from the flag); `cua doctor` with the vendor route registered shows
   `codex.login` as before.
10. `npm test` passes (≥ 785 + the new suites); `node scripts/probe-chrome-contract.mjs --fixtures` still passes.

## Constraints binding every milestone

- No attribution footers in commits, PRs or issues. Never read or print `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`
  or anything under a Chrome profile except the extension's own code directory and what `directory-map.mjs` already
  reads. Never kill Chrome, a host or the owner's processes; never click Chrome dialogs or TCC prompts for the user.
- No bypass flags in production: `BROWSER_USE_DISABLE_AMBIENT_NETWORK` and `BROWSER_USE_SECURITY_MODE` appear only
  inside S0 as a measured comparison.
- Node 22+; no new runtime dependency for the host (Node's `net`, `fs`, the existing `src/mcp` framing helpers or M7's
  `frame.mjs` promoted into `src/chrome/`); the extension has no dependencies and no build step.
- The plugin version (`.claude-plugin/plugin.json` + `marketplace.json`) is bumped in H5 (doctor text and README reach
  plugin users).
- The vendor route's code paths and tests stay green throughout; this is additive until the removal ticket.
- Do not touch `/Users/new/Developer/GitHub/MAWS`.

## Plan of Work

### S0 — Spike: the vendor service without the header field, and dead backend paths

Prototyping; deliverable is knowledge. Questions: (a) with `getInfo` lacking `agentRequestHeaderEnabled`, no Codex
login (scratch `CODEX_HOME`), and the network at the vendor default (no ambient-network switch), does the real
vendor service complete `createBrowserTab` + one `Runtime.evaluate` + `turnEnded` against the owned fixture backend?
(b) Same with `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`, as the comparison. (c) With `BROWSER_USE_BACKEND_PATHS` listing
one live socket and one path with no listener, does `listBrowsers` return the live one, and is the dead path retried
on the next `listBrowsers` after a listener appears there? (d) Does `getInfo` need `capabilities` (try without).
Build: extend `scripts/probe/chrome/vendor-layer.mjs`/`scenarios.mjs` with these scenarios (`--vendor` already launches
the real service against `backend-server.mjs`). Observe: PASS/FAIL per question in the report JSON. Promote: (a) PASS
→ the design stands; (a) FAIL but (b) PASS → stop and report to the owner (the design's no-login claim would rest on
a switch the constraints forbid; that is a fork under the gate). (c) PASS → socket placement as designed; FAIL → the
fallback in "Socket placement and discovery". Record verdicts in Surprises & Discoveries. Scope edge: no Chrome, no
extension code.

### H1 — The host and its contract with the vendor service

At the end: `node src/chrome/host.mjs` (started by a test harness with a fake native-messaging peer on stdio)
serves the backend protocol on a socket, and the vendor service, launched by the M7 harness against that socket,
completes the M7 vendor scenarios plus the new ones. Touches: `src/chrome/host.mjs`, `src/chrome/protocol.mjs` (the
extension protocol's method table and the JSON-RPC peer, promoted from `scripts/probe/chrome/{frame,adapter}.mjs`),
`src/chrome/extension.mjs` (`CUA_EXTENSION_ID`, host name constant), `test/chrome-host*.test.mjs` with
`test/helpers/fake-cua-extension.mjs` (a synthetic extension speaking the extension protocol: tabs, debugger state,
CDP answers, user-initiated detach, port drop). Decisions: the host is a plain program (`#!/usr/bin/env node` is not
relied on; the launcher passes the node path); the M7 adapter's ownership and child-session logic is reused by
promotion, not import from `scripts/`; the fake extension's Chrome error strings are the documented ones
(`Another debugger is already attached to the tab with id: N`, `No tab with given id N.`, `Debugger is not attached to
the tab with id: N.`). Not touched: registration, CLI, launch, doctor, the real extension. Proves: the behaviours in
"Sessions, turns, ownership" and the coverage table (each row pinned by a test), acceptance 5's refusal string, 10's
fixture suite.

### H2 — Registration, launch, discovery, binding, doctor for the cua route

At the end: `cua chrome register|unregister` manage the cua manifests and launcher (and `--vendor` keeps the old
behaviour), `cua serve` lists backend paths, `cua profiles` and `cua doctor` know the cua extension id and the socket
directory. Touches: `src/chrome/registration.mjs` (a second host record alongside the vendor one; `manifestText`
reused), `src/cli.mjs`, `src/runtime/launch.mjs`, `src/profiles/{chrome,checks,directory-map,inventory}.mjs`,
`src/runtime/doctor.mjs`, their tests (injected temporary manifest directories, as M12's tests do). Decisions: the
launcher script records node's real path and the checkout's real path (symlinked `npm link` checkouts must resolve
to real paths, as `NODE_REPL_TRUSTED_CODE_PATHS` already requires); `registration.json` gains `route`; `codex.login`'s
`skip` text as in the design; `chrome.hosts.live` probes sockets with a 500 ms connect and removes stale files. Not
touched: the extension, docs, the cloud template. Proves: acceptance 2 and 9 by tests; 1's doctor rows by tests
against fixtures; consumes H1's host path and constants.

### H3 — The extension, and live acceptance on this Mac

At the end: `extension/` exists (manifest with `key`, `background.js` service worker, `popup.html`, `popup.js`,
icons), loads unpacked, connects to the host, and acceptance 1–6 pass live from a scratch home. Touches:
`extension/`, `scripts/accept-chrome.mjs` and `scripts/accept/chrome-*.mjs` (new cells for user-tab claim, turn-end
marking, two-client refusal; the runner takes `--route cua|vendor`), `docs/evidence/2026-10-07-own-extension-acceptance.md`.
Decisions: the extension's JSON-RPC peer is a ~60-line copy of the host's conventions (no shared module: extensions
cannot import from the checkout); `chrome.debugger.attach` version `"1.3"`; `Target.getTargets` is answered from
`chrome.debugger.getTargets()` (the vendor extension's one special case); the user-tab acceptance opens the page via
`open -a "Google Chrome" --args --profile-directory=Default <url>`; the live run needs the owner's Chrome open with
the extension loaded, so the executor asks the owner once, in one message, to load it (path, profile) before the
live part and otherwise records BLOCKED. Not touched: Linux, docs, packaging. Proves: acceptance 1–6.

### H4 — Linux: the Tart VM and the cloud template

At the end: `deploy/cloud-vm/cua-provision.sh` installs the cua extension (unpacked from `/opt/cua/extension` via
`--load-extension` until the Store id is live; a `CUA_EXTENSION_SOURCE=store|checkout` parameter in `render.sh`
decides) and registers the host; the owner checklist drops both sign-in steps; the Tart VM `cua-linux` is switched to
the cua route and passes. Touches: `deploy/cloud-vm/`, `scripts/accept/linux-chrome.mjs`, `src/chrome/registration.mjs`
(Linux manifest directories, already listed by `browsersFor`), evidence. Decisions: Chrome's `--load-extension` must
be on the same command line the desktop session uses (the autostart entry the script writes); the force-list policy
line is written only for `store`. A throwaway Hetzner run is required (as #76 did), deleted afterwards. Proves:
acceptance 7.

### H5 — Packaging, docs, the Store listing, and the acceptance section as written

At the end: `npm run extension:pack`, README/skill/template docs updated, plugin version bumped, and every acceptance
item run and recorded (8 as BLOCKED until the owner's listing exists; the executor prints the owner's exact steps:
developer registration, upload of the zip, visibility unlisted, and what to send back — the Store URL — and does not
wait for it). Touches: `package.json`, `scripts/extension-pack.mjs`, `README.md`, `skills/cua-remote/SKILL.md`,
`deploy/cloud-vm/README.md`, `.claude-plugin/{plugin,marketplace}.json`, this spec's record. Proves: acceptance 8
(or BLOCKED), 10, and the re-run of 1–7 on the final branch.

## Concrete Steps

Working directory: the worktree of branch `feat/own-chrome-extension`.

```sh
npm test                                                       # all pass; counts rise per milestone
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-s0-fixtures.json     # 15/15 (H1: more)
CUA_HOME=$(mktemp -d /tmp/cua-s0.XXXXXX) node bin/cua.mjs install && \
  CUA_HOME=$CUA_HOME node scripts/probe-chrome-contract.mjs --vendor --report /tmp/cua-s0-vendor.json   # S0 verdicts
# H3 live (owner's Chrome open, extension loaded unpacked in Default):
export CUA_HOME=$(mktemp -d /tmp/cua-h3.XXXXXX); node bin/cua.mjs install
node bin/cua.mjs chrome register            # expect: "registered io.github.ssfskim.cua for chrome, edge, brave, opera, vivaldi"
node bin/cua.mjs profiles add personal --chrome-profile Default && node bin/cua.mjs profiles bind personal
node bin/cua.mjs doctor --json | jq '.ok, (.checks[] | select(.id | startswith("chrome") or . == "codex.login"))'
CUA_SHIM_SURFACES=browser node verify.mjs                                   # exit 0, problems: []
node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3.json   # all PASS
node bin/cua.mjs chrome unregister; rm -rf "$CUA_HOME"
# H4: ssh cua-linux, same sequence with DISPLAY=:0; deploy/cloud-vm/create-hetzner.sh … then delete the server
# H5:
npm run extension:pack                      # dist/cua-extension-<version>.zip
```

## Interfaces and Dependencies

**`src/chrome/extension.mjs`**: `export const CUA_EXTENSION_ID = '<32 lowercase a–p chars derived from the manifest key>'`,
`export const CUA_HOST_NAME = 'io.github.ssfskim.cua'`.

**The extension protocol** (host ↔ extension, JSON-RPC 2.0 over native messaging). Requests from the host:

| Method | Params | Result |
|---|---|---|
| `tabs.query` | `{}` | `[{id, windowId, url, title, active, groupId}]` |
| `tabs.create` | `{url?, windowId?}` | `{id, windowId}` (created inactive, added to the window's "cua" group) |
| `tabs.remove` | `{tabId}` | `{}` |
| `tabs.get` | `{tabId}` | `{id, windowId, url, title, status}` |
| `tabs.ungroup` | `{tabId}` | `{}` (a marked tab leaves the cua group at turn end) |
| `group.title` | `{windowId, title}` | `{}` |
| `debugger.attach` | `{tabId}` | `{}` |
| `debugger.detach` | `{tabId}` | `{}` |
| `debugger.sendCommand` | `{tabId, sessionId?, method, params?}` | the CDP result |
| `debugger.getTargets` | `{}` | `chrome.debugger.getTargets()` result |

Notifications from the extension: `hello {extensionId, extensionInstanceId, version}` (first message after connect),
`debugger.event {tabId, sessionId?, method, params}`, `debugger.detached {tabId, reason}`, `tabs.removed {tabId}`,
`tabs.updated {tabId, url?, title?, status?}`. Errors carry Chrome's `chrome.runtime.lastError.message` verbatim.

**`src/chrome/host.mjs`**: `export async function runHost({stdin, stdout, home, env})` (the program's `main` calls it
with the process streams); `export function createHost({extension, home, now})` returns `{handleBackendRequest(client,
message), onExtensionNotification(message), close()}` for tests, where `extension` is `{request(method, params)}`.

**`src/chrome/protocol.mjs`**: `encodeFrame`, `frameDecoder` (u32 LE length + JSON, the vendor wire; also the
native-messaging wire), `NO_HANDLER(method)`, `createPeer({send, handlers})`.

**Registration record** `$CUA_HOME/chrome/registration.json`: existing fields plus `route: "cua"|"vendor"`,
`launcher: <path>`, `backendsDir: <path>`.

**`cua serve` env** (browser surface): `BROWSER_USE_BACKEND_PATHS` as in "Socket placement and discovery".

No new npm dependencies.

## Surprises & Discoveries

- Observation: the vendor host binary is content-blind; the ChatGPT extension implements the backend protocol itself.
  Evidence: `strings` on `extension-host/macos/arm64/ChatGPT for Chrome` has no `getInfo`/`executeCdp`/`tabId`;
  `background.js` L8:C63748 registers every `Kf` method as an RPC handler (2026-10-07 research).

## Decision Log

- Decision (2026-10-07, owner + session): option B — cua's own extension and host, vendor service kept; name "cua";
  user-tab claims in scope; Web Store unlisted; minimal popup; the ChatGPT route stays until the listing is live.
  Alternatives: A (status quo, keeps the login), C (own service too — more work, changes the agent API; next step, not
  this one), Playwright-extension transport (`wip/m8-playwright-transport`: a harness missing six modules, never run
  live; its extension is third-party and tab-visibility-bound).
- Verification (2026-10-07, authoring): one independent spec review and one buildability review of the execution
  section, both on `opus` general-purpose with the adversarial-reviewer brief (the astra/sol gateways are at their
  usage limits until 2026-10-09); the branch gets `doperpowers:review-code` at the high rung, on `opus` for the same
  reason. Execution through `doperpowers:plan-executor`.

## Outcomes & Retrospective

Pending — written at finish.
