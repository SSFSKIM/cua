# MAWS in-app browser driven by cua_repl (Phase D, board #13)

## Purpose

MAWS (the owner's Electron workstation for supervising Claude Code sessions, `/Users/new/Developer/GitHub/MAWS`) has
its own in-app browser: one Chromium page per tab, an imported copy of the owner's Chrome profile (cookies, history,
extensions), and six browser tools (`browser_tabs`, `browser_navigate`, `browser_snapshot`, `browser_act`,
`browser_eval`, `browser_screenshot`) that its `maws` MCP server gives the Claude Code session running inside the app.
The owner decided on 2026-10-08 ("대체하는게 결정이다. cua_repl이 인앱 브라우저를 바로 사용하는것") that those tools go
away and the cua plugin's `cua_repl` server drives the in-app browser instead, so an agent has one browser API
(the vendor's Playwright-style tabs and locators) whether it works in the owner's real Chrome or in MAWS's tabs.

After this change, a session running inside MAWS calls `profiles_list` and sees a `maws` profile that is ready; a js
cell `const b = await cua.getBrowser(); const t = await b.createTab(); await t.navigate('https://…')` opens a tab in
that session's Browser panel, and every later locator click, fill, screenshot, download, dialog answer and file upload
goes through the same vendor API the Chrome route already proves. The person sees the agent's cursor in the page, can
take the page over by touching it, and reads what the agent did as rows in the transcript. The `maws` server no longer
lists browser tools.

The spec covers the driving route only. The owner's UI requirements for the in-app browser (bookmarks import and bar,
extensions bar, profile avatar, profile settings as a widget or sidebar tab) are board #90.

## Progress

- [x] (2026-10-08) Research: vendor backend kinds and the Codex app's in-app backend; MAWS's tab, debugger, tool-server
  and launch-environment code; owner requirements. Recorded on #13 (comment of 2026-10-08) and in Facts below.
- [x] (2026-10-08) Design approved by the owner (scope, retained semantics, distribution, tab placement, action-row
  granularity, download location, default browser).
- [ ] M1 — cua: the host's client mode, discovery of a MAWS backend, `profiles_list`'s `maws` entry.
- [ ] M2 — MAWS: the primitive server over `TabStore` and `TabDebugger`; spikes S1 (dialogs) and S2 (file chooser).
- [ ] M3 — MAWS: takeover, cursor, action rows, downloads, dialogs and file chooser per the spikes.
- [ ] M4 — MAWS: removal of the six tools and the Playwright driver; charter amendments; docs.
- [ ] M5 — Live acceptance as written; plugin release; evidence.

## Facts this design rests on

Vendor citations are to `@oai/browser-desktop` 0.1.1 in ChatGPT 26.928.40906, `BS` =
`~/codex-app-src/readable/chatgpt-26.928.40906/cua_node/@oai/browser-desktop/scripts/browser-service.mjs`, `MAIN` =
`…/main-process/main-BvBtZhys.js` of the same build. MAWS paths are relative to its repository at master `3a9e6d1e`;
cua paths to this repository at main `eb692a8`. [verified] means read in source this session.

1. The vendor browser service (the pinned program cua_repl runs for every browser call) finds backends only as Unix
   sockets speaking u32-length-framed JSON-RPC: `BROWSER_USE_BACKEND_PATHS` lists them and, when set, replaces the
   `/tmp/codex-browser-use` scan (BS:67722-67753). Backend kinds are `extension`, `iab`, `cdp`, `mcpapps`
   (BS:18347-18379); the `cdp` kind is a socket backend too, not a Chromium remote-debugging URL (BS:67495-67609). There
   is no route in which the service attaches to a CDP port by itself. [verified]
2. Selection: `iab` first, then the instance named by `BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID`, then any
   extension (BS:68229-68330, BS:9541). An `iab` backend is listed only when its `metadata.codexSessionId` equals the
   service's session id (BS:67482-67494); an `extension` backend has no such gate, and the Codex-login header check
   runs only for `type === 'extension'` with `agentRequestHeaderEnabled` present (BS:68066-68092), which cua's host
   omits. `allowDownload` is asked only of `iab`/`cdp` (BS:61001-61010); downloads, dialogs, file chooser and
   screenshots otherwise run through CDP (`Fetch.*`, `Page.handleJavaScriptDialog`,
   `Page.setInterceptFileChooserDialog` + `DOM.setFileInputFiles`, `Page.captureScreenshot`; BS:48659-48749,
   BS:50034-50075, BS:43968-43977). [verified]
