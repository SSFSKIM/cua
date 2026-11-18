# #414 hosted qualification: password typing by length

This is a disposable hosted macOS qualification kit, not product code. It builds unmodified release binaries from two exact product SHAs and uses the corresponding production sky, secret-store, native service and renderer modules. Each of the six stock jobs interleaves the pins in the same owned app/profile. CfT and Safari also run a separate, instrumented copy of the fix solely for the AX schedule gate. Audit rows are never pooled with stock evidence.

```sh
gh workflow run probe-414-qual.yml --ref probe/414-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=full
```

`secure_poll` names the candidate function whose own `while true {` loop polls the secure length; it defaults to the reviewed `confirmLength` anchor and may be overridden only for a separately reviewed source. The audit patch fails closed on any drift of its seams.

The registration push has only an Ubuntu registration job. `mode=smoke` runs one trial per cell and one trio per audit lane; it does not qualify a product pin. Swift helpers and apps enforce a GitHub-hosted guard. Chrome for Testing uses the disposable runner HOME and an isolated profile; the engine, fixture and other app processes have isolated temporary homes. No owner data is read.

## Gates

| Gate | Expected full coverage per stock job |
|---|---|
| Primary | 60 per head: 20 empty short concealed, 20 empty long concealed, ten concealed replacements of a page/app-selected range, and ten empty literal. Main must be unconfirmed `secure`; fix must length-confirm, with the product's fixed note (opening `Typed into a password field, confirmed by its length only:`) emitted through the production rendered content and identical to the engine's note (only the boolean is kept). Independently exact app/page content on both heads. |
| Non-BMP | 20 additional concealed trials per head; one non-BMP scalar in otherwise ASCII input. Same confirmation and equality contract as primary. |
| Negative | Ten one-keystroke drops (five concealed/five literal) and **20 synchronous additions** (ten concealed/ten literal) on the fix. The first genuine key-down inserts one independent character at the current caret and then proceeds normally. The exact final prefix-plus-request is verified independently. This permanent scored control (ruling 842) catches an intermediate match while queued keys are still arriving. A realized perturbation must answer `lengthMismatch`; literal calls may also answer `caretMismatch`. A documented provider limit is never counted as rejection by length. |
| Known limit (informational) | Five same-length rewrite attempts; report that the app/page contains the wrong content, and the count of length confirmations. Do not gate on their confirmation rate. |
| Privacy | Inspect native replies, forwarded metadata, sky results/errors, rendered action items and the subsequent text observation, and engine stdout/stderr. No field-derived text, masks, length, count or range. Engine stdout and stderr, and every string, are parsed as JSON (whole or after a prefix) and scanned for private names. Literal `entered` is an allowlisted count of public units at exactly three positions: raw IPC `result.meta` or `error.meta`, the literal sky error's `meta`, and the forwarded top level as `cua/entered`; concealed `entered` fails. The old literal `pollMs:0` and `reads:0` are exempt only on the baseline's literal `secure` refusal, never the fix. |
| Audit, CfT and Safari | Five pairs each of short vs. long and short vs. literal fix schedules, retaining exact attribute batch names, order and within-request element aliases. The recorder starts at the native dispatch boundary (before input enablement and app resolution), armed for `type_text` only. Only identical consecutive iterations of the secure length poll's actual loop collapse; operations inside one iteration and distinct iterations stay. A real pre-input secure count batch and a post-input secure count batch per poll iteration are required. No `AXValue`, `AXValueDescription`, `AXSelectedText` or parameterized request on the secure alias. Safari must make exactly `AXSelectedTextMarkerRange` then `AXUIElementForTextMarker` on one classified `AXWebArea` before the first input (the others none); its whole lane, stock and audit, uses #395's large page of 1,600 preceding buttons with each field scrolled into view, under the cover. The secure element is classified from the role and subrole slots of the batches the product already makes. |

A confirmed outcome requires `confirmed:true`, `secure:true` and `confirmation:'length'` on both raw and forwarded records, and production success from sky. Any other success claim (a bare or unilateral confirmation, or a sky success without agreed metadata) is reported separately as bare, fails the row, and counts as a wrong success over a known mismatching DOM, even for a negative control whose content had further corruption. A `notTextField` Firefox refusal with exact delivery is admitted as the documented AX-focus limit, not a confirmation. A selection replacement on AppKit with exact delivery may also be unconfirmed when the provider cannot read the length or selection; this is kept separate from confirmation counts. Empty AppKit successes still require a length confirmation (which the fix can support via caret delta). No field content, count or selection is read by the qualification harness through AX; content is compared locally by the owned app or page and only booleans leave the fixture.

Targets are normally seeded under the disposable #395 cover; the Firefox password-only cell has no earlier input and seeds and focuses the password before the cover is raised. The continuous activation witness must hold through input and the independent delivery read. Safari never runs frontmost. Other lanes may use frontmost only when the pre-action empty fixture or witness cannot be established under the cover; the status records where setup failed. A setup-invalid or unrealized perturbation is reported separately, not counted as a product miss and not accepted as coverage. No retry after typing begins. Since kit `7d4738a6`, only the active head has an engine connection during a trial, so the other head cannot interpret its keys as user input.

The workflow uploads fixed status, `coded.json` (counts, timings and closed codes only, rebuilt from a fixed vocabulary, published even after a privacy failure) and an explicitly promoted allowlist of detailed JSON projections. A privacy failure prevents detailed publication. Percentiles use nearest ranks and report snapshot and sky service milliseconds separately. The audit publishes hashes and counts, not raw traces; the in-run comparison uses the ordered normalized trace. No screenshots are taken.

## Hosted runs before the quiet-window fix

All runs used baseline `517ab5430a3a81718910b030488ba8d855087b21`, including #395. Workflow ID: `422774845`; [registration](https://github.com/SSFSKIM/cua/actions/runs/44336796127) ran only the Ubuntu registration step. These are smoke and diagnostic runs, **not** the exact-SHA full qualification.

