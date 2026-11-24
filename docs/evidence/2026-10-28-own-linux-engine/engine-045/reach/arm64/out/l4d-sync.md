Fields check: 460 Chrome rows; 460 carry release_sync with overran, last_step_after_take_ms, unconfirmed; 0 do not.

| part | cell | rows | overran | overran: last_step_after_take_ms min / p50 / max (floor_until) | schedule after_path / in_floor | of after_path, gate open / overran with the gate shut | visits_dropped 0 / 1 / 2 | unconfirmed by cause (outcome) |
|---:|---|---:|---:|---|---|---|---|---|
| 1 | long-left | 100 | 100 | 442.3 / 1163.7 / 2456.7 (326) | 100 / 0 | 100 / 0 | 100 / 0 / 0 | null (honest): 100 |
| 2 | plain-long | 300 | 216 | 326.0 / 595.8 / 1239.0 (326) | 216 / 84 | 188 / 28 | 300 / 0 / 0 | null (landed): 300 |
| 2 | left | 30 | 20 | 327.0 / 459.0 / 677.0 (326) | 20 / 10 | 15 / 5 | 30 / 0 / 0 | null (honest): 30 |
| 2 | inzone-out | 30 | 0 | – | 0 / 30 | 0 / 0 | 30 / 0 / 0 | null (honest): 30 |

In-floor rows that overran (item 1 would have moved them): 0.
