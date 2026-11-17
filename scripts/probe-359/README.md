# #359: measure the late caret, before choosing a fix

**Hosted A/B runs are authorized by the owner (design ruling 1ea561bc:733).** The workflow has a push trigger limited to `probe/359-hosted` and this kit's paths, defaulting to the 200-attempt smoke; manual dispatch defaults to smoke too. Pushing a trigger-matching commit without `[skip ci]` starts a run and registers the workflow. Push only when ready to run; later kit commits use `[skip ci]`, and full measurement is an explicit dispatch (`reps=20, smoke=false`).

This is an experiment branch, never a product change or a PR to main. The offline kit is `probe/359-measure` at `f4ccd10b`, based on `origin/probe/354-measure` at `9c36bed5`. Both engine arms now pin current main `15acf09b714dd19efc796e4a3a2ff8d57e2f7994`, including #354, #360 and #366. Refresh and record the pin at smoke dispatch; keep full-run evidence on the smoke-qualified pin unless a new pin is separately smoked. `patch.mjs` changes only a detached build source and refuses to patch the kit checkout. The branch contains no changes under `native/`.

Pre-dispatch verification (2026-11-17): reviewer-medium found the observation-timings evidence gap and verified its repair in `6aa02513`; no material findings remain. The 30 focused kit/transport tests and workflow lint pass. The watcher and patched engine compile without GUI launch. The registration/smoke commit intentionally omits `[skip ci]`; other kit commits retain it, and only this probe's branch/path filter matches the push.

## What is already known, and what is not

Read #359 and #354's findings comment `6771144651`. The local `~/.local/share/probe-354/click-order-facts.json` contains 20 Safari/Chrome rows: script selects the whole seed, then a collapsed caret reappears before input in some traces. One Chrome caret event is 237 ms after click return. This makes a single readback insufficient evidence of finality; it does not identify which engine step caused the delayed effect.

The older Firefox number in the issue is provisional. #354's earlier Firefox command channel could observe a hidden realm. The currently supplied facts file contains no Firefox rows. This kit reruns Firefox using #354's owned v3 transport; it never treats the old Firefox rate as a reliable prior denominator.

The source has an important distinction:

- Chromium's coordinate text-entry route is #341's selection write, focus readback, AXFocused fallback if necessary, range readback, then the reference-box check (`WebAreaFocus.swift`, `focusPlacingCaret`).
- **#324 is WebKit's `focusField` route for set_value/select_text, not a general coordinate-click route.** Safari's ordinary coordinate click can be posted; an element-action path can instead write the caret through #313. The trace records what actually ran; it does not assume a #324 write occurred in a coordinate click.
- Firefox's web text-entry route is its action and focus readback, not a caret write. A direct action control can distinguish that carrier from Chromium's.

References: Decision Log entries #283, #324, #341 in `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` on the pinned engine; the coordinate branch of `Input.swift`, `WebAreaFocus.swift`, `ElementInput.swift`, `AX.swift`, and `DesktopGate.swift`.

## Run plan

The registration smoke `44098241467` is rejected setup evidence: 36 invalid attempts, 164 missing, zero measured clicks. The driver had not created `OUT/shots`, while the engine deliberately creates only the final screenshot directory. The kit now prepares that parent before observation, with a fail-before/pass-after filesystem regression. Keep that run separate from subsequent smoke and full results.

First run an explicitly labelled `reps=1, smoke=true` smoke (200 attempts). Check all 12 visible-owner bindings, field roles, screenshot points, cover order, AX notification registration results, and complete tail samples. A failed smoke is not rate evidence and is not followed by automatic input retries. Fix the kit, not the measured outcome, before approving a full run.

A full run has **3,680 requested attempts**, on Safari, Chrome for Testing, and Firefox, each with textarea, input, contenteditable, and a compose-style contenteditable. Compose is a synthetic nested editor, not a claim about Gmail or another production composer. Every cell uses shared mode and a physically overlapping TextEdit cover. The fixture seed is public synthetic text only.

