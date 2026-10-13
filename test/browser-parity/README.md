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

`prepare` checks the clean parity clone out at the SHA, installs dependencies, binds only if the profile is not ready, checks fixture startup, then stops that check's fixture. It saves machine preparation under ignored `.doperpowers/sde/browser-parity/<device>.json`. Each `run` owns a fixture process, SSH forwarding pipe, trace activation and MCP processes; all stop at its end. It never changes the resident checkout or agent. A preexisting trace activation is refused, not overwritten. `meta.json` records commit, profile, service environment, attestation and accepted elicitation count/details (action and time, not approval text). `complete: false` cannot be diffed.

Each connection checks `# Selected Browser` in the selection/documentation response and the presence/absence of `cua browser service <version>`. The vendor header is a standalone line (readable build 26.928.40906 BS:65410); the cua marker is checked in the documentation, not assumed to be on that line. Vendor-versus-vendor diffs refuse an allowance file. Other comparisons use `--expected test/browser-parity/expected-differences.json` explicitly.

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
- Each case resets `/state` to `{counter:0, events:[], ...setup.state}`, opens a **fresh MCP connection**, selects the prepared profile, calls `browser.nameSession(id)`, and creates `tab` on `setup.page`. Setup failures produce a failed case assertion, never a silently missing case.
- The persistent REPL globals are `browser`, `tab`, `fixtureURL` (the browser's loopback origin), and globals the case itself sets. A `code` string is an **async-function body**: use `return` to record its value; use `globalThis.foo = ...` to persist a binding. Default outer cell budget is 60 s, overridden by `timeoutMs`. Locator/evaluate timeouts are still passed by the cell to those APIs.
- `{label, code, start:true}` starts an async promise **inside the REPL**, stores an error-or-value envelope and immediately returns `{started:label}`. `{label, join:'earlier-label'}` awaits it. This matters because `cua serve` serializes MCP `js` calls: starting another MCP request would not arm a concurrent wait. The trigger cell runs between start and join. Every start must be joined unless the case deliberately drops the connection.
- `{label, op:'endTask'}` calls MCP `end_task`; `{label, op:'drop'}` drops that connection. Descriptor factories `start(cell)`, `join(label, handle)`, `endTask(label)`, `drop(label)` are exported from `scripts/browser-parity/scenario.mjs`. They run in the scenario module, not inside browser code.
- Optional `client:'second'` selects another independently initialized/attested MCP connection to the same profile, with its own browser/tab globals. The first such cell sets it up lazily. Subsequent cells use the named connection; omitted `client` means primary. A dropped client cannot be reused. This supports ownership/two-client scenarios on the live host; local fake runtimes do not share host state.
- The runner catches cell failures as `{ok:false,error:{code,message}}`. Assertions also receive `service` (`vendor` or `cua`) for service-specific expected behavior. Assertions receive **raw** `{cell,ok,value|error}` rows and the final `/state`; they must decide expected errors, exact success values and mutation effects independently of the other service. Missing code defaults are not a substitute for assertions. A returned `{ok:false}` or a thrown assertion fails `run`, as does failed lifecycle cleanup. All still-live clients get `end_task` before closing.
- A case-level `skip:'explicit capability/human reason'` writes an assertion row with that reason. It is not a substitute for an executable disabled-capability assertion where the inventory requires one.

## Values, timing and trace

`results.jsonl` holds one cell row `{case,cell,ok,value|error,ms,trace}` and one `{case,assertion}` row. End-task values retain the structured status. `ms` is elapsed host time and does not participate in semantic comparison. `host-trace.jsonl` is diagnostic; missing or empty per-cell traces mean **unavailable**, never a zero-call discrepancy (the mini's resident host lacks tracing until M5).

Known `tabId`, `browser_id`, session, turn, frame, target and request ID fields normalize by first observation. Timestamp fields normalize; arbitrary `id` and every text/snapshot remain exact. For API-specific schemas use cell `normalize:{ids:{'0.id':'tab'}, masks:['volatileField']}`; paths are dot-separated array/object paths. Project a created object's ID in its creation cell so the mapping follows creation order. Masks are explicit corpus decisions, not a blanket removal of random-looking text.

Binary cell results travel as MCP image blocks (not large JSON arrays subject to text-output truncation). Screenshots returned as `Uint8Array`, `Buffer`, MCP `{type:'image',data,mimeType}` values, or PNG/JPEG data URLs normalize to `{ $image:'ahash64', width, height, hash }`. JPEG luminance DCs and decoded noninterlaced 8-bit PNG pixels produce a 64-bit average hash; dimensions remain exact. Unsupported encodings fail rather than silently using a byte hash. Set case `screenshotTolerance: 4` (or another explicit 0–64 bit allowance); default is exact hash equality. Do not stringify screenshot bytes yourself.

Trace comparison counts CDP methods as a multiset, ignoring event order/IDs/timing. Optional case `pollingAllowance:{'Runtime.callFunctionOn':3, 'DOM.*':2, 'Page.getLayoutMetrics':1}` allows only bounded count differences for those polling methods. Non-polling methods cannot receive allowances. The allowance declarations must agree between runs.

An expected-difference entry is `{cases:['concern/case'], cells:['label'], kind:'semantic'|'trace', reason:'why'}`. It cannot waive cardinality, invalid evidence, changed comparison settings or a failing assertion. Keep entries narrowly scoped. `expected-differences.json` starts empty.

## Fixture surface

`fixture/serve.mjs` exports `startFixture({port})` for tests and serves on mini port 48732. `/state` GET, `/reset` POST, `/counter` POST (increments once), `/event` POST (appends the body), and `/submit` POST (benchmark forms) make side effects observable independently of service return values. Pages: `/dialogs.html` (`#alert`, `#confirm`, `#prompt`), `/downloads.html` (`#download`), `/chooser.html` (`#file`, `#filename`), `/oopif.html` (`#outer`, cross-site `localhost` iframe), `/popup.html` (`#popup`), `/slow.html` (`#late` after 8 s), `/strict.html` (two `.duplicate` buttons), `/counter.html` (`#post`, `#navigate`, `#value`). `/download` returns a real attachment. `/benchmark/` serves the archive's four fixture pages without modifying them.

The cross-site frame depends on Chrome's site isolation; the harness does not change Chrome flags. Loopback fixture tests exercise HTTP endpoints without Chrome or external networking. The synthetic JPEG is a 64×64 image with light top/dark bottom, generated solely for the hash decoder test.