| Run | Kit | Fix | What it established |
|---|---|---|---|
| [First smoke](https://github.com/SSFSKIM/cua/actions/runs/44336845049) | `002d9708` | `fd794691c2fcaffe2dee38307c1b972b2584f933` | Both scratch schedules passed; privacy reporting was invalid because the scanner treated the JavaScript array implementation's unobservable `.length` as a wire field. All jobs reached the fixtures. Five negative rows did not realize their mutation. |
| [Coded smoke](https://github.com/SSFSKIM/cua/actions/runs/44339005115) | `5e0c2bf0` | `81a1aebcf23c98f44654ded0d739c8b75faa7fa4` | Both scratch schedules and the non-Firefox privacy gates passed; six control rows did not realize their mutation. The stock run was red. Default Electron and AppKit each wrongly length-confirmed one live synchronous extra-character control. |
| [Firefox stale-focus diagnostic](https://github.com/SSFSKIM/cua/actions/runs/44342395472) | `7d4738a6` | `52f0109a722bc4f40d327763f4ddcde201da01b0` | Separate stock and instrumented jobs, 12 trials each. Both heads typed exactly into the password input, but the action's AX snapshot read the unchanged plain setup field. This is the #419 evidence, not a password-value leak. |
| [First Firefox password-only attempt](https://github.com/SSFSKIM/cua/actions/runs/44345708637) | `09425c5d` | `c488d17a64fcd1172105b044300e92e3dc7deb91` | Both jobs setup-invalid before any product call: cover activation led to a frontmost fallback, and the password-only driver incorrectly required the absent setup-field canary. No claim about the provider from this run. |
| [AppKit race reproduction](https://github.com/SSFSKIM/cua/actions/runs/44345742116) | `09425c5d` | `c488d17a64fcd1172105b044300e92e3dc7deb91` | Stock frontmost: 20/20 realized adds, **6 wrong length confirmations**, 14 refusals, zero privacy flags. Scratch background: four witness-invalid trials, then abort; no usable timing. Both jobs agreed on the prefilled AppKit capability shape. |
| [AppKit race, both jobs frontmost](https://github.com/SSFSKIM/cua/actions/runs/44346952381) | `a9e12cdc` | `c488d17a64fcd1172105b044300e92e3dc7deb91` | 20/20 valid on each job, zero privacy flags. Stock wrongly length-confirmed 7/20; separate timing-instrumented copy wrongly confirmed 5/20. The clocks establish the race below. |

### Coded smoke by lane

Primary plus non-BMP: five attempts per head. `C/U/E` means length-confirmed / unconfirmed / independently exact. Negative is length-rejected out of realized controls; wrong successes exclude the same-length informational rewrite. Snapshot and service are nearest-rank p50/p95 ms, main → fix; an early action refusal may have service time but no snapshot. AppKit was frontmost because its preflight could not seed the secure editor under the cover; the other lanes were background.

| Stock lane | Main C/U/E (unconfirmed reasons) | Fix C/U/E (unconfirmed reasons) | Negative / wrong successes | Strict privacy flags / invalid controls | Snapshot p50/p95 | Service p50/p95 |
|---|---|---|---|---|---|---|
| CfT | 0/4/4 (`secure`×4) | 0/1/0 (`lengthMismatch`) | 0/0; 0 | 0 / 2 | 0.3/0.6 → 0.3/0.3 | 82.9/309.1 → 23.7/1091.6 |
| Electron default | 0/5/4 (`secure`×5) | 4/1/4 (`lengthMismatch`) | 1/2; **1** | 0 / 0 | 3.2/5.0 → 3.1/6.1 | 72.2/289.4 → 96.5/1061.8 |
| Electron MAWS parity | 0/5/4 (`secure`×4, `noFocusedElement`) | 4/1/4 (`lengthMismatch`) | 2/2; 0 | 0 / 0 | 8.5/48.4 → 3.4/6.0 | 114.5/205.4 → 172.3/1168.4 |
| Safari large | 0/4/4 (`secure`×4) | 1/0/1 | 0/0; 0 | 0 / 2 | 7.8/29.8 → 9.3/9.3 | 157.7/244.2 → 10.1/93.4 |
| Firefox with setup field | 0/3/3 (`concealedMismatch`×2, `valueMismatch`) | 0/2/2 (`concealedMismatch`×2) | 0/0; 0 | 1 / 2 | 0.6/0.7 → 0.7/1.1 | 1068.8/1109.6 → 39.6/1268.1 |
| AppKit | 0/5/5 (`secure`×5) | 4/1/5 (`lengthUnreadable` with selection) | 1/2; **1** | 0 / 0 | 0.2/0.4 → 0.3/1.0 | 82.9/198.3 → 98.0/235.4 |

CfT and large Safari instruments passed both schedule pairs each, with no forbidden password AX reads. In the background Safari stock job the complete coded action totals were main `typeUnconfirmed`×4, `userIntervened`×1; fix `userIntervened`×6, success×2. CfT had the same early-refusal pattern (main 4/1; fix `userIntervened`×6, success×1, `typeUnconfirmed`×1). This harness held two monitored engine connections against the same target. The first main delivery could trip the fix's five-second interruption debounce while the fix, refusing before posting, could not reciprocate. The late realized rewrite then gives the reverse observation on main. One-connection Firefox diagnostics had **zero** `userIntervened` on both heads; Safari/CfT still need the exact-pin isolated run.

The same-length rewrite length-confirmed 1/1 realized attempt in each non-Firefox lane and 0/1 in Firefox. Default Electron and AppKit additionally length-confirmed the **count-changing** synchronous add, with exact perturbed content and no privacy flags, in 87.387 and 72.848 ms service time respectively. The drop was refused. The extra is inserted synchronously at the original caret in the first genuine key-down's handler, before that key takes its normal path; a later queued genuine key may turn the transient matching caret or count into a mismatch. The coded smoke measured only service time, not poll-versus-key order. Non-BMP content was not exact on either Electron head in either smoke; AppKit delivered it exactly on both heads in the coded smoke.

### Firefox stale focus (#419)

The background two-input diagnostic had no invalid setup and exact password delivery plus an unchanged setup field in **12/12 stock and 12/12 scratch** trials. The instrumented product snapshot selected `setupField` in **12/12** (role `AXTextField`, subrole absent), not password, ancestor, or descendant. Both heads' concealed requests answered `concealedMismatch` with no excerpt or length. Literal mismatches (main 2/3, fix 3/3 in each job; the other main literal answered `fieldUnreadable`) carried ordinary-field excerpt and length markers with no password masks; the actual-field fragment matched **setup only**. The strict raw scanner kept these rows red and withheld details; the separately coded identity resolves the scope of the disclosure. No value or length number is retained.

In the separate [password-only background retry on cbce12e2](https://github.com/SSFSKIM/cua/actions/runs/44349106034) (kit `db77bbf9`) there was no setup input and no focus switch after raising the cover. Stock main and fix each delivered **5/5** exactly, including non-BMP, but all readbacks answered `notTextField`. The 12/12 scratch trials delivered exactly on both heads, too; every production snapshot identified the password's **ancestor** (`AXWebArea`, subrole absent), not the password itself. Stock literal privacy flags were ordinary non-secure readback shape; neither job found a password excerpt, masks or field lengths in those rows. This is a separate, verified provider limit: Firefox remains uncovered for the secure length path and its drain timing, rather than being counted as a successful sixth qualification lane. No further retry.

### AppKit provider surface

Both prefilled `NSSecureTextField` probes exposed `AXSelectedTextRange` and did **not** advertise `AXNumberOfCharacters` or `AXVisibleCharacterRange`. A direct `AXVisibleCharacterRange` read was unsupported/unreadable; its location-zero and fixture-length comparisons therefore have no result. The parameterized names were `AXReplaceRangeWithText` and `AXBoundsForRange`; nothing parameterized was invoked. The full attribute-name lists are in `appkit-capabilities.json`. There is no demonstrated count-equivalent here. Later AppKit trials run frontmost because the empty background preflight could pass even when the secure editor subsequently activated the app during real input and broke the cover witness.

The same-clock scratch rerun directly proves the transient match: in all five false confirmations the synchronous injection advanced the caret, and the eventual caret was consistent with the exact perturbed content, not the intended content. The injection completed 48.45–88.18 ms **before** the last genuine edit. The engine's confirming read came 3.51–7.85 ms after the last native key-down post; the last edit landed 12.58–37.19 ms after it. The IPC reply arrived 8.41–21.69 ms **before** that edit. With n=20 nearest ranks, last post → final edit p50/p95/p99/max was **9.827/17.554/37.187/37.187 ms**. In the five false confirmations the confirming-read → final-edit gap was **12.588/30.722/30.722/30.722 ms**; the shortened pre-window trace yielded no measured inter-change intervals. These are diagnostic precursor results, not proof of the later window's p99.

### Drain timing method

`mode=drain` builds separate fix-only scratch engines per lane. It runs 100 trials per covered lane (40 short, 40 long, 20 synchronous adds), records post-input secure count-or-caret sample **changes in memory**, and publishes only differences. The final sample must have started after the fixture's own last genuine content edit, and at least 99/100 usable traces are required for an authoritative lane p99; earlier truncated races are still retained as diagnostics. Firefox was omitted after the verified no-secure-poll outcome above. The sizing input is the **duration of the intermediate state**, not last post → terminal edit, last post → last observed AX change (or the first sample if no change was seen), or last post → final sample (which also includes intentional waiting). Those are separate context metrics. Ruling 842 uses three times the maximum per-lane inter-change p99 for the one quiet-window constant. The wave-three scratch recorder inferred state durations between consecutive changed AX readings. The final scratch jobs also record the intervals between consecutive genuine DOM/editor edits when the later edit is at or after the last post, including the edit immediately preceding it. Only differences are published. Nearest-rank p50/p95/p99/max depend on each metric's own sample count; no observed change pair is not a zero-duration pair. AppKit also publishes signed insertion, last key arrival/consumption, confirming read and IPC reply differences on the runner clock, and a prefilled-field capability shape (names and booleans only). These timings are scratch evidence, not stock latency. The final stock gate measures each observed post-typing secure concealed failure from the stock native reply's arrival back to `meta.endedAt` (last successful post); 999–1100 ms passes, allowing one millisecond for clock granularity. It also reports from `meta.startedAt` (first successful post). That latter interval includes the keying time, which naturally scales with typed input and is informational. A before-input refusal and a basis already refused at the snapshot (notably AppKit's selected fallback) are classified separately: the fixed delay belongs to the post-typing poll's outcome, not a refusal determined before the input. No native wire timestamp directly identifies the snapshot end.

### Wave-three evidence and the 180 ms decision

[Wave-three smoke](https://github.com/SSFSKIM/cua/actions/runs/44349106034) and [scratch drain](https://github.com/SSFSKIM/cua/actions/runs/44349122918) used kit `db77bbf9` and fix `cbce12e2dcdec37ca255d45ff686cf683a5d116c` (W=50 ms). All five supported stock jobs' add and drop controls refused; each had zero scored wrong successes, zero privacy violations and zero setup-invalid rows. CfT and Safari schedule pairs both passed. AppKit and Safari stock were green; the three Chromium providers missed the non-BMP delivery on both heads, not just the fix. In the separate [Unicode shape diagnostic](https://github.com/SSFSKIM/cua/actions/runs/44353014580), kit `37c5f3a4` and fix `4a005a8c0cd8afe6e60dc34c792e18c1c1a7c618`, CfT dropped only the non-BMP scalar and delivered all surrounding ASCII unchanged, **5/5 on each head**. These were cua's native keyed events through the production sky wrapper, not a vendor-engine test.

The scratch job rejected all 20 synchronous adds on each of the five lanes. This table uses p50/p95/p99/max in ms; the first two metric columns explicitly show their own n. The small n for AX inter-change gaps is real (under 30 on every lane). Ordinary smoke measured AX schedule shape, not read results or change times, so there are no additional smoke gaps to pool. One AppKit and one Safari trace ended before the terminal genuine edit and were excluded from AX stats, but their app-edit lag is still known.

| Lane | Last post → final genuine edit (n=100) | Sampled AX inter-change (n; p50/p95/p99/max) | Last post → final AX sample |
|---|---|---|---|
| CfT | 11.757/29.455/91.036/128.228 | 15; 19.935/24.296/24.296/24.296 | 93.669/1013.024/1027.149/1031.942 |
| Electron | 11.921/19.500/41.830/163.380 | 9; 23.431/25.335/25.335/25.335 | 95.301/1017.755/1028.552/1030.165 |
| Electron parity | 11.559/17.011/44.058/127.241 | 16; 19.156/55.946/**55.946**/55.946 | 93.952/1019.102/1029.487/1035.368 |
| Safari | 9.736/17.603/17.881/22.713 | 2; 17.785/23.418/23.418/23.418 | 82.104/1023.183/1029.296/1029.296 |
| AppKit | 13.179/21.269/43.533/59.857 | 0; no pair observed | 83.765/1011.161/1020.109/1020.109 |

The worst observed *sampled inter-change* p99 was **55.946 ms** (parity Electron, 16 intervals), giving **167.838 ms** at three times p99. The one constant was set to **180 ms**, leaving 820 ms inside the one-second read-back budget to acquire a genuine match. The final proof uses the exact pin and the stock 20-per-lane add gate, not a projection of the 50 ms smoke.

## Final qualification

[Full W=180 stock and scratch](https://github.com/SSFSKIM/cua/actions/runs/44356891906): kit `ced9002d`, baseline `517ab5430a3a81718910b030488ba8d855087b21`, fix `1f69470e0a5e9f94d8417a964d749bf07682d848`. Five supported stock lanes, two schedule-only scratch jobs, and five drain-only scratch jobs. Each stock lane plans 195 rows: 80 per head, 30 negative controls and five informational rewrites. All **100 stock synchronous adds** and all **50 stock drops** were realized and refused without a wrong confirmation; every one of **135** measured post-input concealed failures met the timing gate. The fix had **zero privacy flags** across stock or scratch. Overall the workflow was **red**: all three Chromium stock lanes missed the same non-BMP delivery on both heads, default Electron had one strict baseline-only readback-shape flag, and CfT and AppKit fell short of the separate scratch AX timing coverage gate. There were zero setup-invalid rows in the full run. All jobs ran on hosted macOS 26.7.2: CfT 157.0.8103.78, both Electron lanes 44.4.5 / Chromium 152.0.7977.130, Safari 27.2, and AppKit `NSSecureTextField`. AppKit alone was frontmost; the others held the cover witness.

### Stock outcomes and privacy

`C/U/E` means length-confirmed / unconfirmed / exact fixture content across the 80 primary plus non-BMP trials per head. Main is expected to refuse while still delivering exactly. The ASCII columns are fix length confirmations, split by kind; AppKit's selection is an expected provider refusal. Add is number confirmed, drop is number rejected by length. The same-length rewrite is informational and is deliberately excluded from wrong successes. All counts are independent of scratch outcomes.

| Lane | Main C/U/E (reason) | Fix C/U/E (reason) | Short; long | Selection; literal | Non-BMP exact main → fix | Add confirmed; drop rejected | Wrong successes; rewrite confirmed | Strict privacy flags; invalid setup |
|---|---|---|---|---|---|---|---|---|
| CfT | 0/80/60 (`secure`×80) | 60/20/60 (`lengthMismatch`×20) | 20/20; 20/20 | 10/10; 10/10 | 0/20 → 0/20 | **0/20**; 10/10 | 0; 5/5 | 0; 0 |
| Electron default | 0/80/60 (`secure`×79, `noFocusedElement`×1) | 60/20/60 (`lengthMismatch`×20) | 20/20; 20/20 | 10/10; 10/10 | 0/20 → 0/20 | **0/20**; 10/10 | 0; 5/5 | 1 baseline shape flag; 0 |
| Electron parity | 0/80/60 (`secure`×80) | 60/20/60 (`lengthMismatch`×20) | 20/20; 20/20 | 10/10; 10/10 | 0/20 → 0/20 | **0/20**; 10/10 | 0; 5/5 | 0; 0 |
| Safari large | 0/80/80 (`secure`×80) | 80/0/80 | 20/20; 20/20 | 10/10; 10/10 | 20/20 → 20/20 | **0/20**; 10/10 | 0; 5/5 | 0; 0 |
| AppKit | 0/80/80 (`secure`×80) | 70/10/80 (`lengthUnreadable`×10) | 20/20; 20/20 | 0/10; 10/10 | 20/20 → 20/20 | **0/20**; 10/10 | 0; 5/5 | 0; 0 |
| Firefox | Uncovered, confirmed AXWebArea in wave-three diagnostic | Uncovered | — | — | — | — | — |

The default Electron strict flag was a baseline literal row that typed exactly and answered `noFocusedElement`: the strict scanner flagged private-key/readback shape on raw IPC, sky error and forwarded metadata; no synthetic value, mask or private-text code was flagged. The baseline protocol emits legacy literal zero `reads` and `pollMs` even for snapshot refusals; the kit exempts those only for `secure`. Detailed raw surfaces were withheld, not captured for later inspection. The fix had zero privacy flags in that lane. The Unicode classifier reported `missing` with exact surrounding ASCII on both heads in the affected rows.

### Native failure timing and stock latency

All times in milliseconds. Snapshot and service are nearest-rank p50/p95 for primary plus non-BMP. The secure concealed failure budget starts after the final native post; first-post duration includes input delivery, so it is not a budget failure when above 1100 ms. `n` means post-input secure concealed refusals with a budget; AppKit's ten pre-decided snapshot refusals are reported apart: receipt minus last post was 2 ms in all ten at this pin.

| Lane | Snapshot p50/p95 main → fix | Service p50/p95 main → fix | Budget n; misses | Last post → reply p50/p95/p99/max | First post → reply p50/p95/p99/max | Snapshot refusals |
|---|---|---|---|---|---|---|
| CfT | 0.300/0.500 → 0.600/0.900 | 69.852/238.928 → 358.856/1101.753 | 35; 0 | 1016/1031/1031/1031 | 1072/1097/1143/1143 | 0 |
| Electron default | 3.500/5.400 → 3.500/5.300 | 74.484/249.922 → 319.568/1100.283 | 35; 0 | 1019/1042/1042/1042 | 1074/1095/1098/1098 | 0 |
| Electron parity | 3.200/6.900 → 3.600/7.000 | 78.977/246.375 → 425.122/1105.403 | 35; 0 | 1016/1036/1052/1052 | 1073/1095/1114/1114 | 0 |
| Safari large | 7.100/11.500 → 6.900/11.000 | 79.508/256.030 → 292.801/471.266 | 15; 0 | 1013/1027/1027/1027 | 1070/1153/1153/1153 | 0 |
| AppKit | 0.200/3.200 → 0.400/3.500 | 73.173/240.442 → 280.560/474.728 | 15; 0 | 1012/1021/1021/1021 | 1063/1176/1176/1176 | 10 |

### Separate scratch gates

CfT and large Safari each matched **10/10 schedule pairs** (15/15 audit traces), with zero forbidden reads, zero privacy flags and zero setup-invalid rows. The Safari traces witnessed the marker pair on one classified web area before input. Each lane's separate timing job realized all 100 perturbation/delivery rows; no scratch add length-confirmed and privacy stayed green.

| Lane | Final AX timing coverage | Direct fixture straddling gap n; p50/p95/p99/max ms | AX inter-change n; p50/p95/p99/max ms | Last post → true final edit p50/p95/p99/max ms | Adds confirmed |
|---|---|---|---|---|---|
| CfT | 98/100; **coverage red** | 226; 8/18/**29**/35 | 12; 23.481/45.215/45.215/45.215 | 12.416/25.259/40.313/303.666 | 0/20 |
| Electron default | 100/100 | 212; 8/20/**29**/69 | 11; 24.162/35.193/35.193/35.193 | 12.377/20.574/62.236/173.680 | 0/20 |
| Electron parity | 100/100 | 217; 8/18/**25**/57 | 22; 18.320/34.534/69.042/69.042 | 12.010/18.154/48.559/88.403 | 0/20 |
| Safari large | 100/100 | 224; 6/18/**24**/51 | 1; 18.753/18.753/18.753/18.753 | 11.724/17.638/23.143/24.435 | 0/20 |
| AppKit | 94/100; **coverage red** | 269; 3.802/18.654/**72.593**/448.502 | 0; no pair observed | 13.508/24.277/59.162/542.371 | 0/20 |

The timing red rows were not setup-invalid: their final production AX sample began before the independently verified final edit (2 CfT and 6 AppKit). They cannot size the AX inter-change estimate, but their direct fixture timestamps remain valid. Direct gap scope here is only adjacent edits whose later edit is at/after the last post; earlier typing-cadence gaps were not stored and cannot be recovered. The worst direct p99 is **72.593 ms** (AppKit n=269), and **3× is 217.779 ms**, above 180 ms even though the tested stock and scratch adds never confirmed. The 448.502 ms max was an AppKit ordinary short row whose AX read closed `fieldUnreadable`; omitting that trial would produce p99 46.763 ms (n=262), but the declared direct scope includes it. AppKit's adds alone gave p99/max 64.854 ms (n=55), also above 180 ms at 3×. This is a sizing finding, not an observed false confirmation on W=180.

## Reduced confirmation at 220 ms

[Wave-five hosted run](https://github.com/SSFSKIM/cua/actions/runs/44370419752), kit `ecc786430f14185aec41e49292f166028b62e46f`, baseline `517ab5430a3a81718910b030488ba8d855087b21`, fix `f217f062d194481a3b3d20bba7917790a4208b4a`. This is a separate exact-pin confirmation, not a replacement for the 180 ms full matrix. Across the same five supported stock lanes it interleaves 25 primary trials per head (10 short concealed, 10 long concealed, five literal), with 20 adds and ten drops on the fix. AppKit also runs five fix-only prefilled-selection snapshot refusals. Non-BMP and the same-length informational rewrite were not rerun. Each realized concealed add/drop, and (on AppKit) every posted selection refusal must have a native timing result; there is no pass on an empty measurement set.

Wave five uses a nominal **1100 ms** concealed-failure deadline from the post-typing boundary (1000 ms read-back budget + 100 ms final-focus allowance), with a stock IPC window of **1099–1150 ms** after the last native post. Unlike wave four, a concealed snapshot refusal is also padded if it posted. Success still waits for a **220 ms** stable match, leaving 780 ms to find one. First-post duration, which includes keying, remains informational.

CfT and AppKit scratch audit the successful short/long/literal AX schedules only. The hosted fixture does not reliably produce an AX-only focus loss at exactly a held match or a separate observed held-then-lost match without making the witness invalid. The exact, unmodified candidate's two hosted stub tests cover the deadline for both kinds and ordered failure traces: a held match whose focus read fails is expected to have one extra focus read at that match; the rest of the trace equals a lost match's. Both named tests passed in the hosted run, from the exact unmodified fix pin. Only fixed pass/fail and number of named tests are exported from that step. An optional coded baseline-shape projection still grants no privacy exception if Electron's earlier no-focus flag recurs.

**Result: red.** All 125 fix primaries delivered exactly and length-confirmed; all 125 main primaries delivered exactly and refused `secure`. Zero of 100 synchronous adds confirmed. All 50 drops refused, but one Electron parity concealed drop was a valid `fieldChanged` refusal rather than a length rejection. Privacy and setup coverage passed in every stock job. The earlier default Electron baseline shape flag did not recur. Every stock lane missed the fixed IPC timing window; all 80 required control timings were measured, and **36/80 exceeded 1150 ms**. Hosted macOS and provider versions were the same as the 180 ms run; AppKit alone ran frontmost.

| Stock lane | Main / fix primaries: C/U/exact | Wrong add confirmations | Drops with length/caret rejection | Exact posted snapshot refusals | Privacy flags / setup-invalid | Deadline misses / measured |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| CfT | 0/25/25 → 25/0/25 | 0/20 | 10/10 | — | 0 / 0 | 8/15 |
| Electron default | 0/25/25 → 25/0/25 | 0/20 | 10/10 | — | 0 / 0 | 3/15 |
| Electron parity | 0/25/25 → 25/0/25 | 0/20 | 9/10 | — | 0 / 0 | 6/15 |
| Safari large | 0/25/25 → 25/0/25 | 0/20 | 10/10 | — | 0 / 0 | 9/15 |
| AppKit | 0/25/25 → 25/0/25 | 0/20 | 10/10 | 5/5 `lengthUnreadable` | 0 / 0 | 10/20 |

All adds refused `lengthMismatch` except ten AppKit literal adds that refused `caretMismatch`. Five AppKit literal drops likewise refused `caretMismatch`; the other drops refused `lengthMismatch` apart from the single parity `fieldChanged`. No scored trial confirmed incorrectly. Snapshot and service distributions below describe each head's primary rows only.

| Lane | Snapshot p50/p95 ms: main → fix | Service p50/p95 ms: main → fix | Post-typing failures, first native post p50/p95/max ms (informational) |
| --- | --- | --- | --- |
| CfT | 0.4/0.6 → 0.5/1.3 | 79.292/273.670 → 349.388/553.680 | 1208/1255/1255 |
| Electron default | 3.5/6.8 → 3.2/6.9 | 103.391/416.053 → 353.755/569.477 | 1179/1244/1244 |
| Electron parity | 3.5/5.7 → 3.5/6.6 | 94.058/245.947 → 359.489/509.025 | 1203/1248/1248 |
| Safari large | 4.1/10.8 → 4.2/5.9 | 77.213/219.564 → 327.138/479.413 | 1208/1241/1241 |
| AppKit | 0.3/1.2 → 0.7/4.3 | 168.531/390.549 → 421.854/601.517 | 1208/1313/1313 |

These stock controls use **only the short concealed input class**; timing variation at one length does not show a length channel. Durations from the last native post, in ms (historical nearest-rank p50/p95; parentheses give the sample count):

| Lane | Short adds: min/p50/p95/max (n) | Short drops: min/p50/p95/max (n) | AppKit posted snapshot controls: min/p50/p95/max (n) |
| --- | --- | --- | --- |
| CfT | 1105/1130/1178/1178 (10) | 1105/1165/1176/1176 (5) | — |
| Electron default | 1109/1115/1177/1177 (10) | 1106/1142/1185/1185 (5) | — |
| Electron parity | 1107/1148/1180/1180 (10) | 1107/1136/1178/1178 (5) | — |
| Safari large | 1116/1155/1187/1187 (10) | 1133/1152/1177/1177 (5) | — |
| AppKit | 1106/1148/1174/1174 (10) | 1104/1161/1177/1177 (5) | 1142/1170/1178/1178 (5; 3 misses) |

CfT scratch passed **10/10** pairs with 15/15 structurally valid traces and zero forbidden secure AX calls. AppKit scratch passed **9/10** pairs: 14 exact-delivery successes had the same normalized schedule, and one exact-delivery long trial closed `fieldUnreadable` at 1114 ms after the last post. The failed-provider path had a distinct trace; all 15 traces passed structural, identity and forbidden-call checks. Neither scratch job had a privacy flag or an invalid fixture. The exact stock stub passed separately (two tests); it does not substitute for the failed stock IPC deadline or AppKit's live schedule coverage.

## Shared last-post deadline at 220 ms

[Wave-six hosted run](https://github.com/SSFSKIM/cua/actions/runs/44375463208), kit `ad1f2f1c654341b130a3c41ac4c530251b273b49`, baseline `517ab5430a3a81718910b030488ba8d855087b21`, fix `451723675f234c4cc0c9643321d7b58094a1ef30`, mode `deadline`. It reruns the five supported stock lanes: ten short and ten long concealed primaries per head; on the fix, ten short and ten long concealed adds, five short and five long concealed drops, ten literal adds and five literal drops. AppKit alone again adds five posted prefilled-selection snapshot refusals. The product diff bounds the polls but preserves the secure batch attributes and field identity, so this run has no scratch audits. CfT also runs the exact, unmodified candidate's `testConcealedTimingAndReasonsHoldOverRandomCases` (2,000 seeded cases), with only pass/fail and test count published.

The candidate counts from `endedAt` (last native post): poll until 1000 ms, with no new batch in the final 50 ms and a 220 ms hold, leaving about 730 ms for the field to drain. A concealed failure goes back at 1100 ms; the stock IPC gate admits 1099–1150 ms, including posted snapshot refusals, and independently rejects any `lateReply` flag. Each lane must produce all 30 concealed add/drop timings; AppKit must produce all five additional snapshot timings. For the controlled length comparison, literal and snapshot trials are excluded. Each mutation kind's short/long observed ranges must overlap, and the four cohort medians must be within 10 ms of each other. The median averages the middle pair for an even sample; p95 is nearest-ranked. This is an empirical small-sample check, not proof that timing is indistinguishable.

For AppKit, the owned fixture verifies the prefilled selection before typing, and the separate capability probe found `AXSelectedTextRange` advertised and `AXNumberOfCharacters` not advertised on the password field. `lengthUnreadable` alone cannot prove that the snapshot, rather than a final length read, refused. These stock rows test the deadline in the selection setup expected to trigger the snapshot refusal; they do not trace that internal branch.

**Result: red on outcomes, even excluding the live timing gates.** All 100 fix primaries delivered exactly and length-confirmed; all 100 main primaries delivered exactly and refused `secure`. All **150 synchronous adds and 75 drops** were realized and refused, with no false confirmation. `fieldChanged`, not a length rejection, accounted for 78/150 concealed add/drop refusals across the five lanes. None of the 75 literal controls returned it. All five AppKit selection controls posted, delivered exactly and refused `lengthUnreadable`. All stock trials were valid with zero privacy flags. The exact candidate's hosted randomized property passed (one XCTest, 2,000 seeded cases). AppKit ran frontmost; CfT, both Electron lanes, and Safari were background.

| Lane | Add length/caret rejections / valid | Drop length/caret rejections / valid | Outside old IPC band 1099–1150 ms | `lateReply` flags | Old four-median spread |
| --- | ---: | ---: | ---: | ---: | ---: |
| CfT | 23/30 | 11/15 | 16/30 | 0 | 17 ms |
| Electron default | 21/30 | 9/15 | 14/30 | 0 | 40.5 ms |
| Electron parity | 17/30 | 10/15 | 9/30 | 0 | 19 ms |
| Safari large | 17/30 | 10/15 | 13/30 | 1 | 17.5 ms |
| AppKit | 21/30 | 8/15 | 18/35 | 1 | 37 ms |

The IPC-arrival bands and median comparisons are **informational going forward**, not product acceptance gates. Timing remains in tool `_meta`, not model-visible text; hosted scheduling and transport contribute to IPC arrival. The exact hosted stub is the deadline contract. Outcome (including zero false adds), privacy, length-invariant caller-visible reasons, and correct late-flag semantics still gate. The workflow's historical red conclusions above are unchanged. In particular, 70/155 IPC arrivals were outside the original band, all above it; the historical combined budget counted 71 misses because the 1119 ms AppKit flagged row was inside it. The 1328 ms Safari flagged row was a **short concealed add** (`fieldChanged`); the 1119 ms AppKit flagged row was a **long concealed drop** (`fieldChanged`). The two flags and the 69 unflagged IPC arrivals above 1150 ms do not by themselves establish the native time at which the flag was decided. At this pin the flag is decided before padding, not after it.

Last-post-to-IPC timings below are p50/p95/max in ms, with n in parentheses. `Δ` is long minus short, shown as p50/max for each mutation (positive means long arrived later). Short and long ranges overlapped for both mutations in every lane. Which group was later changed by lane and by mutation, consistent with scheduling jitter rather than a consistent length effect; these small live samples cannot prove timing indistinguishability.

| Lane | Short add | Long add | Add Δ | Short drop | Long drop | Drop Δ |
| --- | --- | --- | ---: | --- | --- | ---: |
| CfT | 1150/1177/1177 (10) | 1161/1180/1180 (10) | +11/+3 | 1144/1175/1175 (5) | 1160/1172/1172 (5) | +16/−3 |
| Electron default | 1162.5/1175/1175 (10) | 1140.5/1172/1172 (10) | −22/−3 | 1122/1129/1129 (5) | 1154/1172/1172 (5) | +32/+43 |
| Electron parity | 1139/1172/1172 (10) | 1127/1167/1167 (10) | −12/−5 | 1120/1176/1176 (5) | 1129/1177/1177 (5) | +9/+1 |
| Safari large | 1160.5/1328/1328 (10) | 1143/1175/1175 (10) | −17.5/−153 | 1143/1167/1167 (5) | 1147/1178/1178 (5) | +4/+11 |
| AppKit | 1135/1176/1176 (10) | 1158/1176/1176 (10) | +23/0 | 1172/1177/1177 (5) | 1160/1170/1170 (5) | −12/−7 |

AppKit's five posted selection refusals had p50/p95/max **1116/1173/1173 ms** (one outside the old band, no late flags).

| Lane | Primary snapshot p50/p95 ms (main → fix) | Primary service p50/p95 ms (main → fix) |
| --- | --- | --- |
| CfT | 0.4/1.3 → 0.6/5.2 | 133.600/310.808 → 390.172/545.402 |
| Electron default | 4.1/7.1 → 3.8/8.6 | 150.700/284.200 → 354.213/572.812 |
| Electron parity | 4.0/6.8 → 3.0/5.7 | 212.765/278.693 → 391.821/528.086 |
| Safari large | 5.8/12.9 → 6.4/9.0 | 128.045/278.875 → 345.228/542.431 |
| AppKit | 0.3/0.7 → 0.4/2.4 | 167.480/243.553 → 456.649/678.546 |

| Lane | `fieldChanged`: short / long adds (of 10 each) | `fieldChanged`: short / long drops (of 5 each) | All concealed controls | Wave-five `f217f062` (short only) |
| --- | ---: | ---: | ---: | ---: |
| CfT | 3 / 4 | 1 / 3 | 11/30 | 0/15 |
| Electron default | 4 / 5 | 4 / 2 | 15/30 | 0/15 |
| Electron parity | 5 / 8 | 3 / 2 | 18/30 | 1/15 |
| Safari large | 8 / 5 | 3 / 2 | 18/30 | 0/15 |
| AppKit | 4 / 5 | 2 / 5 | 16/30 | 0/15 |

Every lane's reason histogram differs by length for at least one kind, but shifts run both ways and the spurious code affects both lengths. This fails the expected `lengthMismatch` outcome even without evidence of a systematic length effect. Stock replies do not expose the lookup that selected each field: the engine groups direct app focus and the window walk into `.focus`, and tracks `.marker` separately; neither is on the wire. The four non-Safari lanes do not enable the Safari marker route. The earlier instrumented Safari run proved marker lookup in that run, not in any particular wave-six refusal. No row-level lookup attribution is available without a new scratch trace.

## Final fixed-slot confirmation at 220 ms

[Wave-seven hosted run](https://github.com/SSFSKIM/cua/actions/runs/44381626238), workflow `422774845`, kit `97618a58b146dcd4548a9c9b6d20433e4788d3eb`, baseline `517ab5430a3a81718910b030488ba8d855087b21`, fix `2e011dbff145df9e7d3d0f2c56d7ffbeaa87764e`, mode `deadline`. It repeats the wave-six five-lane stock matrix, including the paired positives because the focus change also affects confirmation; a match near the last batch can now use the final focus read. No scratch jobs were requested.

The fix schedules a final length batch at last post + 950 ms and its final focus check at +1000 ms. A late prior read cannot consume the final focus check's own allowance. Focus now distinguishes moved from unknown; the final batch supplies the reason when focus is unknown, and `noLongerSecure` takes priority. The engine decides `lateReply` after padding, strictly more than **10 ms** past the native 1100 ms deadline. The exact hosted `testConcealedTimingAndReasonsHoldOverRandomCases` compares two different-length synthetic inputs against each of 2,000 seeded field timelines. It checks paired outcomes, reasons, native reply time and flags, the fixed slots, and the success hold.

The live gates are zero wrong confirmations, exact positive delivery and length attestations, the expected control refusals (including no spurious `fieldChanged` on the owned concealed controls), short/long refusal-code parity per mutation, and privacy. The hosted property separately gates native deadline and `lateReply` correctness. Stock IPC times, overlap, median spread, and flag comparisons to the old 1099–1150 ms IPC band are informational: IPC arrival is not the native clock.

**Result: not qualified.** The `fieldChanged` regression gate passed in all lanes, from 78/150 concealed controls in wave six to **0/150**. However, **62/150** concealed controls now refused `fieldUnreadable` instead of `lengthMismatch`. That fails strict outcome and both length-parity comparisons in every lane. The other 88 concealed controls and all 75 literal controls got their expected length/caret rejection. Every control realized the mutation and refused; none confirmed. All 100 fix primaries delivered exactly and length-confirmed; all 100 baseline primaries delivered exactly and refused `secure`. All five AppKit selection controls posted, delivered exactly and refused `lengthUnreadable`. Privacy and setup coverage passed in all lanes. The exact hosted extended property passed (one named XCTest, 2,000 paired cases).

| Lane | `fieldChanged` wave six → seven (of 30) | `fieldUnreadable` short / long adds (of 10 each) | `fieldUnreadable` short / long drops (of 5 each) | Add / drop length-caret rejections | Outcome | Reason parity (add/drop) | Privacy / invalid |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| CfT | 11 → 0 | 1 / 4 | 0 / 4 | 25/30; 11/15 | Fail | Fail / fail | 0 / 0 |
| Electron default | 15 → 0 | 5 / 2 | 2 / 4 | 23/30; 9/15 | Fail | Fail / fail | 0 / 0 |
| Electron parity | 18 → 0 | 4 / 2 | 3 / 1 | 24/30; 11/15 | Fail | Fail / fail | 0 / 0 |
| Safari large | 18 → 0 | 7 / 5 | 4 / 1 | 18/30; 10/15 | Fail | Fail / fail | 0 / 0 |
| AppKit | 16 → 0 | 4 / 3 | 4 / 2 | 23/30; 9/15 | Fail | Fail / fail | 0 / 0 |

The unreadable counts differ in both directions by lane and kind; they fail empirical reason parity without establishing a systematic length effect. A final batch that cannot be started before its bound or that returns an unreadable field can both produce `fieldUnreadable`; stock does not expose which happened. Sixty of the 62 `fieldUnreadable` rows were flagged late, but stock IPC cannot establish the cause. As before, AppKit selection refusal phase is inferred from the owned selection, field capability and reason, not directly traced. Hosted macOS was 26.7.2; CfT was 156.0.8078.80 (wave six used 157.0.8103.78), both Electron lanes 44.4.5 / Chromium 152.0.7977.130, Safari 27.2. AppKit alone was frontmost.

`lateReply` was present on **138/155** measured stock failures. All 155 flag decisions matched the side of the 1110 ms boundary predicted by IPC arrival: the earliest flagged arrival was 1111 ms and the latest unflagged arrival was 1110 ms. This is live consistency, not a measurement of the exact native flag instant. All 71 arrivals over the old 1150 ms limit had flags; 67 flagged arrivals were inside the old band. The native tolerance and exact flag equivalence passed independently in the hosted property.

| Lane | `lateReply` / measured | Above old IPC band (1150 ms) | Short add p50/p95/max (n) | Long add p50/p95/max (n) | Short drop p50/p95/max (n) | Long drop p50/p95/max (n) |
| --- | ---: | ---: | --- | --- | --- | --- |
| CfT | 26/30 | 15/30 | 1158/1177/1177 (10) | 1131.5/1176/1176 (10) | 1152/1174/1174 (5) | 1165/1189/1189 (5) |
| Electron default | 26/30 | 14/30 | 1134/1173/1173 (10) | 1156/1175/1175 (10) | 1136/1176/1176 (5) | 1139/1178/1178 (5) |
| Electron parity | 22/30 | 8/30 | 1121/1175/1175 (10) | 1116/1168/1168 (10) | 1146/1161/1161 (5) | 1132/1176/1176 (5) |
| Safari large | 30/30 | 16/30 | 1142/1166/1166 (10) | 1155/1176/1176 (10) | 1159/1169/1169 (5) | 1170/1173/1173 (5) |
| AppKit | 34/35 | 18/35 | 1150.5/1177/1177 (10) | 1161.5/1178/1178 (10) | 1127/1169/1169 (5) | 1167/1203/1203 (5) |

Last-post IPC times are in ms. Both mutation ranges overlap by length in all lanes. The four-median spreads are 33.5, 22, 30, 28 and 40 ms in table order. Direction remains mixed across lanes. AppKit selection timing p50/p95/max was **1161/1176/1176 ms** (n=5; all five flagged, three above the old band).

| Lane | Primary snapshot p50/p95 ms (main → fix) | Primary service p50/p95 ms (main → fix) |
| --- | --- | --- |
| CfT | 0.3/0.4 → 0.4/1.2 | 210.814/304.801 → 443.890/596.751 |
| Electron default | 4.6/14.6 → 4.3/7.9 | 226.692/268.434 → 394.766/544.007 |
| Electron parity | 3.3/6.4 → 3.0/5.6 | 135.902/269.523 → 386.738/546.501 |
| Safari large | 6.0/9.0 → 8.2/11.7 | 129.161/412.317 → 469.679/542.052 |
| AppKit | 0.5/1.1 → 0.7/1.3 | 212.190/378.646 → 397.424/560.666 |

## Standard-timeout fixed slots at 220 ms

[Wave-eight hosted run](https://github.com/SSFSKIM/cua/actions/runs/44386516599), workflow `422774845`, kit `f82dd4e8e9435e9cfd322ef9dcba3be448b6034e`, baseline `517ab5430a3a81718910b030488ba8d855087b21`, fix `405b63b333683669ac8d441daab31eb9d019d8cb`, mode `deadline`. The five stock lanes, paired positives, 30 concealed and 15 literal mutations per lane, and five AppKit selection controls are unchanged from wave seven. The only executable kit change is the second named hosted property selector.

Every AX read uses the usual 100 ms timeout instead of shrinking it near the cutoff. From the last native post, regular concealed reads start no later than +800 ms, the final length batch has its +900 ms slot, the final focus read its +1000 ms slot, and the failure deadline is +1100 ms. The 220 ms hold leaves a 680 ms drain allowance. The flag retains the 10 ms native tolerance after padding. The exact hosted proof runs the original `testConcealedTimingAndReasonsHoldOverRandomCases` plus `testExactControlsAnswerLengthMismatchOnTimeAtLiveCosts` (seed `0x414_F218`). Each runs 2,000 paired different-length cases. The second uses deterministic simulated costs of 20–90 ms per length batch and 10–90 ms per focus read, and requires exact adds/drops to refuse `lengthMismatch` on time and genuine fields to confirm. These simulated costs are not live measurements.

The stock bar is exact success, no false confirmations, expected mutation refusals without spurious `fieldUnreadable` or `fieldChanged`, equal short/long reason distributions per mutation, and privacy. Native deadline semantics are checked in the hosted properties. Stock reports late-flag prevalence and IPC timing separately; IPC arrival is not a native completion timestamp.

**Hosted workflow green; late replies are not rare.** All five lanes passed outcomes, reason parity, privacy and coverage, and **both named hosted properties passed** on the exact candidate. All 100 candidate positives delivered exactly and length-confirmed, and all 100 baseline positives delivered exactly and refused `secure`. Zero of 150 synchronous adds or 75 drops confirmed. Every concealed add/drop refused `lengthMismatch` in both the short and long cohorts; the 75 literal controls refused the expected `lengthMismatch` or AppKit `caretMismatch`. All five AppKit selection controls posted, delivered exactly and refused `lengthUnreadable`. This fixes the observed `fieldUnreadable` regression (62/150 → 0/150) and preserves zero `fieldChanged` (wave six had 78/150). `lateReply`, however, still appeared on **137/155 (88.4%)** measured failures, versus 138/155 in wave seven. The requested rarity criterion was not met; it is not a GitHub workflow gate.

| Lane | `fieldUnreadable` wave seven → eight (of 30) | `fieldChanged` wave seven → eight (of 30) | Wrong adds | Correct add / drop rejections | Reason parity (add/drop) | Privacy / invalid | `lateReply` |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| CfT | 9 → 0 | 0 → 0 | 0/30 | 30/30; 15/15 | Pass / pass | 0 / 0 | 26/30 |
| Electron default | 13 → 0 | 0 → 0 | 0/30 | 30/30; 15/15 | Pass / pass | 0 / 0 | 24/30 |
| Electron parity | 10 → 0 | 0 → 0 | 0/30 | 30/30; 15/15 | Pass / pass | 0 / 0 | 23/30 |
| Safari large | 17 → 0 | 0 → 0 | 0/30 | 30/30; 15/15 | Pass / pass | 0 / 0 | 30/30 |
| AppKit | 13 → 0 | 0 → 0 | 0/30 | 30/30; 15/15 | Pass / pass | 0 / 0 | 34/35 |

The earliest flagged IPC arrival was 1111 ms; four unflagged arrivals were 1111–1115 ms. No flagged arrival was at or below 1110 ms. All 71 above the old 1150 ms band had flags; 66 flagged arrivals were inside that band. This comparison includes transport time and does not contradict the exact native-clock property. All five posted AppKit selection controls were flagged, with p50/p95/max **1151/1155/1155 ms** (three above the old band). Their snapshot phase remains inferred, not traced. Hosted macOS was 26.7.2: CfT returned to 157.0.8103.78, the two Electron variants ran 44.4.5 / Chromium 152.0.7977.130, Safari 27.2. AppKit alone ran frontmost.

| Lane | Above old IPC band (1150 ms) | Short add p50/p95/max (n) | Long add p50/p95/max (n) | Short drop p50/p95/max (n) | Long drop p50/p95/max (n) |
| --- | ---: | --- | --- | --- | --- |
| CfT | 9/30 | 1139/1170/1170 (10) | 1136.5/1177/1177 (10) | 1137/1168/1168 (5) | 1116/1164/1164 (5) |
| Electron default | 16/30 | 1116.5/1186/1186 (10) | 1150/1173/1173 (10) | 1166/1176/1176 (5) | 1162/1172/1172 (5) |
| Electron parity | 12/30 | 1137.5/1182/1182 (10) | 1159.5/1170/1170 (10) | 1135/1149/1149 (5) | 1127/1155/1155 (5) |
| Safari large | 18/30 | 1168.5/1184/1184 (10) | 1151/1178/1178 (10) | 1159/1183/1183 (5) | 1157/1175/1175 (5) |
| AppKit | 16/35 | 1151.5/1175/1175 (10) | 1126/1185/1185 (10) | 1167/1175/1175 (5) | 1153/1160/1160 (5) |

Last-post IPC times are in ms. Short and long ranges overlapped for both mutations in all lanes. Four-median spreads were 23, 49.5, 32.5, 17.5 and 41 ms in table order. The direction was mixed; neither these spreads nor the old band were gates.

| Lane | Primary snapshot p50/p95 ms (main → fix) | Primary service p50/p95 ms (main → fix) |
| --- | --- | --- |
| CfT | 0.3/0.6 → 0.4/1.0 | 174.103/269.897 → 456.014/549.992 |
| Electron default | 3.5/6.5 → 2.8/6.3 | 113.736/246.649 → 392.091/504.402 |
| Electron parity | 2.5/5.5 → 2.7/5.4 | 138.994/246.349 → 379.910/520.502 |
| Safari large | 4.7/8.9 → 5.4/8.8 | 169.676/247.104 → 393.709/516.649 |
| AppKit | 0.3/0.7 → 0.5/3.0 | 162.339/246.016 → 364.469/545.739 |