| Corpus | Cells and repetitions | Requested attempts | Answer |
|---|---|---:|---|
| Primary rate | 3 browsers × 4 editors × 2 selections × 20 | 480 | How often click → immediate script selection or Cmd+A → type ends with exactly the replacement |
| No-click control | Same 24 cells × 20 | 480 | How much of the wrong final text exists without a click, especially Cmd+A's known race |
| Natural trace, no typing | Same 24 cells × 20 | 480 | Whether a caret reappears after selection without type_text as a possible cause; which writes/actions/posts actually ran |
| Isolated step, no typing | Chromium range-only and focus-only; Safari range-only; Firefox press-only; each × 4 editors × 2 selections × 10 | 320 | Whether an individual carrier can reproduce a delayed focus/caret effect, separately from natural-route frequencies |
| Four candidates | Each of reread50, reread100, stable50, stable100 × the 24 cells × 20 | 1,920 | Added latency, refusal rate, and false acceptance of each proposed wait/readback |

`readers.mjs` exports `cells()` as the executable manifest. IDs include suite/browser/editor/selection/mode/repetition. Each browser/editor shard has 320 attempts on Chromium or 300 on Safari/Firefox. The workflow has 12 jobs, at most six concurrent: two waves, 60 minutes maximum per job and a 45-minute measurement budget per shard, sized for about 1–2 hours with runner capacity. This is a sizing expectation, not a locally measured runtime or a promise about queueing.

Plain pinned engines carry primary rates and no-click controls. A separate patched binary carries trace, isolation, and candidate experiments. Their rates must not be pooled: tracing and sampling can perturb the race. One engine process runs at a time per shard. Plain and traced blocks are separate; within each block, repetitions/selection/suite/candidate arms are deterministically interleaved.

### Per-attempt protocol

1. Bring only the disposable runner browser forward. Bind the page's random nonce and time origin to its visible AX window title using #354's owned transport. The `probe354:` title is deliberately retained for that protocol; experiment records and artifacts say #359.
2. Build the fixture and focus it by script, with its caret at the seed's **end**, not the measured click's offset. No preparation engine click can leave an earlier caret write pending.
3. Complete both connection warmup observations before any attempt; record their start/end and metadata. #366's cold Chromium accessibility wait (about 2.5 s when present on the pinned main) completes here, never inside a measured click. Observe once with a screenshot on the same engine connection that will click, also recording its interval. Require exactly one labelled fixture AX field. Its monospace point is the field's AX frame +35,+20 (nominal offset 3); the actual write's range is recorded in traced runs. A smoke must validate this mapping in each editor/browser.
4. Bind the AX watcher to that labelled field within the nonce-matched window. Move the disposable cover forward, settle deactivation for 250 ms, and verify the seed, intended end caret, foreground PID, and browser-behind-cover order. No setup failure becomes a semantic success.
5. Click once (or skip it in the no-click control). **Immediately issue selection, then type** in the rate/candidate arms. No observation, AX read, cover check, or wait is inserted between those calls by the controller. Script selection has unavoidable transport latency, measured explicitly. Cmd+A has its own RPC latency. A candidate's wait is inside the click before its answer.
6. Keep DOM event history and take tail samples requested at 0/250/1500 ms after the final call. Record actual times, not timer targets. Trace/isolation arms omit typing and watch the selection for that same tail.
7. Stop the observer, check that the visible window is still the bound nonce, and read foreground state without activation. Context loss is invalid evidence with posted actions retained, never retried. A raise is a separate constraint failure and does not erase a scorable text outcome.

There are no automatic measured-action retries. Engine startup retries only the socket connection on ENOENT/ECONNREFUSED, within 15 s; ping and all RPCs are issued once. Three consecutive invalid setups abort a shard. Incomplete rows, refusal stages, missing IDs, and rejected transport answers remain in the evidence. The 1.5 s observation horizon is finite: no change within it does not prove no later effect exists.

