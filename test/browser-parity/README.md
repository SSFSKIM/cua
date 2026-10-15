# Browser parity instruments (M0 task 1)

The live path runs cells through **`cua serve` and the unchanged bundled REPL client** on a separate mini checkout. Local development deliberately substitutes the runtime: the real MCP server and host run against `fake-cua-extension.mjs`, with a small VM browser facade. Local output has `backend: "fake"`; it is not evidence of vendor semantics and cannot be compared with live output. It never discovers Chrome, profiles, secrets or installed runtimes on this Mac.

```
node scripts/browser-parity.mjs run --device local --service vendor --out /tmp/parity-a
node scripts/browser-parity.mjs run --device local --service vendor --out /tmp/parity-b
node scripts/browser-parity.mjs diff /tmp/parity-a /tmp/parity-b

# Only after the session has made the mini profile ready and pushed the commit:
node scripts/browser-parity.mjs prepare --device mini --commit <sha> --profile ssfs
node scripts/browser-parity.mjs run --device mini --service vendor --out /tmp/parity/vendor-1
node scripts/browser-parity.mjs run --device mini --service vendor --out /tmp/parity/vendor-2
node scripts/browser-parity.mjs diff /tmp/parity/vendor-1 /tmp/parity/vendor-2
```

`prepare` checks the clean parity clone out at the SHA, installs dependencies, requires the existing profile binding to be ready (never rebinds), checks fixture startup, then stops that check's fixture. It saves machine preparation under ignored `.doperpowers/sde/browser-parity/<device>.json`. Each `run` owns a fixture process, SSH forwarding pipe, trace activation and MCP processes; all stop at its end. Fixture shutdown closes active HTTP connections as well as the listener: otherwise a surviving Chrome keep-alive socket can send POSTs to an old fixture while a new run resets a different instance. It never changes the resident checkout or agent. A preexisting trace activation is refused, not overwritten. `meta.json` records commit, profile, service environment, attestation and accepted elicitation count/details (action and time, not approval text). `complete: false` cannot be diffed.

Each connection checks `# Selected Browser` in the selection/documentation response and the presence/absence of `cua browser service <version>`. The vendor header is a standalone line (readable build 26.928.40906 BS:65410); the cua marker is checked in the documentation, not assumed to be on that line. Vendor-versus-vendor diffs refuse an allowance file. Other comparisons use `--expected test/browser-parity/expected-differences.json` explicitly. `--scenarios` takes comma-separated globs (relative to the repository or to `scenarios/`) on `run` and on `diff`: a milestone's cua run covers its scenarios only, and `diff --scenarios <the same globs>` restricts both runs to those cases before comparing, so a case or cell missing from either run inside the subset is still a cardinality difference.

## Scenario contract for the inventory/corpus task

Each `scenarios/<concern>/<case>.mjs` has one default export:

```js
export default {
  id: 'concern/case', milestone: 'M1b', commands: ['wire_type'],
  setup: {page: '/counter.html', state: {counter: 0}},
  cells: [
    {label: 'read', code: 'return {tabId: tab.id, title: await tab.title()};'},
  ],
  assert({results, fixtureState}) {
    return {ok: results.every(r => r.ok) && fixtureState.counter === 0};
  },
};
```

