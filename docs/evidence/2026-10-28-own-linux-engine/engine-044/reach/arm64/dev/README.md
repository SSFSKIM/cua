# Development, not counted: the measurements after L4d (ruling 1140)

These are development runs on the arm64 VM, 2026-11-23 11:32–11:49Z. Each ran once, on a private display, under the
VM's lock (holder `h9-arm64`), with the pinned linux-engine-v0.4.4 from `home-arm64-044` (sha256 f54b2aeb…da3e).
Before each set, hold-sittings was absent and the disk had 98G free.

The chain is `../scripts/chain-1140.sh`, and its log is `chain-1140.log.txt`. Each set's queue and end lines are in
`dev.log.txt`. None of the three waited for a quiet machine: each set brings its own load, as task 132's did.

## Item 3: Chrome `drag_handle` long-left ×100 at twice the load (`handle-long/`)

- **The command** is task 132's handle-final line with this head's engine: `dev.sh handle-long chrome
  t132-handle-long 4 25 2 h9=<pinned 0.4.4> off=<off-044>@8`.
- **The checkout** is t147-dev (H9 plus task 132's plans, VM-local commit 4a090228).
- **The control** is `off`, the same binary with `--drag-dnd-release-sync off`.
- The tables are `handle-long/tables.md` (task 132's `t132-tables.mjs`, judged as none).

| lane | n | false ok | stale | honest unconfirmed | Chrome activated after the release | ended on the no-drop image / accept / other |
|---|---:|---:|---:|---:|---:|---|
| h9 (0.4.4) | 100 | **0** | **0** | 100 | 0 | 99 / 0 / 1 |
| off | 32 | 0 | 0 | 32 | 0 | 31 / 0 / 1 |

**The bar is met:** 0 false oks and 0 stale drops.

The tail (`--stats` `handle.release_sync`):

| lane | tail ran | motions | interrupted_unconfirmed | stopped_for_motion | late-take rows | added ms p50 / p95 / max |
|---|---|---|---|---|---:|---|
| h9 | 100 / 100 | 4 on every drag | 0 of 100 | 0 of 100 | 0 | 22.1 / 27.0 / 31.1 |
| off | 0 / 32 ("the form is off") | – | 0 of 32 | 0 of 32 | 0 | – |

Task 132's final 0.4.3 head (ba5b0438) gave 0 in 100 with +20.6 / 26.1 / 30.0 ms.

## Item 4: `t487-named` ×30 at twice the load (`t487-named/`)

- **The command** is task 142's `private-run.mjs`, run from t147-h9 (H9, read only), with `--plan t487-named --trials
  30 --load-factor 2`.
- The launcher is `../scripts/t487.sh`. The run exited 0 and was clean.
- The table, as the plan's judge printed it (`t487-named/run/summary.md`):

| drops | drags | landed | false ok | stale drops | honest unconfirmed | ambiguous | error |
|---|---:|---:|---:|---:|---:|---:|---:|
| exercised | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| not exercised | 30 | 0 | 30 | 0 | 0 | 0 | 0 |

- **Why none was exercised.** The judge's line is "Not exercised, by the proof missing: electron 0, pacing 0, route 0,
  press 0, start 30, settle 30. The settles' rest_ms: no settle."
  - Every drop was paced as GTK 4 with rest 0, took the foreground route, and had Electron's press.
  - Electron's page started no drag on any of them: the late-take table shows took 0 of 30.
  - So no settle ran.
- **What the 30 false oks are.** They are T17's count for untaken plain drags that answered ok, as in task 142's
  pilot. None is a drop that began.
- **The bar is met:** 0 drops where a drag and drop began and the drop answered ok unsettled, because no drag and drop
  began.
- **Ruling 1113's expectation holds:** every row is not exercised.

## The t14-floor `left` measurement ×100 (`floor-left/`)

See `floor-left/README.md`. It found 2 false oks in 100, both in floor and both without Chrome's leave shown. Only one
of them had a dropped visit.
