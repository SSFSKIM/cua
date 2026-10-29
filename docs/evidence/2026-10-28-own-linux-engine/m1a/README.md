# #171 M1a: the engine core against both vendor builds, and the harness's proof

On the #171 VM (`dc-linux171-1e68`, x86-64, Ubuntu 24.04, X11 `:0`, Openbox, no compositor), 2026-10-28 and
2026-10-29, against the spec `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`. The spec's M1a covers
Acceptance 2–5 for every command but text and clipboard. This file reports M1a.3's proof and M1a.4's fixes and re-run.

**What was measured.** M1a.4's final runs used `cua-engine` built from 2104e8cd (`cua-engine 0.0.1 (2104e8cd8566)`,
SHA-256 `8ffec995…416e`). The vendor builds were OpenAI's pinned `sky_linux_x64` 26.928.40906 (SHA-256 `7ac3c2ae…f1cd`) and
the newest, 26.1023.51421 (`88ce5e0a…2991`). Each run's `meta` row names the commit its build was stamped with and
every binary's SHA-256. The harness is `scripts/linux-engine-diff.mjs`; its README describes the method, M1a.4's
changes included. Two of those changes govern how to read everything below:

- **Effects are judged absolutely.** cua's effect must be read back on every sample, whatever the vendor builds did
  on that sample.
- **The read waits for the application.** An effect is read once two reads 120 ms apart agree, at most 2.5 s after
  the request.

M1a.4's runs:

| Run | Commit | What |
|---|---|---|
| `m1a4-wire-final` | 2104e8cd | **the verdict run**: every scene and operation over the wire, seven blocks |
| `m1a4-final-sitting-1..3` | 2104e8cd | three sittings, spread across the session, of the desktop operations under 5 ms and `get_screenshot`: 20 fresh-process blocks each |
| `m1a4-vendor-js-final` | 2104e8cd | every scene through OpenAI's own JavaScript client (`--via vendor-js`) |
| `m1a4-events-final` | 2104e8cd | the input events on a private Xvfb, compared with the pinned build's, both routes |
| `m1a4-vendor-js-desktop-final` | 2104e8cd | `move_relative` and `drag_handle` through the vendor JavaScript on a private Xvfb, answers and effects |
| `m1a4-events-br`, `m1a4-events-br2`, `m1a4-vendor-js-desktop-br` | d474e40d | the M1a branch review's re-run: `drag_handle`'s held moves paced by family, the events experiment's wire speed now judged |
| `m1a4-events-gate`, `m1a4-events-gate3` | d474e40d (harness def3babd, c796d4d9) | the desktop speed gate: interleaved fresh-engine blocks, 20 samples a judged group, the bootstrap interval; before and after the declared `move` gap |
| `m1a4-drag-writer-primed` | d474e40d | the Writer select cell with each fresh window primed by one drag |
| `m1a4-matrix-covered-final`, `m1a4-matrix-visible-final` | 2104e8cd | M0.4's 11 families, background keys and clicks, with the witness and the X request audit |
| `m1a4-drag-browsers` | 7a860320 | the drag experiment, final pacing, on Chrome, Electron and Firefox: 30 runs per kind (the drag path is unchanged after it) |
| `m1a4-drag`, `m1a4-drag-xterm` | 2ab237cc and later | the drag experiment on every family: 30 runs per kind with no wait, a dwell, and the first table |
| `m1a4-drag-scroller`, `m1a4-drag-tune`, `m1a4-drag-tune-gecko` | 2ab237cc and later | the Chromium and Gecko step and dwell values tried (`m1a4-drag-tune`'s scroller cells predate the scroller page's reset; `m1a4-drag-scroller` replaces them) |
| `m1a4-scroll-covered`, `m1a4-scroll-visible` | a1b6d62b | the scroll effect's miss rate per build with the settled read, 30 samples each |
| `m1a4-cold-1..3`, `m1a4-shot-1/2`, `m1a4-shot-final-1..3`, `m1a4-cold-check`, `m1a4-cold-check2` | a1b6d62b to 4566caad | earlier desktop sittings, kept for the spread. The two `-check` runs isolate launch_app's warm loss; `-check2` ran 2104e8cd's engine change before it was committed |
| `m1a4-wire-7`, `m1a4-vendor-js`, `m1a4-events`, `m1a4-vendor-js-desktop`, `m1a4-matrix-covered`, `m1a4-matrix-visible` | 7a860320 | the same proof one commit set earlier; their verdicts agree with the final runs except launch_app's warm speed (below) |

