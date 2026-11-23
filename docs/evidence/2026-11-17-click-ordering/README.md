# #359: posted-click ordering across AX text actions (hosted, 2026-11-17)

The unmodified fix `f350ced9` produced **0 wrong final text/caret outcomes in 179 scorable ordinary clicked flows**, versus 7 on main `136183aa`. Click → select_text → type_text confirmed 59/59 scorable fix attempts, near its 59/60 no-click control. The fix never answered success in 56 qualified forced FIFO tails; main falsely confirmed 22/60.

**The tail result is an honest decline after typing, not prevention.** All 60 raw fix tails posted six units and ended with wrong text. Every fix reply was typeUnconfirmed/valueMismatch; none was selectionChanged with nothing typed. The literal 20/20 Firefox select_text condition is also not demonstrated: it is 19/19 correct plus one retained pre-send refusal on each head.

## Runs and reproducibility

All live work used disposable GitHub-hosted `macos-latest` runners, fresh owned profiles and a nonce/time-origin-bound fixture. No owner GUI, Mac mini or existing Chrome profile was used; no secret-store value was read or app/login credential entered. Measured input was never retried; invalid/refused attempts and unqualified stress remain in their original runs.

**Spike engine pin:** `15acf09b714dd19efc796e4a3a2ff8d57e2f7994` in all three spike runs.

**Qualification pins:** main `136183aa196a8fd80a0dcc3fe933adff67f9cc39`; fix `f350ced9b39230879e4a46d0f540175e0157a71e` (ruling 785 and its reviewed repair).

