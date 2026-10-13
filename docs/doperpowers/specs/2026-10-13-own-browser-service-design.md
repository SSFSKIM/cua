# cua's own browser service (board #113; child 1 of the independence composite #114)

## Purpose

Today every browser action an agent takes through cua passes through OpenAI's browser service, a 2 MB module (`@oai/browser-desktop/scripts/browser-service.mjs`) pinned inside the vendor runtime and loaded into node_repl's trusted worker. That module decides, for each navigation, to ask `chatgpt.com/backend-api/aura/site_status` whether the full URL (path and query included) may be visited and ends the session when the answer is no (#111); it initialises Statsig, Sentry and an identity fetch at setup; it reads policy through the Codex app-server; it caps every locator action and `evaluate` at 3 seconds; and it runs `evaluate` behind a read-only membrane. After this change the browser surface of `cua serve` is served by cua's own module, `src/browser-service/`, behind the same two contracts: upward the unchanged REPL client (`@oai/cua`'s browser-client, the API the model learns from the first-call document), downward cua's unchanged extension host (`src/chrome/host.mjs`) and MAWS's in-app client mode. Nothing leaves the machine; no site policy; locator and `evaluate` budgets are the caller's up to 120 s; `evaluate` runs in the page like Playwright's; every command the vendor serves on the Chrome route is served, eventually all of them, with the same results, measured by a differential harness that replays one command corpus against both services and by a benchmark re-run on the mini. A person sees it working by setting `CUA_BROWSER_SERVICE=cua` (the default once M5 lands), opening a tab on a site the vendor blocks (nytimes.com) and driving it, by asking for `tab.playwright.locator(...).click({timeoutMs: 15000})` on a slow page and seeing it wait, and by running `node scripts/browser-parity.mjs --diff` and reading "0 unexpected differences".

Owner's rulings (2026-10-13, board #113 and #114): independence is for distribution to others and for the owner's own use; the phase's purpose is full independence from OpenAI with no performance regression; the engine is rewritten in the vendor's shape (Playwright's injected script bundled, our own CDP orchestration), ported from the readable vendor tree, which is the primary reference for all cua work from now on; coverage, fidelity and capability parity losses are minimised, staged, with everything covered at the end; no approval prompts of our own (Claude Code's permission modes are the gate); the model-facing API stays vendor-compatible with extensions; no site policy (a local host denylist is an option, off by default); the baseline and the comparison run on the mini, a registered profile, unattended, three times.

## Progress

- [x] (2026-10-13) Research: two static passes over the installed service and cua's host, condensed to a digest (board #113 comment of 2026-10-13); the Codex dependency pass (board #115).
- [x] (2026-10-13) Design approved by the owner in a live brainstorming session (two rounds; rulings above).
- [ ] Independent spec review (design and buildability; see Decision Log).
- [ ] M0 — Parity harness, capability-parity test, and the baseline on the mini.
- [ ] M1 — The core service: setup, backends, CDP controller, tabs and navigation, locators, evaluate, snapshot, screenshots, pointer and keyboard, waits; the switch.
- [ ] M2 — Dialogs, downloads, file chooser, clipboard, console logs, viewport and visibility, raw CDP.
- [ ] M3 — Optional features: exports, page assets, WebMCP, bot-detection report, auth handoff, user history.
- [ ] M4 — MAWS client mode and Linux parity.
- [ ] M5 — Guidance text and docs, default switch, plugin bump, acceptance as written.

## Facts this design rests on

Read 2026-10-13 from the installed runtime 26.928.40906 and the readable tree `~/codex-app-src/readable/chatgpt-26.928.40906/` (`BS` = `cua_node/@oai/browser-desktop/scripts/browser-service.mjs` there, 77,614 lines, original method names and strings, minified variable names; `INDEX.md` and `anchors.json` map classes to lines; cite as `BS:<line>`). The same module minified is the one the runtime loads. Landmarks: `Rf` the command handler table (BS:18391); `eT` the security error class and its reason codes (BS:9306); `zp` tab_screenshot (BS:43895); `Qn` the CDP controller (BS:47139); `bf` the accessibility (AX) capture (BS:52607); `yf` Fetch interception for downloads (BS:53620); `H1` the embedded Playwright InjectedScript (BS:54564); `Pf` the locator orchestrator (BS:54717 to 60224); the read-only evaluate membrane classes `Readonly*` (BS:57467 to 59281); `Mf` downloads (BS:60883); `qf` cursor (BS:62081); `la` policy merge (BS:62377); `nh` documentation builder (BS:65373); `uh` the backend transport (BS:67812); `X2` setup and the turn hook (BS:77562).

- Wiring. `cua serve` registers `src/services/browser.mjs` as the trusted `browser` service (`src/runtime/launch.mjs` buildLaunch: `NODE_REPL_TRUSTED_SERVICES`, `CUA_BROWSER_VENDOR_SERVICE`, `BROWSER_USE_AVAILABLE_BACKENDS='chrome'`, optional `BROWSER_USE_BACKEND_PATHS`, `CUA_BROWSER_DEFAULT_INSTANCE`). The wrapper's `createBrowserService({loadVendor, vendorVersion, secrets, ...})` imports the vendor module in-process with the shared `globalThis.nodeRepl` and delegates every `handleRpc`; it substitutes `{{secret:…}}` only in `playwright_locator_fill.value` and `tab_ax_action` paste/type_text/set_value, after checking the vendor package version equals `PINNED_VENDOR_VERSION` ('0.1.1'). The REPL client runs in the evaluation kernel; the service runs in the trusted worker; native sockets go through `nodeRepl.nativePipe` (the supervisor owns the OS socket).
- REPL contract. `nodeRepl.rpc('browser', {method:'setup', params:{environment, undocumentedApiMembers, excludedDocumentation}})` returns `{apiManifest, disabledMemberIds, credentialRecoveryErrorVersion}`; version 1 makes the client use `executeWithRecovery`, else `execute`. Commands are flat objects `{type, browser_id?, tab_id?, ...payload, client_timeout_ms?}`; `executeWithRecovery` answers `{ok:true, value}` or `{ok:false, error}`. The first-use documentation is built by the service (`nh.readBrowser`: "# Selected Browser", guidance, "# Additional Capabilities", "# API Reference" generated from the manifest), not read from a static file. The full inventory of `type` values is in the digest (board #113 comment, 2026-10-13) and in `Rf`.
- Backend contract (service ↔ host). JSON-RPC over the host's Unix socket with `session_id`, `turn_id`, `session_context` on every session request: `getInfo`, `ping`, `getTabs`, `createTab`, `getUserTabs`, `claimUserTab`, `getCommittedTabUrl`, `attach`/`detach`, `attachTarget`/`detachTarget`, `executeCdp {target:{tabId, sessionId?|targetId?}, method, commandParams?, timeoutMs?, preserveDebuggerOnTimeout?}`, `markTab`, `nameSession`, `moveMouse`, `turnEnded`, `executeUnhandledCommand` (viewport only); notifications in: `onCDPEvent`, `onCDPDetach`, `onDownloadChange`, `onPageEvent`. The host translates to the extension's 15 primitives and MAWS's `cursor.move`/`tabs.adopted`; tab ownership, turn fencing, foreign-frame guards, popup adoption and the download relay live in the host and extension (`src/chrome/host.mjs`, `extension/background.js`) and are untouched here. cua's `getInfo` answer: `{type:'extension', family:'chrome', name:'cua', version, capabilities:{browser:[viewport], tab:[]}, metadata:{extensionInstanceId, profileName?}}`, with `agentRequestHeaderEnabled` omitted.
- Limits, all service-side: `qe(t) = min(max(0, timeout_ms ?? 3000), t.max ?? 3000)` caps locator and evaluate phases (BS `qe`); pressSequentially 5 s (`zO`); waitForDownload and locator media 120 s (`YO`, `qO`); file chooser 3 s default, 120 s max (`ZO`); `waitForTimeout` uncapped (`n1`); back/forward load wait 10 s; dialogs 60 s (`pf`, `m1`). Read-only evaluate: isolated world `browser-use-readonly-js`, frozen `Readonly*` wrappers, scrolling allowed, mutation/fetch/XHR/cookie refused (`rM`, `a_`). `dom_cua_get_visible_dom` 20,000 chars / 200 elements. Screenshots JPEG quality 80 at CSS scale, screencast 2 s then capture fallback 5 s. No vendor 60 s cap on createBrowserTab exists; the plugin's "can take 60 s" (`src/mcp/surface.mjs`) is outer-cell guidance.
- On the extension route `Tab.ax` is disabled by default (`environment-docs/codex-app/api.json`: extension-disabled `Tab.ax`, `Tabs.content`, `ContentAPI.export`, `BrowserUser.getTabContext`); tabs are DOM-only. The AX WASM (`browser-accessibility.wasm.br`, 20 MB decompressed) is therefore not in the Chrome path and is not ported.
- OpenAI-specific machinery in the service: site_status (`check-url-site-status`, `Oy`/`Op`, fail-open on fetch error), the identity gate in `uh.sendSessionRequest` (only when `agentRequestHeaderEnabled` is present) and the background identity fetch `jm`/`DB` at setup and per selected-browser command, Statsig (`gv`, `ab.chatgpt.com/v1`), Sentry (`z2`), OTEL audit records (`Et`/`EN`, include `origin`), `nodeRepl.config` reads of `config/read` and `configRequirements/read` through the app-server (`tL`), persisted grants under `CODEX_HOME/browser/config.toml` and `browser/sessions/<id>.toml` (`ua`), Auto-review and elicitation (`vI`, `Vt`), the 16 reason codes of `eT`, GaaS/cloud paths (`Nf`, `zse`). All of these run on the cua route today except the awaited identity gate.
- The benchmark archive `docs/evidence/2026-10-05-browser-route-benchmark/` (fixture 8 tasks + MiniWoB 15 tasks, `TASKS.md`, `fixture/serve.mjs` on 127.0.0.1:48731, MiniWoB at commit 33c3b4d) is an agent-level trial of the old ChatGPT-extension route versus the Playwright CLI, one run each with unequal contention; it is the task set, not a baseline.
- Dependencies: the vendor bundles Playwright's InjectedScript (~155 KB), Statsig, Sentry, Zod, a QR decoder, classic-level (profile discovery that cua does not exercise); it has no `@oai/sky` import and declares only classic-level as a dependency. cua declares `ws` only; `playwright-core` is not a dependency yet.

## Design

### Shape: one module in the same slot, two unchanged contracts, a switch

`src/browser-service/` is a cua-owned ES module whose `index.mjs` exports `handleRpc(request)` with exactly the vendor's semantics for `setup`, `execute` and `executeWithRecovery`, registered in the trusted worker in place of the vendor module. `src/services/browser.mjs` keeps its role (secret substitution, MAWS default-instance rewriting, error sanitising) and gains the selection: `CUA_BROWSER_SERVICE=cua` loads `src/browser-service/index.mjs`, `vendor` loads the pinned vendor module as today; `buildLaunch` passes the variable through from `cua serve`'s environment, default `vendor` until M5, `cua` from M5 on. Both services run under the same `globalThis.nodeRepl` and the same host, so the switch is the differential harness's lever and the user's rollback for one release. The vendor module is deleted by #116, not here.

Why this shape and not a new process: the trusted worker already owns the privileged bridge (`nodeRepl.nativePipe`, `addTurnEndedHandler`, `fetch` for the optional features) and the wrapper's substitution runs before the service sees a command; a separate daemon would need its own socket, ancestry check and secret path for no gain. Why not playwright-core's full stack over a CDP transport adapter (the strongest alternative, proven feasible by MAWS's E0b bridge): the owner chose vendor-shape fidelity, because every semantic of the vendor's flat commands (strictness, waits, snapshot flattening, dialog blocking) is what the model has learned and what "no regression" measures against; a stock Playwright stack would shift those semantics in ways the harness would flag by the hundred.

### Porting from the readable tree

The readable `BS` is the source the port reads, class by class, keeping the vendor's structure, method names and error sentences where they are not OpenAI-specific. Every ported file opens with a provenance header naming the build and line range it derives from, in this exact form:

```
// Ported from readable chatgpt-26.928.40906 BS:47139-52606 (class Qn, the CDP controller); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
```

so the later clean-room pass (a child of #114, registered at this spec's commit) knows exactly which files must be rewritten before distribution. The owner's ruling: during the internal research preview, copying is permitted; distribution waits for the clean-room child. The licence position is recorded in the Decision Log and nothing in this spec claims the ported code is distributable.

Module layout (one file per vendor concern, names ours, each a small unit with one purpose):

| file | ported from | concern |
|---|---|---|
| `index.mjs` | `X2` | `handleRpc`: setup (manifest, disabled members, recovery version 1), execute/executeWithRecovery dispatch, the turn-ended hook registration |
| `manifest.mjs` | `Tte`/`xte`/`_te`, `environment-docs/codex-app/api.json` | the API manifest and the member set per backend type; the capability list |
| `docs.mjs` | `nh`, `PN`, `IN`, `RN` | first-use documentation text: our own guidance sentences, the generated API reference |
| `backend.mjs` | `uh`, `Oi`, `sh`/`ah`, `dh` | discovery of backend sockets (`BROWSER_USE_BACKEND_PATHS`, the registry), the JSON-RPC session transport over `nodeRepl.nativePipe`, `getInfo`, notifications in |
| `cdp.mjs` | `Qn` | per-tab CDP controller: attach/detach, target and session routing, OOPIF auto-attach, isolated worlds, event queue, one reattach retry on "Debugger unattached", dialog blocking |
| `injected.mjs` + `vendor/injected-script.js` | `H1`/`JY` | the Playwright InjectedScript bundle (from the pinned `playwright-core` npm package, Apache-2.0) and its installation into frames |
| `locators.mjs` | `Pf` | selector resolution, strictness, frame traversal, visibility/enabled/hit checks, pointer and keyboard actions, fill/press/select/check, reads, waits, `evaluate` |
| `snapshot.mjs` | `BO`/`OO`/`vJ`/`RO`/`TJ`/`MO`, `jl`/`Wl` | aria snapshot (frames stitched, anonymous generic/listitem/group flattened, refs stripped) and the visible-DOM listing with its caps |
| `screenshot.mjs` | `zp`, `WG`/`HG`, `P1` | screencast frame then capture fallback, JPEG 80, CSS scale, clip and fullPage |
| `input.mjs` | `cua.*`, `dom_cua.*` | coordinate pointer, drag paths, keypress, type; the DOM-CUA node-id actions |
| `dialogs.mjs` | `rememberJsDialog`, `pf`, `m1` | dialog tracking, blocking, answering |
| `downloads.mjs` | `yf`, `Mf`, `LO`, `LZ` | Fetch interception of document responses, the download table fed by `onDownloadChange`, waits and paths |
| `chooser.mjs` | `ZO`, `FO` | file chooser interception and `DOM.setFileInputFiles` |
| `tabs.mjs` | `Ze`/`dO`/`Uf`, `Mf`-adjacent turn logic | tab registry, create/select/claim, mark/handoff, session naming, turn end |
| `cursor.mjs` | `qf` | `moveMouse` to cursor peers (MAWS) |
| `clipboard.mjs`, `devlogs.mjs`, `viewport.mjs`, `rawcdp.mjs` | the capability classes | M2 |
| `exports.mjs`, `assets.mjs`, `webmcp.mjs`, `botdetect.mjs`, `authhandoff.mjs`, `history.mjs` | `qY`/`WY`/`Jv`/`F1`/`jg`/`V6`/`Uu`, the WebMCP and history classes | M3 |
| `errors.mjs` | `eT`, `Cz`/`tT` | the error class, the kept reason vocabulary |
| `budgets.mjs` | `qe`, `zO`, `YO`, `qO`, `ZO`, `n1` | every timeout constant and the clamp function, in one place |

### What the service keeps, lifts and drops

Kept as the vendor has it (parity): every command the vendor serves on the extension route and its result shape; selector semantics and strict-mode errors; the aria snapshot grammar; dialog blocking ("a dialog is open; call getJsDialog"); download waits that pause while a Chrome dialog is up; beforeunload auto-accepted; screenshot format and scale; `markTab` and the turn-end cleanup delegated to the host; the `client_timeout_ms` field accepted and ignored by the transport as today; the secret hook points unchanged (the wrapper is not modified beyond selection and the version check).

Lifted, from M1, as behaviour extensions on the same methods (owner's ruling): the clamp `qe` keeps its 3,000 ms default but its maximum becomes 120,000 ms, so `timeoutMs` on locator actions, waits and `evaluate` raises the budget instead of only lowering it; `evaluate` and `evaluateAll` run in the page's main world with Playwright's ordinary semantics (DOM mutation, `fetch`, `XMLHttpRequest`, cookies all as the page itself could do them; no `require`, no module import, which the isolated REPL never had), returning the same serialised projection (depth 8, arrays 2,000, keys 200, strings 200,000, cycles marked). The locator engine keeps its own isolated world for the injected script, separate from the page's world, as the vendor does. `dom_cua_get_visible_dom` keeps 20,000 chars / 200 elements by default and accepts `max_chars`/`max_elements` up to 200,000 / 2,000. The documentation text says exactly this, and the plugin's `profiles_list` description (`src/mcp/surface.mjs`) replaces "stop at 3 s" and "read-only" with the new rules in M5.

Dropped, with nothing in their place: site_status and the two `site_status_*` reasons; the identity gate, background identity, Statsig, Sentry, OTEL audit, every telemetry span; `nodeRepl.config` reads and the Codex app-server; persisted grants under `CODEX_HOME/browser`; Auto-review, elicitation and the `approval_*`, `guardian_*`, `enterprise_policy_*`, `persisted_user_denied`, `user_declined`, `browser_navigation_blocked`, `browser_capability_blocked` reasons; GaaS and cloud-only paths; the classic-level profile discovery (cua binds profiles itself). The service makes no network request of its own; the optional features of M3 fetch only what the user's page or the named export needs (a YouTube caption URL, a Google Docs export URL), and the documentation names each. A local host denylist is out of scope for this spec (option recorded; a one-line follow-up when wanted).

Kept error vocabulary (`errors.mjs`): `invalid_url`, `unsupported_protocol`, `tab_not_found`, `browser_not_found`, `dialog_open`, `tab_detached`, `strict_mode_violation`, `timeout`, `download_not_found`, `file_chooser_not_found`, `unsupported_command`, `browser_capability_unavailable` (the one vendor reason that still has a meaning: a capability the backend did not announce). The wrapper's `SECURITY_REASONS` allowlist in `src/services/browser.mjs` is extended with the kept codes so substituted calls still fail with a value-free diagnostic.

### The parity harness (the verification system)

`scripts/browser-parity.mjs` replays a corpus of flat commands against a running `cua serve` (local or `--device <name>` through the plugin's device route) on a bound profile, once with `--service vendor` and once with `--service cua`, writing one JSONL line per command: `{case, type, params, ok, value (normalised), error:{code, message}, ms, cdp:[{method, target}] }`. `scripts/browser-parity.mjs --diff <a.jsonl> <b.jsonl>` prints every difference and exits 1 unless each is listed in `test/browser-parity/expected-differences.json` (the lifted limits and dropped prompts, each with a reason). Normalisation: tab and browser ids mapped by order of creation, timestamps and random ids masked, screenshot values replaced by a perceptual hash with a tolerance, snapshot text compared exactly. The corpus lives in `test/browser-parity/corpus/*.json` (one file per concern: tabs, navigation, locators, reads, evaluate, snapshot, screenshot, pointer, dom_cua, waits, dialogs, downloads, chooser, clipboard, devlogs, viewport, rawcdp, exports, errors) against fixture pages served by `test/browser-parity/fixture/serve.mjs` (the benchmark fixture's pages plus pages for dialogs, downloads, a file input, an OOPIF, a popup, a slow element, a strict-mode duplicate). The CDP column is recorded by the host's refusal log extended with a `--trace` mode; it is compared as a sequence of methods per command, with a per-case tolerance list for ordering-only differences.

Capability parity (`test/browser-parity/manifest.test.mjs`): with the vendor module importable from the installed runtime, the test calls both services' `setup` under a fake `nodeRepl` and a fake backend answering cua's `getInfo`, and asserts our manifest's member set equals the vendor's minus `disabled` members and plus nothing, and that every `type` in the vendor's `Rf` table that the Chrome route can reach has a handler in ours (the table of reachable types is a committed JSON produced from the readable tree, `test/browser-parity/vendor-commands.json`, with a `milestone` column saying when each lands; the test fails for any type whose milestone is at or before the current one and has no handler). Where the vendor is not installed (CI, a clean machine) the test skips with a visible line.

Benchmark baseline and comparison: the archive's task set (`TASKS.md`, fixture, MiniWoB 33c3b4d) run on the mini by a subagent controller through `devices_use mini` on a bound profile, three consecutive unattended runs per service, recording per-call JSONL (t, task, tool, kind, ok, ms, note) and the outcomes; the summary compares medians per task. M0 records vendor; M5 records cua and compares: every task equal or better within noise (median within 10 % or 500 ms, whichever is larger), outcomes equal.

### Documentation, surface text and plugin

`docs.mjs` authors cua's guidance: the "# Selected Browser" block, the Chrome rules (DOM-only, Playwright locators, press keys on focusable elements), the lifted budgets, the dropped prompts, the error vocabulary, and the generated API reference from the manifest. README's Chrome section and "What the browser service does on the network and on disk" are rewritten in M5 to say the service is cua's, makes no network calls and keeps no CODEX_HOME state; the plugin's `profiles_list` description and the cua-remote skill lose the 3 s and read-only sentences. The plugin version bumps once, in M5.

### Out of scope

The vendor module's removal (#116); the REPL client and `@oai/cua` (#116); the AX WASM and any own accessibility renderer for Chrome tabs (a later child of #114, after #117's native engine exists); the Codex sandbox and app-server (#115); the ChatGPT extension route (`--vendor`, removed by #79: this service serves cua's host and MAWS only, and refuses a vendor-route backend with `unsupported_backend`); a local host denylist; Store listing (#78); the clean-room rewrite (registered as a child of #114 at this spec's commit).

## Acceptance

With `CUA_BROWSER_SERVICE=cua`, a bound Chrome profile on the mini (or this Mac), the plugin's `cua_repl`:

1. `profiles_list` then `cua.getBrowser({extensionInstanceId})`, `createBrowserTab(browserId, 'https://www.nytimes.com/')` opens the page and `tab.playwright.getByRole('link', {name: /Opinion/i}).first().click()` navigates; the same sequence with `CUA_BROWSER_SERVICE=vendor` ends with `site_status_blocked`.
2. On the harness fixture's slow page, `locator('#late').click({timeoutMs: 15000})` succeeds after the element appears at 8 s; with `vendor` the same call fails at 3 s with the vendor's deadline error.
3. `tab.playwright.evaluate("document.title = 'changed'; document.title")` returns `changed` and a following `tab.title()` returns `changed`; with `vendor` it fails with the read-only error.
4. A page with `alert()`: the alert is reported by `tab.getJsDialog()`, a locator action while it is open fails with `dialog_open`, `handleJsDialog(id, 'accept')` clears it; a download link resolves `waitForEvent('download')` and `download.path()` to a file under the host's download directory; a file input accepts `fileChooser.setFiles([path])` and the page reads the file name.
5. `node scripts/browser-parity.mjs --service vendor --device mini --out /tmp/p/vendor` then `--service cua` then `--diff` reports `0 unexpected differences` across the whole corpus, and `node --test test/browser-parity/manifest.test.mjs` passes with the vendor installed.
6. The benchmark comparison on the mini (three runs each) shows every fixture and MiniWoB task equal or better within noise, outcomes equal; the summary is committed under `docs/evidence/2026-10-<dd>-own-browser-service-benchmark/`.
7. Over a whole session with the browser surface, `lsof -p <trusted worker pid> -i` and the host's trace show no connection to any OpenAI host, and `$CUA_HOME/state/codex/browser/` is not created.
8. MAWS: `pnpm e2e:browser-cua` in the MAWS worktree passes unchanged against the cua service (the quiet wrapper, one group).
9. Linux: on the cua-linux VM, `scripts/accept-chrome.mjs --route cua` passes as before with the cua service.
10. `HOME=<scratch> npm test`, `npm run test:mods`, `claude plugin validate .` green; README, the cua-remote skill and `src/mcp/surface.mjs` carry the new rules; the plugin version is one minor above main's; `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` has the dated Decision Log line.

## Constraints binding every milestone

Repository SSFSKIM/cua, branch `feat/own-browser-service` in the worktree `/Users/new/Developer/GitHub/cua-wt-browser-service`; the main checkout stays on `main`. No attribution footers. Never read or print `~/.config/claude-secrets`, any `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`, `~/.config/hcloud`; never launch or kill the owner's Chrome or hosts on this Mac; no executor or test reads the owner's Chrome profile on this Mac (the mini's registered profiles are the live surface, owner-approved; the harness and the benchmark run there through the device route or over ssh in BatchMode, never restarting the mini's agent); nothing logs a secret value, a bookmark, a page's credentials. The vendor runtime files stay unchanged (the switch selects a module, it does not edit the runtime). Every ported file carries the provenance header. `playwright-core` is pinned to one exact version in `package.json` and its injected script is extracted at build time by `scripts/extract-injected-script.mjs` into `src/browser-service/vendor/injected-script.js` (committed, with the version in a sibling `VERSION` file); the extractor refuses a version mismatch. Tests under `test/` run without the vendor runtime, Chrome or a network (doubles: a fake `nodeRepl`, a fake backend speaking the host protocol, recorded CDP responses); tests that need the vendor module skip visibly when it is absent. Gates before every PR: `HOME=<scratch> npm test`, `npm run test:mods`, `claude plugin validate .` (one pre-existing CLAUDE.md warning is known). Each milestone is one PR against `main`, merged by the session after its review; later milestones branch from `main` after the earlier merged. Board writes only through the issue-tracker scripts. The readable tree is cited as `BS:<line>` with the build named.

## Plan of Work

### M0 — Parity harness, capability-parity test, and the baseline on the mini

Scope: the measuring instruments, before any service code. At its end `scripts/browser-parity.mjs` replays the corpus against the vendor service on the mini and writes JSONL; `--diff` of two vendor runs reports 0 differences (the harness's own determinism check); `test/browser-parity/manifest.test.mjs` passes against the vendor (our service absent: the test's "cua" half is skipped until M1, which is the one allowed skip); `test/browser-parity/vendor-commands.json` lists every reachable `type` with its milestone; the benchmark baseline exists under `docs/evidence/2026-10-<dd>-own-browser-service-benchmark/vendor/` with three runs' JSONL and a summary of medians.

Touches: `scripts/browser-parity.mjs`, `test/browser-parity/` (corpus, fixture, expected-differences.json, manifest.test.mjs, vendor-commands.json), the host's trace mode (`src/chrome/host.mjs`: a `CUA_HOST_TRACE=<file>` env writing one line per backend request and notification), the mini's fixture serving (a scratch directory on the mini with the fixture and the MiniWoB clone at 33c3b4d, started and stopped by the harness over ssh).

Decisions: the corpus is written from the digest's command inventory and the readable `Rf` table, one case per command and per documented error path; cases that need a human (Chrome's "Ask where to save" dialog) are excluded and listed; the benchmark controller is a subagent following `TASKS.md` through `devices_use mini`, serial, one attempt per task, recording JSONL as `TASKS.md` specifies; three consecutive runs with a fresh tab set each; the profile used is whichever of `school`/`ssfs` the executor binds first (bind with `cua profiles bind`, not by opening the owner's profile on this Mac).

Does not touch: `src/browser-service/`, `src/services/browser.mjs`, any vendor file.

Proves: acceptance 5's vendor half and 6's baseline half; pins the harness's determinism (two vendor runs diff to 0).

### M1 — The core service and the switch

Scope: `src/browser-service/` with `index.mjs`, `manifest.mjs`, `docs.mjs` (a first version of the guidance), `backend.mjs`, `cdp.mjs`, `injected.mjs` and the extracted script, `locators.mjs`, `snapshot.mjs`, `screenshot.mjs`, `input.mjs`, `tabs.mjs`, `cursor.mjs`, `errors.mjs`, `budgets.mjs`; the selection in `src/services/browser.mjs` and `buildLaunch`; `CUA_BROWSER_SERVICE` documented in README's config table with default `vendor`. At its end every command in `vendor-commands.json` marked M1 (browsers, documentation, tabs, navigation, mark/handoff, session naming, screenshot, playwright locators and reads, waits, evaluate, snapshot, cua and dom_cua input, tab_ax_get_state's DOM fallback) answers through the cua service, and the harness corpus for those concerns diffs to 0 unexpected differences against M0's vendor run, with the lifted limits listed in `expected-differences.json`.

Touches: the files above; `test/browser-service/*.test.mjs` (unit tests per module with doubles); `test/browser-parity/manifest.test.mjs` now asserting both halves.

Decisions: the port follows `BS` class by class with provenance headers; the CDP controller keeps the vendor's one-retry reattach and its event queue; the injected script is installed per frame in a cua-named isolated world (`cua-browser-injected`); `evaluate` runs in the main world (design "lifts"); `qe` max 120,000 ms; the turn-ended hook is registered through `nodeRepl.addTurnEndedHandler` exactly as the vendor's `ph` so the wrapper's assumptions hold; `getInfo` from a backend that announces `agentRequestHeaderEnabled` (the vendor route) is refused with `unsupported_backend`; the secret wrapper's version check becomes `serviceVersion()` reading `src/browser-service/VERSION` when `cua` is selected and the vendor pin when `vendor` is.

Does not touch: dialogs, downloads, chooser, clipboard, devlogs, viewport, raw CDP, exports (M2/M3); the plugin surface text and README's Chrome section (M5); the default of the switch (stays `vendor`).

Proves: acceptance 1, 2, 3 (with the switch set by hand), 5's locator/evaluate/snapshot/screenshot/input concerns, 7 for the covered commands.

### M2 — Dialogs, downloads, file chooser, clipboard, console logs, viewport and visibility, raw CDP

Scope: `dialogs.mjs`, `downloads.mjs`, `chooser.mjs`, `clipboard.mjs`, `devlogs.mjs`, `viewport.mjs`, `rawcdp.mjs`; the corpus concerns for each diff to 0 unexpected differences; the host's `onDownloadChange` consumed alongside Fetch interception as the vendor does; `browser_viewport_*` still routed to the host's `executeUnhandledCommand` as today; `tab_cdp_call`/`tab_cdp_events` offered only when the backend announces the `cdp` capability (cua's host does not today, so the manifest marks them disabled and the harness records that as the vendor does).

Decisions: dialog and download budgets as the vendor's (60 s, 120 s); the download directory is the host's (Chrome's); OOPIF file choosers unsupported with the vendor's error sentence minus "ChatGPT".

Does not touch: M3's optional features; MAWS specifics.

Proves: acceptance 4; 5's dialogs/downloads/chooser/clipboard/devlogs/viewport/rawcdp concerns.

### M3 — Optional features: exports, page assets, WebMCP, bot-detection report, auth handoff, user history

Scope: `exports.mjs` (YouTube transcript, GSuite export, `tab_content_export`), `assets.mjs` (page assets list and bundle), `webmcp.mjs`, `botdetect.mjs`, `authhandoff.mjs`, `history.mjs`; each in the manifest only when its backend prerequisites hold: history needs the extension's `history` permission (#83, deferred: the command is implemented and disabled until a host announces `history`); auth handoff needs a cloud broker in the vendor and is implemented as the local form only (open the page for the person, mark handoff) with the documentation saying so.

Decisions: the fetches these features make are the page's own origin or the named export URL, recorded in `docs.mjs`; nothing to OpenAI.

Proves: 5's exports/assets/webmcp/botdetect/authhandoff/history concerns, each either diffing to 0 or recorded as disabled-by-capability on both sides.

### M4 — MAWS client mode and Linux parity

Scope: the service under MAWS's client-mode backend (`src/chrome/host.mjs` client mode, `hello.profileName`, `cursor.move`, `tabs.adopted`, the human-takeover hold through `debugger.sendCommand.timeoutMs`) and on the Linux route (cua-linux VM, `scripts/accept-chrome.mjs --route cua`); `pnpm e2e:browser-cua` in a MAWS worktree with `CUA_BROWSER_SERVICE=cua` exported to the engine's environment.

Decisions: MAWS's `getInfo` has `profileName: 'MAWS'` and the cursor peer flag; `moveMouse` forwards only there as today; no MAWS code changes expected; if one is needed it is a MAWS PR from this session with the quiet wrapper.

Proves: acceptance 8 and 9.

### M5 — Guidance text, docs, default switch, plugin bump, acceptance as written

Scope: `docs.mjs` final guidance; `src/mcp/surface.mjs` profiles_list text; `skills/cua-remote/SKILL.md`; README (Chrome section, network section, config table); `CUA_BROWSER_SERVICE` default `cua`; `.claude-plugin/plugin.json` and `marketplace.json` one minor up; the benchmark comparison runs (three cua runs on the mini) and the evidence directory; the Decision Log line in the standalone design spec; this spec's Outcomes.

Proves: acceptance 6, 7 (whole session), 10, and re-runs 1 to 5 as the last milestone must.

## Concrete Steps

Working directory `/Users/new/Developer/GitHub/cua-wt-browser-service` unless stated.

```
HOME=/tmp/cua-scratch-home npm test                      # expect: all pass, 1 skip (Linux-only) plus the visible vendor-absent skips
npm run test:mods                                        # expect: 32 pass
claude plugin validate .                                 # expect: ok, the known CLAUDE.md warning only
node scripts/extract-injected-script.mjs                 # expect: "injected-script.js <sha> from playwright-core <version>"
node scripts/browser-parity.mjs --service vendor --device mini --out /tmp/parity/vendor-1
node scripts/browser-parity.mjs --service vendor --device mini --out /tmp/parity/vendor-2
node scripts/browser-parity.mjs --diff /tmp/parity/vendor-1 /tmp/parity/vendor-2    # expect: "0 differences"
node scripts/browser-parity.mjs --service cua --device mini --out /tmp/parity/cua-1
node scripts/browser-parity.mjs --diff /tmp/parity/vendor-1 /tmp/parity/cua-1       # expect: "0 unexpected differences (N expected)"
node --test test/browser-parity/manifest.test.mjs        # expect: pass (skips named when the vendor is absent)
```

The benchmark: the fixture and MiniWoB on the mini under `~/bench-browser/` (`node fixture/serve.mjs`), the controller subagent per `docs/evidence/2026-10-05-browser-route-benchmark/TASKS.md` through `devices_use mini`, JSONL per run under the evidence directory, `node scripts/bench-summary.mjs <dir>` printing medians per task.

## Interfaces and Dependencies

In `src/browser-service/index.mjs`:

```js
export const SERVICE_VERSION = '0.1.0';            // also in src/browser-service/VERSION
export async function handleRpc(request)            // {method:'setup'|'execute'|'executeWithRecovery', params}
// setup → {apiManifest, disabledMemberIds: string[], credentialRecoveryErrorVersion: 1}
// execute → the command's result value, or throws BrowserServiceError
// executeWithRecovery → {ok:true, value} | {ok:false, error:{name, code, message, retryable}}
```

In `src/browser-service/errors.mjs`:

```js
export class BrowserServiceError extends Error { code; retryable; }   // codes: the kept vocabulary in the design
```

In `src/browser-service/backend.mjs`: `discoverBackends(env) → [{id, path, info}]`, `connect(path) → Backend` with `request(method, params, {sessionId, turnId})`, `on(notification, handler)`, `close()`; the session fields and the `getInfo` shape are the host's (`src/chrome/host.mjs`).

In `src/browser-service/budgets.mjs`: `export const DEFAULT_ACTION_MS = 3000, MAX_ACTION_MS = 120000, PRESS_SEQUENTIALLY_MS = 5000, DOWNLOAD_MS = 120000, CHOOSER_DEFAULT_MS = 3000, CHOOSER_MAX_MS = 120000, DIALOG_MS = 60000, LOAD_MS = 10000; export const clamp = (requested, max = MAX_ACTION_MS) => Math.min(Math.max(0, requested ?? DEFAULT_ACTION_MS), max);`

In `src/services/browser.mjs`: `createBrowserService({loadService, serviceVersion, secrets, ...})` where `loadService` resolves by `CUA_BROWSER_SERVICE` (`cua` → `src/browser-service/index.mjs`, `vendor` → `CUA_BROWSER_VENDOR_SERVICE`) and `serviceVersion` returns the pin to check (`PINNED_VENDOR_VERSION` or `SERVICE_VERSION`); `SECURITY_REASONS` extended with the kept codes.

In `scripts/browser-parity.mjs`: flags `--service vendor|cua`, `--device <name>|local`, `--corpus <glob>` (default all), `--out <dir>`, `--diff <a> <b>`, `--expected test/browser-parity/expected-differences.json`; JSONL line shape as the design states; exit 0 on no unexpected differences.

Dependencies: `playwright-core` (exact pin, devDependency; only its injected script ships), `ws` as today. No other new dependency; the QR decoder (the vendor's zxing WASM for `tab_bot_detection_report`'s QR path) is not ported unless M3 shows the feature needs it, in which case the open-source `zxing-wasm` package is pinned and recorded.

## Surprises & Discoveries

- Observation: the vendor's 3 s cap and read-only `evaluate` are service-side, so they lift without touching the REPL client.
  Evidence: `BS` `qe` and the `Readonly*` membrane (BS:57467 to 59281); digest section 3.
- Observation: on the extension route `Tab.ax` is disabled by default, so the proprietary AX WASM is not in the Chrome path.
  Evidence: `environment-docs/codex-app/api.json` extension-disabled members; digest section 1.
- Observation: the benchmark archive compares routes with unequal contention and the old vendor extension, so it cannot serve as a service baseline.
  Evidence: `docs/evidence/2026-10-05-browser-route-benchmark/README.md` lines 24 to 33; digest section 7.

## Decision Log

- 2026-10-13 (verification call, at authoring): one independent spec review on the design (`doperpowers:adversarial-reviewer`) and one buildability review of the execution section (the same agent, the standard brief), findings folded before the executor starts; each milestone's PR gets `doperpowers:reviewer-high`; the whole branch is reviewed per milestone since each lands separately. Execution through `doperpowers:plan-executor` at its pin (opus high; workers task-executor opus high, task-reviewer sol xhigh); the owner's temporary note prefers GPT routes for bounded work, so the executor may pin its workers to astra at medium where the brief allows.
- 2026-10-13 (owner): the engine is a port in the vendor's shape from the readable tree `~/codex-app-src/readable/chatgpt-26.928.40906/`, permitted for the internal research preview; a clean-room rewrite before distribution is a separate child of #114. Alternative rejected: playwright-core's full stack over a CDP transport adapter (less code, versioned semantics) because fidelity to the vendor's learned behaviour is the measure of "no regression".
- 2026-10-13 (owner): no approval prompts of cua's own; Claude Code's permission modes gate the tool call. Alternative rejected: a once-per-connection download/upload elicitation, because Claude Code's display of MCP elicitation is unverified and the native route already has no such prompt.
- 2026-10-13 (owner): the readable tree is the primary reference for all cua work from now on; recorded in the standalone design spec's Decision Log and README's research note.
- 2026-10-13 (licence position): the ported code derives from OpenAI's proprietary distribution; this spec claims no right to distribute it; the clean-room child removes the derivation before any distribution.

## Outcomes & Retrospective

Pending — written at finish.