3. The Codex app's own in-app backend (the reference): a main-process socket server per conversation, `webContents.
   debugger` 1.3 with reference-counted leases, `Target.*` emulated and limited to the session's tabs, agent tabs
   created inactive, temporary tabs closed at `turnEnded` unless marked handoff or deliverable, downloads through a
   grant plus `session.on('will-download')`, and a "browser-use active" state for the UI (MAIN:107660-107702,
   108087-108115, 108562-108643, 109271-109307, 112176-112212, 99746-99834, 108645-108658). Its pages are Owl-specific
   `<webview>` adoptions; the boundary is what MAWS reuses, not the calls. [verified]
4. cua's host (`src/chrome/host.mjs`) is thick and the extension thin: the host consumes 15 request primitives
   (`tabs.query/get/create/guard/unguard/remove/ungroup`, `group.title`, `windows.query/create`,
   `debugger.attach/detach/sendCommand/getTargets`) and 8 notifications (`hello`, `debugger.event`,
   `debugger.detached`, `tabs.removed`, `tabs.updated`, `tabs.popup`, `downloads.created`, `downloads.changed`) over
   JSON-RPC 2.0 in u32 LE frames (`src/chrome/protocol.mjs`, `extension/background.js`); `runHost({stdin, stdout})`
   takes any readable/writable pair, waits for `hello {extensionInstanceId, version, protocolVersion}` and listens at
   `$CUA_HOME/chrome/b/<name>.sock`. Every session, turn, ownership, handoff, viewport and download rule lives in the
   host and is pinned by `test/chrome-host*.test.mjs` and live by #15/#82. [verified]
5. cua's launch sets `BROWSER_USE_AVAILABLE_BACKENDS=chrome` and builds `BROWSER_USE_BACKEND_PATHS` itself from the
   cua route's sockets (`src/runtime/launch.mjs`, `src/chrome/discovery.mjs`); on the vendor route it leaves the
   variable unset so the vendor scans `/tmp/codex-browser-use`. `profiles_list` lists registered Chrome profiles
   only (`src/profiles/registry.mjs`, `src/mcp/surface.mjs`). [verified]
6. MAWS: one `WebContentsView` per tab in partition `persist:maws-browser` or `persist:maws-chrome-<profileDir>`
   (`src/main/browser/view.ts`, `src/main/browser/partition.ts`); `TabStore` owns create, list, close, select, adopt
   and control state (`src/main/browser/tabs.ts`); one `TabDebugger` per view is the only CDP path, with an in-flight
   `Input.*` table that attributes input to the agent (`src/main/browser/debugger.ts`, `src/main/browser/input.ts`);
   E4c's Playwright bridge is in-process over `TabDebugger.send` and refuses `Browser.*`, `Storage.*`,
   `SystemInfo.*`, `Tethering.*` and most `Target.*` on page sessions (`src/main/browser/agent/bridge.ts`). Agent-held
   downloads are cancelled today (`src/main/browser/downloads.ts`); JavaScript dialogs are routed by a wrap of
   Electron's internal `-run-dialog` listener because `Page.handleJavaScriptDialog` answers the page but never closes
   Electron's native box (`src/main/browser/agent/dialogs.ts`, P1 A-42). The agent's cursor is drawn by the page's
   preload from main's observation of `Input.dispatchMouseEvent` while the tab's control is `agent`
   (`src/main/browser/agent/cursor.ts`). [verified]
7. MAWS's engine launch declares `sdkMcpServers: ['maws']`, passes `--setting-sources user,project,local` without
   `--strict-mcp-config`, so user-installed plugin MCP servers load (recorded with `plugin:ptc:ptc` in
   `spikes/protocol-probe/fixtures/pass2/real-settings.jsonl:15`); the engine environment is an allowlist that drops
   `CUA_*` and `BROWSER_USE_*` from the shell, and `extraSettings.env` is the one way to add a variable
   (`src/engine-host/launch.ts`, `src/main/sessions/launch-mapping.ts`). Electron's extension support has no
   `chrome.debugger` or `nativeMessaging` (E4b plan line 107), so cua's Chrome extension cannot run inside MAWS.
   [verified]
8. Bindings to amend in MAWS: P1 X9 (the `maws` server's tool names are frozen), A-19 (the agent's CDP route is the
   scoped `webContents.debugger` bridge; the remote-debugging port never ships), A-43 (no listening browser-agent
   socket in a packaged build), charter §19 line 982 (2026-10-05: "driven by MAWS's own browser tools over CDP … cua
   kept for native apps and real Chrome") and §16 line 614 (MAWS bundles `cua-shim.mjs` in its own `--mcp-config`).
   [verified]
9. Performance: no recorded finding that MAWS's driver is slow (cold attach 37-46 ms, click 16-17 ms, evaluate
   0.7 ms, `spikes/browser-probe/findings.txt:20-27`); the recorded quality issues are large low-yield ARIA snapshots
   (a 24k cut kept 19-50 % of refs on real pages), eval's fixed 250 ms wait and late download reports
   (`docs/tech-debt-tracker.md:78-86`). The replacement's rationale is one browser API, not speed. [verified]

## Design

### Shape: MAWS stands where the Chrome extension stands

cua's Chrome route is `vendor service → cua host → cua extension → Chrome`. The in-app route keeps the first two
links and replaces the third: MAWS's main process serves the extension's primitives (Facts 4) over a Unix socket, and
cua's host runs inside `cua serve` connected to that socket instead of being spawned by Chrome over stdio. The vendor
service sees an `extension` backend named `cua` with family `chrome` (MAWS's pages are Chromium; the family is what the
service's selection rules and cua's inventory expect) and a profile name `MAWS`, so nothing in the vendor service and
nothing in the host's session, turn, handoff, viewport or download logic changes.

The strongest alternative, a full `iab` backend inside MAWS (the Codex app's shape), lost: it re-implements the 23
backend methods and the host's tested rules in TypeScript, needs cua to add `iab` to the allowed kinds and to pass the
service's session id into MAWS for the session-scoped listing, and buys only the `iab`-specific pieces (`allowDownload`,
file-URL preference) that nothing here needs. Exposing a Chromium CDP port lost on Facts 1 (no zero-adapter route) and
on A-19.

### The MAWS primitive server (MAWS, `src/main/browser/cua/`)

**Socket and lifecycle.** One socket per app session, `<userData>/browser/cua/<appSessionId>.sock` in a directory
created 0700, listening from the session's first engine launch until the session is removed or the app exits (the
socket file is unlinked on close). MAWS passes `CUA_BROWSER_BACKENDS=<that path>` through `extraSettings.env` of the
session's launch spec (`src/main/sessions/launch-mapping.ts` sets `extraSettings`), so the engine, its subagents and
the cua_repl shim they start inherit it and nothing else does: the path is the session's authorization. A connecting
client gets the `hello` notification at once:

    {extensionId: 'maws', extensionInstanceId: 'maws:<appSessionId>', version: <MAWS app version>,
     protocolVersion: 1, profileName: 'MAWS'}

`protocolVersion` is cua's `PROTOCOL_VERSION` (`src/chrome/extension.mjs`); a host of another major refuses with
`hostRefused`, which MAWS logs. Several clients may connect over the socket's life (a relaunched `cua serve`, a fork
subagent's own shim, an inventory launch of `cua profiles list`); each connection is its own host in its own process
with its own tab ownership, and MAWS keeps per-connection state only (integer tab ids, leases, held commands, pending
dialog callbacks). Tab lifecycle authority is the connection's, separately from the debugger lease: a tab created
through a connection (`tabs.create`, or adopted from such a tab's `window.open`) is *reserved* to that connection
until the connection closes, whether or not a lease is held at the moment; `debugger.attach` on a tab reserved to
another live connection, or under another connection's lease, is refused with `Tab is held by another agent session`
(the host reports it to the vendor, which fails the call; no retry), and the destructive primitives, `tabs.remove` and
the emulated `Target.closeTarget`, succeed only for a tab reserved to the requesting connection (a person's tab is
never closed through a primitive: the host releases claimed tabs open at turn end, and a request to close one answers
`Tab is not owned by this agent session`). When a connection closes its reserved tabs become the person's (any
connection may then claim them). So a host that times out and detaches keeps its created tab, no other host can take
it meanwhile, and its `turnEnded` cleanup closes only what is its own. When a connection closes, MAWS cancels its held commands, releases its leases and hides its cursor;
tabs stay open (the host closes unmarked tabs at `turnEnded` itself, as on Chrome; a client that dies mid-turn leaves
its tabs for the person, as a dead Chrome host does).

**Tab model.** The primitives' integer tab ids are minted per connection (1, 2, …) and mapped to MAWS `b_` tab ids;
an id is never reused within a connection. The tabs a connection sees are the app session's reachable tabs — its own
and its parent's, the rule the six tools apply today (`reaches` in `src/main/browser/agent/index.ts`); a request naming
any other tab is refused with `No tab with id: <n>` (Chrome's wording, which the host passes through). Mapping:

| Primitive | MAWS |
|---|---|
| `tabs.query` | `TabStore.list(appSessionId)` and the parent's: `{id, windowId, url, title, active, groupId}`; `active` is the pane's selection; `groupId` is the connection's group id for tabs created through this connection, else -1 |
| `tabs.get {tabId}` | the same record for one tab |
| `tabs.create {url, windowId, group, openerTabId, guard}` | `TabStore.open({appSessionId, url, select: false})` in the session's Browser panel, partition per the active profile setting as for a human tab; answers the record; `group` is honoured as the connection's group id (the panel shows the tab with an "agent" badge, M3) |
| `tabs.remove {tabId}` | `TabStore.close` |
| `tabs.ungroup {tabId}` | drops the badge; the tab is no longer in the connection's group |
| `tabs.guard / tabs.unguard` | `{}`: Electron's debugger has no "another extension's frame" refusal, so nothing to sweep |
| `group.title {windowId, key, title}` | the badge text (the host names groups after the session; `cua` by default) |
| `windows.query` | the app's `BrowserWindow`s as `{id, focused, type: 'normal'}` |
| `windows.create {focused}` | answers the window that shows the session (no window is created: an agent tab always lives in its session's panel) |
| `debugger.attach {tabId}` / `{targetId}` | a lease on the tab's `TabDebugger` (below); `{targetId}` for a child target the tab's auto-attach announced: recorded, no second attachment |
| `debugger.detach` | releases the lease; the attachment ends when no lease remains |
| `debugger.sendCommand {debuggee, sessionId, method, params}` | `TabDebugger.send(method, params, sessionId)` on the debuggee's tab, through the filter below |
| `debugger.getTargets` | the page targets of the reachable tabs (`{targetId, type: 'page', title, url, attached, tabId}`) and the child targets their auto-attach announced; never a MAWS shell renderer, the import's temporary view or a DevTools target |
| `cursor.move {tabId, x, y}` (new, M1 adds it to the host) | the agent cursor's `move` message (M3) |

Notifications to the host: `debugger.event {debuggee, sessionId, method, params}` for every event of a leased tab
(child-session events carry their `sessionId`, as Chrome's do); `debugger.detached {debuggee, reason}` with
`target_closed` when the view is destroyed, the renderer is gone or the tab closes, and `canceled_by_user` never (the
person takes over by input, not by detaching); `tabs.removed {tabId}`, `tabs.updated {tabId, url, title, status}` on
committed navigations and title changes of reachable tabs; `tabs.adopted {openerTabId, tabId, url}` when a leased tab's
`window.open` is honoured (the adopted child, already a session tab, is announced by id; the host owns it as a tab
created by the opener's turn, so `end_task` closes it unless marked, and never opens a second one; MAWS never sends
`tabs.popup`, whose meaning is "open this URL", which would duplicate the child and lose `window.opener`);
`downloads.created` / `downloads.changed` (M3).

**Debugger leases, automation ownership and the command filter.** `TabDebugger` becomes lease-counted: `lease()`
attaches when nothing is attached and returns `{release()}`; the attachment ends when the last lease releases. Today's
`attach()`/`detach()` pair (the Playwright driver, focus emulation, E4d's crop) becomes one implicit lease per owner,
so no owner's detach can end an attachment another owner still uses. Leases count attachment, not authority: CDP state
(Fetch interception, auto-attach, device metrics, enabled domains) belongs to the one attachment, so automation
ownership is exclusive. One automation owner per tab: a cua connection's lease, or, until M4 removes it, the old
driver; the server refuses `debugger.attach` on a tab the old driver holds (`Tab is driven by the maws tools`) and the
old driver refuses a tab under a cua lease with its `tabInUse` error. The old driver's teardown keeps its own rule
(`driver.ts`): auto-attach is reset before its bridge closes whatever leases remain, so a frame or worker paused by
its `waitForDebuggerOnStart` is never left with nobody to resume it; only its physical detach follows the lease count. Focus emulation (`visibility.ts`,
MAWS's own, default off) may keep the attachment alive after the agent lets go; so the server, on `debugger.detach`,
on the host's timeout detach, on turn end and on disconnect, resets the agent's state before releasing its lease.
The server records every persistent toggle the connection switched on through the lease and undoes each:
`Fetch.enable` → `Fetch.disable`; `Target.setAutoAttach` → `{autoAttach: false, flatten: true}`;
`Emulation.setDeviceMetricsOverride` → `clearDeviceMetricsOverride`; `Emulation.setFocusEmulationEnabled` →
`{enabled: false}` unless MAWS's own focus emulation is on; `Page.setInterceptFileChooserDialog` → `{enabled: false}`
(the vendor disables it in a `finally` that never runs when the shim dies mid-wait, BS:50034-50063, and a person's
later file-input click would otherwise open no picker). A persisting attachment then carries no agent state and a
handed-back page never stalls on an interception nobody consumes.

Commands pass through E4c's boundary, lifted from `src/main/browser/agent/bridge.ts` into the server: no `Browser.*`,
`Storage.*`, `SystemInfo.*`, `Tethering.*`; of `Target.*` only `setAutoAttach`, `detachFromTarget`, `getTargetInfo`,
`attachToTarget` (flattened, for a child target of the same tab), `getTargets` answered from the inventory above, and
`closeTarget` emulated: its `targetId` must be the page target of a tab this connection holds a lease on, which is
then closed through `TabStore.close` (the vendor's `tab.close()` sends `Target.closeTarget` whenever it knows a target
id, BS:47991-48024); any other target answers `No target with given id found`. `Page.handleJavaScriptDialog` and
`Page.setInterceptFileChooserDialog` take the dialog and chooser paths of M3. A refused method answers the error
`Method not allowed: <method>`. Everything else, `Input.*`, `Runtime.*`, `DOM.*`, `Page.*`, `Network.*`, `Fetch.*`,
`Emulation.*`, `Accessibility.*`, passes unchanged, Chromium's own error strings included (the host relies on
"Debugger is not attached" wording only for Chrome's refusal, which Electron never produces; a crashed tab answers the
lease's `target_closed` detach instead). `debugger.sendCommand` carries the host's `timeoutMs` (M1 forwards the
vendor's per-command deadline; absent means the host's 10 s default) so the server can bound its own holds (takeover,
below) and cancel: a command still held when its deadline passes, when its tab is detached by the host's timeout, when
the turn ends, the connection closes or the tab is destroyed, is rejected at once with `Command cancelled: <why>`.

**Session authorization.** The socket path is known to one app session's engine and nothing else; the directory is
0700; no peer credential check beyond that (the Codex app's signed-peer check is its product's; cua's own Chrome
sockets rely on the same filesystem rule). A fork subagent of the session shares the socket by design: it is the same
app session. Two app sessions never share a socket, and on the cua side a client-mode host is listed only to the
process that opened it (next section), so no other session's vendor runtime can list, select or claim tabs through
it (A11).

### cua: the host's client mode, discovery, `profiles_list` (`src/chrome/`, `src/runtime/`, `src/mcp/`)

**Client mode.** `runHost` already takes any stream pair; `cua serve` (and the inventory launch of `cua profiles
list`) reads `CUA_BROWSER_BACKENDS` (absolute socket paths, `:`-separated), connects to each, and runs `runHost({stdin:
socket, stdout: socket, socketName})` in its own process. Client-mode hosts listen in their own directory,
`$CUA_HOME/chrome/m/` (0700), never in `chrome/b/`, which `backendPaths` scans for Chrome hosts; the name is
`<socketNameFor(<configured MAWS socket path>)>-<pid>.sock`, known before any hello (M1 gives `runHost` a
`socketName` option for this; the Chrome entry keeps deriving it from the hello) and unique per process, so a fork
subagent's shim, an inventory launch and a relaunched `cua serve` each run their own host for the same MAWS session
without `already_served`, and one exiting never touches another's. Nothing scans `chrome/m/`: a process lists exactly
the client-mode hosts it opened, which is what keeps one session's backend out of every other process's inventory.
Status files and logs follow the same name under `chrome/b/` and `chrome/logs/`; `cua doctor` reports client-mode
hosts under a "MAWS" heading. The connection is kept: a refused or lost connection is retried every 5 s for the life
of the server (MAWS quitting and relaunching, D-16's detached engine), and the host's socket exists only while
connected. Because the path is known in advance it is prelisted in `BROWSER_USE_BACKEND_PATHS` whether or not the
backend answered yet: `cua serve` waits up to 5 s for each configured backend's `hello` before launching the vendor
runtime so the first `listBrowsers` finds it, and a backend that answers later is found at the next `listBrowsers`
(the vendor retries every listed path, BS:67722-67753).

**Discovery.** With `CUA_BROWSER_BACKENDS` set, `BROWSER_USE_BACKEND_PATHS` is set on every route: this process's
client-mode host sockets, plus the cua route's Chrome sockets as today, plus, on the vendor route, every `*.sock` present in
`/tmp/codex-browser-use` at launch (the OpenAI hosts the vendor would have scanned; sockets appearing later are found at
the next `cua serve`, the same limit the cua route has for unbound profiles). `BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID`
is set to the first configured backend's instance id, and, because the vendor's selector falls back from a missing
preferred instance to any extension (BS:68229-68235), the default is also enforced in cua's trusted browser wrapper
(`src/services/browser.mjs`, which already intercepts every browser RPC): with `CUA_BROWSER_DEFAULT_INSTANCE=<that
id>` in the launch env, a selection request that names no browser, kind, family or instance is rewritten to
`{extensionInstanceId: <id>}` before it reaches the vendor, so `cua.getBrowser()` with no argument is the in-app
browser or fails with the vendor's own unavailable error while MAWS is down; it never lands in the owner's Chrome. A
selection that names a Chrome profile's instance id passes untouched (the owner's choice: in MAWS the in-app browser
is the default; a Chrome profile is used when the user names it).

**`profiles_list`.** Its result gains one entry per configured backend ahead of the registered profiles:
`{key: 'maws', ready: true, extensionInstanceId: 'maws:<id>'}` when the host is connected and listening, else
`{key: 'maws', ready: false, reason: 'maws_unreachable'}` with the reason text "MAWS is not running or this session's
browser socket is gone; start MAWS, then call profiles_list again". A second configured backend takes key `maws-2`, and
so on (one is the normal case). The key `maws` is reserved: `cua profiles add maws` is refused with
`reserved_key`. The entry is never written to the registry. The tool description gains, when a backend is configured,
the line "- In MAWS: cua.getBrowser() with no id is this session's in-app browser (key maws). Use a Chrome profile
only when the user names one." in place of the first Chrome rule's last sentence, keeping the description under
Claude Code's 2,048-character cap.

**Host changes for a MAWS peer.** The host forwards the vendor's `moveMouse {tabId, x, y}` as the primitive
`cursor.move` when the extension's hello carries `profileName` (a MAWS peer); for the Chrome extension, which has no
cursor overlay, it stays the no-op it is. `cursor.move` is a request answered `{}`. `debugger.sendCommand` gains
`timeoutMs` (the limit `executeCdp` computes) on every peer; the Chrome extension ignores the extra field. The host
handles the new notification `tabs.adopted {openerTabId, tabId, url}`: when the opener is owned by a live turn, the
tab is owned as created by that turn and becomes its active tab (what `tabs.popup` does after its own `tabs.create`,
without the create and without the http-only URL check: the tab exists already, `about:blank` included); otherwise it
is logged and left to the person. The host's `getInfo` carries `metadata.profileName` from the hello when
present, which is what the vendor lists as the backend's profile name and what cua's inventory shows.

**Plugin.** `.claude-plugin/plugin.json` and `marketplace.json` go to 0.5.0 (plugin-visible: the `maws` profile and
the surface text). The README's "For MAWS" section is rewritten to the user-installed-plugin route and the
`CUA_BROWSER_BACKENDS` contract; the Chrome section's profiles text mentions the `maws` key.

### Retained MAWS semantics (MAWS, M3)

**Who drives the tab.** Control (`src/main/browser/agent/control.ts`) keeps its three states. The agent's actions no
longer arrive as tool calls, so the transitions move to the lease: a tab enters `agent` on the first *acting* command
(below) sent through a lease and re-arms the 10 s agent-idle timer on every such command; it returns to `idle` when the
timer lapses or the lease is released. Reading commands never change control, so a permitted read during `human`
cannot revoke the person's hold. Human input still takes the page (`human`) exactly as today, with the 3 s hand-back
timer.

**Acting and reading commands.** The vendor acts through more than `Input.*`: `selectOption` is an injected script
run by `Runtime.callFunctionOn` (BS:49874-49898), and locators evaluate through `Runtime.*`. So the class is defined
conservatively: a *reading* command is one of `Page.captureScreenshot`, `Page.getFrameTree`,
`Page.getNavigationHistory`, `Page.getLayoutMetrics`, `DOM.getDocument`, `DOM.describeNode`, `DOM.getBoxModel`,
`DOM.getContentQuads`, `DOM.getNodeForLocation`, `DOM.resolveNode`, `Accessibility.*`, `Target.setAutoAttach`,
`Target.detachFromTarget`, `Target.getTargetInfo`, `Target.attachToTarget`, `Target.getTargets` (`Target.closeTarget`
is acting: the vendor's `tab.close()` sends it on an attached tab, BS:47991-48024, 48075-48077, and the person's page
must not vanish under their hands),
`Runtime.enable`/`disable`, `Page.enable`/`disable`, `Network.enable`/`disable`, `Fetch.enable`/`disable`,
`Fetch.continueRequest`/`continueResponse`/`failRequest` (a paused request must proceed or the page stalls),
`Emulation.setFocusEmulationEnabled`, `Emulation.setDeviceMetricsOverride`/`clearDeviceMetricsOverride`; every other
command, `Runtime.evaluate` and `Runtime.callFunctionOn` included, is *acting*.

**Takeover.** Before an acting command is marked and dispatched the server asks control's existing `personHolds`
predicate (the control is `human`, or the person's last input on the tab is within the 3 s hand-back window while
the tab is `idle`, `control.ts`), and a recent touch of an idle tab promotes it to `human` first, exactly as the old
tools' pause point does; so a person who just touched an idle tab, or a tab whose agent-idle timer lapsed, is
protected the same way. While a tab is `human`, an acting command through a lease is held waiting for hand-back for
at most
`min(BROWSER_TAKEOVER_HOLD_MS = 1500, timeoutMs - 100)` ms, where `timeoutMs` is the deadline the host passes with the
command (the vendor converts a locator action's remaining budget to it, BS:48768-48779, and it can be below 1.5 s), then
refused with the error `A person is using this tab; wait and retry`; a command whose deadline is already under 200 ms
is refused at once. A held command is cancelled by the events listed under the command filter. The vendor caps locator
actions at 3 s and the host detaches a tab on its own timeout, so a longer hold would turn the person's touch into a
lost tab. Reading commands pass during `human`. The chrome's existing control affordances (the takeover banner, Hand
back) are unchanged.

**Cursor.** `AgentCursor` already draws `move`, `press` and `release` from the `Input.dispatchMouseEvent` commands it
observes while the tab is `agent`; `cursor.move` adds a `move` for the vendor's `moveMouse` so the pointer shows where
the agent aims before a locator click. `hide` follows the lease's release as it follows the agent letting go today.

**Action rows.** The agent's work arrives as cua_repl `js` calls (`mcp__plugin_cua_cua_repl__js`), opaque to MAWS. Main
synthesizes the browser activity from the primitive stream and sends it to the renderer as a new IPC event
`browser.agent.activity {appSessionId, tabId, at, activity}` where `activity` is one of:

    {kind: 'navigated', url, title}               Page.frameNavigated of the main frame, committed
    {kind: 'clicked', x, y, label}                 Input.dispatchMouseEvent mousePressed (label: below, or null)
    {kind: 'typed', chars}                         Input.insertText / dispatchKeyEvent char, coalesced per second
    {kind: 'key', key}                             Input.dispatchKeyEvent of a non-character key (Enter, Tab, …)
    {kind: 'screenshot'}                           Page.captureScreenshot
    {kind: 'download', filename, state}            downloads.created / changed
    {kind: 'dialog', type, excerpt, answered}      a dialog opened / answered (M3's dialog path)
    {kind: 'tabOpened' | 'tabClosed', url}         tabs.create / tabs.remove / Target.closeTarget / a popup adopted

The click label is the clicked node's tag and accessible text: `DOM.getNodeForLocation` at the click, then
`Accessibility.getPartialAXTree` for its name, else the node's text, cut to 40 characters; a failure leaves `null` and
is not retried. Typed text never leaves main (a cell can type a substituted secret); only its length does. The
renderer attaches each activity to the session's cua_repl `js` call in flight when it arrives, else to the most recent
one of the turn, else as a standalone row; rows reuse `BrowserActionRow`'s line ("Navigated to example.com", "Clicked
button Submit", "Typed 12 characters", "Screenshot", "Downloaded cua-report.pdf"). The derive layer's `browser_action`
presentation keeps classifying historical `mcp__maws__browser_*` tool uses, so old journals and X8 fixtures still
render.

**Downloads.** A `will-download` whose webContents is a tab under a lease is the agent's: saved without a dialog to
`~/Downloads` under its suggested name, suffixed ` (2)`, ` (3)`… on collision (Chrome's rule), reported as
`downloads.created {id, url, finalUrl, filename, state: 'in_progress'}` and `downloads.changed {id, filename, state,
error}` with `state: 'complete'` or `'interrupted'` (`error: 'USER_CANCELED'` for a cancel), the shape the host maps
(`src/chrome/host.mjs`, "Downloads"). The tab's download line and Reveal in Finder work as for a human download. A completed file becomes a session
deliverable through a new validated host command main dispatches to the session's engine host,
`maws.download.recorded {appSessionId, tabId, path, filename, url, bytes}` (the route `maws.artifact.captured` already
takes: `HostSupervisor.dispatch`, `src/main/deliverables/index.ts`); the engine host writes it through
`DeliverableWriter` (`src/engine-host/deliverables/store.ts`, which owns writes and emits the store change) as a file
deliverable, ignores a path it already recorded, and logs a failure without affecting the saved file. The vendor's
"Allow download from <origin>" elicitation is accepted by the plugin's hook (`hooks/cua-approve.sh`). A download from a
tab under no lease stays the human's, with the save dialog.

**Dialogs (after spike S1).** On a tab under a lease, the `-run-dialog` wrap takes the `agent` route as today but
answers nothing itself: it holds the callback and lets CDP decide. S1 settles which of two mechanisms carries it:

- promote (native): Electron delivers `Page.javascriptDialogOpening` while the callback is held, and
  `Page.handleJavaScriptDialog {accept, promptText}` resolves the page's `alert`/`confirm` without the held callback
  crashing or double-answering when it is later discarded; then the wrap only swallows the callback;
- else (synthetic): the server emits `debugger.event Page.javascriptDialogOpening {url, message, type, hasBrowserHandler:
  false, defaultPrompt}` itself, intercepts `Page.handleJavaScriptDialog` to answer the held callback, and emits
  `Page.javascriptDialogClosed {result, userInput}`.

Either way a dialog nobody answers within 30 s gets today's defaults (alert dismissed, confirm false) and a `Closed`
event, so a cell that ignores dialogs cannot hang the tab; the activity row records type, excerpt and answer.
`prompt()` stays refused by Electron's renderer.

**File chooser (after spike S2).** S2 asks whether `Page.setInterceptFileChooserDialog {enabled: true}` makes Electron
emit `Page.fileChooserOpened {backendNodeId, mode}` instead of its native file dialog, and whether
`DOM.setFileInputFiles {backendNodeId, files}` then fills the input. Promote: the commands pass through unchanged and A6
is proven. Discard: the server refuses `Page.setInterceptFileChooserDialog` with `File chooser is not supported in
MAWS` so the vendor's upload fails fast, the README's Limitations say so, and a tech-debt row carries the finding.

**Parking and placement.** An agent-created tab appears in the session's Browser panel unselected (the owner's choice;
the Codex app does the same). A tab under a lease that no pane shows is parked at 1280×800 as today (`visible.ts`: the
rule's "the agent holds it or has a request on it" becomes "a lease is held on it"), so locators, hit-testing and
screenshots work on a tab the person is not looking at.

**Popups.** `window.open` from a tab under a lease passes the activation gate on the agent's attributed input as today;
the adopted child is a session tab and the server sends `tabs.adopted`, so the host owns it and the vendor's tab list
shows it on the next `listTabs` (the pinned vendor has no popup event: `waitForEvent` knows `download` and
`filechooser` only, BS:878-890).

### Removal and the charter (MAWS, M4)

The `maws` server stops listing the six browser tools; `send_file`, `ask`, `show_pane` and the artifact tools stay.
Removed with them: `src/engine-host/tool-server/browser.ts`, `browser-bridge.ts`, `src/main/browser/agent/{handlers,
act, locate, snapshot, screenshot, driver, bridge, progress, errors}.ts` and their tests, the `maws.browser.*` IPC
schema, and `playwright-core` if no other importer remains (the executor checks; CHIPS import and comment mode use CDP
and the preload directly). Kept and re-homed out of `startBrowserAgent`: `TabControls`, `AgentCursor`, `PageDialogs`,
`Parking`, the `-run-dialog` wrap, the e2e seam's `control`, `lastInputs`, `sendInput` and `cursorMessages`. The
renderer keeps `BrowserActionRow` and the historical classification (above).

Dated Decision Log entries in `docs/doperpowers/plans/2026-10-05-p1-extension.md`, each written before the code it
licenses (MAWS's rule: a binding changes by entry, never by divergence): A-19 and A-43 as M2's first commit (the
scoped `webContents.debugger` route is now served to cua's host through the primitive server, the port still never
ships; a packaged build listens on one 0700 Unix socket per app session under userData, for cua's host only); A-42 at
M3's start, after S1's verdict (the agent-held `alert`/`confirm` defaults become the vendor's answer with the 30 s
default, the wrap's guard, the human-tab routing and the Electron-upgrade re-verification row stay as A-42 states
them); X9 at M4's start (the six browser tools leave the `maws` server; the other tools' names stay frozen); and in
`docs/charter.md` §19, at M4, a 2026-10-08 entry superseding line 982's browser-tool choice with the owner's
replacement decision, with §16 line 614's `cua-shim.mjs` bundling replaced by the user-installed plugin (the owner's
choice: it is the route that works today; bundling can return when MAWS ships to others). A short execution pointer
`docs/doperpowers/plans/2026-10-08-e13-cua-in-app-browser.md` names this spec, its milestones M2-M5 and the MAWS
branch, so MAWS's own convention (execution documents under `plans/`) holds; it is M2's first commit too.

### Lifecycle and failure table

| Event | MAWS | cua |
|---|---|---|
| App session's first engine launch | socket listening; `CUA_BROWSER_BACKENDS` in the engine env | — |
| `cua serve` starts in the engine | — | connects, gets `hello`, host listens, vendor launched with the socket listed and preferred |
| Engine or `cua serve` exits | connection closes: held commands cancelled, state reset, leases released, cursor hidden, tabs stay | that process's host exits; other processes' hosts for the same session are untouched |
| MAWS quits while the engine lives (D-16) | socket gone | host exits; `profiles_list` → `maws_unreachable`; retry every 5 s |
| MAWS relaunched, same session resumed | same path listening again | reconnects; `maws` ready without relaunching the engine (A13) |
| Human closes an agent tab | `tabs.removed` | host forgets the tab; the vendor reports the tab closed |
| Renderer crash | `debugger.detached target_closed` | next command re-attaches (host rule) |
| Second app session | its own socket and env | its own host; neither lists the other's tabs |
| Hello refused (protocol major) | logs `hostRefused`, keeps listening | host exits; retry every 5 s (a newer MAWS or cua must be installed) |

### What users see change

- In MAWS: `profiles_list` lists `maws`; `cua.getBrowser()` is the in-app browser; agent tabs appear in the session's
  Browser panel with an "agent" badge; the cursor, takeover banner and download line behave as before; the transcript
  shows activity rows under the agent's `js` calls instead of one row per browser tool call; `browser_*` tools are
  gone from the `maws` server (skills that named `mcp__maws__browser_*` must use cua_repl).
- Outside MAWS: nothing changes; `cua profiles add maws` is refused.

### Out of scope

Board #90 (bookmarks import and bar, extensions bar, avatar, settings widget); `iab`-style session-scoped listing;
a `canceled_by_user` stop button on the tab chrome; visibility capability (`browser_visibility_*`); bundling the plugin
into MAWS; per-session download directories; replaying typed text in rows.

## Acceptance

Every check runs with MAWS built from the M4 branch (`pnpm build:app`, or the dev build) and the cua plugin from the M1
branch installed (plugin 0.5.0, `~/.claude` plugin cache). "Inside MAWS" means a session started from the app with the
owner's user settings; "from a terminal" means `cua serve` run by hand with `CUA_BROWSER_BACKENDS` pointing at a live
session's socket, which exercises the same backend without the engine.

1. Inside MAWS, the session's `profiles_list` answers `[{key: 'maws', ready: true, extensionInstanceId: 'maws:<the
   session's appSessionId>'}, …registered Chrome profiles]`.
2. A `js` cell `const b = await cua.getBrowser(); const t = await cua.createBrowserTab(b.browserId, '<features
   page>'); return await t.playwright.locator('#marker').textContent()` returns the page's document marker; the tab is
   listed in the session's Browser panel, not selected, with an "agent" badge (the badge is M3's; M2 proves the rest).
