# #354 real-engine A/B measurement kit

This is a hosted-only measurement kit, not an engine implementation or shadow reader. The existing `probe-354-fences.yml` workflow builds its selected immutable head(s) with observational AX read-count auditing. Do not run its browser/Swift steps on an owner's Mac. Node offline tests and artifact collection need no browser or engine.

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

## Branch-only Firefox caret diagnostic

`--diagnostic firefox-caret` builds and runs **only builder 3141f170**, with no control arm. Ten repetitions give 60 cases: concealed insertion, equal-selected secret, different-selected secret, public ASCII identical replacement, public ASCII insertion, and a non-ASCII identical replacement. The real trusted wrapper and isolated synthetic HOME are retained. The non-ASCII text is U+0061/U+1D11E/U+D55C: 3 code points, 4 UTF-16 units and 8 UTF-8 bytes; ASCII alone cannot identify units.

Only this mode applies `caret-patch.mjs` in hosted scratch source. It records actual production `AXSelectedTextRange` replies/errors and compare outcomes (**enum names only**, never associated field text). A boundary after the snapshot but before keyed delivery identifies the real pre-typing selection. `caret-before.tsv` preserves it, and tables compare later ranges to both the AX-before location plus typed UTF-16 length and the established DOM location plus that length, each with selection length zero. An unreadable range is not replaced by a guessed range. The synthetic intended length is diagnostic metadata, never added to concealed product wire replies.

Poll rows retain actual query times, time since keyed delivery ended, time relative to the answer, and whether the returned range matches either expected caret. `rangeRead:false` means production did not ask for a range in that compare, not that an API returned zero. Outside-poll reads remain separate. Public changed-value calls may confirm without querying a production caret; their later snapshot still supplies an observation.

**Observer effect:** each guarded compare adds `AXNumberOfCharacters`, explicitly labelled `diagnostic-added`; wrappers add timestamp/serialization cost. This can change timing or confirmation. These observations are never primary-rate evidence. After the answer, a guarded, value-free sidecar records the range/count at approximately +300ms, with actual times. API integers are decimal strings. There are no post-type DOM value samples; field strings, excerpts, messages/stacks and unstructured logs are withheld, even for public controls.

Artifacts begin `probe-354-caret-`. The trusted offline collector is `node scripts/probe-354-fences/offline/caret-table.mjs <caret-artifact-root>`; inspect its branch config coverage, since it renders partial observations rather than certifying a paired gate.

## Branch-only Safari no-key AX path diagnostic

`--diagnostic safari-no-key-ax` runs only builder 3141f170 on a public normal-input fixture. Ten repetitions contain one no-key case and one key-first reference each (20 cases). The input uses the same public 64-hex text, seed, offset and cover state as the failed no-key probes. No calibration/warmup key runs before diagnostic cells. The reference sends Command+A on the same engine connection (the held activation route), verifies its selection effect, and restores the page selection without another key. Safari must remain behind the cover throughout both AX snapshots.

The `safariAXPaths` sidecar records each actual query's value type/reference or AX error, and its times: application/window/main-window/web-area focus paths; the windows list and each window's focus/main flags; bounded front-web-area discovery and focused-node walk; selected text-marker range, its start marker and `AXUIElementForTextMarker` (with up to six ancestors). It records node/depth/time limits, every budget omission, stable within-snapshot element IDs, frontmost evidence from both workspace/window server, and an app-focus re-read after traversal. Field values, selected text, marker strings/bytes, activation and AX writes are not queried or performed.

AXEnhancedUserInterface and AXManualAccessibility values/settable status are read, **not changed**. WebKit enabling enhanced accessibility builds AX objects/caches that writing false does not undo, so a same-process reversible mutation cannot be guaranteed; the skip is explicit. Ordinary AX reads can also prime WebKit accessibility. Every snapshot therefore has an ordinal within its Safari process, and these results cannot be treated as independent cold-start rates or pooled into primary results.

Messaging timeout is 0.5s/element; total AX budget is 5s, plus one bounded after-traversal re-read. Web-area discovery is capped at depth 12/400 nodes/1.5s; focus search at depth 40/800 nodes/1.5s. At most eight windows and 200 children/node are traversed. Raw `safari-ax-rows.jsonl`, `safari-ax-paths.tsv`, `safari-ax-walks.tsv` and `safari-ax-cases.tsv` preserve observations and cost. The collector is `node scripts/probe-354-fences/offline/safari-ax-table.mjs <artifact-root>`; it rejects mixed cohorts/control rows and reports incomplete coverage.

