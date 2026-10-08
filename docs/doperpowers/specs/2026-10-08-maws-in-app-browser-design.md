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
subagent's own shim); each connection is its own host with its own tab ownership, and MAWS keeps per-connection
state only (integer tab ids, leases, pending dialog callbacks). When a connection closes, MAWS releases that
connection's debugger leases and cursor; tabs stay open (the host closes unmarked tabs at `turnEnded` itself, as on
Chrome; a client that dies mid-turn leaves its tabs for the person, as a dead Chrome host does).

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
committed navigations and title changes of reachable tabs; `tabs.popup {openerTabId, url}` when a leased tab's
`window.open` is honoured (the adopted child is the new tab, already in the session; the host answers by claiming it);
`downloads.created` / `downloads.changed` (M3).

**Debugger leases and the command filter.** `TabDebugger` becomes lease-counted: `lease()` attaches when nothing is
attached and returns `{release()}`; the attachment ends when the last lease releases. Today's `attach()`/`detach()`
pair (the Playwright driver's idle teardown, focus emulation, E4d's crop) becomes one implicit lease per owner, so no
owner's detach can end an attachment another owner still uses: that is what lets the six tools and the server drive
the same tab during M2 and M3. The primitive server holds one lease per tab per connection. Commands pass through E4c's boundary, lifted from
`src/main/browser/agent/bridge.ts` into the server: no `Browser.*`, `Storage.*`, `SystemInfo.*`, `Tethering.*`; of
`Target.*` only `setAutoAttach`, `detachFromTarget`, `getTargetInfo`, `attachToTarget` (flattened, for a child target of
the same tab), and `getTargets` answered from the inventory above; `Page.handleJavaScriptDialog` and
`Page.setInterceptFileChooserDialog` take the dialog and chooser paths of M3. A refused method answers the error
`Method not allowed: <method>`. Everything else, `Input.*`, `Runtime.*`, `DOM.*`, `Page.*`, `Network.*`, `Fetch.*`,
`Emulation.*`, `Accessibility.*`, passes unchanged, Chromium's own error strings included (the host relies on
"Debugger is not attached" wording only for Chrome's refusal, which Electron never produces; a crashed tab answers the
lease's `target_closed` detach instead).

**Session authorization.** The socket path is known to one app session's engine and nothing else; the directory is
0700; no peer credential check beyond that (the Codex app's signed-peer check is its product's; cua's own Chrome
sockets rely on the same filesystem rule). A fork subagent of the session shares the socket by design: it is the same
app session. Two app sessions never share a socket, so neither lists or touches the other's tabs (A11).

### cua: the host's client mode, discovery, `profiles_list` (`src/chrome/`, `src/runtime/`, `src/mcp/`)

