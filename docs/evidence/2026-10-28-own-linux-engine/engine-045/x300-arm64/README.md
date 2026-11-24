# linux-engine 0.4.5's t14-floor `left` ×300 at arm64 twice the load (task 160; rulings 1142, 1193, 1194)

**This is a development measurement, #512's acceptance:** 0 false oks in 300 are required.
- **When and where:** the arm VM `dc-linux171arm-996d`, 2026-11-24 04:28–04:47Z, on a private display of its own,
  never `:0`. No Chrome was signalled.
- **Result: 0 false oks in 300.** All 300 were honest, each answered with the unconfirmed-drop notice, and every row
  carries the new `release_sync` fields.

## The candidate and the harness

**The candidate** is the arm64 asset of linux-engine.yml run 45321559071 (publish=false, workflow_dispatch, head
e85ebd379, success), `cua-engine-0.4.5-linux-arm64`.
- Its sha256 `c04ffe7eb1d28b1e38f88bdcb5854c214b39c60a55f6474b34d4c49ff40130fa` equals the brief's sum and the run's
  SHA256SUMS.
- It reads `cua-engine 0.4.5 (e85ebd3798ea)` and is a static aarch64 build.
- It is placed in a run-owned home, `task160/home-arm64-045c/engine/linux/cua-engine`, as task 132 placed its
  candidates. `CUA_HOME` is the pinned `home-arm64-044`, as task 147's ×100 ran it.

**The harness** is task 147's (`scripts/run.sh`, `t132-run.mjs` → `t132-alternate.mjs`, with `--engine-stats`).
- **The checkout** is `t160-e045`, a fresh VM worktree detached and clean at e85ebd379. It has a real `npm ci`, the
  Electron binary present (v44.9.0) and xprobe built (`scripts/setup-all.sh`, `setup-e045.log.txt`).
- **One VM-local commit**, never pushed, adds task 147's plan `t147-left` = `[['cua', 'left', 25]]`
  (`scripts/add-left-plan.py`).
- **The set** is 12 rounds of 25, one lane `e045`, `--load-factor 2` (16 stress-ng workers on the VM's 8 cores).
- **The lock:** `locked.sh t160 timeout -s TERM -k 60 90m …` (`scripts/lock-lines.txt`). hold-sittings was absent
  and the disk had 95G free.
- The run exited 0, and none of its 12 runs failed its verdict. The load at the end was 17.11 16.73 11.96.

## The fields check, before counting

300 of 300 rows carry a top-level `release_sync` (item 4) with `overran`, `last_step_after_take_ms` and
`unconfirmed`. No row is missing any of them, and every row also joined its `--stats` line.

## The count (`x300/t160-table.md`; judged as task 147 judged: `chromeDropVerdict`, plan t14-floor, row by row)

| landed | stale | **false ok** | honest | untaken |
|---:|---:|---:|---:|---:|
| 0 | 0 | **0** | 300 | 0 |

- All 300 honest rows carry the unconfirmed-drop notice. `release_sync.unconfirmed` is null on 300 of 300: no visit
  was dropped, so item 2 never fired.
- The harness judge per lane gives "no fail" (`x300/tables.md`).
- **Chrome's side:**
  - Chrome activated after the release on 0 of 300.
  - All 300 ended on the no-drop image.
  - The leave was seen before the release on 299 of 300. The one that wasn't, r0 #16, stayed honest with no
    activation.

**Schedule and visits_dropped:**

| schedule \ visits_dropped | 0 | 1 | 2 | all |
|---|---:|---:|---:|---:|
| in_floor | 123 | 0 | 0 | 123 |
| after_path | 177 | 0 | 0 | 177 |

**Overran: 177 of 300** (`x300/t160-moved.md`). The after_path rows are exactly the overran ones:
- 142 with the gate open, every one of which overran;
- 35 with the gate shut, which are **item 1's rows**: an in-floor path whose last step went out after floor_until, now
  on the after-path tail.

The overran rows' `last_step_after_take_ms`, against `floor_until_ms` 326:

| rows | n | past floor_until: min / p50 / p95 / max (ms) |
|---|---:|---|
| all overran | 177 | 0.1 / 110.7 / 360.0 / 598.0 |
| item 1's (gate shut) | 35 | 0.1 / 6.0 / 21.5 / 24.0 |

Across all 177, by how far past floor_until: 0–1 ms 4, 1–5 ms 13, 5–10 ms 8, 10–25 ms 11, 25–50 ms 17, over 50 ms 124.
- Item 1's 35 rows each ran the tail with 2 motions. They added 28.0 / 31.1 ms (p50 / p95).
- On the 123 in-floor rows, the last step was at or before floor_until on all of them.

**The engine's `overran` against the row's own path end** (`hold.path_ms` less the take, more than 1 ms past
floor_until): they agree on 295 of 300. The 5 others sit within 3 ms of floor_until:
- 4 rows overran by 0.1–0.8 ms, which the engine's rule ("by any margin") counts.
- 1 row's last sample went out at 324.9 ms, while the keepalive took `hold.path_ms` to 327.1.

Two more in-floor rows, r6 #0 and r11 #0, have `last_step_after_take_ms` 2.1–2.3 ms before the keepalive's end. That
is the same difference, the last sample against the keepalive's end.

**Latency, p50 / p95 ms, against task 147's 0.4.4 ×100.** On 0.4.4 a row counts as overran when its path ended more
than 1 ms past floor_until. "Answer" is the drag's reply time, and "release" is after the press:

| rows | 0.4.5 n | 0.4.5 answer | 0.4.5 release | 0.4.4 n | 0.4.4 answer | 0.4.4 release |
|---|---:|---|---|---:|---|---|
| all | 300 | 503.0 / 828.8 | 399.2 / 718.2 | 100 | 512.5 / 822.3 | 409.1 / 725.0 |
| overran | 177 | 577.0 / 868.0 | 494.0 / 746.4 | 63 | 561.8 / 835.9 | 511.6 / 736.4 |
| not overran | 123 | 451.7 / 518.4 | 378.1 / 396.0 | 37 | 461.9 / 517.7 | 379.1 / 393.1 |

On the rows item 1 moved, the release came later than 0.4.4's matching rows, while the answer was not slower:
- 0.4.5's item 1 rows (35): release after the take 360.8 / 378.4, answer 434.7 / 516.4.
- 0.4.4's shut rows that overran (12): release after the take 352.9 / 353.9, answer 453.8 / 511.4.
- So the release moved by about +8 ms at the median and +25 ms at p95.

**False oks: none**, so there is no row to show.

## Files

- `x300/`: the set as the harness wrote it:
  - `e045/r0`–`r11/run/` (rows, the engine's `--stats` lines, summaries), `t132.jsonl`, `result.json` and the display's
    logs;
  - the analyses: `t160-table.md`, `t160-moved.md`, `tables.md` (task 132's) and `rows-table.md` (task 147's per-row
    table).
- `scripts/`: the setup, the plan, the run, the analysis scripts, the copy, the scans and the lock lines.

**Scans:** 125 files, with 0 token-shaped strings, 0 held-code rows and 0 raw minimized codes (`scripts/scan-token.txt`,
`privacy-scan.txt`). No `:0` title list was read, since nothing connected to any `:0`.
