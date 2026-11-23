### arm64/zero/V5c.development-run/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 30 | 0 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 396.7 | None/None/None (n 0) |  |  |
| shared | cua | warm | 60 | 0 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 346.3 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 | 367.4 | 11.3/16.4/17.3 (n 30) |  |  |
| short_in_front_shared | cua | warm | 60 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 502.3 | 146.7/149.5/191.3 (n 60) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 90 | 90 | 145.3 / 149.0 / 149.8 / 191.3 / 191.3 | 0 | 0 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)

### arm64-w2/v5-2-1/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 25 | 0 | 0 | 0 | 0 | 0 | 25 | 0 | 0 | 0 | 479.0 | None/None/None (n 0) |  |  |
| shared | cua | warm | 50 | 0 | 0 | 0 | 0 | 0 | 50 | 0 | 0 | 0 | 516.8 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 25 | 0 | 0 | 1 | 1 | 23 | 0 | 0 | 0 | 0 | 551.1 | 172.9/243.3/337.3 (n 24) |  |  |
| short_in_front_shared | cua | warm | 50 | 0 | 0 | 0 | 0 | 48 | 0 | 0 | 0 | 0 | 521.8 | 7.3/172.9/405.5 (n 50) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 75 | 74 | 77.1 / 190.2 / 243.3 / 405.5 / 405.5 | 2 | 1 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)
cua (13, 0, 'cold', None, None, False, None, None, None, False, 0, 0, 'Activation(16777279)')

### arm64-w2/v5-2-2/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 25 | 0 | 0 | 2 | 2 | 0 | 23 | 0 | 0 | 0 | 494.6 | None/None/None (n 0) |  |  |
| shared | cua | warm | 50 | 0 | 0 | 1 | 1 | 0 | 49 | 0 | 0 | 0 | 522.8 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 25 | 0 | 0 | 1 | 1 | 21 | 0 | 0 | 0 | 0 | 485.1 | 99.8/265.4/372.7 (n 24) |  |  |
| short_in_front_shared | cua | warm | 50 | 0 | 0 | 0 | 0 | 42 | 0 | 0 | 0 | 0 | 533.5 | 9.9/189.2/377.5 (n 50) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 75 | 74 | 69.8 / 206.6 / 351.2 / 377.5 / 377.5 | 4 | 4 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)
cua (14, 0, 'cold', None, None, False, None, None, None, False, 0, 0, 'Activation(16777279)')

### arm64-w2/v5-2-c158/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 10 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 478.7 | None/None/None (n 0) |  |  |
| shared | cua | warm | 20 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 | 0 | 506.8 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 10 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 577.6 | 178.9/265.4/265.4 (n 10) |  |  |
| short_in_front_shared | cua | warm | 20 | 0 | 0 | 0 | 0 | 17 | 0 | 0 | 0 | 0 | 526.0 | 7.2/165.3/339.7 (n 20) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 30 | 30 | 12.2 / 244.8 / 265.4 / 339.7 / 339.7 | 1 | 0 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)

### arm64-w2/v5n-2-1/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 12 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 515.9 | None/None/None (n 0) |  |  |
| shared | cua | warm | 24 | 0 | 0 | 1 | 1 | 0 | 23 | 0 | 0 | 0 | 507.6 | None/None/None (n 0) |  |  |
| shared | cua:nopings | cold | 12 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 516.0 | None/None/None (n 0) |  |  |
| shared | cua:nopings | warm | 24 | 0 | 0 | 1 | 1 | 0 | 23 | 0 | 0 | 0 | 550.2 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 12 | 1 | 1 | 1 | 0 | 10 | 0 | 0 | 0 | 0 | 529.9 | 129.2/276.4/458.4 (n 12) | [8.2] |  |
| short_in_front_shared | cua | warm | 24 | 2 | 2 | 2 | 0 | 21 | 0 | 0 | 0 | 0 | 527.2 | 18.2/410.6/495.6 (n 24) | [41.5, 34.8] |  |
| short_in_front_shared | cua:nopings | cold | 12 | 0 | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 550.5 | 124.3/285.5/390.1 (n 12) |  |  |
| short_in_front_shared | cua:nopings | warm | 24 | 1 | 1 | 1 | 0 | 20 | 0 | 0 | 0 | 0 | 536.4 | 8.4/191.1/452.5 (n 24) | [2.4] |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 36 | 36 | 117.7 / 410.6 / 486.8 / 495.6 / 495.6 | 7 | 7 | 3 | 0 |
| cua:nopings | 36 | 36 | 16.8 / 195.9 / 390.1 / 452.5 / 452.5 | 2 | 2 | 1 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)
cua (0, 1, 'warm', 495.6, 454.2, False, None, None, None, False, 1, 1, 'Activation(16777279)')
cua (4, 0, 'cold', 458.4, 450.2, False, None, None, None, False, 1, 1, 'Activation(16777279)')
cua (4, 1, 'warm', 486.8, 452.0, False, None, None, None, False, 1, 1, 'Activation(16777279)')
cua:nopings (0, 2, 'warm', 452.5, 450.1, False, None, None, None, False, 1, 1, 'Activation(16777282)')

