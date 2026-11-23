# A drop counts as landed only where the path ended, and step L4d (#171 M5, task 128, Part 2)

**Development evidence, not a release gate.** This covers rulings 957, 961, 962 and 972, on top of the frozen H7
(ae3fc1e8). The runs are x64 only, on private displays, against the pinned linux-engine 0.4.2 in a run-owned home
(task 121's), held under the host lock as `m5-h7` (runs) and `m5-judge` (re-judges). The arm VM's rows were copied over
ssh, read-only. No engine change, and the pages are unchanged.

## The rule (rulings 957 and 961)

The pages count drops by source and record no position, so the judges place each cell's own path end against the
zone:
- the path ends are `PATH_ENDS`, the last point of drop-signals.mjs `CELLS` (off-window cells end outside);
- the zone is `ZONE`, pages/drop-signals.html `#zone` (560–960 × 100–620 in page px);
- for the device scene, each drop case's `endsAt` (drag.mjs `pagePath`'s last point) against `DRAG_TARGET`, drag.html
  `#target`.

What a landing in the zone means:

| the path ended | a landing in the zone is |
|---|---|
| inside the zone | landed, as before |
| outside | **a drop at a stale position**: a named fail beside the false oks, never counted as landed, never also a false ok |
| within 3 px of the border | **ambiguous**: named and counted, neither; unexercised where a band needs a landing |
| unplaceable (a cell with no known end) | a named fail |

These judges use it: `chromeDropVerdict`, `electronDropVerdict`, `holdRegressionVerdict`, and device.mjs's drop cases
(`judgeDevice`'s drop counts, which gained `stale_position` and `ambiguous`).

**The margin is `STALE_MARGIN_PX` = 3.** The parts:
- The drag's last step. The engine samples each segment about 1 px apart, at most √2 px on a diagonal (`pointer.rs`
  `drag_samples`), so a browser one sample behind sits within 1.42 px of the end. Rounded up, that is 2.
- 1 px for the page's origin, which is read from the accessible frame's whole-pixel extents.
- Nothing for the zone's border, a CSS edge with no width.
- Nothing for the device scale, which is 1. A row's `end` is the window, the page origin and the cell's page point
  summed pixel for pixel: (504, 587) = (4, 87) + (500, 500).

Every planned cell ends 8 px or more from its border. The nearest are `move`, 8 px in, and `inzone-out`, 12 px out.

**The review of 2dd2b0d8:**
- The measurement lane's accept is not proof of where the path ended, because the engine sends every sample before it
  reads the cursor. So that lane is judged by the path's end too.
- An unverified off-window end no longer hides the zone's drop.
- `t17-long` needs exercised drags (below).

## The re-judges (`rejudge/`)

Every stored drop-signals run was judged by H7's judge and by this one (`scripts/rejudge957.mjs`, `rejudge-all-2.sh`):
H6 and H⁗ on both architectures, the committed copies and the local or VM ones, the pilots, a953, a957 and s954.
- **Scope:** 148 run copies, 27468 drags. Some runs are stored twice, as a local or VM copy and a committed one.
- **Path ends within the margin:** 0.
- **Moved verdicts:** two, both on arm64 development runs (a957, `t14-long` ×10, twice the load), pass → fail:
  - `dev-a957-e041-r2` (0.4.1): long-left #8;
  - `dev-a957-e042-r9` (0.4.2): #4 and #5.

  Each row answered a plain ok with nothing pending, and its next request ran. The zone's counter rose, yet the path
  ended 60 px left of the zone.
