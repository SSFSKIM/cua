# #354 real-engine A/B measurement kit

This is a hosted-only measurement kit, not an engine implementation or shadow reader. The existing `probe-354-fences.yml` workflow builds both immutable heads with observational AX read-count auditing. Do not run its browser/Swift steps on an owner's Mac. Node offline tests and artifact collection need no browser or engine.

## Denominators and leaving keys

Full runs retain **20 repetitions for every race/clean rate cell**; smoke uses one. Other diagnostics are separate groups. **Tab has n=1 per browser/editor/head and is the final cell**, including after password/secret diagnostics. Its leaving-key effect can disturb native focus despite DOM focus, so subsequent measurements must not follow it. There is no focus-recovery adapter or replay of measured typing. Return/multiline and other non-Tab diagnostic repetitions remain unchanged.

After Tab's timed samples, `afterTabFocus` records DOM active-element identity/labels and AX focus role/subrole/title/description without values or focus movement. It does not infer where focus went from an unrelated engine refusal.

## Public rendered-text oracle

Contenteditable trailing Return and multiline cells require a **foreground reference for each browser/editor/head and public text variant**, before measured cells. The reference uses the same actual `type_text` request and route with the browser verified frontmost before and after typing. Its separate `foreground-references.jsonl` record contains setup, route, raw reply, timed DOM samples and post-type AX evidence. References do not enter rate denominators and are not retried.

A usable reference must have the intended editor-semantic text in the DOM and a readable public AX value. That observed AX value is the AX oracle; it need not have the same literal newline representation as the DOM editing string. A measured cell must use the same route, and its DOM text/HTML structure and post-type AX value are compared to that reference **independently of the engine acknowledgement**. A successful reply with AX different from reference is a wrong success. A DOM-only structural disagreement while AX matches is an oracle warning, not proof of a false success. Missing/unreadable AX, a mismatched reference, or route disagreement likewise makes the cell **unscorable**, never pass.

The DOM editing-text helper only removes one layout-only newline when a terminal empty `DIV`/`P` contains exactly one placeholder `BR` through optional `SPAN` wrappers. It preserves repeated real line breaks and non-placeholder content; it does not serialize arbitrary HTML, move selection, or modify browser behavior. Raw `innerText`, `textContent` (`domText`) and HTML remain beside the normalized editing text. This normalization alone is not a correctness oracle: foreground DOM **and AX** evidence is mandatory.

`side.swift` permits public-value evidence only for the explicit public-rendered lane. It reads focus, role and subrole before values, rejects secure/unreadable classifications, and treats an explicitly absent subrole as absent rather than an error. No value-evidence operation runs in secret, password or canvas lanes. The terminal-Tab operation reads labels only.

The first CFT contenteditable smoke, run **42862198211**, captured the terminal-placeholder shape but no post-type AX/reference values. Its rendered cells remain **oracle-warning diagnostics**, not established false successes or passes. Offline rescoring preserves its original rows and marks those cells unscorable; only a rerun can supply the missing live evidence.

## Concealed diagnostics

Synthetic secrets live only in a fresh temporary HOME. Equal/different selected-text fixtures have identical selection lengths; their seeds/ranges are private in-memory preparation, never plan-row fields. Private state and error details are sanitized in `finally`, including failed setup. Fixture teardown cannot expose an outgoing private editor under the next cell's public policy.

The one-/three-trailing-CR pair and equal-/different-selection pair must each have identical raw `typeReadback` records **except `snapshotMs` only**. No other field is excluded. Boolean `keysUnconfirmed` is allowed; numeric counts and checkpoints are privacy failures. Raw snapshot timings remain intact.

`secret-pairs.tsv` exposes per-repetition comparisons. `secret-pair-latency.tsv` places engine socket RTT (measured inside the trusted native client), end-to-end trusted-call duration, and snapshot timing side by side with n/p50/p95. **Latency is informational, with no threshold or statistical gate.** `secret-confirmation.tsv` reuses existing normal-input secret/equality trials: valid counts, success/confirmation, honest `typeUnconfirmed`, final-field matches, other errors, invalid cells and actual refusal reasons. A refusal is not called a wrong success merely because the final field matches.

