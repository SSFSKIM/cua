# linux-engine 0.4.2's candidate, measured (#171 M5, task 116)

Development runs only, none counted. Nothing was tagged, released or pinned, and the engine was not changed. The work
is task 116 (session linux171), measuring for the design session's rulings 888.2–888.4, 892 and 897. Every count and
time here comes from the runs' own rows. The joined samples are `x64/*.jsonl.gz` and `arm64/*.jsonl.gz`, one row per
drag with the engine's hold record and every ping; nothing in them is page text. The full tables are next to them.

## The binaries and the heads

The candidate moved twice while this task ran, and each run states the head it measured.

| head | what it is | x64 sha256 | arm64 sha256 | used for |
|---|---|---|---|---|
| 3dd381ec | task 115's candidate | `5c4d0144…10ad` (CI artifact) | `5285e74b…7bdab` (CI artifact) | one 1-block pilot only, set aside (`pilots/`, not committed) |
| fdaff715 | fix wave 1, plus `--drag-dnd-hold-ping off` | `78e7fc42…3003` | `7f9a4a1c…7fc3` | release timing with the sampler on and off, the late-take watch, the cost, the idle checks (V5 on arm `:0`, x64 private) |
| 313167a9 | fix wave 2: pings checked at submission, and a cap on ping setups | `f455fadb…c02b` | `3f5da25e…0381` | everything that reads the pings: the predictor and the adaptive tables, both architectures, both loads, arm `:0` |

- **The builds.** All four were built locally from the head, static musl, `cargo build --release --locked --target
  <musl>` then `strip` (`scripts/build.sh`). The controller asked for local builds, not the workflow's artifacts.
- **fdaff715's pings are a pilot.** Wave 2's review found that fdaff715 recorded a failed send as an unanswered ping. Its
  release timing still stands: the sampler runs off the drag's thread, and the release path for Chrome and Electron
  sources is the same in both heads. Wave 2 moved the release dwell inside the hold, but only Gecko has a release
  dwell (30 ms); Chrome and Electron have 0 (`families.rs`).
- **B = 450.** It is the default, and ruling 892 settled it.

## Where and what

- **x64.** Private displays only (`private-run.mjs`). Load 2 means stress-ng at 2 workers per core: the harness's own
  load for D1, D2 and Electron, `private-run.mjs --load-factor 2` for the device cells. That is 16 workers on 8 cores.
- **arm64, idle V5.** On `:0` through task 109's sitting launcher, the fixed copy of ruling 888.6 (sha256 `615980b0`;
  the old one is kept as `sitting.sh.bak-pre042`). The launcher wraps `sitting.mjs`, `run71.sh` and `wrap71`. The
  sittings ran inside one hold of the lock, holder `m5-measure042`.
- **arm64, everything else.** Private displays.
- **The cells.**
  - V5's two cells are `chrome_dnd_shared` (the cancel cell) and `chrome_dnd_short_in_front_shared` (in front), with the
    gate's ballast.
  - D1 is the drag experiment's Chrome cells, and D2 its Electron cells.
  - `sel` is `chrome_select_nudged_shared`: a select drag in V5's own scene, on the same page with the same ballast,
    with no draggable source. It is V5's no-take control, added on the controller's word after D1 proved to be no
    control for V5's scene.
  - `edn` is Electron's short drag and drop (`--experiment dnd --family electron --dnd-short`, in front, the lane with
    `--stats`). It is the only Electron drag that reaches the hold.
- **The lanes.** `cua` is the candidate as it ships. `cua:nopings` is the same with `--drag-dnd-hold-ping off`.
- **Chrome 158** on arm64 is T7's extracted copy, put first on PATH; the held 156 was left alone.
- **The run inventory** is in `logs/*-chain.log`.

## 1. V5's cells (the counted conditions, as a check of the candidate; and twice the load)

