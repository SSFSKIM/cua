# M7 evidence: source-grounded browser contract, no Chrome attachment

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M7 (Phase C prototyping). Run on
2026-10-02, macOS 26 arm64, host Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64` (`@oai/browser-desktop`
0.1.1), probe code at `d5fba50` on `feat/chrome-existing-profile`, amended by the review fix wave recorded under
"Review fix wave" below (the results here are from the fixed code).

**chromeAttached: false.** No Chrome process was opened, attached, navigated or queried. No extension, profile,
cookie/password database, extension localStorage, account, `PLAYWRIGHT_MCP_EXTENSION_TOKEN` value or native helper
was used. The installed extension's code files `lib/background.mjs` and `lib/ui/connect.js` (and its manifest's
permission list) were read as source; nothing else in the profile directory was opened.

Three kinds of fact are kept apart below:

- **source**: read from the pinned vendor source or the installed extension code, cited by line;
- **fixture**: shown by the deterministic layer (fake extension peer + prototype adapter + owned socket), so it
  proves our adapter's behaviour against a source-modelled peer, not the real extension;
- **vendor**: observed from the real relocated vendor runtime talking to an owned fixture backend. Every browser
  answer it received was synthetic; it proves the vendor's requests and its reactions, never browser behaviour.

Citations: `BS` = `cua_node/@oai/browser-desktop/scripts/browser-service.mjs` (readable tree of 26.928.40906), `BG` =
extension `mmlmfjhmonkocbjadbfplnigmagldckm` 0.4.0 `lib/background.mjs`, `CJ` = its `lib/ui/connect.js`.

## Commands and results

```sh
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-chrome-contract-fixtures.json   # ~4 s
export CUA_HOME="$(mktemp -d /tmp/cua-m7.XXXXXX)"
node bin/cua.mjs install --archive /Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip   # verified
node scripts/probe-chrome-contract.mjs --vendor --report /tmp/cua-chrome-contract-vendor.json        # 12.5 s
npm test                                                                                              # 188/188
```

All three were run with `PLAYWRIGHT_MCP_EXTENSION_TOKEN` removed from the invoking environment (`env -u`, value never
read); the vendor layer additionally builds its child environment from an allowlist and plants a *fake* token and a
fake `BROWSER_USE_SECURITY_MODE=disabled-for-local-testing` in the ambient it filters, to show neither can pass.

| Layer | Scenario | Result |
|---|---|---|
| fixtures | framing, offer-before-initialized, reply-and-error-shapes, optional-method-errors, unknown-tab-rejection, child-session-forwarding, user-detach-no-retry, transient-target-renewal, turn-end-cancels-renewal, turn-end-during-renewal-attach, popup-offers, disconnect, created-tab-retention, token-url-redaction, sentinel-non-disclosure | 15 PASS |
| vendor | vendor-launch, vendor-framing, getinfo-raw-vs-normalized, documented-surface, session-parameters, optional-method-fallback, attach-and-child-routes, kind-comparison, identity-policy, turn-completion, synthetic-only, sentinel-non-disclosure | 12 PASS |
| vendor | vendor-child-session-commands | BLOCKED: the vendor stopped at the first refused page-state CDP call (`Runtime.enable`/`Runtime.evaluate`) before addressing the announced child session; child routing is proven only at the adapter (fixture layer) |

The sentinel scan covered both reports, the fixture captures (frames, adapter events, client notifications), the
vendor child's stdout/MCP transcript and stderr (0 bytes), and 214 files under the per-run `CODEX_HOME` and working
directories: no fake token or capability marker, raw or base64, anywhere. A mutation check (ownership allowlist
disabled, URL redaction disabled) turned `unknown-tab-rejection`, `user-detach-no-retry` and `token-url-redaction`
FAIL, so those scenarios are falsifiable. Owned sockets, `CODEX_HOME`s and working directories were removed; no
owned process remained (`pgrep` on the scratch home was empty after every run).

## Wire contract

### CUA backend side (what our adapter must serve)

| Item | Contract | Basis |
|---|---|---|
| Discovery | `BROWSER_USE_BACKEND_PATHS` lists absolute socket paths (`:`-separated); each is opened by the trusted worker through `nodeRepl.nativePipe`. Without it the vendor lists its own pipe directory. | source `BS:67722-67742`, `BS:66872-66892`; vendor (each run discovered exactly its one owned socket) |
| Framing | u32 length in host byte order (LE on arm64) + UTF-8 JSON; any decode error closes the transport; default frame limit 2^32-1. | source `BS:66712-66841`; fixture `framing`; vendor `vendor-framing` (vendor frames decoded by our decoder, ours by the vendor's) |
| Peer convention | JSON-RPC 2.0, numeric ids from 1. An error reply rejects with the **bare string** `error.message` (code ignored). Unknown method: `{code:-1, message:"No handler registered for method: <m>"}`; handler throw: code 1. | source `BS:10352-10485`; vendor |
| First request | `getInfo` (it also carries the session triple). The vendor times it out after 5 s, then discards the backend. | source `BS:67599-67650` (`dte=5000`); vendor |
| Raw `getInfo` | Free-form at discovery: no schema parse. Read fields: `type` (`extension`/`cdp`/`iab`/`mcpapps`), `name`, `family`, `capabilities.{browser,tab}[{id,description}]`, `metadata.{extensionInstanceId,extensionId,codexSessionId,...}`, `discoveryScope`, `apiSupportOverrides`, `agentRequestHeaderEnabled`, `sessionTabForegroundEnabled`. | source `BS:67599-67700`, `BS:67477-67495`; vendor |
| Normalized info | What `cua.listBrowsers()` returns: `{id (vendor-assigned "1".., not ours), name, type, family?, profileName? (from metadata.profileName), metadata?}`; `capabilities` and `agentRequestHeaderEnabled` are dropped. The zod `dy`/`rs` schemas apply to agent-command results, not raw discovery. | source `BS:66007-66033`, `BS:31960-31976`; vendor `getinfo-raw-vs-normalized` |
| Session triple | Every request except `turnEnded`/`ping` carries `session_id`, `turn_id`, `session_context` (`live`, or `cached` after the turn metadata disappears). `turnEnded` carries `{session_id, turn_id}` only. | source `BS:68061-68110`, `BS:68041-68054`; vendor `session-parameters`, `turn-completion` |
| Methods observed | `getInfo`, `getUserTabs` (extension only), `getTabs`, `getCommittedTabUrl`, `createTab` (no `preferredWindowId` unless configured), `attach {tabId}`, `executeCdp`, `executeCdpWithCachedExpression`, `detach {tabId}` (the vendor detaches its tabs itself before `turnEnded`), `turnEnded`. Documented-but-unexercised: `nameSession`, `markTab`, `followSessionTab`, `claimUserTab`, `getUserHistory`, `executeTabRead`, `allowDownload`, `moveMouse`, `browserAuthNewTargetProtection`, `executeUnhandledCommand`, `attachTarget`/`detachTarget`. | vendor; source `BS:67880-68050` |
| `executeCdp` params | `{target:{tabId, sessionId? XOR targetId?}, method, commandParams, timeoutMs?, preserveDebuggerOnTimeout?}` + triple; the cached variant adds `expressionCacheKey` and may omit `commandParams.expression`. | source `BS:47528-47610`, `BS:48392-48410`; vendor |
| Notifications | `onCDPEvent {source:{tabId, sessionId?}, method, params}`; `onCDPDetach {tabId, ...}`; also `onPageEvent`, `onDownloadChange` (unexercised). | source `BS:47189-47215`, `BS:60890`, `BS:67820`; vendor (`Target.attachedToTarget` delivered) |
| Recovery string | An `executeCdp` error equal to `"Debugger unattached"` or containing `"Debugger is not attached"` makes the vendor forget the tab and re-`attach` it once (tab targets only). Chrome's own `chrome.debugger` wording therefore must pass through verbatim. | source `BS:47585-47595`; fixture `reply-and-error-shapes` |
| Optional methods | Fallback only on the exact strings: `executeCdpWithCachedExpression` -> plain `executeCdp` (observed), `getCommittedTabUrl` -> `getTabs().url` for `extension` (observed) or `executeCdp Page.getFrameTree` for `cdp` (observed), `getUserTabs` -> treated as no user tabs (observed). | source `BS:67810-67890`, `BS:67942-67983`, `BS:68316-68328`; fixture `optional-method-errors`; vendor `optional-method-fallback` |
| Child sessions | The vendor sends `Target.setAutoAttach {autoAttach, flatten:true, waitForDebuggerOnStart:false, filter:[iframe]}` on the tab target (observed) and tracks children from `Target.attachedToTarget` as `{tabId, sessionId}`; it then addresses frames with `{tabId, sessionId}`. | source `BS:47617-47660`, `BS:48458-48517`; vendor (setAutoAttach + announcement observed; child-addressed command BLOCKED); fixture `child-session-forwarding` |
| CDP needed by the documented surface | Before refusal the vendor asked for `Emulation.setFocusEmulationEnabled`, `Page.enable`, `Fetch.enable`, `Runtime.enable`, `Target.setAutoAttach`, `Runtime.evaluate`, `Page.getFrameTree`, `Page.getNavigationHistory`, `Page.navigate` (the last even for `createBrowserTab` without a URL). | vendor `synthetic-only` (the fixture answered only domain-neutral calls) |
| Turn completion | Hidden `turn_ended` -> vendor `detach` for its tabs, then `turnEnded {session_id, turn_id}`. | vendor `turn-completion`; source `BS:68041-68054`, `BS:68154-68213` |

### Extension side (Playwright Extension relay protocol v2, source only + fixture)

| Item | Contract | Basis |
|---|---|---|
| Handshake | The relay opens `chrome-extension://<id>/connect.html?mcpRelayUrl=<ws URL>&client=<json>&protocolVersion=2[&token=…][&newTab=true]`. Only `127.0.0.1`/`[::1]` hosts are accepted; protocol version must equal 2. With a matching token the page connects **its own tab** without a chooser; without one the user picks a tab or drags tabs into the group. | source `CJ:27-78`, `CJ:93-115` |
| Capability exposure | The extension warns that an approved client sees the whole browser and may reconnect later without the dialog. It enforces no per-tab restriction on `chrome.debugger.attach`: ownership must be enforced by the relay. | source `CJ:125-128`, `BG:199-208` |
| Relay -> extension | `{id, method, params:[...positional chrome.* args]}`; methods: `chrome.debugger.attach/detach/sendCommand`, `chrome.tabs.create/remove` only (anything else, including `chrome.tabs.query`: error `Unknown method: …`). No `jsonrpc` field. | source `BG:20-26`, `BG:199-208`; fixture `reply-and-error-shapes` |
| Extension -> relay | Replies `{id, result}` (void -> `{}`) or `{id, error:<string>}`; unparseable input -> `{error:{code:-32700, message}}` with no id. Events `{method, params:[...]}`: `chrome.tabs.onCreated [tab]`, `chrome.debugger.onEvent [source{tabId,sessionId?}, method, params]`, `chrome.debugger.onDetach [{tabId}, reason]`, `chrome.tabs.onRemoved [tabId, info]`, `extension.initialized []`. | source `BG:27-32`, `BG:56-61`, `BG:178-217`; fixture |
| Offer order | The selected tab's `chrome.tabs.onCreated` is sent **before** `extension.initialized`. Offers are the only ownership grants: the selected tab, tabs the user drags into the group, re-offers, and popups (forwarded only when `openerTabId` is an attached tab). | source `BG:361-375`, `BG:387-407`, `BG:170-176`; fixture `offer-before-initialized`, `popup-offers` |
| Detach/renewal | `canceled_by_user`: no re-offer. `target_closed`: one re-offer after 150 ms (3 s cooldown), and if the relay has not re-attached within 2.5 s the tab is dropped. A user dragging a tab out of the group also sends `target_closed`, with no re-offer. When the last attached tab detaches the extension closes the connection. A relay-initiated `chrome.debugger.detach` is not reflected in the extension's attached set. | source `BG:73-84`, `BG:116-169`, `BG:199-208`; fixture `user-detach-no-retry`, `transient-target-renewal`, `disconnect` |
| Child debuggee | `chrome.debugger.sendCommand({tabId, sessionId}, …)` addresses a flattened child; events carry `source.sessionId`. Events for a `targetId` debuggee have no `tabId` and are dropped, so a CUA `targetId` target is only usable as an alias of a known child session. | source `BG:170-176`; fixture `child-session-forwarding` |
| Not provided | No tab enumeration, no profile/instance identifier, no window list. | source `BG:20-32`, `BG:584-588` (the tab list exists only for the chooser page) |