## Instrumentation and candidate prices

The natural trace adds **no extra AX read inside the engine click**. It logs actual gated write/action/post starts and ends, returned focused/range reads, element hashes, AX errors, epoch timestamps, and monotonic timestamps. It does not read or log AX values. Activation-point posts and the final point can be distinguished by their recorded coordinates and input meta.

The hosted watcher uses AXObserver for selected-text and focused-element notifications, reports each registration's error, and separately samples the retained fixture field's range/focus at a requested 10 ms interval. Notification arrival is not application-effect time. Sampling may be delayed by an AX call (100 ms per-read timeout); begin/end timestamps are retained. Window-order observations run at a requested 50 ms cadence in instrumented arms. NSWorkspace activation notifications also run in plain arms. Plain arms have only before/after window-order samples, so they do not prove absence of transient reordering.

The DOM records focus/blur, selectionchange, pointer, key and input events, state at those events, and the explicit script-selection commit, with epoch and monotonic timestamps. Each fixture response is owned, expiring, and no-store. Cross-process ordering near a boundary is left ambiguous using the setup command's RTT as a conservative timing uncertainty. Browser-local event ordering remains available in raw timelines even when that conservative cross-process test cannot score it.

Candidates are deliberately small counterfactuals, not product fixes:

- **reread50 / reread100:** snapshot focused range, wait at least 50/100 ms, reread, and accept only a nonnil equal range. For an engine caret write it must also equal the written range.
- **stable50 / stable100:** require a nonnil focused range unchanged for 50/100 ms, sampled at 10 ms, within a soft 1 s budget. Each new AX read has a 100 ms timeout; real overrun is retained. A read that fails or changes restarts the dwell.

An unbound/secure/unreadable target is unconfirmed. The candidate ancestry binding and reads add cost beyond the dwell. `barrier.ms` prices the wait/read portion; complete click p50/p95/max includes binding, normal click work and instrumentation. Report both, alongside matched natural traces and the uninstrumented click baseline. A candidate returning unconfirmed does **not** stop the experiment from selecting/typing: that is how its would-refuse and false-accept behavior is measured without retrying input. The original product result/meta is preserved; the counterfactual decision is `click.probe.barrier.confirmed`, never a changed public "placed" answer.

Range stability is not a proof of queue drainage. An already-equal cached range may remain equal for the entire dwell and still be applied again later. Candidate acceptance followed by a script selection's pre-input caret reversion falsifies that candidate. Wrong final text in Cmd+A arms is only an end-to-end failure, not a uniquely attributed click failure.

Direct AX controls are labelled isolated carriers, not production click outcomes. Safari's AXFocused write is deliberately absent because it is already known to raise Safari. The natural trace alone determines whether Chromium's fallback ran; if it never did, that path has a natural denominator of zero, not evidence that it is safe. The Chromium focus-only isolation is not a substitute for a naturally needed fallback.

## Separate equal-range diagnostic

The 3,680-attempt corpus is background, initially at the seed's end. It does **not** reproduce #354's original setup: the actual click-order facts have `/front/` IDs, and script-only preparation left the caret at offset 3, already equal to the measured click's target. A read-back can therefore pass without witnessing any transition. Do not infer equal-range safety from a clean changed-range run.

The separately authorized diagnostic leaves the full run at kit `6f8c739b` unchanged. It reuses the same input boundary and engine pin, never retries input, and labels every ID and group by diagnostic kind and scene. All preparation remains script-only, so an equal range does not inherit a preparation engine click.

