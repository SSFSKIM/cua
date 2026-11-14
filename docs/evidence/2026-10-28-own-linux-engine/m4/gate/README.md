# #171 M4: the release gate on the attested artifact (T18; tasks 76, 77 and 79), 2026-11-13 to 2026-11-14

**Status: passed on candidate 3** (c55c8e08, `cua-engine-0.4.0-linux-x64` sha256 `751ec9be…`). Every gate step passes
on the record of the latest candidate that ran it, by the gate's own judge or by a ruling over stored records. What is
declared (V3's two chrome-input cells, the speed gaps #358 and #373) is listed apart and never counted as a pass.

The gate ran on three candidates, each the release workflow's attested build-only artifact of a frozen head:

1. **Candidate 1** (514f5c62) ran every step. Every step passed, by the gate's own judge or by a ruling, except V5.
   V5's rerun on `:0` found two false successes in Chrome's drag and drop, and work was reopened.
2. **Candidate 2** (f9692898) adds the background hold's refresh, the fix for those false successes (Chromium's core
   motion coalescing). It reran the steps that fix reaches, and D3 as a cross-check. Every one passed, by the judge or by
   a ruling, except L3a. L3a found Chrome's context-menu Copy stuck under twice the load, and the design session ruled
   the stuck state a defect.
3. **Candidate 3** (c55c8e08) makes every `showContextMenu` caller confirm a menu or answer `menuUnconfirmed`. It reran
   the steps that change reaches, with S4 and S2 as cross-checks. Every one passed, by the judge or by a ruling, and both
   cross-checks matched candidate 1's records.

A step a later candidate did not rerun stands on the earlier candidate's record, for the reasons in "The rerun lists".

## The candidates

