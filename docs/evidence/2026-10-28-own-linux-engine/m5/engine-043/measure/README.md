# The linux-engine 0.4.3 candidate measured (task 132)

## The candidate and the harness

The candidate is `origin/m5-engine-043` at f9d1f86b, built as a static musl release binary on each host. These are
development builds, never released.
- arm64 `cua-engine-043-arm64-f9d1f86b`, sha256 `b6e906df2435c6daa9326cfd4713512f9a8798f67015d4d88cc4d8c7a457a5f3`.
- x64 `cua-engine-043-x64-f9d1f86b`, sha256 `e65b74d6b618b84e4845db37e0cd762406ddd5ad890f5ffc0ccdb14cc01afa26`.
- Both read `cua-engine 0.4.3 (f9d1f86b55ff)`, and each sits in a run-owned home (`task132/home-<arch>-043/engine/linux/`).

Every run here is a development run, never counted:
- each ran on a private display (never `:0`) under its host's lock (`task132-arm64`, `task132-x64`);
- each lock was released between sets;
- hold-sittings and the disk (more than 20G free) were checked before every set.

**The harness is H7.1's.**
- On arm64 it is the checkout `t132-h71` at f9d1f86b, whose `scripts/` equal 96fa1fd3's. VM-local commits, never
  pushed, add development plans (`scripts/add-plans.py`, `add-plans2.py`):
  - `t132-floor-q`: a quarter of t14-floor at the brief's counts;
  - `t132-handle-long`: Chrome's long-left as `drag_handle` steps;
  - `t132-handle-q`: the handle cells for the handle tail (ruling 1026).
- On x64 it is task 129's H7.1 checkout `t129-x64` (96fa1fd3, clean), read only.

**How rows are classed.** `scripts/t132-tables.mjs` runs H7.1's own `chromeDropVerdict` on each row alone (ruling 957's
stale-position judge with 961's 3 px margin). It joins each row to the engine's `--stats` `release_sync` record.
Chrome's activation after the release and the cursor image before the drag-end cursor are task 130's readings.

**The control lane** is the pinned 0.4.2 (`25035ca1…092f`), interleaved round by round.

## 1. t14-long (long-left) at arm64 twice the load (`arm64/long-a`, `arm64/long-b`)

| set | lane | n | false ok | stale | activated after the release | ended on the no-drop image | gate open | added ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|
| long-a | candidate | 100 | 0 | 0 | 0 | 100 | 100 | 25.9 / 31.1 / 32.1 |
| long-a | 0.4.2 | 50 | 4 | 3 | 7 | 40 | – | – |
| long-b | candidate | 100 | 0 | 0 | 0 | 100 | 100 | 25.7 / 32.0 / 32.1 |
| long-b | 0.4.2 | 50 | 5 | 3 | 8 | 41 | – | – |

Every candidate drag ran the tail after the path: 2 motions, 0 visits dropped.

**The release notes' bound** is the exact one-sided 95% upper bound for 0 in n, 1 − 0.05^(1/n):
- candidate only: **no false ok in 200 measured long Chrome drags, 95% upper bound 1.5%** (1.49%);
- pooled with task 130's 200 tail drags on 6d56774d (`m5/p459/tail/arm64/long-{a,b}`): **400, 0.75%** (0.746%).

The pool holds:
- every candidate long-left drag took the same gate-open schedule, after the path, that 6d56774d's tail runs (8 ms,
  visit, 8, visit, 8, release; background route; 2 motions);
- the cost matches (+25.7–25.9 ms p50 here, 25.6 and 26.0 there);
- the candidate's later changes touch only the gate-shut branch.

## 2. t14-floor at arm64 twice the load (`arm64/floor-a`)

The set ran 4 rounds; the 0.4.2 control ran 8 per cell a round.

| lane | cell | n | landed | false ok | stale | honest | gate open / shut | in-floor | 1 visit dropped / both (skipped) |
|---|---|---:|---:|---:|---:|---:|---|---:|---|
| candidate | plain-long | 300 | 300 | 0 | 0 | 0 | 182 / 118 | 118 | 9 / 2 |
| candidate | left | 100 | 0 | 0 | 0 | 100 unconfirmed | 59 / 41 | 41 | 1 / 3 |
| candidate | inzone-out | 32 | 0 | 0 | 0 | 32 | 0 / 32 | 32 | 0 / 0 |
| 0.4.2 | plain-long / left / inzone-out | 32 each | 32 / 0 / 0 | 0 / 1 / 0 | 0 | – | – | – | – |

- Every in-floor release came 0.1 ms past the floor.
- On the gate-open drags the tail added +25.5 ms p50 / 33.0 max (plain-long).

**Every candidate in-floor row with a visit dropped (ruling 1023):** 15 rows; 11 plain-long, all landed; 4 left, all
honest unconfirmed.