- `diagnostic=pilot, reps=5, smoke=false`: textarea in all three browsers; foreground/background × caret 3/end; script selection; separate plain rate and instrumented trace arms. 120 requested attempts.
- `diagnostic=confirm, reps=20, smoke=false`: the closest original scene only (Chrome, foreground, caret 3), script selection, plain and trace. 40 requested attempts, used if the five-repetition pilot does not reproduce.
- `diagnostic=candidates, reps=20, smoke=false`: the selected `scene` and `diagnostic_browser` (`all` or one browser), with **script selection, Cmd+A, real select_text, and real set_value** continuations. The latter terminates after its value write, with no invented type_text answer. Plain rate/control, no-typing natural trace, a separate instrumented typing trace, and five candidate modes have 20 requested repetitions per cell. Typing trace omits set_value because it does not type; isolated carriers are not repeated in this foreground follow-up. This is 2,100 requested attempts for all three browsers, split into six disjoint route shards (360 script/keyboard and 340 AX-action attempts per browser), within the original per-shard budget.

The pilot `44112583792` kept 16 Firefox foreground window-order setup failures: both helpers reported its PID foreground, but its window remained behind the cover. Foreground-only setup now raises the already nonce-bound owned window once, then verifies fresh PID, physical order, and intended DOM caret before measurement. This setup raise never runs inside a measured interval or in a background cell; product-caused transient reorders remain separately recorded, and no measured input is retried.

The diagnostic-only fifth candidate, **notify-selected**, registers AXSelectedTextChanged on the bound target before the click, pumps a private worker-thread run-loop mode for a soft 1 s, then requires a same-target receipt plus focused/readable range (equal to a written range when there was one). Registration errors, receipt times, observed ranges and teardown errors are retained. A callback may be stale or coalesced: it is a candidate, not a unique acknowledgement. It introduces no input or raises. There is no claimed window-server queue-drained oracle.

The new `type-trace` arm and candidate arms log the existing #354 snapshot and expected-comparison boundaries, with no extra AX reads. Opt-in requires hosted execution, public text exactly `NEW359`, and non-concealed typing. Value evidence is only UTF-16 length and exact-equality flags for the public seed, requested replacement, and offset-3 insertion; raw AX values are never serialized. Plain rate/control remain the unmodified engine. This distinguishes a baseline taken after a caret reversion from a stale AX baseline without inventing its timing from `snapshotMs`.

Diagnostics have their own workflow concurrency group so a pilot can run beside the unchanged full run. Their default is off; a leftover `diagnostic_browser` choice cannot narrow the normal 12-shard corpus. Each diagnostic config retains both its local `planned` manifest and the dispatch-wide `diagnosticRequest` (kind, repetitions, browsers, scene); confirm records only cft regardless of the browser choice. Summarize a downloaded diagnostic directory with `readers.mjs summarize INPUT OUTPUT --diagnostic`; the reader reconstructs the full requested plan from that request, so a browser job that failed before producing a config still counts as missing coverage. Missing or inconsistent requests are rejected, including older configs without this field. The ordinary reader refuses diagnostic rows, and diagnostic groups keep the four scenes separate. Never merge these rows into the 3,680 or into smoke evidence. Actual image/browser versions remain per-shard qualifications.

## Readers

All readers run offline, without importing the GUI driver.

```sh
node scripts/probe-359/readers.mjs plan
node scripts/probe-359/readers.mjs summarize /absolute/downloaded-artifacts /absolute/tables359
node scripts/probe-359/readers.mjs timeline /absolute/downloaded-artifacts /absolute/tables359
# Smoke is rejected by the primary summary unless explicitly requested:
node scripts/probe-359/readers.mjs summarize /absolute/smoke-artifacts /absolute/smoke-tables --smoke
```

- `summary.json`: requested/attempted/valid/invalid/refused counts, missing/unexpected IDs, wrong final text, per-attempt `type_text` answer counts, false success (success on wrong DOM text), honest unconfirmed (typeUnconfirmed on wrong DOM text), unconfirmed on correct DOM text, placed claims followed by an observed late script-caret reversion, ambiguous timings, constraint failures, candidate confirmations/refusals/accepted-wrong outcomes, and latency percentiles by cell. Duplicate IDs fail loudly. Smoke and primary rows cannot mix.
- `timeline.jsonl`: original controller/engine/DOM/AX events normalized against **both click return and next-call start**, while retaining absolute timestamps and source. Use it to inspect each traced step, not just final text.
- Raw artifacts: rows, config with the shard manifest and pins, progress, transport ownership events, engine stderr, and screenshot lineage evidence. Browser profiles are not uploaded. Keep different kit/engine pins and separate completed runs in separate input directories; there is intentionally no automatic best-of/retry merge.

