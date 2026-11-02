> Superseded by `2026-10-28-own-linux-engine-design.md`: its Decision Log entry "M4 pre-flight, the design session" (2026-11-02) and its M4 Plan of Work entry of 2026-11-02. Kept as the record of the pre-flight. Its `L<n>` citations are to the spec at 9d3fdce6, before the fold.

# #171 M4 pre-flight (draft for the plan-executor)

- Spec: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, cited as `L<n>`.
- Report: `…-report.md`, cited as `R L<n>`.
- Base: `feat/171-m4` = main 9d3fdce6. Engine 0.3.0, plugin 0.21.0, `MIN_ENGINE_VERSION` 0.3.0.
- The design session's constraints of 2026-11-01 are folded in:
  - #267 lands first;
  - #268 comes before any series leans on the bar for gedit `clipboard_write`;
  - #263, #264, #265 and #250 are in scope, each with a recommendation;
  - the design session merges M4's pull requests.

Class: **B** = built and proven; **E** = measured, adopted only on evidence; **I** = investigation only.

## 1. The items

| # | Item | Spec | Acceptance as the spec states it | Class | State at 9d3fdce6 | Ticket | Task |
|---|---|---|---|---|---|---|---|
| 1 | Duplicate windows: resolved, or the sentence | L82, L292 | Acc 7 (L200): with three Chrome windows of one title and size, reading the first returns its full tree or `Window <id> matches several accessibility windows; close or retitle the duplicates`, never a one-node X11 tree | B | not built. `atspi.rs` `associate` → `Refused` → x11 fallback (`engine.rs` ~L379/387) | – | T5 |
| 2 | Minimized windows | L84, L292, L294, L468 | Acc 7: listed `minimized: true`. A gedit window bound through the real facade, then minimized, still reads, and its screenshot answers `Screenshot unavailable for window <id>.` Input answers `Window <id> is minimized; activate it first` (L84) | B | not built. `x11.rs` `describe_finish` drops windows that are not Viewable, so `get_window` answers "is not mapped" | – | T4 |
| 3 | Truncation through the facade | L92, L296, L468 | Acc 4 (L197): the over-budget state, read through the facade, ends with the line, "with the counts the engine reported" (L296) | B | facade line and service passthrough done in M3. The engine emits no `truncated` | – | T3 |
| 4 | Fixed waits replaced by measured conditions | L292, L296, L100 | a wait is shortened only when the effect checks pass on every family of the matrix, 30 consecutive runs; otherwise it stays, and the evidence says why | E | left: the `FocusOut` teardown of 100 ms (`input.rs`), GTK 4's covered cap of 150 ms (`readiness.rs`), the 8 ms path step (`desktop.rs`), the service settle (100 ms). Unnamed by the spec: click hold 12 ms, wheel hold 36 ms (`engine/pointer.rs`) | – | T7 T8 T9 |
| 5 | Action settle | L139, L292 | "reduced where effects still verify", under the 30-run rule | E | `settle.mjs` `POST_ACTION_MS` = 100 | – | T8 |
| 6 | Key pacing | L100, L292 | 30-run rule | E (re-verify) | 0 since M1a (`main.rs` default), proven only with the 100 ms teardown (L528) | – | T7 |
| 7 | `Cache.GetItems` | L90, L197, L296, L508 | adopted only if it equals the sequential read on menus, Qt and a changing tree, under the signature, role and -1 rules; otherwise the evidence says why | E (expect: not adopted) | M1a removed the cache path (L241). M0: only GTK 4 answers, 13 of 64 roles wrong | – | T6 |
| 8 | `FocusOut` timer | L100, L296, L520 | keys never reordered across requests. "No keys dropped in Chrome's burst test, and an observation straight after the reply sees the effect within the JavaScript settle" (L520) | E | not built | – | T7 |
| 9 | kate's frame Name | L296, L532 | an association rule, adopted on evidence | E | X11 fallback in every engine | – | T5 |
| 10 | GTK 4 `EditableText` | L296, L669 | investigation only. The `InsertText` ban (L212) stands unless evidence and a Decision Log entry lift it | I | – | – | T6 |
| 11 | Long browser drags at the bar | L194, L296, L544, L713 | Acc 3: Chrome canvas, Chrome HTML5 DnD and Firefox canvas are judged operations, "cua's median at or below the faster vendor build's, with cua's effect on every run". Effect 30/30 on every family and kind | B (route by measurement) | cua 646 / 500 / 553 ms against the newest build's 517 / 360 / 527. The drag experiment records medians but has no interval judge (`drag.mjs` imports only `median`) | – | T10 T11, DnD T14 |
| 12 | Chromium thumb drags | L194, L264, L296, L712 | Acc 3: Chrome and Electron "land at or beyond the pinned build's mean distance on 30 of 30 runs" | B | mean 6–8% short; the shortest run sits 0 px above the judge's edge | – | T10 T11 |
| 13 | Thumb drags under load | L296, L560, R L330 | "40 drags a side against the pinned build, before it claims parity" | B | 17–19 of 20 against the pinned build's 20 of 20, at 2 workers per core | #265 | T12 |
| 14 | Desktop `move` gap | L196, L296, L730 | later requests at or below the bar (8.45 against 6.05 ms). The cheaper route first: drop the leading motion if no `MotionNotify` comes, checked by xtrace and a listener | B | `deviations.mjs` `SPEED_GAPS` `move` (M4) | – | T9 |
| 15 | Writer's first drag | L296, L542, L731 | find why; prime the window only "without changing what the desktop sees" | I → E | the harness primes every fresh Writer window | – | T16 |
| 16 | Short Chrome drop gap and the thin 350 ms margin | L995 | lead: release at the accept cursor, take + 350 ms as the ceiling, "only if the cursor reading has no false positives" | E | 469 ms against the newest build's 258. Latest accept seen 275 ms after the take | none (#171 comment) | T13 T14 |
| 17 | The hold's cost (press + 250 ms) | L1037 | declared gap | E | a 40 px selection goes from 134 to 355 ms | #263 | T13 T14 |
| 18 | Late take after press + 250 ms | L1037 | declared. #264: a drag that did not drop never answers ok | B (an honest answer) | answers ok while the drop misses | #264 | T13 T14 |
| 19 | M3.1 candidates (L954) | L954, L931 | each measured before anything loosens | E | – | – | see below |
|  | a. scroll through the scroll bar's `Value` |  |  |  |  |  | fork F3 |
|  | b. a Chromium drag decided by the AT-SPI role at its start point |  |  |  |  |  | T13 → T14, T15 |
|  | c. which part of a Chromium path decides |  |  |  |  |  | T13 → T15 |
|  | d. Gecko's predicate for Move and Drag |  |  |  |  |  | T15 |
|  | e. Move through the foreground route in `dedicated` mode |  |  |  |  |  | fork F3 |
| 20 | Hand CLIPBOARD to `CLIPBOARD_MANAGER` on exit | L536 ("an M4 candidate") | – | E | not built | – | fork F3 |
| 21 | Release 0.4.0, the pin, the plugin bump | L149, L217, L408 | – | B | – | – | T18, then the release |

