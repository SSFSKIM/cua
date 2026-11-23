# Task 113: 0.4.2's candidate hold (ruling 886 (i)), built and measured (M5)

Branch `m5-hold-042`, from `origin/feat/171-m5` (5908b292), pushed. x64 worktree
`/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-ae4c2142e66e0c56a`; arm64 checkout
`~/Developer/GitHub/cua/.claude/worktrees/t113-hold042` (detached at 8071fc90). Nothing tagged, released or pinned, no
version bump; the hold is off by default. Working files: `~/.local/share/cua-171/task113/` on each host; the scripts are
copied in `scripts/` here.

## Commits

- cca834a4: Linux engine: a final hold for a Chromium source's late take, development only.
- 8071fc90: the final-hold tests delete the stacking list `in_front` set (test hygiene).
- 5248a54f: harness: a development-only drag-source probe (`--experiment drag-source-probe`).
- the evidence commit carrying this README and `scripts/`.

## What was built

- `--drag-dnd-final-hold-ms <B>` with `--drag-dnd-final-hold-from release|press` (default `release`).
  - The config is `Config::dnd_final_hold` (None by default) and `dnd_final_hold_from`; the deadline is
    `dnd::HoldFrom::deadline`.
- It applies only when the drag's source (the window pressed into) is a Chromium-family window (`families::blink`).
- On unguarded drags (in front, the foreground route, the desktop route):
  - the wait comes after the existing press hold and before the floor;
  - with no take yet, the button stays down until the deadline or a take;
  - a take then gets the floor and the settle, as any take does.