- IDs and cell labels are unique. `commands` is the inventory's list of exercised wire types; the runner does not guess these from source. `--scenarios '<glob>'` matches paths relative to either the repository or `scenarios/`. Remote default is the entire corpus; local default is the two examples, because its small facade does not implement Playwright.
- Each case resets `/state` to `{counter:0, events:[], ...setup.state}`, opens a **fresh MCP connection**, selects the prepared profile, calls `browser.nameSession(id)`, and creates `tab` on `setup.page` with `cua.createBrowserTab` (as the model does; it also reads the new page's DOM snapshot). Setup failures produce a failed case assertion, never a silently missing case.
- The persistent REPL globals are `browser`, `tab`, `fixtureURL` (the browser's loopback origin), and globals the case itself sets. A `code` string is an **async-function body**: use `return` to record its value; use `globalThis.foo = ...` to persist a binding. Default outer cell budget is 60 s, overridden by `timeoutMs`. Locator/evaluate timeouts are still passed by the cell to those APIs.
- `{label, code, start:true}` starts an async promise **inside the REPL**, stores an error-or-value envelope and immediately returns `{started:label}`. `{label, join:'earlier-label'}` awaits it. This supports pure-JS promises. Live discovery additionally showed that the runtime drains in-flight browser RPCs before completing a cell: browser download/chooser waits and their triggering actions must be started together inside one cell with `Promise.all`, not split across `start` and a later trigger cell. The trigger cell runs between start and join. Every start must be joined unless the case deliberately drops the connection.
- `{label, op:'endTask'}` calls MCP `end_task`; `{label, op:'drop'}` drops that connection. Descriptor factories `start(cell)`, `join(label, handle)`, `endTask(label)`, `drop(label)` are exported from `scripts/browser-parity/scenario.mjs`. They run in the scenario module, not inside browser code.
- Optional `client:'second'` selects another independently initialized/attested MCP connection to the same profile, with its own browser/tab globals. The first such cell sets it up lazily. Subsequent cells use the named connection; omitted `client` means primary. A dropped client cannot be reused. This supports ownership/two-client scenarios on the live host; local fake runtimes do not share host state.
- The runner catches cell failures as `{ok:false,error:{code,message}}`. Only a rejection's message crosses node_repl's RPC boundary, so a failed service call reaches a cell as a plain `Error` carrying the service's sentence on both services: cua-side oracles assert code `Error` and the sentence; a `BrowserServiceError`'s kept code is visible only on the trusted side (unit tests, the wrapper's `rejectionKind`). Assertions also receive `service` (`vendor` or `cua`) for service-specific expected behavior. Assertions receive **raw** `{cell,ok,value|error}` rows and the final `/state`; they must decide expected errors, exact success values and mutation effects independently of the other service. Missing code defaults are not a substitute for assertions. A returned `{ok:false}` or a thrown assertion fails `run`, as does failed lifecycle cleanup. All still-live clients get `end_task` before closing.
- A case-level `skip:'explicit capability/human reason'` writes an assertion row with that reason. It is not a substitute for an executable disabled-capability assertion where the inventory requires one.

## Values, timing and trace

`results.jsonl` holds one cell row `{case,cell,ok,value|error,ms,trace}` and one `{case,assertion}` row. End-task values retain the structured status. `ms` is elapsed host time and does not participate in semantic comparison. `host-trace.jsonl` is diagnostic; missing or empty per-cell traces mean **unavailable**, never a zero-call discrepancy (the mini's resident host lacks tracing until M5).

An error message is compared exactly except for the line and column on a stack frame line inside an anonymous evaluated script (`    at <anonymous>:227:31` compares as `    at <anonymous>`): a page error's stack frames name positions in each service's own expression layout; its sentence, frames and frame names still count, and so does a position anywhere else in the message (M1b).

Known `tabId`, `browser_id`, session, turn, frame, target and request ID fields normalize by first observation. Timestamp fields normalize; arbitrary `id` and every text/snapshot remain exact. For API-specific schemas use cell `normalize:{ids:{'0.id':'tab'}, masks:['volatileField']}`; paths are dot-separated array/object paths. Project a created object's ID in its creation cell so the mapping follows creation order. Masks are explicit corpus decisions, not a blanket removal of random-looking text.

Binary cell results travel as MCP image blocks (not large JSON arrays subject to text-output truncation). Screenshots returned as `Uint8Array`, `Buffer`, MCP `{type:'image',data,mimeType}` values, or PNG/JPEG data URLs normalize to `{ $image:'ahash64', width, height, hash }`. JPEG luminance DCs and decoded noninterlaced 8-bit PNG pixels produce a 64-bit average hash; dimensions remain exact. Unsupported encodings fail rather than silently using a byte hash. Set case `screenshotTolerance: 4` (or another explicit 0–64 bit allowance); default is exact hash equality. Do not stringify screenshot bytes yourself.

Trace comparison counts CDP methods as a multiset, ignoring event order/IDs/timing. Optional case `pollingAllowance:{'Runtime.callFunctionOn':3, 'DOM.*':2, 'Page.getLayoutMetrics':1}` allows only bounded count differences for those polling methods. Non-polling methods cannot receive allowances. The allowance declarations must agree between runs.

A service expected-difference entry is `{cases:['concern/case'], cells:['label'], kind:'semantic'|'trace', reason:'why'}`. It cannot waive cardinality, invalid evidence, changed comparison settings or a failing assertion. Keep entries narrowly scoped. A trace entry may also name its `methods` and a `maxDelta`; a difference outside them stays a difference. `expected-differences.json` started empty; M1a added its first entry (`dialog_open` for a locator action while a dialog is open, `dialogs/alert` `blocked`).

REPL-host tolerances use a different format in `repl-host-expected-differences.json`: `{axis:'repl-host', kind:'vendor-trace-variance', revision:'<full evidence commit>', pairs:[{a:'docs/evidence/<run-a>', b:'docs/evidence/<run-b>', cases:['concern/case']}]}`. Each pair resolves `meta.json` and `results.jsonl` from that immutable Git commit, not the working tree; that commit must be available locally. `cases` is optional when both runs have identical case manifests, and always selects whole cases, including all their cells and assertions. Both controls must be complete, live, clean, attested vendor-host runs of the same service and runtime/context, without semantic or coverage differences. Methods and maximum absolute count deltas are derived per case/cell/method; repeated scopes take the largest observed pair delta. Do not add handwritten methods or bounds: the fixture schema rejects them.

`diff` applies derived tolerances only to a vendor-host run against a cua-host run of the same service and evidence context (device, profile, runtime release, platform and backend). A host comparison takes no service departures; vendor-against-vendor runs never take host tolerances. The initial M3 fixture reproduces exactly M2's four scoped allowances and seven accepted trace differences.

## Fixture surface

`fixture/serve.mjs` exports `startFixture({port})` for tests and serves on mini port 48732. `/state` GET, `/reset` POST, `/counter` POST (increments once), `/event` POST (appends the body), and `/submit` POST (benchmark forms) make side effects observable independently of service return values. Pages: `/dialogs.html` (`#alert`, `#confirm`, `#prompt`), `/downloads.html` (`#download`), `/chooser.html` (`#file`, `#filename`), `/oopif.html` (`#outer`, cross-site `localhost` iframe), `/frames.html` (three same-process iframes `#first`, `#second`, `#third` on `/frame.html`), `/attributes.html` (`#note` with three attributes, `#secret` a credential-named input with a value), `/popup.html` (`#popup`), `/slow.html` (`#late` after 8 s), `/strict.html` (two `.duplicate` buttons), `/counter.html` (`#post`, `#navigate`, `#value`). `/download` returns a real attachment. `/benchmark/` serves the archive's four fixture pages without modifying them.

The cross-site frame depends on Chrome's site isolation; the harness does not change Chrome flags. Loopback fixture tests exercise HTTP endpoints without Chrome or external networking. The synthetic JPEGs are 64×64 grayscale and RGB images generated solely for hash-decoder tests; the RGB fixture catches multi-component scan parsing.

## Command inventory and corpus (M0 task 2)

`inventory.json` contains the 87 wire types extracted from the pinned vendor's `Rf`, `zN`, and browser capability fallback tables, plus `tab_content_export` (an additional disabled client schema explicitly named by M3). Each row links executable cases, a milestone, a schema source line, and extension reachability. Capability-disabled cases check the actual client member or capability collection; they do not merely skip. The human download-dialog case and authenticated external export successes have explicit exclusions, while those commands retain executable fixture coverage.

Run `node --test test/browser-parity/inventory.test.mjs` with the vendor installed to verify the exact dispatch union and the real service's manifest under a scratch-HOME fake privileged runtime and fake native backend. `CUA_PARITY_VENDOR_MODULE` can point at an installed service explicitly; without an installation those assertions visibly skip. No profile or live Chrome discovery occurs. Own-service assertions visibly skip until `src/browser-service/index.mjs` exists; thereafter the gate infers the latest milestone from the concern files named by the spec, or accepts `CUA_PARITY_MILESTONE=M1a|M1b|M1c|M2|M3` while a later port is incomplete.

The corpus covers normal reads and mutations, locator strictness and slow budgets, frame traversal, DOM and coordinate input, screenshots, navigation/lifecycle, dialog blocking and answering, download/chooser concurrency, clipboard, console, viewport, and unavailable optional capabilities. Four evaluate cases distinguish ordinary POST effects, navigation, reload/context loss, and completion after the caller's budget. They assert fixture counters independently; M1b added the named expected-difference entries (main-world evaluate and the no-replay rule; the 120 s budget, with `evaluate/budget`) rather than weakening these oracles. `reads/zero-budget` pins `timeoutMs: 0` on a locator read (one attempt on both services: the element read when present, the 0 ms sentence at once when not); `reads/frames` reads three same-process frames after a fresh navigation, its cells' `ms` the diagnostic of the injected script's install. `evaluate/attributes` returns attributes from a locator evaluate (a bare attribute, an attribute list, and a credential field's value attribute, which both services leave out). Default local runs still use the task-1 examples because the fake VM is not a Playwright engine; compiling every cell and checking every coverage declaration is part of the inventory test. Only mini runs establish corpus semantics.

The own-service inventory gate requires `src/browser-service/index.mjs` to export `COMMAND_HANDLERS`, a `Map` from wire type to the actual callable handler used by dispatch. It checks registration directly before invoking setup, rather than treating validation/tab errors as evidence of a handler. The registry-removal test retains the removed command's schema. `noop-oracles.test.mjs` executes every mutation/wait case through the real scenario runner against an inert browser double and requires its assertion to fail. Pointer position, HOME→END caret movement, drag endpoints, scroll offset, reload generation, pending URL/load transitions, and elapsed timeout waits are observed rather than replaced by literal success values.

The selective-mutation tests additionally disable viewport reset, each mark, media download, and locator waiting individually while all observations keep working. The lifecycle case creates separate deliverable, handoff and unmarked tabs, completes the primary turn and disconnects it, then uses an observer client to check retention and clean up only URLs carrying the case’s unique nonce. Media and ordinary downloads are verified against the fixture bytes through Node’s filesystem API, after limiting reads to the expected artifact basename (also checked after symlink resolution). Session naming has no browser-client readback, so the fake-native-backend probe verifies the actual `nameSession` request rather than accepting its empty result alone.

Fixture event handlers serialize their POSTs and publish `data-recorded-*` attributes only after successful JSON responses. Cells whose oracles consume those events await a bounded DOM acknowledgment before returning; completing a browser action alone does not await an async page handler. The drag-end acknowledgment also covers the earlier queued drag-start. `fixture-ack.test.mjs` executes real fixture handlers and scenario cells with selectively delayed POSTs, checking both the final independent state oracle and originating-cell boundaries. These acknowledgments do not replace the dedicated pending locator-wait case.

## The capability-host group (M5)

No live host announces the optional capabilities raw CDP (`cdp`), WebMCP (`webmcp`), the auth handoff (`browserAuth`) and history (`history`), so their success paths have their own group, `scenarios/capability-host/`, run against a test backend instead of a Chrome profile:

```
node scripts/browser-parity.mjs run --device local --backend capability-host --service vendor --out /tmp/parity/vendor-cap
node scripts/browser-parity.mjs run --device local --backend capability-host --service cua --out /tmp/parity/cua-cap
node scripts/browser-parity.mjs diff /tmp/parity/vendor-cap /tmp/parity/cua-cap --expected test/browser-parity/expected-differences.json
```

The backend is `capability-host.mjs`: cua's real host (`createHost`) with the fake cua extension behind it, on a backend socket in a scratch home, whose `getInfo` adds those four capabilities and which answers `getUserHistory` from the query it was sent. Its tabs are scripted pages (navigations commit with Chrome's events; the main frame is a secure document on `https://cua-capability.example` registering one WebMCP tool, run in a `node:vm` world as `test/browser-service/support/webmcp-tab.mjs` models Chrome's WebMCP); nothing reaches a network or a Chrome. The run uses the real `cua serve`, runtime and REPL client of this machine in that scratch home (`scripts/browser-parity/capability-home.mjs`: the installed runtime cloned, a cua route record, and the vendor's own raw CDP switch `full_cdp_access_enabled = true` in its browser config, without which the vendor refuses raw CDP whatever the backend announces, and an empty `home/` that is the serve's HOME). The serve's environment is built, not inherited (`localCuaServeCommand`): PATH, TMPDIR, locale and user name from the caller, that HOME, secrets off, and nothing else, so `CUA_BROWSER_BACKENDS`, `BROWSER_USE_*`, XDG directories and the caller's secret store cannot reach the run. The harness selects the host by its instance id, and records `backend: "capability-host"`; the scratch home is removed at the end.

The group runs only on that backend and that backend runs nothing else (its pages have no engine for the ordinary corpus): `selectScenarioPaths` keeps them apart, so a `--device mini` run never includes the group. A case opens its tab with `setup.open: 'goto'` (`browser.tabs.new()` then `tab.goto(page)`), because `cua.createBrowserTab` renders a DOM snapshot. Its cases carry `backend: 'capability-host'` and are the inventory's success-path cases for those rows; the ordinary route keeps its capability-disabled cases beside them. The vendor asks approvals there (origin access, the history read, a WebMCP tool call), which the harness accepts as it does on the mini.

## The bench corpus: scripted benchmark episodes (M5)

`--corpus bench` runs `bench/scenarios/` instead of the parity corpus: MiniWoB episodes of the benchmark task set driven by a fixed rule (`bench/drag-rules.mjs`: the query and the live element rects in, one `tab.cua.drag` path out), with no model in the loop, so a service's outcomes can be told apart from a controller's slips. They are outcome cases on one live device, not differential cases: they are not in the inventory, `diff` is not their oracle (each episode's assertion is: every cell succeeded and the console's `reward: X (raw: 1)` line arrived), and the corpus refuses `--device local` and any `--backend`. Their pages come from the archive benchmark's fixture (`http://127.0.0.1:48731`, as `TASKS.md` has it), which the operator starts on the device for the runs; the harness's own fixture still runs for the case reset. One run is one episode of each task:

```
node scripts/browser-parity.mjs run --device mini --corpus bench --service vendor --out <dir>/vendor/ep-1
node scripts/browser-parity.mjs run --device mini --corpus bench --service cua --out <dir>/cua/ep-1
node scripts/bench-scripted-summary.mjs <dir>
```

`bench-scripted-summary.mjs` prints each episode's raw reward and drag path, each task's pass count per service and the verdict (a cua miss in a task the vendor passes every time is a defect); incomplete or unattested runs and unequal episode counts get no verdict. The M5 evidence is `docs/evidence/2026-10-13-own-browser-service-benchmark/scripted/`.
