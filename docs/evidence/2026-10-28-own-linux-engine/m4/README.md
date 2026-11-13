# M4 — The measured improvements (#171): the evidence index

M4's Plan of Work entry is in the spec, `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`. It lists tasks
T1 to T19 and the rules the tasks follow (the Decision Log entry "M4 pre-flight, the design session", 2026-11-02). Each
task's evidence is a directory here with its own README. Each was reviewed clean before the task that consumes it ran,
and each has a Decision Log entry; the table names it by its date and title. The close-out, T18 (task 74), is the last
section of this file.

## Read this before comparing numbers with M3

**The facade suites changed venue between M3 and M4.**
- M3 ran repl-parity's native suite, `native-baseline compare --engines`, `accept/linux-native` and
  `accept/linux-device-mode` on the person's display `:0`, through the device `cua-171` with the person's bound Chrome
  profile `me`.
- M4 runs them on a private display: Xvfb, Openbox, a private session bus and AT-SPI. Their browser lanes use a
  run-owned Chrome for Testing profile (the coordinator's ruling, 2026-11-12, agreed by the design session).

The two milestones' facade numbers are not like for like. Neither is anything else measured on `:0` before 2026-11-03
against what was measured after. From task 43 on, the harness runs its own Chrome instance, and from task 45 on every
application runs on default settings in a home of the run's (the Decision Log, 2026-11-03).

## The tasks and their evidence

| Task | Evidence | Decision Log entry | What it settled |
|---|---|---|---|
| T1 (#267) | (PR #273) | 2026-11-02, T1 as built | A gate judges only the release workflow's attested x64 musl artifact of the gated commit; `--dev` runs are labelled |
| T2 (#268) | `clipboard-write-268/` | 2026-11-02, T2 | The newest vendor build's gedit `clipboard_write` failure is GTK 3's `PasteText`; cua's engine cannot reach it (the send boundary) |
| T3 | `truncation/` | 2026-11-02, T3 | `truncated {nodes, depth, failed}` from cut points the read already knows; the facade line on the over-budget page |
| T4 | `minimized/` | 2026-11-02, T4 | Minimized windows listed with `minimized: true` and readable; input refused; releases always run |
| T4b, T4c | `harness-windows/` | 2026-11-02, T4b; 2026-11-03, T4c | The harness never changes a window it did not open; the record judge |
| task 41 | `xserver-record-hang/` | 2026-11-02, whole-run RECORD never on a person's display | X RECORD can freeze Xorg 21.1.12; the watchdog |
| tasks 43–52 | `harness-isolation-live/`, `record-judge-acceptance/`, `person-display-live/` | 2026-11-03, the harness's isolation | The harness's own instances, homes, buses and spawner; task 50's guards for `:0` |
| task 53 | `person-display-live/task54/` | 2026-11-03, the judge task before T6 | XTEST placement in the route audits; the witness's within-toplevel allowance |
| T5 | `identity/` | 2026-11-02, T5 | Duplicate frames told apart by position, then by the frame's active state; otherwise cua's sentence |
| T6 | `atspi/` | 2026-11-03, T6 | `Cache.GetItems` not adopted; no `InsertText` lift for GTK 4 |
| T7 | `focus-timer/` | 2026-11-04, T7 | The `FocusOut` timer, built and measured, then superseded (below) |
| T7b | `engine-stop/` | 2026-11-04, T7b | The REPL host lets the engine drain before the kill; the resident shim and the held record |
| T7 revised, tasks 58–60 | `paste-settle/`, `focus-timer/zero/`, `person-display-live/task58/` | 2026-11-05, T7 revised | `FocusOut` at the end of each request; the paste settle |
| task 61 | `qt-activation/` | 2026-11-05, task 61 | A background press never makes a Qt window take the active window in shared mode |
| task 63 | `foreground-raise/` | 2026-11-06, task 63 | The foreground route's pointer input waits for its window's raise; `activate_window` answers once on top |
| T8 | `settle/` | 2026-11-07, T8 | The action settle, a constant per input kind; `animated_action` |
| T9 | `waits/` | 2026-11-07, T9 | Every fixed wait inventoried; desktop `move`'s gap closed; GTK 4's covered capture |
| T10 | `drag-judges/` | 2026-11-08, T10 | The drag judges: long paths by the interval rule, thumbs per run, load lanes |
| T11 | `drag-motion/` | 2026-11-08, T11 | Browser drags paced by time, with a 30 ms rest at sharp joints and at the end |
| T12 (#265) | `drag-load/` | 2026-11-08, T12 | Thumbs and ranges 40 of 40 at twice the load |
| T15, T19 (#353) | `drag-predicates/`, `pointer-route/` | 2026-11-10, T15 closed; 2026-11-10, T19 | Gecko's pointer input by the real pointer: `unless_pointer_within` |
| T13 | `drop-signals/` | 2026-11-10, T13 | Chrome's activation request confirms a drop; no never-take signal |
| T14 (#263, #264, #269) | `drops/` | 2026-11-10, T14 | The late-take watch on every Chromium drop; the drop confirmation; the notice through the facade |
| T16 | `writer-first-drag/` | 2026-11-11, T16 | Writer's first drag was the harness's aim; LibreOffice's element points corrected; the `drag` settle 25 ms |
| T17 (#250) | `drag-handle/` | 2026-11-10, T17's lifecycle; 2026-11-12, T17 as built | `drag_handle`'s pre-press try, hold watch, idle release; Electron's drop confirmed by its cursor |
| task 75 | `drag-control-race/` | (the tech-debt tracker) | The Gecko drag control's missing event was the release, read late |
| T18 | `harness-helpers/`, `foreground-start/`, `facade/` | T18's entries (folded by the design session) | The close-out, below |
| – | `repl-parity-baseline/` | – | Two repl-parity tests that fail on the VM before and after M4 |

## T18 (task 74): the close-out

The close-out ran as five workers, then the whole-branch review's fix waves. The design session ruled the order:
first the code, the harness and the suites, final on a clean head; then the whole-branch review and its fixes; then
the release workflow's attested build-only artifact of that head; then the gate, which is its own rehearsal.
Its findings come back under the T17 convergence line. The task's report is
`.doperpowers/sde/2026-10-28-own-linux-engine-design/task-74-report.md` (local).

### What landed

- **The engine is 0.4.0, and cua's service requires it** (292b6509). A 0.3.0 engine answers no
  `animated_action`, so GTK 4's and Qt's element actions would settle at 10 ms; the version gate refuses it before
  anything is sent and before any settle applies (`test/services-engine-linux/service.test.mjs`).
- **A held `drag_handle` is released at `js_reset`, and at a cell's timeout** (6474d598). The supervisor posts
  `kernel_reset` to a ready trusted worker and waits at most 1 s. A kernel can neither send nor suppress it. On a
  private Xvfb, button 1 is up as soon as js_reset answers (21–26 ms), 10 of 10 (`test/repl-host/linux-reset-release.test.mjs`).
- **A paste naming no element looks again for a focus that GTK reports late** (37b211f7). This was the
  `identity_faults` flake, and it was a race in production: GTK 3's ATK sets FOCUSED in an idle handler after the
  engine's synthetic FocusIn. When that request's own session synthesized the FocusIn, the engine re-reads the same
  window's focused element every 2 ms, up to 50 ms. The longest lag measured was 15.3 ms. The test now passes 100 of
  100 run alone, under contention, and under 16 stress-ng workers.
- **The `engine-linux` gate runs `cargo clippy`** (two lints) **and `tests/two-screens.sh` on a hosted runner**
  (6047aa88, e83b69a0): Xorg on :100, and the review fixes' resizable server on :101.
- **The harness on its shared helpers.** Every gate runner parks the real pointer through `park.mjs` and verifies
  the application under test through `app-identity.mjs` (`harness-helpers/`). `pointer-route.mjs` keeps its own park,
  so as not to change T19's judge. The leftovers are in `tech-debt-tracker.md`.
- **T7 fix 3, a foreground sample's start** (`foreground-start/`). Without it, 5 of 5 transitions were false
  witness reds. With it, there were 0 in 300 samples over 32 Chrome-to-gnome-text-editor transitions.
- **The gate as one runnable sequence,** `scripts/linux-engine-gate/`:
  - `--gate` on experiments runs `candidate.mjs`'s checks. Every artifact is labelled "release gate" or
    "development run, not a release gate".
  - The Electron drop judge: a false ok fails the gate, and #364's costs are findings with counts. The hung-sink
    `slow` cell is #365's declared race (the design session).
  - #358 is a declared speed gap with no closing route.
  - The facade suites are steps R1–R4.
  - Its pilot, a dev build at `--pilot 2`, is in `~/.local/share/cua-171/task74/w4b/pilot/` (local).
- **The facade suites on a private display** (`facade/`). The engine-answered judge now tells T7b's launcher shim
  apart (41070184). No cua-lane facade pass was claimed after the shim arrived (81ae2732), so there was nothing to
  retract.

### The facade suites changed venue

This is restated from the top of this file, because the design session asked for it here. M3 ran these suites on
`:0` through device `cua-171`, with the person's `me` profile. M4 runs them on a private display, with a run-owned
profile. Their numbers are not like for like.

### The clean-head suites (the frozen head cb3661b3, and the fixes merged after it, up to 4c532708)

| Suite | Result | Note |
|---|---|---|
| Engine, the gate's own commands | fmt and both clippy runs clean; live suite 601 tests, 0 failed, 1 ignored; two-screens 3 of 3 | Lock 05:39:54–05:49:24Z on 2026-11-13, load 0.44 at acquire and 0.36 at release, render host none |
| Services and doctor | 76 of 76 | |
| REPL host | 196 pass, 1 fail, 11 skipped on cb3661b3; 192 pass, 0 fail, 16 skipped after ed939416 | On cb3661b3, `serve-own-host` failed with `sandbox_unavailable`: its temporary home held no sandbox helper. ed939416 fixed the test's setup, and its tech-debt entry is resolved |
| Harness, at 4c532708 | 981 of 981 | Lock 07:54:06–07:54:39Z on 2026-11-13, load 0.54 at acquire and 0.64 at release. At 8ab1cc75 it had passed 973 of 975: the private-server tests failed on sockets that leaked xtrace proxies had left behind, and audit-leak-fix (4c532708) stops the leak |

The counted facade suites, on the engine built at the final head, are in `facade/README.md`.