`v5-summary.md`, from the joined rows, and `x64/v5-cells.md` and `arm64/v5-cells.md` (task 113's `analyze_v5.py`).
Shape is task 112's shape, a plain ok whose page counted a dragstart and a dragend and no drop. False ok is a plain ok
with no drop in front, or any plain ok in the cancel cell.

| condition | cancel cell: the shape | cancel cell: plain oks | in front: false oks | takes during the hold, prevented |
|---|---:|---:|---:|---:|
| x64 idle, private (fdaff715, both lanes, 30 cold + 60 warm each) | 0/90 per lane | 0 | 0/90 per lane | 88/88 and 90/90 dropped |
| x64 idle, private (wave 2, 15 + 30) | 0/45 | 0 | 0/45 | 30/30 |
| arm64 `:0` idle (fdaff715, 30 + 60, all-clear clear) | 0/90 | 0 | 0/90 | 60/60 |
| arm64 `:0` idle (wave 2, 15 + 30, all-clear clear) | 0/45 | 0 | 0/45 | 30/30 |
| arm64 private idle (wave 2, 15 + 30) | 0/45 | 0 | 0/45 | 30/30 |
| x64 2x (fdaff715 cua, 52 + 104) | 0/156 | 3, no dragstart | 0/156 | 120/120 cancelled, 147/147 dropped |
| x64 2x (fdaff715 cua:nopings, 52 + 104) | 0/156 | 3, no dragstart | 0/156 | 119/119, 144/144 |
| x64 2x (wave 2, 52 + 104) | 0/156 | 5, no dragstart | 0/156 | 117/117, 148/148 |
| arm64 2x (wave 2 cua, 74 + 148) | 0/222 | 4, no dragstart | **7/222**: 4 tail, 3 no dragstart | 139/139, 186/194 dropped (8 unconfirmed-drop notices) |
| arm64 2x (wave 2 cua:nopings, 24 + 48) | 0/72 | 2, no dragstart | **2/72**: 2 tail | 54/54, 58/63 |
| arm64 Chrome 158 idle (10 + 20) | 0/30 | 0 | 0/30 | 10/10 |
| arm64 Chrome 158 2x (10 + 20) | 0/30 | 0 | 0/30 | 12/12, 26/28 |

- **The idle conditions.** Both counted idle conditions read 0 shape and 0 false oks, as ruling 886 requires. That is
  arm `:0` through run71, 45 cold and 135 warm samples a cell over the two heads, and x64 private.
- **At twice the load the cancel cell's shape is gone on both architectures.** 0.4.1 left 36/52 cold and 33/104 warm
  on x64 (task 113), and 50/70 cold and 48/140 warm on arm64.
- **The arm64 2x tail.** The in-front cell's tail at arm64 2x is the residue 888.3 rules on.
  - It is 4 of 222 samples on the default lane, plus 2 of 72 on the sampler-off lane.
  - The page's dragstarts came at +458 to +521 ms after the press, 8 to 71 ms after the release at B.
  - Chrome refused each one. No take came, so the late-take watch saw nothing.
  - All 6 fell in the two runs that ran both lanes. The 150 in-front samples of the default-only runs had none.
- **The 8 unconfirmed-drop notices at arm64 2x** (and 3 on Chrome 158) are T14's existing path: a drop the page did
  not confirm in time. They are not late takes.

## 2. The ping predictor (888.2): what a slow ping marks

`*/tables-w2.md` §2 and §3. These are wave 2's pings on the default lane. A ping's wait is its round trip, or, if it was
never answered, its age at the hold's end, which is a lower bound.

**A slow ping marks a press on a draggable source.** It does not mark the tail.

| arch, load | plain drags (D1, D2, sel), first ping p50 / p99 / max | draggable, take in the hold, first ping p50 / p90 / max | tail | V5 no dragstart |
|---|---|---|---|---|
| x64 idle | 1.1 / 1.2 / 1.2 (n 135) | 18.3 / 26.5 / 54.6 (n 30; takes at +60–130 cut most short) | – | – |
| x64 2x | 1.1 / 6.4 / 7.6, largest ping 16.1 (n 636) | 42–115 / 86–175 / 208 (n 256) | – | 131–183 (n 5) |
| arm64 idle (private and `:0`) | 1.1 / 1.1 / 1.1, largest 8.5 (n 135) | 101 / 106 / 107 (n 60) | – | – |
| arm64 2x | 1.1 / 5.5 / 14.9, largest 26.8 (n 568) | 46–89 / 121–146 / 260 (n 330) | 268–333 (n 4) | 204–283 (n 7) |
| arm64 Chrome 158 idle / 2x | 1.1 / 1.1 / 1.1; 1.1 / 5.3 / 5.3 | 103 / 106 / 106; 49–95 / 113–123 / 227 | – | – |

- **The scene control settles it.** V5's no-take control in its own scene (`sel`: the same page, the same ballast and
  load) reads 1–7 ms (arm64 2x max 7.4, x64 2x max 16.1).
  - So the ballast does not make V5's pings slow; a press on the draggable source does.
  - Every no-take press on a draggable source reads slow: the tail and the drags where Chrome began no drag alike.