Denominators are requested attempts and valid scorable attempts side by side. #354's `typeUnconfirmed` is a measured typing answer: retain the raw response and finish the DOM tail so an honest refusal can be distinguished from success on the wrong placement. It does not invalidate an otherwise scorable attempt. Refusals and invalid fixture setups are not successful replacements. #354 also settles recent keypresses before typing, so current Cmd+A rates are not estimates of the old pre-#354 engine's race. A successful type read-back proves replacement of its own pre-type snapshot, which may already reflect the click's wrong caret; the DOM's intended full replacement remains the judge. `wrongFinal / valid` is meaningful only in typing suites; `placedThenLate / placedClaims` and `lateCaretAfterScript / valid` are mechanism observations with a finite horizon. Candidate false acceptance is reported by selection type so Cmd+A's separate race is visible. Missing/coalesced selectionchange notifications are not reconstructed from the first input's caret.

## Decision after measurement

1. Use script-selection trace reversions, no-click controls, and isolated carriers to identify a sufficient late step per browser. Natural chronology alone associates a step; it does not prove sole causation when several ran.
2. Reject any candidate that accepts and still permits a later pre-input caret reversion. A clean 20/20 cell is evidence for that cell, not a general event-delivery fence. Price the slow/refusal tail, not only successful medians.
3. Prefer a completion acknowledgement tied to this particular mutation if a usable browser/AX signal emerges. An ordinary selection notification is only a candidate, not a fence: #354 already showed stale/spurious acknowledgements and missing notifications. Do not add one as a product design merely because this spike is clean.
4. Before a production choice, preserve #341's separate range **and layout** proof and rerun its full regression corpus: six textarea layouts (top, script-scrolled overflow hidden/auto, end, 20,499-character field, wheel-scrolled), Chrome late and fresh, Safari late, Safari coordinate/token clicks, three repetitions against baseline and the chosen implementation. The prior A/B kit is `probe/341-ab` at `e91c1e6c` (run `42578081142`; evidence `docs/evidence/2026-11-08-scrolled-caret/`). This #359 spike does not reproduce that whole corpus and cannot claim no regression on it; a range-only candidate acceptance cannot replace the box check or justify "placed" after a layout move. The fresh/scroll regression is a separately approved follow-up after identifying a viable candidate, not extra hidden work in this 3,680-attempt run.

**Expectations, not results:** Chromium's selection write is the leading suspect; Safari's natural posted click may be sufficient by itself. Some short rereads and stability dwells may fail because the original range can be visible before a deferred reapplication. Script arms should be the cleaner click-causality evidence; Cmd+A may stay wrong even if a click candidate works. Firefox must be remeasured rather than inheriting the unowned rate. None of these expectations has been tested by this kit yet.

## Offline verification commands

```sh
node --test scripts/probe-359/*.test.mjs
node --test scripts/probe-354/transport.test.mjs
node --check scripts/probe-359/measure.mjs
# Compile only; never run these binaries on the owner's Mac:
swiftc -O -o /absolute/offline-build/watch359 scripts/probe-359/watch.swift
# patch.mjs can be applied to an owned detached source at the pinned SHA,
# then swift build may compile it without ever launching cua-engine.
```

Offline tests establish manifest/readers/fixture contracts and compilation, not GUI behavior, helper permissions, geometry accuracy on current hosted browser versions, workflow registration, or candidate efficacy. Those remain unverified until an approved hosted smoke and measurement.
