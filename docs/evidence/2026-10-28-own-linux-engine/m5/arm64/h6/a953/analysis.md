# Ruling 953 (task 122): the per-cell and per-row records, from the runs' own rows

## Per cell (a953-cells.mjs)

# t14-floor/run/results.jsonl: 360 drags
| lane | cell | drags | landed | no drop | false ok | reply notices | read notices | confirmed_by | released_with_take | last step to release, ms (min / median / max) | keepalives (min / median / max) |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|
| cua | plain-long | 300 | 300 | 0 | 0 | – | – | Activation 300 | true 300 | 0.0 / 0.8 / 6.9 | 0.0 / 0.0 / 0.0 |
| cua | left | 30 | 0 | 30 | 0 | – | unconfirmed 30 | Activation 30 | true 30 | 0.1 / 2.0 / 5.1 | 0.0 / 0.0 / 0.0 |
| cua | inzone-out | 30 | 0 | 30 | 0 | – | unconfirmed 30 | Activation 30 | true 30 | 0.1 / 1.9 / 243.2 | 0.0 / 0.0 / 19.0 |

# t14-long/run/results.jsonl: 100 drags
| lane | cell | drags | landed | no drop | false ok | reply notices | read notices | confirmed_by | released_with_take | last step to release, ms (min / median / max) | keepalives (min / median / max) |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|
| cua | long-left | 100 | 5 | 95 | 7 | – | unconfirmed 88 | Activation 100 | true 100 | 0.0 / 0.2 / 4.1 | 0.0 / 0.0 / 0.0 |
  FALSE OK: cua long-left #28 (block 2, warm)
  FALSE OK: cua long-left #38 (block 3, warm)
  FALSE OK: cua long-left #51 (block 5, warm)
  FALSE OK: cua long-left #64 (block 6, warm)
  FALSE OK: cua long-left #79 (block 7, warm)
  FALSE OK: cua long-left #88 (block 8, warm)
  FALSE OK: cua long-left #89 (block 8, warm)

## t14-long, every long-left row (a953-rows.mjs)

