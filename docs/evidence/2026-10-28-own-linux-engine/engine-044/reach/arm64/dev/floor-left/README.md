# Development, not counted: Chrome t14-floor `left` ×100 on 0.4.4, arm64, twice the load (ruling 1140)

This is a development measurement that sizes a ticket and gates nothing.
- **When and where:** 2026-11-23 11:43–11:49Z on the arm64 VM, on a private display, holder `h9-arm64`.
- **The engine:** the pinned linux-engine-v0.4.4 from `home-arm64-044` (sha256 f54b2aeb…da3e).
- **The harness:** task 132's (`../../scripts/dev.sh` and `t132-run.mjs` → `t132-alternate.mjs`, with
  `--engine-stats`), so every row carries its `release_sync` record.
- **The checkout:** `t147-dev`, which is H9 cd03a47b plus two VM-local commits, never pushed:
  - task 132's plans (4a090228);
  - the plan `t147-left` = `[['cua', 'left', 25]]` (c4b8b764, `../../scripts/add-left-plan.py`).
- **The set:** 4 rounds of 25 drags, one lane (`h9`).

**Files**
- `rows-table.md`: every row, plus the cross-tab, written by `../../scripts/t147-left-table.mjs`.
- `rows.jsonl.gz`: the same rows as JSON.
- `tables.md`: task 132's `t132-tables.mjs`, judged as t14-floor.
- `h9/r*/run/`: the raw rows, the engine's `--stats` lines and each run's summary.

**Result: 2 false oks in 100** (r2 #3 and r2 #13), 98 honest unconfirmed, 0 landed, 0 stale and 0 untaken. Every row
joined its `--stats` line.

| outcome \ visits_dropped | 0 | 1 | 2 | all |
|---|---:|---:|---:|---:|
| false ok | 1 | 1 | 0 | 2 |
| honest | 92 | 2 | 4 | 98 |
| all | 93 | 3 | 4 | 100 |

- **Not every false ok had a dropped visit.** r2 #13 ran both visits (`motions` 2, `visits_dropped` 0). r2 #3 dropped
  one (`motions` 1, `visits_dropped` 1).
- **Seven rows dropped a visit.** Six of them stayed honest, each with Chrome's leave shown. The seventh is r2 #3,
  the false ok.
- **By schedule:** in floor, 47 honest and 2 false oks. After the path, 51 honest.
- **The leave decides it in this set.** Chrome's no-drop cursor appeared after its accept and before the release on
  98 of 98 honest rows. On neither false ok did it appear.

**The two false oks** (times in ms after the press):

| # | take | floor_until_ms | last step after the take (vs floor_until) | release (after the take) | schedule | motions | visits_dropped | skipped | past_floor_ms | added ms | accept shown | activation after the release | leave seen |
|---|---:|---:|---|---|---|---:|---:|---|---:|---:|---:|---:|---|
| r2 #3 | 23.0 | 326 | 334.8 (+8.8) | 374.0 (351.0) | in_floor | 1 | 1 | false | 0.1 | 15.3 | 84.5 | 2.0 | no |
| r2 #13 | 34.0 | 326 | 333.2 (+7.2) | 387.1 (353.1) | in_floor | 2 | 0 | false | 0.1 | 16.8 | 106.1 | 0.0 | no |

What the two rows have in common:
- The page's dragend reported effect 1, but the zone counted no drop.
- The engine confirmed the drop by `Activation`.
- Chrome's cursor stayed the accept from about 85–106 ms until the drag-end image after the release.

This is the same shape as L4d's #28 at H9 (`../../out/l4d-left.md`): an in-floor drag whose path ran past
`floor_until_ms`, with Chrome's status never updated past the zone.

**Overruns alone don't produce it.** Eleven other in-floor rows also ran the path past `floor_until_ms` by more than
0.5 ms (0.8–24.0). On all of them Chrome showed the leave, and all answered honest.