## Isolated Firefox caret cohort (offline-prepared; permission held)

`--diagnostic firefox-caret` is a separate observer-effect cohort. The default is `primary`: its plan, requests and audit-only scratch build remain unchanged. The diagnostic matrix is restricted to Firefox/input and runs one owned engine per head with the same fixture and real trusted secret wrapper/temp HOME. No new push trigger is present. The pinned source refs remain 9020bb18/bd63a0cc.

Each repetition has six cases: normal concealed insertion, equal-selected secret, different-selected secret, public ASCII identical replacement, public ASCII insertion, and a short public non-ASCII identical replacement. The non-ASCII control's code points are U+0061/U+1D11E/U+D55C: 3 code points, 4 UTF-16 units and 8 UTF-8 bytes, with those known end-offset candidates recorded. ASCII observations alone cannot identify units. No automatic unit or caret-timing conclusion is made; the real route is retained, so a different route is not silently treated as equivalent.

Only this mode applies `caret-patch.mjs` after the ordinary observational audit in hosted scratch source. Interposed single/batch AX boundaries record actual `AXSelectedTextRange` replies, API/embedded errors, timestamps and CFRange shape. A tightly anchored hook identifies production compare calls after their existing role/subrole guards, and serializes **enum case names only**, never a case's associated text. `rangeRead: false` means no range query occurred in that compare; a queried-but-missing/unsupported range has a distinct API error/shape. Reads outside a tagged compare are retained separately, not assigned an invented poll. Main has no TypeReadback hook and reports zero production readback polls rather than a simulated reader.

**Observer effect:** each traced, production-guarded compare adds an `AXNumberOfCharacters` query before the original compare. This is labelled `diagnostic-added`, not a production request; production does not query it. It may change poll timing, the number of polls or even confirmation. Wrappers also add timestamp/serialization overhead. These results must never be pooled into primary rates or cost. No primary calls acquire the trace flag or these added probes.

After the actual engine reply, a value-free sidecar snapshot requests range/count at approximately 300ms. It rechecks role/subrole, refuses secure fields, never queries AXValue, and records each query's timestamps/error plus actual delay. If guards prevent a read, only that guard result is reported—there is no invented range/count. API integers are decimal strings to retain CFIndex precision. Missing values and nonstandard types remain explicit. There are no post-type DOM samples in this cohort.

`caret-rows.jsonl` retains the real RPC result/error/meta and safe trace packet, with field-text strings, excerpts, messages/stacks and unstructured logs withheld. This also applies to public controls. `caret-cases.tsv`, `caret-polls.tsv`, `caret-outside.tsv` and `caret-final.tsv` expose the observations; the diagnostic writer emits no primary `rates.tsv` or `cost.tsv`. Its separate collector accepts only `caret-rows.jsonl`. Separate artifact names begin `probe-354-caret-`.

Prepared launch syntax **only after owner permission and a verified committed diagnostic ref**; this has not been executed:

```sh
gh workflow run probe-354-fences.yml --ref <verified-diagnostic-kit-ref> \
  -f diagnostic=firefox-caret -f only=firefox-input -f reps=1 -f smoke=true
```

Until permission is granted, use only Node offline tests/lint. Swift compilation and all AX/browser behavior remain unverified for this new instrumentation. Offline artifact collection, from the trusted checkout, is `node scripts/probe-354-fences/offline/caret-table.mjs <caret-artifact-root>`; it never consumes primary rows. The collector renders available diagnostic observations, not a paired-coverage certification: check each arm's `config.json` coverage before drawing a comparison.

## Offline collection

Run the trusted checkout's `offline/ab-table.mjs <artifact-root> --only all` for a full download, or specify the selected browser-editor shard IDs. Without `--only`, scope is explicitly the observed shards. Final collection checks both arms, configs/coverage and expected cell identities. Missing/incomplete evidence exits nonzero while preserving partial tables. Incremental per-cell tables remain available.

`summary.json` and `oracle-warnings.tsv` identify rendered cells without usable foreground/post-type AX evidence. Rescoring never invents AX values from an acknowledgement or from HTML. Existing raw rows, reference records, engine logs and both timing paths are retained as evidence.