# long-left: 100 rows
| # | block | cold | outcome | take after the press (ms) | path (ms) | last step to release (ms) | keepalives | activation after the release (ms) | confirmed_by | released_with_take | page started | answer | next request |
|---:|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|
| 0 | 0 | cold | honest | 36.6 | 471.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 1 | 0 | warm | honest | 34.0 | 1253.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 2 | 0 | warm | honest | 48.1 | 907.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 3 | 0 | warm | honest | 31.9 | 1565.0 | 1.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 4 | 0 | warm | honest | 17.2 | 1407.4 | 1.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 5 | 0 | warm | honest | 17.1 | 481.2 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 6 | 0 | warm | honest | 30.0 | 714.0 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 7 | 0 | warm | honest | 6.1 | 471.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 8 | 0 | warm | honest | 38.0 | 1689.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 9 | 0 | warm | honest | 26.0 | 1355.3 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 10 | 1 | cold | honest | 35.6 | 1919.5 | 3.5 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 11 | 1 | warm | honest | 41.0 | 490.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 12 | 1 | warm | honest | 39.0 | 494.2 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 13 | 1 | warm | honest | 6.6 | 1277.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 14 | 1 | warm | honest | 15.6 | 470.9 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 15 | 1 | warm | honest | 50.0 | 2119.0 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 16 | 1 | warm | honest | 25.3 | 1085.7 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 17 | 1 | warm | honest | 14.4 | 1036.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 18 | 1 | warm | honest | 43.1 | 487.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 19 | 1 | warm | honest | 20.0 | 483.2 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 20 | 2 | cold | honest | 23.0 | 1920.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 21 | 2 | warm | honest | 33.0 | 493.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 22 | 2 | warm | honest | 36.2 | 1068.0 | 3.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 23 | 2 | warm | honest | 28.0 | 550.8 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 24 | 2 | warm | honest | 22.7 | 489.5 | 0.6 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 25 | 2 | warm | honest | 23.0 | 2415.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 26 | 2 | warm | honest | 44.0 | 490.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 27 | 2 | warm | honest | 6.9 | 929.3 | 0.6 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 28 | 2 | warm | FALSE OK | 16.9 | 764.7 | 0.1 | 0 | 4.6 | Activation | true | true | ok, nothing pending | ran |
| 29 | 2 | warm | honest | 23.6 | 1380.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 30 | 3 | cold | honest | 40.0 | 1037.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 31 | 3 | warm | honest | 13.9 | 1106.2 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 32 | 3 | warm | honest | 34.0 | 1167.5 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 33 | 3 | warm | landed | 33.1 | 623.8 | 0.1 | 0 | 6.2 | Activation | true | true | ok, nothing pending | ran |
| 34 | 3 | warm | honest | 4.1 | 471.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 35 | 3 | warm | honest | 28.0 | 879.0 | 4.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 36 | 3 | warm | landed | 40.0 | 1569.3 | 0.3 | 0 | 3.3 | Activation | true | true | ok, nothing pending | ran |
| 37 | 3 | warm | honest | 40.0 | 487.5 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 38 | 3 | warm | FALSE OK | 39.1 | 1604.4 | 0.0 | 0 | 5.6 | Activation | true | true | ok, nothing pending | ran |
| 39 | 3 | warm | honest | 42.0 | 1045.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 40 | 4 | cold | honest | 33.7 | 1025.9 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 41 | 4 | warm | honest | 37.0 | 533.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 42 | 4 | warm | honest | 24.0 | 481.6 | 0.4 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 43 | 4 | warm | honest | 44.0 | 496.1 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 44 | 4 | warm | honest | 12.5 | 1834.0 | 3.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 45 | 4 | warm | honest | 24.2 | 1186.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 46 | 4 | warm | honest | 31.0 | 1028.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 47 | 4 | warm | honest | 34.0 | 1943.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 48 | 4 | warm | honest | 26.3 | 739.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 49 | 4 | warm | honest | 33.0 | 488.3 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 50 | 5 | cold | honest | 29.4 | 1921.2 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 51 | 5 | warm | FALSE OK | 28.0 | 1608.3 | 1.7 | 0 | 5.0 | Activation | true | true | ok, nothing pending | ran |
| 52 | 5 | warm | honest | 3.9 | 761.2 | 3.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 53 | 5 | warm | landed | 22.3 | 1064.6 | 1.8 | 0 | 1.7 | Activation | true | true | ok, nothing pending | ran |
| 54 | 5 | warm | honest | 34.1 | 1048.4 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 55 | 5 | warm | honest | 20.3 | 945.6 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 56 | 5 | warm | honest | 20.3 | 1919.5 | 0.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 57 | 5 | warm | honest | 18.4 | 684.7 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 58 | 5 | warm | honest | 30.0 | 1223.7 | 2.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 59 | 5 | warm | honest | 19.0 | 1418.1 | 0.6 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 60 | 6 | cold | honest | 42.0 | 1906.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 61 | 6 | warm | honest | 8.4 | 1615.6 | 1.8 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 62 | 6 | warm | honest | 27.1 | 1206.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 63 | 6 | warm | honest | 53.0 | 801.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 64 | 6 | warm | FALSE OK | 32.0 | 491.9 | 0.1 | 0 | 3.3 | Activation | true | true | ok, nothing pending | ran |
| 65 | 6 | warm | honest | 14.0 | 471.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 66 | 6 | warm | honest | 42.1 | 490.6 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 67 | 6 | warm | honest | 31.0 | 1350.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 68 | 6 | warm | honest | 22.3 | 480.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 69 | 6 | warm | honest | 26.6 | 1565.5 | 2.8 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 70 | 7 | cold | honest | 29.3 | 1232.7 | 1.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 71 | 7 | warm | honest | 6.3 | 470.8 | 1.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 72 | 7 | warm | honest | 37.0 | 1653.1 | 0.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 73 | 7 | warm | honest | 21.4 | 1336.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 74 | 7 | warm | honest | 7.0 | 470.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 75 | 7 | warm | honest | 29.1 | 482.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 76 | 7 | warm | honest | 40.3 | 488.8 | 1.4 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 77 | 7 | warm | honest | 4.9 | 674.6 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 78 | 7 | warm | honest | 48.0 | 1760.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 79 | 7 | warm | FALSE OK | 31.0 | 633.0 | 0.1 | 0 | 3.7 | Activation | true | true | ok, nothing pending | ran |
| 80 | 8 | cold | honest | 30.0 | 2259.7 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 81 | 8 | warm | honest | 27.0 | 483.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 82 | 8 | warm | honest | 19.4 | 473.8 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 83 | 8 | warm | honest | 29.0 | 1599.0 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 84 | 8 | warm | honest | 31.0 | 489.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 85 | 8 | warm | landed | 38.0 | 1233.6 | 0.1 | 0 | 3.5 | Activation | true | true | ok, nothing pending | ran |
| 86 | 8 | warm | honest | 4.9 | 471.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 87 | 8 | warm | honest | 37.1 | 865.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 88 | 8 | warm | FALSE OK | 25.3 | 1298.9 | 0.4 | 0 | 2.7 | Activation | true | true | ok, nothing pending | ran |
| 89 | 8 | warm | FALSE OK | 43.1 | 1104.5 | 1.6 | 0 | 9.0 | Activation | true | true | ok, nothing pending | ran |
| 90 | 9 | cold | honest | 33.0 | 2467.0 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 91 | 9 | warm | honest | 22.4 | 647.3 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 92 | 9 | warm | honest | 20.5 | 1355.1 | 0.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 93 | 9 | warm | honest | 15.4 | 472.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 94 | 9 | warm | honest | 10.0 | 470.7 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 95 | 9 | warm | honest | 6.2 | 1444.3 | 0.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 96 | 9 | warm | landed | 18.5 | 1378.0 | 0.1 | 0 | 9.6 | Activation | true | true | ok, nothing pending | ran |
| 97 | 9 | warm | honest | 40.0 | 490.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 98 | 9 | warm | honest | 31.9 | 1643.9 | 2.4 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 99 | 9 | warm | honest | 44.1 | 1383.7 | 0.4 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |

