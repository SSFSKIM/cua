# M4, T10: the drag judges (task 65)

The drag experiment's judges, harness only (`scripts/linux-engine-diff/drag.mjs`, `drag-judge.mjs`, `stats.mjs`
`judgeSeriesSpeed`, `pages/drag.html`; tests in `test/linux-engine-diff/drag.test.mjs`), built at b103323d and run on
it. Every sitting ran on a private Xvfb with Openbox (`scripts/private-run.mjs`, never `:0`), with no whole-run
RECORD (`scripts/norecord.mjs`), Firefox from the Mozilla deb beside the run (task 59). Commands:
`scripts/drag.sh <harness> <name> <candidate> <args>`.

Candidates, as T1 requires:
- **released**: `linux-engine-v0.3.0`'s x64 asset, sha256 `5f4a1600…7b60`, the pin's (`cua-engine 0.3.0 (cd4c929758ca)`).
- **head**: a musl build of 843d3179 made the release workflow's way (`scripts/build-musl.sh`), sha256
  `3ae5be4f…5296`, `cua-engine 0.3.0 (843d3179410a)`. A **development run, not a release gate**; the harness itself is
  unchanged in what it sends between the two.

The lanes: `pinned` (the reference), `newest`, `cua` (the candidate as it ships, the one lane the judges decide on),
`cua:0ms` (no drag wait anywhere), and in the held-move sitting `cua:nolead` (Gecko's pacing with no lead pause) and the
`cua:no-press` control.

## What the judges decide (the shipped lane)

- **Effect**: every run takes effect (M1a.4's absolute rule), unchanged.
- **Thumbs** (Chrome's and Electron's `scroller`): every run at or past the pinned build's mean distance of the same
  sitting (`thumbReach`).
- **Long paths** (Chrome's and Firefox's `canvas`, Chrome's `dnd` in front for every lane), warm, under Acceptance 3's
  interval rule: 20 usable a side (a usable sample is a run that took; each engine's first request is cold, left to
  the verdict run), a vendor build sets the bar only with 20 usable, one short of that at 40 drags gives it up, an
  undetermined cell is topped up in rounds of 10 to 40 a side, and the verdict names the build that set the bar.
- **Under load** (40 drags a side): the landed counts, cua's at least the pinned build's, distances reported.
- **Named only**: Writer's `select-unprimed` (a fresh window's first drag, judged by the text its path spans, checked
  against the primed cell's selections), Firefox's `handle-canvas` and `handle-dnd` (`drag_handle`'s held moves,
  spaced by cua's service's 10 ms `drag_handle` settle, with a no-press control that must miss every run).

## Results

### The released 0.3.0 fails what it should (`idle-released/`, idle, visible, 30 a side)

| cell | the judge | 0.3.0 (`cua`) | verdict |
|---|---|---|---|
| Chrome scroller | reach, pinned mean 129.5 px | 14 of 30 reached (shortest 97, mean 126.0) | **FAIL** (short thumbs) |
| Electron scroller | reach, pinned mean 130.0 px | 12 of 30 (shortest 88, mean 124.1); 3 runs missed the tolerance judge too | **FAIL** |
| Chrome canvas | speed, topped up to 40 a side | 656.1 ms against the newest build's 513.9 (21 of 40 usable), [+132.1, +152.3] | **FAIL** (slow) |
| Chrome dnd, in front | speed | 467.4 ms against the newest build's 340.0, [+123.7, +132.2] | **FAIL** (slow) |
| Firefox canvas | speed; effect | 545.6 ms against the newest build's 516.6, [+21.1, +41.6]; 27 of 30 took | **FAIL** (slow, and misses) |
| Firefox dnd | effect | 17 of 30 took (the pinned build 30 of 30) | **FAIL** (below) |
| Electron dnd, Electron canvas, Firefox scroller | effect | 30 of 30 | PASS |

The run exits 1, its verdict line naming each failure (`idle-released/stdout.txt`).

### The head, a development run (`idle-head/`)

| cell | `cua` (head) | verdict |
|---|---|---|
| Chrome scroller | took 24 of 30; reached 11 of 30 (shortest 90, mean 120.3) | **FAIL** |
| Electron scroller | took 28 of 30; reached 2 of 30 (shortest 90, mean 108.7) | **FAIL** |
| Chrome canvas | **faster**, 569.0 ms against the **pinned** build's 1156.8, [−597.2, −572.9]: the newest build gave the bar up, 15 usable of 40 | PASS |
| Chrome dnd, in front | 364.8 ms against the newest build's 337.4, [+25.5, +30.9] | **FAIL** |
| Firefox canvas | **faster**, 451.4 ms against the newest build's 513.3, [−71.2, −53.0]; 25 of 30 took | **FAIL** (misses) |
| Firefox dnd | 16 of 30 took | **FAIL** |

The head's drags are about 90–100 ms faster than 0.3.0's on the long paths (T9 dropped the pause after the leading
motion), and its thumbs land shorter.

### The load lane (`load2-released/`, 0.3.0, 2 stress-ng workers per core, 40 a side, `--lanes pinned,cua`)

| cell | pinned landed | `cua` landed | distances (mean; cua's shortest) | verdict |
|---|---:|---:|---|---|
| Chrome scroller | 40/40 | 36/40 | 132.4 / 124.8; 68 | **FAIL** |
| Electron scroller | 40/40 | 33/40 | 133.2 / 119.9; 85 | **FAIL** |
| Chrome range | 39/40 | 40/40 | 50.5 / 50.6; 49 | PASS |
| Electron range | 40/40 | 40/40 | 50.5 / 50.4; 49 | PASS |

This is #265's gap (M3.1: 17–19 of 20) at 40 a side, and T12's starting point.

### The judges can pass (`analysis/positive-controls-*.txt`, offline on the sittings' own rows)

- The thumb judge with the newest build as candidate: 30 of 30 reached in Chrome and in Electron in both sittings
  (shortest 146 px; its coarse steps land the full distance).
- The speed judge against the pinned build alone: the newest build and cua both **faster** on every long path where
  20 usable exist; the newest build's Chrome canvas on head's sitting is not judged (15 usable of 40), the bar rule.
- Live, the head's Chrome canvas passed against the pinned build after the newest build gave the bar up, and both
  range cells passed the load judge.

### The motions Chrome received (`analysis/received-*.md`)

The page's `received` line counts `pointerrawupdate` per press. During a scrollbar drag no `pointermove` reaches the
page, and `pointerrawupdate` does: `probes/thumb-events/` (the probe that chose it) saw 0 `pointermove`, 0
`mousemove`, and 36–61 `pointerrawupdate` per thumb drag. On the Chromium thumbs, idle:

| lane | received (median) | distance (median, range) |
|---|---:|---|
| pinned | 60–61 | 128–129 (114–147) |
| newest | 17 | 146 (146–147) |
| cua (0.3.0) | 54–56 | 127–128 (88–146) |
| cua (head) | 54–56 | 123 and 105 (90–147) |
| cua:0ms | 38–54 (1–56) | 15–44 (0–144) |

The count discriminates: the newest build's 17 motions against the pinned build's 60, and `cua:0ms`'s coalesced
bursts. Across lanes distance falls as received motions rise (Spearman −0.30 and −0.32 over every run), but within a
lane at a near-constant count the distance still spreads by 30 px or more (the pinned build: 114–144 at 59–60
received), so the count alone does not fix the distance. That is T11's question; the per-run pairs are in the tables.
Firefox lands its thumb at 108 px every run whatever it received (4 to 48 motions).

### Firefox's held moves (`handle-head/`, head, 30 a side)

| cell | pinned | newest | `cua` | `cua:nolead` | `cua:0ms` | `cua:no-press` control |
|---|---:|---:|---:|---:|---:|---:|
| handle-canvas | 30/30 | 30/30 | 2/30 | 1/30 | 0/30 | 0/30 |
| handle-dnd | 30/30 | 30/30 | 7/30 | 6/30 | 0/30 | 0/30 |

The control misses every run, so the check tells a held move from none. Firefox received 2 of cua's held moves where
it received 16 of the vendor builds' (8 ms between held points). With or without Gecko's lead pause, cua's held moves
lose the stroke and the drop. **The lead-pause question (Decision Log, T9) cannot be answered until the held moves
themselves land.** The pacing of Gecko's held moves (300 µs a step, for `drag`'s per-pixel samples) is the gap.
Spacing (`probes/handle-gap100/`, `probes/handle-gap10/`, 0.3.0, 6 a side): with 100 ms between requests the canvas
landed 6 of 6 and the drop 0 of 6 (`effect 0`: the drag starts and nothing accepts it; `cua:0ms` took the drop 5 of
6); with the service's 10 ms, 1 of 6 each; back to back, 0 of 3 each (`probes/smoke/`).

### Writer's unprimed lane (`writer-released/`, 0.3.0, 10 a side)

Every engine's fresh-window first drag selected nothing (0 of 10, the known behaviour). But the primed `select` cell
also selected nothing in every engine on this private display (0 of 10, the pinned build's included), so the unprimed
judge had no selection to check itself against, and the run says REFERENCE MISMATCH instead of passing it. On `:0`
(M1a.4) the primed cell took 30 of 30. Why a primed Writer drag selects nothing here is T16's first question.

## Probes

- `probes/thumb-events/`: which page events a Chrome scrollbar drag delivers (the `received` line's choice).
- `probes/smoke/`: the new cells' first run, 3 a side.
- `probes/handle-gap100/`, `probes/handle-gap10/`: Firefox held moves with 100 and 10 ms between `drag_handle`
  requests (a probe copy of the harness with the gap from the environment).

## After the sittings

One commit after b103323d changes a comment and labels the summary's median columns `warm ms`. Neither changes what is
measured or judged; the sittings' summaries say `drag ms` for the same warm medians.