These separate approved diagnostics completed on kit `c7efb2d4`: [Firefox caret, run 44022876278](https://github.com/SSFSKIM/cua/actions/runs/44022876278) (60/60 valid) and [Safari AX, run 44022892172](https://github.com/SSFSKIM/cua/actions/runs/44022892172) (20/20 valid). Their dispatch syntax was:

```sh
gh workflow run 413201833 -R SSFSKIM/cua --ref probe/354-measure \
  -f diagnostic=firefox-caret -f only=firefox-input -f reps=10 -f smoke=false
gh workflow run 413201833 -R SSFSKIM/cua --ref probe/354-measure \
  -f diagnostic=safari-no-key-ax -f only=safari-input -f reps=10 -f smoke=false
```

Offline checks are Node tests/syntax and workflow lint only. Both hosted diagnostics compiled and ran the new Swift successfully. They remain observer-effect evidence, not new primary rates. The background-Firefox secret refusals are the stated expected-unconfirmed limit [#394](https://github.com/SSFSKIM/cua/issues/394), not a confirmation failure to fix by weakening privacy or inventing a caret. This does not exempt any scorable cell from wrong-success or privacy accounting.

## Held settle + Safari comparison

`--diagnostic settle-ab` is a paired measurement cohort, **prepared but not dispatched**. `main` means **before**, builder `3141f1709451ebf77e3b94c5500308d105619f6f`, not the historical 9020bb18 control. `branch` means **after**, the coordinator's final settle + Safari bounded-walk head (rulings 754 and 761). The provisional settle-only head was `1bac401717e99877c34969b44f8e73952691b6f3`; it is not the launch pin. `SETTLE_AFTER_REF` stays empty until the coordinator supplies the final immutable SHA. The plan job refuses an empty/unpinned reference before creating any macOS job. The ordinary `MAIN_REF`/`BRANCH_REF` pins remain unchanged for the old cohorts and two diagnostics.

Scope at 20 repetitions is **1480 scored attempts/head, 2960 total**:
- All 12 browser/editor shards: Cmd+A/Z/V race cells and clean 30/120/500-character cells, 20 each (120/head/shard; 1440/head core).
- Safari input additionally: 20 plain and 20 trusted-secret no-key cells/head, using the existing synthetic-HOME service and independently checked final field. No key is sent between their own setup and typing. They run after that shard's race/clean cells.

Historical cell identities, counterbalanced arm order, separate key-only calibration, 500ms clean-key settle, and 0/250/1000/3000ms DOM samples are retained. Neither observer patch nor the Safari AX path operation runs in this measurement. Keep this comparison separate from both the historical control pool and the observer diagnostics.

`settle-rates.tsv` reports false-unconfirmed numerators (`typeUnconfirmed` with a correct final field) over **all valid trials**, per browser/arm/part, with the conditional fraction among refusals beside it. Each complete browser has 240 race and 240 clean trials/head. `settle-rates-cells.tsv` retains editor/key/length strata. Wrong successes and privacy are counted across **every cell**, including both Safari no-key forms; `settle-safety.tsv`, the ordinary `privacy.tsv`, and `no-key-confirmation.tsv` preserve those outcomes separately. Any background-Firefox secret refusal, if present in a later expansion, is labelled expected-unconfirmed under #394; no such Firefox secret cell is in this grid.

Cost is informational. `settle-cost.tsv`, `settle-cost-ab.tsv`, `settle-paired.tsv` and `settle-observations.tsv` preserve actual call latency and plain `typeReadback.snapshotMs`, `settleReads`, and `settleCapped`, with p50/p95 and matched before/after deltas. **One `settleReads` is one additional completed value/range pair after the first**, the ordinary two-agree case. Its 15ms multiple is only a programmed-wait lower bound: an early guard exit can sleep without incrementing the count, AX work also costs time, and there is no dedicated settle-only timer. Snapshot-time differences are a proxy; total-call differences also include delivery and avoided/added readback polling. Absent baseline telemetry stays unavailable, never a made-up zero duration. Safari no-key diagnostics have their own outcome/cost tables. The collector certifies both actual configs/plans; the report's own coverage table is informational.

Only after the coordinator confirms the final head and the quoted `SETTLE_AFTER_REF` is published, the prepared launch syntax is:

```sh
gh workflow run 413201833 -R SSFSKIM/cua --ref probe/354-measure \
  -f diagnostic=settle-ab -f only=all -f reps=20 -f smoke=false
```

Artifacts begin `probe-354-settle-`. Collect them separately with:

```sh
node scripts/probe-354-fences/offline/ab-table.mjs <artifact-root> --only all --cohort settle-ab
```

## Follow-up measurement cohort (completed as run 44001080688)

`--diagnostic followup` (workflow input `diagnostic=followup`) selects a separate measurement cohort for builder **3141f170**. Its artifacts are named `probe-354-followup-<shard>` and are collected separately. The control remains **9020bb18**, so matching control cells can be combined with the primary run's control results; do not pool different branch heads or observer-effect caret measurements. The collector continues to reject mixed raw cohorts. The default stays `primary`, whose plan, requests, scratch builds and startup are unchanged; the isolated Firefox caret mode is untouched.

**Builder `3141f1709451ebf77e3b94c5500308d105619f6f` is pinned in `BRANCH_REF`; `MAIN_REF` remains `9020bb18acb9091f817a4b648f7c332174b11153`.** Run 44001080688 collected the complete 2536-attempt follow-up; a repeat still needs the coordinator's instruction. The workflow remains dispatch-only (no push trigger).

Scope is ten shards, each head with its own expected plan (20 repetitions per head; smoke uses one):

| shard | scope | cells per head |
| --- | --- | --- |
| `cft-contenteditable`, `cft-compose`, `firefox-textarea`, `firefox-input`, `firefox-contenteditable`, `firefox-compose` | the full existing plan, which never ran in the primary run | 201, 121, 221, 301, 161, 121 |
| `safari-textarea` | the existing ending-Return (`ending-return/textarea/spike/<rep>`) and multiline-text (`multiline/textarea/spike/<rep>`) controls, 20 repetitions each, expected `confirmed` (Return is text in a textarea) | 40 |
| `cft-textarea` | the same 40 text controls, then the four Unicode-cap attempts the fixture's UTF-8 bug invalidated: `truncation/textarea/unicode-cap/<rep>`, branch reps 1, 4 and 7, control rep 7; the caps run last so an early abort cannot cost the controls | branch 43, main 41 |
| `safari-input` | plain no-key `no-key/input/plain/<rep>` and the existing trusted-secret `secret/input/equality/<rep>`, alternating within and across repetitions | 40 |
| `safari-contenteditable` | the existing `ending-return/contenteditable/spike/<rep>` cells with their independent per-head foreground DOM and AX reference | 20 |

That is 1267 control and 1269 branch cells at 20 repetitions (2536 both heads), or 142 for a one-repetition smoke. Historical cell ids and repetition numbers are kept, so each retry is the cell it replaces; only the plain no-key cell is new. The text controls scale with `--reps`; the cap attempts are a fixed list, independent of it. Their cause is fixed in the fixture, which now decodes each `/answer` body once as UTF-8 instead of per chunk, so a code point split across HTTP chunks keeps its exact text (regression test in `kit.test.mjs`).

**No-key** means no `press_key` between setup and `type_text`. The plain cell types 64 hex characters (the secret's length and alphabet) into the default seed at offset 3. The secret cell is the existing equality cell, which already presses no key and goes through the actual trusted wrapper with its isolated temporary HOME and the pinned `--source` tree. In the Safari no-key scope only, the other secret variants (mismatch, trailing returns, selections) are not included; the full missing-shard plans, including the Firefox input shard's, are unchanged and keep them.

A partial plan cannot break startup: the warmup is a clean 30-character cell derived from the shard, not looked up in the plan, and only keys that the plan's cells and the warmup press are calibrated (all three for the full shards, as before). Foreground references are acquired for exactly the plan's rendered-text cells.

Every artifact and row records `cohort`. The collector takes `--cohort primary|followup` (default `primary`) and checks each head against that cohort's own expected plan, so the control's one cap attempt and the branch's three are each validated; an artifact or row naming another cohort is rejected before any table is written. `--only all` demands all ten shards, and a partial download is `INCOMPLETE` with the missing cells listed, never certified:

```sh
node scripts/probe-354-fences/offline/ab-table.mjs <artifact-root> --only all --cohort followup
```

Plain no-key cells appear in `rates.tsv`, `diagnostics.tsv` (expected `confirmed`) and a new `no-key-confirmation.tsv`, which puts plain beside the trusted-secret equality cells with the same counts and every actual refusal reason. The secret no-key cells keep their `privacy.tsv` audit rows; the plain cell is a public field with nothing to audit. A plain success with a wrong final value is a wrong success like any other cell. No cost table is added for these cells; per-cell timings stay in `rows.jsonl`.

Repeat syntax, **only if** the coordinator requests another follow-up measurement:

```sh
gh workflow run 413201833 -R SSFSKIM/cua --ref probe/354-measure \
  -f diagnostic=followup -f only=all -f reps=20 -f smoke=false
```

Add `-f only=<shard,...>` to run a subset, or `-f reps=1 -f smoke=true` for a labelled smoke.

## Offline collection

Run the trusted checkout's `offline/ab-table.mjs <artifact-root> --only all` for a full download, or specify the selected browser-editor shard IDs. Without `--only`, scope is explicitly the observed shards. Final collection checks both arms, configs/coverage and expected cell identities. Missing/incomplete evidence exits nonzero while preserving partial tables. Incremental per-cell tables remain available. One cohort per collection: `--cohort followup` for the follow-up cohort (above); artifacts written before cohorts existed are primary.

`summary.json` and `oracle-warnings.tsv` identify rendered cells without usable foreground/post-type AX evidence. Rescoring never invents AX values from an acknowledgement or from HTML. Existing raw rows, reference records, engine logs and both timing paths are retained as evidence.