Chrome activated after the release on 12 (12 warm): landed 5, false ok 7, honest 0. No activation on 88 (10 cold): landed 0, false ok 0, honest 88.

## t14-floor, every left row

# left: 30 rows
| # | block | cold | outcome | take after the press (ms) | path (ms) | last step to release (ms) | keepalives | activation after the release (ms) | confirmed_by | released_with_take | page started | answer | next request |
|---:|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|
| 0 | 1 | cold | honest | 29.0 | 588.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 1 | 1 | warm | honest | 29.0 | 663.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 2 | 1 | warm | honest | 50.8 | 706.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 3 | 1 | warm | honest | 36.0 | 399.7 | 1.3 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 4 | 1 | warm | honest | 21.0 | 580.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 5 | 1 | warm | honest | 6.3 | 356.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 6 | 1 | warm | honest | 42.0 | 668.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 7 | 1 | warm | honest | 31.0 | 381.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 8 | 1 | warm | honest | 23.6 | 446.6 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 9 | 1 | warm | honest | 35.2 | 471.2 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 10 | 3 | cold | honest | 18.4 | 504.1 | 2.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 11 | 3 | warm | honest | 5.8 | 625.0 | 4.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 12 | 3 | warm | honest | 24.1 | 374.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 13 | 3 | warm | honest | 20.2 | 370.2 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 14 | 3 | warm | honest | 22.0 | 372.2 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 15 | 3 | warm | honest | 7.3 | 357.4 | 3.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 16 | 3 | warm | honest | 23.0 | 375.3 | 5.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 17 | 3 | warm | honest | 27.4 | 378.7 | 2.2 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 18 | 3 | warm | honest | 8.5 | 358.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 19 | 3 | warm | honest | 37.3 | 423.3 | 3.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 20 | 8 | cold | honest | 35.0 | 612.0 | 4.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 21 | 8 | warm | honest | 52.0 | 573.0 | 3.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 22 | 8 | warm | honest | 11.4 | 361.4 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 23 | 8 | warm | honest | 29.7 | 585.2 | 1.3 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 24 | 8 | warm | honest | 36.2 | 440.2 | 1.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 25 | 8 | warm | honest | 37.0 | 462.3 | 0.3 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 26 | 8 | warm | honest | 20.0 | 735.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 27 | 8 | warm | honest | 32.0 | 390.0 | 2.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 28 | 8 | warm | honest | 39.0 | 651.0 | 3.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 29 | 8 | warm | honest | 4.9 | 354.9 | 3.6 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |

Chrome activated after the release on 0 (0 warm): landed 0, false ok 0, honest 0. No activation on 30 (3 cold): landed 0, false ok 0, honest 30.

## t14-floor, every inzone-out row

# inzone-out: 30 rows
| # | block | cold | outcome | take after the press (ms) | path (ms) | last step to release (ms) | keepalives | activation after the release (ms) | confirmed_by | released_with_take | page started | answer | next request |
|---:|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|
| 0 | 2 | cold | honest | 24.8 | 187.5 | 190.1 | 11 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 1 | 2 | warm | honest | 30.0 | 380.1 | 1.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 2 | 2 | warm | honest | 41.0 | 391.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 3 | 2 | warm | honest | 20.3 | 159.9 | 211.4 | 16 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 4 | 2 | warm | honest | 7.4 | 357.5 | 2.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 5 | 2 | warm | honest | 41.0 | 391.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 6 | 2 | warm | honest | 23.0 | 132.0 | 243.2 | 19 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 7 | 2 | warm | honest | 29.1 | 379.2 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 8 | 2 | warm | honest | 6.8 | 356.8 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 9 | 2 | warm | honest | 7.8 | 357.8 | 1.6 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 10 | 4 | cold | honest | 13.8 | 363.8 | 1.5 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 11 | 4 | warm | honest | 28.0 | 378.1 | 1.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 12 | 4 | warm | honest | 16.7 | 262.4 | 110.9 | 7 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 13 | 4 | warm | honest | 3.6 | 353.7 | 4.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 14 | 4 | warm | honest | 38.0 | 388.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 15 | 4 | warm | honest | 19.9 | 154.5 | 221.4 | 18 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 16 | 4 | warm | honest | 17.7 | 308.7 | 61.7 | 4 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 17 | 4 | warm | honest | 19.8 | 369.9 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 18 | 4 | warm | honest | 30.0 | 380.0 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 19 | 4 | warm | honest | 20.3 | 142.4 | 229.1 | 19 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 20 | 6 | cold | honest | 9.1 | 359.1 | 1.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 21 | 6 | warm | honest | 25.0 | 375.1 | 3.0 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 22 | 6 | warm | honest | 24.5 | 374.6 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 23 | 6 | warm | honest | 53.0 | 403.1 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 24 | 6 | warm | honest | 20.2 | 370.3 | 1.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 25 | 6 | warm | honest | 36.0 | 386.1 | 3.9 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 26 | 6 | warm | honest | 4.9 | 354.9 | 3.8 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 27 | 6 | warm | honest | 9.2 | 359.3 | 0.1 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 28 | 6 | warm | honest | 20.6 | 198.9 | 171.8 | 10 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |
| 29 | 6 | warm | honest | 33.0 | 383.1 | 1.5 | 0 | – | Activation | true | true | ok; the read: unconfirmed drop | refused |

Chrome activated after the release on 0 (0 warm): landed 0, false ok 0, honest 0. No activation on 30 (3 cold): landed 0, false ok 0, honest 30.
