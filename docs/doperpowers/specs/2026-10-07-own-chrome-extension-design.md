# cua's own Chrome extension and native host (board #10, option B)

## Purpose

Today cua drives Chrome through OpenAI's "ChatGPT" Chrome extension and its signed native host, and that route only
works after a Codex login (`cua login`), because the extension's `getInfo` answer makes the vendor service look up the
caller's identity before every browser request. After this change a user installs cua's own extension ("cua") from
the Chrome Web Store (or loads it unpacked), runs `cua chrome register`, and the browser surface works with **no
ChatGPT or OpenAI account at all**: `cua doctor` passes with `codex.login` skipped, `cua profiles bind <key>` binds the
profile, and the agent's `cua.getBrowser(...)`/`createBrowserTab`/`tab.playwright` calls keep the same API, because the
agent-facing layer (the vendor's `browser-service.mjs`, pinned inside the runtime) is unchanged. The cloud VM template
then provisions a browser-capable device unattended (no ChatGPT sign-in, no `cua login`), and a user's Mac is onboarded
without a ChatGPT account. The ChatGPT extension route stays available (`cua chrome register --vendor`) until cua's
Store listing is live; a home uses one route at a time; the vendor route's removal is a later ticket.

The owner's stated reason for this initiative (2026-10-07) is "users without a ChatGPT account"; independence from
OpenAI's extension update cadence comes with it; lifting the vendor API's limits (3 s locator cap, read-only
`evaluate`) does not — that needs cua's own service in place of the vendor's (the session's "option C"), and the
extension built here is designed so that C reuses it unchanged.

## Progress

- [x] (2026-10-07) Research: the installed extension's code and the readable desktop bundle read; facts recorded below.
- [x] (2026-10-07) Design approved by the owner in a live brainstorming session (name "cua", user-tab claims included,
      Web Store unlisted distribution, minimal popup, vendor route kept until the listing is live).
- [x] (2026-10-07) Independent design review and buildability review (both opus, adversarial brief); 5 blocking and
      ~20 important/minor findings folded in (Decision Log, 2026-10-07 revision).
- [x] (2026-10-07 04:55) S0 — spike: the vendor service without `agentRequestHeaderEnabled`, no login, normal network; the extension key.
- [x] (2026-10-07 07:10) H1 — the host and its contract with the vendor service, proven against a fake extension.
- [x] (2026-10-07 09:40) H2 — registration, launch, discovery, binding and doctor for the cua route (code and tests, no live Chrome).
- [x] (2026-10-07 09:40) H3a — the extension, proven against the real host under a `chrome.*` stub (no owner needed).
- [x] (2026-10-08 00:10 UTC) H3b — live acceptance on this Mac from a scratch home with no login (owner loads the extension once).
      (2026-10-07 16:20) Runner built and reviewed clean; acceptance 2 PASS live; items 1, 3–6 BLOCKED on the owner's
      unpacked load. (2026-10-08) Owner loaded it; acceptance 1–6 PASS live (runner 40/40 twice, restart 11/11) after
      three runner fixes; `docs/evidence/2026-10-07-own-extension-acceptance.md`.
- [x] (2026-10-07 14:10) H4 — Linux: the Tart VM and the cloud VM template, unattended, with a self-hosted CRX.
- [x] (2026-10-07 16:20) H5 — packaging, docs, plugin 0.4.0, board #78 (Store listing, owner) and #79 (vendor-route
      removal, blocked by #78); acceptance 8 zip/CRX half and 10 pass. Remaining: 8's Store half (owner, #78) and the
      live Mac items with H3b.
- [ ] (2026-10-07) #81 — page guards (other extensions' frames, popups) and the host's refusal log; Decision Log
      2026-10-07 (#81). Code and stubbed contract done; live re-measurement pending.

## Facts this design rests on

Read on 2026-10-07 and re-verified by the design review; citations are to the readable vendor tree
`~/codex-app-src/readable/chatgpt-26.928.40906/` (`BS` = `cua_node/@oai/browser-desktop/scripts/browser-service.mjs`,
the runtime's pinned service) and to the installed extension `hehggadaopoacecdllhhajmbjkdcmajg` 1.26.901.11451
(`EXT` = its `background.js`, minified to 14 lines, cited as line:column). The desktop bundle contains the host side
only; the extension is not in it.

- **Three layers.** (L1) The vendor service runs inside the node REPL that `cua serve` launches and gives the agent
  94 command types (17 `playwright_locator_*`, 11 Playwright page commands, 8 `cua_*` coordinate inputs, 2 `tab_ax_*`,
  screenshots, dialogs, clipboard, …; BS:31979–35713). (L2) It talks to a **backend** over a Unix socket: u32
  length-prefixed JSON-RPC 2.0, 23 request methods (client class BS:67808–68110), one notification it sends
  (`webMcpToolInvoked`); from the backend it expects the request `ping` (answered "pong", BS:68147) and the
  notifications `onCDPEvent`, `onCDPDetach`, `onPageEvent`, `onDownloadChange`. (L3) The vendor's native host
  `extension-host` (Rust, 1 MB, signed) is a content-blind relay: `strings` on it has no backend method name; it
  bridges the socket to Chrome native messaging, checks the socket peer's code signature, and proxies the side panel's
  app-server. The extension implements every backend method itself (EXT L8:C63748 `Kf`, per-session `Rs` L8:C71868)
  and maps `executeCdp` to `chrome.debugger.sendCommand` (L8:C87929). It builds no accessibility tree: page intelligence
  is all in L1 (`browser-accessibility.wasm.br` beside BS).
- **The login chain.** The extension's `getInfo` always carries `agentRequestHeaderEnabled` (EXT L8:C68493). When the
  field is present (`!== undefined`, BS:68068–68072) the service runs the header check before every backend request
  except `getInfo`, awaiting the identity promise or throwing "Browser request-header policy requires caller
  identity." (BS:17686–17692); the identity comes from `https://chatgpt.com/backend-api/aura/identity` through
  node_repl's authenticated fetch, which asks `codex app-server` for the token under `CODEX_HOME` (BS:17655–17668,
  17727–17735; `docs/evidence/m9-original-chrome.md` 55–73). When the field is **absent** the check is skipped
  (`docs/evidence/m7-chrome-contract.md` 118–133, measured under `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`; the
  normal-network case is S0's question). Nothing else on the browser route needs the login.
- **Backend discovery.** `BROWSER_USE_BACKEND_PATHS` (absolute socket paths, `:`-separated) is used verbatim when set
  and the `/tmp/codex-browser-use` scan is then skipped entirely (BS:67723–67742; the scan directory BS:10567).
  Every `listBrowsers`/`getBrowser`/`getDefault`/`getForUrl` calls `refresh()` (BS:66038–66070); failed pipes are not
  cached (BS:67495–67590) and a connect is bounded by `NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000`
  (`src/runtime/launch.mjs`). So a listed path with no listener costs at most 1 s per call and is retried on the next
  call. With `BROWSER_USE_AVAILABLE_BACKENDS=chrome` a backend is kept when its `getInfo` has `type:"extension"`.
- **Profile identity.** `getInfo.metadata.extensionInstanceId` is a UUID the extension keeps in `chrome.storage.local`
  under the key `extensionInstanceId` (EXT L14:C19175); the service selects a backend by that id alone (BS:68272–68276).
  When `metadata.extensionId` is also present the service copies the extension's `Local Extension Settings` LevelDB
  per profile to label `profileName` (BS:67374–67437); M7 ruled that out ("never send these fields", m7:135–139) and
  cua's own directory map (`src/profiles/directory-map.mjs`) reads the same LevelDB key itself and
  `src/profiles/bind.mjs` binds by it. An **unpacked** extension never appears under `<profile>/Extensions/<id>/`;
  Chrome loads it from its source directory, but it still gets `Local Extension Settings/<id>/` on first run.
- **Vendor extension semantics the host notes teach the agent** (and this host reproduces): every request but
  `getInfo`, `turnEnded`, `ping` carries `{session_id, turn_id, session_context}`; `turnEnded` acts on the leases of
  that `turn_id` only (EXT near byte 187332): unmarked agent-created tabs close, `deliverable` tabs are released
  open, `handoff` tabs stay leased to the session with the debugger detached and resume on its next turn (EXT
  `handoffTabs`/`resumeHandoffTabs`; the agent docs at BS:5551 say "Handoff tabs can resume in your next turn unless
  another session has claimed them"). `executeCdp` carries `timeoutMs` and `preserveDebuggerOnTimeout` (BS:47565–47574);
  the extension enforces 10 s by default and detaches on timeout unless preserved (EXT `mg`), and the service's
  "Debugger is not attached" recovery (BS:47585–47595) relies on that. `attachTarget(tabId, targetId)` attaches
  `chrome.debugger` to `{targetId}` for cross-origin iframes (OOPIFs) and later `executeCdp` names
  `target:{tabId, targetId}` (BS:47718–47757; detach BS:48656); the service swallows an `attachTarget` failure, so a
  backend without it silently loses frames. `createTab {preferredWindowId}` (BS:68000–68008): the extension picks that
  window, else the focused one, else any, else creates one unfocused. `claimUserTab` returns `{id, title?, url?}`
  (BS:27535–27548). The vendor extension pings its host every 30 s and detaches all on failure (EXT L14:C9737).
- **Chrome platform facts.** Native messaging: host→extension messages are capped at 1 MB, extension→host at 64 MiB;
  a connected native port keeps an MV3 service worker alive (Chrome 105+); nothing wakes the worker after a Chrome
  restart unless `runtime.onStartup`/`onInstalled` listeners exist. `--load-extension` is removed from branded Google
  Chrome 137+ (Chromium PSA; it still works in Chromium and Chrome for Testing); on Linux `ExtensionInstallForcelist`
  accepts an off-store update URL (H4 verifies this first). The Chrome Web Store rejects a manifest containing `key`;
  to keep a development id, the first upload is a zip without `key` that contains the private `key.pem` at its root.
  macOS limits a Unix socket path to 103 bytes (`sun_path` 104).
- **M7's spike code** `scripts/probe/chrome/{adapter,backend-server,frame,fake-extension,scenarios,vendor-layer}.mjs`
  carries over: `frame.mjs` (the u32 framing), the exact `No handler registered for method: <m>` rule, the
  child-session (`Target.attachedToTarget`, flatten) and "a target names at most one of sessionId/targetId" rules, and
  the harness that launches the real vendor service against an owned backend (`node scripts/probe-chrome-contract.mjs
  --vendor`, `vendor-layer.mjs`, which today hard-wires the Playwright-shaped fixture and
  `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`). Its adapter's session model (one offered-tab pool, no per-session
  ownership, string errors, no closing on `turnEnded`) does not carry over: the host's session model is new code.

## Design

### Shape: thin extension, thick host

The vendor pairs a thick extension (session, tab leases, cleanup, 84 KB) with a content-blind host. cua inverts it:
the **extension** exposes Chrome's primitives (tabs, windows, tab groups, `chrome.debugger`) over native messaging and
keeps no state beyond which debuggees it holds; the **host**, a Node program Chrome spawns per profile, implements the
vendor backend protocol with all session, turn and ownership semantics. Reasons: the host is tested in `node:test`
against a fake extension, and the real extension against the real host under a `chrome.*` stub, while live Chrome is
needed only for acceptance; the extension then changes rarely, so Store re-reviews are rare; and option C needs exactly
this extension (a CDP relay Playwright can connect to), so it is built once. Porting the vendor extension's shape was
rejected for those three reasons.

```
Claude Code ── cua serve (node REPL + vendor browser-service, L1)
                  │ Unix socket, u32-framed JSON-RPC 2.0: the vendor backend protocol (L2), unchanged
                  ▼
            cua host  src/chrome/host.mjs   (one per Chrome profile, spawned by Chrome through the launcher, Node)
                  │ Chrome native messaging (stdio, u32-framed JSON): the cua extension protocol (~14 primitives)
                  ▼
            cua extension  extension/   (MV3 service worker + popup) ── chrome.debugger / chrome.tabs ──▶ tabs
```

### The extension (`extension/`)

Manifest V3, name **cua**, permissions `debugger`, `nativeMessaging`, `tabs`, `tabGroups`, `storage`, `alarms`,
`scripting`, and `host_permissions: ["<all_urls>"]`. No content script is declared; the only code cua runs in pages is
the **page guard**, injected with `chrome.scripting.executeScript` into tabs the host owns and nowhere else (Decision
Log, 2026-10-07, #81). In a guarded tab it blanks every other extension's frame (`srcdoc=""` on an iframe,
`about:blank` on a frame; open and closed shadow roots included) as it appears (MutationObserver) and on the host's
request before each attach, because Chrome detaches `chrome.debugger` from a tab, and refuses to attach it again,
while another extension's frame is in it. In the top frame only (a sandboxed subframe must not open tabs through it),
it also takes a user-activated `window.open` (no target or `_blank`) or `target=_blank` link of an http(s) URL and has
the host open it as the session's tab (the page gets a stand-in window), instead of Chrome opening a tab no session
owns; calls with window features (sized sign-in popups that need `window.opener`) and named targets (a frame or window
anywhere in the frame tree) are left to Chrome. An unguard that arrives while a guard is installing wins. A tab
is guarded from its creation (`tabs.create {guard}`) or the host's `tabs.guard`, every new document as it commits,
until `tabs.unguard`, the tab's removal or the port dropping. The vendor's cursor overlay and favicon badges are not
reproduced. The manifest carries `key` (the public key) so the unpacked load, the self-hosted
CRX and the Store build share one id; the id is `CUA_EXTENSION_ID` in `src/chrome/extension.mjs`, derived from that
key (first 32 hex chars of sha256(DER public key), `0-f` → `a-p`; a test recomputes it from `extension/manifest.json`).
The private key lives with the owner at `~/.config/cua/extension-key.pem` (0600, never in git, never printed); the
pack script needs it only for the CRX. The extension's version is its own (Store review unit), not cua's package
version; `hello` carries `protocolVersion: 1`, and the host refuses a different major with a logged, popup-visible
`protocol_mismatch`.

The service worker connects to the native host `io.github.ssfskim.cua` from `runtime.onStartup`, `runtime.onInstalled`
and its own top level, sends `hello`, and while disconnected retries every 5 s plus a `chrome.alarms` backup every
minute. When the port drops it detaches every debuggee it holds: a host that is gone cannot clean up, so the extension
does. It keeps the instance id under `chrome.storage.local.extensionInstanceId` (the key the vendor and cua's directory
map read), minted on first run — which also creates `Local Extension Settings/<id>/`, the presence signal cua uses for
unpacked loads.

Agent-created tabs are created inactive (`active:false`) so the user's focus is not taken, and are placed in a tab
group per **session** (key = `session_id`, title "cua" until `nameSession`), so concurrent sessions never rename each
other's group and the user sees which tabs not to touch. Chrome's own "cua started debugging this browser" infobar is
the consent surface; the extension adds none.

The popup (plain HTML + ES module, no build step) shows: host connected / disconnected (host name, and
`protocol_mismatch` when that is why), the instance id's first 8 characters (for a human to match against
`cua profiles bind` output), and the count of debuggees it holds. Nothing else.

### The extension protocol (extension ↔ host)

JSON-RPC 2.0 over native messaging, both directions, with the vendor wire's peer conventions so one peer module
serves both wires: numeric ids from 1 per direction, an error reply is `{code, message}` and rejects with the bare
message, an unknown method answers `No handler registered for method: <m>`. The methods (Interfaces and Dependencies)
are Chrome API primitives; a debuggee is `{tabId}` or `{targetId}` (OOPIF frames), Chrome's own error strings pass
through, nothing is interpreted. The host refuses to send a frame over 1 MB (`message_too_large`) rather than let Chrome
tear the port down.

### The host (`src/chrome/host.mjs`)

Spawned by Chrome through the launcher registration writes (below); stdin/stdout are the native-messaging port;
stderr goes to `$CUA_HOME/chrome/logs/<pid>.log` (renamed to `<socketName>.log` after `hello`; truncated at start;
Chrome discards stderr). It exits when the port closes (Chrome closed, extension disabled or reloaded) after running
turn-end cleanup for every session and closing every socket client.

**Backend protocol coverage.** The host answers the vendor service's 23 methods as follows; everything not listed
answers the exact `No handler registered for method: <m>` string so the service takes its own fallbacks.

| Group | Methods | Behaviour |
|---|---|---|
| Core | `getInfo`, `getTabs`, `createTab`, `attach`, `detach`, `executeCdp`, `turnEnded`, `ping` | Ownership enforced here; CDP passed through unchanged (the service issues ~127 distinct CDP methods and `tab_cdp_call` lets the agent issue more). `createTab {preferredWindowId?}` picks that window, else the focused normal window, else any, else `windows.create {focused:false}`. `executeCdp` honours `timeoutMs` (default 10 000) and on timeout detaches the debuggee unless `preserveDebuggerOnTimeout`, answering the vendor's `Debugger is not attached` wording so the service's one re-attach works. `ping` is answered by the service, never sent by the host. |
| Frames | `attachTarget {tabId, targetId}`, `detachTarget` | `debugger.attach {targetId}`; the host maps targetId → owning tab for ownership and routes `executeCdp` with `target:{tabId, targetId}` to that debuggee. Child sessions from `Target.attachedToTarget` (flatten) keep `{tabId, sessionId}`; a target names at most one of `sessionId`/`targetId`. |
| User tabs | `getUserTabs`, `claimUserTab`, `getCommittedTabUrl` | `getUserTabs` lists tabs no session owns (id, title, url); `claimUserTab` leases the tab to the session for this turn and returns `{id, title?, url?}`; the service's origin-access elicitation happens before and is not the host's concern. `getCommittedTabUrl` returns the tab's current URL. |
| Marking | `markTab {tabId, status}`, `nameSession {name}` | records `handoff`/`deliverable`; renames the session's group. |
| No-op | `moveMouse` | Succeeds, does nothing. |
| Fallback | `executeCdpWithCachedExpression`, `executeTabRead`, `followSessionTab`, `allowDownload`, `browserAuthNewTargetProtection`, `executeUnhandledCommand`, `getUserHistory` | `No handler registered for method: <m>` |
| Notifications sent | `onCDPEvent {source:{tabId, sessionId?, targetId?}, method, params}`, `onCDPDetach {tabId, reason}` | Every `chrome.debugger` event/detach for a debuggee a session owns, to that session's client. `onPageEvent`, `onDownloadChange` never. |

**What differs from the vendor backend, by design:** `getInfo.capabilities` is `{browser:[], tab:[]}` (no viewport,
management, page assets or WebMCP), `getUserHistory`/bookmarks/top sites answer `No handler`, there is no cursor
overlay, and `profileName` is not labelled by the vendor (cua's directory map labels bind candidates instead).

**`getInfo`** is `{type:"extension", family:"chrome", name:"cua", version:<extension version>, capabilities:{browser:[],
tab:[]}, metadata:{extensionInstanceId}}` — **no `agentRequestHeaderEnabled`** and, per M7's rule, no `extensionId`.
The omission is what removes the login (Facts, "The login chain"): the backend honestly cannot add agent request
headers, the pinned service treats the field as optional, and the pin makes the behaviour stable; it is not a bypass
flag.

**Sessions, turns, ownership.** The host serves several socket clients at once (one per `cua serve`; this Mac runs
several Claude Code sessions). State: `clients` (socket → session ids), `sessions` (session_id → {client, groupId per
window, tabs}), each owned tab `{tabId, turnId, origin: created|claimed, mark: none|handoff|deliverable, debuggees:
Set, children: sessionId → targetId}`. A session is created by the first request carrying its `session_id`;
`session_context` is accepted, not enforced. A tab is owned by at most one session; `attach`/`executeCdp`/`detach`/
`markTab` on a tab another session owns is refused with the message `tab owned by another session`. `turnEnded
{session_id, turn_id}` acts on that turn's tabs only (a late `turnEnded` for task N must not touch task N+1's tabs,
which cua creates immediately after `end_task` with `turn_id = taskId`): unmarked created tabs are closed; unmarked
claimed tabs and `deliverable` tabs are released open and leave the group; `handoff` tabs stay owned with the debugger
detached and are listed by `getTabs` on the session's next turn. A client disconnect runs `turnEnded` for every turn of
its sessions. A detach initiated by the user (reason `canceled_by_user`) is forwarded as `onCDPDetach` and never
re-attached. `Another debugger is already attached` from Chrome is success: Chromium raises it only when this same
extension already holds the debuggee (DevTools and other extensions attach alongside), so the extension adopts the
debuggee into its held set and answers `{alreadyHeld:true}`, as the vendor extension does.

**Page guards and popups.** The host guards the tabs it owns: created tabs from creation (`tabs.create {guard:true}`),
and every owned tab again (`tabs.guard`, a sweep) before each `attach`/`attachTarget`, waited for at most 1.5 s
(`GUARD_WAIT_MS`: an open JavaScript dialog stops `chrome.scripting`, and attaching is how the agent dismisses it); a
guard Chrome refuses (a page cua may not script, such as `about:blank`) is logged and ignored. An attach Chrome refuses with `Cannot access a
chrome-extension:// URL of different extension` is swept once more and retried once; a second refusal is the
service's answer. A turn's end unguards its handoff tabs (the user works in them; the next turn's attach guards them
again) and the tabs it releases open, without waiting for the answer; tabs it closes need nothing. `tabs.popup {openerTabId, url}` is taken when the
opener is owned by a session whose current turn it belongs to: the host opens `url` with `tabs.create {openerTabId,
group, guard:true}` and owns it as a created tab of that turn, the session's active tab (vendor parity:
`handleAgentBackgroundPopup` claims the popup as the logical active tab); otherwise it is dropped and logged. Every
request the extension refuses is logged (`extension refused <method> <debuggee or tab> [CDP method]: <Chrome's
message>`), never CDP params, which can carry substituted secrets.

**Socket placement and discovery.** Sockets live in `$CUA_HOME/chrome/b/` (0700; the short name keeps the path under
the macOS limit for any username up to 37 characters at the default home; `register` refuses a home whose worst-case
path exceeds 103 bytes with `socket_path_too_long`). The socket name is `h(instanceId)` = the first 12 hex chars of
sha256(instanceId); the host never reads `profiles.json`. At listen, a stale file is probed: unlinked when dead,
and when live the new host logs `already_served` and exits (the worker reconnected before the old host exited). Beside
the socket the host keeps `<name>.json` `{instanceId, extensionVersion, protocolVersion, pid, sessions:[{session_id,
turn_id, tabs:[{tabId, origin, mark, attached}]}], updatedAt}`, rewritten on every change: that is how doctor, the
acceptance runner and a human observe the host without a popup. `cua serve` and the inventory set
`BROWSER_USE_BACKEND_PATHS` to `h(instanceId)` for every bound profile in `profiles.json` plus every `*.sock` present
in the directory at launch; a Chrome opened after `cua serve` started is found at its pre-listed path on the next
`listBrowsers` (Facts: dead paths are retried per call, ≤ 1 s each). There is no shared `/tmp` directory, so Linux no
longer needs one VM per user.

**Socket trust.** The vendor host checks its socket peer's code signature; cua's host accepts any process of the same
user that can open the 0700 directory. That is a deliberate narrowing: the owner's model for cua is allow-all
approvals and a 0600 plain-file secret store, so a same-user process is already trusted everywhere else in cua, and a
model cell with the sandbox off can already drive Chrome by other means. Recorded in the Decision Log; revisited if
the trust model changes.

### Registration, launch, binding, doctor (`cua chrome …`, `cua serve`, `cua profiles …`, `cua doctor`)

A home has one **route**, `cua` or `vendor`, set by whichever registration ran last and recorded in
`$CUA_HOME/chrome/cua-registration.json` (the cua record; the vendor route keeps its own `registration.json` untouched,
so neither overwrites the other's backups). `cua chrome register` is the cua route: it writes
`$CUA_HOME/chrome/host`, a shell launcher that exports `CUA_HOME=<this home, absolute real path>` and `exec`s
`process.execPath` with `<checkout real path>/src/chrome/host.mjs` (Chrome spawns the host with its own environment,
so the home must be baked in; real paths because `npm link` checkouts are symlinks), creates `chrome/b/` and
`chrome/logs/`, and writes the native-messaging manifest `io.github.ssfskim.cua.json` (`allowed_origins:
["chrome-extension://<CUA_EXTENSION_ID>/"]`, description "cua browser native messaging host", `type: stdio`, the
vendor's byte format via `manifestText`) into every browser directory `browsersFor` lists. A manifest of that name
that already names another home's launcher is refused (`other_home`, hint `--replace`); `--replace` records the
previous path in the record so `cua chrome unregister` restores it, and `unregister` removes only a manifest that
names this home's launcher. The vendor route stays as `cua chrome register --vendor [--replace]` and `unregister
--vendor`, the existing functions unchanged. Switching a home's route re-labels every binding: `profiles.json`
bindings gain `route`, `profiles list`/`profiles_list` report `rebind_required` for a binding made under the other
route, and `cua profiles bind` re-binds.

`cua serve` (browser surface) sets `BROWSER_USE_BACKEND_PATHS` as above when the route is `cua` and leaves it unset on
the vendor route (setting it would hide the vendor's scanned sockets). `src/profiles/chrome.mjs` re-exports
`CUA_EXTENSION_ID` from `src/chrome/extension.mjs`; the directory map and the presence check take the route's id, and
for the cua id **presence** is `<profile>/Extensions/<id>/` *or* `<profile>/Local Extension Settings/<id>/`
(unpacked loads only have the second). The bind rule is unchanged.

Doctor rows: `chrome.extension.<key>` uses that presence rule; `chrome.host.registered` reports the
`io.github.ssfskim.cua` manifest, whether its path is this home's launcher, and whether the launcher's node and
`host.mjs` targets still exist (a plugin update moves the checkout); `chrome.hosts.live` counts sockets in
`chrome/b/` that accept a connection within 500 ms (a file refused with `ECONNREFUSED` is removed; a timeout is
reported, not removed) — doctor's header note "never connects" is amended for this one row; `codex.login` is `skip`
with the text "not needed: the cua extension route needs no Codex login (the ChatGPT extension route does)" on the cua
route and unchanged on the vendor route; `chrome.host.config` is reported only on the vendor route.

### Distribution

`npm run extension:pack` writes `dist/cua-extension-<version>.zip` (the Store upload: `extension/` without the
`key` field) and, when `CUA_EXTENSION_KEY=<pem path>` is set, `dist/cua-extension-<version>.crx` (CRX3 signed with the
owner's key, so its id is `CUA_EXTENSION_ID`) and `dist/update.xml` (the Chrome update manifest naming the CRX URL).
The owner lists the zip on the Chrome Web Store as **unlisted** — developer registration, one-time fee, first upload
with `key.pem` at the zip root so the Store keeps the id, visibility unlisted, review of a few days — and the Store
build then auto-updates and is policy-installable. Until then, and for Linux VMs before the listing: a Mac developer
loads `<checkout>/extension` unpacked (`chrome://extensions` → Developer mode → Load unpacked); a Linux VM
force-installs the self-hosted CRX through `ExtensionInstallForcelist` with `dist/update.xml` served by the relay
host (`relay/deploy/update.sh --ext <dist dir>` copies it to a Caddy `file_server` route `/ext/`). After listing, the
template's force-list line names `CUA_EXTENSION_ID` with the Web Store update URL. The `key` keeps the id identical
across all three, so registration, binding and doctor never care which one is installed.

### What users see change

- README "Chrome": install the cua extension (Store link or unpacked), `cua chrome register`, `cua profiles add/bind`;
  the ChatGPT extension, `cua login` and `--replace` move to a "ChatGPT extension route (until removal)" subsection;
  "The server's Codex login" becomes optional. `CLAUDE.md`'s line that Chrome is driven "through the original OpenAI
  extension and host" is updated.
- `skills/cua-remote/SKILL.md` Part A step 2: browser prerequisites no longer include `cua login`.
- `deploy/cloud-vm/cua-provision.sh` + README: the extension source is a parameter (`store` after listing, `hosted`
  with the update URL before); the owner checklist loses "ChatGPT sign-in" and `cua login --device-auth`; the wait loop
  uses the presence rule above.
- Host notes, `profiles_list`, the secret wrappers (`src/services/browser.mjs`) and `verify.mjs` are unchanged. The
  acceptance runners change: `scripts/accept-chrome.mjs` takes `--route cua|vendor` (on `cua` the Codex-login gate is
  skipped and live hosts are counted by sockets), gains cells for the new behaviours, and documents a user-tab
  exception for acceptance 3; `scripts/accept/linux-chrome.mjs` stops asserting a host under `$CUA_HOME/runtimes`.

### Out of scope

Replacing the vendor service (option C); removing the vendor route, `cua login`, M12's host placement and
`chrome.host.config` (a follow-up ticket, registered in H5, after the Store listing is live); MAWS's in-app browser;
downloads, file choosers, page events, WebMCP, browser management, history/bookmarks (they answer `No handler`); the
cursor overlay and favicon badges; peer code-signature checks on the socket; Windows.

## Acceptance

All from the repository root unless stated. "Scratch home" means `CUA_HOME=$(mktemp -d /tmp/cua-h.XXXXXX)` with
`cua install` run in it and **never** `cua login`; the negative control is that `$CUA_HOME/state/codex/auth.json` does
not exist (an existence check only). Chrome is the owner's running Chrome; profile `personal` is `Default`.

1. **No-login browser surface, end to end.** In a scratch home: `cua chrome register --replace` (exit 0; prints the
   browsers written and the previous launcher it recorded), the extension loaded unpacked in `personal` (popup shows
   "host: connected io.github.ssfskim.cua"); `cua profiles add personal --chrome-profile Default`,
   `cua profiles bind personal` → `bound (automatic, by directory)` with the extension loaded **unpacked**;
   `cua doctor --json` → `ok:true`, `codex.login: skip`, `chrome.extension.personal: pass`,
   `chrome.host.registered: pass (cua: io.github.ssfskim.cua …)`, `chrome.hosts.live: pass (1)`;
   `CUA_SHIM_SURFACES=browser node verify.mjs` → exit 0, `problems: []`;
   `node scripts/accept-chrome.mjs --live --route cua --profile personal --report <path>` → every scenario PASS,
   including the secret-substitution cell (`{{secret:…}}` filled into the loopback form, value absent from the
   report) and a cross-origin iframe cell (a locator inside an iframe served from a second loopback port). The report
   records `goto` latency per navigation. Finally `cua chrome unregister` restores the previous manifest.
2. **The vendor manifest is untouched.** sha256 of every `com.openai.codexextension.json` under the browsers'
   `NativeMessagingHosts` before and after 1 is equal, and after 1's `unregister` the `io.github.ssfskim.cua.json`
   files are byte-identical to before 1 (or absent, if absent before).
3. **User-tab claim.** With a loopback page opened as the user in `personal` (`open -n -a "Google Chrome" --args
   --profile-directory=Default <url>`, not by the agent), the agent's `js` lists it through the vendor `user` tabs
   API, claims it, the origin-access elicitation reaches the client and the runner answers accept (what the plugin's
   hook does in Claude Code, proven by #66), Chrome shows the debugger infobar, and the agent reads the page's marker.
   After `end_task` the tab is open and `<name>.json` lists it under no session.
4. **Turn end and handoff.** Within one task the agent creates three tabs and marks one `handoff`, one `deliverable`;
   after `end_task`, `<name>.json` shows: the unmarked tab closed, the deliverable tab open and unowned, the handoff tab
   open, owned by the session, `attached:false`; the next task's `browser.tabs.list()` in the same session lists the
   handoff tab.
5. **Several clients.** Two `cua serve` processes (the runner twice in parallel) each drive their own tab in
   `personal`; neither lists the other's tab in `getTabs`, and `executeCdp` on the other's tab is refused with
   `tab owned by another session`.
6. **Chrome after serve.** With `cua serve` running and a task open, the owner quits and reopens Chrome: the open task's
   next `js` fails with a classified backend error (no hang beyond the vendor's timeout), `end_task` succeeds, and a
   new task drives the profile without restarting `cua serve` (the socket reappeared at its pre-listed path).
7. **Linux, unattended.** `deploy/cloud-vm/create-hetzner.sh` with the `hosted` extension source (or the Tart VM
   `cua-linux` with the same provisioning script), no ChatGPT sign-in and no `cua login`: `cua doctor --json` `ok:true`
   with `chrome.hosts.live: pass (1)`, `CUA_SHIM_SURFACES=browser node verify.mjs` exit 0,
   `node scripts/accept/linux-chrome.mjs` PASS; the printed owner checklist contains neither sign-in step.
8. **Store build.** `npm run extension:pack` writes the zip (no `key` in its manifest) and, with the owner's key, the
   CRX and `update.xml` whose id equals `CUA_EXTENSION_ID`; installed from the Store (after the owner's listing),
   `chrome://extensions` shows that id and 1 passes with the Store install. (The Store half is gated on the owner's
   listing; recorded BLOCKED until then.)
9. **Vendor route unchanged, routes switch.** `cua chrome register --vendor` behaves as `cua chrome register` did
   before this change (its tests pass with the flag added); `cua doctor` on the vendor route shows `codex.login` as
   before; switching a home from `vendor` to `cua` makes `profiles list` show `rebind_required` until `profiles bind`.
10. `npm test` passes (≥ 785 + the new suites); `node scripts/probe-chrome-contract.mjs --fixtures` still passes; the
    host suite pins (one test each): a late `turnEnded` for turn N leaves turn N+1's tabs; a profile with no window
    creates one unfocused; the port dropping mid-task fails pending requests with `extension disconnected`, runs
    cleanup and exits; the worst-case default-home socket path is under the limit and an over-long home is refused;
    an unpacked-style profile fixture counts as present; a host→extension frame over 1 MB is refused.

## Constraints binding every milestone

- No attribution footers in commits, PRs or issues. Never read or print `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`,
  the extension private key, or anything under a Chrome profile except an extension's own code directory and what
  `directory-map.mjs` already reads. Never kill Chrome, a host or the owner's processes; never click Chrome dialogs
  or TCC prompts for the user; Chrome quit/reopen (acceptance 6) is the owner's action.
- No bypass flags in production: `BROWSER_USE_DISABLE_AMBIENT_NETWORK` and `BROWSER_USE_SECURITY_MODE` appear only
  inside S0 as a measured comparison.
- Node 22+; no new npm dependency (the host uses `node:net`/`node:fs`/`node:crypto` and `src/chrome/protocol.mjs`,
  promoted from `scripts/probe/chrome/frame.mjs`; the CRX3 packer is written with `node:crypto`; the extension has no
  dependencies and no build step). `package.json` `files` gains `extension/`.
- One branch, one PR: nothing merges to `main` before H5 (between H2 and H4 `main` would default `cua chrome register`
  to a route the template cannot install). The plugin version (`.claude-plugin/plugin.json` + `marketplace.json`) is
  bumped in H5.
- The vendor route's code paths and tests stay green throughout.
- Do not touch `/Users/new/Developer/GitHub/MAWS`.

## Plan of Work

### S0 — Spike: the vendor service without the header field; the extension key

Prototyping; deliverable is knowledge plus one artifact. Questions: (a) with `getInfo` lacking
`agentRequestHeaderEnabled`, no Codex login (scratch `CUA_HOME`, so a scratch `CODEX_HOME`), and the network at the
vendor default, do session requests (`getTabs`, `createTab`, `attach`) **reach the backend** without an identity
error, and how long after launch does the first one arrive? (b) The same with `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`
(today's harness default), as the comparison. (c) Confirmation of the source reading: with `BROWSER_USE_BACKEND_PATHS`
naming one live socket and one dead path, `listBrowsers` returns the live one within ~1 s and finds a listener that
appears at the dead path on the next call. Build: a `vendor-layer.mjs` parameter for the network switch and a scenario
set that judges "session request reached the backend" rather than the fixture's CDP refusals. Observe: PASS/FAIL per
question in the report JSON. Promote: (a) PASS → the design stands. (a) FAIL and (b) PASS → stop and report to the
owner: the no-login claim would rest on a switch the constraints forbid (a fork under the gate). (a) FAIL and (b) FAIL →
stop: omission is not sufficient; report what the service demanded. (c) FAIL → stop and report (the discovery design
rests on it). Artifact: generate the extension keypair (`openssl genrsa 2048` → `~/.config/cua/extension-key.pem`
0600; never print it), derive `CUA_EXTENSION_ID` and the manifest `key` value, and record the id (not the key) in
Surprises & Discoveries. Scope edge: no Chrome, no extension code, no host code.

### H1 — The host and its contract with the vendor service

At the end: the host serves the backend protocol on a socket and is proven two ways: (i) `node:test` suites with a
fake cua extension on an in-process port, pinning every row of the coverage table and every rule in "Sessions, turns,
ownership" (acceptance 10's host pins, acceptance 5's refusal string); (ii) the real vendor service, launched by the M7
harness with a new configuration that spawns `host.mjs` with the fake extension on its stdio, runs a listed scenario
set with expected statuses (getInfo kept as `chrome`; createBrowserTab → `createTab`+`attach` reach the host; a
`Runtime.evaluate` answered by the fake extension round-trips; turnEnded closes the created tab; header policy skipped)
— a probe in a scratch runtime home, not part of `npm test`. Touches: `src/chrome/host.mjs`,
`src/chrome/protocol.mjs`, `src/chrome/extension.mjs`, `test/chrome-host*.test.mjs`, `test/helpers/fake-cua-extension.mjs`
(tabs, windows, groups, debuggee state, CDP answers, user-initiated detach, port drop), `scripts/probe/chrome/
vendor-layer.mjs` (the host configuration), `scripts/probe-chrome-contract.mjs` (`--vendor --backend host`). Decisions:
the fake extension's Chrome error strings are the documented ones (`Another debugger is already attached to the tab
with id: N`, `No tab with given id N.`, `Debugger is not attached to the tab with id: N.`); the host's `main` reads
`CUA_HOME` from the environment the launcher set and refuses to start without it (`home_missing`). Not touched:
registration, CLI, launch, doctor, the real extension. Proves: acceptance 5's string, 10's host pins; consumes S0's
id.

### H2 — Registration, launch, discovery, binding, doctor for the cua route

At the end: `cua chrome register|unregister` manage the cua manifests, launcher and record (`--vendor` keeps the old
behaviour through the existing functions), `cua serve` lists backend paths on the cua route, `cua profiles` and
`cua doctor` know the cua id, the presence rule, the route and the socket directory. Touches: `src/chrome/registration.mjs`
(new `registerCuaHost`/`unregisterCuaHost` sharing the lock and `manifestText`; `readRecord` untouched),
`src/cli.mjs`, `src/runtime/launch.mjs`, `src/profiles/{chrome,checks,directory-map,inventory,registry,commands}.mjs`,
`src/runtime/doctor.mjs`, their tests (injected temporary manifest and profile directories, as M12's tests do; an
unpacked-style profile fixture). Decisions: as in the design's registration section; `chrome.hosts.live` is the one
doctor row that connects. Not touched: the extension, docs, the cloud template. Proves: acceptance 2's manifest
rules, 9, 10's path-length and presence pins, 1's doctor rows (against fixtures); consumes H1's host path and
constants.

### H3a — The extension, proven against the real host without Chrome

At the end: `extension/` exists (manifest with `key`, `background.js`, `popup.html`, `popup.js`, icons) and a
`node:test` loads `background.js` under a `chrome.*` stub (tabs, windows, tabGroups, debugger, runtime, storage,
alarms) wired to the real `host.mjs` over a pipe, driving the backend protocol end to end: hello/version check,
createTab → group, attach, executeCdp relay, OOPIF attach by targetId, events, turnEnded cleanup, port drop →
detach-all, `message_too_large`. Touches: `extension/`, `test/extension-*.test.mjs`, `test/helpers/chrome-stub.mjs`.
Decisions: the extension's JSON-RPC peer is a ~60-line copy of the host's conventions (extensions cannot import from
the checkout); `chrome.debugger.attach` version `"1.3"`; `Target.getTargets` is the host's `debugger.getTargets`
primitive (no extension-side intercept). Not touched: live Chrome, docs, Linux. Proves: 10's extension contract.

### H3b — Live acceptance on this Mac

At the end: acceptance 1–6 pass live from a scratch home. Touches: `scripts/accept-chrome.mjs` and
`scripts/accept/chrome-*.mjs` (`--route`, the new cells: user-tab claim, turn-end marking, two-client refusal,
cross-origin iframe, goto latency; the user-tab exception), `docs/evidence/2026-10-07-own-extension-acceptance.md`.
Decisions: the live run needs the owner once — one message listing: load `<worktree>/extension` unpacked in `Default`,
and, when asked, quit and reopen Chrome for acceptance 6 — otherwise the affected items are recorded BLOCKED and the
rest run. Proves: acceptance 1–6.

### H4 — Linux: the Tart VM and the cloud template

At the end: the provisioning script installs the cua extension by force-list from a self-hosted CRX (`hosted`) or the
Store (`store`), registers the cua host, drops both sign-in steps, and the Tart VM and a throwaway Hetzner VM pass
acceptance 7. First step, measured before anything else: force-install of an off-store CRX on the VM's branded Chrome
works (if not, stop and report: the fallback is Chromium/Chrome for Testing in the template, an owner decision).
Touches: `deploy/cloud-vm/`, `relay/deploy/{Caddyfile,update.sh}` (`/ext/` file server), `scripts/extension-pack.mjs`
(CRX3 + `update.xml`, needed here before H5's zip), `scripts/accept/linux-chrome.mjs`, evidence. Decisions: the CRX
is packed on this Mac with the owner's key and uploaded with `update.sh --ext`; the force-list line names
`CUA_EXTENSION_ID;https://178-104-102-73.sslip.io/ext/update.xml`; the throwaway server is deleted afterwards. Proves:
acceptance 7.

### H5 — Packaging, docs, the Store listing, and the acceptance section as written

At the end: `npm run extension:pack` complete (zip without `key`), README/`CLAUDE.md`/skill/template docs updated,
plugin version bumped, the vendor-route removal ticket registered on the board (blocked by the Store listing), and
every acceptance item run and recorded (8's Store half BLOCKED until the owner's listing; the executor prints the
owner's exact steps — developer registration, first upload of the zip with `key.pem` at its root, visibility
unlisted, and what to send back: the Store URL — and does not wait). Touches: `package.json`, `scripts/extension-pack.mjs`,
`README.md`, `CLAUDE.md`, `skills/cua-remote/SKILL.md`, `deploy/cloud-vm/README.md`, `.claude-plugin/{plugin,marketplace}.json`,
this spec's record. Proves: acceptance 8 (zip/CRX half), 10, and the re-run of 1–7 on the final branch.

## Concrete Steps

Working directory: the worktree of branch `feat/own-chrome-extension`.

```sh
npm test                                                       # all pass; counts rise per milestone
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-s0-fixtures.json      # 15/15
export CUA_HOME=$(mktemp -d /tmp/cua-s0.XXXXXX); node bin/cua.mjs install
node scripts/probe-chrome-contract.mjs --vendor --network default --report /tmp/cua-s0-a.json   # S0 (a)
node scripts/probe-chrome-contract.mjs --vendor --network off --report /tmp/cua-s0-b.json       # S0 (b)
node scripts/probe-chrome-contract.mjs --vendor --backend host --report /tmp/cua-h1.json        # H1 (ii)
# H3b live (owner's Chrome open, extension loaded unpacked in Default):
export CUA_HOME=$(mktemp -d /tmp/cua-h3.XXXXXX); node bin/cua.mjs install; test ! -e "$CUA_HOME/state/codex/auth.json"
node bin/cua.mjs chrome register --replace   # per-browser table, then "previous launcher recorded: <path>" or "none"
node bin/cua.mjs profiles add personal --chrome-profile Default && node bin/cua.mjs profiles bind personal
node bin/cua.mjs doctor --json | jq '.ok, (.checks[] | select(.id | startswith("chrome") or . == "codex.login"))'
CUA_SHIM_SURFACES=browser node verify.mjs                                    # exit 0, problems: []
node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3.json   # all PASS
node bin/cua.mjs chrome unregister; rm -rf "$CUA_HOME"
# H4: ssh cua-linux (DISPLAY=:0), same sequence; deploy/cloud-vm/create-hetzner.sh … --extension hosted; delete the server
npm run extension:pack                                        # dist/cua-extension-<version>.zip (+ .crx, update.xml with CUA_EXTENSION_KEY)
```

## Interfaces and Dependencies

**`src/chrome/extension.mjs`**: `export const CUA_EXTENSION_ID` (32 chars `a–p`, derived as in the design),
`export const CUA_HOST_NAME = 'io.github.ssfskim.cua'`, `export const PROTOCOL_VERSION = 1`,
`export function extensionIdFromKey(base64PublicKey)`, `export function socketNameFor(instanceId)` (12 hex chars).

**The extension protocol** (host ↔ extension, JSON-RPC 2.0 over native messaging). A `debuggee` is `{tabId}` or
`{targetId}`. Requests from the host:

| Method | Params | Result |
|---|---|---|
| `tabs.query` | `{}` | `[{id, windowId, url, title, active, groupId}]` |
| `tabs.create` | `{url?, windowId?, group:{key, title}, openerTabId?, guard?}` | `{id, windowId}` (inactive; in the (window, key) group, created if needed; with `openerTabId` and no window, in the opener's window; `guard` guards it from its first document) |
| `tabs.guard` | `{tabId}` | `{frames, blanked}` (guards the tab and sweeps every frame; resolves once the frames it blanked unloaded, ≤ 1 s; a page cua may not script rejects with Chrome's message) |
| `tabs.unguard` | `{tabId}` | `{}` (removes the page guard from every frame) |
| `tabs.remove` | `{tabId}` | `{}` |
| `tabs.get` | `{tabId}` | `{id, windowId, url, title, status}` |
| `tabs.ungroup` | `{tabId}` | `{}` |
| `group.title` | `{windowId, key, title}` | `{}` |
| `windows.query` | `{}` | `[{id, focused, type}]` |
| `windows.create` | `{focused:false}` | `{id}` |
| `debugger.attach` | `debuggee` | `{alreadyHeld: boolean}` |
| `debugger.detach` | `debuggee` | `{}` |
| `debugger.sendCommand` | `{debuggee, sessionId?, method, params?}` | the CDP result |
| `debugger.getTargets` | `{}` | `chrome.debugger.getTargets()` result |
| `held` | `{}` | `[debuggee]` |

Notifications from the extension: `hello {extensionId, extensionInstanceId, version, protocolVersion}` (first message
after connect), `debugger.event {debuggee, sessionId?, method, params}`, `debugger.detached {debuggee, reason}`,
`tabs.removed {tabId}`, `tabs.updated {tabId, url?, title?, status?}`, `tabs.popup {openerTabId, url}` (a guarded
page's user-activated `window.open` or target link). Notification from the host: `hostRefused {code,
message}` (`protocol_mismatch`, `hello_invalid`, `already_served`, `listen_failed`), sent before the host exits; the
popup shows it. Errors carry Chrome's
`chrome.runtime.lastError.message` verbatim; the host's own refusals are `message_too_large`, `protocol_mismatch`.

**`src/chrome/host.mjs`**: `export async function runHost({stdin, stdout, home, env})` (the program's `main`);
`export function createHost({extension, hello, home, now, log, pid})` returning `{methods, handleBackendRequest(client, message),
clientClosed(client), onExtensionNotification(message), extensionClosed(), status()}` for tests, where `extension`
is `{request(method, params)}` and a `client` is `{notify(method, params)}`; `status()` is the `<name>.json` shape.

**`src/chrome/protocol.mjs`**: `encodeFrame`, `frameDecoder` (u32 LE length + JSON; the vendor wire and the
native-messaging wire), `NO_HANDLER(method)`, `createPeer({send, handlers, maxFrameBytes?})`.

**`src/chrome/registration.mjs`**: `registerCuaHost({home, checkout, nodePath, replace, browsers, io, lockTiming})`,
`unregisterCuaHost({home, browsers, io, lockTiming})`, `readCuaRecord(home)`. The cua record
`$CUA_HOME/chrome/cua-registration.json`: `{schema:1, route:'cua', launcher, backendsDir, browsers:{<browser>:
{manifestPath, previous: <path>|null}}}`. The route of a home: `cua` when the cua record exists and is newer than the
vendor record's last write, else `vendor` when that exists, else none.

**`profiles.json` bindings** gain `route: 'cua'|'vendor'`; a missing field means `vendor`.

**`cua serve` env** (browser surface, cua route): `BROWSER_USE_BACKEND_PATHS` as in "Socket placement and discovery".

No new npm dependencies.

## Surprises & Discoveries

- Observation: the vendor host binary is content-blind; the ChatGPT extension implements the backend protocol itself.
  Evidence: `strings` on `extension-host/macos/arm64/ChatGPT for Chrome` has no `getInfo`/`executeCdp`/`tabId`;
  `background.js` L8:C63748 registers every `Kf` method as an RPC handler (2026-10-07 research).
- Observation (S0, 2026-10-07): omitting `agentRequestHeaderEnabled` removes the login on the default network. With no
  login, session requests (`getTabs`, `createTab`, `attach`, `turnEnded`) reached the backend 6–29 ms after the call
  that issued them (3 runs; network off: 2 runs, same). Control: the same backend with the field present
  (`agentRequestHeaderEnabled:false`) got only `getInfo` through and failed with `Codex auth token is unavailable`.
  Discovery: with one live socket, one absent path and one stale socket file listed, `listBrowsers` returned the live
  one in 228–353 ms and found listeners that later appeared at the dead paths on the next call.
  Evidence: `docs/evidence/2026-10-07-s0-no-header-spike.md`; `node scripts/probe-chrome-contract.mjs --vendor --network default|off`.
- Observation (S0): a listener that accepts but never answers `getInfo` costs every `listBrowsers` ~5 s (5 005–5 026 ms,
  the service's request timeout), not the 1 s connect bound; a dead path fails immediately. So the host answers
  `getInfo` from its own state without waiting on the extension, and does not listen before it can answer (it listens
  after `hello`).
- Observation (S0): `CUA_EXTENSION_ID` = `jkejaaijdfpohkdhankllbekkhmnippb`, from the key generated at
  `~/.config/cua/extension-key.pem` (0600); the manifest `key` value (public) is in the S0 evidence file.
- Observation (H1): the macOS socket-path bound is tighter than first written: at the default home the worst-case path
  is 96 bytes for a 30-character username, 103 (the limit) for 37, 106 for 40 (Linux `/home/<40>`: 90). Design text
  corrected (37 characters, refusal above 103 bytes).
- Observation (H1): the service calls `getCommittedTabUrl` and issues `Fetch.enable`, `Emulation.setFocusEmulationEnabled`,
  `Page.startScreencast`/`captureScreenshot` and `Page.createIsolatedWorld` on every createBrowserTab/evaluate
  (`docs/evidence/2026-10-07-h1-host-probe.md`); `Fetch.enable` through `chrome.debugger` pauses requests until the
  service continues them — H3b watches for stalls there. `listTabs` on an extension backend also lists unowned tabs as
  user tabs (`getUserTabs`), so acceptance 5's "neither lists the other's tab" is about `getTabs`.
- Observation (H1): the vendor extension moves a session's active leases to each new turn and makes a late `turnEnded` a
  no-op; cua's per-turn ownership closes a finished task's tabs even when its `turnEnded` arrives late (by design).
- Observation (H4 gate, measured early, 2026-10-07): branded Google Chrome 154 (Linux aarch64, the Tart VM) force-installs
  an off-store CRX3 through `ExtensionInstallForcelist` with `<id>;http://127.0.0.1:<port>/update.xml` (requests carry
  `installedby=policy`, `installsource=notfromwebstore`): picked up ~6 s after the policy file was written, no restart;
  installed per profile when that profile loads (a fresh instance at startup); removal from the list uninstalls (~45 s).
  Several files in `policies/managed/` setting the same policy are **not merged** (the last file alphabetically wins), so
  provisioning writes one combined force-list. A remote HTTPS update URL was not tested (H4 does).
- Observation (H4, 2026-10-07): branded Chrome 154 (Tart VM) and 155 (Hetzner, fsn1) force-install the self-hosted CRX
  from the relay's HTTPS `update.xml` ~6 s after the policy is written, no restart. `create-hetzner.sh --extension
  hosted` reaches doctor `ok:true` with `chrome.hosts.live` pass (1) in 3 m 45 s from nothing; the CRX3 header matches
  Chrome's own packer byte for byte outside the signature. Evidence: `docs/evidence/2026-10-07-own-extension-linux.md`.
- Observation (H3b prep, 2026-10-07): on the cua route with nothing bound, an empty `BROWSER_USE_BACKEND_PATHS` reaches
  the service through node_repl: `listBrowsers` returned nothing while the owner's live ChatGPT-extension hosts had
  sockets in `/tmp/codex-browser-use`. Same host on another port is same-site, so the cross-origin iframe cell serves
  its frame from `localhost:<port2>` (not `127.0.0.1`) to get an OOPIF.
- Observation (H3b live, 2026-10-08): in the owner's Chrome, focusing a password input (or a text input masked with
  `-webkit-text-security`) drew a password-manager extension's frame into the page. Chrome then refused the debugger on
  the tab with "Cannot access a chrome-extension:// URL of different extension"; the vendor service reports this as
  "Google Chrome is blocking automation because another extension UI is open on this page". It happened in 3 of 4 fills
  of a password field and 0 of 13 fills of a plain text field. The managers' documented opt-out attributes did not
  prevent it. This is Chrome's rule for every `chrome.debugger` client, so both routes hit it: an agent filling a real
  password field in a profile with such a manager has to ask the user to dismiss the manager's UI. The C2 page now uses
  a plain text field with transparent text.
- Observation (H3b live): the vendor's `tab.close()` returns when Chrome accepts `Target.closeTarget`, before the tab
  leaves `chrome.tabs.query`, so a listing right after a close can still show the tab for a moment.
- Observation (H3b live): a full run started 40 s after Chrome reopened, while Chrome was restoring about 20 tabs,
  failed seven steps on host CDP timeouts (up to 10 s). The run two minutes later passed. The host does not log CDP
  traffic, so the stalled methods are unknown; restore load is the likely cause. Every other run had no stall, with
  navigations of 0.1–0.5 s.
- Observation (#81, 2026-10-07): the H3b conclusion that both routes hit the foreign-frame refusal was wrong. On the
  owner's Chrome an input-helper extension (`pejdijmoenmkgeppbflobdenhhabjlaj`) draws an invisible 9001 px
  `/completion_list.html` iframe on focus of **any** field. Same Chrome session, same loopback page (one password and
  one text field), 4 trials each, focus then fill: the ChatGPT-extension route filled 8/8, twice (before and minutes
  after the cua run; one focus on the rerun answered "Detached while handling command." and the fill still passed),
  the cua route 0/8. On the cua route the first focus made Chrome detach the debugger and refuse every re-attach with
  `Cannot access a chrome-extension:// URL of different extension` (the service: "Google Chrome is blocking
  automation because another extension UI is open on this page…"); every later call on the tab failed, navigation and
  close included, and a fresh tab failed again on its first focus. The vendor route recovers because its extension
  blanks other extensions' frames in the tabs it controls (`content-scripts/foreign-frame-monitor.js`, injected by
  `chrome.scripting`). The same runs measured tab creation: 0.2–0.5 s through the cua host against 8–10 s through the
  vendor extension. The host logged none of the refusals (it logged only session open and close), which is why the
  cause had to be read off the service's wording. Evidence: the probe's `trials.json`/`diag.json` (job scratch),
  summarized in `docs/evidence/2026-10-07-foreign-frames-acceptance.md`.

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
- Revision (2026-10-07, after both reviews): presence for the cua id includes `Local Extension Settings/<id>` (unpacked
  loads never appear under `Extensions/`); sockets moved to `chrome/b/<12-hex>.sock` with a register-time length check
  (macOS `sun_path`); Linux installs a self-hosted CRX by force-list (`--load-extension` is gone from branded Chrome
  137+); the Store zip carries no `key` and the first upload carries `key.pem`; a separate cua registration record
  and one route per home (one `registration.json` could not hold both, and `BROWSER_USE_BACKEND_PATHS` hides the
  vendor's scan); the launcher bakes `CUA_HOME`; OOPIF frames attach by `targetId`; handoff tabs stay owned and resume
  next turn, `turnEnded` is per `turn_id`, `executeCdp` enforces `timeoutMs` (vendor semantics the agent is taught);
  per-session tab groups; `windows.create` for a windowless profile; `metadata.extensionId` omitted (M7's rule);
  `hello` carries a protocol version; H3 split into H3a (stubbed contract) and H3b (live); the `/tmp` fallback dropped
  (dead listed paths are retried per call, BS:66038–66070).
- Decision (2026-10-07): the backend socket has no peer code-signature check (the vendor host has one). Threat model:
  a same-user process is already trusted by cua's allow-all approvals and its 0600 file secret store, and a model cell
  with the sandbox off can drive Chrome by other means; the 0700 directory is the boundary. Revisit with the trust
  model. Alternative rejected: `/proc`/`lsof` peer lookups (platform-specific, racy, and not a boundary against the
  process class that matters).

- Decision (S0, 2026-10-07): `probe-chrome-contract.mjs --vendor --network default|off` runs the S0 scenario set
  (`scripts/probe/chrome/no-header.mjs`, a recording stub backend answering `getInfo` as the host will); `--vendor`
  alone keeps M7's checks. The spike launched the vendor service with the M7 harness environment plus
  `BROWSER_USE_AVAILABLE_BACKENDS=chrome`, not through cua's browser wrapper (a pass-through); H3b covers that path live.

- Decision (H1, 2026-10-07): ownership details the design left open. A tab belongs to the turn that last created,
  claimed, resumed or used it (a current-turn `attach`/`attachTarget`/`executeCdp`/`markTab`/`claimUserTab` adopts it;
  stale-turn requests and `detach` never re-turn it), so a late `turnEnded(N)` never closes a tab turn N+1 uses. An
  ended turn takes no new tabs (`createTab`/`claimUserTab` refused; a `createTab` in flight when its turn ends closes the
  tab). A resumed handoff tab loses its mark. A client disconnect ends its turns and then releases the session's handoff
  tabs open and ungrouped (a dead session cannot resume them). Claimed user tabs are never grouped or ungrouped. A tab no
  session owns is refused with the vendor's `Tab N is not part of browser session S`; another session's with `tab owned
  by another session`. `Target.getTargets` is not filtered (vendor parity, same-user trust). Child sessions are not
  tracked (Chrome scopes a child `sessionId` to its debuggee).
- Decision (H1): `executeCdp` timeout answers the vendor's `Timed out after <t>ms waiting for CDP command <m>.` and
  detaches; the next command answers `Debugger unattached`, the string the service's one re-attach recovers from (the
  design's "Debugger is not attached wording" read as that sequence). Chrome's own "Debugger is not attached" from
  `sendCommand` makes the host forget the attachment so the re-attach is real. After `canceled_by_user` the host refuses
  `attach`/`attachTarget` on that tab while the session owns it.
- Decision (H1): the host listens before it builds session state, writes `<name>.json` only after listening (a refused
  host never overwrites a live host's status), creates `chrome/b` and `chrome/logs` (0700) if missing, and removes its
  socket and status file on a clean exit. Refusals reach the extension as `hostRefused {code, message}` (Interfaces).
  `createHost` takes `hello` and `pid` and returns `methods`; `runHost` returns `{code, reason, logPath}` for tests.
  The probe's host configuration lives in `scripts/probe/chrome/host-layer.mjs` with the shared `launchVendor` in
  `vendor-layer.mjs`; the probe and the tests share `test/helpers/fake-cua-extension.mjs`.
- Decision (controller, 2026-10-07): the socket-path refusal threshold is the real macOS limit, 103 bytes (the name is
  fixed-length, so the worst case is exact and a margin buys nothing); the design text's "40 characters" becomes 37.

- Decision (controller + session, 2026-10-07): H4's provisioning merges the cua extension's force-list entry into the
  one managed policy file the template already writes (`/etc/opt/chrome/policies/managed/cua.json`, a single
  `ExtensionInstallForcelist`), never a second file with its own list (Chrome does not merge them; the last file wins).

- Decision (H1 review, 2026-10-07): when a late `turnEnded(N)` hands off a tab after turn N+1 began, the tab resumes into
  N+1 at once (listed by `getTabs`, mark cleared, debugger detached). An exiting host removes `<name>.json` before
  closing its server and never unlinks the socket path itself (libuv unlinks at `close()`), so a successor that took
  the path keeps its files; the log is renamed to `<name>.log` only after listening. `claimUserTab` refuses `chrome://`,
  `chrome-extension://`, `chrome-untrusted://` and `devtools://` tabs (`Chrome internal tab N cannot be claimed`);
  `getUserTabs` lists them, as the vendor does. Deferred: per-tab serialization of attach/detach (bounded by turn end).

- Revision (H3a review, 2026-10-07): the "refusal otherwise" half of the `Another debugger is already attached` rule
  rested on a Chrome behaviour that does not exist. Chromium's `DebuggerAttachFunction::Run` returns
  `kAlreadyAttachedError` only from `FindClientHost()`, which matches the same agent host **and the same extension id**;
  DevTools and other extensions attach alongside. The real case is an attachment Chrome kept for this extension after
  its worker lost memory of it, so the extension adopts it (vendor `Os`/`Zf` swallow the error via `Fs` and add to the
  held set). Design text revised; the stub and the fake extension stop modelling a foreign refusal.
- Decision (H3a, 2026-10-07): after a lasting `hostRefused` (`protocol_mismatch`, `hello_invalid`) the extension skips the
  5 s retry and retries on the minute alarm with backoff (each attempt spawns a host that writes a log); the worker keeps
  an in-memory (window, session) → group map, re-validated on use; `minimum_chrome_version` 125 (child-session
  `sendCommand` by `sessionId`); `windows.create` passes `type:'normal'`; `background.js` is a classic worker (tests load
  it with `vm`), the popup an ES module; icons are placeholders.

- Decision (H2, 2026-10-07): `--replace` and `unregister` work on the manifest's bytes: a backup is kept with its hash in
  the cua record beside `previous` (the launcher path it named), so the restore is byte-identical (acceptance 2).
  `other_home` refuses any manifest of this name that does not name this home's launcher, an unparseable one included.
  The vendor record counts toward the route only when it names a browser, and `register --vendor` touches it so it is
  strictly newer than the cua record; a home with no registration is on the vendor route (no change for existing
  homes). A binding stores `route` only when it is `cua`. `BROWSER_USE_BACKEND_PATHS` on the cua route lists bound
  profiles' sockets plus every `*.sock` present, sorted. `unregister` with nothing blocked removes the record and the
  launcher, else keeps the blocked browsers' entries. The 103-byte check runs on the home's eventual real path; a home
  containing `:` is refused (`home_path_unsupported`, the path list separator). Doctor removes a refused socket only if
  it is the inode it probed. The launcher appends a start line and Node's own stderr to `chrome/logs/launcher.log`.
  The vendor acceptance runner passes `--vendor`. Hand-offs: H3b's runner must pass the route to `chromeFacts()`;
  H4's `cua-provision.sh` must call the route it means; H5 revisits the "OpenAI extension" wording of the readiness
  reasons shared with `profiles_list` on the cua route.

- Decision (H2 review, 2026-10-07): every hint the vendor route prints names `--vendor` (those commands now mean the cua
  route without it); record rewrites that are not registrations (a failed register's undo, a blocked unregister, a
  partial `unregister --vendor`) restore the record's earlier mtime so the route does not flip; a missing extension is
  worded as cua's on the cua route (`reasonFor(reason, route)`), result shapes unchanged. Deferred: the vendor mtime
  set into the future under clock skew; orphaned manifest backups after a blocked unregister.
- Decision (H3a review, 2026-10-07): the backoff after a lasting refusal is cleared by opening the popup, which tries one
  ungated connect (one host spawn per popup open, only while refused). H3a ran in a parallel worktree off H1's head
  (it consumes H1 only) and was rebased onto H2 (`npm test` 907: 906 pass, 1 skip).
- Hand-off to H3b (H2 review): confirm live that an empty `BROWSER_USE_BACKEND_PATHS` survives node_repl to the
  service (a fixture socket in `/tmp/codex-browser-use` must not be listed on the cua route with nothing bound), and
  that node_repl reaches `$CUA_HOME/chrome/b/*.sock` under the scoped sandbox.

- Decision (H4, 2026-10-07): `scripts/extension-pack.mjs` writes the CRX3 (with an `update_url` added to the packed
  manifest, so installs find later versions) and `update.xml`, refusing a key whose id differs from the manifest's
  (`key_mismatch`); the Store zip and the npm script are H5's. `relay/deploy/update.sh --ext` keeps the live site
  address, validates the Caddyfile before installing it and never restarts the relay. A cua-route template's force-list
  names only cua's extension: a re-run on an older template VM is the migration (Chrome uninstalls the ChatGPT
  extension; owner-confirmed); the Tart VM keeps both entries in its one file. `CUA_EXTENSION` defaults to `hosted`
  until the Store listing, then `store`. `create-hetzner.sh --repo <bundle>` uploads an unpushed branch. Debt: doctor's
  `agent.*` rows fail for a non-default home on a machine whose agent belongs to another home; an update through
  `update_url` to a later version is untested.
- Decision (H3b, 2026-10-07): `accept-chrome --route` defaults to the home's route and a mismatch blocks; acceptance 5's
  `tab owned by another session` is checked with a raw client on the host socket under a fresh session id (the vendor
  API cannot send `executeCdp` for another session's tab); the user-tab exception covers exactly the runner's own page
  (found by its per-run URL, claimed, read, closed); the Chrome-restart runner waits for the host's pid to change and
  its socket to answer, else BLOCKED with cleanup; `serve-with-store.mjs` passes the route to `chromeFacts()`.

- Decision (H5, 2026-10-07): `npm run extension:pack` always writes the Store zip (manifest re-serialized without `key`)
  and adds the CRX and `update.xml` when `CUA_EXTENSION_KEY` is set, packing the CRX first so a refused key writes
  nothing. Cua-route readiness and bind reasons name cua's extension and its popup (codes and shapes unchanged; vendor
  text byte-identical). Plugin 0.4.0 (a new default route). Chromium uses the force-list update URL only for the first
  install, so VMs installed from the hosted CRX keep updating from the relay after the template flips to `store`
  (moving one in place is untested; noted on #79). Board: #78 Store listing (owner), #79 vendor-route removal blocked
  by #78.

- Decision (2026-10-07, #81, owner-approved): the design's "no content scripts" is reversed for exactly two behaviours,
  both in tabs the host owns: blanking other extensions' frames, and routing a page's popup to the session. Rationale:
  the measurement above (vendor route 8/8 twice, cua route 0/8, same session): without the first, one focused field in
  a profile with an input-helper or password-manager extension makes a tab undrivable for its life. What the vendor
  does (ChatGPT extension 1.26.901.11451, `background.js`, read for this decision): the monitor (`Mh`, also shipped as
  `content-scripts/foreign-frame-monitor.js`) runs in the isolated world, walks the document and every open or closed
  shadow root (`chrome.dom.openOrClosedShadowRoot`), and for an `<iframe>`/`<frame>` whose `src` is a
  `chrome-extension://` URL of another extension sets `srcdoc=""` (iframe) or `src="about:blank"` (frame); it never
  removes or hides the element; a MutationObserver (childList, subtree, `src`) repeats this for every addition. It is
  injected with `chrome.scripting.executeScript` (not a declared content script) into every document of a leased tab
  on every session request that touches the tab (`requireSessionTab`: `attach`, `attachTarget`, `executeCdp`,
  `createTab`, `claimUserTab`, `markTab`) and when a leased tab starts loading, so it is in place before each attach and
  catches frames on insertion; it is removed at turn end. Its attach (`Os`) has no retry of its own; recovery is the
  service's re-attach finding the frame blanked. Its popup interceptor (`Rh` in the page's world, a bridge `kh` in the
  isolated world, behind the `codex-app-chrome-extension-background-popups` gate) replaces `window.open` and
  target-link clicks with a request the extension turns into a background tab claimed for the session.
  cua follows the injection model (an owned tab only; a user's other tabs never see cua code, and nothing is declared
  for every page) with three choices of its own: the guard is installed on the host's tab creation, at each new
  document's commit (`tabs.onUpdated` url/complete, so no `webNavigation` permission) and swept before each attach
  rather than on every CDP command (one extra native round trip per attach, none per command), the host waiting for a
  sweep at most 1.5 s and never for an unguard (review: an open dialog blocks injection indefinitely); an attach refused
  for a foreign frame is swept and retried once by the host; and the popup interceptor runs in the top frame only (the
  vendor injects it into every frame, which lets a sandboxed frame without `allow-popups` open tabs) and takes only
  new-context opens: `window.open` with window features is left to Chrome, because a sized popup is almost always a
  sign-in flow that needs `window.opener`, which a tab opened by the extension cannot have, and so is every named
  target, which may name a frame anywhere in the tree (the vendor intercepts both). The host now logs every refused extension request so the next case
  like this is diagnosable from `$CUA_HOME/chrome/logs/`. Cursor overlay and favicon badges stay excluded. The
  `<all_urls>` host permission is the one the Store scrutinizes, so this lands before the first upload (#78).
  Alternatives rejected: a declared `<all_urls>` content script that asks the worker whether its tab is owned (code in
  every page the user opens); removing the foreign iframe (its extension re-inserts it, and a blanked element keeps its
  script quiet); re-injecting on every CDP command as the vendor does (a round trip per command for a case the
  observer already covers).

## Outcomes & Retrospective

Written 2026-10-07 at the PR and finalized 2026-10-08 after H3b's live run. The owner loaded `extension/` unpacked in
`Default` and quit and reopened Chrome once, as acceptance 6 required.

**Outcome.** The purpose — Chrome driven with no ChatGPT or OpenAI account — is met everywhere it has been run
live: S0 showed the pinned vendor service sends session requests to a backend whose `getInfo` omits
`agentRequestHeaderEnabled`, with no login, on the default network (the control with the field present failed on the
missing Codex token); on Linux, acceptance 7 passed unattended on the Tart VM and a throwaway Hetzner VM (3 m 45 s from
nothing to doctor `ok:true`, `chrome.hosts.live` 1, `verify.mjs` clean, `linux-chrome.mjs` PASS, no sign-in step),
with the self-hosted CRX force-installed over HTTPS by branded Chrome 154/155. On this Mac, acceptance 1–6 passed live
from a scratch home that was never logged in. `profiles bind` bound the unpacked extension automatically by directory. Doctor showed `codex.login: skip` and passed
every browser row. `verify.mjs` was clean. The runner passed 40/40 twice: the secret round trip, the cross-site iframe,
the user-tab claim with its origin-access elicitation, turn-end marking and handoff, and two clients refused on each
other's tabs. `goto` took 0.1–0.5 s. After the owner quit and reopened Chrome, the open task failed in 5 ms with a
classified error, `end_task` succeeded, and a new task drove the profile through the same `cua serve` (11/11). The
vendor manifests were byte-identical before and after, and an empty `BROWSER_USE_BACKEND_PATHS` hides the owner's live
ChatGPT sockets as designed. Acceptance 8's zip/CRX half and 10 pass (`npm test` 945: 944
pass, 1 skip, again after H3b's runner fixes; `probe-chrome-contract --fixtures` 15/15; the host suite's pins). Acceptance 8's Store half waits on
#78; the vendor route's removal is #79 (blocked by #78). The whole-branch review (opus, reviewer-high brief) found
nothing material.

**What the loop caught.** Every milestone review found something real: an exiting host deleting its successor's socket,
a late `turnEnded` stranding a handoff tab (H1); the vendor route's hints sending users to the new default route and
record rewrites flipping a home's route (H2); a stub that agreed with the code instead of Chrome on "Another debugger
is already attached" — Chromium raises it only for the same extension, so the design's "refusal otherwise" was wrong
(H3a, design revised); an acceptance-3 cell that would pass without the origin-access elicitation it is meant to prove
(H3b). The lesson that generalizes: a stubbed proof is only as good as the stub's fidelity to the real platform, and
reviewers checking stubs against the platform's source (Chromium's `debugger_api.cc`) were the most valuable reads.
The live run found what no stub could: the owner's password manager drawing its frame into a focused password field,
which makes Chrome refuse the debugger on that tab (the C2 page now uses a plain text field). It also found a runner
check left stale by #73 and a listing taken too soon after a close. Each fix was in the runner; the host and the
extension passed unchanged.

**Process.** Two milestones whose inputs were already reviewed ran in parallel worktrees (H3a beside H2, H4 beside
H3b, H5 beside H3b's fixes) and rebased cleanly; the early, throwaway measurement of H4's gate (off-store force-install
on branded Linux Chrome) removed the plan's only product fork before H4 began. The owner dependency was the critical
path: everything not needing the loaded extension was finished and reviewed around it.

**Left open.** The Store listing (#78, owner). Not observed live: whether the debugger infobar's Cancel detaches one
tab or all, and the host's `windows.create {focused:false}` (Chrome always had a window). Also open: the minors in
`tech-debt-tracker.md` ("cua's own Chrome extension and host") and the placeholder icons (needed for the listing).