- **Stale-position drops in runs that already failed:** a953 `t14-long` (#33, #36, #53, #85, #96); a957 e041 r5, r6,
  r8, r9; e042 r0, r3, r5. That makes 18 unique drops in all.
- **No counted step moved,** on either architecture or at either head: C1, L4c, L4b, H1, H2, L4a, K3.

The device scene (`rejudge/device.jsonl`, `rejudge/leaves-cases.jsonl`) covers every stored V5 run and a959's
long-left runs (pinned, newest, cua):
- No leaves-case sample dropped.
- No device verdict moves between H7's device.mjs and this one.

## Step L4d (ruling 962)

**The step.** L4d is in the twice-load block (`steps.mjs`), on a private display, 30 min. It runs one harness run,
`--experiment drop-signals --family chrome,electron --plan t14-stale --load-factor 2`. The run is a plan of parts
(drop-signals-judge.mjs `PART_PLANS`), whose parts sit in turn, each in its own scene and judged by its own plan's
judge (`partsVerdict`):
1. chrome `t14-long`: cua long-left ×100;
2. chrome `t14-floor`: cua plain-long ×300, left ×30, inzone-out ×30;
3. electron `t17-long`: cua long-left ×30.

All of them run on the shipped lane, with no measurement flag. Any false ok, any drop at a stale position, and an
unexercised `t17-long` each fail the step.

**The budget is 30 min.** a953 sat the two Chrome plans in 23 on arm64 at twice the load (16.5 and 6.3), and
Electron's part takes about 3. The x64 development run took 20.

**The Electron cell (ruling 962 and 972).** Chrome's `long-left` path fits Electron's window as it is:
- the page sits at the window's origin, and the window is 1050 × 780;
- every sample is in the window and clear of the front xterm, and no other window or sink opens for the plan;
- the path crosses the zone, ends at (500, 500), 60 px left of it, and is about 940 px long.

A drag counts as exercised only when all of these hold:
- a take was seen;
- the motion after the take outlasted the floor by more than `T17_LONG_OUTLAST_MS` = 25 ms. The engine spreads a
  shorter path's steps over the floor, so those end 350–358 ms after the take (L4a's cells);
- it ended as expected: ok, with no stale, ambiguous or unplaced landing, and no false ok.

`T17_LONG_MIN` = 20 of 30 are needed:
- the x64 run below exercised 30 of 30, and Electron took every L4a drag at twice the load on both architectures;
- from 0 misses in 30, the miss rate is under 10%, and at 90%, fewer than 20 by chance is under 0.1%;
- 20 of 30 is the late bands' two thirds.

**The x64 development run (`dev-run/L4d.development-run/`):** `gate.mjs run L4d --pinned <home> --dev` at 8a2a3696
(the judge then lacked only the 25 ms margin), twice the load. It **PASSES** (exit 0, the watchdog clean), and
`parts.jsonl` re-judges it at this head with the same result.

| part | plan | drags | landed | stale | false ok | other |
|---|---|---:|---:|---:|---:|---|
| 1 | chrome t14-long | 100 | 0 | 0 | 0 | every drag took |
| 2 | chrome t14-floor | 360 | 300 | 0 | 0 | the long drop 300 of 300 |
| 3 | electron t17-long | 30 | 0 | 0 | 0 | 30 took, 30 outlasted, 30 exercised, of a minimum of 20 |

Electron's long path (`electron-takes.txt`), as min / median / max in ms:
- take after the press: 4 / 16 / 34;
- path: 471 / 473 / 530;
- motion after the take: 437 / 461 / 520, so 87 ms past the floor at the least.

Two earlier attempts stopped at the Electron part (`dev-run/attempts/`). Their Chrome parts were clean, and both
failed closed:
1. At bda3da8f, every sitting opened the run's front xterm, and the second sitting's was a second window with the
   same title. 8a2a3696 opens it once per run.
2. At 8a2a3696, the worktree's `npm ci` had not installed Electron's binary (`node_modules/electron/dist`, spawn
   ENOENT). `node node_modules/electron/install.js` fixed that. The checkout L4d runs from needs that binary.

## The byte comparison against H7 (`comparison/`)

`launch-plan.mjs` ran at ae3fc1e8 and at 7e9f3807, each head's own, from one fixed path under `env -i`. On x64 and
arm64, of 54 steps, **only L4d differs**, and it is new. Every other launch and plan is identical. On both
architectures L4d's launch is the same, apart from the plan header's architecture.