| | candidate 1 | candidate 2 | candidate 3 |
|---|---|---|---|
| frozen head (`feat/171-m4`) | `514f5c62dd6c74b1ed24c48f112ca9c35a70eece` | `f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad` | `c55c8e08d9cbbb057b8b95434787b1e45d41184c` |
| why | the gate as planned | V5's false successes (rulings 669–675) | L3a's stuck menus (rulings 681–693) |
| ci-gate | GREEN 8/8, run [43401193339](https://github.com/SSFSKIM/cua/actions/runs/43401193339) | GREEN 8/8, run [43553148367](https://github.com/SSFSKIM/cua/actions/runs/43553148367) | GREEN on c2d2da8b, run [43605947596](https://github.com/SSFSKIM/cua/actions/runs/43605947596) (after rerunning two gates on races unrelated to the change; first run 43603446268). c55c8e08 adds only the spec's fold |
| build-only run (`publish=false`) | [43405393873](https://github.com/SSFSKIM/cua/actions/runs/43405393873) | [43553123316](https://github.com/SSFSKIM/cua/actions/runs/43553123316) | [43608161213](https://github.com/SSFSKIM/cua/actions/runs/43608161213) |
| `cua-engine-0.4.0-linux-x64` sha256 | `f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937` | `90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd` | `751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca` |
| `--version` | `cua-engine 0.4.0 (514f5c62dd6c)` | `cua-engine 0.4.0 (f96928983006)` | `cua-engine 0.4.0 (c55c8e08d9cb)` |
| arm64 subject | `da457d7f69b5546bfbe2fa5ecfa7d923dbb88c51a7fee22009deb33c04f3006b` | `2a1db84aec08ef3135453a00b5656722e010ba9c87b634f199f37455d316a17b` | `0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42` |
| gate checkout | `t76-gate` | `t77-gate` | `t79-gate` |
| evidence | `out/`, `out-rerun1/` | `c2-f9692898/` | `c3-c55c8e08/` |

For each candidate:
- **The build.** The release workflow's version, both musl builds and attest passed, and publish was skipped. The
  artifact is a static-pie x86-64 binary, stripped.
- **The attestation.** `gh attestation verify --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml
  --deny-self-hosted-runners` exits 0. It names the head on `refs/heads/feat/171-m4`, the build-only run's attempt 1,
  and a GitHub-hosted runner. Every step's own `--gate` preparation checked it again: the attested commit equals the
  checkout's HEAD, and `--version` names it. Each step's README and summary carry the line. Candidates 2 and 3 keep
  the `gh attestation verify --format json` output beside their evidence (`artifact/attestation.json`).
- **The gate checkout.** A fresh git worktree, detached at the head and clean: a real `npm ci`, then `node
  node_modules/electron/install.js` (electron 44.9.0 ships no install script), then xprobe built. Its out directories
  lie outside it. From the artifact on, `native/linux-engine/` and `runtime/` were frozen, and nothing in the
  candidate's tree changed during its steps. A fresh checkout per candidate kept each earlier one as it was gated.

R2's top-up (2d5cfeb5, with 514f5c62's fix after review) is in candidate 1's head. R2 did not need it: its counted
sitting passed alone.

## The engine diffs

### Candidate 1 to 2 (`514f5c62..f9692898`)

`git diff --stat 514f5c62 f9692898 -- native/linux-engine` shows three files, 333 insertions and 10 deletions:
- `src/dnd.rs` +139: the new `wait_for_take_refreshing` and its unit test.
- `src/engine/pointer.rs` +37/-10, all inside `drag_along`: its doc comment; the hold branch, which on `Route::Window`
  calls `wait_for_take_refreshing` and on any other route the unchanged `wait_for_take`; the `"refreshes"` field in the
  hold's `--stats` record.
- `tests/live_device.rs` +157: `coalescing_source` and the live test
  `a_chromium_window_busy_through_a_background_drag_s_path_still_gets_its_end_from_the_hold`.

Nothing else changed: `runtime/`, `src/`, `.claude-plugin/` and the package files have no diff. The refresh runs only
when the hold is on (a Chromium-family window with no DropGuard: Chrome in front, dedicated mode, or Electron, which is
never guarded), the route is `Route::Window`, and there was no take by the path's end.

### Candidate 2 to 3 (`f9692898..c55c8e08`)

`git diff --stat f9692898 c55c8e08 -- native/linux-engine` shows 15 files, 943 insertions and 112 deletions. `runtime/`,
`src/`, `.claude-plugin/` and the package files have no diff. The engine's changes:
- `src/copy.rs` +546 (with its tests): one detection, `open_menu`, that reads the application's children, runs the
  action, then polls until a new child holding a `menu item` appears, within `MENU_WAIT` (1 s). After the action every
  read runs against one absolute deadline (`call_by`, through `Transport::call_until`). `context_menu_item`, the
  context-menu Copy, now calls it and is generic over the transport. `copy()` returns the route it took, so a
  context-menu Copy that times out names both risks (the Copy may still complete later, and the window's menus may stay
  unresponsive). The `CopyText` route (`editable_copy`) is unchanged.
- `src/engine/elements.rs` +159: `run_action`. Every element action named `showContextMenu` (`perform_secondary_action`
  naming it, the right-button fallback, a primary click whose action 0 it is) answers ok only once `open_menu` sees a
  menu, else `menuUnconfirmed`. Any other action name runs as before.
- `src/engine/clipboard.rs` +29/-: the timed-out sentence by route.
- `src/tree.rs` +3 and `src/atspi.rs` +7: the `Transport::call_until` method and the bus's implementation over
  `Bus::calls_until`. Only `open_menu` calls it.
- `src/engine.rs` +2: the new test module.
- Tests: `src/engine/menu_faults.rs` (new, live GTK 3), `identity_faults.rs` (the shared `gtk3()` check and
  `CUA171_GTK_TESTS=required`), `refusal_faults.rs`, `targets_faults.rs`, `vcl_faults.rs`, `tree/tests.rs`,
  `tests/live_focus_ack.rs`, `tests/support/gtk3-twins.py`; and `README.md`.

The harness's changes in the same range are additive: `input.html?menu=native` (opt-in), `openFamily`'s `query`, the
Electron page app's native menu, the settle experiment's redefined `secondary_action` cells and its `menu_unconfirmed`
control, `REFUSALS`' "declared unconfirmed" entries for V3's two chrome-input operations, and the verdict's listing
(`stats.mjs` `DECLARED_LOSSES`, `report.mjs`, `rejudge.mjs`).

The fix wave after review (`997d2ece..c2d2da8b`) changed only `open_menu`'s deadline, `context_menu_item`'s generic
form, `run_action`'s tests, the additive `call_until`, the GTK 3 fixtures' check and the CI gate's packages. So the rerun
list approved before it (ruling 691) still held against the final diff, as ruling 691 (C) asked to recheck.

## The rerun lists

### Candidate 2 (sminos 677)

**Rerun (23 steps), with D3 as the cross-check:**
- V5 on `:0`;
- D1, D2, S1 (its Electron background drag), H1, H2 and C1, idle;
- the whole block at twice the load: L1, L2a, L2b, L2c, L3a–L3e, L4a, L4b, L4c, L5, F3a, F3b, F4. It had not run on
  candidate 1 (held behind V5's finding), and most of it drives Chromium drags.

**Kept from candidate 1, with the reasons:**
- V1, V2, V4: no Chromium drag.
- V3: chrome-input's drag is refused before anything is sent (40/40), and minimized_drag is refused as minimized.
- Z0, D3, D4, D5: no Chromium family.
- R1: its drag is in gedit. R2: computer-only. R3, R4: no Chromium drag.
- FB, E1, S2, S3, S4: no Chromium drag.
- F1a, F1b, F2: no drags.
- P1–P6: Firefox only.

### Candidate 3 (rulings 691 and 693)

**Rerun, all private but V3:**
- **S1**: the `secondary_action` cells are redefined (a native menu, closed by the harness's Escape, with the page's
  Escape count required to stay 0), with the `menu_unconfirmed` control cell beside them; candidate 1's and 2's numbers
  for those cells do not carry over. chrome-text's `clipboard_read` and `clipboard_write` are context-menu Copies.
  `right_click` is a right-button `click_element`.
- **L3a**: S1's Chrome cells at twice the load, where the stuck state appeared.
- **L3b**: S1's Electron cells at twice the load, with the control.
- **V3 on `:0`**: chrome-input's `right_click_fallback` and `secondary_action` now answer `menuUnconfirmed` on a page
  that cancels its menu, judged by the harness's "declared unconfirmed" verdict.
- **The cross-checks:** S4 (its element actions run `run_action`'s branch for other action names, which must be
  unchanged) and S2 (gedit's Copy is `CopyText`, through `copy()`'s refactor).

**Skipped, named by the rule but with the changed code unreachable in them (ruling 691):**
- **V4:** `gtk4_right_click_shared` is refused by the device mode before anything is sent.
- **V5:** `firefox_right_click_pointer_out_shared` is refused by T19's rule; `identity_clipboard_read` is refused by
  identity; `identity_secondary_action` names `click`.
- **L3c:** Firefox's `secondary_action` is `press`, its dedicated `right_click` is a coordinate press, and gedit's Copy
  is `CopyText`. (S2 runs the same cells idle as the cross-check.)

**Not named by the rule, kept from candidate 2, or from candidate 1 where candidate 2 kept them:** V1 (`CopyText`), V2
(coordinate clicks); Z0, D1–D5, L1, L2a–c (drags only); R1 (its secondary action names an unknown element and is
refused at resolution), R2–R4, FB, E1; S3, L3d, L3e (their secondary actions name `Press` or `click`); F1a–F4, P1–P6
(`input.html` without the query is unchanged); H1, H2, L4a (no right click), C1, L4b, L4c, L5.

## The cross-checks

- **D3 on candidate 2, against candidate 1's `out/D3`:** the same verdict (cua PASS), cua 30/30 in every cell on both,
  warm medians equal within 0.5 ms, and canvas faster than the newest build on both ([-164, -158.5] against [-161.7,
  -158.45]). Only telemetry moved: cua's Firefox drag-and-drop received-motion median went from 41 to 4, a bimodal
  distribution of 3 or 50 with 17 of 30 against 14 of 30 high. The kept set stood.
- **S4 on candidate 3, against candidate 1's `out/S4`** (which candidate 2 kept), by `scripts/compare-settle.mjs`: the
  same verdicts, cells and audits in all 37 cells and 19 audited ones, and the same misses. Its element actions run
  `run_action`'s branch for other action names, which is unchanged. Output `c3-c55c8e08/out/S4.compare-settle.txt`.
  Since ruling 697 the cross-check also compares the runs' own failures (each summary's "Incomplete or failed" line),
  none in either run; its controls (`scripts/compare-settle-controls.mjs`, outputs `S4.compare-settle-controls.txt` and
  `S2.compare-settle-controls.txt`) add a foreign change, a failed watchdog, a missing cell and a failed audit to the
  later run, and each differs.
- **S2 on candidate 3, against candidate 1's `out/S2`:** the same in all 30 cells and 19 audited ones, gedit's
  `clipboard_read` and `clipboard_write` (`CopyText`, through `copy()`'s refactor) 30/30 on both, and Firefox's
  background `right_click` with its one refusal on both. Output `c3-c55c8e08/out/S2.compare-settle.txt`.
- Neither differs, so ruling 677's branch (the whole kept set reruns) does not apply.

## Every step

Lock lines are from `~/.local/share/cua-171/host-lock.log`, holder `t18-gate`. Load is the 1-, 5- and 15-minute
average. mawsd's render host ran during none of them. Each step's labelled directory is `<out>/<step>.release-gate/`.

A verdict step's speed tally counts each series once, from its `run/summary.md` (`c3-c55c8e08/scripts/speed-tally.py`):
the cua rows that pass, and the series their verdicts name faster, within the bound or the same within noise. This
record's first version doubled candidate 1's V1, V2 and V4 series counts: they were counted as `"label"` fields in
`results.jsonl`, where every cua verdict row carries each series' label twice (`intervals[].label` and
`labels[].label`). The row counts were right.

Candidate 1's speed tallies were corrected to be counted once per series (ba0434ff), and no verdict moved.

### Candidate 1 (task 76, 2026-11-13; `out/`, `out-rerun1/`)

The STOP file held the driver after C1, before the twice-the-load block.

| step | out | acquire (UTC) | release | min | exit | load at acquire | load at release | render host | verdict |
|---|---|---|---|---:|---:|---|---|---|---|
| D1 | out | 10:07:00 | 10:29:48 | 22.8 | 0 | 0.34 0.17 0.16 | 0.58 0.55 0.46 | none | PASS (Chrome's drag cells; #358 declared) |
| D2 | out | 10:29:48 | 10:30:03 | 0.3 | 1 | 0.58 0.55 0.46 | 0.45 0.52 0.45 | none | environment fault (no Electron binary), rerun below |
| D3 | out | 10:30:03 | 10:49:29 | 19.4 | 0 | 0.45 0.52 0.45 | 0.28 0.49 0.59 | none | PASS (Firefox's drag cells) |
| D4 | out | 10:49:30 | 11:15:59 | 26.5 | 0 | 0.28 0.49 0.59 | 0.32 0.40 0.41 | none | PASS |
| D5 | out | 11:15:59 | 11:35:24 | 19.4 | 0 | 0.32 0.40 0.41 | 0.21 0.21 0.27 | none | PASS (Writer unprimed, writer-gen) |
| R1 | out | 11:35:24 | 12:13:04 | 37.7 | 0 | 0.21 0.21 0.27 | 1.37 1.32 1.21 | none | PASS (repl-parity 34 cases each lane, diff ok) |
| R2 | out | 12:13:24 | 12:35:00 | 21.6 | 0 | 0.98 1.24 1.19 | 0.52 0.57 0.73 | none | PASS (compare --engines, no top-up needed) |
| R3 | out | 12:35:01 | 12:38:29 | 3.5 | 0 | 0.52 0.57 0.73 | 1.09 0.93 0.86 | none | PASS (linux-native) |
| R4 | out | 12:38:59 | 12:40:05 | 1.1 | 0 | 0.96 0.92 0.86 | 1.17 1.00 0.89 | none | PASS (linux-device-mode) |
| FB | out | 12:40:25 | 12:40:52 | 0.5 | 0 | 0.99 0.96 0.88 | 1.30 1.03 0.91 | none | PASS (the over-budget truncation line) |
| E1 | out | 12:41:22 | 12:49:22 | 8.0 | 0 | 0.97 0.98 0.90 | 0.79 0.74 0.81 | none | PASS (the events experiment's move) |
| S1 | out | 12:49:22 | 13:21:12 | 31.8 | 1 | 0.79 0.74 0.81 | 0.41 0.58 0.79 | none | PASS by ruling: #302 (below) |
| S2 | out | 13:21:12 | 13:47:51 | 26.6 | 0 | 0.41 0.58 0.79 | 0.87 0.63 0.59 | none | PASS |
| S3 | out | 13:47:51 | 14:13:57 | 26.1 | 0 | 0.87 0.63 0.59 | 0.28 0.35 0.53 | none | PASS (Writer's drag at 25 ms) |
| S4 | out | 14:13:57 | 14:48:49 | 34.9 | 0 | 0.28 0.35 0.53 | 0.36 0.24 0.27 | none | PASS |
| F1a | out | 14:48:49 | 15:05:14 | 16.4 | 0 | 0.36 0.24 0.27 | 0.55 0.54 0.40 | none | PASS |
| F1b | out | 15:05:14 | 15:15:51 | 10.6 | 0 | 0.55 0.54 0.40 | 0.61 0.64 0.51 | none | PASS |
| F2 | out | 15:15:52 | 15:20:09 | 4.3 | 0 | 0.61 0.64 0.51 | 0.34 0.53 0.50 | none | PASS |
| P1 | out | 15:20:09 | 15:48:26 | 28.3 | 0 | 0.39 0.54 0.51 | 0.31 0.32 0.33 | none | PASS |
| P2 | out | 15:48:26 | 16:15:03 | 26.6 | 0 | 0.31 0.32 0.33 | 0.32 0.31 0.34 | none | PASS |
| P3 | out | 16:15:03 | 16:41:22 | 26.3 | 0 | 0.32 0.31 0.34 | 0.57 0.33 0.35 | none | PASS |
| P4 | out | 16:41:22 | 17:10:16 | 28.9 | 0 | 0.57 0.33 0.35 | 0.27 0.33 0.33 | none | PASS |
| P6 | out | 17:10:16 | 17:39:09 | 28.9 | 1 | 0.27 0.33 0.33 | 0.38 0.35 0.37 | none | PASS by ruling: Fisher (below) |
| P5 | out | 17:39:09 | 17:57:53 | 18.7 | 0 | 0.38 0.35 0.37 | 0.55 0.44 0.43 | none | PASS (the leave cases) |
| H1 | out | 17:57:53 | 18:15:45 | 17.9 | 0 | 0.55 0.44 0.43 | 0.48 0.35 0.40 | none | PASS (findings below) |
| H2 | out | 18:15:45 | 18:34:06 | 18.4 | 0 | 0.48 0.35 0.40 | 0.27 0.34 0.39 | none | PASS (findings below) |
| C1 | out | 18:34:06 | 18:35:56 | 1.8 | 0 | 0.27 0.34 0.39 | 0.52 0.42 0.42 | none | PASS (11 late takes, 11 reported) |
| V1 | out | 19:30:54 | 20:07:58 | 37.1 | 0 | 0.17 0.13 0.09 | 0.63 0.43 0.37 | none | PASS (6 cua rows pass; their speed series 7 faster, 1 within the bound) |
| V2 | out | 20:09:42 | 20:34:15 | 24.6 | 0 | 0.22 0.34 0.34 | 1.31 1.51 1.22 | none | PASS (15 cua rows pass; their speed series 26 faster, 1 same within noise, 1 within the bound) |
| V3 | out | 20:34:32 | 21:10:41 | 36.1 | 1 | 1.02 1.44 1.20 | 0.86 1.03 1.07 | none | PASS by ruling: activate_window #373 (below) |
| V4 | out | 21:11:41 | 21:38:13 | 26.5 | 0 | 0.39 0.87 1.01 | 1.03 0.88 0.81 | none | PASS (22 cua rows pass; their speed series 4 faster; every paste case) |
| V5 | out | 21:39:01 | 21:41:02 | 2.0 | 1 | 0.48 0.76 0.77 | 0.35 0.69 0.75 | none | environment fault (the snap's firefox), rerun |
| V5 | out-rerun1 | 21:42:39 | 22:19:16 | 36.6 | 1 | 0.62 0.66 0.73 | 1.57 1.10 0.95 | none | **FAIL: two false successes, one dishonest answer; work reopened** (below) |
| Z0 | out | 22:20:40 | 22:31:42 | 11.0 | 0 | 0.56 0.89 0.89 | 0.61 0.94 0.98 | none | PASS (Firefox's plain drop 30/30 on :0; Writer 30/30) |
| D2 | out-rerun1 | 22:32:12 | 22:50:58 | 18.8 | 0 | 0.66 0.91 0.97 | 0.36 0.47 0.65 | none | PASS: the environment-fault rerun. Electron's select, range, scroller, dnd and canvas 30/30; the thumb reached 146 px or more against the pinned mean of 129.2 |
| L1–F4 | – | – | – | – | – | – | – | – | held: not run (STOP); they ran on candidate 2 |

### Candidate 2 (task 77, 2026-11-14; `c2-f9692898/out/`)

The idle steps, then V5 on `:0` (GO, sminos 679), then the block at twice the load (16 stress-ng workers on 8 cores).

| step | acquire (UTC) | release | min | exit | load at acquire | load at release | render host | verdict |
|---|---|---|---:|---:|---|---|---|---|
| D1 | 03:51:58 | 04:14:36 | 22.6 | 0 | 0.12 0.20 0.25 | 1.02 0.86 0.68 | none | PASS |
| D2 | 04:14:46 | 04:33:41 | 18.9 | 0 | 0.87 0.83 0.67 | 0.32 0.40 0.47 | none | PASS |
| D3 | 04:33:41 | 04:51:50 | 18.1 | 0 | 0.32 0.40 0.47 | 0.90 0.63 0.52 | none | PASS (the cross-check: as candidate 1) |
| S1 | 04:51:50 | 05:23:40 | 31.8 | 1 | 0.90 0.63 0.52 | 0.23 0.31 0.43 | none | PASS by ruling: #302 (below). The fix's cells: electron-input and chrome-input drag background 30/30, dedicated, desktop and handle drags 30/30 |
| H1 | 05:23:40 | 05:41:37 | 17.9 | 0 | 0.23 0.31 0.43 | 0.78 0.48 0.45 | none | PASS |
| H2 | 05:41:37 | 06:00:05 | 18.5 | 0 | 0.78 0.48 0.45 | 0.60 0.38 0.36 | none | PASS |
| C1 | 06:00:05 | 06:01:54 | 1.8 | 0 | 0.63 0.39 0.36 | 0.72 0.50 0.40 | none | PASS |
| V5 | 06:05:17 | 06:42:21 | 37.1 | 1 | 0.50 0.53 0.44 | 1.25 1.31 1.33 | none | PASS by ruling: the witness span's limit (below). Candidate 1's three failing cases passed: short_in_front 9/9 landed ok, obscured_in_front_late 9/9, inzone_out 9/9 honest; 63 drop samples, 45 landed, 0 false ok |
| L1 | 06:46:22 | 07:14:56 | 28.6 | 0 | 0.36 0.83 1.13 | 15.92 16.39 14.37 | none | PASS |
| L2a | 07:18:06 | 07:41:18 | 23.2 | 0 | 0.87 8.76 11.74 | 18.62 17.95 16.36 | none | PASS |
| L2b | 07:56:19 | 08:12:02 | 15.7 | 0 | 1.19 2.04 7.01 | 15.27 15.80 13.17 | none | PASS |
| L2c | 08:14:52 | 08:42:56 | 28.1 | 0 | 0.96 9.00 10.98 | 18.06 17.89 16.69 | none | PASS |
| L3a | 08:45:56 | 09:15:36 | 29.7 | 1 | 0.92 9.83 13.76 | 16.44 16.82 16.48 | none | **FAIL: Chrome's context-menu Copy stuck** (below); every answer honest. Ruled a defect; rerun on candidate 3 |
| L3b | 09:18:36 | 09:36:38 | 18.0 | 1 | 0.90 9.28 13.60 | 15.31 16.17 15.63 | none | PASS by ruling: #302 on both routes (below) |
| L3c | 09:42:28 | 10:17:13 | 34.8 | 0 | 0.91 7.75 12.23 | 16.82 16.71 16.33 | none | PASS |
| L3d | 10:23:03 | 11:02:07 | 39.1 | 0 | 0.87 7.56 12.58 | 16.31 16.47 16.44 | none | PASS |
| L3e | 11:05:18 | 11:41:26 | 36.1 | 0 | 0.87 8.86 13.46 | 16.38 17.05 16.53 | none | PASS |
| L4a | 11:54:56 | 12:14:21 | 19.4 | 0 | 0.95 2.48 7.78 | 16.98 16.91 14.56 | none | PASS |
| L4b | 12:39:08 | 12:52:49 | 13.7 | 0 | 0.33 0.57 3.31 | 16.96 16.02 11.38 | none | PASS |
| L4c | 13:06:43 | 13:08:44 | 2.0 | 0 | 1.88 2.47 5.32 | 14.43 7.00 6.63 | none | PASS |
| L5 | 13:11:44 | 13:13:18 | 1.6 | 0 | 0.92 3.96 5.51 | 12.96 7.16 6.50 | none | PASS |
| F3a | 13:15:58 | 13:35:37 | 19.6 | 0 | 0.89 4.19 5.46 | 16.75 16.97 13.84 | none | PASS |
| F3b | 13:38:28 | 13:52:23 | 13.9 | 0 | 0.98 9.60 11.52 | 17.01 16.75 14.81 | none | PASS |
| F4 | 13:55:53 | 14:00:49 | 4.9 | 0 | 0.96 8.45 11.86 | 16.74 13.66 13.18 | none | PASS |

L4b waited 20 min for the lock behind task 78's live proof (12:18:31–12:39:08), and L4c 10 min (12:56:49–13:06:43);
neither step overlapped another holder. L4c's lower 5-minute load at its release reflects that wait.

### Candidate 3 (task 79, 2026-11-14; `c3-c55c8e08/out/`)

The idle private steps, then V3 on `:0` (GO, sminos 695), then L3a and L3b at twice the load. No other holder took
the lock between them (task 79's own setup released it at 15:05:22Z).

| step | acquire (UTC) | release | min | exit | load at acquire | load at release | render host | verdict |
|---|---|---|---:|---:|---|---|---|---|
| S1 | 15:12:27 | 15:46:34 | 34.1 | 1 | 0.06 0.20 0.31 | 0.45 0.45 0.49 | none | PASS by ruling: #302 (below). The redefined cells 30 consecutive, audits clean: chrome-input and electron-input `secondary_action` (a native menu confirmed, closed, the page's Escape count 0), `menu_unconfirmed`, `right_click`; chrome-text `clipboard_read` and `clipboard_write` |
| S2 | 15:46:34 | 16:13:13 | 26.6 | 0 | 0.45 0.45 0.49 | 0.39 0.41 0.42 | none | PASS (the cross-check: as candidate 1) |
| S4 | 16:13:13 | 16:48:03 | 34.8 | 0 | 0.39 0.41 0.42 | 0.54 0.38 0.36 | none | PASS (the cross-check: as candidate 1) |
| V3 | 16:50:18 | 17:28:22 | 38.1 | 1 | 0.15 0.27 0.32 | 0.87 1.11 1.05 | none | PASS by ruling: activate_window #373 (below); `right_click_fallback` and `secondary_action` **declared unconfirmed**, listed apart (below) |
| L3a | 17:30:02 | 18:01:00 | 31.0 | 0 | 0.99 1.06 1.03 | 15.46 16.58 14.76 | none | PASS: every Chrome cell 30 consecutive with 0 misses, `clipboard_read` and `clipboard_write` 30/30, audits clean |
| L3b | 18:04:10 | 18:21:56 | 17.8 | 1 | 0.85 8.87 12.06 | 16.69 16.51 15.22 | none | PASS by ruling: #302 on both routes (below). `secondary_action`, `menu_unconfirmed` and `right_click` 30/30 |

## Steps that passed by a ruling over stored records, not by the gate's own judge

Each script reads only the stored rows, through the candidate checkout's own judge functions. It lives under `scripts/`
here, outside the candidates' trees. Each was checked against negative controls: the step's rows edited one way at a
time, every edit failing.

A ruling replaces only the failures it covers (the design session's ruling 697, after an independent review found the
scripts rebuilt a passing result from the cells the ruling covers and dropped the rest). Each script now keeps every
terminal failure the run recorded (a verdict run's end row, an experiment's settle verdict or summary: preparation over
its cap, a warm-up, a change to a window the harness did not open at its cleanup, the watchdog, a cell not opened)
except the exact ones its ruling replaces, and it requires the step's coverage as the candidate's own `steps.mjs` plans
it: every operation with its verdict, every settle cell with its series and audit, every predicates case. Each prints
what it replaced, the failures it retained and its coverage. P6's landing is judged by Fisher alone (a shortcut on raw
landings passed cua 22 of 30 against the pinned build's 20 of 20, p = 0.0109), with the pinned build's reference at
least 30 valid runs: the manifest's own count for an allowed case (`predicates.mjs` `ALLOWED_RUNS`), as the load judge
it borrows from compares full sides (40 a side). Every re-judge in the table was rerun over its stored records: every
verdict and count is unchanged, and each output above was replaced in place, byte-identical to the one before but for
the new lines (and P6's header, which now names the reference's minimum). The table's last column is what each rerun
retained beyond what its ruling replaced. Every control was rerun too: the earlier ones fail as before, line for line,
and ruling 697's new ones fail under the amended scripts and pass under the scripts as they were (all but
compare-settle's missing cell and failed audit, which it already caught).

| candidate | step | counts | ruling | script | output | other terminal failures retained |
|---|---|---|---|---|---|---|
| 1 | S1 | electron-input press_key background: 32 runs, 22 pass, **10 #302** (key-down inside the settle, key-up seen 206.9–218.7 ms after the answer, released by the next before-read), 0 failing; streak 32 of 30; audit pass. electron-text and electron-input desktop 30/30 | #302, a declared limit (T8), the lane's encoding missing; sminos 659 | `scripts/rejudge-302.mjs`; controls `scripts/rejudge-controls.mjs`, and `scripts/rejudge-302-c3-controls.mjs` with ruling 697's | `out/S1.rejudge-302.txt`, `S1.rejudge-controls.txt`, `S1.rejudge-302-c3-controls.txt` | none |
| 1 | P6 | firefox dnd visible pointer-in: cua 29/30, **1 honest miss** ("the desktop pointer left its window"; GTK's drag source ended mid-path), 0 ok with no effect; pinned 30/30; one-sided Fisher p = 0.5000 ≥ 0.05. The other 7 dnd cases as the manifest judged them | an honest miss on an allowed dnd case is a landing miss under one-sided Fisher at LOAD_P against the pinned build (ruling 650's principle); ok with no effect is hard; sminos 662 | `scripts/rejudge-dnd-fisher.mjs` (Fisher alone since ruling 697, the pinned build's reference at least 30 valid runs); controls `scripts/rejudge-dnd-controls.mjs` | `out/P6.rejudge-dnd-fisher.txt`, `P6.rejudge-dnd-controls.txt` | none |
| 1 | V3 | chrome-input activate_window cua: cold 10.4 ms against the bar's 3.86 (interval [5.635, 7.8]); warm 7.9 against 0.52 ([6.145, 8.97]); effect 40/40, audit and witness as the vendor builds'. 41 rows: 39 pass, 1 declared refusal (M3's), 1 declared gap | **declared speed gap #373**, no closing route: "activate_window waits for its window's raise so the next input can't reach the window it covered (task 63, 2026-11-06); the wait is the safety; tracked by #373". From task 63's ruling, made after M3's gate; activate_window went unmeasured on `:0` until this gate. sminos 666 | `scripts/rejudge-speed-gap.mjs` (as committed in 41b08b4e; the output rerun under the amended script, ruling 697); controls `scripts/rejudge-gap-controls.mjs` | `out/V3.rejudge-speed-gap.txt`, `V3.rejudge-gap-controls.txt` | none |
| 1 | D2 | environment fault: no Electron binary, spawn ENOENT at 15 s at the first Electron page, before any engine request. Rerun into `out-rerun1/D2.release-gate`: PASS | the design session (relayed), sminos 664, 665 | none | `out/D2.release-gate/stderr.log` | – (no re-judge: rerun) |
| 1 | V5 | environment fault: the snap's `/usr/bin/firefox` started instead of task 59's Mozilla Firefox and failed in the guard ("cannot create transient scope … org.freedesktop.systemd1"). No verdict made, 0 flags, screen as found. Rerun into `out-rerun1/V5.release-gate`: FAIL (the false successes below) | the design session (relayed), sminos 668 | the launcher fix (`run-zero2.sh`) | `out/V5.release-gate/run/apps/*firefox-device_cua.stderr`, `wrap.out` | – (no re-judge: rerun) |
| 2 | S1 | electron-input press_key background: 33 runs, 26 pass, **7 #302** (key-up 205.7–222.9 ms after the answer), 0 failing; streak 33 of 30; audits pass. 48 cells | #302, sminos 659 | `scripts/rejudge-302.mjs`; controls `scripts/rejudge-302-c3-controls.mjs` | `c2-f9692898/out/S1.rejudge-302.txt`, `rejudge-302-c3-controls.txt` | none |
| 2 | V5 | device-chrome-dnd `chrome_dnd_late_take_shared` sample 2/0: an honest answer (a plain drag at 164.97 ms, the notice on the read, the next acting request refused, the late drag and drop escaped 1.4 ms after the release), but its dragend came 201 ms after the press, after the witness span closed (the answer + 20 ms), so the drop's activation fell outside it. 52 rows, 0 failing, 2/0 as the span's limit | **the witness span's limit on a late take's drop**, a mechanical re-judge; the witness tail is tech debt; sminos 680 | `scripts/rejudge-late-take-window.mjs`; controls `scripts/rejudge-late-take-controls.mjs` (the notice missing, the next acting request not refused, the drop early with a clean witness, no witnessed drop; and ruling 697's, a foreign change at the run's cleanup, preparation over the cap, a planned operation unjudged: each fails) | `c2-f9692898/out/V5.rejudge-late-take-window.txt`, `V5.rejudge-late-take-controls.txt` | none |
| 2 | L3a | chrome-text `clipboard_read` 28 of 31 refused, `clipboard_write` 31 invalid: one Copy timed out (trial 3), then every Copy on that window "context menu did not open". 0 answered ok; the clipboard unchanged; `desktop_clean` throughout. **Not passed** | the trigger a declared load limit (#375, 681); the stuck state a defect (683, 684), fixed in candidate 3. Candidate 3's L3a passed on its own judge, so it has no row here (its step table) | analysis `c2-f9692898/scripts/l3a-clip.py`, `l3a-clip2.py`; reproductions `c2-f9692898/l3a-repro/` | `c2-f9692898/out/L3a.release-gate/` | – (not passed) |
| 2 | L3b | electron-input press_key background: 57 runs, 55 pass, **2 #302** (232.3–251.1 ms); electron-input press_key **desktop**: 31 runs, 25 pass, **6 #302** (238.8–316.8 ms), 0 failing; electron-text 30/30. 23 cells | #302 covers both routes (659, confirmed by 682). The script's desktop condition amended to `desktop_clean === true && front_active !== false` (a desktop-route cell has no front window), in 05733962; candidate 1's S1 re-judged identically, candidate 2's unchanged | `scripts/rejudge-302.mjs` as amended (the earlier copy `c2-f9692898/scripts/rejudge-302.before-amend.mjs`); controls `scripts/rejudge-302-amend-controls.mjs` (desktop_clean false, front_active false: each fails) | `c2-f9692898/out/L3b.rejudge-302.txt`, `rejudge-302-amend-controls.txt`, `S1-candidate1.rejudge-302-amended.txt` | none |
| 3 | S1 | electron-input press_key background: 32 runs, 27 pass, **5 #302** (206.4–222.7 ms), 0 failing; streak 32 of 30; audits pass. 50 cells | #302, sminos 659 | `scripts/rejudge-302.mjs` (amended); controls `scripts/rejudge-302-c3-controls.mjs` | `c3-c55c8e08/out/S1.rejudge-302.txt`, `rejudge-302-c3-controls.txt` | none |
| 3 | L3b | electron-input press_key background: 59 runs, 58 pass, **1 #302** (314.5 ms); electron-input press_key **desktop**: 34 runs, 25 pass, **9 #302** (229.8–294.7 ms), 0 failing; electron-text 30/30. 24 cells | #302 on both routes (659, 682) | `scripts/rejudge-302.mjs` (amended); controls `scripts/rejudge-302-c3-controls.mjs` (on each route's first #302 run, in S1 and L3b: a lost key, each of the three criteria, a refusal, the desktop changed, the front window not active; and ruling 697's run-wide five a step: a family skipped as the run records it, its rows simply gone, a foreign change at the cleanup, the watchdog failed, an audit gone; 33 controls, each as expected) | `c3-c55c8e08/out/L3b.rejudge-302.txt`, `rejudge-302-c3-controls.txt` | none |
| 3 | V3 | chrome-input activate_window cua: cold 11.56 ms against the bar's 4.26 ([6.035, 8.265]); warm 8.46 against 0.55 ([6.285, 10.045]); effect 40/40, audit and witness as the vendor builds'. 41 rows: 37 pass, 2 declared unconfirmed, 1 declared refusal (M3's), 1 declared gap | **#373** (666); the two chrome-input cells **declared unconfirmed** (688, 691), standing as the harness judged them | `scripts/rejudge-speed-gap.mjs`, amended so that a stored verdict the candidate's harness lists as a declared loss (`stats.mjs` `DECLARED_LOSSES`) stands, listed apart; on candidate 1's V3 its output is the committed one (`V3-candidate1.rejudge-speed-gap-amended.txt`). Controls `scripts/rejudge-gap-c3-controls.mjs`: task 76's seven, either declared cell stored as a fail, ruling 697's three (preparation over the cap, a foreign change at the cleanup, a planned operation unjudged), and the stored rows under a harness without `DECLARED_LOSSES`, each fails | `c3-c55c8e08/out/V3.rejudge-speed-gap.txt`, `V3.rejudge-gap-c3-controls.txt` | none |

## Declared, listed apart, never a pass

### V3's chrome-input cells on candidate 3 (rulings 688 and 691)

`right_click_fallback` and `secondary_action` on chrome-input ask for `showContextMenu` on a page that cancels Chrome's
menu (`preventDefault`), as a page drawing its own menu does. The vendor builds answer ok as soon as the action is
sent. Candidate 3 answers ok only once a menu appears, so here it answers `menuUnconfirmed`: "showContextMenu was sent
and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window
before retrying". The harness declares both cells in `REFUSALS` (`unconfirmed`, `effect`), and its verdict is
**declared unconfirmed**: a loss against the vendor, listed apart, never a pass. It holds only while all three parts
hold for every cua sample of the cell:
1. the sample answers `menuUnconfirmed`;
2. AND the page's context counter rose on the element the request named (the request was sent, and the page took it);
3. AND the witness is unchanged.

Speed is not judged, since cua answers after its 1 s wait for the menu. `scripts/check-declared-unconfirmed.mjs` checks
the three parts row by row, beside the harness's own verdict:

| cell | samples (timed) | 1. menuUnconfirmed | 2. context rose | 3. witness unchanged | audit | harness's verdict | holds |
|---|---|---|---|---|---|---|---|
| chrome-input right_click_fallback cua | 40 (40) | 40/40 | 40/40 | 40/40 | clean, its 2 requests menuUnconfirmed | declared unconfirmed | yes |
| chrome-input secondary_action cua | 40 (40) | 40/40 | 40/40 | 40/40 | clean, its 2 requests menuUnconfirmed | declared unconfirmed | yes |

Output `c3-c55c8e08/out/V3.check-declared-unconfirmed.txt`. Its controls (`scripts/check-declared-unconfirmed-controls.mjs`,
output `V3.check-declared-unconfirmed-controls.txt`) each break the declaration: a sample answered ok, one answered
another error, one whose counter did not rise, one whose witness changed, a foreign change in the audit, and the
harness's verdict stored as a fail. On candidate 1's V3 rows, which answered ok, it does not hold
(`V3-candidate1.check-declared-unconfirmed.txt`). The vendor builds answered both cells ok (cold medians about 707 ms for
`right_click_fallback` and 347–352 ms for `secondary_action`); cua answers after its 1 s wait (cold 1048.4 and 1045.7
ms), which the declaration does not judge.

### The limits, each with its ticket

- **#375**, the trigger of L3a's finding: a context-menu Copy that Chrome does not serve within `COPY_WAIT` (2 s) at
  twice the load (16 workers). cua answers "clipboard update timed out", and from candidate 3 on the sentence names both
  risks. A declared load limit (ruling 681).
- **#376**, the stuck menus: after such a timeout, every later context-menu Copy on that window found no menu. Its
  mechanism is unknown; a plain stall does not produce it, and no recovery is proven safe to the page, so none is sent
  (rulings 683–685). Candidate 3 answers it honestly (`menuUnconfirmed`, or the Copy's "context menu did not open").
- **#377**, the page-drawn menu: a page's own ARIA `role=menu` could count as confirmed, but only through events the
  engine has no machinery for. Until then `menuUnconfirmed` carries it (ruling 687).
- **#378**, Chromium closes a menu opened by an element action at the end of the request on the background session, with
  the pinned vendor build as with cua (rulings 689, 690).
- **#379**, the detection's misses: GTK 4's and Firefox's menus appear under the element's window, not as new
  application children, and Qt's never reach the tree. No request reaches the detection in those families today.
- **#374**, the matching macOS gap: the vendor-style ok on `AXShowMenu`.
- **#365**, the hung drop target's declared race and the guarded route's residuals (H1, H2; the stall past press + 250 ms).
- **#358**, Chrome's long drag and drop: a declared speed gap with no closing route (the floor and the hold keep drops
  honest; no never-take signal). D1 passed with it inside its bound.
- **#373**, `activate_window`'s raise wait: a declared speed gap with no closing route (V3, by ruling 666).

## Candidate 1's V5 false successes (resolved by candidate 2)

V5's rerun on `:0` (under `--ballast gate`): 11 of device-chrome-dnd's 14 cases passed, and so did every Firefox device
case and all four identity scenes. Three cases failed one sample each. All three were in block 1, within about 160 s
of each other. In each, Chrome never took `XdndSelection` within the press + 250 ms hold (`press.taken: false`).

1. **`chrome_dnd_short_in_front_shared`, block 1, cold.**
   - cua answered **ok** in 259 ms. The hold: held, not taken, waited 201 ms.
   - The page saw a plain press and release, with no dragstart: downs 51→52, ups 15→16, starts and drops unchanged.
   - No notice. The other 8 samples took and dropped.
   - **A false success.**
2. **`chrome_dnd_obscured_in_front_late_shared`, block 1, warm 1.**
   - cua answered **ok** in 160 ms, outcome `no_start`. The page's dragstart came at h164.4, after the answer, with no
     drop.
   - The other 8 answered not-ok with outcome `late`.
   - Judge: "a request answered success; an answer was not honest".
3. **`chrome_dnd_inzone_out_in_front_shared`, block 1, warm 2.**
   - cua answered **ok** in 256 ms, not taken. The page saw a press and release only.
   - No notice. The other 8 took, each carrying the unconfirmed-drop notice.
   - **A false success.**

The design session ruled that they reopen work (sminos 669). The investigation found the mechanism: Chromium's
`CoalescePendingMotionEvents` discards the queued core `MotionNotify` events of a `SendEvent` path when its browser
thread is busy, so the path is lost and the drag becomes a click. Candidate 2's fix re-sends the path's last point during
the hold (ruling 672). On candidate 2, V5 passed all three cases (9/9 each) and gave 0 false ok in 63 drop samples.

## Candidate 2's L3a finding (resolved by candidate 3)

- **What L3a saw (twice the load):** chrome-text `clipboard_read` refused 28 of 31 runs and `clipboard_write` ran 31
  invalid. Trials 0–2 passed. Trial 3 answered "clipboard update timed out" (the 2 s `COPY_WAIT`, after Copy was
  activated). Every read after it answered "context menu did not open; no clipboard action was sent" (the 1 s
  `MENU_WAIT`), for the rest of the cell and every read the write cell made. No run answered ok, the clipboard was
  unchanged on every run, and `desktop_clean` was true throughout. Every other Chrome cell passed 30/30, on that window
  too.
- **The reproductions** (`c2-f9692898/l3a-repro/`): r1 (35 runs) did not reproduce it; r2 (`--trials 60`) did, at trial
  59, with no menu node showing and no leftover child afterwards. The Escape check esc1 (150 reads) saw no timeout, and
  showed that an Escape sent to Chrome's window with no menu up reaches the page (its counter 0 → 1), so a blind Escape is
  ruled out. The forced stall frz1 (SIGSTOP of the run's own Chrome for 2.6 s after the Copy's activation) gave the
  timeout but not the stuck state, and Chrome served the Copy about 0.3 s after it resumed.
- **The rulings:** 681 (the trigger a load limit, #375), 683 (the stuck state a defect), 684 (the `showContextMenu`
  callers confirm a menu or answer otherwise; no recovery unless proven harmless), 685, 687 (`menuUnconfirmed`), 688,
  690, 691 (the rerun list) and 693 (the fix wave's deadline).
- **On candidate 3:** L3a passed on its own judge (every Chrome cell 30 consecutive, `clipboard_read` and `clipboard_write`
  30/30, audits clean). The trigger did not occur: no Copy timed out, so neither the stuck state nor the new timed-out
  sentence was reached here. Those are proven by task 78's live GTK 3 forced-stall test and its Chrome freeze proof
  (`c3-menu-proof/`), and #375 and #376 stay stated limits.

## Findings with counts (not failures)

- **#365, the hung sink's declared race.** Candidate 1: H1, idle, 0 of 60 ok with no drop; H2, at the gate's window
  load, 0 of 59. Candidate 2 reran both and passed.
- **#364, cold handle drops landing unconfirmed.** Candidate 1's H2, at the gate's window load: 4. T14's share: 4 of 200
  landed drops unconfirmed, within 5%. H1: 0 of 200.
- **H2's root lane.** Unmeasured: every end of cua:desktop and cua:handle, 30 each, was not verified where the drag
  left the pointer. Recorded as the judge reports it.
- **C1 (#264).** Candidate 1: 11 real late takes, all 11 reported. No false ok. T14's share: 0 of 29.
- **#358, declared.** D1 passed on candidates 1 and 2 with Chrome's long drag and drop inside its 40 ms bound.
- **#302.** S1's runs on every candidate, and L3b's on candidates 2 and 3, in the ruled-steps table.
- **Candidate 3's settle noise, within each step's own rule:** S1's chrome-input press_key background had 1 late run
  (30 consecutive at run 36), and chrome-input and electron-input move desktop 1 late each (31 runs); L3b's
  electron-input press_key background 1 late (#302) in 59. The changed code reaches none of them.
- **The run's verdict line** prints the declared unconfirmed cells under "declared refusal (a loss, not a pass)"
  (`stats.mjs` `verdictLine`); their rows and the summary say "declared unconfirmed". Wording only; tech debt.
- **The load judge's raw-count shortcut** (`drag-judge.mjs` `loadCounts`: `mine.took >= pinned.took || p >= LOAD_P`)
  agrees with Fisher only when both sides ran as many runs; tech debt. Read of the stored records (ruling 699,
  `scripts/check-load-sides.mjs`, output `c2-f9692898/out/load-sides.txt`): 30 lane rows in 4 steps, candidate 2's L1,
  L2a, L2b and L2c (the only steps that ran the load judge), every one 40 against 40 on both sides, and recounted from
  the runs, so no stored verdict depends on the shortcut.

## The `:0` sittings' checks

Each sitting was cleared by the design session ("GO :0") and ran under task 50's guards and wrap71: owner-check before
and after, owner-watch, tmp-watch, a TMPDIR of its own (empty after every step), and 0 flags with 0 decoy connections
every time. The owner's Chrome kept the same pid, 2546101, throughout every sitting and was never signalled.

- **Candidate 1** (19:30–22:32Z, 2026-11-13): V1–V5 and Z0, with V5 rerun once.
  - owner-check showed no difference after Z0 and after V5's first run. After the other steps its one difference was
    the person's own Chrome writing its profile's mtime, which wrap71 saw no run process touch.
  - The pointer was restored to 142,130 after every step. At the all-clear (22:32Z) no window of the run's was left
    on `:0`, and no Firefox or LibreOffice of the run's was running.
  - The vendor bar resolved: no speed series was left undetermined in V1–V5.
  - `witness_allowed` focus moves: none occurred in V1–V5, so there was nothing for the within-toplevel allowance to
    judge.
  - T7 fix 3: V4's 103 of 103 foreground starts were clean (quiet, 0 popups, waits of 2–5 ms), with no false red. V5's
    foreground checks held.
  - Pixel baselines: none is stored across sittings. Z0's Writer cell, the first on `:0`'s theme, passed 30/30, so the
    layout constant held. Z0's Firefox plain drop took 30/30 on `:0` (T11's end rest); the cua:0ms control took 0/30,
    as it should.
- **Candidate 2** (06:05–06:42Z, 2026-11-14): V5. 15,083 guard samples, 0 flags, 0 decoy connections, no leftovers; the
  stub check failed by both witness and audit; the pointer restored to 142,130; no run windows or Firefox left.
- **Candidate 3** (16:50–17:28Z, 2026-11-14): V3 (GO, sminos 695). 17,450 guard samples, 0 flags, 0 decoy
  connections, no leftovers; the stub check failed by both witness and audit; owner-watch 220 checks, no change; the
  owner's Chrome's one difference its profile's mtime; the pointer restored to 142,130; the only client window left on
  `:0` the owner's own, no Firefox, and the run's TMPDIR gone. The vendor bar resolved: no speed series undetermined
  (41 cua rows: 37 pass, their speed series 20 faster; the losses are activate_window's, #373, and the two declared
  cells', not judged on speed). No
  `witness_allowed` focus move occurred.

## Launcher fixes (outside the candidates' trees)

- **Electron in the gate checkout.** `npm ci` does not fetch electron 44.9.0's binary, so `node
  node_modules/electron/install.js` must follow it. Candidates 2 and 3's setup scripts do (`setup-gate.sh`).
- **Firefox on `:0`.** The command `gate.mjs print` prints does not put task 59's Mozilla Firefox first on PATH. The
  sittings' `env.sh` did, and so does gate.mjs for its own runs (`DEFAULTS.firefoxDir`). The launcher
  (`run-zero2.sh`) exports it, and refuses a Firefox step, before anything runs, when `command -v firefox` is not task
  59's.

## Reruns and why (candidate 1)

- **D2:** an environment fault (no Electron binary), rerun alone into `out-rerun1/` (22:32–22:51Z, after the `:0`
  sitting). It passed.
- **V5:** an environment fault (the snap's firefox), rerun into `out-rerun1/` inside the sitting's window. The rerun
  FAILED, on the false successes above.

## Files

- `out/`, `out-rerun1/`: candidate 1's labelled step directories, as the runner wrote them.
- `c2-f9692898/`: candidate 2's. `out/` holds its step directories and its re-judge outputs; `artifact/` its
  attestation; `scripts/` task 77's launchers and analysis scripts as they ran (`drive.sh`, `run-zero2.sh`,
  `print-zero.sh`, `zero-commands.txt`, `rejudge.sh`, `rejudge-amended.sh`, `rejudge-302.before-amend.mjs`,
  `setup-gate.sh`, `copy-evidence.sh`, `v5-latetake.py`, `l3a-clip.py`, `l3a-clip2.py`, `l3b-desk.py`); `l3a-repro/` the
  reproductions r1 and r2, the Escape check esc1 and the forced stall frz1, with their scripts.
- `c3-c55c8e08/`: candidate 3's, laid out the same way (task 79's launchers in `scripts/`).
- `c3-menu-proof/`: task 78's per-family proof of the menu detection, Chrome against the pinned build, the forced stall
  and the settle pilot.
- `wrap71-proof/`: gate mode under wrap71, on a private display (candidate 1).
- `scripts/`: the re-judge scripts and their controls, the cross-check and declared-cell checkers, and candidate 1's
  launchers (`drive.sh`, `run-zero.sh`, `run-zero2.sh`, `wrap71-proof.sh`, `step-table.mjs`).

The whole directory was scanned for token-shaped strings and for the stored secret values before the last commit
(`c3-c55c8e08/scripts/scan-evidence.sh`, which prints file names only): no hit but the scanner's own patterns. Files over 1 MB are gzipped, as m4's traces are; the guard's decoy sockets are left out.