M1a.3's runs (`m1a3-*`, `readiness-*`, `m1a2-events-fix3`) are kept in `results.jsonl` as they were. Their verdicts are
superseded by the table above, except capture readiness and Firefox's cover threshold (both below), which M1a.4 did
not change.

The scenes are the harness's own windows:
- gedit on a scratch file;
- Chrome on the reference page (`scene.html`), the pointer and key page (`input.html`), and the over-budget and
  big-text pages;
- a GTK 3 tree view over 10,000 rows;
- LibreOffice Calc on a scratch CSV;
- Chrome windows for the retention cases.

Each engine has its own window wherever retention or input is measured. An xterm holds the focus and covers the
screen.

`results.jsonl` holds every sample, count, audit, image comparison, check and verdict of these runs. `summary.md` is
rewritten from it by `node scripts/linux-engine-diff.mjs --summarize --out docs/evidence/2026-10-28-own-linux-engine/m1a`.

## Acceptance (x86-64, every command but text and clipboard)

**2. The same answers: pass.** In the verdict run (`m1a4-wire-final`), every operation answers as the pinned build
does, on every sample of every engine's own window, with screenshots compared by content. That covers:
- the 20 commands' window and desktop forms on the scenes;
- element clicks, the right click's button-3 path and its `showContextMenu` fallback, `perform_secondary_action`;
- `move`, `drag`, `scroll`, the holds, `activate_window` and `launch_app`;
- the large tables;
- the three retention cases: 126/126 screenshots within tolerance, 0 differing pixels.

cua's effect was read back on every sample under the absolute gate. Every operation with an effect read took effect
42/42, and `launch_app` 56/56. The vendor builds took `scroll` 28/42 each ("The vendor's scroll misses", below). The
text and clipboard commands answer the declared refusal (`deviations.mjs`).

On the private Xvfb (`m1a4-events-final`, and `m1a4-events-br` and `-br2` on d474e40d), cua's answers and X events
equal the pinned build's in every scenario of both routes. The one declared deviation stands: a key hold whose window
is destroyed answers the X error.

Through OpenAI's own JavaScript:
- `m1a4-vendor-js-final`: every verdict passes, covering answers, rendered trees, witness, audit and effects.
- `m1a4-vendor-js-desktop-final`, on the private Xvfb: `move_relative` takes effect 2/2 and `drag_handle` 3/3 in all
  three engines, each through the client's own handle, and cua's events equal the pinned build's. The newest build's
  `drag_handle` differs at its first step, as its coarser interpolation does everywhere.

**3. At or below the bar: pass, with the desktop screenshot's cold median listed as parity.** The bar is the faster
vendor build's median. Medians compare unrounded; the table shows tenths.