- **The predictor table at arm64 2x.** Thresholds are the controls' percentiles, as the brief asked. A notice on a V5
  no-dragstart drag counts as a false alarm too.

| thresholds from | metric, percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no dragstart |
|---|---|---:|---:|---:|---:|---:|
| D1 and D2 plain (n 439) | first ping, p90 / p95 / p99 | 2.1 / 3.2 / 5.7 | 4/4 each | 4/4 | 38 / 17 / 4 of 439 | 7/7 each |
| D1 and D2 plain | largest ping, p90 / p95 / p99 | 4.3 / 5.3 / 6.7 | 4/4 | 4/4 | 38 / 15 / 3 of 439 | 7/7 |
| the scene's select control (n 129) | first ping, p90 / p95 / p99 | 3.2 / 3.2 / 4.4 | 4/4 | 4/4 | 5 / 5 / 1 of 129 | 7/7 |
| the scene's select control | largest ping, p90 / p95 / p99 | 5.3 / 6.4 / 7.4 | 4/4 | 4/4 | 9 / 5 / 0 of 129 | 7/7 |

- **x64 2x has no tail to hit** (0/156 in front). Its false alarms are §2 of `x64/tables-w2.md`: 4/480 controls and 5/5
  no-dragstart drags at p99.
- **The reading.** A notice on a slow ping would carry every tail (4/4). It would also land on every no-take press of a
  draggable source where Chrome began no drag (7/7), and on few plain drags (0–4 at p99).

## 3. An adaptive hold (ruling 897): the numbers either direction would meet

`*/adaptive-w2.md`; `scripts/adaptive.py` states the definitions. Wave 2, default lane.

- **When a ping is slow.** At threshold T a ping is slow once its wait passes T, and the drag is known slow at sent + T.
- **Fast before slow.** A drag has a fast ping before the slow one when a ping was answered within T before then.
- **Early release at X** releases a drag whose pings, by X, include one answered within T and none known slow.
- **Fail toward the hold.** A drag with no ping answered by X stays held.

### 3.1 Presses on a draggable source: when they are known slow

| condition | class (n) | known slow at, T = 20: min / p10 / p50 / p90 / max | never slow before the take or end | a fast ping before the slow one (T 20 / 40 / 80) |
|---|---|---|---:|---|
| arm64 `:0` idle | take in the hold (30) | 69 / 69 / 69 / 69 / 69 | 0 | 0 / 0 / 0 |
| arm64 private idle | take in the hold (30) | 69 / 69 / 69 / 69 / 69 | 0 | 0 / 0 / 0 |
| x64 idle | take in the hold (30) | 69 / 69 / 70 / 70 / 70 (n 9) | 21: the take came first, at +60–130 | 0 / 0 / 0 |
| arm64 2x | tail (4) | 70 / 70 / 76 / 85 / 85 | 0 | 0 / 0 / 0 |
| arm64 2x | no dragstart (7) | 69 / 69 / 175 / 200 / 200 | 0 | 0 / 0 / 0 |
| arm64 2x | take in the hold (330) | 69 / 70 / 91 / 180 / 234 (n 289) | 41 | 13 / 19 / 21 |
| x64 2x | no dragstart (5) | 175 / 175 / 176 / 188 / 188 | 0 | 0 / 0 / 0 |
| x64 2x | take in the hold (256) | 69 / 70 / 77 / 180 / 197 (n 184) | 72 | 1 / 1 / 0 |
| arm64 Chrome 158 idle | take in the hold (10) | 69 (all) | 0 | 0 / 0 / 0 |
| arm64 Chrome 158 2x | take in the hold (40) | 69 / 70 / 78 / 175 / 183 (n 35) | 5 | 1 / 6 / 6 |

- **No-take presses are all known slow early.** Every no-take press on a draggable source (11 at arm64 2x, 5 at x64 2x)
  was known slow by +200 ms at T = 20, and none had a fast ping first.
