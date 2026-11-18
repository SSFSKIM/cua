# The settle counter of every step (#171 M5, task 103; rulings 827, 832, 834; fix wave 1)

These are development runs and were never counted. Host dc-linux171-1e68 (x86_64), on private displays under gate.mjs, holding
`locked.sh m5-settle-stats`. The candidate is linux-engine 0.4.1 from `m5-engine-041`: `cua-engine 0.4.1 (2d8f6ad96296)`,
sha256 `c99408a04e1905596b78e872a1172d08bac77bc9402bacc622816740f7c93173`, the release build in task 101's checkout.
The runs here are fix wave 1's: the harness at 5ceb6b0f (`out/step.*.json`), with this README's edits uncommitted.
The checker's line was reworded later, and `out/checker.txt` was produced with that wording at the branch's head; the
records and the judge and report outputs are unchanged by it. The first round's runs (d89a8a96) are in git history.

## What the harness records now

- **`settle-counts.json`** goes in each harness out directory (gate.mjs's `<step>.<label>/run/`), written at the
  harness's exit (`scripts/linux-engine-diff/engine.mjs` `recordEngines`, `settle-counts.mjs`). For every engine the
  run started, it records:
  - **Identity, fixed at launch** from what the run started: the lane, the path it ran, pid and argv. Its build is one
    of three:
    - `vendor`: a path the run named as `--vendor` or `--newest`, or what that resolves to;
    - `cua`: it took cua's `--stats`;
    - `unidentified`: anything else. These are held to the counter as cua lanes, never discarded.

    Nothing is classified at the harness's exit, by which time runDiff has removed its candidate copy.
  - **The requests sent**, by command.
  - **The last `drop_settles`**, whole, from the `--stats` lines the run already reads. That includes 0.4.1's
    `settle_failed_activation_confirmed`.
  - **Whether that last line is the engine's own post-shutdown snapshot** (`final`): an untied line (`"id": null`)
    carrying `drop_settles`, the engine's last.
  - A lane with no stats is recorded as `no stats: not recorded`, never as zero.
- **`--engine-stats`**, a development run's opt-in, accepted by gate.mjs and the harness CLI.
  - It gives `--stats` to every engine whose build answers `cua-engine …` to `--version`. The probe runs once per path,
    and never on a file that is not ELF.
  - A `--stats` that reaches argv any other way (a runner's `stats: true`, or the lane's own args) is parsed as today.
    The opt-in never adds a second flag.
  - Only the opt-in's own lines are diverted: to `engine-stats/<harness pid>.<lane>.<pid>.jsonl` and the record. They
    never reach the runner.
  - **Refused:**
    - on a counted run: a verdict run without `--dev`, `--gate`, or `--pinned` without `--pilot`;
    - with `--via vendor-js`;
    - for the settle and engine-stop experiments, at the CLI and in gate.mjs;
    - in gate.mjs, also for FB and R1–R4. Those start their engines through cua's service or cua serve.
- **`scripts/linux-engine-gate/settle-check.mjs <step dir>…`** prints, per step: `not taken`, `TAKEN` (the step reruns
  as class A), or `unknown`. It exits 0 only when every step shows `not taken`.
  - A positive count (entered, or a second rest taken) always means taken.
  - A zero counts only from a post-shutdown snapshot. The exit can end a held handle and settle it.
  - Each of these is unknown: a missing record or counter, a zero read before the exit, an engine still running at the
    harness's exit, an unparsable stats line.
  - A step's counts are the sum, over its engines, of each engine's last value.
  - An engine with no counter that the harness sent no `drag` and no `drag_handle` is listed apart as "not a measured
    zero". Those are the only requests the settle runs inside (below).

## Ruling 834's proof

### 1. Switch off: argv and parsed stream byte-identical to today's

**Hermetic**, `scripts/byte-identity.mjs`, with outputs in `byte-identity/`. Two Engine classes drive one
deterministic stand-in through the same requests and pipelines:
- `origin/feat/171-m5`'s `engine.mjs`;
- the head's, with the record on as the entry point makes it and the opt-in off.

The stand-in writes `--stats` lines when asked: untied ones, an unparsable one, and `drop_settles`. The lanes are:
- cua and cua:0ms;
- a runner's own `stats: true`;
- `cua:variant`, whose own args carry `--stats` (fix wave 1, finding 3);
- a vendor-labelled one.

```
argv:   base 5614235c66b3615c7930a7f17b0f267a98ec82d1286e5f3f34a74bf8d294862c  head 5614235c66b3615c7930a7f17b0f267a98ec82d1286e5f3f34a74bf8d294862c  IDENTICAL
stream: base 7629661d3fca901b0042ca1004f5e325e28b665d672db80c781f5afdc4f03e2e  head 7629661d3fca901b0042ca1004f5e325e28b665d672db80c781f5afdc4f03e2e  IDENTICAL
```

The stream is every answer, its `stats` and `untied`, each pipeline's responses, and each engine's stderr tail. Only
the timings are left out.

**Live**: D1, `gate.mjs run D1 --candidate <0.4.1> --dev --pilot 2`, with the switch off (`out/settle-counts.off.json`,
`out/engines-off.tsv`).
- Every engine's argv is today's: no `--stats`.
- No row, log or stdout line carries a stats line (`out/stream.txt`).
- The checker reads **unknown**:
  - the cua lanes are `no stats: not recorded`;
  - the reader and the activating stub are listed apart as "sent no drag or drag_handle (not a measured zero)".
- A counted run differs from this one only in its candidate checks, which happen before any engine starts.

### 2. The opt-in run: its judge and report are byte-identical with and without the stats files

D1 again, with `--engine-stats` (`out/settle-counts.on.json`, `out/engines-on.tsv`).
- Every cua engine got `--stats` once: `cua`, `cua:0ms` and the reader. The vendor builds `pinned` and `newest` got
  none, and neither did the stub.
- The judge and the report were run over two copies of the run's records (`scripts/collect.sh`):
  - copy A, as recorded;
  - copy B, with `engine-stats/` and `settle-counts.json` removed.
- The judge is the drag experiment's own: `judgeDragCell` over the recorded drag runs, then `dragVerdict` and
  `dragCompleteness`. It reproduces the recorded cells: `reproduces_recorded_cells: true`.
- The report is report.mjs's `writeSummary`.

```
854ae3236bf27332b4dce0cfe37db7b15562f8160c6f86b926aa06ba6578b0b5  judge-report.recorded.txt
854ae3236bf27332b4dce0cfe37db7b15562f8160c6f86b926aa06ba6578b0b5  judge-report.stats-removed.txt
judge and report: BYTE-IDENTICAL
70b194a7…  the run's own summary.md, copy A's and copy B's (the same)
```

**The parsed stream carries no stats line** (`out/stream.txt`):
- The opt-in run's `results.jsonl` (48 lines), the step's `stdout.log` and `stderr.log`: 0 `drop_settles`, 0
  `{"stats"`, 0 `engine_stats`, 0 `untied_stats`.
- The drag-run rows have the same key set as the switch-off run's.

**The checker on the opt-in run reads unknown.**
- Every cua engine's last counter is all zeros, but none is final. 0.4.1's exit writes no line that carries
  `drop_settles`: its exit lines (`exit_settle`, `focus_out`) carry no counter. So no zero can be told from one read
  before a shutdown settle (fix wave 1, finding 1).
- Once task 101 adds `drop_settles` to the exit line, the same run reads not taken with nothing else changed.
- D1 drags Chrome, whose class `Google-chrome` is the Chrome family, so its counters are `entered 0` throughout.

```
…/out-on/D1.development-run.pilot: unknown: 11 of 12 cua engines (1 unidentified, held to the counter as cua lanes) not recorded; 1 of them with no counter were sent no drag or drag_handle; the recorded: entered 0, second_rest 0, skipped 0, unsettled 0
  reader …: no post-shutdown snapshot carried its counter: the zero was read before its exit, which can end a held handle and settle it
  …
  stub-activating …: no counter; sent no drag or drag_handle (not a measured zero)
```

### The verdict steps' lanes that still have no counter

The verdict runs' cua lanes take `--stats` in wire mode, so their timed samples carry the counter. The X-request audit
does not: run.mjs starts it with `makeEngine({ ...spec, stats: false })`, and this change leaves that argv as it is.
So a cua lane that drags in the audit keeps no counter. Its step reads unknown under the opt-in's absence, and a
counted run cannot take the opt-in. The text bus pass (`stats: false`) and the restore engine send no drag.

From `scripts/audit-drags.mjs` (`out/audit-drags.txt`), the audited operations whose request is a drag:
- **V1, V2:** none.
- **V3:** `chrome-input/drag`, `minimized/minimized_drag`.
- **V4:** `device-gtk4/gtk4_drag_shared`, `device-gtk4/gtk4_drag_dedicated`.
- **V5:** 20 operations: Firefox's three device drags, Chrome's three, and fourteen of device-chrome-dnd's, including
  `chrome_select_nudged_shared`.

Every source window there is Chrome (class `Google-chrome`), Gecko, GTK 4 or the minimized recorder, so none is of the
settle's family. But that is the static reading. The counter itself stays unknown, and the checker says so.

## Where the settle can run, in 0.4.1 (origin/m5-engine-041 ac8d86a6)

The counter moves only when the settle runs. Line numbers are at origin/m5-engine-041 ac8d86a6.

**A plain drag** (`"drag" => self.drag(..)`, engine.rs:407). The settle runs only when all of these hold:
1. **The source.** It is the window pressed into, kept only if blink:
   `let pressing_into = dropping_into.filter(|&w| self.blink(w));` (pointer.rs:936).
2. **The cursor watch, opened.** `let mut drop_cursor = match (&guard, &after, pressing_into) { (None, Some(_),
   Some(source)) if self.family_of(source).is_some_and(|f| confirms_drop_by_cursor(f.name)) =>
   Some(DropCursor::start_for(Some(source))…) … }` (pointer.rs:1030–1038). In words: no guard, an after-release watch
   (a held drag), and a source of the settle's family. The drag passes
   `drop_cursor: drop_cursor.as_mut().and_then(|c| c.as_mut().ok())` (pointer.rs:1118), so a watch that failed to open
   gives `None`, and with it no settle.
3. **The enabled slot.** `settle: drop_settle.then_some(&mut settle)` (pointer.rs:1120), where
   `let drop_settle = self.cfg.drop_settle;` (pointer.rs:1049). This is on unless `--drop-no-settle`.
4. **The take.** `if taken.is_some() && let (Some(slot), Some(cursor)) = (measure.settle,
   measure.drop_cursor.as_deref_mut())` (pointer.rs:571–572), so a drag and drop has begun.
5. **The count.** It is taken at the release, `self.drop_settles.count(settle, …)` (pointer.rs:1264), inside the
   request. So the request's own stats line carries it.

**A handle** (`"drag_handle" => self.drag_handle(..)`, engine.rs:408).
- **The cursor** is set only when the window under the start point is blink and of the settle's family:
  `handle.cursor = Some(DropCursor::start_for(Some(window))…)` (handle.rs:501–503).
- **It settles in `release_handle`** (handle.rs:575), only when
  `settling = self.cfg.drop_settle && handle.pressed && !pacing.held_rest.is_zero() && matches!(&handle.cursor,
  Some(Ok(cursor)) if cursor.take_seen())` (handle.rs:582–585). It is counted at handle.rs:688.
- **`release_handle` has four callers.** Each needs a handle that an earlier `drag_handle` pressed:
  - **the end:** `end_drag_handle` (handle.rs:558), for the handle's own end request;
  - **the shutdown:** `Engine::shutdown` calls `end_drag_handle()` for a handle still held at the exit
    (engine.rs:895). That is after the last request's line;
  - **the idle bound:** `release_idle_handle` (handle.rs:324), from `Engine::handle` at the start of a request
    (engine.rs:344) and from `Engine::tick` between requests (engine.rs:523). The tick's release writes an untied line
    of its own, which carries no counter;
  - **the reset:** `release_lost_handle` (handle.rs:441), for the `release_handle` request (engine.rs:420), sent after
    a kernel reset or a cell's timeout.
- **So a counter is final only when it is read after the exit.** The shutdown, and a tick after the last request, can
  settle with no per-request line after them. The record therefore takes a zero as final only from the engine's own
  last line, an untied one (`"id": null`) carrying `drop_settles` (fix wave 1). 0.4.1 writes no such line yet: its
  exit lines (`exit_settle`, `focus_out`) carry no counter. Until task 101 adds `drop_settles` to the exit line, every
  0.4.1 zero reads unknown. A positive count always counts.

**The family.** `confirms_drop_by_cursor(family) == (family == "Chromium")` (families.rs:499). A window's family is
found by its WM_CLASS class first, then by its AT-SPI toolkit (`families::family`).
- "Chrome" takes the classes `Google-chrome`, `Chromium` and `Chromium-browser`, and is not the settle's.
- "Chromium" lists no class and takes the toolkit `Chromium`.

**So the condition is broader than Electron.** The settle runs on a `drag`, or a `drag_handle`, from a window that has
both:
- a Chromium toolkit, and a class that is none of Chrome's three (any Electron application, or Brave, Edge or
  Vivaldi);