### arm64-w2/v5n-2-2/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 12 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 507.8 | None/None/None (n 0) |  |  |
| shared | cua | warm | 24 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 537.8 | None/None/None (n 0) |  |  |
| shared | cua:nopings | cold | 12 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 539.6 | None/None/None (n 0) |  |  |
| shared | cua:nopings | warm | 24 | 0 | 0 | 1 | 1 | 0 | 23 | 0 | 0 | 0 | 551.3 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 12 | 0 | 0 | 1 | 1 | 9 | 0 | 0 | 0 | 0 | 530.6 | 127.1/234.9/252.5 (n 11) |  |  |
| short_in_front_shared | cua | warm | 24 | 1 | 1 | 1 | 0 | 23 | 0 | 0 | 0 | 0 | 513.9 | 19.1/199.6/485.1 (n 24) | [34.9] |  |
| short_in_front_shared | cua:nopings | cold | 12 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 543.9 | 125.1/201.5/359.5 (n 12) |  |  |
| short_in_front_shared | cua:nopings | warm | 24 | 1 | 1 | 1 | 0 | 22 | 0 | 0 | 0 | 0 | 533.4 | 10.2/375.3/521.2 (n 24) | [68.0] |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 36 | 35 | 85.6 / 234.9 / 320.4 / 485.1 / 485.1 | 2 | 1 | 1 | 0 |
| cua:nopings | 36 | 36 | 14.2 / 359.5 / 391.5 / 521.2 / 521.2 | 5 | 5 | 1 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)
cua (4, 0, 'cold', None, None, False, None, None, None, False, 0, 0, 'Activation(16777279)')
cua (9, 2, 'warm', 485.1, 450.2, False, None, None, None, False, 1, 1, 'Activation(16777279)')
cua:nopings (0, 2, 'warm', 521.2, 453.3, False, None, None, None, False, 1, 1, 'Activation(16777282)')

### arm64-w2/zero/V5c.development-run/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 15 | 0 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 392.6 | None/None/None (n 0) |  |  |
| shared | cua | warm | 30 | 0 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 346.1 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 15 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 367.5 | 11.3/15.7/16.2 (n 15) |  |  |
| short_in_front_shared | cua | warm | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 | 502.3 | 146.8/153.0/155.1 (n 30) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 45 | 45 | 144.7 / 152.2 / 153.0 / 155.1 / 155.1 | 0 | 0 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)

### arm64-w2/v5-0-1/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 15 | 0 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 391.0 | None/None/None (n 0) |  |  |
| shared | cua | warm | 30 | 0 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 345.8 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 15 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 363.8 | 8.2/15.3/15.4 (n 15) |  |  |
| short_in_front_shared | cua | warm | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 | 503.0 | 147.7/152.7/190.3 (n 30) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 45 | 45 | 145.2 / 152.3 / 152.7 / 190.3 / 190.3 | 0 | 0 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)

### arm64-w2/v5-0-c158/run/results.jsonl
| op | lane | series | n | shape_plain_ok | late_shape | false_ok | plain_ok_no_start | dropped | cancelled | final_hold_ran | final_hold_take | prevented | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| shared | cua | cold | 10 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 384.4 | None/None/None (n 0) |  |  |
| shared | cua | warm | 20 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 | 0 | 341.9 | None/None/None (n 0) |  |  |
| short_in_front_shared | cua | cold | 10 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 363.9 | 9.2/16.4/16.4 (n 10) |  |  |
| short_in_front_shared | cua | warm | 20 | 0 | 0 | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 450.3 | 144.7/152.7/153.4 (n 20) |  |  |
| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |
|---|---:|---:|---|---:|---:|---:|---:|
| cua | 30 | 30 | 15.3 / 152.3 / 152.7 / 153.4 / 153.4 | 0 | 0 | 0 | 0 |

false oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)