3. On the features page (`scripts/accept/features-page.mjs`, extended in M1 with `#name`, `#submit`, `#popup`),
   `locator('#name').fill('x')` then `locator('#submit').click()` makes `#state` read `submitted:x`;
   `browser_viewport_set` 800×600 then `tab.screenshot()` returns a PNG of 800×600; reset returns the pane's size.
4. `tab.playwright.waitForEvent('download')` around `locator('#dl').click()` resolves and `download.path()` is under
   `~/Downloads/`, the file's sha256 equal to the fixture's (`a3030829e7251330d53ac0d0a803039b8f82f6fa53d294b66e76d8fe3d8c6ec5`),
   no save dialog shown, the tab's download line showing the file, and the session's deliverables listing it.
5. After `locator('#alert').click()`, `tab.getJsDialog()` returns a dialog of type `alert` whose `dismiss()` lets the
   page continue (`#state` reads `after-alert`); after `locator('#confirm').click()`, the `confirm` dialog's
   `dismiss()` makes `#state` read `confirm:false`; no native box appears in either case.
6. (if S2 promoted) `tab.playwright.waitForEvent('filechooser')` around `locator('#file').click()`, then
   `chooser.setFiles([<path>])`, makes `#picked` read `<name>:<size>`; (if discarded) the `waitForEvent` rejects within
   its timeout and the `js` result carries `File chooser is not supported in MAWS` from the refused
   `Page.setInterceptFileChooserDialog`.