**Client mode.** `runHost` already takes any stream pair; `cua serve` (and the inventory launch of `cua profiles
list`) reads `CUA_BROWSER_BACKENDS` (absolute socket paths, `:`-separated), connects to each, and runs `runHost({stdin:
socket, stdout: socket})` in its own process. The host then listens at `$CUA_HOME/chrome/b/<socketNameFor('maws:<id>')>
.sock` exactly as a Chrome-spawned host does, so `cua doctor`, the status file and the logs under `chrome/logs` apply
unchanged. The connection is kept: a refused or lost connection is retried every 5 s for the life of the server
(MAWS quitting and relaunching, D-16's detached engine), and the host's socket exists only while connected.
`cua serve` waits up to 5 s for each configured backend's `hello` before launching the vendor runtime, so the first
`listBrowsers` finds it; a backend that does not answer in time is launched without and found at the next retry (the
vendor retries a dead listed path on every `listBrowsers`).

**Discovery.** With `CUA_BROWSER_BACKENDS` set, `BROWSER_USE_BACKEND_PATHS` is set on every route: the client-mode
hosts' sockets, plus the cua route's Chrome sockets as today, plus, on the vendor route, every `*.sock` present in
`/tmp/codex-browser-use` at launch (the OpenAI hosts the vendor would have scanned; sockets appearing later are found at
the next `cua serve`, the same limit the cua route has for unbound profiles). `BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID`
is set to the first configured backend's instance id, so `cua.getBrowser()` with no argument is the in-app browser
(the owner's choice: in MAWS the in-app browser is the default; a Chrome profile is used when the user names it).

**`profiles_list`.** Its result gains one entry per configured backend ahead of the registered profiles:
`{key: 'maws', ready: true, extensionInstanceId: 'maws:<id>'}` when the host is connected and listening, else
`{key: 'maws', ready: false, reason: 'maws_unreachable'}` with the reason text "MAWS is not running or this session's
browser socket is gone; start MAWS, then call profiles_list again". A second configured backend takes key `maws-2`, and
so on (one is the normal case). The key `maws` is reserved: `cua profiles add maws` is refused with
`reserved_key`. The entry is never written to the registry. The tool description gains, when a backend is configured,
the line "- In MAWS: cua.getBrowser() with no id is this session's in-app browser (key maws). Use a Chrome profile
only when the user names one." in place of the first Chrome rule's last sentence, keeping the description under
Claude Code's 2,048-character cap.

**`moveMouse`.** The host forwards the vendor's `moveMouse {tabId, x, y}` as the primitive `cursor.move` when the
extension's hello carries `profileName` (a MAWS peer); for the Chrome extension, which has no cursor overlay, it stays
the no-op it is. `cursor.move` is a request answered `{}`. The host's `getInfo` carries `metadata.profileName` from the hello when
present, which is what the vendor lists as the backend's profile name and what cua's inventory shows.

**Plugin.** `.claude-plugin/plugin.json` and `marketplace.json` go to 0.5.0 (plugin-visible: the `maws` profile and
the surface text). The README's "For MAWS" section is rewritten to the user-installed-plugin route and the
`CUA_BROWSER_BACKENDS` contract; the Chrome section's profiles text mentions the `maws` key.

### Retained MAWS semantics (MAWS, M3)

**Who drives the tab.** Control (`src/main/browser/agent/control.ts`) keeps its three states. The agent's actions no
longer arrive as tool calls, so the transitions move to the lease: a tab enters `agent` on the first `Input.*`,
`Page.navigate`, `Page.reload` or `Runtime.evaluate` sent through a lease and re-arms the 10 s agent-idle timer on
every such command; it returns to `idle` when the timer lapses or the lease is released. Human input still takes the
page (`human`) exactly as today, with the 3 s hand-back timer.

**Takeover.** While a tab is `human`, an `Input.*`, `Page.navigate` or `Page.reload` command through a lease is held
for at most `BROWSER_TAKEOVER_HOLD_MS = 1500` ms waiting for hand-back, then refused with the error
`A person is using this tab; wait and retry`. The vendor caps locator actions at 3 s and the host detaches a tab after
10 s without a reply, so a longer hold would turn the person's touch into a lost tab. Read commands (`Runtime.*`,
`DOM.*`, screenshots) pass during `human`. The chrome's existing control affordances (the takeover banner, Hand back)
are unchanged.

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
    {kind: 'tabOpened' | 'tabClosed', url}         tabs.create / tabs.remove / a popup adopted

The click label is the clicked node's tag and accessible text: `DOM.getNodeForLocation` at the click, then
`Accessibility.getPartialAXTree` for its name, else the node's text, cut to 40 characters; a failure leaves `null` and
is not retried. Typed text never leaves main (a cell can type a substituted secret); only its length does. The
renderer attaches each activity to the session's cua_repl `js` call in flight when it arrives, else to the most recent
one of the turn, else as a standalone row; rows reuse `BrowserActionRow`'s line ("Navigated to example.com", "Clicked
button Submit", "Typed 12 characters", "Screenshot", "Downloaded report.pdf"). The derive layer's `browser_action`
presentation keeps classifying historical `mcp__maws__browser_*` tool uses, so old journals and X8 fixtures still
render.

**Downloads.** A `will-download` whose webContents is a tab under a lease is the agent's: saved without a dialog to
`~/Downloads` under its suggested name, suffixed ` (2)`, ` (3)`… on collision (Chrome's rule), reported as
`downloads.created {id, url, finalUrl, filename, state: 'in_progress'}` and `downloads.changed {id, filename, state,
error}` with `state: 'complete'` or `'interrupted'` (`error: 'USER_CANCELED'` for a cancel), the shape the host maps
(`src/chrome/host.mjs`, "Downloads"). The tab's download line and Reveal in Finder work as for a human download, and a
completed file is recorded as a session deliverable (`DeliverableWriter`, kind file) so the panel lists it. The vendor's
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
the adopted child is a session tab and the server sends `tabs.popup`, so the vendor's `waitForEvent('popup')` resolves.

### Removal and the charter (MAWS, M4)

The `maws` server stops listing the six browser tools; `send_file`, `ask`, `show_pane` and the artifact tools stay.
Removed with them: `src/engine-host/tool-server/browser.ts`, `browser-bridge.ts`, `src/main/browser/agent/{handlers,
act, locate, snapshot, screenshot, driver, bridge, progress, errors}.ts` and their tests, the `maws.browser.*` IPC
schema, and `playwright-core` if no other importer remains (the executor checks; CHIPS import and comment mode use CDP
and the preload directly). Kept and re-homed out of `startBrowserAgent`: `TabControls`, `AgentCursor`, `PageDialogs`,
`Parking`, the `-run-dialog` wrap, the e2e seam's `control`, `lastInputs`, `sendInput` and `cursorMessages`. The
renderer keeps `BrowserActionRow` and the historical classification (above).

Dated Decision Log entries, written in M4 before the code moves: in `docs/doperpowers/plans/2026-10-05-p1-extension.md`
X9 (the six browser tools leave the `maws` server; the other tools' names stay frozen), A-19 (the scoped
`webContents.debugger` route is now served to cua's host through the primitive server; the port still never ships),
A-43 (a packaged build listens on one 0700 Unix socket per app session under userData, for cua's host only); in
`docs/charter.md` §19 a 2026-10-08 entry superseding line 982's browser-tool choice with the owner's replacement
decision, and §16 line 614's `cua-shim.mjs` bundling replaced by the user-installed plugin (the owner's choice: it is
the route that works today; bundling can return when MAWS ships to others). A short execution pointer
`docs/doperpowers/plans/2026-10-08-e13-cua-in-app-browser.md` names this spec, its milestones M2-M5 and the MAWS
branch, so MAWS's own convention (execution documents under `plans/`) holds.

### Lifecycle and failure table

| Event | MAWS | cua |
|---|---|---|
| App session's first engine launch | socket listening; `CUA_BROWSER_BACKENDS` in the engine env | — |
| `cua serve` starts in the engine | — | connects, gets `hello`, host listens, vendor launched with the socket listed and preferred |
| Engine or `cua serve` exits | connection closes: leases released, cursor hidden, tabs stay | host exits with the connection |
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
2. A `js` cell `const b = await cua.getBrowser(); const t = await b.createTab(); await t.navigate('<features page>');
   return (await t.playwright.locator('h1').textContent())` returns the page's heading; the tab is listed in the
   session's Browser panel, not selected, with an "agent" badge.
3. On the features page (`scripts/accept/features-page.mjs`), `locator('#name').fill('x')` then `locator('button')
   .click()` changes the page's marker; `browser_viewport_set` 800×600 then `tab.screenshot()` returns a PNG of 800×600;
   reset returns the pane's size.
4. `waitForEvent('download')` around a click on the page's attachment link resolves with `path()` under
   `~/Downloads/`, the file's sha256 equal to the fixture's (`a3030829e7251330d53ac0d0a803039b8f82f6fa53d294b66e76d8fe3d8c6ec5`),
   no save dialog shown, the tab's download line showing the file, and the session's deliverables listing it.
5. The page's `alert('hi')` and `confirm('ok?')` are answered through the vendor's dialog API (`tab.on('dialog')`,
   `dialog.accept()` / `dismiss()`) with no native box appearing; `confirm` returns the chosen answer to the page.
6. (if S2 promoted) `locator('input[type=file]').setInputFiles(<path>)` makes the page report the file's name and size;
   (if discarded) the call fails within 3 s with `File chooser is not supported in MAWS`.
7. `waitForEvent('popup')` around a click on the page's `window.open` link resolves with a page whose URL is the
   popup's; the new tab is in the session's panel.
8. Takeover: with the person clicking in the tab, a `locator('button').click()` in the same second fails with `A person
   is using this tab; wait and retry` within 2 s; 3 s after the person's last input the same click succeeds; the tab
   chrome shows the control states.
9. During `locator.hover()` / `moveMouse` the agent cursor is visible in the page; after `end_task` it is hidden.
10. The transcript shows, under the `js` call's row: "Navigated to <host>", "Clicked button <label>", "Typed 1
    character", "Screenshot", "Downloaded report.pdf".
11. `end_task` closes the agent's unmarked tabs; a tab marked handoff stays open and listed. Two sessions inside MAWS
    each create a tab; each session's `listTabs` shows only its own.
12. `tools/list` of the `maws` server has no `browser_*` entry; a journal from before the change (fixture
    `test/fixtures/transcripts/p1-maws-browser.jsonl`) still renders its browser rows in the replay snapshot test.
13. Quit MAWS while a session's engine runs (the supervisor keeps it), relaunch MAWS and resume the session: within
    10 s `profiles_list` shows `maws` ready again, without a new engine launch.
14. Inside MAWS, `cua.getBrowser({extensionInstanceId: <a bound Chrome profile's id>})` still drives the owner's
    Chrome (one tab created and closed).
15. Suites: cua `npm test` green; MAWS `pnpm test`, `pnpm typecheck`, `pnpm lint` green; `pnpm test:live` for the
    browser project green.

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
  additions this spec names (`profileName` in hello, `cursor.move`); a MAWS frame to the host is at most 1 MB, a host
  frame to MAWS at most 64 MiB (the extension's limits).
- Secrets: typed text, CDP params and page content never enter logs, rows or notices; errors carry method names and
  tab ids only.
- Reviews: astra (GPT) rungs per the owner's note; the branch reviews are `doperpowers:reviewer-high`.

## Plan of Work

### M1 — cua: a host that connects, a backend that is found, a profile that is listed

At the end, `CUA_BROWSER_BACKENDS=<socket> cua serve` connects to a MAWS-shaped peer, serves the vendor backend protocol
for it, lists it as `maws` in `profiles_list` and makes it the vendor's preferred backend, all proven against a fake
MAWS peer and the real vendor runtime, with no MAWS code yet.

Touches: `src/chrome/host.mjs` (client mode entry, `cursor.move` for `moveMouse` when hello carries `profileName`),
`src/chrome/discovery.mjs` and `src/runtime/launch.mjs` (`CUA_BROWSER_BACKENDS`, the vendor-route `/tmp` sockets, the
preferred instance), `src/mcp/server.mjs` and `src/cli.mjs` (connect, wait for hello, retry), `src/profiles/`
(`maws` entries, the reserved key, `maws_unreachable`), `src/mcp/surface.mjs` (the MAWS line), `test/helpers/fake-maws-peer.mjs` (a fake MAWS
peer built on `test/helpers/fake-cua-extension.mjs`, which already models the extension's side: it listens on a
socket, sends hello with `profileName` on connect, and runs as a script for manual checks), README "For MAWS" and "Profiles", plugin 0.5.0.

Decisions: the retry interval is 5 s and the hello wait 5 s, both constants exported for tests; the inventory cell
(`src/profiles/inventory.mjs`) recognises a MAWS backend by its instance id prefix `maws:` rather than by profile name;
`cua profiles bind` ignores MAWS backends; a configured path that is not absolute fails the launch with
`invalid_setting` (as other env mistakes do); the vendor-route `/tmp/codex-browser-use` scan is cua's only when
`CUA_BROWSER_BACKENDS` is set (unset keeps today's behaviour exactly).

Does not touch: MAWS; the Chrome extension; the Chrome host's behaviour for a hello without `profileName`.

Proves: acceptance 1 and 14's cua half, 13's reconnect (with the fake peer restarted); pins: a `hello` without
`profileName` keeps `moveMouse` a no-op; `profiles_list` under a dead socket; the description's length under 2,048.

### M2 — MAWS: the primitive server, with the two spikes

At the end, a running MAWS session listens on its socket, and `cua serve` from a terminal with `CUA_BROWSER_BACKENDS`
drives its tabs through the vendor runtime: create, navigate, locate, click, fill, screenshot, viewport, popup, close
at `end_task`; the engine of a session started in the app inherits the variable. S1 and S2 are answered.

Touches: new `src/main/browser/cua/` (server, framing, tab map, filter, leases), `src/main/browser/debugger.ts`
(leases), `src/main/browser/index.ts` (start the server beside the store), `src/main/sessions/launch-mapping.ts` and
the launch spec (`extraSettings.env.CUA_BROWSER_BACKENDS`), `src/main/browser/tabs.ts` only if `open` needs a
"no select" that it lacks, tests beside each, `docs/doperpowers/plans/2026-10-08-e13-cua-in-app-browser.md`
(the pointer, created here as the first MAWS commit). Spikes S1 and S2 live under `spikes/cua-backend/` with a findings
file; their verdicts go to Surprises & Discoveries.

Decisions: the socket path is keyed by the session's persisted `appSessionId` (the sessions index), so a session
resumed after an app relaunch listens at the same path; if MAWS turns out to mint a new id on resume, the path follows
the new id, acceptance 13 is recorded BLOCKED with that finding and the Decision Log says so. MAWS has its own 40-line
framing and JSON-RPC peer in TypeScript (no dependency on this repository's
`protocol.mjs`); the socket directory is created at app start and swept of stale `.sock` files; the server's unit tests
use a fake host (a node client over the socket) and a fake `TabStore`/`TabDebugger`, the live proof uses the real cua
of M1; `debugger.getTargets` lists child targets from the `Target.attachedToTarget` events the server saw on the tab.

Does not touch: control, cursor, dialogs, downloads, parking (M3); the six tools and the Playwright driver (M4), which
keep working beside the server in this milestone (both routes drive the same tabs; the lease model keeps the
attachment shared).

Proves: acceptance 2, 3, 7, 11 (second half: two sessions), 13's MAWS half; pins: a tab of another session is refused;
a refused CDP method's error text; the lease count across two connections.

### M3 — MAWS: what the person sees and keeps

At the end, the agent's work through cua is visible and bounded as the tools' was: control transitions and takeover,
the cursor, activity rows, agent downloads to `~/Downloads` with a deliverable, dialogs per S1, file chooser per S2,
parking by lease, the "agent" badge in the panel.

Touches: `src/main/browser/agent/{control, cursor, dialogs, visible}.ts`, `src/main/browser/downloads.ts`,
`src/main/browser/cua/` (activity synthesis, dialog and chooser paths), `src/shared/ipc/schema/browser.ts`
(`browser.agent.activity`), renderer transcript model (`derive.ts`, `rows.ts`, `BrowserAction.tsx`), the panel's tab
list (badge), e2e seam.

Decisions: typed-character coalescing window 1 s; label lookup bounded to 500 ms; the activity event is emitted at
most 20 times per second per tab (a mouse-move storm never floods the renderer; moves are not rows anyway);
`Accessibility.getPartialAXTree` is sent through the same lease so it is attributed as the agent's; the deliverable
record for a download is written when the item completes, never for a cancelled one.

Does not touch: the six tools' code (still present until M4); charter text.

Proves: acceptance 4, 5, 6, 8, 9, 10; pins: no typed text in any emitted event; the 1.5 s hold then refusal; the 30 s
dialog default.

### M4 — MAWS: the cut-over

At the end, the `maws` server lists no browser tool, the Playwright driver and bridge are gone, old journals still
render, the charter and P1 bindings carry dated entries, and MAWS's tests and lint are green.

Touches: `src/engine-host/tool-server/{tools, browser, browser-bridge}.ts`, `src/shared/maws/browser.ts`, `src/shared/
ipc/schema/maws.ts`, `src/main/browser/agent/` (removal and re-homing), renderer `classify.ts` (historical names
kept), `package.json` (`playwright-core` if unused), `docs/charter.md`, `docs/doperpowers/plans/2026-10-05-p1-extension.md`,
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

Touches: `scripts/accept/maws-features.mjs` (this repository; reuses `scripts/accept/features-page.mjs` and
`scripts/accept/mcp-session.mjs` from #15's fixture `scripts/accept/linux-chrome-features.mjs`, driving a MAWS session's
socket from a terminal for items 2-9 and 11, and reporting JSON), `docs/evidence/2026-10-08-maws-in-app-browser.md`,
README, `tech-debt-tracker.md`, the plugin cache on this Mac (`claude plugin update` or the marketplace path the owner
uses).

Decisions: items 1, 10, 12, 13, 14 are manual checks inside the app, recorded with screenshots under
`docs/evidence/`; a check that cannot run on this Mac is recorded BLOCKED with the reason, never skipped silently.

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
      node scripts/accept/maws-features.mjs --report /tmp/maws-features.json
    #   {"profiles": "PASS", "createTab": "PASS", "locator": "PASS", "viewport": "PASS", "download": "PASS",
    #    "alert": "PASS", "confirm": "PASS", "chooser": "PASS|BLOCKED", "popup": "PASS", "takeover": "PASS",
    #    "cursor": "PASS", "cleanup": "PASS"}

The MAWS userData path above is the packaged app's; the dev build's is printed by `pnpm dev` at start.

## Interfaces and Dependencies

**`CUA_BROWSER_BACKENDS`** (environment of `cua serve` and `cua profiles list`): absolute Unix socket paths,
`:`-separated. Each is a peer speaking the extension protocol (version 1) that sends `hello` on connect. Owner: M1
(reader), M2 (writer, through `extraSettings.env`).

**hello** (peer → host, notification, first message):
`{extensionId: string, extensionInstanceId: string, version: string, protocolVersion: 1, profileName?: string}`.
`profileName` marks a non-Chrome peer: it enables `cursor.move` and the `maws` listing. Owner: M1 (host), M2 (MAWS).

**Primitives** (host → peer requests; peer → host notifications): the table in "The MAWS primitive server", plus
`cursor.move {tabId: number, x: number, y: number} → {}`. Errors are `{code: 1, message}` with Chrome's wording where
one exists (`No tab with id: <n>`), `Method not allowed: <method>` for the filter. Owner: M1 (`cursor.move`), M2
(server), M3 (downloads, dialog and chooser paths).

**`profiles_list` entry** (cua MCP): `{key: 'maws' | 'maws-<n>', ready: boolean, extensionInstanceId?: string,
reason?: 'maws_unreachable'}`. Owner: M1.

**`TabDebugger.lease()`** (MAWS, `src/main/browser/debugger.ts`): `lease(): Promise<{release(): void}>`; attaches on
the first lease, detaches on the last release; `attach()`/`detach()` become one implicit lease per existing owner
(see "Debugger leases"). Owner: M2; consumers M3 (control, parking, cursor by lease).

**`browser.agent.activity`** (MAWS IPC, main → renderer): `{appSessionId, tabId, at: ISO string, activity}` with
`activity` as listed under "Action rows". Owner: M3.

**MAWS primitive server module** (`src/main/browser/cua/index.ts`): `startCuaBackend({store, windows, reaches,
userData, version}) → {socketPathFor(appSessionId): string, dispose(): void}`; `socketPathFor` is what the launch
mapping writes into `extraSettings.env`. Owner: M2.

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

## Outcomes & Retrospective

Pending — written at finish.