- On guarded drags (V5's cancel cell): the same wait, just before the release dwell. The last look then sees a take and
  cancels it before the drop.
- At a Chromium `drag_handle`'s end, at the top of `release_handle`, the hold watch is polled.
- The deadline:
  - `release`: B after where 0.4.1 would release, so every no-take drag pays B;
  - `press`: press + B, so a drag that already lasts longer pays nothing.
- `--stats` `final_hold`: `{bound_ms, from, start_after_press_ms, waited_ms, taken}`. The README's flag table lists the
  flags.

## Tests

- **RED.**
  - Unit `cargo test --bin cua-engine final_hold` did not compile against the missing field (3× E0609).
  - The four live tests, run against the released 0.4.1 binary, failed with `unknown argument --drag-dnd-final-hold-ms`.
    Each test's "off" half passed on 0.4.1 first.
  - The press-anchor live test and the `HoldFrom` unit test came with the anchor's code; they were not run red.
- **GREEN.**
  - 2 unit tests and 5 live tests (`a_final_hold_*`), through the real drag path with `drag_source`'s fake Chrome.
  - The fake takes during the hold, after the bound, or never.
  - The routes: background in front, foreground, desktop, guarded, a handle's end, and a non-Chromium source untouched,
    plus the press anchor.
  - `cargo test --locked`: 451 unit tests and every boundary suite pass. clippy and fmt are clean.
- **The release live suite.** Every binary passes except `live_device`, which **fails intermittently in tests the
  change does not touch** (Concerns).
- **ci-gate `engine-linux`:** RED on cca834a4 (run 44526218461) and on 8071fc90 (run 44530165817), both on
  `a_foreground_click_into_the_window_s_own_popup_is_not_held_back`.

## Measurements

All are development runs under `locked.sh m5-hold042`, with hold-sittings checked before each.

The terms:
- **Shape** (task 112's): a plain ok (no notice, no take) where the page counted a dragstart and a dragend and no drop.
- **Cancel** = `chrome_dnd_shared`; **in front** = `chrome_dnd_short_in_front_shared`.
- **Prevented**: the final hold ran, its take came, and the sample was then cancelled (cancel) or dropped (in front).
- **The `cua` lane** is the candidate with the hold off. Every change is gated on the flag. x64's baselines and arm's
  idle baseline used the released 0.4.1 asset itself.
- **Lanes:** `pN` = press anchor, B = N; `rN` = release anchor, B = N.

### x64, private display, the released 0.4.1 (52 cold and 104 warm per cell per load)

| load | cancel shape cold | cancel shape warm | in-front false ok cold | warm |
|---|---|---|---|---|
| idle | 0/52 | 0/104 | 0/52 | 0/104 |
| 2x | 36/52 (20 with the dragstart after the release) | 33/104 (16) | 2/52 | 3/104 |

At 2x, the cancel shape samples' dragstart came p50 151–162, p90 211–236 and max 264 ms after the press.

### x64 at 2x, the candidate lanes (27 cold and 54 warm per lane)

| lane | cancel shape cold/warm | prevented cold+warm | in-front false ok cold/warm |
|---|---|---|---|
| cua (off), run 1 | 19/27, 18/54 | – | 1/27, 3/54 |
| p300 | 1/27, 1/54 (dragstarts at +302 and +295) | 24+42 | 0, 1/54 |
| p350 | 0, 0 | 25+48 | 0, 0 |
| r150 | 0, 0 | 23+48 | 2/27 (no dragstart), 0 |
| cua (off), run 2 | 21/27, 21/54 | – | 0, 1/54 |
| p400 | 0, 0 | 25+45 | 0, 0 |
| p450 | 0, 0 | 24+50 | 0, 0 |

The plain oks left in the candidate lanes are no-dragstart samples: Chrome began no drag, ruling 823's unmet premise.

### arm64, private display, idle, the released 0.4.1 (v5-base-1, 20 blocks)

- The shape is 0/20 cold and 0/40 warm in both cells.
- Its first two blocks may have seen about 26 s of intermittent stress-ng from refused load attempts (Discoveries).
- So idle runs on `:0`, the counted condition (Still running, below).

### arm64 at 2x, private display (7 runs of 10 blocks: 70 cold and 140 warm per lane; static musl build 8071fc90)

| lane | cancel shape cold/warm | cancel prevented cold/warm | in-front false ok cold/warm |
|---|---|---|---|
| cua (off) | 50/70 (27 after the release), 48/140 | – | 2/70, 5/140 |
| p300 | 4/70, 6/140 | 52, 79 | 1/70, 5/140 |
| p350 | 1/70, 2/140 (dragstarts at +417 and +423) | 49, 96 | 5/70, 9/140 |
| r150 | 4/70, 4/140 (dragstarts to +460) | 42, 88 | 0/70, 7/140 |

The in-front dragstart after the press, over all 210 samples per lane (`infront_false_oks.py`):

| lane | p50 / p90 / p95 / p99 / max (ms) | > 300 | > 350 | > 450 | > 600 |
|---|---|---:|---:|---:|---:|
| cua (off) | 13.7 / 217.9 / 270.4 / 510.5 / 570.0 | 9 | 7 | 5 | 0 |
| p300 | 12.9 / 204.0 / 222.8 / 452.0 / 470.2 | 6 | 6 | 3 | 0 |
| p350 | 17.6 / 212.0 / 395.6 / 526.4 / 582.3 | 13 | 13 | 7 | 0 |
| r150 | 12.3 / 205.8 / 236.2 / 419.7 / 471.5 | 8 | 8 | 2 | 0 |

- Every in-front false ok, in every lane, had no take at all: neither the press hold nor the final hold saw one. Each
  sample's dragstart came after the release.
- None had a take inside the hold.
- p350's higher count is the same tail drawn more often: 13 vs 7 of 210 is about p 0.25, and p300 sits below off. It is
  not an effect of the hold.
- At arm64 2x the tail reaches press + about 580 ms.
- A correction: `after_release.confirmed_by` is the confirmation route the engine chose at the drag's start, not an
  observed activation request. The rows record nothing the watch saw after a no-take release.

### The cost: D1 (Chrome) and D2 (Electron), x64 idle, warm medians, judged as the steps judge `cua`

| cell | off | p300 | p350 | r150 | pinned / newest |
|---|---:|---:|---:|---:|---|
| Chrome select / range | 129 | 304 | 354 | 280 | 459 / 321 |
| Chrome scroller | 63 | 304 | 354 | 213 | 279 / 263 |
| Chrome canvas (speed-judged) | 476 | 476 | 476 | 627 **FAIL** [111.5, 116.7] vs newest's 512 | 1159 / 512 |
| Chrome dnd (takes) | 369 | 368 | 370 | 366 | #358's declared gap on every lane |
| Electron select / range / scroller | 256 | 306 | 356 | 406 | 455 / 322; 279 / 263 |
| Electron dnd | 402 | 402 | 405 | 404 | 511 / 339 |
| Electron canvas (not speed-judged) | 478 | 479 | 479 | 628 | 1158 / 512 |

- Every press-anchored lane passes D1 and D2. r150 fails Chrome's canvas speed.
- Select, range and scroller are judged on landing alone. So p400 and p450 stay cheap by these judges: Chrome's canvas
  (476 ms) is longer than either bound.
- arm64's cost cells are queued (Still running, below).

### The AT-SPI drag-source probe (the controller's narrower-trigger question)

Not clean.
- Method: drag.html on an x64 private display; an in-process hit test from the frame, then GetState and GetAttributes;
  30 repeats per point.
- Chrome:
  - select reads `static`, range `slider`, scroller `section`, canvas `canvas`;
  - the `draggable` dnd source reads `panel`, with no draggable attribute.
- Electron reads every point, sources included, as one `panel` with no attributes.
- Task 68's stored rows: a draggable span and a link's text read `static` (as selection text does), a draggable child of
  a slider reads `slider`, and a draggable canvas reads `canvas`. All of them took.
- The in-process hit test costs 1.0–2.1 ms p50 and 1.1–2.6 ms p95; through busctl, 40–60 ms.
- Output: `x64/srcprobe-2/`.

### The Chrome xtrace probe (x64 2x, cancel cell, 0.4.1; stopped after its controls run, as ruled)

- Under the proxy, 84 of 87 cancel samples were the shape. 3 had no dragstart, and none was refused as cancelled.
- **In every shape sample, Chrome took `XdndSelection` after the release, +335 to +973 ms**: CreateWindow, XdndAware,
  SetSelectionOwner and XIGrabDevice. The drag ended about 10 ms later, with no drop.
- The proxy delays Chrome's ButtonRelease, so its browser still thinks the button is down and starts the drag. That turns
  the refusal path into a late-take path, so the probe cannot show what the unproxied refusal emits.
- The controls (D1's select and canvas under the same proxy) are appended below if their run finished in time.
- Nothing from the trace reached disk beyond names, ids, counts and times.

### Side finding: the late-take watch's 300 ms

- After a no-take release, the engine watches for a late take only through `dnd::SETTLE` = 300 ms.
- Under the proxy Chrome took at +335 to +973 ms, and the watch saw none of those takes. Here they were harmless: the
  drags ended without a drop.
- Any regime where the browser sees the release late can start a drag after the watch has ended.

## Recommendation

- **x64 at 2x, and arm64 idle:** p350 (the press anchor at 350 ms) removes the cancel cell's shape entirely in x64 (0 of
  81).
  - Its cost is latency on select, range and scroller only: about +225 ms on Chrome and +100 ms on Electron. It passes
    every D1 and D2 judge.
  - p400 and p450 also read 0 at x64 2x and stay cheap by the judges.
- **arm64 at 2x:** no measured bound is enough. The renderer's dragstart reaches press + about 580 ms, and p350 leaves the
  in-front residue unchanged.
  - p450 and p600 are queued to show where the tail ends.
  - p600 would cost about +470 ms on short Chrome drags.
- **So:** ship (i) with the press anchor at 350–450 ms, which prevents most of the shape but not arm64 2x's tail, combined
  with (ii)'s notice on every Chromium-source drag that ends with no take. For the tail, (ii)'s notice is the only honest
  answer.
- The release anchor (r150) is dominated: it fails Chrome's canvas speed and catches less.

## Decisions made

- **Two anchors, one mechanism.** The brief's "after the final move" was built as `release`: the bound counts from where
  0.4.1 would release, which is how the brief's "adds its full length" reads. The controller made `press` the primary.
  Both are one code path through `HoldFrom::deadline`.
- **No motion during the final hold**, so the route is otherwise unchanged. The background route's refreshes stay the
  press hold's.
- **Guarded drags hold before the release dwell**, so the existing last look does the cancel.
- **The handle holds at the top of `release_handle`**, so a take then gets the settle. It also applies to the idle and
  exit releases, which go through the same function.
- **The baseline lane on arm64 is the candidate with the flag off**, because variants need one binary. x64's baselines
  and arm's idle baseline used the released 0.4.1 asset.
- **The static musl build on arm64**, after a glibc build's run met wrap71's autobind flag (cleared under 730(b)).
- **Idle on `:0`, 2x on a private display**, because run71 refuses a running load. The two loads ran on different display
  types.

## Discoveries

- x64 at 2x reproduces the shape strongly (36/52 cold), unlike x64 idle (0/156).
- The device runner's in-run judge binds premise evidence by slot without the lane. So variant lanes make the `cua`
  lane's cancel verdict FAIL with "sidecar lines for 0/0". My tables classify per sample instead.
- `confirmed_by` in `after_release` is a route, not an observation.
- Killing a chain's `locked.sh` releases the host lock under a run that is still going (my slip on arm64, base-1).
- Back-to-back loaded runs raced on the previous run's stress-ng workers. `private-run.mjs` now waits up to 20 s.

## Concerns

- **`live_device` fails intermittently with the five new tests present.**
  - CI went RED twice. Locally, 6 of 12 full runs failed, each time in a different untouched test: the popup focus test,
    the exit stats line, and three `ConnectionReset`s at a probe's X connect.
  - Skipping any one of the new tests made 6 of 6 runs pass.
  - The stacking cleanup fixed the popup case locally, but not on CI.
  - Xvfb's log shows nothing, and the peak was 14 X connections. Not root-caused.
  - The promotion task should move these tests to their own binary, or find the shared-state leak, before 0.4.2.
- Two early batches passed a relative engine path and refused at once. No input was sent; they are kept as `stopped-*`.

## Still running or queued (left running, as instructed)

arm64 (`ssh cua-171-arm64`, holder `m5-hold042`, dir `~/.local/share/cua-171/task113/arm64/`, log `chain.log`):
1. **The main chain** (`scripts/arm-chain.sh`; find it on the VM with `pgrep -f "bash scripts/arm-chain.sh"`): the `:0`
   idle block, `v5-zero-1` … `v5-zero-8`.
   - Lanes cua-off, p300, p350 and r150, 10 blocks each, through sitting.mjs and run71.sh under wrap71.
   - A hold-sittings stop ends the chain after the run that wrote it. Send that run's `flags.jsonl` to the controller.
2. **Queued after it** (a waiter loop): `BLOCKS=10 scripts/arm-chain2.sh … load-b1 load-b2 load-b3 cost`.
   - `v5-load-b1..b3`: 2x, private display, lanes cua-off, p450 and p600.
   - `cost-chrome-a/b` and `cost-electron-a/b`: D1 and D2 at idle, lanes cua and p350 (a), p450 (b).
3. **Not queued:** the `load-3` refill (`stopped2-v5-load-3` was the refused one), if 80 blocks are wanted.

x64:
- `xtrace-controls-1` (`~/.local/share/cua-171/task113/x64/`, holder m5-hold042), if still running; after it, nothing.
- Remove `x64/*.xt.jsonl` when done; cancel-1's trace is 154 MB.
- The worktree's `native/linux-engine/target` holds the one target dir (several GB). Delete it once the promotion task no
  longer needs it.

The analysis scripts are in `~/.local/share/cua-171/task113/scripts/` and here in `scripts/`:
- **V5 cells**, one condition at a time: `python3 -I analyze_v5.py <run>/run/results.jsonl...`. For example, on arm64:
  `cd ~/.local/share/cua-171/task113/arm64 && python3 -I ../scripts/analyze_v5.py v5-zero-*/run/results.jsonl`.
- **The in-front tail and false oks:** `python3 -I infront_false_oks.py <results.jsonl>...`.
- **The cost cells:** `node analyze_cost.mjs <checkout> <cost-*/run/results.jsonl>...`.
- **The xtrace probe:**
  `python3 -I analyze_xtrace.py --cancel x64/xtrace-cancel-1/run/results.jsonl x64/xtrace-cancel-1.xt.jsonl --controls x64/xtrace-controls-1/run/results.jsonl <its engine-stats dir> x64/xtrace-controls-1.xt.jsonl`.

## Addendum at return: arm64 `:0` idle, first run (v5-zero-1, 10 blocks, all-clear: clear)

- Cancel cell: off 1/10 cold (dragstart at +186, 32 ms after the release), 0/20 warm. p300, p350 and r150 0/10 and
  0/20. The final hold caught one take each in p300 and r150 (+222 ms after the press) and cancelled it.
- In front: every lane 30/30 dropped, no false ok.
- `v5-zero-2` started at 18:49:10Z. `xtrace-controls-1` was still running on x64 at return, unanalysed.

## Task 114: the finished chains

Task 114 watched task 113's chains to their end and ran task 113's analysis scripts on them. No new measurement was made
and nothing was restarted. Every run is under `locked.sh m5-hold042`. All numbers are from `analyze_v5.py`,
`infront_false_oks.py`, `analyze_cost.mjs` and `analyze_xtrace.py` on the runs' own `results.jsonl`.

### arm64 `:0` idle, v5-zero-1 … v5-zero-8 (static musl build 8071fc90; 80 cold and 160 warm per lane per cell)

All eight runs ended with all-clear "clear"; no hold-sittings stop. Zero-1 is the run in the addendum above.

Cancel cell (`chrome_dnd_shared`):

| lane | shape cold / warm | prevented cold / warm | cancelled cold / warm | plain ok, no dragstart |
|---|---|---|---|---:|
| cua (off) | 16/80 (all late), 0/160 | – | 64, 160 | 0 |
| p300 | 0/80, 0/160 | 7, 0 | 80, 160 | 0 |
| p350 | 0/80, 0/160 | 8, 0 | 80, 160 | 0 |
| r150 | 0/80, 0/160 | 9, 0 | 80, 160 | 0 |

- The off lane's shape is cold only: 1, 3, 1, 2, 2, 2, 3, 2 samples per run, zero-1 to zero-8.
- The 16 off-lane shapes' dragstart came +213.6 to +221.3 ms after the press (p50 216.1, p90 221.2), and 28 to 67 ms
  after the release.
- The hold lanes' takes came +184.7 to +227.8 ms after the press (p300 188.8–227.8, p350 184.7–223.8,
  r150 186.7–225.8), and each was cancelled.
- Cold median ms: off 349.8, p300 326.9, p350 370.2, r150 327.0. Warm about 348 on every lane.

In front (`chrome_dnd_short_in_front_shared`): **0 false oks in every lane**, cold and warm (80/80 and 160/160 dropped
per lane). The dragstart after the press, over all 240 samples per lane:

| lane | p50 / p90 / p95 / p99 / max (ms) | > 300 | > 350 | > 450 | > 600 |
|---|---|---:|---:|---:|---:|
| cua (off) | 143.5 / 150.4 / 181.1 / 217.4 / 223.9 | 0 | 0 | 0 | 0 |
| p300 | 144.1 / 148.7 / 151.7 / 219.2 / 222.6 | 0 | 0 | 0 | 0 |
| p350 | 144.4 / 149.5 / 152.9 / 216.5 / 218.7 | 0 | 0 | 0 | 0 |
| r150 | 144.3 / 151.5 / 186.0 / 218.7 / 221.8 | 0 | 0 | 0 | 0 |

So on `:0` idle the renderer's dragstart sits within press + 224 ms in every sample: no tail in 960 in-front samples.

### arm64 at 2x, private display, v5-load-b1 … b3 (lanes cua-off, p450, p600; 30 cold and 60 warm per lane)

Cancel cell, cold / warm:

| lane | shape (late after the release) | prevented | plain ok, no dragstart | cancelled |
|---|---|---|---|---|
| cua (off) | 22/30 (13), 19/60 (11) | – | 1, 2 | 7, 12 |
| p450 | 0/30, 0/60 | 19, 38 | 1, 5 | 29, 55 |
| p600 | 0/30, 0/60 | 22, 39 | 2, 3 | 28, 57 |

- The off lane's dragstart after the press: cold p50/p90/max 163.7 / 277.8 / 422.4 ms, warm 184.4 / 276.8 / 399.4.
- The hold lanes' takes came +156 to +322 ms after the press (p450 156.1–295.8, p600 157.5–321.9).
- The plain oks with no dragstart began no drag (ruling 823's unmet premise); they are not the shape.

In front, false oks cold / warm: cua 1/30 and 4/60, p450 1/30 and 0/60, p600 0 and 0. The dragstart after the press over
all 90 samples per lane (so p99 is the max):

| lane | p50 / p90 / p95 / p99 / max (ms) | > 300 | > 350 | > 450 | > 600 |
|---|---|---:|---:|---:|---:|
| cua (off) | 9.5 / 299.8 / 388.4 / 463.3 / 463.3 | 8 | 5 | 1 | 0 |
| p450 | 20.5 / 202.2 / 246.4 / 538.5 / 538.5 | 4 | 4 | 1 | 0 |
| p600 | 11.5 / 203.2 / 381.3 / 561.0 / 561.0 | 5 | 5 | 2 | 0 |

- The tail ends at press + 561 ms in these 90 samples (+582 over the earlier 7-run set); nothing is past 600.
- p450's one in-front false ok: dragstart at +538.5, release at +450.1, the final hold waited 200 ms and saw no take.
- p600's five in-front final-hold takes (warm, +386 to +569 ms) were all caught and dropped.

### arm64 cost cells, idle, warm medians in ms (30 trials; Chrome canvas 40)

Every lane took every sample and passes D1 and D2. Chrome dnd is #358's declared 40 ms gap on every lane, off included
(interval [26.3, 26.6] against newest).

| cell | pinned / newest | cua (off) | p350 | p450 |
|---|---|---:|---:|---:|
| Chrome select | 416.6 / 312.1 | 126.1 | 351.8 | 451.8 |
| Chrome range | 415.7 / 311.7 | 126.2 | 351.8 | 451.8 |
| Chrome scroller | 269.2 / 257.9 | 60.0 | 351.8 | 451.7 |
| Chrome dnd | 480.2 / 328.3 | 354.6 | 354.7 | 354.6 |
| Chrome canvas | 1046.4 / 486.0 | 473.3 | 473.3 | 473.3 |
| Electron select | 416.0 / 311.8 | 253.0 | 352.9 | 452.7 |
| Electron range | 415.4 / 311.5 | 253.2 | 352.9 | 452.8 |
| Electron scroller | 268.9 / 257.8 | 253.0 | 352.9 | 452.6 |
| Electron dnd | 480.2 / 328.3 | 396.2 | 396.1 | 400.4 |
| Electron canvas | 1045.4 / 485.7 | 474.6 | 474.5 | 474.3 |

The hold's cost is on select, range and scroller alone: p350 adds +226 / +226 / +292 ms on Chrome and +100 ms on
Electron; p450 adds +326 / +326 / +392 and +200. Everything else moves by less than 5 ms. `cost-chrome-a` began with the
1-minute load average at 17.3, the decay of the previous 2x run's stress-ng; no stress-ng process was left.

### x64 xtrace controls (xtrace-controls-1: D1's select and canvas under the same proxy, 2x, 40 trials)

The controls tell whether the cancel cell's late take is the proxy's doing. They took pinned 40/40 and cua 40/40 on both
kinds (verdict PASS). Over the cancel cell's 84 shape samples and the 80 control samples, with the analysis window at
release + 1200 ms (`AFTER_MS` in `analyze_xtrace.py` is 600, which shows these in only half the shape samples, because
the takes land at +335 to +973 ms):

| key after the release | shape (84) | no-start (3) | controls (80) |
|---|---|---|---|
| CreateWindow, XdndAware, XdndActionList, MapWindow | 84 (100%), median +591 to +600 ms | 0 | 0 |
| SetSelectionOwner[XdndSelection], XIGrabDevice | 84 (100%), +600 | 0 | 0 |
| DestroyWindow, DeleteProperty[XdndActionList] | 84 (100%), +648 / +650 | 0 | 0 |
| GetProperty[XdndAware] (a peer probing) | 16 (19%), +688 | 0 | 0 |
| UngrabPointer | 84 (100%), +591 | 3 (100%), +531 | 44 (55%), +1 |

So the late `XdndSelection` take is in every shape sample and absent from every control: the proxy's delayed
ButtonRelease alone does not make Chrome take a selection on a select or canvas drag. The take belongs to the draggable
source. The proxy still delays the release, so the trace does not show what the unproxied refusal emits (task 113's
caveat stands).

### Cleanup

- `x64/*.xt.jsonl` removed (cancel-1's was 154 MB).
- The x64 worktree's `native/linux-engine/target` is left for the promotion task.