### Mapping implemented by the prototype adapter (`scripts/probe/chrome/adapter.mjs`)

`getInfo` -> truthful static info; `getTabs` -> offered ∪ created tabs; `createTab` -> `chrome.tabs.create
[{url:"about:blank", active:false}]` (owned); `attach` -> `chrome.debugger.attach [{tabId}, "1.3"]` for owned tabs
only; `detach` -> `chrome.debugger.detach`; `executeCdp` -> `chrome.debugger.sendCommand [{tabId, sessionId?}, method,
params]`; `turnEnded` -> detach held tabs, close nothing; every other method -> exact `No handler`. Extension events map
to `onCDPEvent`/`onCDPDetach`; a disconnect rejects in-flight work with `extension disconnected`, detaches everything and
is never followed by a reconnect.

## Kind comparison and policy (vendor, default security mode)

Every vendor run set `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`. Under that switch `cn()` is true, so `jm` never starts
identity initialization and the identity promise `Um` stays unset (`BS:11331`, `BS:17727-17735`). The header-policy
refusal below is therefore what happens when identity initialization is **disabled**; a normal-network run, where the
identity fetch is started and fails (or succeeds), was not run and its outcome is unverified.

| | `extension` (truthful, field omitted) | `extension` + `agentRequestHeaderEnabled:false` | `cdp` |
|---|---|---|---|
| Normalized info | `{id, name, type:"extension", family:"chrome"}` | same | `{id, name, type:"cdp"}` |
| Documentation | 30 345 chars; adds `browser.nameSession`, `tab.markDeliverable`, `tab.markHandoff` and a `user` (user-tabs) object | same | 27 188 chars; none of those |
| Existing offered tab | `getCommittedTabUrl` -> `getTabs` url; then an **origin-access elicitation** "Allow Browser use to access https://…?" (`persist`, `codex_sensitive_action`). Declined -> refused by policy; approved (probe harness, synthetic origin only) -> `attach` then CDP. | with identity initialization disabled, every session request is refused in the vendor by `wv()`'s null-identity error `Browser request-header policy requires caller identity.`; nothing reaches the backend | `getCommittedTabUrl` -> `executeCdp Page.getFrameTree` on the **unattached** tab -> fails on an attach-gated transport (origin check not reached) |
| `createBrowserTab` | `createTab`, `attach`, page-state CDP | refused (no identity initialized) | `createTab`, `attach`, page-state CDP |

