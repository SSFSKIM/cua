# The settle counter of every step (#171 M5, task 103; rulings 827, 832, 834)

These are development runs and were never counted. Host dc-linux171-1e68 (x86_64), on private displays under gate.mjs, holding
`locked.sh m5-settle-stats`. The candidate is linux-engine 0.4.1 from `m5-engine-041`: `cua-engine 0.4.1 (2d8f6ad96296)`,
sha256 `c99408a04e1905596b78e872a1172d08bac77bc9402bacc622816740f7c93173`. That is the release build in task 101's
checkout, from the same engine source as the measured `cb879d77…`. The harness is at `m5-settle-stats` d89a8a96. The
checker's wording was revised later: `out/checker.txt` was produced at the branch's head and shows that revision. The
records and the judge and report outputs are unchanged by it.

## What the harness records now

- **`settle-counts.json`** goes in each harness out directory (gate.mjs's `<step>.<label>/run/`).
  - It lists every engine the run started: lane, pid, build (`cua`, `vendor` or `other`), argv, the requests sent by
    command, and the last `drop_settles` of the `--stats` lines the run already reads.
  - A lane with no stats is recorded as `no stats: not recorded`, never as zero.
  - It is written at the harness's exit, by `scripts/linux-engine-diff/engine.mjs` (`recordEngines`) and
    `settle-counts.mjs`.
- **`--engine-stats`**, a development run's opt-in, accepted by gate.mjs and the harness CLI.
  - It gives `--stats` to every engine whose build answers `cua-engine …` to `--version`. The probe runs once per path,
    and never on a file that is not ELF.
  - Each engine's lines go to `engine-stats/<harness pid>.<lane>.<pid>.jsonl` and into the record. Nothing reaches the
    runner.
  - A counted run refuses the flag before anything starts: a verdict run without `--dev`, `--gate`, or `--pinned`
    without `--pilot`.
  - So does a step whose engines are started by cua's service or by cua serve: settle, engine-stop, FB, R1–R4.
- **`scripts/linux-engine-gate/settle-check.mjs <step dir>…`** prints, per step:
  - `not taken`;
  - `TAKEN`: the step reruns as class A;
  - `unknown`: a record or counter is missing, an engine was still running at the harness's exit, or a stats line did
    not parse.

  It exits 0 only when every step shows `not taken`.
  - A step's counts are the sum, over its engines, of each engine's last value. The counter is cumulative per engine
    process.
  - A cua engine with no counter that the harness sent no `drag` and no `drag_handle` is listed apart and counted as
    unable to run the settle. Those are the only requests the settle runs inside (below).

## Ruling 834's proof

### 1. Switch off: argv and parsed stream byte-identical to today's

**Hermetic**, `scripts/byte-identity.mjs`, with outputs in `byte-identity/`. Two Engine classes drive one
deterministic stand-in through the same requests and pipelines:
- `origin/feat/171-m5`'s `engine.mjs`;
- the head's, with the record on as the entry point makes it and the opt-in off.

The stand-in writes `--stats` lines when asked: untied ones, an unparsable one, and `drop_settles`. The lanes are cua,
cua:0ms, a runner's own `stats: true`, and a vendor-labelled one.

```
argv:   base a3727dce35e011e2d403a6afd849084fc3a089874d0fcaf0ad1491fc6fdd923f  head a3727dce35e011e2d403a6afd849084fc3a089874d0fcaf0ad1491fc6fdd923f  IDENTICAL
stream: base 396dc291b2176bd4d181062a228bc8b8b699316a38180a6c4b1a523ab387a48c  head 396dc291b2176bd4d181062a228bc8b8b699316a38180a6c4b1a523ab387a48c  IDENTICAL
```

The stream is every answer, its `stats` and `untied`, each pipeline's responses, and each engine's stderr tail. Only
the timings are left out.

**Live**: D1, `gate.mjs run D1 --candidate <0.4.1> --dev --pilot 2`, with the switch off. Its record is
`out/settle-counts.off.json`, with a table in `out/engines-off.tsv`.
- Every engine's argv is today's: no `--stats` on any lane, and D1's runners ask for none.
- No row, log or stdout line carries a stats line (`out/stream.txt`).
- The checker reports the step **unknown**: `10 of 11 cua engines not recorded; 1 of them with no counter were sent no
  drag or drag_handle`. That one is the reader, sent only `list_windows` and `get_window_state`. This is the fail-closed
  reading, as 834 asks.
- A counted run differs from this run only in its candidate checks, which happen before any engine starts. Its engine
  argv and stream are this run's.

### 2. The opt-in run: its judge and report are byte-identical with and without the stats files

D1 again, with `--engine-stats` (`out/settle-counts.on.json`, `out/engines-on.tsv`).
- Every cua engine (`cua`, `cua:0ms`, the reader) got `--stats` once. The vendor builds `pinned` and `newest`, and the
  stub, got none.
- The judge and the report were run over two copies of the run's records (`scripts/collect.sh`):
  - copy A, as recorded;
  - copy B, with `engine-stats/` and `settle-counts.json` removed.
- The judge is the drag experiment's own: `judgeDragCell` over the recorded drag runs, then `dragVerdict` and
  `dragCompleteness`. It reproduces the recorded cells: `reproduces_recorded_cells: true`.
- The report is report.mjs's `writeSummary`.

```
934a383738a004e75b253501949be8c67a8c094590fad025a2440d188a7e3953  judge-report.recorded.txt
934a383738a004e75b253501949be8c67a8c094590fad025a2440d188a7e3953  judge-report.stats-removed.txt
judge and report: BYTE-IDENTICAL
e1cf01eb…  the run's own summary.md, copy A's and copy B's (the same)
```

**The parsed stream carries no stats line** (`out/stream.txt`):
- The opt-in run's `results.jsonl` (48 lines), the step's `stdout.log` and `stderr.log`: 0 `drop_settles`, 0
  `{"stats"`, 0 `engine_stats`, 0 `untied_stats`.
- The drag-run rows have the same key set as the switch-off run's.

**The checker on the opt-in run**:

```
…/out-on/D1.development-run.pilot: not taken (entered 0, second_rest 0, skipped 0, unsettled 0; 11 cua engines)
exit 0
```

D1 drags Chrome. Its window's class `Google-chrome` puts it in the Chrome family, which the settle never enters. So D1,
the cross-check, reads `entered 0` on every engine.

## Where the settle can run, in 0.4.1 (origin/m5-engine-041)

The counter moves only when the settle runs:
- `drop_settles.count` in `engine/pointer.rs` (about line 1258, a plain `drag`'s release);
- `engine/handle.rs` (about line 680, a handle's release).

**A plain drag.** The settle is reached only through these steps:
1. `engine.rs` dispatches `"drag" => self.drag(..)`.
2. The source is the window pressed into, taken only if it is blink:
   `let pressing_into = dropping_into.filter(|&w| self.blink(w));` (pointer.rs:938).
3. The cursor watch starts only for a held drag with no guard, whose source's family
   `confirms_drop_by_cursor` (pointer.rs:1032–1038).
4. The settle runs only `if taken.is_some()`, once a drag and drop has begun (pointer.rs:571–572).

**A handle.** The settle is reached only through these steps:
1. `"drag_handle" => self.drag_handle(..)`.
2. The cursor is set only when the window under the start point is blink and its family `confirms_drop_by_cursor`
   (handle.rs:483–496).
3. It settles only when this holds: `settling = self.cfg.drop_settle && handle.pressed && !pacing.held_rest.is_zero() &&
   matches!(&handle.cursor, Some(Ok(cursor)) if cursor.take_seen())` (handle.rs:574–577).

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
- an in-memory record per engine;
- a `close` listener;
- the exit-time write of `settle-counts.json` into the out directory.