| lane | round | # | cold | cell | class | visits_dropped | skipped | activation after the release (ms) | past_floor_ms |
|---|---|---:|---|---|---|---:|---|---:|---:|
| e043 | r0 | 17 | warm | left | honest unconfirmed | 1 | false | none | 0.1 |
| e043 | r0 | 13 | warm | plain-long | landed | 2 | true | 0.7 | 0.1 |
| e043 | r0 | 21 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r0 | 57 | warm | plain-long | landed | 1 | false | -1.3 | 0.1 |
| e043 | r1 | 0 | cold | plain-long | landed | 2 | true | 1.2 | 0.1 |
| e043 | r1 | 15 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r1 | 19 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r1 | 59 | warm | plain-long | landed | 1 | false | 1.4 | 0.1 |
| e043 | r2 | 3 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r2 | 55 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r2 | 67 | warm | plain-long | landed | 1 | false | 2.0 | 0.1 |
| e043 | r2 | 69 | warm | plain-long | landed | 1 | false | 0.4 | 0.1 |
| e043 | r3 | 6 | warm | plain-long | landed | 1 | false | 1.2 | 0.1 |
| e043 | r3 | 0 | cold | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r3 | 27 | warm | plain-long | landed | 1 | false | 0.0 | 0.1 |

The activation column counts any activation a row recorded, so one comes before the release (−1.3 ms).

## 3. t14-late (`arm64/late-idle`, `arm64/late-2x`)

The harness's own `t14-late` verdict passes at idle and at twice the load: every late take reported (5 and 3), no false
ok, no stale drop, every notice refused once.

The outlasted gate never opened: 0 of 17 drags with a step record at idle, and 0 of 18 at twice the load. Every such
drag took the in-floor tail with 0 visits dropped. Each released 0.1 ms past the floor, except one freeze-652 drag at
twice the load, at 2.4 ms.

## 4. x64 D1, idle, 3 runs (`x64/d1-{a,b,c}`)

The shipped `cua` lane and `cua:off` (`--drag-dnd-release-sync off`) were interleaved.

| run | cua (shipped) | cua:off | shipped: gate shut / in-floor / visits dropped | added ms p50 / p95 / max | answer ms p50 cua / off |
|---|---|---|---|---|---|
| d1-a | [25, 32.4] | [26, 34.1] | 30 / 30 / 0 | 24.0 / 24.0 / 24.1 | 368.4 / 369.9 |
| d1-b | [22.1, 29.5] | [22.2, 31] | 30 / 30 / 0 | 24.0 / 24.0 / 24.1 | 368.1 / 365.9 |
| d1-c | [26.3, 33.9] | [24, 31] | 30 / 30 / 0 | 24.0 / 24.0 / 24.0 | 369.6 / 365.4 |

Every interval is inside #358's 40 ms bound.

## 5. Chrome `drag_handle` long-left ×100 (ruling 998; `arm64/handle-a`): the baseline, 1 in 100

f9d1f86b's handle end is 0.4.2's. On it: **1 false ok and 0 stale in 100** (one-sided 95% upper bound of the rate 4.7%).
- **The false ok is r0 #0, the run's first, cold drag.**
  - The page started the drag and nothing dropped.
  - Chrome activated 3.8 ms after the release, and the reply was a plain ok with nothing pending.
  - Chrome's cursor showed the accept image from 166.6 ms until the drag ended at 248.6 ms.
- **Why.** `release_handle` rests 30 ms, revisits once and releases at once, so Chrome dropped on its stale in-zone
  status: #459's mechanism at the handle end.
- **The other 99** (9 cold) ended on the no-drop image with no activation, and were answered honest unconfirmed.

The stop rule held this row, unrerun. Ruling 1026 gives the handle end the tail.

## 6. Option (c) ON (`arm64/c-a`)

The set ran t14-long at twice the load, 3 rounds of 10 per lane, interleaved.

| lane | flags | n | false ok | stale | answered with the outlasted notice, confirmed_by Outlasted, next request refused | activated after the release |
|---|---|---:|---:|---:|---:|---:|
| c-on | `--drag-dnd-unconfirm-outlasted on` | 30 | 0 | 0 | 30 | 0 |
| c-alone | `--drag-dnd-release-sync off --drag-dnd-unconfirm-outlasted on` | 30 | 0 | 1 | 30 | 1 |

The switch works. c-alone's one stale drop (0.4.2's end) was answered unconfirmed by (c), with the notice on the reply
and on the read.

## 7. The handle end's tail (ruling 1026), on f15e1f09 (`arm64/handle-q`)

The head is f15e1f0965bca25907561e870d5a3b1c1f802193, task 133's.
- **The binary measured** is the arm64 artifact of linux-engine.yml run 44960431400 (publish=false), sha256
  `11693e0a1000c153dda27e278856d394e5c418f7cf7f7a12df9416f5d7f6b2b2`, which equals the sum sent with the head. It
  reads `cua-engine 0.4.3 (f15e1f0965bc)` and sits in `task132/home-arm64-f15e1f09/`.