| Run | Kit | Evidence and status |
|---|---|---|
| [Spike background corpus 44107967517](https://github.com/SSFSKIM/cua/actions/runs/44107967517) | `6f8c739b764dff7f3039db8c273ba9a272ffa8b7` | 3,680/3,680 attempted; 3,437 valid, 243 click refusals; no missing ids |
| [Four-scene pilot 44112583792](https://github.com/SSFSKIM/cua/actions/runs/44112583792) | `714d9f286b48bc4b4746c97b3af2883b8461a4fa` | 120/120 attempted; 103 valid; 16 Firefox foreground-order setup failures and one click refusal retained |
| [Real-route/baseline follow-up 44126242634](https://github.com/SSFSKIM/cua/actions/runs/44126242634) | `99d6f17837b29717c07f54576a5e46df06408574` | 2,100/2,100 attempted; 2,098 valid; two first-click Firefox stale-area refusals |
| [Qualification busy-stress smoke 44149078402](https://github.com/SSFSKIM/cua/actions/runs/44149078402) | `e3b8a83ab745e3e389a100a8ebc2693a96d56597` | 90/90 attempted; 80 valid; Safari's busy task blocked click preflight, so its tail was not exercised; not pooled with the repaired stress |
| [Qualification FIFO smoke 44161922112](https://github.com/SSFSKIM/cua/actions/runs/44161922112) | `4815e4e524c8f78b902d6ab09306c75ca51c3644` | 90/90 attempted; 80 valid; all six head/browser tails qualified |
| [Full qualification 44169327522](https://github.com/SSFSKIM/cua/actions/runs/44169327522) | same `4815e4e5` | **1,320/1,320 attempted; 1,274 valid, 1,270 scorable**; no missing, unexpected, duplicate or mismatched ids |

Qualification builds each head in its own runner worktree, checks that the engine sources remain clean, and uses no engine patch, forced production route or probe argument. All 12 full-run unmodified-engine builds passed; zero patched-engine build steps ran. The spike's plain rate/control arms also use the unmodified engine; its separate trace/candidate binaries instrument only detached build sources. Their rates are never pooled with plain rates.

Artifacts retain `rows.jsonl`, `config.json`, per-shard `summary.json`, progress, transport logs, engine stderr and screenshot lineage, never browser profiles. The first two spike runs use `probe-359-<browser>-<editor>` artifacts; the follow-up appends `-script-keys` or `-ax-actions`. Qualification uses `probe-359-<browser>-<editor>-all`, containing separate main/fix subdirectories. Row ids below identify records in the named run's artifact.

Run trusted readers from the kit checkout (branch `probe/359-hosted`, where this README is `scripts/probe-359/README-evidence.md` at `fb6cfa42`), treating downloaded artifacts as data:

```sh
node scripts/probe-359/readers.mjs summarize SPIKE_BACKGROUND_ARTIFACTS TABLES
node scripts/probe-359/readers.mjs summarize SPIKE_DIAGNOSTIC_ARTIFACTS TABLES --diagnostic
node scripts/probe-359/readers.mjs summarize FIFO_QUALIFICATION_ARTIFACTS TABLES --qualification
```

Use the kit pin for the run. Reader `4815e4e5` reconstructs the full qualification plan from surviving configs, including absent heads or shards, and intentionally rejects the earlier busy-stress request. A driver's per-shard summary is not the dispatch-wide denominator. All 90 focused kit/transport tests passed; independent reviewer-medium checks closed the kit findings before dispatch. No full local npm test or local GUI probe was run.

## The spike: the late carrier is the foreground posted click

The original background/end-caret corpus did not reproduce the placement error: primary rate **0/437 wrong**, no-click control **0/480**, and instrumented candidate typing **0/1,760**. Its no-typing trace/isolation arms recorded no late script-caret reversion. Those are distinct denominators, not one pooled rate.

The kit had changed two conditions from #354's reproducer: it covered the browser and started at the seed's end instead of caret 3. The four-scene pilot crossed foreground/background with initial caret 3/end. CfT foreground was wrong 5/5 from either initial range; Safari was wrong 1/5 at caret 3 and 2/5 from the end. Covered scenes did not reproduce the error. Firefox's foreground pilot coverage was inadequate because 16 setups failed physical window-order verification; those attempts remain invalid. The follow-up repaired only owned-window setup and retained its two first-click refusals.

Natural foreground click traces show **two posted mouse events and no AX selection/focus write or AX action inside the click**. The reproduced carrier is therefore the posted click, not #341's range write. These foreground failures made no “placed” claim; the spike did not falsify #341's placed read-back.

In the follow-up's natural script-selection trace, strict reversion after click return was CfT 12/20 (p50/max 19/37 ms, plus six timing ambiguities) and Safari 5/20 (14/28 ms). Firefox had no strictly timed reversion in that arm and five ambiguities; its separate typing trace and pilot contain sparse late reversions, not a pooled percentile. The pilot also retained a **419 ms plain CfT tail**: full script selection at +9–10 ms, mousedown +345 ms, collapsed caret +419 ms, first input +710 ms, wrong final text with a confirmed reply. Instrumented medians do not replace that plain outlier.

### Foreground main rates before the fix

Run [44126242634](https://github.com/SSFSKIM/cua/actions/runs/44126242634), plain rate arms only: textarea, physically foreground, initial caret `[3,0]`, 20 requested repetitions per cell. Here “wrong” means wrong final **text**. Script selection is a diagnostic control, not an agent action. set_value is terminal in this spike, unlike the typed value continuation in qualification.

| Browser / continuation after click | Wrong final text / scorable | type_text success / typeUnconfirmed | Success on wrong text | set_value answers |
| --- | --- | --- | --- | --- |
| Safari script select → type | 7/20 | 20 / 0 | 7 | not called |
| Safari Cmd+A → type | 0/20 | 19 / 1 | 0 | not called |
| Safari select_text → type | 3/20 | 17 / 3 | 1 | not called |
| Safari set_value (terminal) | 0/20 | not called | not applicable | 20 ok |
| CfT script select → type | 19/20 | 13 / 7 | 13 | not called |
| CfT Cmd+A → type | 0/20 | 20 / 0 | 0 | not called |
| CfT select_text → type | 1/20 | 4 / 16 | 1 | not called |
| CfT set_value (terminal) | 0/20 | not called | not applicable | 20 ok |
| Firefox 159 script select → type | 2/19 | 9 / 10 | 2 | not called |
| Firefox 159 Cmd+A → type | 0/20 | 20 / 0 | 0 | not called |
| Firefox 160 select_text → type | 0/19 | 4 / 15 | 0 | not called |
| Firefox 160 set_value (terminal) | 0/20 | not called | not applicable | 20 ok |

All 12 corresponding no-click controls were 0/20 wrong. Firefox's two 19-scorable cells each retain one pre-send stale-area refusal. CfT was 157.0.8103.78; Safari was 27.2. Firefox's script/keyboard shard used 159 and its AX-action shard 160; images also differ by shard. Do not interpret a cross-route difference as a controlled version comparison.

Terminal set_value protected its replacement value, not the queue or the next caret-dependent action. Safari rep16 had `NEW359`, caret `[6,0]` at +2 ms after the write returned, then mousedown at +8 ms and click at +9 ms left `[3,0]` through the 1.5 s tail.

The four short reread/stability candidates had no accepted wrong final text in the foreground follow-up, with 20 repetitions per browser/continuation cell. stable50's select_text gate medians were 63–76 ms. This is finite instrumented mitigation evidence, not a queue-drain acknowledgement or coverage of the 419 ms plain outlier. The notification candidate received no selected-text receipt in 80/80 CfT or 80/80 Safari attempts; Firefox received 80/80, but those callbacks were not uniquely tagged acknowledgements.

### #354's baseline trace: exact equality can confirm the wrong intent

In the follow-up's `probe-359-cft-textarea-script-keys` artifact, inspect `diagnostic/candidates/foreground-equal/type-trace/cft/textarea/script/natural/<rep>`. The typing trace records the **existing** snapshot and comparison calculation without adding AX reads. It serializes public-fixture identity flags and lengths, not raw AX value strings. The plain-rate table above is separate from this instrumented arm.

Times are milliseconds after click RPC return. The public seed is `Old draft sentence goes here.` (29 UTF-16 units); requested replacement is `NEW359` (6).

| Rep | DOM collapsed-caret notification | Actual AX snapshot interval / range | Computed comparison | Reply / final text |
|---|---|---|---|---|
| 5 | +8 | +14.477–14.833; seed, `[3,0]` | `OldNEW359 draft sentence goes here.` (35), computed +60.981 | success; AXValue equals that identity at +86.226; wrong final text |
| 6 | +19 | +10.637–11.460; seed, `[3,0]` | same 35-unit insertion, computed +57.191 | success; wrong final text |
| 1 | +16 | +12.916–13.286; seed, `[0,29]` | `NEW359` | honest typeUnconfirmed when the final value is the 35-unit insertion |

Rep5 takes its baseline after the observed revert. In rep6 the AX range and last reported DOM selection disagree; notification delay versus cache lag cannot be separated by those timestamps. DOM selectionchange is notification time, not exact mutation time; clock uncertainty is 6 ms in rep6 and 5 ms in rep1. Do not infer an exact snapshot epoch from snapshotMs.

#354's equality check is faithful to its own starting snapshot. The ordering gap lets that snapshot already be wrong relative to the intended selection. Relaxing equality would hide the problem, not fix it. The separate real select_text typing-trace cell also had 20 correct final replacements but 20 unconfirmed answers from unsettled baseline ranges; wrong text and correct-text confirmation declines are different outcomes.

## What qualification judges

Real agent-route continuations use the ordinary unmodified engine API; background script selection remains a fixture-only control. The fixture's own DOM is the text/caret judge. Foreground uses textarea and initial caret `[3,0]`. The value route writes `NEW359` and then really types `NEW359`, expecting **`NEW359NEW359`, caret `[12,0]`**. Other ordinary routes expect `NEW359`, caret `[6,0]`. No observation, read or controller sleep is inserted between measured click, continuation and type.

Owned-window identity, physical order, focus and initial text/range are verified before measurement. #366's accessibility-readiness wait completes in observations/warmups before the measured interval. DOM tails are requested at 0/250/1500 ms after the final RPC and keep actual timestamps. Refused clicks, safe no-input declines, after-typing declines and successful intended placement are not interchangeable.

The full run retains 46 Firefox pre-send click refusals: 8 screenChangedSinceScreenshot and 38 backgroundClickRefused. It has no missing evidence or observed DOM/native clock-envelope, short-tail, foreground-PID, context-loss or truncation violations. Its four unqualified tails remain outside safety scoring. Workflow green is not substituted for these scientific denominators.

Reason codes in the next tables: **V** = typeUnconfirmed/valueMismatch; **F** = fieldUnreadable; **I** = fieldChanged. A reported readability/identity reason is not proof that the actual DOM editor changed.

## Table 1. Ordinary foreground qualification

20 requested attempts per cell. Clicked entries are **wrong/scorable; typing answers**. Every no-click control is **0/20 wrong**; its columns show only typing answers.

| Browser / continuation | Main clicked | Fix clicked | Main no-click typing | Fix no-click typing |
| --- | --- | --- | --- | --- |
| Safari select_text → type_text | 4/20; 16 ok, 4V | 0/20; 20 ok | 20 ok | 20 ok |
| Safari set_value → type_text | 3/20; 19 ok, 1V | 0/20; 20 ok | 20 ok | 20 ok |
| Safari Cmd+A → type_text | 0/20; 20 ok | 0/20; 20 ok | 20 ok | 20 ok |
| CfT select_text → type_text | 0/20; 5 ok, 1F, 14V | 0/20; 20 ok | 20 ok | 20 ok |
| CfT set_value → type_text | 0/20; 3 ok, 17V | 0/20; 20 ok | 20 ok | 20 ok |
| CfT Cmd+A → type_text | 0/20; 19 ok, 1V | 0/20; 19 ok, 1F | 19 ok, 1V | 20 ok |
| Firefox select_text → type_text | 0/19; 5 ok, 14V; 1 pre-send refusal | 0/19; 19 ok; 1 pre-send refusal | 18 ok, 2V | 19 ok, 1F |
| Firefox set_value → type_text | 0/20; 12 ok, 8V | 0/20; 20 ok | 20 ok | 19 ok, 1V |
| Firefox Cmd+A → type_text | 0/20; 20 ok | 0/20; 20 ok | 20 ok | 19 ok, 1V |

Every value-write cell—each browser, head and rate/control arm—answered **20/20 set_value ok**. Across all 240 writes, valueUnconfirmed was 0: valueChanged 0, caretMoved 0, fieldClosed 0, unknown 0. The controlled fixture never changes into a closed/password field, so this is not live coverage of that failure mode.

All 179 scorable clicked fix flows have correct final text and caret. The remaining Firefox select_text attempt was refused before input on both heads, not retried or counted as a successful placement. Main's seven wrong flows are all Safari: four select_text and three value continuations. Two of the latter answered typing success despite wrong text.

For a concrete value continuation, main row `qual/foreground/main/rate/safari/textarea/set_value_type/6` in the full run has `NEW359`/caret 6 at +5 ms after click return; set_value returns at +6 ms; the pending click moves the caret to 3 at +12 ms; input starts at +24 ms. Final `NEWNEW359359`/caret 9 still gets confirmed success. The unmodified run does not expose an exact AX baseline trace for this row.

## Table 2. FIFO tail qualification

The fixture's per-pid tap holds the **original pointer pair and every subsequent posted event to that pid**, leaving AX runnable, then replays originals once in captured order. No extra click or measured-input retry is sent. The request is labelled `queue-hold-v1`, separate from busy-renderer stress.

A scored tail must prove an intact captured/released pair and the complete expected typing inventory, one consistent source, no early release/copy failure/overflow/extra event, actual late DOM delivery, and selection plus baseline exposure before delivery. Baseline exposure comes from either an early complete RPC or the **actual first key-post timestamp**, which follows the baseline, never a snapshotMs reconstruction. Qualification is answer-independent. Same-page seq/monotonic order rejects key/input overtaking; cross-process RTT uncertainty does not excuse it.

The handoff is qualified only for a **quiescent measured producer**: all key posts finished before replay, with all expected events already captured. A continuing/partial producer is unqualified rather than assumed FIFO-safe. The watcher is not a generic continuous-stream replay guarantee.

| Browser | Main qualified / requested | Main qualified answers | Fix qualified / requested | Fix qualified answers |
| --- | --- | --- | --- | --- |
| CfT | 20/20 | 20 success on wrong text | 19/20 | 19 typeUnconfirmed/valueMismatch |
| Firefox | 20/20 | 18 typeUnconfirmed/valueMismatch, 2 success on wrong text | 17/20 | 17 typeUnconfirmed/valueMismatch |
| Safari | 20/20 | 20 typeUnconfirmed/valueMismatch | 20/20 | 20 typeUnconfirmed/valueMismatch |

All 120 attempted tails are valid and have the same final `OldNEW359 draft sentence goes here.`, caret `[9,0]`. Every row reports entered 6. **There are zero seed-untouched / entered-0 / selectionChanged tails.** Thus this establishes the clarified never-ok criterion through read-back declines; it does **not** establish the stronger original expectation of preventing typing when the cap is exceeded.

The four excluded fix rows—one CfT and three Firefox—are `stressNotBeforeClick` same-millisecond resolution ambiguities: a fractional Swift stress timestamp appears later than a truncated JS click-start timestamp. They also answered typeUnconfirmed/valueMismatch and had intact holds, but were **not readmitted post hoc or rerun**. The primary fix tail denominator is 56 qualified attempts, 17–20 per browser; separately the literal raw success count is 0/60.

Every tail captured/released 26 originals: one pointer down/up, six key-downs, six key-ups and twelve flags events. Last key posts precede release by 795–886 ms on fix and 907–952 ms on main. Actual mousedown is **988–1014 ms after click return**; the nominal 900 ms timer releases 83–96 ms late. Mousedown follows release by 1.3–27.3 ms. The type call ends 38–202 ms after mousedown, so the first-post timestamp, not whole-RPC return, proves baseline exposure. No DOM key/input preceded the pointer.

Load-bearing full-run row ids: `qual/tail/main/rate/cft/textarea/select_text/1` (confirmed wrong insertion), Firefox main reps 9 and 19 (same false success), and `qual/tail/fix/rate/safari/textarea/select_text/1` (same wrong insertion, honest valueMismatch). Inspect their events, `type.meta` and `ax.pointerHold` in the run's artifact.

## Table 3. Background subset

10 requested attempts per cell; **wrong/scorable; typing answers**. A fully refused cell has no scorable typing denominator, not a clean 0% wrong-placement rate. Waits are actual fix `typeReadback.baselineWait.waitMs` percentiles.

| Browser / editor / selection | Main | Fix | Fix baseline wait p50/p95 ms |
| --- | --- | --- | --- |
| Safari textarea script | 0/10; 10 ok | 0/10; 10 ok | 68.1/97.6 |
| Safari textarea Cmd+A | 0/10; 10 ok | 0/10; 10 ok | 107.6/136.6 |
| Safari input script | 0/10; 10 ok | 0/10; 10 ok | 77.3/98.5 |
| Safari input Cmd+A | 0/10; 9 ok, 1V | 0/10; 10 ok | 93.5/144.5 |
| Safari contenteditable script | 0/10; 10 ok | 0/10; 10 ok | 70.4/99.5 |
| Safari contenteditable Cmd+A | 0/10; 9 ok, 1V | 0/10; 10 ok | 89.2/137.6 |
| Safari compose script | 0/10; 10 ok | 0/10; 10 ok | 73.0/130.8 |
| Safari compose Cmd+A | 0/10; 9 ok, 1V | 0/10; 10 ok | 99.2/146.3 |
| CfT textarea script | 0/10; 8 ok, 2V | 0/10; 7 ok, 3V | absent |
| CfT textarea Cmd+A | 0/10; 10 ok | 0/10; 10 ok | absent |
| CfT input script | 0/10; 7 ok, 3V | 0/10; 8 ok, 2V | absent |
| CfT input Cmd+A | 0/10; 8 ok, 2V | 0/10; 9 ok, 1I | absent |
| CfT contenteditable script | 0/10; 5 ok, 5V | 0/10; 9 ok, 1V | absent |
| CfT contenteditable Cmd+A | 0/10; 9 ok, 1V | 0/10; 10 ok | absent |
| CfT compose script | 0/10; 5 ok, 5V | 0/10; 8 ok, 2V | absent |
| CfT compose Cmd+A | 0/10; 10 ok | 0/10; 10 ok | absent |
| Firefox textarea script | 0/10; 5 ok, 5V | 0/10; 2 ok, 8V | absent |
| Firefox textarea Cmd+A | 0/10; 10 ok | 0/10; 10 ok | absent |
| Firefox input script | 0/9; 3 ok, 6V; 1 pre-send refusal | 0/9; 7 ok, 2V; 1 pre-send refusal | absent |
| Firefox input Cmd+A | 0/10; 10 ok | 0/10; 10 ok | absent |
| Firefox contenteditable script | 10 refused; not scorable | 10 refused; not scorable | not exercised |
| Firefox contenteditable Cmd+A | 10 refused; not scorable | 10 refused; not scorable | not exercised |
| Firefox compose script | 0/9; 4 ok, 5V; 1 pre-send refusal | 0/9; 2 ok, 7V; 1 pre-send refusal | absent |
| Firefox compose Cmd+A | 0/10; 10 ok | 0/10; 10 ok | absent |

Both heads have **0/218 wrong final text/caret outcomes**. CfT has **80 placed claims per head**, ten in every cell. The 138 scorable AX-route background clicks per head—CfT AXSelectedTextRange and Firefox AXPress—have no pendingClick or baselineWait record, including zero-time records, and no observed raise.

Safari is different on both heads: inputRoute 3, coordinateClick and no elementClick action take the **posted** shared-hold path. Its waits in 80/80 fix cells are ruling-785 cost, not a #341 no-arm defect. Safari typing confirmed 77/80 → 80/80 while wrong rate remained 0/80. Firefox's inputRoute 3 alone does not mean posted input here: its elementClick action is AXPress.

The order-only watcher observes **22/80 main and 28/80 fix Safari transient window reorders**, with zero foreground-PID changes. These are retained #321/shared-hold constraint evidence, not a claim that Safari never raises or that incidence distributions are equal. No other browser has a measured reorder. The 50 ms order sampling cannot rule out shorter effects.

## Table 4. Latency

All pairs are **p50/p95 milliseconds**, ordinary rate arms only. “Action” is select_text, set_value or Cmd+A; typing is a separate RPC. Absent metadata is not an invented zero. Firefox select_text has n=19; other rows n=20.

| Browser / route | Fix pre-action wait | Fix typing-baseline wait | Action RPC main → fix | Type RPC main → fix |
| --- | --- | --- | --- | --- |
| Safari select_text | 73.2/96.2 | 0.2/0.3 | 9/18 → 79/111 | 73/1070 → 74/114 |
| Safari set_value | 73.6/98.3 | 72.8/92.8 | 12/24 → 162/197 | 71/182 → 149/182 |
| Safari Cmd+A | absent | 106.9/143.5 | 6/12 → 6/11 | 182/260 → 238/295 |
| CfT select_text | 67.9/91.8 | 0.4/43.9 | 12/18 → 93/411 | 1058/1076 → 91/140 |
| CfT set_value | 68.5/94.8 | 78.6/96.3 | 17/20 → 196/241 | 1060/1071 → 158/188 |
| CfT Cmd+A | absent | 120.2/149.9 | 12/23 → 13/28 | 181/225 → 279/322 |
| Firefox select_text | 74.3/95.9 | 0.2/0.7 | 15/33 → 85/110 | 1060/1079 → 84/101 |
| Firefox set_value | 77.5/95.4 | 76.6/98.6 | 21/109 → 170/214 | 91/1078 → 164/202 |
| Firefox Cmd+A | absent | 92.5/143.5 | 17/25 → 11/70 | 161/209 → 235/298 |

set_value additionally pays its post-write watch: Safari **74.3/95.1**, CfT **101.3/128.9**, Firefox **68.8/118.8** ms. That is included in the action RPC, not the pre-action wait column.

The waits can reduce net latency by avoiding #354's one-second false-unconfirmed poll. Complete select_text-flow median is **1085 → 204 ms on CfT**, **1086 → 177 ms on Firefox**, and **89 → 170 ms on Safari**, which eliminates the observed Safari misplacements. Cmd+A's own RPC does not wait; its following type pays a gate, adding **50–96 ms to complete-flow medians**. A 50 ms dwell is not a 50 ms total action cost.

## Environment and limits

- Full foreground textarea uses CfT **156.0.8078.80**, Firefox **160.0**, Safari **27.2**. CfT input/compose use 157.0.8103.78 and contenteditable 156; Firefox input uses 160 and compose/contenteditable 159. Smoke textarea was CfT157/Firefox159. Images `20261102.0473.1` and `20261112.0504.1` roll by shard. **Both heads are matched within a job**; no cross-version/image rate is pooled or called a version regression.
- Firefox select_text is **19/19 scorable plus one pre-send refusal**, not 20/20 successful attempts. The unsupported background contenteditable cells remain fully refused on both heads. No replacement trial conceals an exclusion.
- Forced tails demonstrate **honest after-typing decline**, not corruption prevention or a universal click-finality/queue-drain fence. Four conservative timestamp ambiguities remain unqualified, and the release protocol has only the bounded producer-quiescent qualification above.
- Foreground qualification is textarea only. Background is the requested four-editor subset, **not the complete fresh/scrolled/six-layout #341 suite**. The synthetic compose field is not Gmail or another production rich editor. Other apps, multiple-field interactions, paste/IME and non-Latin routes are not qualified.
- Safari's background wait is the expected price of its posted route. Its observed window reorders are not erased by correct final text or clean post-RPC samples. Safari's hosted page screenshots remain blank; owned AX geometry and actual DOM pointer/caret events support the mapping, not visual page inspection.
- DOM notifications do not reveal an exact mutation instant. Missing/coalesced notifications are not reconstructed from first input. The 1.5 s tail and finite cells do not prove absence of every later effect.
- The spike and qualification use different engine pins and, in places, different browser images. Only within-run matched head comparisons support fix claims. No production source change was committed; spike instrumentation was confined to detached builds and qualification engines were unmodified. The vendor runtime, owner profiles and secret store were untouched, and no permission dialog was clicked or edited.