7. After `locator('#popup').click()` (the page's `window.open('/popup')`), `cua.listTabs` for the browser shows one
   new tab whose URL ends in `/popup`, in the session's panel, with exactly one tab opened (no duplicate); `end_task`
   closes it with the agent's other tabs.
8. Takeover: with the person clicking in the tab, a `locator('#submit').click()` in the same second fails with `A
   person is using this tab; wait and retry` within 2 s; 3 s after the person's last input the same click succeeds; the
   tab chrome shows the control states. Proven by a MAWS e2e case (the seam's `sendInput`) and by hand in M5.
9. During `locator('#submit').hover()` the agent cursor is visible in the page; after `end_task` it is hidden. Proven
   by a MAWS e2e case (the seam's `cursorMessages`) and by hand in M5.
10. The transcript shows, under the `js` call's row: "Navigated to <host>", "Clicked button <label>", "Typed 1
    character", "Screenshot", "Downloaded cua-report.pdf".
11. `end_task` closes the agent's unmarked tabs; a tab marked handoff stays open and listed. Two sessions inside MAWS
    each create a tab; each session's `listTabs` shows only its own.
12. `tools/list` of the `maws` server has no `browser_*` entry; a journal from before the change (fixture
    `test/fixtures/transcripts/p1-maws-browser.jsonl`) still renders its browser rows in the replay snapshot test.
13. Quit MAWS while a session's engine runs (the supervisor keeps it), relaunch MAWS and resume the session: within
    10 s `profiles_list` shows `maws` ready again, without a new engine launch.
14. Inside MAWS, `cua.getBrowser({extensionInstanceId: <a bound Chrome profile's id>})` still drives the owner's
    Chrome (one tab created and closed).
15. Suites: cua `npm test` green; MAWS `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm test:live` green (the
    old browser live case is retired in M4).

## Constraints binding every milestone

- No attribution footers in commits, PRs, issues. Never read or print `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`
  or the extension key; never kill the owner's Chrome, ChatGPT or helper processes; no vendor bypass flags
  (`BROWSER_USE_DISABLE_AMBIENT_NETWORK`, `BROWSER_USE_SECURITY_MODE`) anywhere; no Electron `remote-debugging-port`
  (A-19); the cua Chrome extension and host code paths for Chrome stay byte-identical in behaviour (the Chrome tests
  pin them).
- Both repositories: work in worktrees (`/Users/new/Developer/GitHub/cua-wt-13` on `maws-in-app-browser-13`;
  `/Users/new/Developer/GitHub/MAWS-wt-13` on `e13-cua-in-app-browser` from `master`); the main checkouts stay on
  `main` / `master`. MAWS's `CLAUDE.md` binds its milestones: D-1 (the engine is never patched), X1-X8, light theme
  and tokens, Decision Log entries for every binding changed.
- Protocol: the primitive protocol is the extension protocol of
  `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md` ("The extension protocol"), version 1, with the
  additions this spec names (`profileName` in hello, `cursor.move`); a host frame to MAWS is at most 1 MiB and a MAWS
  frame to the host at most 64 MiB (`MAX_TO_EXTENSION_BYTES`, `MAX_FROM_EXTENSION_BYTES` in `src/chrome/host.mjs`: a
  large screenshot result travels MAWS → host).
- Secrets: typed text, CDP params and page content never enter logs, rows or notices; errors carry method names and
  tab ids only.
- Reviews: astra (GPT) rungs per the owner's note; the branch reviews are `doperpowers:reviewer-high`.

## Plan of Work

### M1 — cua: a host that connects, a backend that is found, a profile that is listed

At the end, `CUA_BROWSER_BACKENDS=<socket> cua serve` connects to a MAWS-shaped peer, serves the vendor backend protocol
for it, lists it as `maws` in `profiles_list` and makes it the vendor's preferred backend, all proven against a fake
MAWS peer and the real vendor runtime, with no MAWS code yet.

Touches: `src/chrome/host.mjs` (the `socketName` option, `cursor.move` for `moveMouse` when hello carries
`profileName`, `timeoutMs` on `debugger.sendCommand`, the `tabs.adopted` handler), `src/chrome/extension.mjs`
(`chrome/m/`), `src/chrome/discovery.mjs` and `src/runtime/launch.mjs` (`CUA_BROWSER_BACKENDS`, the prelisted
client-mode paths, the vendor-route `/tmp` sockets, the preferred instance), `src/mcp/server.mjs` and `src/cli.mjs`
(connect, wait for hello, retry; doctor's MAWS heading), `src/profiles/` (`maws` entries, the reserved key,
`maws_unreachable`), `src/mcp/surface.mjs` (the MAWS line), `scripts/accept/features-page.mjs` (`#name`, `#submit`
writing `submitted:<value>` to `#state`, `#popup` calling `window.open('/popup')` and a `/popup` document),
`src/services/browser.mjs` (the default-selection rewrite), `scripts/accept/maws-features.mjs` (the terminal
harness: against any configured backend it runs profiles, createTab, locator, viewport, popup and cleanup, reporting
JSON; with `--other <second socket>` it also starts a second client on that socket and checks isolation: each client's
`listBrowsers` shows one `maws` with its own instance id, and `getBrowser({extensionInstanceId: <the other's>})` fails
in each; M3 adds download, alert, confirm and chooser), `test/helpers/fake-maws-peer.mjs` (a fake MAWS
peer built on `test/helpers/fake-cua-extension.mjs`, which already models the extension's side: it listens on a
socket, sends hello with `profileName` on connect, and runs as a script for manual checks), README "For MAWS" and "Profiles", plugin 0.5.0.

Decisions: the retry interval is 5 s and the hello wait 5 s, both constants exported for tests; the inventory cell
(`src/profiles/inventory.mjs`) recognises a MAWS backend by its instance id prefix `maws:` rather than by profile name;
`cua profiles bind` ignores MAWS backends; a configured path that is not absolute fails the launch with
`invalid_setting` (as other env mistakes do); the vendor-route `/tmp/codex-browser-use` scan is cua's only when
`CUA_BROWSER_BACKENDS` is set (unset keeps today's behaviour exactly).

Does not touch: MAWS; the Chrome extension; the Chrome host's behaviour for a hello without `profileName`.

Proves: acceptance 1 and 14's cua half, 13's reconnect (with the fake peer restarted); pins: a `hello` without
`profileName` keeps `moveMouse` a no-op; `profiles_list` under a dead socket; two `cua serve` processes and an
inventory launch on one fake peer at once, the first exiting while the second keeps working; a process without
`CUA_BROWSER_BACKENDS` never lists another process's client-mode host; `tabs.adopted` owns the announced tab and
creates none; `timeoutMs` reaches the peer; with the MAWS peer disconnected and a Chrome-shaped fake peer listed, an
unqualified selection fails with the vendor's unavailable error while an explicit Chrome selection succeeds, and the
MAWS peer reconnecting restores the default without restarting the runtime; a MAWS → host frame over 1 MiB is accepted and a host → MAWS frame over
1 MiB fails without closing the connection; the description's length under 2,048.

### M2 — MAWS: the primitive server, with the two spikes

At the end, a running MAWS session listens on its socket, and `cua serve` from a terminal with `CUA_BROWSER_BACKENDS`
drives its tabs through the vendor runtime: create, navigate, locate, click, fill, screenshot, viewport, popup, close
at `end_task`; the engine of a session started in the app inherits the variable. S1 and S2 are answered.

Touches: new `src/main/browser/cua/` (server, framing, tab map, filter, leases, held commands and the state reset,
`Target.closeTarget`), `src/main/browser/debugger.ts` (leases), `src/main/browser/agent/driver.ts` (the last-lease
guard on its teardown and the `tabInUse` refusal of a tab under a cua lease), `src/main/browser/agent/visible.ts`
(parking by lease: "the agent holds it or has a request on it" gains "or a cua lease is held on it", the minimum a
background tab needs for locators and screenshots), `src/main/browser/index.ts` (start the server beside the store),
`src/main/sessions/launch-mapping.ts` and the launch spec (`extraSettings.env.CUA_BROWSER_BACKENDS`),
`src/main/browser/tabs.ts` only if `open` needs a "no select" that it lacks, tests beside each, a MAWS e2e case that
drives the socket with an in-repo fake host (the replacement for the retired browser live test),
`docs/doperpowers/plans/2026-10-05-p1-extension.md` (the A-19 and A-43 entries) and
`docs/doperpowers/plans/2026-10-08-e13-cua-in-app-browser.md` (the pointer), both in the first MAWS commit. Spikes S1 and S2 live under `spikes/cua-backend/` with a findings
file; their verdicts go to Surprises & Discoveries.

Decisions: the socket path is keyed by the session's persisted `appSessionId` (the sessions index), so a session
resumed after an app relaunch listens at the same path; if MAWS turns out to mint a new id on resume, the path follows
the new id, acceptance 13 is recorded BLOCKED with that finding and the Decision Log says so. MAWS has its own 40-line
framing and JSON-RPC peer in TypeScript (no dependency on this repository's
`protocol.mjs`); the socket directory is created at app start and swept of stale `.sock` files; the server's unit tests
use a fake host (a node client over the socket) and a fake `TabStore`/`TabDebugger`, the live proof uses the real cua
of M1; `debugger.getTargets` lists child targets from the `Target.attachedToTarget` events the server saw on the tab.

Does not touch: control transitions, cursor, dialogs, downloads, the badge (M3); the six tools and the Playwright
driver (M4), which keep working beside the server on tabs the server holds no lease on (one automation owner per tab;
overlap on one tab is refused, never arbitrated).

Proves: acceptance 2 (all but the badge), 3, 7, 11 (two app sessions opened in the app, the harness run with
`--other`), 13's MAWS half, through M1's terminal harness against a running session; pins: a tab of another session is refused; a refused CDP method's error text; the lease count across two
connections; the old driver retiring on one tab while a cua connection keeps navigating another with cross-origin
frames; the old driver retiring on a tab with focus emulation on, then a new cross-origin frame loading in that tab
and running (nothing left paused); host A times out and detaches, host B's attach on A's created tab is refused, A's
`turnEnded` closes only its own tab; a `tabs.remove` on a person's tab is refused; the state reset on detach with focus emulation on; `Target.closeTarget` on the owned tab and on a foreign
target id; a held command cancelled by disconnect.

### M3 — MAWS: what the person sees and keeps

At the end, the agent's work through cua is visible and bounded as the tools' was: control transitions and takeover,
the cursor, activity rows, agent downloads to `~/Downloads` with a deliverable, dialogs per S1, file chooser per S2,
parking by lease, the "agent" badge in the panel.

Touches: `src/main/browser/agent/{control, cursor, dialogs}.ts`, `src/main/browser/downloads.ts`,
`src/main/browser/cua/` (activity synthesis, the acting/reading classes, takeover holds, dialog and chooser paths),
`src/shared/ipc/schema/browser.ts` (`browser.agent.activity`), `src/shared/ipc/schema/maws.ts` and the engine host's
deliverables (`maws.download.recorded`), renderer transcript model (`derive.ts`, `rows.ts`, `BrowserAction.tsx`), the
panel's tab list (badge), e2e cases for takeover and the cursor through the seam, `scripts/accept/maws-features.mjs`
in this repository (download, alert, confirm, chooser steps), `docs/doperpowers/plans/2026-10-05-p1-extension.md`
(the A-42 entry, first commit of the milestone, after S1's verdict is in Surprises & Discoveries).

Decisions: typed-character coalescing window 1 s; label lookup bounded to 500 ms; the activity event is emitted at
most 20 times per second per tab (a mouse-move storm never floods the renderer; moves are not rows anyway);
`Accessibility.getPartialAXTree` is sent through the same lease so it is attributed as the agent's; the deliverable
record for a download is written when the item completes, never for a cancelled one.

Does not touch: the six tools' code (still present until M4); charter text.

Proves: acceptance 2's badge, 4, 5, 6, 8, 9, 10; pins: no typed text in any emitted event; the hold bounded by the
command's deadline, then the refusal; a `Runtime.callFunctionOn` during `human` is held, a `Page.captureScreenshot`
passes and leaves control `human`; an acting command within 3 s of a person's touch on an idle tab is held, and the
tab reads `human`; `Target.closeTarget` during takeover is held, then refused; a disconnect during a file-chooser wait
leaves interception off and the person's next file-input click opens the native picker; the 30 s dialog default; a
duplicate download path recorded once.

### M4 — MAWS: the cut-over

At the end, the `maws` server lists no browser tool, the Playwright driver and bridge are gone, old journals still
render, the charter and P1 bindings carry dated entries, and MAWS's tests and lint are green.

Touches: `src/engine-host/tool-server/{tools, browser, browser-bridge}.ts`, `src/shared/maws/browser.ts`, `src/shared/
ipc/schema/maws.ts`, `src/main/browser/agent/` (removal and re-homing), renderer `classify.ts` (historical names
kept), `test/live/maws-browser.live.test.ts` and `test/live/support/browser-stand-in.ts` (retired: they prompt for and
assert the removed tools; M2's e2e case is the replacement), `package.json` (`playwright-core` if unused),
`docs/charter.md`, `docs/doperpowers/plans/2026-10-05-p1-extension.md` (X9, first commit of the milestone),
`docs/tech-debt-tracker.md` (rows closed and the S2 row if discarded), the MAWS README's browser section if it names
the tools.

Decisions: snapshot tests whose fixtures contain browser tool calls are kept and must pass unchanged (presentation is
retained); `MAWS_TOOL_NAMES` loses the six names while `classify.ts` keeps a frozen list of the historical
`mcp__maws__browser_*` names for rendering; the X9 entry states the removal date and that no other tool moved.

Does not touch: cua.

Proves: acceptance 12 and 15's MAWS half.

### M5 — Live acceptance as written, release

At the end, the acceptance section has run against the real MAWS build and the real vendor runtime, the evidence is
recorded, the plugin is released, and #13 closes.

Touches: `scripts/accept/maws-features.mjs` (complete since M3; run here against the real build for items 2-7 and,
with `--other` and two app sessions opened in the app, 11), `docs/evidence/2026-10-08-maws-in-app-browser.md`,
README, `tech-debt-tracker.md`, the plugin cache on this Mac (`claude plugin update` or the marketplace path the owner
uses).

Decisions: items 1, 8, 9, 10, 12, 13, 14 are manual checks inside the app (8 and 9 also by the M3 e2e cases),
recorded with screenshots under `docs/evidence/`; a check that cannot run on this Mac is recorded BLOCKED with the
reason, never skipped silently.

Proves: acceptance 1-15.

## Concrete Steps

Working directories: cua `/Users/new/Developer/GitHub/cua-wt-13`, MAWS `/Users/new/Developer/GitHub/MAWS-wt-13`.

    # cua tests (M1, M5)
    npm test                                    # node --test "test/**/*.test.mjs"; expect every file ok
    # a MAWS-shaped fake peer for manual checks (M1 adds it):
    node test/helpers/fake-maws-peer.mjs --listen /tmp/maws-fake.sock
    CUA_BROWSER_BACKENDS=/tmp/maws-fake.sock CUA_HOME=/tmp/cua-h13 node bin/cua.mjs profiles list
    #   maws         ready      —            extension instance maws:<id>

    # MAWS (M2-M4)
    pnpm typecheck && pnpm lint && pnpm test   # expect 0 errors, every suite passing
    pnpm test:live                              # the browser live project (MAWS_LIVE=1)
    pnpm dev                                    # a running app for the terminal-driven checks

    # terminal-driven backend check against a running MAWS session (M2, M5)
    ls "$HOME/Library/Application Support/MAWS/browser/cua/"      # <appSessionId>.sock
    CUA_BROWSER_BACKENDS="$HOME/Library/Application Support/MAWS/browser/cua/<id>.sock" \
      node scripts/accept/maws-features.mjs --report /tmp/maws-features.json \
      --other "$HOME/Library/Application Support/MAWS/browser/cua/<id of a second session>.sock"
    #   {"profiles": "PASS", "createTab": "PASS", "locator": "PASS", "viewport": "PASS", "popup": "PASS",
    #    "download": "PASS", "alert": "PASS", "confirm": "PASS", "chooser": "PASS|BLOCKED", "cleanup": "PASS",
    #    "isolation": "PASS"}
    #   (M2 runs it before M3 adds the download, alert, confirm and chooser steps: those read "SKIP" then)

The MAWS userData path above is the packaged app's; the dev build's is printed by `pnpm dev` at start.

## Interfaces and Dependencies

**`CUA_BROWSER_BACKENDS`** (environment of `cua serve` and `cua profiles list`): absolute Unix socket paths,
`:`-separated. Each is a peer speaking the extension protocol (version 1) that sends `hello` on connect. Owner: M1
(reader), M2 (writer, through `extraSettings.env`). **`CUA_BROWSER_DEFAULT_INSTANCE`** (cua's launch env, set by
`cua serve` for the trusted worker): the instance id an unqualified browser selection is rewritten to. Owner: M1.

**hello** (peer → host, notification, first message):
`{extensionId: string, extensionInstanceId: string, version: string, protocolVersion: 1, profileName?: string}`.
`profileName` marks a non-Chrome peer: it enables `cursor.move` and the `maws` listing. Owner: M1 (host), M2 (MAWS).

**Primitives** (host → peer requests; peer → host notifications): the table in "The MAWS primitive server", plus
`cursor.move {tabId: number, x: number, y: number} → {}`, `timeoutMs?: number` on `debugger.sendCommand`, and the
notification `tabs.adopted {openerTabId: number, tabId: number, url: string}`. Errors are `{code: 1, message}` with
Chrome's wording where one exists (`No tab with id: <n>`, `No target with given id found`), `Method not allowed:
<method>` for the filter, `Tab is held by another agent session`, `Tab is not owned by this agent session`, `Tab is
driven by the maws tools`, `A person is using this tab; wait and retry`, `Command cancelled: <why>`. Owner: M1 (`cursor.move`, `timeoutMs`, `tabs.adopted`),
M2 (server), M3 (downloads, dialog and chooser paths).

**`profiles_list` entry** (cua MCP): `{key: 'maws' | 'maws-<n>', ready: boolean, extensionInstanceId?: string,
reason?: 'maws_unreachable'}`. Owner: M1.

**`TabDebugger.lease()`** (MAWS, `src/main/browser/debugger.ts`): `lease(): Promise<{release(): void}>`; attaches on
the first lease, detaches on the last release; `attach()`/`detach()` become one implicit lease per existing owner
(see "Debugger leases"). Owner: M2; consumers M3 (control, parking, cursor by lease).

**`browser.agent.activity`** (MAWS IPC, main → renderer): `{appSessionId, tabId, at: ISO string, activity}` with
`activity` as listed under "Action rows". Owner: M3.

**MAWS primitive server module** (`src/main/browser/cua/index.ts`): `startCuaBackend({store, windows, reaches,
userData, version}) → {socketPathFor(appSessionId): string, holds(tabId): boolean, dispose(): void}`; `socketPathFor`
is what the launch mapping writes into `extraSettings.env`; `holds` is what the old driver (M2) and parking consult.
Owner: M2.

**`maws.download.recorded`** (MAWS host command, main → engine host): `{appSessionId, tabId, path, filename, url,
bytes}`; the engine host records a file deliverable once per path. Owner: M3.

**`runHost({…, socketName?})`** (cua, `src/chrome/host.mjs`): when given, the host listens at
`$CUA_HOME/chrome/m/<socketName>.sock` and names its status file and log the same; when absent, today's Chrome rule.
Owner: M1.

Dependencies: Electron as pinned by MAWS (44.4.5: its `-run-dialog` event and `webContents.debugger` behaviour are
what S1/S2 measure); Node's `net` for sockets on both sides; no new npm dependency on either side.

## Surprises & Discoveries

- (none yet)

## Decision Log

- Decision (2026-10-08, authoring): verification. Spec review by the `doperpowers:adversarial-reviewer` agent (the
  spec is technical-heavy: two repositories, a wire protocol and Electron internals), and a buildability review of
  the execution section by the same agent type in the same round. Each milestone frontier under
  doperpowers:subagent-driven-execution is reviewed by `doperpowers:reviewer-high`; the two pull requests (cua,
  MAWS) get the whole-branch doperpowers:review-code at the high rung. Spikes S1 and S2 record their verdicts in
  Surprises & Discoveries before M3 starts.
  Rationale: the cost of a wrong wire or lease decision is paid in both repositories; the owner's note prefers astra
  rungs this month.
  Date/Author: 2026-10-08, the design session (cua_repl session 1ea561bc).

- Decision (2026-10-08, after the first review round): client-mode hosts live in `chrome/m/` under a per-process name
  prelisted from the configured path, and only the opening process lists them; a tab has one automation owner and the
  server resets agent CDP state before releasing a lease; `tabs.adopted` replaces `tabs.popup` for MAWS; the takeover
  gate classes commands as acting or reading and bounds its hold by the command's deadline, which the host now
  forwards; `Target.closeTarget` is emulated; A-42 joins the amendments and A-19/A-43 move ahead of M2's code;
  parking by lease and the terminal harness move to M2/M1; acceptance uses the pinned vendor's API names
  (`createBrowserTab`, `getJsDialog`, `waitForEvent('filechooser')`, `listTabs`); the download deliverable goes through a
  host command; the frame limits read in the host's direction. Second round (same day): the old driver's teardown
  resets auto-attach whatever leases remain; an unqualified selection is rewritten to the MAWS instance in the trusted
  wrapper so a missing backend fails instead of falling back to Chrome; the harness proves two-session isolation with
  `--other`. Third round (same day): tab lifecycle authority is per connection (reserved tabs, destructive
  primitives for the owner only, the person's tabs never closed by a primitive); the takeover gate uses control's
  `personHolds` before any acting command; `Target.closeTarget` is acting; the pre-release reset undoes every
  persistent toggle the connection set, chooser interception included.
  Rationale: both reviews (design and buildability) reproduced the defects against the code; none contradicts the
  approved design, each is a wire or lifecycle rule the design had left to the executor.
  Alternatives rejected then: a shared host per session with reuse rules (more state than per-process hosts, and
  `already_served` exists to forbid it); full `iab`-style per-client CDP sessions (Electron gives one debugger per
  webContents); rejecting every acting command during `human` at once (loses the brief-touch tolerance the owner's
  takeover semantics want).
  Date/Author: 2026-10-08, the design session.

- Decision (2026-10-08, execution pre-flight): milestone order M1 → M2 → M3 → M4 → M5 is a strict chain (each
  consumes the previous one's interfaces), so every milestone is its own review frontier (`doperpowers:reviewer-high`
  per the authoring entry). Two execution rules the dispatch adds and the spec left open: (a) the owner's installed cua
  plugin (`~/.claude/plugins` cache) and a running packaged MAWS are the owner's live environment; no milestone
  overwrites the plugin cache with an unmerged branch or quits/relaunches the owner's MAWS. Live checks run against a
  dev or e2e MAWS instance with its own userData and against the worktree's `bin/cua.mjs`; an "inside MAWS" check that
  needs the 0.5.0 plugin installed for the engine is run with a session-scoped plugin directory if MAWS's launch can
  take one without touching the owner's install, else recorded BLOCKED with what is needed. (b) M5's "plugin is
  released, and #13 closes" means: the version bump and README land on the branch; merging, the marketplace update and
  the plugin-cache refresh are the dispatching session's after review (the pull requests are opened, not merged).
  Rationale: the brief forbids merging and touching the main checkouts; overwriting the owner's live plugin with an
  unreviewed branch would change every other session on this Mac.
  Date/Author: 2026-10-08, the plan executor.

## Outcomes & Retrospective

Pending — written at finish.