- **The tails.** Their dragstarts came at +458 to +496 ms, and they were known slow at +70 to +85.

### 3.2 Plain drags: every ping through the hold

- **The count.** Every ping of every plain no-take drag (D1, D2 and `sel`): 6,717 at arm64 2x, 7,879 at x64 2x, and
  1,680 at idle on each architecture.
- **The bands.** In every 100 ms band of the hold (0–99 through 400+), p90 is ≤ 2 ms and p99 ≤ 3 ms.
- **Only one ping in all of it passed 20 ms.** That was arm64 2x, D1's scroller, 26.8 ms at +159. None passed 40 ms. On
  Chrome 158 the largest plain ping was 2.1 ms idle and 5.3 ms at 2x.

### 3.3 The gap, and a threshold

| condition | plain max ms | no-take draggable presses: smallest largest wait | takes after 150 with a ping answered by 150: smallest reading by 150 | gap | the geometric mean |
|---|---:|---:|---|---:|---|
| x64 idle | 4.3 | – | none after 150 | – | – |
| x64 2x | 16.1 (sel) | 91.2 (n 5) | none: all 205 had no ping answered by 150, held | 5.7x | 38 ms |
| arm64 idle | 8.5 | – | none: all 15 held | – | – |
| arm64 `:0` idle | – | – | 100.4 (n 1; 13 held) | – | – |
| arm64 2x | 26.8 (D1 scroller) | 204.2 (n 11) | **40.9** (n 21; 231 held) | **1.5x** | 33 ms, 1.2x margin each side |
| arm64 Chrome 158 idle | 2.1 | – | 100.2 (n 2; 5 held) | 47.7x | – |
| arm64 Chrome 158 2x | 5.3 | – | 37.5 (n 6; 26 held) | 7.1x | – |

- **The tight side is arm64 at twice the load.** The plain side's largest ping (26.8 ms) sits within 1.5x of the
  smallest slow reading by 150 that an early release would act on (40.9 ms).
- **No threshold has a margin both ways there.** The proposal is to set T low, at 20 ms, and let errors fall toward the
  hold: a plain drag that reads slow is only held longer, while a draggable press that reads fast would be released
  early.
- **The record at T = 20.** It is the one threshold with 0 early-release misses everywhere: 0/252 at arm64 2x, 0/32 on
  Chrome 158 at 2x, against 1/32 at T 40 and 6/32 at T 80. It extends 1 plain drag of 568 at arm64 2x and 0 elsewhere.

### 3.4 Early release at 150: the misses per condition

| condition | takes after 150 released early (T 20 / 40 / 80) | tails released early | plain drags with a path under 150 released early |
|---|---|---:|---|
| x64 idle | 0/0 | 0 | 120/120 |
| x64 2x | 0/205, 0/205, 0/205 | 0 | 539/547 |
| arm64 private idle | 0/15 each | 0 | 120/120 |
| arm64 `:0` idle | 0/14 each | 0 | – |
| arm64 2x | 0/252, 0/252, **21/252** | 0/4 | 423/431 |
| arm64 Chrome 158 idle | 0/7 each | 0 | 30/30 |
| arm64 Chrome 158 2x | 0/32, **1/32**, **6/32** | 0 | 16/16 |

- **The other points.** Release at 100 misses 9/316 takes at arm64 2x (T 20). From 200 on, nothing is missed at any T.
  The full grid is in §3 of the adaptive tables.
- **arm64 `:0` idle.** This sitting's late in-front renderers took at +147 ms p50 (max 155). Every one was known slow at
  +69 ms. There was no take at +185–228 in this sitting.

### 3.5 Electron: the ping does not mark its draggable presses

- **The runs.** Electron's short drag and drop (`edn`, in front), 30 drags idle and 30 at 2x on each architecture.
- **Where the takes came.** At idle every take came during the path (+2 to +48 ms), so no hold ran. At 2x, x64's 30 all
  took in the path. On arm64, 21 took in the path and 9 in the hold, at +53 to +66 ms.
- **Those 9 holds.** 7 had a ping in flight before the take, and every one was answered in 1.1–5.7 ms. The other 2 had
  no ping (the connection was not ready).
