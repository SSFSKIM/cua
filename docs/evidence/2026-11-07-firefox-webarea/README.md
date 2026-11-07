# #312: Firefox's first screenshot had a zero-size web area (hosted macOS, 2026-11-07)

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42394416982. Kit `probe/287-hosted` at da12c3e3, group `ab312`. The kit stays off main.

**Setup:** main 51b473fc (A) against the fix, 93c2b208 (B).
- 2 reps, fresh launches only.
- Each head ran in its own engine process, and the head order alternated by rep.
- Both reps ran on the 20261102 image: macOS 26.7.2, Firefox 159.0. Firefox 158.0.1, on the older image, went unmeasured.

Per-job results are under `~/.local/share/probe-287/run-42394416982/` on the MacBook. The reader is `scripts/probe-287/offline/ab312.mjs` on the kit branch.

## #282's page cells, clicked from the first screenshot

| Cell | A (main) | B (fix) |
|---|---|---|
| shared checkbox, Apply, textarea, and the checkbox clicked at once | refused, `interactiveHit`, 8/8 | `clickUnconfirmed` (Gecko refuses first mouse; #315), 8/8 |
| dedicated textarea | refused, `interactiveHit`, 2/2 | delivered: pointer 1/1, focused, 2/2 |
| dedicated checkbox | refused, `interactiveHit`, 2/2 | delivered: changed once, 2/2 |
| dedicated Apply | refused, `interactiveHit`, 2/2 | delivered: once, 2/2 |

## The first observation

| | A | B |
|---|---|---|
| printed web-area frame | 0,0,0×0 in 18/18 | 400,104,620×604–607 in 18/18 |
| `clipReread` | absent | `real` in 18/18 (22/22 counting the recon pages) |
| `clipRereadMs` | – | 719–955 ms |
| `totalMs`, median | about 262 ms | about 1,125 ms |

- B minus A on `totalMs` is about +860 ms, nearly all of it the wait to the 1 s point.
- **Superseded:** ruling 9d97e82a replaced the single re-read at the 1 s point with a poll every 100 ms, up to the same bound. The poll stops at the first real frame, so the +860 ms above is the first build's cost, not the fix's. The poll's numbers are below.
- `unplaced` never occurred, so the fallback path went unexercised live.
- The second observation carries none of the keys on B, in 22 of 22, and its frame is real on A too.

## Controls on B, first observation

Chrome for Testing, stable Chrome and Safari carried none of the keys, 6 of 6. Their `totalMs` stayed within noise:

| Browser | A, per rep | B, per rep |
|---|---|---|
| Chrome for Testing | 412 / 455 ms | 428 / 446 ms |
| stable Chrome | 335 / 424 ms | 293 / 290 ms |
| Safari | 574 / 354 ms | 381 / 356 ms |

## The poll (ruling 9d97e82a)

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42398170213 (kit 5c9880d4). The fix at 2fda5e7f against main 51b473fc, 2 reps, Firefox 159.0 (158.0.1 again not offered).

| | A | B (poll) |
|---|---|---|
| `clipReread` | absent | `real` in 18/18 |
| `clipRereadReads` | – | 1 in 18/18 |
| `clipRereadMs` | – | 103–281 ms, median about 155 |
| `totalMs`, median | about 211 ms | about 266 ms |

- B minus A on `totalMs` is about +55 ms at the median, against +860 ms with the single read at the 1 s point.
- The page cells are as in the first run: A refuses all 14 as `interactiveHit`. B answers the 8 shared ones `clickUnconfirmed` and delivers the 6 dedicated ones.
- The second observation and the controls (Chrome for Testing, stable Chrome and Safari) carry none of the four keys.
- The frame was real at the first poll every time, so the multi-read and unplaced paths went unexercised live.