| operation (`m1a4-wire-final`, 7 blocks) | cua cold / warm ms | bar cold / warm ms | |
|---|---:|---:|---|
| gedit tree read (498 nodes) | 91.8 / 83.0 | 627.2 / 600.8 | pass |
| Chrome tree read (243 nodes) | 77.1 / 61.0 | 492.7 / 500.3 | pass |
| window screenshot, gedit / Chrome | 128.6 / 109.8, 123.7 / 88.2 | 760.5 / 735.7, 582.3 / 615.3 | pass |
| `press_key`, gedit / Chrome | 107.2 / 101.2, 108.0 / 101.1 | 241.0 / 235.7, 241.9 / 236.0 | pass |
| `click`, gedit / Chrome | 120.7 / 113.8, 120.3 / 113.8 | 220.7 / 214.9, 219.9 / 215.1 | pass |
| `scroll` | 216.0 / 210.3 | 316.4 / 311.3 | pass |
| `drag` (Chrome) | 397.7 / 393.6 | 416.5 / 412.8 (newest) | pass |
| `key_up` | 100.66 / 100.65 | 100.81 / 100.83 | pass (by 0.2 ms) |
| `launch_app` | 5.32 / 0.67 | 5.70 / 0.71 | pass |
| `activate_window` | 4.8 / 0.3 | 5.9 / 0.5 | pass |
| `get_screenshot` (desktop) | 40.8 / 23.9 | 39.0 / 27.5 | warm pass (SHM); cold **parity** |

All medians are in `summary.md`. Every other operation passes, most by a factor of two to seven.

- **`drag`** passes: the 1 ms per sample is gone, and Chromium's 500 µs is the only wait on this page. See "Drag, per
  family and kind".
- **`get_screenshot` cold is parity under Acceptance 3's parity rule.** A fresh engine's first desktop capture is
  `GetImage` of the root and the same JPEG encoder at the vendor's settings: identical work by construction. The SHM
  segment is made after that first answer. The verdict run's seven cold samples run 33–63 ms in every engine, and its
  cold median put cua above the bar (40.8 against 39.0). Over the interleaved fresh-process sittings, cua's cold median
  sits within the bar's own spread across sittings:
  - In the three 20-block sittings on the final build, cua was at or below the bar (36.9 / 38.6, 36.1 / 37.5,
    38.1 / 38.1).
  - Across all eleven M1a.4 sittings, the bar ran 35.7–39.2 and cua 34.3–38.1. The three 6-block `m1a4-shot-final-*`
    sittings had cua above, at 36.9–37.8 against 35.7–36.1.