- **So Electron's browser stays fast while a drag starts.** An early release at 150 misses no Electron take here only
  because every Electron take came by +66 ms; the ping would not have held one back. A slow-ping extension would never
  fire on an Electron tail.
- **D2's own dnd cell** takes during its path in every lane, so its pings are never sampled.

### 3.6 The extension's cost (extend to press + 650 on a ping known slow by 450)

| condition | tails covered | V5 no-take presses extended | Electron no-take extended | plain drags extended (T 20 / 40 / 80) |
|---|---:|---:|---:|---|
| arm64 2x | 4/4 | 7/7 | 0/0 | 1/568, 0, 0 |
| x64 2x | 0/0 | 5/5 | 0/0 | 0/636 |
| idle, either architecture, Chrome 158 | 0/0 | 0 | 0 | 0 |

- **What an extended no-take drag pays.** It answers ok with the notice at about +650 instead of +450.
- **What the extension catches.** The arm64 2x tails' dragstarts came at +458 to +521 (all 6, both lanes). Their takes
  would come inside +650, so the drags would drop or be cancelled in time instead of answering ok. Task 113 saw arm64 2x
  renderers start at up to about +580.

### 3.7 Failing toward the hold: pings that were not a fast answer

- **Answered, in flight and failed.** On wave 2 no plain drag had an unanswered ping. No ping anywhere was in flight at
  the hold's end, and none failed to send.
- **Pings not asked.**
  - "The ping's connection was not ready by the hold's end": arm64 2x took-hold 3, x64 2x 9, Electron 2.
  - "No ping fitted in what was left of the hold": arm64 2x plain 7.
  - The rest are drags whose path itself ran past B: canvas, and arm64 2x Electron select and range.
- **Unanswered pings are draggable presses only:** 29/30 at idle, 131/139 and 174/194 at arm64 2x, all 4 tails, and 3 of
  the 7 no-dragstart drags.
- **The per-class table** is §5 of `*/adaptive-w2.md`.

## 4. The late-take watch (888.4), unproxied

- **The watch reported no late take in any condition.** That covers V5, D1, D2, `sel` and Electron, on both
  architectures, idle and at 2x, both heads; no `late_dnd` carried a take time.
  - The arm64 2x tails were refused by Chrome, so no take came.
  - x64 2x had no tail.
  - The only `late_dnd` records are the in-front cell's unconfirmed-drop notices at arm64 2x: 23 on the default lane,
    10 sampler-off, 3 on Chrome 158. That is T14's path, and its next request is refused with "an unconfirmed drop".
- **No plain drag's answer waited on the watch** (`*/tables-*.md` §5). The time outside press-to-release (answer less the
  release after the press) never reached 300 ms in any plain cell.

  | condition | p50 | max |
  |---|---|---|
  | x64 idle | 4 ms (Chrome); ~7 ms (Electron) | 10 ms (Chrome); 47 ms (Electron) |
  | x64 2x | 7–14 ms | 124 ms (Electron canvas) |
  | arm64 idle | ~2 ms | 4.4 ms |
  | arm64 2x | 11–22 ms | 246 ms (Electron select) |

  - The watch is 700 ms, and a drag that waited on it would answer ≥ 700 ms after its release.
  - At arm64 2x the long ones are Electron's rest and the harness's load. They are not the watch.
- **The release against B.** A no-take hold whose path ended before B releases 0.1–4.6 ms (p50) after B, max 10 ms, in
  every condition. No release came more than 25 ms past B.

## 5. The sampler does not move the release (ruling 892)

Each comparison sets the default lane (pings on) beside `cua:nopings`, in the same runs. `x64/tables-fdaff715.md` §6 and
`arm64/tables-w2.md` §6.

