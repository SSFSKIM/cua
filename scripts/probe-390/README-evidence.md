# #390: background value writes confirm without a focus hold (hosted, 2026-11-17)

**The final fix `e417be4a2dd5b49f778b6705c4de2472afb7c4dd` meets the ticket's check:** ordinary background set_value confirms **20/20 in Chrome for Testing, 20/20 in default Electron, and 20/20 in MAWS-chrome-parity Electron, with zero false ok**. Every successful response has `unfocusedValue.result=confirmed` and a positive read count, and DOM and React match at every recorded checkpoint.

All 144 executed fix actions pass their cell's checks. The full run is **not a clean green workflow**: one ancillary long-value trial failed setup before any observation, engine launch or action, and the default-Electron main baseline behaves differently from the predeclared refusal expectation. Both facts are retained below. The primary 60-action fix denominator is complete; no failed attempt was silently retried or replaced.

## Runs and reproducibility

Both runs use the same reviewed kit `cf4e68e538dcd55490eac7c349b50d51ef39840b` on `probe/390-qual`, forked from `probe/366-measure` at `fc3b8495c637fbf26d24b6dcfcf0eb6d086faaba`. Engines are unmodified release builds in separate scratch worktrees; the workflow checks both source trees are clean. Main is pinned at `290303c131c20e4dc88001b8b970d03785ec0b1d`. The original candidate `c236f268` and intermediate `2532a1b5` were not run: independent source review found edge cases, and the coordinator supplied the final reviewed head before registration.