- a drag and drop that has actually begun.

## Steps that do not start their engines through engine.mjs

The opt-in cannot reach these steps' measured engines. They and their gestures, from their plans:

| step | engines started by | gestures and source windows | can meet the condition |
|---|---|---|---|
| S1 | cua's service (action-settle.mjs) | `settle('chrome,electron')`: Chrome cells, and Electron `drag`s and a desktop `drag_handle` on the `electron-input` page (action-settle-cells.mjs:162,170,187–188,246) | **The window, yes** (Electron, `cua171-electron-page`). The take is unlikely: the path is on a plain `div#pad` that is not draggable (pages/input.html:9,30), and a landed cell needs a page `mouseup`, which Chromium withholds during a drag and drop. Class A anyway. |
| L3b | the same | `settle('electron', LOAD2)`: the same Electron cells | Same as S1. Class A anyway. |
| S2, L3c | the same | firefox and gedit: Gecko and GTK 3 drags | no |
| S3, L3d | the same | kate and qtcreator (Qt), Writer (LibreOffice), gnome-terminal (no drag) | no |
| S4, L3e | the same | xterm (XTerm), gtk4-input (GTK 4); gtk3, qt5 and qt6 cells have no drag | no |
| L3a | the same | Chrome cells only, class `Google-chrome` (M4's recorded `"app":"Google-chrome"`) | no |
| ES | cua serve (engine-stop.mjs) | the `handle` case: a `drag_handle` with no window, at +60,+60 of the `stop-hold` xterm (engine-stop.mjs:77–79,578). Under the point is that xterm or the front xterm, class XTerm. Browsers default to `['chrome']` (engine-stop.mjs:690), and ES passes no `--browsers`. | no |
| FB | cua's service (services.mjs) | the over-budget Chrome page: reads, and `perform_secondary_action` refusals; no drag (services.mjs:105–129) | no |
| R1 | suites.sh → repl-parity `--suite native` | gedit only, with "Never launches or binds a browser" (test/repl-parity/serve-native.mjs:3); its drag case is in gedit | no |
| R2 | native-baseline | gedit; no drag | no |
| R3 | scripts/accept/linux-native.mjs | gedit and zenity; no drag | no |
| R4 | scripts/accept/linux-device-mode.mjs | gnome-text-editor; click, key, text; no drag | no |

The harness's Chrome is `google-chrome` (chrome.mjs:24). Its recorded WM_CLASS is `google-chrome (<profile>) /
Google-chrome` (m4/harness-helpers/pilot-id-3), so it is in the Chrome family. Chrome for Testing appears only on the
macOS paths.

**Only S1 and L3b can meet the window part of the condition.** Both are class A under ruling 827 and rerun on both
architectures, so their counter is not needed. If it were wanted, the counter would have to come from cua's service
itself (src/services/engine/linux), which spawns the engine. An opt-in variable read only by the harness's settle
experiment would pass `--stats` and keep the engine's stderr stats lines apart for a record. That is outside this
change.

## Reach under §8.1

**Changed:**
- `scripts/linux-engine-diff/engine.mjs`, which every step that starts an engine through it reaches;
- `scripts/linux-engine-diff/cli.mjs` and `scripts/linux-engine-diff.mjs`, which every harness step reaches;
- `scripts/linux-engine-gate/gate.mjs` and `steps.mjs`, the launcher of every step;
- new: `scripts/linux-engine-diff/settle-counts.mjs` (imported by engine.mjs) and
  `scripts/linux-engine-gate/settle-check.mjs` (run by no step).

**Untouched:** run.mjs, report.mjs, every judge (drag-judge, drop-signals-judge, matrix-judge, safety-judge, the
rejudge scripts and the rest) and every parser.

**Without the flag**, a step's engines start with the same argv, and its runners read the same stream (proof 1). The
additions all stay out of every row, log and judge input:
- an in-memory record per engine (its identity, the requests it was sent, its last counter);
- one `realpath` of the engine's path at launch, before the timed spawn;
- a `close` listener;
- the exit-time write of `settle-counts.json` into the out directory.

The `--version` probe runs only under the opt-in.