Tickets, and whether the spec puts each in M4:

| Ticket | Spec | Recommendation |
|---|---|---|
| #263, #264 | in M4: "Declared for M4" (L1037) | in, T13 → T14 |
| #265 | in M4 (L296) | in, T12 |
| #250 `drag_handle` | not in M4: "registered for later" (L1018) | **in M4** (T17). A lost press answers success. Same code and instruments as T14 |
| #249 false error | not in M4 (L1018; widened at L1037) | leave as a ticket. T13 records whether the role signal would narrow it; build only if T14 adopts that signal |
| #248 pointer outside | not in M4 (L1018) | leave. It needs MPX or CDP, a design of its own |
| #260 textarea selection | not in M4 (L1054) | leave. It belongs to the paste design and other files |
| #267, #268 | not in the spec (PR #262's residue) | T1 first; T2 before the gedit `clipboard_write` bar is relied on |
| #266 arm64 gate | M5 | out |

## 2. Decomposition into loop tasks

Each task is about a day of work or less. The split follows M3's context blow-ups (R L356: tasks 16, 18 and 20 ran to 537k–679k tokens), so the drag work is split into a judge, a model, load, signals and a build.

| T | Scope | Files | Consumes | Proof |
|---|---|---|---|---|
| T1 | **#267, its own PR to main.** The candidate is the workflow's attested musl artifact of the gated commit, or a musl build made the way the workflow makes it. A gnu or unattested candidate is refused. `--dev` labels its verdict "not a release gate". The run records the sha256, the target and the attestation (from `--format json`, R L355), stores the file as `cua-engine` and sets its mode (R L352-354) | `scripts/linux-engine-diff/{cli,run,engine}.mjs`, `test/linux-engine-diff/` | – | failing-first tests: a gnu build, an unattested file and a wrong digest are each refused; a dev verdict is labelled; one live dev run |
| T2 | **#268 spike.** Read the m3 gate records for the newest build's gedit `clipboard_write`, then run one probe on the harness scene | read-only; any fix goes in `text.mjs` | T1 (fix only) | a findings comment. If the cause is the harness: a lane-neutral fix with a test, and a rerun showing a real bar or a real defect |
| T3 | **Truncation.** Counts come only from cut points the read already knows (no extra bus calls). The field is omitted at 0. Add a field deviation | `tree.rs`, `tree/tests.rs`, `engine.rs`, `deviations.mjs`, `services.mjs` | – | fake-bus tests with exact counts per cause (limit, depth, failed `GetRoleName`). Over-budget: retained ids equal the vendor's, calls ≤ vendor + 256, `nodes` > 0 and `depth` > 0 (the page has both), the line in `getAXState` and in the combined observation. gedit and Chrome: no field |
| T4 | **Minimized.** List Iconic windows (`WM_STATE`), read the tree, answer `screenshots: []`. Refuse window input at the route choke point (`way.rs` `route_along`) and in the `get_window` callers that bypass it, before anything is sent. Check `activate_window` on a minimized window first (C22). Minimize with xprobe, not xdotool (R L349). Add the repl-parity case | `x11.rs`, `engine.rs`, `engine/{way,paste,clipboard,elements}.rs`, `deviations.mjs`, `scenes.mjs`, xprobe, `test/repl-parity/scenarios/native.mjs`, `test/repl-parity/vendor-defects.json` | T3 (`engine.rs`) | Acc 7's minimized half through the real facade. Controls: the restored window gives a screenshot and loses the field; an unminimized window never carries it. The audit shows refusals sent nothing |
| T5 | **Identity.** Break ties between duplicate frames by screen extents against the X11 position, then the frame's `active` state. GTK 4's extents are window-relative (L534), so it gets the sentence. What remains gets the sentence on every request. The kate rule is adopted only on evidence | `atspi.rs`, `engine.rs`, `engine/{elements,paste,clipboard}.rs`, `deviations.mjs`, `scenes.mjs`, `pages/` | T4 (the list now holds minimized siblings), T7 (same files) | an identity scene: three Chrome windows with one title (unique per run, L510) and one size, each page with its own marker. Placed apart: each read returns its own marker. Stacked on one spot: the sentence. kate and qtcreator: a tree, two kate windows kept apart. Every other family's tree reads equal M3's |
| T6 | **AT-SPI investigations.** `GetItems`: who answers, the signature, roles against `GetRoleName`, -1, on every matrix family, Qt 5 and 6, menus and a changing tree. GTK 4 `EditableText`: is it present, does undo survive, do the input signals fire | a probe script, `m4/atspi/` (no engine change) | – | the evidence and a Decision Log proposal. The probe never runs during a bus-traced verdict |
| T7 | **The `FocusOut` timer, and key pacing re-verified.** Answer as soon as the keys are sent; `FocusOut` follows 100 ms later. The next input to the window restarts the timer. It is flushed before input to another window, a paste's observation, a late-take Escape, and at orderly exit | `input.rs`, `engine.rs` (the loop's timer), `main.rs`, `engine/{keyboard,paste,way}.rs`, `experiments.mjs`, `audit.mjs` | T4 (same files) | Chrome and Electron burst: 0 keys dropped or reordered across requests, and a control lane with the timer off at 0 ms that does drop them. 30 consecutive runs per family, idle and at 2× load. The audit attributes the deferred `FocusOut`. A live test on the shipped bytes: SIGTERM mid-timer still sends it |
| T8 | **Action settle.** Per-method values, each the smallest that passes. Make M3.2's respawn test synchronous; it times a 20 ms exit against the 100 ms settle (R L340) | `src/services/engine/linux/{settle,methods}.mjs`, `test/services-engine-linux/{settle,service}.test.mjs`, a facade-path instrument (`services.mjs` or new) | T7 | for each input kind and family, an observation through cua's service straight after the reply shows the effect, 30 consecutive, idle and at 2×. An oracle for effects the tree hides (gedit click → caret offset). A control at 0 ms where that is shown to miss |
| T9 | **Fixed waits: `move` and GTK 4's cap.** Drop the leading motion, otherwise shorten the 8 ms step, covering `drag_handle`'s held moves (same function, `move_path_paced`). A shorter covered cap for GTK 4. An inventory of every fixed wait: keep, change, why | `desktop.rs`, `readiness.rs`, `deviations.mjs` (remove the `move` gap), `events.mjs` | – | the pinned build's xtrace, and a motion listener with a positive control (a 1 px move delivers). Events: `move` later requests pass at ≥ 20 a side. Readiness on GTK 4, judged by content, idle and loaded, 30/30 |
| T10 | **Drag judges, harness only.** Long-path speed under Acc 3's interval rule: ≥ 20 usable a side, top-ups to 40, and the vendor bar's 20-usable rule. A thumb judge per run against the pinned mean of the same sitting. A count of the motions Chrome actually received. A 2× load lane at 40 a side. An unprimed Writer lane. Chrome DnD in front or `dedicated` | `drag.mjs`, `stats.mjs`, `cli.mjs`, `experiments.mjs`, xprobe, `test/linux-engine-diff/drag.test.mjs` | T1 | display-free negatives: a run below the mean fails; 19 samples are never judged; a vendor under 20 usable gives up the bar. Live: 0.3.0 reproduces the known failures (short thumbs, slow long paths) |
| T11 | **Motion model.** Plot thumb distance against motions received. Choose coarse segments through every vertex, or pacing by elapsed time. Chromium and Gecko rows | `families.rs`, `engine/pointer.rs` (`dnd.rs` keepalive interplay) | T10 | idle drag experiment: every family and kind 30/30, cua judged absolutely. Thumbs in Chrome and Electron 30/30 at or past the pinned mean. Chrome and Firefox canvas speed passes at ≥ 20 usable a side. Floor and hold behaviour unchanged |
| T12 | **Load parity (#265).** Thumb and range drags, Chrome and Electron, 2 workers per core, 40 a side against the pinned build. Find the mechanism of any miss, then fix it | `drag.mjs` (run); maybe `pointer.rs` or `families.rs` | T11 | cua lands at least the pinned count (40/40 where the pinned build has 40/40), or a mechanism record and a stated limit |
| T13 | **Chromium drop signals, measured only.** Accept-cursor false positives and latency (idle, the gate's window load, 2×). Signals that a drag will never take (the role at its start, XdndAware or source state). Reproduce a take after press + 250 ms (#264). Which part of a path decides. Does the start role predict covered-path survival | `dnd.mjs`, `kinds.mjs`, `device.mjs`, a role probe; engine flags for measurement only | T10, T11 | count tables, a reproduction of #264 that is not only the fault hook, and a recommendation to the design session (F1) |
| T14 | **Chromium drop build.** Release at the accept if it has 0 false positives. Shorten the hold by the adopted signal (#263). A take or Xdnd exchange after the release answers unconfirmed (#264). Bring the long Chrome DnD and the short drop to the bar, or declare them | `dnd.rs`, `engine/pointer.rs`, `stray.rs`, `families.rs`, `deviations.mjs`, `device.mjs`, `dnd.mjs` | T13 | the gate's `device-chrome-dnd` cases 9/9, cold samples included. A failing-first live test of a real late take. Speeds (short drop, 40 px selection, long DnD) under Acc 3. Drops landing at 2× |
| T15 | **Drag predicates.** Which part of a Chromium path decides; a refinement by the start role if T13 shows a predictor; Gecko's Move and Drag predicate | `cover.rs`, `families.rs`, `engine/way.rs`, `deviations.mjs`, `kinds.mjs` | T13 | the kinds experiment per occlusion, each newly allowed case 30/30 with the witness clean; every other refusal unchanged |
| T16 | **Writer's first drag.** The cause, and engine priming adopted only on evidence | probes; if adopted, `families.rs` and `engine/pointer.rs` | T10, after T14 (`pointer.rs`) | unprimed, fresh windows: the first drag selects 30/30, witness and audit clean. Otherwise a mechanism record, and the harness priming stays labelled |
| T17 | **`drag_handle` (#250).** The atomic press at the first `move`, the stray watch from start to end, the foreground route in `dedicated` mode when the pointer is outside | `engine/pointer.rs` (`drag_handle`), `stray.rs`, `device.mjs`, `tests/live_device.rs` | T14 | #250's cases: 0 false errors over ≥ 100 undisturbed drags; a nudge gives the error; the pointer outside, in both modes; vendor-JS `drag_handle` cases unchanged |
| T18 | **Close-out.** Version 0.4.0; `MIN_ENGINE_VERSION` 0.4.0 (L141; the settle is tuned on it); the plugin's minor bump with the macOS inventory; the final deviations. Facade suites on the final sources: repl-parity with the minimized case, native-baseline `compare --engines`, `linux-native`, `linux-device-mode`, the `services` over-budget row. A gate rehearsal on a build-only artifact. `m4/README.md` | `Cargo.toml`, `client.mjs`, `.claude-plugin/plugin.json`, evidence | all | the suites pass; the rehearsal exits 0, or its findings go back to their tasks |

Then the whole-branch review (`reviewer-high`), the gate (§5), the release and the PR. **The plan-executor opens the PR; the design session merges it.** Fold this into the Decision Log, since L216 and L628 say only "squash-merged".

**Order and frontiers.** Each task is reviewed clean before anything that consumes it is dispatched.

| Wave | Tasks (parallel within a wave) | Consumes |
|---|---|---|
| 0 | T1, T2 | T2's fix ← T1 |
| 1 | T3, T6, T9, T10 | – |
| 2 | T4, T11 | T4 ← T3; T11 ← T10 |
| 3 | T7, T12, T13 | T7 ← T4; T12, T13 ← T11 |
| 4 | T5, T8, T14 | T5 ← T4, T7; T8 ← T7; T14 ← T13 |
| 5 | T15, T17 | T15 ← T13; T17 ← T14 |
| 6 | T16 | T16 ← T10, T14 |
| 7 | T18 | all |

**Tasks that touch the same files.** Serialize them as the waves do, or merge after each review:

| File | Tasks |
|---|---|
| `src/engine.rs` | T3, T4, T5, T7 |
| `engine/paste.rs` | T4, T5, T7 |
| `engine/way.rs` | T4, T7, T15 |
| `engine/{elements,clipboard}.rs` | T4, T5 |
| `engine/pointer.rs` | T11, T12?, T14, T16?, T17 |
| `families.rs` | T11, T14, T15, T16? |
| `dnd.rs`, `stray.rs` | T14, T17 (`dnd.rs` keepalive also in T11) |
| `desktop.rs` | T9, and T17 reads `move_path_paced` |
| `scripts/linux-engine-diff/deviations.mjs` | T3, T4, T5, T9, T14, T15 (separate arrays) |
| `drag.mjs` | T10, T11, T12, T16 |
| `dnd.mjs`, `device.mjs` | T13, T14, T17 |
| `services.mjs` | T3, T8 |
| `test/repl-parity/scenarios/native.mjs` | T4, T18 |
| `src/services/engine/linux/` | T8 (settle), T18 (`client.mjs`) |

## 3. Conflicts and ambiguities

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| C1 | The 30-run rule against Acc 3's revised speed rule | L296; L196, L937-944 | They answer different questions. The 30-run rule adopts a wait by its effect, judged absolutely on every run. Acc 3 judges speed through the interval. Samples that serve both meet both. "Consecutive" means one unbroken series: a miss restarts it and is reported |
| C2 | Acc 3 says long drags pass at "median at or below" | L194 vs L196 | The revised rule governs every speed verdict. Long drags pass as faster, same or within the bound, and a "within the bound" pass is listed to the owner |
| C3 | The long-drag bar against the 20-usable vendor rule | L194, L996, L48 | The newest build's canvas misses 7–11 of 30, so 30 trials leave it 19–23 usable, and the bar could fall silently to the pinned build (279–1,196 ms). Run long paths to 40 a side, and have the verdict name which build set the bar |
| C4 | The thumb criterion: per run at the pinned mean, against a quarter tolerance and #265's "20/20" | L194, L712, `drag.mjs` | Idle: every run at or past the pinned mean of the same sitting, never a stored constant (M1b's stale-reference lesson, L1085). Load: landed counts per the judge, cua ≥ pinned, 40 a side, distances reported |
| C5 | Coarse motions and the thumb lead, against "the pinned build's events stay the reference" | L296; L701, L712 | M4's text is later. It needs a Decision Log entry for the Chromium and Gecko rows only, with every vertex kept (F2) |
| C6 | "Lead" wording: release at the accept cursor, against task 18's rejection of the accept cursor (85 of 100 matched) | L995 vs L993; the thumb lead at L296 | A lead is a hypothesis the task must test and report. Adoption depends on its stated condition. The task review flags an untested lead, never one left unbuilt |
| C7 | Chrome DnD long path at the bar, against the 350 ms floor and the hold | L194; L993, L1036 | The newest build's median of 360 ms is below the take (about 21 ms) plus 350. The bar can only be reached through T14's early release; otherwise it is a declared gap for the owner (F1) |
| C8 | "30/30 on every family and kind", against M3's shared-mode Chrome DnD guard and the path rule | L296; L949-950 | Run Chrome DnD in front or `dedicated`, both builds alike. Covered-path cells stay declared refusals |
| C9 | Range drags missed under load as well, but only thumbs are named | L560 vs L296, #265 | T12 measures range in the same run |
| C10 | Key pacing "stays a per-family setting", but `families.rs` has no key field; `pacing.key` is global | L100 | Add a field only if T7 finds a family that needs one |
| C11 | "stays at the vendor's value", but some waits are already cua's own (the 150 ms cap, Chromium's 500 µs) | L296 | Read it as "stays at its shipped value" |
| C12 | The scope of "the remaining fixed waits": the 12 ms click hold and the 36 ms wheel hold (paid on every 100 px step) were never measured by M0 | L292 | T9 lists them. They are E candidates only if T9 has room; cua already passes click and scroll by a wide margin |
| C13 | M4's Touches lists only `atspi` and `x11`, plus `settle.mjs` | L294 | Each task's file list here supersedes it; record that |
| C14 | Duplicates: the sentence for element and text requests (today the vendor's `ambiguous AT-SPI window identity…`), and what "the stacking order" means when AT-SPI frames have no z-order | L82 | cua's sentence on every request. The tie-break is the position, then the `active` state. GTK 4 gets the sentence (F5) |
| C15 | Acc 7's "full tree or the sentence" can pass on the wrong window's tree | L200 | Per-window markers. Placed apart, a tree is required; stacked, the sentence is |
| C16 | An engine answering `[]` for every window passes Acc 7's screenshot check | L200 | Add controls: the restored window gives a screenshot, and no unminimized window carries the field |
| C17 | "With the counts the engine reported" is circular | L296 | Exact counts from the fake bus, nonzero live counts on a page built with both causes, no field on gedit or Chrome. Two services rendering equal rows proves nothing about the line |
| C18 | Checking that `move` delivers no `MotionNotify` proves nothing on its own | L296 | Give the listener a positive control |
| C19 | The burst test and the 30-run checks need a negative control | L520 | A lane with the timer or teardown at 0 must drop keys. Every new judge needs a negative control in its live run (M2's lesson, L1097) |
| C20 | The settle's effect oracle: a gedit coordinate click has no effect in the tree | harness README | Read the caret offset through AT-SPI, or state the exclusion |
| C21 | Minimized windows: `dedicated` mode, and AT-SPI element actions | L84 | Refuse in both modes and for every window input, element actions included, as written. The minimized refusal comes before the device refusal (F8) |
| C22 | "Activate it first" may itself fail: `activate()` pipelines `SetInputFocus` behind the WM request, and X answers BadMatch for a window that is not viewable | `engine/windows.rs` | Likely, not yet checked. T4 checks it first; if it fails, wait for the map (bounded) before the focus |
| C23 | The timer against M2's paste observation (the session's `FocusIn`) and M3's late-take Escape and acting-request rule | L821, L970 | Flush before both. A flush counts as a release: it always runs and is never refused by a pending notice |
| C24 | The timer when the engine dies | L520 | Flush on SIGTERM and on stdin EOF. Document SIGKILL, and check how `client.mjs` ends the engine |
| C25 | The settle is tuned on 0.4.0's timer, so an older engine under the new settle loses effects | L141 | Raise `MIN_ENGINE_VERSION` to 0.4.0 |
| C26 | Truncation's `depth` count when the read never lists the children of nodes at depth 63 | L92, L88 | Count only cut points already known, so no extra calls. It is a lower bound by design |
| C27 | Acc 3 says "in the same run", but the drag experiment is a separate instrument with no cold series | L194 | The gate sitting is the verdict run plus the drag cells, on one candidate, in a frozen order. Long paths are judged warm; the verdict run's scene drag covers cold |
| C28 | Executors build gnu on the VM, and musl timing differs (its allocator) | L1067, #267 | Iterate on dev builds. Adoption runs and speed claims use a musl build made the workflow's way, labelled dev. The gate uses the attested artifact |
| C29 | The short-drop gap and the thin margin have no ticket, despite the owner's every-gap rule | #263's log | The design session registers one, through the issue-tracker scripts |

## 4. Design forks (the design session or the owner)

| F | Choice | Recommendation | Why |
|---|---|---|---|
| **F1** | The Chrome drop's release: the accept cursor; or another signal (XdndAware, the start role); or keep the floor and declare the gaps (the short drop, long DnD, the hold) | Adopt an early release only on 0 false releases in ≥ 300 drags, idle, under the gate's window load and at 2×, and always paired with #264's after-release detection. Otherwise keep the floor and the hold, and take the gaps to the owner | A false early release drops nothing yet answers ok, which is worse than slow. #264 makes any miss honest |
| **F2** | The motion reference for Chromium and Gecko: coarse segments through every vertex, or pacing by elapsed time. This ends M1a.3's "the pinned build's events stay the reference" for those rows | Coarse segments, if T11's plot confirms per-motion rounding, kept to the Chromium and Gecko rows | Pacing alone cannot fix a per-motion rounding loss. The newest build's canvas misses come from cut corners, which keeping every vertex prevents |
| **F3** | Scope beyond the required items | In M4: #250, the path part (c), Gecko's predicate (d), the start role as a measurement (b). Tickets: the scroll `Value` route (a), `dedicated` Move (e), the `CLIPBOARD_MANAGER` handoff, #248, #249 (unless the role signal is adopted), #260 | Honest answers and declared gaps first. a and e add capability beyond the vendor or change activation; the handoff needs a clipboard manager that none of the measured desktops runs |
| F4 | The settle's shape: per method, uniform, or reported by the engine per family | Per-method constants in the service, and `MIN_ENGINE_VERSION` 0.4.0 | No wire change, and each method's evidence stands alone |
| F5 | Identity: cua's sentence on every request; the tie-break signals; how far kate's name rule loosens | As C14. kate: the frame Name, trimmed, equals the title before ` — `, is unique within the PID, and is confirmed by the extents | A wrong association reads another window's tree, which is worse than the sentence |
| F6 | Lift the `InsertText` ban for GTK 4 | No lift in M4; decide on T6's evidence | It changes a constraint, and `dedicated` mode already types into GTK 4 |
| F7 | `Cache.GetItems` | Close it as not adopted, on M0's data and T6's refresh | Only GTK 4 answers, its roles are lossy, and frontier reads already run about 8× faster than the vendor's |
| F8 | Minimized windows in `dedicated` mode | Refuse | It is simple, matches L84, and the sentence names the fix |

## 5. The gate

- **The candidate.**
  - It is the release workflow's x64 musl artifact, from a build-only run (`publish=false`) on the gated commit. Verify its sha256 and its attestation before the run; T1's harness enforces this.
  - After publishing, compare the published x64 sha256 with the gated one. If they differ, rerun the device scenes on the released asset.
  - The head keeps `native/linux-engine/` identical to the gated commit, and `runtime/` too apart from the pin. Any other change reruns the gate (L1067).
  - The PR states the toolchain, and that arm64 is covered only by the workflow's tests (#266, M5).
- **Coverage, in one sitting on one candidate:**
  - M3's full verdict run (its scenes as in `m3/README.md` L192-194);
  - the new identity and minimized scenes;
  - the over-budget scene through the facade;
  - the drag cells: Chrome canvas, Chrome DnD and Firefox canvas speed and effect, thumbs in Chrome and Electron (out of the gate until now, L264), every family and kind 30/30;
  - the events experiment (`move` at ≥ 20 a side);
  - the `FocusOut` burst and the settle check through the service;
  - `#263`/`#264`/`#250`'s device cases.
  - The harness-fault caps apply (L1027-1031).
  - The run exits 0, with no prose exceptions (L877).
- **Preceding scenes are part of the condition.**
  - Freeze the order, and append M4's scenes after M3's sequence. The three identity Chrome windows go after `device-chrome-dnd`: Chrome's take latency rose with window load (L1035).
  - Reproduce any failure through the gate's own sequence before isolating it.
  - T18's rehearsal is the first run of that sequence.
- **Check the harness state before blaming a vendor build:**
  - scene-text restores per lane (cua must have 0);
  - T2's finding applied;
  - the identity and minimized scenes restore or close every window, with titles unique per run (stale frames, L510);
  - no stress-ng or harness process left behind before an unloaded run (`m3/README.md` L849; kill by recorded PID, R L347);
  - a vendor failure becomes a rule or a declaration only after this check (L1110).
- **Safety on the shipped bytes, with real faults** (live tests the workflow runs on each asset, no `live`-feature injection):
  - the timer's flush on SIGTERM and before a paste's observation;
  - the minimized and duplicate refusals send nothing;
  - #264's late take reproduced for real, answering unconfirmed;
  - #250's real nudge and the pointer outside;
  - M3's lost-watch test and the asset string check stay.
- **Re-measure under 2× load** (`--load --load-factor 2` = 16 workers on 8 cores; run separately, recorded in the same sitting):
  - thumb and range drags in Chrome and Electron, 40 a side against the pinned build;
  - every Chromium and Gecko kind under the new motion model;
  - the `FocusOut` burst and key pacing;
  - the settle's straight-after observation on every family;
  - the accept signal's false positives and latency, and the late-take rate;
  - GTK 4's covered capture, if its cap was shortened.
- **Then:**
  - `ci-gate` GREEN on the head, with `test` and `sandbox-live` for the plugin bump (L217);
  - on the released asset: the fresh-home install, `doctor`, `linux-native` and `linux-device-mode`;
  - the PR is opened by the plan-executor and merged by the design session.