- **The desktop operations under 5 ms** (`launch_app`'s warm request, about 0.7 ms) pass in the three final sittings:
  0.710 / 0.725, 0.690 / 0.695, 0.730 / 0.735. The earlier sittings show a 0.02–0.06 ms loss. It came from
  serializing the `--stats` line inside the request, and 2104e8cd moved that after the response. Their verdict rows
  were written before the speed verdict compared unrounded medians, so `m1a4-cold-1` and `m1a4-cold-2` read PASS with
  cua above.
- **The events experiment's request times**, over the wire, have been part of its outcome since the M1a branch review.
  Before that they were only printed, and `m1a4-events-final` showed two losses:
  - Desktop `drag_handle` later steps: 33.1 against the newest build's 30.1 ms. A held move kept the vendor's 8 ms
    between points. Since d474e40d, the window under the handle's start sets its `families.rs` pacing, so on the Xvfb's
    recorder (no row) there is no wait: 0.4 against 30.2 ms in `m1a4-events-br2`.
  - Desktop `key_up` later steps: 0.24 against 0.17 ms. That was noise. An xtrace of the hold sequences shows cua and
    the newest build each send `FakeInput` followed by a `GetInputFocus` sync, per key. Measured directly, 120 releases
    each came out at cua 0.381 against newest 0.389 ms (`.doperpowers/sde/m1a4/keyup-probe.mjs`). In both re-runs it
    passed (0.1 against 0.2 ms).
- **The desktop route's speed gate** (the branch review's second round). The scenarios time most requests once, and
  as a gate that failed on noise: `m1a4-events-br` failed four desktop first requests by 0.02–0.9 ms, and `-br2`, on
  the same binary, passed them all. Since then, over the wire:
  - The desktop route is timed in interleaved fresh engines. Every desktop scenario's sequence runs on the private
    Xvfb with its window-bound steps left out and its first request repeated at the end. Each round gives every
    engine a fresh process per sequence, with the order rotating and 150 ms after each start. There are 31 rounds.
  - The scenarios' own desktop times are recorded beside the blocks as `… in a scenario`.
  - A group is judged only when every engine has at least 20 samples.
  - Each judged group reports a bootstrap 95% interval of cua's median minus the faster build's. Samples are
    resampled within their own request, so a group that mixes requests keeps its mix.
  - A `first` group above the bar whose interval includes 0 counts as **same (within noise)**. It is listed apart,
    not as a pass.
  - A loss that a speed gap in `deviations.mjs` declares is a **declared gap**, listed apart and never a pass.
  - Any other loss fails the run.

  `m1a4-events-gate3` (d474e40d's engine, the harness of c796d4d9) passes:

  | desktop command | first: cua / bar ms, interval | later: cua / bar ms, interval |
  |---|---|---|
  | `press_key` | 0.66 / 34.76, pass | 0.33 / 34.20, pass |
  | `key_down` | 0.60 / 1.42, pass | 0.21 / 0.64, pass |
  | `key_up` | (none: a fresh engine has nothing held) | 0.16 / 0.17, [−0.02, 0.005], pass |
  | `click` | 86.77 / 86.51, [−0.05, 0.60], **same (within noise)** | 12.74 / 30.02, pass |
  | `move` | 82.68 / 82.89, [−0.43, 0.02], pass | 8.43 / 6.01, [2.32, 2.49], **declared gap (M4)** |
  | `move_relative` | 0.45 / 0.71, pass | 0.15 / 0.23, pass |
  | `scroll` | 73.18 / 73.40, pass | 223.0 / 240.1, pass |
  | `drag` | 47.6 / 106.6, pass | 50.9 / 110.5, pass |
  | `drag_handle` | 37.51 / 37.53, [−0.10, 0.12], pass | 0.46 / 30.30, pass |

  **The declared gap, desktop `move` later.**
  - cua sends the pinned build's motions. The first motion is at the pointer's own position, and the vendor's 8 ms
    path wait follows each motion.
  - The newest build leaves that first motion out. On a short move it therefore sends one motion and waits nothing,
    against cua's two motions and one wait.
  - The run before the gap was declared (`m1a4-events-gate`) failed on this group alone: 8.45 against 6.05,
    [2.27, 2.59].
  - Removing the gap means changing the events or the vendor's path wait, which M4 shortens under its rule. It is
    therefore declared, with section M4.
  - The long first `move` passes: cua's first request does nothing the move does not need. The X connection and its
    atoms are set up before the first request, and the accessibility bus, the keymap (fetched only for a chord) and
    the SHM segment are not touched.
  - On a different path, (640, 400) to (500, 400), the probe found cua 0.5 ms behind the newest build (74.79 against
    74.28, [0.015, 1.193]). That is the same one-motion difference, and the gate's scenario path does not show it.

**Which run judges each desktop-route operation's speed** (cold is the first request, warm the later ones):

| operation | cold | warm |
|---|---|---|
| `list_windows`, `list_apps` | the verdict run's desktop scene (`m1a4-wire-final`, 7 blocks) | the same |
| `get_screenshot` | the three 20-block sittings (`m1a4-final-sitting-*`; parity, above) | the same, and the verdict run |
| `launch_app` | the three 20-block sittings, and the verdict run | the same |
| `press_key`, `key_down`, `click`, `move`, `move_relative`, `scroll`, `drag`, `drag_handle` | the events experiment's desktop blocks (`m1a4-events-gate3`) | the same |
| `key_up` | not applicable: a fresh engine holds nothing, so its first `key_up` is the no-op the window route's verdict run times | the events experiment's desktop blocks |

Window-route speeds are judged in the verdict run, with seven fresh-process blocks a scene. The events experiment's
window-route groups have too few samples and are recorded only.

**4. Same elements: pass** (the truncation line through the facade is M4's).
- The gedit and Chrome reads return exactly the vendor's nodes with the same native ids, through the windowed read:
  3,190 and 2,257 accessibility-bus calls, like the vendor's. Of those, cua awaited 75 and 26 alone; the vendor awaited
  all of them.
- On the over-budget page the retained native ids equal the pinned build's. cua made 45,258 calls cold and 45,251
  warm, against the vendor's 45,069: +189 and +182. The bound is now enforced on every tree verdict: at most the
  vendor's calls plus 256, both passes counted, a missing count failing.
- The large tables:
  - The GTK tree view (940 calls in the vendor, 938 / 937 in cua) and Calc (19,856 against 19,854 / 19,853) equal the
    vendor's nodes.
  - Calc's cell ids are new objects on every read in every engine, so its reads compare by position.

**5. Background left alone: pass, per family.**
- In the verdict run, every window-targeted operation in every block kept the witness unchanged for its whole span.
  That includes the engine-issued companions, the element-id lookups and the retention keys, which M1a.4 brought into
  spans.
- Every operation's X requests held no forbidden request wherever the vendor's did. The audit was through `xtrace`,
  two samples per engine and operation, 78 audits, with tree reads and screenshots now included.
- Since the M1a branch review, an audit counts only when its audited requests answer as the timed pass did. An
  operation that failed early under the proxy traces only its setup, and that proves nothing. Expected refusals are
  refused in both passes. The same rule now applies to the matrix's audit pass. Re-judging all 474 recorded audits
  moved none, and no matrix audit's requests had failed.
- `activate_window` changes the desktop on purpose in all three engines.
- The activate-and-restore stub failed both checks. The witness caught stacking, the active window and focus; the
  audit caught the `_NET_ACTIVE_WINDOW` ClientMessage and XTEST `FakeInput`.
- On M0.4's eleven families, covered and visible (`m1a4-matrix-*-final`), each engine's background keys and clicks
  ran in witness spans and through an audited pass. Every witness and every audit was clean in every engine and family,
  so cua passes all 11, both ways. The family table is in `summary.md`.
- The background route's results per family equal M0.4's. That includes xterm with allowSendEvents on, which takes
  keys and ignores clicks.

## Drag, per family and kind

The design session's call (Decision Log, M1a.3): keep the pinned build's events (a motion per pixel) and drop the
vendor's 1 ms after each sample. A family or kind that then misses gets its wait in `families.rs`.

The drag experiment (`--experiment drag`, `scripts/linux-engine-diff/drag.mjs`) drags the same path 30 times per
family and kind in each engine's own visible window, each drag in a witness span. A run took effect when its result
is the pinned build's:
- text selected;
- a slider's value moved;
- the content scrolled by a thumb drag within a quarter of the pinned build's median;
- one more drop for DnD;
- a canvas stroke that passes within 12 px of every corner of the path.

The lanes are the pinned build, the newest, cua as shipped, `cua:0ms` (no wait anywhere) and `cua:dwell` (no step
wait, 30 ms after the press and before the release).

**With no wait** (`cua:0ms`, `m1a4-drag`, `m1a4-drag-browsers`):
- Every non-browser family passes:
  - gedit select and scrollbar, and the GTK 3 scale;
  - kate and Qt Creator select and scrollbar;
  - Writer select, which took 29/30 in every engine, the pinned build's included: the window's first drag selects
    nothing. The original relative judge passed it; the absolute judge (below) fails it, and with the window primed
    every lane takes 30/30 (below).
  - xterm and xterm with allowSendEvents (select, read through PRIMARY).
- Chromium (Chrome and Electron) misses the canvas path (0–1 of 30 taken), the scroller thumb (2–5 of 30), and the
  odd first select or drop (1–3 misses).
- Gecko misses HTML5 drag and drop (2–7 of 30 taken) and the canvas (0–1 of 30).
- **The dwell lane fixes none of these.** The targets need time between motions, not a pause at the ends.

**The waits in `families.rs`**, chosen from the tuning runs (`m1a4-drag-tune`, `m1a4-drag-tune-gecko`,
`m1a4-drag-scroller`; `cN` is a step of N µs, `rN` N ms before the release):

| family (ToolkitName; X11 classes) | step | press | release | why |
|---|---:|---:|---:|---|
| Chromium (`Chromium`; Google-chrome, Chromium, Chromium-browser) | 500 µs | 0 | 0 | 400 µs and less missed the scroller thumb or the canvas (c400r20 27–28/30, c300r30 22–28/30); 500 µs takes both 30/30 |
| Gecko (`Gecko`; firefox) | 300 µs | 0 | 30 ms | the canvas needs the step; DnD needs the release dwell (s500 alone 29/30; c300r30, c250r40 and c500r20 30/30) |
| every other family | 0 | 0 | 0 | passes at 0 ms |

The final pacing (`m1a4-drag-browsers`, 7a860320; the drag path is unchanged in 2104e8cd) takes **30/30 in every
Chrome, Electron and Firefox cell**:
- select, range and scroller in each;
- DnD and canvas in each.

The pinned build took Firefox DnD 29/30. The newest build's canvas strokes missed 7–11 of 30, cutting the corners by
more than 12 px.

What the waits cost: cua's browser drags take 146–649 ms against the pinned build's 279–1,196.
- On the short paths cua is faster than the newest build.
- On the long DnD and canvas paths it is slower: Chrome canvas 646 against 517, DnD 500 against 360, Firefox canvas
  553 against 527.

The verdict run's Chrome `drag` is 397.7 ms against the newest build's 416.5.

**Not judged:** GTK 4's gnome-text-editor selected nothing in 30 runs in any engine; the harness places that path by
estimated character cells, since AT-SPI gives no text geometry there. Writer through the `gen` backend has neither.
Writer's first drag in a fresh window selects nothing in every engine; that is the application.

**Two observations:**
- **The thumb drag's distance.** A Chromium scrollbar thumb drag moves the content less than the path in every
  pacing but the newest build's coarse steps:
  - On the 60 px path the newest build scrolled 146–147 every time.
  - The pinned build scrolled 119–147 (mean 133).
  - cua at 500 µs scrolled 100–147 (mean 126–129); its shortest runs sit at the judge's 25% edge.
- **The thumb dwell check** (`m1a4-thumb-dwell`, 2104e8cd, the design session's). Chromium's row was held at 500 µs a
  step, and three release dwells were added one variant at a time: 16, 33 and 50 ms before the release, no press
  dwell. Each was run on the scroller thumb in Chrome and Electron, 30 runs each, against the pinned build.
  **No value brings the distance to the pinned build's**, so the row stays at 500 µs with no dwell.

  | lane | Chrome took | Chrome shortest / mean px | Electron took | Electron shortest / mean px | drag ms |
  |---|---:|---:|---:|---:|---:|
  | pinned | 30/30 | 122 / 136.4 (median 136) | 30/30 | 122 / 134.6 (median 136.5) | 281 / 278 |
  | cua (500 µs, as shipped) | 30/30 | 102 / 128.0 | 30/30 | 107 / 126.2 | 146 |
  | 500 µs + 16 ms | 29/30 | 100 / 128.4 | 30/30 | 105 / 125.3 | 162 |
  | 500 µs + 33 ms | 28/30 | 100 / 124.2 | 27/30 | 102 / 126.1 | 179 |
  | 500 µs + 50 ms | 27/30 | 100 / 127.9 | 30/30 | 105 / 125.3 | 195 |

  The release dwell does not move the distance: every lane's mean stays 124–128 px, 7–12 px short of the pinned
  build's. The shortfall is in how Chromium takes the motions at 500 µs, not in the release.

  **The margin to the judge's edge, as shipped.** Each run is measured against its own baseline: 75% of the pinned
  median for runs of the same parity, which is the judge's edge. The smallest margin per cell:

  | run | family | baselines (even / odd) | smallest margin | at |
  |---|---|---:|---:|---|
  | `m1a4-thumb-dwell` | Chrome | 136 / 141 | 0.00 px | run 10: 102 against 102.00 |
  | `m1a4-thumb-dwell` | Electron | 139 / 136 | 2.75 px | run 12: 107 against 104.25 |
  | `m1a4-drag-browsers` | Chrome | 132 / 132 | 4.00 px | run 19: 103 against 99.00 |
  | `m1a4-drag-browsers` | Electron | 130 / 132 | 7.50 px | run 6: 105 against 97.50 |

  cua's mean sits 6–8% under the pinned build's: 128.0 against 136.4 and 126.2 against 134.6 in the check, and 125.9
  against 133.1 and 129.0 against 132.4 in `m1a4-drag-browsers`. A 30-run Chromium thumb cell can therefore miss by a
  pixel on a later run. The cell stays out of gates until M4 lands the full distance.
- **Chrome's HTML5 DnD changes the desktop in every engine**: stacking, focus and the active window, in 30/30 of the
  pinned build's drops. That is the application's doing, so the cell asks no witness of cua. Electron's and Firefox's
  drops leave the desktop alone.
- **The cell judge is absolute** (the M1a branch review). Once a cell has a usable reference, every cua run must take
  effect, including runs the pinned build also missed. A usable reference means the pinned build took at least one
  run and, for value and thumb kinds, every parity has a pinned value. Re-judging every recorded cell moves one:
  Writer's select in `m1a4-drag` now fails in every cua lane (29/30). That window's first drag selects nothing in
  every engine, the pinned build's included.
- **Writer's cell is primed** (`DRAG_PRIMING` in `drag.mjs`). Each engine's fresh Writer window takes one drag before
  its 30 runs. The priming drag is untimed, unjudged and witnessed, and it selects the odd runs' text, so the first
  measured run never presses inside it. This is harness setup that hides real behaviour: an agent's first drag in a
  fresh Writer window selects nothing. That is an M4 candidate: why it happens, and whether the engine can prime the
  window itself.

  In `m1a4-drag-writer-primed` (d474e40d), every priming drag answered and kept the witness clean, and **every lane
  took 30/30**: pinned, newest, cua and `cua:0ms`. cua took 117.5 ms against the newest build's 306.

## The desktop screenshot through MIT-SHM

The engine reads the root through MIT-SHM on a local display (a Unix socket) that answers `ShmQueryVersion` with
version 1.2 or later, which passes descriptors: a memfd segment, `ShmAttachFd` and `ShmGetImage`. Otherwise it uses
plain `GetImage`, and any SHM failure turns SHM off for the engine's life. The segment for the screen's size is made
after the first answer. A fresh engine's first capture is therefore the vendor's own `GetImage`, and the segment costs
no measured request.

x11rb's `shm` feature and rustix's `fs` and `mm` features added no package: Cargo.lock still lists 32. A live test
(`cargo test -- --ignored shm`, under `xvfb-run`) checks that the SHM image's bytes equal `GetImage`'s.

| sitting (fresh-process blocks) | build | cua cold / warm ms | bar cold / warm ms |
|---|---|---:|---:|
| `m1a4-final-sitting-1` (20) | 2104e8cd | 36.9 / 24.7 | 38.6 / 28.1 |
| `m1a4-final-sitting-2` (20) | 2104e8cd | 36.1 / 24.3 | 37.5 / 27.7 |
| `m1a4-final-sitting-3` (20) | 2104e8cd | 38.1 / 24.1 | 38.1 / 27.8 |
| `m1a4-wire-final` (7) | 2104e8cd | 40.8 / 23.9 | 39.0 / 27.5 |
| `m1a4-cold-1..3` (20 each) | 7a860320 | 37.8, 36.8, 34.3 / 24.9, 24.7, 24.4 | 38.8, 37.6, 38.0 / 27.8, 28.1, 27.9 |
| `m1a4-shot-final-1..3` (6 each) | 7a860320 | 37.1, 37.8, 36.9 / 23.8, 24.3, 24.3 | 35.7, 35.8, 36.1 / 28.3, 27.9, 27.8 |
| `m1a4-shot-1/2` (6 each) | a1b6d62b | 35.9, 37.4 / 24.1, 23.8 | 39.2, 37.5 / 28.0, 27.6 |

Warm, SHM is about 13% faster in every sitting: 23.8–24.9 ms against 27.5–28.3. Cold, the work is the vendor's, and
cua's median falls on both sides of the bar's, within its spread (35.7–39.2): **parity** under Acceptance 3's rule.
Before SHM (M1a.3) the warm medians were within 0.7 ms and swapped order between sittings.

## The vendor's scroll misses

M1a.3's run had each vendor build's `scroll` take effect on 20 of 30 samples. Under the absolute gate that baseline no
longer sets cua's bar. The harness first had to show that the read was not racy, since a racy read could also hide a
cua miss.

With the settled read (an effect is read once two reads 120 ms apart agree, at most 2.5 s after the request),
`m1a4-scroll-covered` and `m1a4-scroll-visible` (30 samples each):

| occlusion | pinned | newest | cua |
|---|---:|---:|---:|
| covered (the verdict run's) | 21/30 | 20/30 | 30/30 |
| visible | 30/30 | 30/30 | 30/30 |

The misses are real, and every one is an up-scroll right after a down-scroll. A probe that reads the page's scroll
position every 25 ms for 1.5 s after each request shows why:
- The vendor unredirects the covered window at the end of its request.
- Chrome stops animating a covered window that is not redirected, so the down-scroll's smooth scroll halts part-way.
- The next up-scroll's effect then lands only when the next request redirects the window again.

cua keeps the window redirected for the session (its default retention), so the animation finishes. In the final
runs the vendor builds took `scroll` 28/42 each (`m1a4-wire-final`) and 12/18 each (`m1a4-vendor-js-final`); cua took
42/42 and 18/18. No other operation had a vendor miss.

## Capture readiness, judged by content (M1a.3, unchanged)

The engine's rule: first damage, then 10 ms quiet, capped at 150 ms. A window fully unobscured at the redirect needs
no first damage. It was judged on every family of M0.4's matrix, with a fresh engine per trial. Each first capture
was compared with the same engine's capture 400 ms later.

**900 trials, every first capture right, none with a pixel off by more than 32**, idle and with every core busy. 264
of them took the unobscured shortcut (Firefox and Writer, which open maximized, ran unobscured at 1000×700). The
pinned build's captures agreed with the same truth in all 150 of its trials, the reference M1a.4 made a condition of
the pass.

DAMAGE is reliable, so the 100 ms fallback is not adopted. What it costs: a window that sends no damage after the
redirect waits the full 150 ms, and its capture is still right. That is GTK 4's gnome-text-editor whenever it is
partly or fully covered, in every trial. Under load, 31 more trials across nine families waited, most of them xterm's.

M1a.4 did not change the window capture path: MIT-SHM is used for the desktop only. So readiness was not re-run.

## Firefox's cover threshold at a second size (M1a.3)

At 800×600 (M0 measured the maximized 1280×781 window), the three engines behaved the same:
- with the bottom covered, coordinate clicks were ignored up to 67% of the window visible and taken at 71%;
- with the left side covered, they were taken down to 42% visible (the click point itself was covered at 52% and
  less).

The design session withdrew the 60% rule. Gecko's coordinate clicks are `unless_unobscured`, which M3 builds.
