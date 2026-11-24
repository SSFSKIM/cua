# 0.4.5 t14-floor left: /Users/new/.local/share/cua-171/task160/out/x300

**Fields check:** 300 rows; 300 carry a top-level release_sync with overran, last_step_after_take_ms, unconfirmed; 0 do not.

**Outcomes (out of 300):** landed 0, stale 0, false ok 0, honest 300, untaken 0, ambiguous 0, refused 0.
**Honest, by notice:** unconfirmed drop 300.

**release_sync.unconfirmed, by cause:** null 300.
**unconfirmed against the outcome:** null → honest (unconfirmed drop): 300.

**Overran:** 177 of 300. Their last step after the take less floor_until (ms): min 0.1, p50 110.7, p95 360.0, max 598.0; last_step_after_take_ms p50 / p95 / max 436.7 / 686.0 / 924.0 against floor_until 326.
Overrun bands (ms past floor_until): 0–1: 4, 1–5: 13, 5–10: 8, 10–25: 11, 25–50: 17, 50–: 124.
Consistency: in-floor rows not overran: 123, of them with last step past floor_until 0; overran rows on in_floor 0; rows where last_step_after_take_ms and the row's own path end differ by over 2 ms 3.

The engine's overran against the row's own path end more than 1 ms past floor_until: agree on 295; overran with the path end within 1 ms 4; not overran with the path end more than 1 ms past 1.

| schedule \ visits_dropped | 0 | 1 | 2 | all |
|---|---:|---:|---:|---:|
| in_floor | 123 | 0 | 0 | 123 |
| after_path | 177 | 0 | 0 | 177 |
| of them overran (after_path) | 177 | 0 | 0 | 177 |

| outcome \ schedule | after_path, not overran | after_path, overran | in_floor |
|---|---:|---:|---:|
| honest | 0 | 177 | 123 |

**Latency against task 147's 0.4.4 x100** (/Users/new/.local/share/cua-171/task147/out/floor-left; its overran derived from the row: the path's last step after the take more than 1 ms past floor_until, since an in-floor path's keepalive ends 0.0–0.5 ms past it). The answer is the drag's reply time (`ms`); the release is after the press. p50 / p95 ms:

| rows | 0.4.5 n | 0.4.5 answer | 0.4.5 release | 0.4.4 n | 0.4.4 answer | 0.4.4 release |
|---|---:|---|---|---:|---|---|
| all | 300 | 503.0 / 828.8 | 399.2 / 718.2 | 100 | 512.5 / 822.3 | 409.1 / 725.0 |
| overran | 177 | 577.0 / 868.0 | 494.0 / 746.4 | 63 | 561.8 / 835.9 | 511.6 / 736.4 |
| not overran | 123 | 451.7 / 518.4 | 378.1 / 396.0 | 37 | 461.9 / 517.7 | 379.1 / 393.1 |
| 0.4.5 in_floor, not overran | 123 | 451.7 / 518.4 | 378.1 / 396.0 | | | |

**False oks and stale drops: 0.**