| Run | Planned / executed actions | Fix checks | Workflow result |
|---|---:|---|---|
| [Smoke 44193384552](https://github.com/SSFSKIM/cua/actions/runs/44193384552) | 40 / 40 | 20/20 pass | Red only on five default-Electron main background cells whose actual route delivers instead of refusing |
| [Full 44196181432](https://github.com/SSFSKIM/cua/actions/runs/44196181432) | 290 / 289 | 144/144 executed pass; one setup-invalid ancillary long trial | CfT, parity Electron and Safari jobs green; default Electron red on baseline expectations and the retained invalid setup |

The kit's initial medium review found a reader that judged only the final DOM checkpoint. Fix wave `b04e6b1c` plus `e0256260` fixed this and added the exact-cap guard; the closing medium review was correct with no material findings before registration. A reporting-only follow-up, reader `f5382f47`, distinguishes an absent RPC from `ok` and missing native evidence from an observed activation. It does not change answered-row scoring or the original workflow conclusions. Its 15 reader tests pass (21 tests with the inherited socket-startup tests).

Artifacts are named `probe-390-<browser>-smoke` or `probe-390-<browser>-full`, for browsers `cft`, `electron`, `electron-parity`, and `safari`. They contain raw `rows.jsonl`, configuration, original summaries/coverage and owned fixture/engine logs, never browser profiles or temporary secret homes. Full artifacts expire on 2027-02-15. Keep smoke and full separate; do not pool their counts or browser versions.

| Fixture | Smoke image / version | Full image / version |
|---|---|---|
| Chrome for Testing | `20261112.0504.1`, 157.0.8103.78 | `20261102.0473.1`, 156.0.8078.80 |
| Default Electron | `20261112.0504.1`, Electron 44.4.5 / Chromium 152.0.7977.130 | Same |
| MAWS-chrome-parity Electron | `20261112.0504.1`, Electron 44.4.5 / Chromium 152.0.7977.130 | Same |
| Safari | `20261112.0504.1`, 27.2 | `20261102.0473.1`, 27.2 |

Every job reports macOS 26.7.2. In particular, the full 20-repeat CfT claim is for **156**, not smoke's 157. Main and fix remain paired within the same browser process/job.

Use the trusted checkout's reader against downloaded artifacts as data, not code from an artifact directory:

```sh
node /absolute/trusted/checkout/scripts/probe-390/read.mjs /absolute/artifact/browser
```

Use reader `f5382f47` or later for the setup-invalid row. The original full default-Electron summary mistakenly included that no-RPC row under `ok` and counted absent native state as activation; the raw row has neither an RPC nor native samples. Corrected accounting is `noAnswer: 1`, native state unknown. Do not change the original run's red conclusion.

## What is judged

An ordinary controlled React text field is reset empty with a button, not the field, focused. Background cells then put the target behind a full-display owned cover. A real background observation produces the ordinary element token. Each action uses a fresh engine and temporary HOME; main/fix order alternates by repetition. Each browser job reuses its owned fixture process/profile, so these are not twenty cold app launches.

The page independently reports DOM value and React state, its active element and document focus, plus captured focus, blur, pointer, key, input and change events. Ownership is checked by page id, performance time origin and trial. The planned 0/50/250/1000-ms post-RPC checkpoint set must be complete and uniquely owned. An `ok` is false if either DOM or React disagrees at any recorded checkpoint, even if the final value converges. Explicitly unconfirmed errors may deliver after the first checkpoint; their final value is judged separately.

The uppercase guard transforms on input synchronously. The long cell writes more than 12,000 characters. The exact-cap guard writes exactly 10,000 characters and synchronously appends `::cap-suffix` on input, so a capped AX read could otherwise look equal while the page holds more. Both cap cells must return valueUnconfirmed / possiblyTruncated, never ok.

**All numeric triples below are p50 / p95 / max.** RPC and read-back times are milliseconds. `reads` is the engine's actual read-back count, not an inferred count. `—` means the meta is absent on that unchanged path, not zero reads. Judge outcomes require DOM **and** React; guard/suffix rows intentionally do not equal the original request.

## Full fix results — e417be4a

| App | Cell | Executed / planned | Answer; DOM/React judge | `unfocusedValue.result` | Reads | Read-back ms | RPC ms |
|---|---|---:|---|---|---|---|---|
| CfT | Background ordinary | 20/20 | ok; 20 exact at every checkpoint | confirmed | 3 / 3 / 4 | 31.7 / 50.7 / 93.6 | 39 / 66 / 127 |
| CfT | Uppercase guard | 5/5 | valueUnconfirmed; 5 uppercase | mismatch | 57 / 61 / 61 | 1008.2 / 1021 / 1021 | 1019 / 1032 / 1032 |
| CfT | >12k value | 5/5 | valueUnconfirmed; 5 full values | possiblyTruncated | 59 / 63 / 63 | 1007.8 / 1016.1 / 1016.1 | 1017 / 1027 / 1027 |
| CfT | Exactly 10k + suffix | 5/5 | valueUnconfirmed; 5 request-plus-suffix | possiblyTruncated | 57 / 64 / 64 | 1011.2 / 1019.3 / 1019.3 | 1020 / 1030 / 1030 |
| CfT | Secret placeholder | 5/5 | valueUnconfirmed; 5 delivered | concealed | 0 / 0 / 0 | 0 / 0 / 0 | 8 / 9 / 9 |
| CfT | Foreground control | 5/5 | ok; 5 exact at every checkpoint | — | — | — | 248 / 264 / 264 |
| Default Electron | Background ordinary | 20/20 | ok; 20 exact at every checkpoint | confirmed | 3 / 3 / 3 | 30.7 / 46.9 / 48.8 | 49 / 58 / 65 |
| Default Electron | Uppercase guard | 5/5 | valueUnconfirmed; 5 uppercase | mismatch | 52 / 58 / 58 | 1003.6 / 1007.9 / 1007.9 | 1021 / 1023 / 1023 |
| Default Electron | >12k value | **4/5** | valueUnconfirmed; 4 full values; 1 not dispatched | possiblyTruncated (4) | 52 / 59 / 59 | 999.5 / 1016.4 / 1016.4 | 1020 / 1028 / 1028 |
| Default Electron | Exactly 10k + suffix | 5/5 | valueUnconfirmed; 5 request-plus-suffix | possiblyTruncated | 54 / 60 / 60 | 997.5 / 1014.3 / 1014.3 | 1019 / 1085 / 1085 |
| Default Electron | Secret placeholder | 5/5 | valueUnconfirmed; 5 delivered | concealed | 0 / 0 / 0 | 0 / 0 / 0 | 14 / 20 / 20 |
| Default Electron | Foreground control | 5/5 | ok; 5 exact at every checkpoint | — | — | — | 279 / 305 / 305 |
| Parity Electron | Background ordinary | 20/20 | ok; 20 exact at every checkpoint | confirmed | 2 / 3 / 3 | 28.3 / 43.9 / 45.8 | 37 / 52 / 53 |
| Parity Electron | Uppercase guard | 5/5 | valueUnconfirmed; 5 uppercase | mismatch | 57 / 63 / 63 | 1011 / 1019.4 / 1019.4 | 1018 / 1030 / 1030 |
| Parity Electron | >12k value | 5/5 | valueUnconfirmed; 5 full values | possiblyTruncated | 58 / 70 / 70 | 1006.9 / 1019.6 / 1019.6 | 1017 / 1030 / 1030 |
| Parity Electron | Exactly 10k + suffix | 5/5 | valueUnconfirmed; 5 request-plus-suffix | possiblyTruncated | 57 / 77 / 77 | 1008.7 / 1010.8 / 1010.8 | 1018 / 1021 / 1021 |
| Parity Electron | Secret placeholder | 5/5 | valueUnconfirmed; 5 delivered | concealed | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 18 / 18 |
| Parity Electron | Foreground control | 5/5 | ok; 5 exact at every checkpoint | — | — | — | 191 / 206 / 206 |
| Safari | Background control | 5/5 | ok; 5 exact at every checkpoint | — | — | — | 180 / 195 / 195 |
| Safari | Foreground control | 5/5 | ok; 5 exact at every checkpoint | — | — | — | 27 / 109 / 109 |

False ok is **0** in every cell. All 15 uppercase guards and all 15 exact-cap/suffix guards answer valueUnconfirmed. The long guard has 14/14 executed correct answers plus one setup-invalid attempt, not 15/15 executions.

## Full main results — 290303c1

Main has no `unfocusedValue` meta in any cell. It is not assumed to have done zero AX reads; that record does not exist there.

| App | Cell | Executed / planned | Answer | DOM/React judge | RPC ms |
|---|---|---:|---|---|---|
| CfT | Background ordinary | 20/20 | backgroundClickRefused | 20 empty, nothing written | 141 / 165 / 223 |
| CfT | Uppercase guard | 5/5 | backgroundClickRefused | 5 empty | 121 / 154 / 154 |
| CfT | >12k value | 5/5 | backgroundClickRefused | 5 empty | 114 / 175 / 175 |
| CfT | Exactly 10k + suffix | 5/5 | backgroundClickRefused | 5 empty | 142 / 170 / 170 |
| CfT | Secret placeholder | 5/5 | backgroundClickRefused | 5 empty | 131 / 163 / 163 |
| CfT | Foreground control | 5/5 | ok | 5 exact at every checkpoint | 199 / 584 / 584 |
| Default Electron | Background ordinary | 20/20 | ok | 20 exact at every checkpoint | 478 / 552 / 671 |
| Default Electron | Uppercase guard | 5/5 | valueUnconfirmed | 5 uppercase | 704 / 1078 / 1078 |
| Default Electron | >12k value | 5/5 | ok | 5 full values | 578 / 652 / 652 |
| Default Electron | Exactly 10k + suffix | 5/5 | valueUnconfirmed | 5 request-plus-suffix | 701 / 733 / 733 |
| Default Electron | Secret placeholder | 5/5 | ok | 5 delivered | 542 / 564 / 564 |
| Default Electron | Foreground control | 5/5 | ok | 5 exact at every checkpoint | 219 / 271 / 271 |
| Parity Electron | Background ordinary | 20/20 | backgroundClickRefused | 20 empty, nothing written | 140 / 164 / 183 |
| Parity Electron | Uppercase guard | 5/5 | backgroundClickRefused | 5 empty | 139 / 160 / 160 |
| Parity Electron | >12k value | 5/5 | backgroundClickRefused | 5 empty | 128 / 153 / 153 |
| Parity Electron | Exactly 10k + suffix | 5/5 | backgroundClickRefused | 5 empty | 141 / 167 / 167 |
| Parity Electron | Secret placeholder | 5/5 | backgroundClickRefused | 5 empty | 133 / 160 / 160 |
| Parity Electron | Foreground control | 5/5 | ok | 5 exact at every checkpoint | 227 / 237 / 237 |
| Safari | Background control | 5/5 | ok | 5 exact at every checkpoint | 175 / 946 / 946 |
| Safari | Foreground control | 5/5 | ok | 5 exact at every checkpoint | 31 / 63 / 63 |

False ok is also **0** on main. The default-Electron background cells violate the predeclared *refusal* expectation, not ground-truth correctness: main's route-3 activation point is posted, its fallback produces page pointer events targeting the search field, and the write delivers. CfT/parity main instead record `activationClick=outsideFrame`, route 3 and `startedAt=null`, then refuse. This fixture/chrome boundary disproves a universal main-refuses premise; it is not hidden by changing the fixture or expected result after seeing the run.

## Side effects

### All executed Chromium-family background cells, grouped by head

Counts below are trials with the effect, not the total number of individual events. Fix's default-Electron denominator is 39 rather than 40 because of the separate setup-invalid long trial.

| App / head | Executed | Input/handler/change rows | Focus or blur rows | Pointer / key rows | Native activation | CG-sampled raise | Native-meta transient raise |
|---|---:|---:|---:|---:|---:|---:|---:|
| CfT / fix | 40 | 40 | 0 | 0 / 0 | 0 | 0 | 0 |
| Default Electron / fix | 39 | 39 | 0 | 0 / 0 | 0 | 0 | 0 |
| Parity Electron / fix | 40 | 40 | 0 | 0 / 0 | 0 | 0 | 0 |
| CfT / main | 40 | 0 | 40 | 0 / 0 | 0 | 0 | 0 |
| Default Electron / main | 40 | 40 | 40 | 40 / 0 | 0 | 36 | 40 |
| Parity Electron / main | 40 | 0 | 40 | 0 / 0 | 0 | 0 | 0 |

Every one of the **119 executed new-path trials** records exactly the page event sequence `input`, `search.handler`, `change`. The active element changes from the button to the search field in 119/119, and `document.hasFocus()` remains false at every checkpoint. **The expected focus event is not observed**: the page sees no focus, focusin, blur, focusout or window.focus event on this new background path. AXFocused's logical effect must not be presented as an observed DOM focus event.

All 119 new-path engine replies record route 1 and no activationClick meta. Across their 4,082 native poll/checkpoint samples, the cover stays frontmost and the target stays below it; no activation or raise is observed. Main's default-titlebar Electron path posts page pointer events and has guarded transient raises: CG sampling sees 36/40, while the engine's own delivery meta records 40/40. The difference demonstrates the sampling limit rather than four proven no-raise trials.

Foreground controls are functionally unchanged on both heads: 5/5 per browser deliver, with route 1. Each foreground Chromium-family trial has focus/blur, pointer and input events on both heads; no keys, activation changes or raises are observed. Safari foreground has focus/input but no page pointer events on both heads. Safari background remains route 3 with a posted activation point, document/window focus events, no page pointer/key events, no observed native activation/raise, and 5/5 exact delivery on each head.

### Test-secret boundary

All 15 fix secret trials expand `{{secret:PROBE390_VALUE}}` through the matching pinned source's production sky wrapper and production file-store reader. The value is a random test value in a mode-0600 file under that trial's temporary HOME, never the owner's store. The narrow adapter records substituted-value equality and `concealed=true` in 15/15, then maps that request to the native token. DOM and React receive it in 15/15. All answers are valueUnconfirmed / concealed with **reads=0, ms=0**. Test-value bytes are replaced with `[TEST_SECRET]` before evidence persistence, and temporary homes are removed/excluded from uploads.

This proves live placeholder substitution, native delivery and zero reads in this route's read-back. It does not instrument every AXValue read in native code; the final head's source/unit review covers its coercion and re-fetch protections. The adapter deliberately exposes the raw engine answer/meta, so full REPL/service error rewriting is not qualified here. Secret RPC intervals include the trusted file-store substitution step.

## Invalid attempt and measurement limits

- `electron/long/fix/4` failed `frontmost not verified` during the initial foreground preparation. Its row has no engine launch, observation or RPC and no native samples. There is no evidence that cua's action activated anything, nor evidence of a product input failure; the foreground owner/cause was not retained. The remaining four long-value repetitions passed. The primary 20 ordinary-background repetitions and all five secret, uppercase, cap-suffix and foreground repetitions are complete. No recovery run was launched solely to remove this ancillary limitation.
- The owned Electron fixtures copy the kit's default/MAWS native window options and chrome geometry, not the real MAWS app, its application preload, or a Radix modal. Dialog-trap survival and a field turning secure mid-call are not live-tested here.
- Native state is sampled, not a continuous OS activation/order trace. The requested loop interval is 10 ms; actual new-path in-RPC gaps reach 56.1 ms. A shorter excursion can be missed. Engine route/activation meta and page events provide separate evidence, not a continuous OS trace.
- The nominal zero-ms DOM sample is a later HTTP read, not an atomic snapshot at response time. For ordinary background fix calls its actual delay is CfT 11 / 15 / 15 ms, default Electron 14 / 25 / 52 ms, parity Electron 11 / 15 / 15 ms. Every observed checkpoint matches, but changes wholly before the first sample or after the final sample are outside this judge.
- Timing triples describe this instrumented, sequential, no-added-load hosted experiment. They are not an isolated production performance benchmark, and five-repetition controls establish functional outcomes, not latency equivalence. Read-back polls include real AX call latency; some nominal one-second mismatch budgets finish just above 1,000 ms.
- CfT's rolling image changed between smoke and full. The 20-repeat result is scoped to full's actual versions above, and to short ordinary text fields; no cold-launch, minimized-window, dedicated-desktop, real-owner-profile or password-field claim is made.

The qualification is complete for #390's primary check, with the one ancillary setup-invalid repetition and the baseline/fixture boundary explicitly retained. No product edits, PR, merge, ticket writes, owner GUI work or Mac-mini work were performed.