- **A local build of the same commit** (`scripts/arm-build-new.sh`) gives `569454252949…954f`. The workflow builds
  with `RUSTFLAGS=--remap-path-prefix` for the cargo home, the checkout and the sysroot; the local build doesn't, so its
  bytes carry absolute paths. The f9d1f86b binaries above are local builds for the same reason. Measuring the CI
  artifact measures the bytes that ship.

**Carry-over (1026 (3)).** `git diff --stat f9d1f86b f15e1f09`:

```
 docs/cua-api/linux-engine.md                |   2 +-
 native/linux-engine/README.md               |   7 +-
 native/linux-engine/src/engine/handle.rs    | 240 +++++++++++++++++++++++++++-
 native/linux-engine/tests/live_device.rs    |  74 +++++++++
 test/cua-api/linux-engine-document.test.mjs |   2 +
 5 files changed, 319 insertions(+), 6 deletions(-)
```

`release_sync.rs` and `pointer.rs` are untouched, so items 1–4 and 6, measured on f9d1f86b, carry over to f15e1f09.

**The set.** Plan `t132-handle-q`, 4 rounds at arm64 twice the load. Lanes, interleaved:
- `f15e`: the head as it ships;
- `off`: the same binary with `--drag-dnd-release-sync off`, 0.4.2's handle end, at 8 per cell a round.

| lane | cell | n | landed | false ok | stale | honest unconfirmed | Chrome activated after the release | ended on the no-drop image / accept / other |
|---|---|---:|---:|---:|---:|---:|---:|---|
| f15e | long-left | 100 | 0 | **0** | **0** | 100 | 0 | 99 / 0 / 1 |
| off | long-left | 32 | 0 | 0 | 0 | 32 | 0 | 32 / 0 / 0 |
| f15e | plain-long | 52 | 52 (ok) | 0 | 0 | 0 | 52 | 0 / 50 / 2 |
| off | plain-long | 32 | 32 (ok) | 0 | 0 | 0 | 32 | 1 / 30 / 1 |
| f15e | inzone-out | 32 | 0 | 0 | 0 | 32 | 0 | 11 / 0 / 21 |
| off | inzone-out | 32 | 0 | 0 | 0 | 32 | 0 | 10 / 0 / 22 |

**The handle tail's cost**, from `--stats` `handle.release_sync`:

| lane | cell | tail ran | not run, and why | motions | added ms p50 / p95 / max |
|---|---|---:|---|---|---|
| f15e | long-left | 100 / 100 | – | 4 on every drag (2 visits, each the 1 px step and back) | 19.6 / 22.6 / 26.1 |
| f15e | plain-long | 52 / 52 | – | 4 | 19.4 / 22.1 / 23.1 |
| f15e | inzone-out | 32 / 32 | – | 4 | 16.4 / 21.4 / 24.1 |
| off | every cell | 0 / 96 | 96: "the form is off" | – | – |

No handle in the set was a one-point handle.
- The long-left baseline on f9d1f86b (section 5), whose handle end is 0.4.2's, was 1 false ok in 100.
- On f15e1f09 the result is **0 false oks and 0 stale drops in 100** (one-sided 95% upper bound 3.0%).
- The `off` control's 0 in 32 on long-left is a small sample beside the baseline's 1 in 100.

## 8. Does an XTEST motion to the pointer's own place make an event? (the coordinator's 1029; `arm64/xtest-1029`)

`scripts/xtest-same-place.{py,sh}`:
- **Servers:** a private Xorg (X.Org X Server 1.21.1.11, the dummy driver, no input devices, vendor "The X.Org
  Foundation", release 12101011, XTEST 2.2) on :100, and a private Xvfb 21.1.12 on :100 for comparison. Never :0.
- **The window:** 400×400, under the pointer.
- **Each trial:** XTestFakeMotionEvent to the pointer's exact root position, then a flush, then the events counted for
  200 ms. The control is a 1 px move away and one back, each counted the same way. There are 10 trials per server.

| server | selection counted | same-place motion events, 10 trials | control away / back |
|---|---|---|---|
| Xorg 1.21.1.11 | core MotionNotify (PointerMotionMask) | 1 on every trial, at the pointer's own point | 1 / 1 on every trial |
| Xorg 1.21.1.11 | XI2 XI_Motion (XISelectEvents, all master devices, as Chrome does) | 1 on every trial (core: 0, since XI2 takes the event) | 1 / 1 on every trial |
| Xvfb 21.1.12 | core MotionNotify | 1 on every trial | 1 / 1 |
| Xvfb 21.1.12 | XI2 XI_Motion | 1 on every trial | 1 / 1 |

So on xserver 21.1 an XTEST motion to where the pointer already is still generates one motion event, core and XI2.
Ruling 1001's "no event" does not hold on these servers.