| condition | class | release after the press, p50 / p95 / max, on | off |
|---|---|---|---|
| x64 2x, V5 in front | take during the hold | 534.4 / 610.2 / 690.3 (n 147) | 534.9 / 619.9 / 742.7 (n 144) |
| x64 2x, V5 cancel (answer: the release is not recorded on a refusal) | take during the hold | 519.2 / 590.7 / 726.0 | 520.1 / 593.4 / 707.1 |
| x64 2x, V5 | no take | 454.6 / 457.5 / 457.5 (n 3) | 450.2 / 450.2 / 450.2 (n 3) |
| x64 2x, D1 plain | no take (select, range, scroller) | 450.3 / 451.9–454.7 / 455.2 (n 120) | 450.1 / 450.6–453.5 / 454.4 (n 120) |
| x64 idle, V5 in front | take during the hold | 420.0 / 466.7 / 488.6 (n 88) | 422.3 / 458.5 / 467.2 (n 90) |
| arm64 2x, V5 in front (wave 2) | take during the hold | 524.0 / 698.5 / 769.6 (n 194) | 535.1 / 716.1 / 751.2 (n 63) |
| arm64 2x, V5 | no take | 450.1–450.2 / 454.2 / 454.2 (n 11) | 453.3–454.1 (n 4) |
| arm64 2x, D1 plain: past B | no take | 0.6 / 3.9 / 6.7 (n 230) | 0.1 / 3.4 / 8.4 (n 233) |

- **No shift beyond scheduler noise.** The medians agree within 1–11 ms, and the tails overlap both ways.
- **The idle cancel cell's cold samples** answered 384 against 328 ms (x64 fdaff715). Those drags took during the path,
  before any hold or ping, and the warm medians agree (349 / 348). That is block order, not the sampler.

## 6. The cost of B = 450 (fdaff715, idle, the judges D1 and D2 apply)

`x64/cost.md` and `arm64/cost.md`. The figures are warm medians in ms.

| cell | x64 cua | x64 pinned / newest | arm64 cua | arm64 pinned / newest | judge |
|---|---:|---|---:|---|---|
| Chrome select | 454.3 | 453.4 / 322.4 | 451.8 | 415.8 / 311.6 | PASS both |
| Chrome range | 454.4 | 453.0 / 324.9 | 451.8 | 415.9 / 311.7 | PASS both |
| Chrome scroller | 454.2 | 279.4 / 263.2 | 451.8 | 269.1 / 257.9 | PASS both (reach) |
| Chrome dnd | 366.3 | 509.8 / 338.0 | 354.5 | 479.7 / 328.1 | the declared #358 gap: [25.3, 31.6] x64, [26.4, 26.6] arm64 |
| Chrome canvas | 476.5 | 1154.4 / 514.0 | 473.3 | 1045.3 / 486.1 | PASS both (speed) |
| Electron select / range / scroller | 456.8 / 457.5 / 456.5 | 457–460 / 324–325; 279 / 262 | 453.0 / 452.7 / 452.9 | 415 / 312; 269 / 258 | PASS both |
| Electron dnd | 405.1 | 513.3 / 338.3 | 400.3 | 480.1 / 328.2 | PASS both |
| Electron canvas | 479.2 | 1158.1 / 516.3 | 474.4 | 1047.0 / 485.5 | PASS both |

- **Every lane passes D1 and D2.** That includes x64's sampler-off lane, which lands within 0.3 ms of the default.
- **The cost falls on short paths.** A short Chrome or Electron drag now takes B (~452–457 ms warm), where 0.4.1 took
  129 (select) and 63 (scroller) on x64 (task 113). Drags whose path lasts B or more are unchanged (canvas).

## Notes on the runs

- **The arm64 `:0` guard stop.** The first `:0` V5 attempt on fdaff715 was stopped by wrap71 22 s in.
  - The guard flagged 4 `outside-peer-connection` reaches, each to an abstract autobind socket with no peer pid (#432's
    class).
  - The controller cleared it under 730(b), on 888's rule; the record is `hold-sittings-cleared-2026-11-20T00-45Z.txt` on
    the VM.
  - The attempt is kept as `stopped-zero-1`, with its guard record in `logs/`. The step was rerun, and its all-clear was
    clear.
- **Waiters that started early.** On arm64, three waiter scripts read the wrong process before waiting. One matched the
  name of a script that had exec'd, one was given a pid list through zsh, and one parsed `edn-*` as a sampler-off part.
  - Each was stopped before its run took the lock, and noted in `logs/arm64-w2-chain.log`.
  - No run overlapped another; every run held the host lock.
  - The `edn` set was then run on its own.
- **maws-update.** On the controller's word, x64's chain was paused at a boundary (SIGSTOP on its chain script) until
  the `maws-update` holder had taken and released the lock (03:12:29–03:13:34Z).
- **Exit codes.** The device runs' exit 1 is the harness's own in-run judge on development runs. Their cells are
  classified here per sample, as task 113 did.