Consequences:

- **`cdp` misrepresents this transport's attach semantics.** The kind recommendation rests on what the adapter
  implements, not on which kind avoids a policy check. The `cdp` kind assumes CDP on any listed tab without `attach`
  (`BS:67956-67965`); the extension requires an explicit debugger attach per tab (user-visible infobar, a user
  cancellation channel). Making `executeCdp` silently attach would hide that consent boundary. `cdp` also lacks the
  handoff/deliverable/session-naming surface that the extension kind documents, and its full-CDP capability is gated
  to `gaas-browser-environment` (`BS:18371-18381`). `extension` is the kind that matches what the adapter implements.
  The extension kind is also the only kind subject to the header policy below; that is a cost of the choice, not a
  reason against it.
- **Header policy is an open decision, not settled by the fixture.** Source (knowledge, not a product decision): the
  vendor runs the agent request-header check only for `extension` backends whose `getInfo` includes
  `agentRequestHeaderEnabled` (`BS:68066-68092`). The check calls `wv()`, which throws
  `Browser request-header policy requires caller identity.` when no identity initialization was started, and otherwise
  awaits the identity fetch from `chatgpt.com/backend-api/aura/identity` and reads the
  `codex_browser_use_agent_request_header` gate (`BS:17655-17670`, `BS:17686-17692`). Measured here: with the field
  present and initialization disabled, every session request is refused; with the field omitted the check is skipped.
  Not measured: what a standalone install without an account gets under normal network (a started-and-failed identity
  fetch), and what a signed-in identity gets. Omission asserts nothing false, but it relies on a version-specific
  absence and is not evidence of a supported account-free path. Per source, with an identity and the gate on the
  vendor sends `agent_request_header_enabled:true` in session requests, asking the backend to add agent request
  headers, and refuses a backend whose field is present but not boolean ("This browser requires agent request
  headers…"). The adapter cannot add agent headers today.
- **Origin approvals are real policy for user tabs** under the extension kind and must reach the user through the
  host (production `serve` forwards elicitations; it never auto-accepts). The probe accepted only the synthetic
  `work.fixture.invalid` origin, in an owned `CODEX_HOME` that was deleted.
- **Profile-reading hazard.** If raw `getInfo` carries `metadata.extensionInstanceId` and `extensionId` for an
  `extension` backend, the vendor reads Chrome's `Local State` and copies that extension's `Local Extension Settings`
  LevelDB to a temp dir to match a profile name (`BS:67352-67470`, Local State at 67451, LevelDB copy at 67374-67414). The Playwright extension offers no authenticated
  profile id anyway; the adapter must never send these fields. Profile selection stays explicit, outside this
  handshake.
- **Network/telemetry.** `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1` is an ambient-network switch, not a security mode;
  `BROWSER_USE_SECURITY_MODE` stayed unset. The guards it drives, as read in source, suppress Sentry/Statsig telemetry
  and identity initialization (`BS:11331`, `BS:17708-17735`, `BS:77426`). They do not show that site-status URL checks
  are skipped; whether a URL check is attempted under the switch was not measured (the source shows such checks fail
  open when their fetch errors, `BS:37019-37036`). Normal-network identity and site-status behaviour remain unverified;
  a production decision on ambient network is still needed.

## Verdict: PROMOTE the existing-extension candidate, as an `extension`-kind backend

Core routing and ownership are representable over the extension's five commands: framing and JSON-RPC conventions,
offers before initialization, owned-only attach with no guessed ids, verbatim error strings (including the vendor's
recovery and optional-method fallbacks), flattened child sessions in both directions, popups, user cancellation without
re-attachment, renewal only through the extension's own re-offer and only within the live task, disconnect without reconnect, created-tab
ownership, and token-URL redaction. No required capability was shown incompatible. This is not working Chrome support.

Decisions for the parent before production design (not executor calls):

1. Agent request-header policy: omit `agentRequestHeaderEnabled` (the check is then skipped in this pin; whether that
   is an acceptable standalone path is a policy call, and it is version-sensitive), or report it and rely on a
   supported identity, honouring `agent_request_header_enabled` by actually adding the headers (needs header injection
   through CDP `Fetch`, unimplemented). Reporting it with identity initialization disabled was measured to refuse every
   session request; the normal-network no-account outcome is unmeasured.
2. Ambient network for the browser service (`BROWSER_USE_DISABLE_AMBIENT_NETWORK`): per source, setting it suppresses
   vendor telemetry and identity initialization; unsetting it lets the vendor start identity/Statsig/Sentry calls from
   the user's machine. Its effect on site-status URL checks was not measured.
3. Which optional methods to implement (`nameSession`, `markTab`, `followSessionTab`, `getCommittedTabUrl`,
   `getUserTabs` over offered tabs only) versus answering `No handler`.
4. Whether the connect page tab (the auto-connect selected tab) is exposed to the model at all, or reserved and
   navigated by the adapter first; the prototype only redacts its URL.

## Unresolved LIVE gates (not established by fixtures)

Real WebSocket framing and the extension's `Origin` header on its service-worker WebSocket; the connect-page
handshake with the configured token (auto-connect) versus the chooser; Chrome's actual `chrome.debugger` error texts
and detach reasons; real `Target.setAutoAttach` children and a vendor child-session command; page-state CDP
(`Runtime.evaluate`, `Page.navigate`, frame tree), input dispatch, screenshots/screencast, nested frames, dialogs,
downloads and file choosers; the debugger infobar and the user's cancel/takeover; tab-group side effects; popup
offers; saved-password autofill with user prompts; extension auto-update compatibility beyond 0.4.0.

## The next live probe (not run; M7 does not authorize it)

Preconditions: the parent names the existing profile; Chrome is already running with it; the probe owns a loopback
WebSocket relay on `127.0.0.1` with a one-shot unpredictable path that verifies the host and the extension origin and
rejects a second client; the configured token is passed as configured to the connect URL and never logged. Two
choices are still open for that probe: the pinned WebSocket server library (this spike needed none), and how the
connect URL is handed to the already-running named profile (e.g. LaunchServices `open` with the profile selector);
neither may use a testing/security-bypass flag.

Operations, in order: (1) open the connect URL in the named profile (Chrome opens one new `connect.html` tab); (2)
record the handshake metadata (Origin header, protocol version, message order) without the URL; (3) on a new `about:blank` tab
created by `chrome.tabs.create` (or the probe's own connect tab), attach the debugger and run only
`Page.enable`, `Target.setAutoAttach`, a `Page.navigate` to an owned local test page (served by the probe on
loopback), one `Runtime.evaluate` of a constant, one screenshot; (4) user cancel test: ask the human to click
"Cancel" on the debugger infobar, confirm `canceled_by_user` and no re-attach; (5) detach, close only the tabs the
probe created, close the relay.

Expected user-visible effects: one new tab with the extension's connect page; a "Playwright" tab group (green) and a
"✓" badge on controlled tabs; Chrome's debugger infobar (expected wording: "Playwright Extension" started debugging this browser) while
attached; one new owned test tab that is closed at the end; no change to existing tabs, settings or the token. Any
Chrome or macOS permission prompt stops the probe for the human.

## Decisions made in M7

- Fake extension transport is an in-process JSON-text callback, not a WebSocket: the questions here are message shapes,
  routing and ownership; WebSocket framing/Origin are live gates. No WebSocket dependency was added.
- The adapter enforces ownership (offered ∪ created); any debugger loss releases it; only a `target_closed` on a held
  tab followed by the extension's own re-offer within 2.5 s re-attaches (as the extension's protocol expects), and a
  client `attach` during that window waits for the renewal rather than forcing it.
- `turnEnded` detaches and closes no tab; closing is allowed only for adapter-created tabs. It advances a task
  ownership epoch, ends pending renewals, and is acknowledged only after in-flight attaches settle (bounded at 1 s); an
  attach that succeeds after the epoch moved is detached again rather than recorded as held. A detach that fails, or an
  attach still unanswered at the bound, makes `turnEnded` an error ("debugger release unconfirmed"), never a success.
- Vendor layer: browser surface only, vendor-default trusted service, `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`, no
  security mode, owned empty `CODEX_HOME` per run, elicitations declined except the one synthetic fixture origin in a
  dedicated run.
- Scenario status: PASS = the expectation held or the observation was obtained; BLOCKED = the observation could not be
  reached without inventing page state; FAIL = a contract expectation broke.

## Review fix wave (astra-high M7 review, two P2 findings)

1. **Identity claims overreached.** All vendor runs disable identity initialization through
   `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`, so the observed refusal is `wv()`'s null-identity error, not a measured
   normal-network account requirement. The `identity-policy` scenario, the kind table and the decisions above now say
   so, the generalizations "blocks every operation without an account", "works without an account" and "off means no
   site-status checks" are withdrawn, and normal-network identity/site-status behaviour is listed as unverified. No
   normal-network run was made.
2. **Task-end race in the adapter.** Before the fix, a `target_closed` on a held tab left a renewal that `turnEnded`
   did not clear, so the extension's later re-offer re-attached after the task completed, and a renewal attach still
   in flight at `turnEnded` was recorded as held when its reply arrived. Fixed with a task epoch (see Decisions).
   - RED (adapter at `9ea8f3a`, new scenarios): `turn-end-cancels-renewal` FAIL (re-attach after completion);
     `turn-end-during-renewal-attach` FAIL (acknowledged while the attach was in flight, late success restored held
     control, CDP still routed).
   - GREEN: both PASS; the ordinary same-task renewal (`transient-target-renewal`) still PASSes. The held-reply case
     shows the real side effect undone (a `chrome.debugger.detach` follows the late attach and the fake debugger is no
     longer attached); with the reply held past the 1 s bound `turnEnded` reports release unconfirmed, and the late
     success is still detached and never routed.

Logged as non-blocking debt (`tech-debt-tracker.md`): the vendor layer's `synthetic-only` scenario records the refused
CDP list but its check is constant `true`; the restrictive fake (`NEUTRAL_CDP`) supports the conclusion.

Limits that remain: every vendor observation is against synthetic answers with identity initialization disabled;
the vendor never addressed a child session (BLOCKED); all live gates listed above are untouched.
