# linux-engine-diff summary

## m0-tree

commit 391765965431650241a281515ae9e1cad14276ba; cua-engine 0.0.1 (391765965431); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:seq` = `--tree sequential --bus per-request`; `cua:cache` = `--tree cache`; `cua:W8` = `--window-calls 8`; `cua:W16` = `--window-calls 16`; `cua:W32` = `--window-calls 32`; `cua:W128` = `--window-calls 128`; `cua:W256` = `--window-calls 256`; `cua:R64K` = `--window-bytes 65536`; `cua:R256K` = `--window-bytes 262144`; `cua:R1M` = `--window-bytes 1048576`; `cua:R16M` = `--window-bytes 16777216`; `cua:res1K` = `--call-reservation 1024`; `cua:res16K` = `--call-reservation 16384`; `cua:R256K-res16K` = `--window-bytes 262144 --call-reservation 16384`; `cua:slack4` = `--slack-nodes 4`; `cua:slack64` = `--slack-nodes 64`

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | tree | pinned | 564.6 | 486.3 | 21 | 3185 / 3185 | 3185 / 3185 | – | 24/24 | – | 24/24 |  |
| gedit | tree | newest | 511.4 | 488 | 21 | 3185 / 3185 | 3185 / 3185 | – | 24/24 | – | 24/24 |  |
| gedit | tree | cua | 75.2 | 59.3 | 21 | 3185 / 3184 | 46 / 18 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:seq | 527.3 | 471.9 | 21 | 3185 / 3185 | 3185 / 3185 | 0 | 24/24 | – | 24/24 | FAIL: cua:seq: cold 527.3 ms > bar 511.4 ms |
| gedit | tree | cua:cache | 82.1 | 63.2 | 21 | 3186 / 3185 | 40 / 19 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W8 | 97.6 | 80.1 | 21 | 3185 / 3184 | 85 / 139 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W16 | 70.7 | 64.6 | 21 | 3185 / 3184 | 26 / 47 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W32 | 65.3 | 64.2 | 21 | 3185 / 3184 | 31 / 24 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W128 | 81.9 | 60.6 | 21 | 3185 / 3184 | 21 / 19 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W256 | 65 | 60.6 | 21 | 3185 / 3184 | 20 / 35 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R64K | 94.7 | 69.1 | 21 | 3185 / 3184 | 38 / 98 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R256K | 75.8 | 62.3 | 21 | 3185 / 3184 | 17 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R1M | 72.3 | 60.9 | 21 | 3185 / 3184 | 19 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R16M | 63.6 | 61.2 | 21 | 3185 / 3184 | 16 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:res1K | 70.6 | 62.4 | 21 | 3185 / 3184 | 19 / 20 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:res16K | 68.8 | 55.7 | 21 | 3185 / 3184 | 17 / 21 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R256K-res16K | 78.2 | 70.1 | 21 | 3185 / 3184 | 80 / 49 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:slack4 | 73.8 | 65.5 | 21 | 3185 / 3184 | 74 / 68 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:slack64 | 71.1 | 61.4 | 21 | 3185 / 3184 | 14 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | **bar** | 511.4 | 486.3 | | | | | | | | |
| chrome | tree | pinned | 390.3 | 385.9 | 21 | 2222 / 2222 | 2222 / 2222 | – | 24/24 | – | 24/24 |  |
| chrome | tree | newest | 380.6 | 394 | 21 | 2222 / 2222 | 2222 / 2222 | – | 24/24 | – | 24/24 |  |
| chrome | tree | cua | 54.6 | 48.8 | 21 | 2222 / 2221 | 12 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:seq | 344.1 | 330.4 | 21 | 2222 / 2222 | 2222 / 2222 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:cache | 72.3 | 44.2 | 21 | 2223 / 2222 | 17 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W8 | 61.6 | 60 | 21 | 2222 / 2221 | 28 / 35 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W16 | 58.8 | 49.9 | 21 | 2222 / 2221 | 23 / 10 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W32 | 69.2 | 46.7 | 21 | 2222 / 2221 | 13 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W128 | 56.4 | 45.9 | 21 | 2222 / 2221 | 13 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W256 | 48.1 | 46.3 | 21 | 2222 / 2221 | 12 / 16 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R64K | 53.7 | 49 | 21 | 2222 / 2221 | 16 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R256K | 65.8 | 47.2 | 21 | 2222 / 2221 | 14 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R1M | 75.8 | 47.1 | 21 | 2222 / 2221 | 12 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R16M | 56 | 46.8 | 21 | 2222 / 2221 | 12 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:res1K | 70.5 | 49.4 | 21 | 2222 / 2221 | 13 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:res16K | 57.7 | 45.2 | 21 | 2222 / 2221 | 13 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R256K-res16K | 63.7 | 52 | 21 | 2222 / 2221 | 13 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:slack4 | 57.4 | 48.4 | 21 | 2222 / 2221 | 15 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:slack64 | 57.8 | 48.8 | 21 | 2222 / 2221 | 14 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | **bar** | 380.6 | 385.9 | | | | | | | | |
| over-budget | tree | pinned | 6863.5 | 6812.5 | 21 | 45034 / 45034 | 45034 / 45034 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | newest | 6429.8 | 6949.8 | 21 | 45034 / 45034 | 45034 / 45034 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | cua | 901.4 | 920.8 | 21 | 45277 / 45279 | 44 / 34 | 267 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:seq | 6770 | 6969.7 | 21 | 45034 / 45034 | 45034 / 45034 | 0 | 24/24 | – | 24/24 | FAIL: cua:seq: cold 6770 ms > bar 6429.8 ms; cua:seq: warm 6969.7 ms > bar 6812.5 ms |
| over-budget | tree | cua:cache | 1000.7 | 899.9 | 21 | 45272 / 45289 | 30 / 27 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W8 | 1281.1 | 1232.8 | 21 | 45043 / 45040 | 783 / 588 | 11 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W16 | 915.9 | 959.8 | 21 | 45070 / 45076 | 555 / 133 | 51 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W32 | 891.3 | 939.6 | 21 | 45124 / 45120 | 86 / 120 | 129 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W128 | 926.5 | 891.8 | 21 | 45358 / 45339 | 29 / 47 | 347 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W256 | 881.7 | 882.9 | 21 | 45346 / 45357 | 35 / 29 | 348 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R64K | 1065 | 1028.9 | 21 | 45075 / 45075 | 329 / 170 | 51 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R256K | 878.5 | 851.1 | 21 | 45273 / 45278 | 34 / 48 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R1M | 896.8 | 874.6 | 21 | 45283 / 45282 | 48 / 54 | 249 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R16M | 945.4 | 905.6 | 21 | 45283 / 45283 | 47 / 28 | 252 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:res1K | 895.5 | 880 | 21 | 45270 / 45291 | 50 / 59 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:res16K | 926.9 | 914.8 | 21 | 45292 / 45285 | 31 / 38 | 252 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R256K-res16K | 1053.9 | 991.6 | 21 | 45077 / 45069 | 178 / 85 | 60 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:slack4 | 884.5 | 898.8 | 21 | 45157 / 45156 | 90 / 137 | 129 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:slack64 | 955.8 | 880.9 | 21 | 45291 / 45283 | 24 / 83 | 272 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6429.8 | 6812.5 | | | | | | | | |
| big-text | tree | pinned | 408.7 | 368.1 | 21 | 2027 / 2027 | 2027 / 2027 | – | 24/24 | – | 24/24 |  |
| big-text | tree | newest | 494.6 | 422.3 | 21 | 2027 / 2027 | 2027 / 2027 | – | 24/24 | – | 24/24 |  |
| big-text | tree | cua | 116.1 | 96.5 | 21 | 2027 / 2026 | 15 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:seq | 400.9 | 392.2 | 21 | 2027 / 2027 | 2027 / 2027 | 0 | 24/24 | – | 24/24 | FAIL: cua:seq: warm 392.2 ms > bar 368.1 ms |
| big-text | tree | cua:cache | 116.5 | 99.4 | 21 | 2028 / 2027 | 16 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W8 | 126.7 | 112.7 | 21 | 2027 / 2026 | 32 / 22 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W16 | 111.4 | 103.3 | 21 | 2027 / 2026 | 17 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W32 | 108.2 | 98.5 | 21 | 2027 / 2026 | 13 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W128 | 106.7 | 96.6 | 21 | 2027 / 2026 | 13 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W256 | 109.5 | 96.6 | 21 | 2027 / 2026 | 16 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R64K | 111.8 | 95.4 | 21 | 2027 / 2026 | 19 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R256K | 106.3 | 99.4 | 21 | 2027 / 2026 | 15 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R1M | 114.4 | 99.2 | 21 | 2027 / 2026 | 14 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R16M | 109.2 | 96.8 | 21 | 2027 / 2026 | 15 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:res1K | 111 | 95.6 | 21 | 2027 / 2026 | 14 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:res16K | 109.3 | 97.5 | 21 | 2027 / 2026 | 16 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R256K-res16K | 101.7 | 92.5 | 21 | 2027 / 2026 | 17 / 19 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:slack4 | 117.8 | 100.8 | 21 | 2027 / 2026 | 20 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:slack64 | 115.2 | 98.6 | 21 | 2027 / 2026 | 13 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | **bar** | 408.7 | 368.1 | | | | | | | | |

Over-budget retained native ids:
- cua: equal to the pinned build's
- cua:seq: equal to the pinned build's
- cua:cache: equal to the pinned build's
- cua:W8: equal to the pinned build's
- cua:W16: equal to the pinned build's
- cua:W32: equal to the pinned build's
- cua:W128: equal to the pinned build's
- cua:W256: equal to the pinned build's
- cua:R64K: equal to the pinned build's
- cua:R256K: equal to the pinned build's
- cua:R1M: equal to the pinned build's
- cua:R16M: equal to the pinned build's
- cua:res1K: equal to the pinned build's
- cua:res16K: equal to the pinned build's
- cua:R256K-res16K: equal to the pinned build's
- cua:slack4: equal to the pinned build's
- cua:slack64: equal to the pinned build's

run valid, finished 2026-10-28T12:04:32.616Z

## m0-shot

commit 391765965431650241a281515ae9e1cad14276ba; cua-engine 0.0.1 (391765965431); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:settle20` = `--settle-ms 20`; `cua:settle50` = `--settle-ms 50`

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | tree_shot | pinned | 718.1 | 702.7 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | newest | 769.5 | 696.7 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | cua | 214.3 | 90 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:per-request | 206.4 | 199.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:none | 116.1 | 86.4 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:settle0 | 117.9 | 96.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:settle20 | 115.9 | 92.2 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:settle50 | 153.3 | 89.2 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 718.1 | 696.7 | | | | | | | | |
| chrome | tree_shot | pinned | 530.8 | 575.2 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | newest | 595.5 | 591.5 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | cua | 202.4 | 88.2 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:per-request | 208.4 | 197 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:none | 86.6 | 84.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:settle0 | 84.8 | 78.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:settle20 | 106.5 | 82.3 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:settle50 | 145.3 | 85 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 530.8 | 575.2 | | | | | | | | |

Window screenshots against the pinned build's (each engine's own window):
- gedit cua: 910×756 vs 910×756, mean absolute pixel difference 0.3162
- gedit cua:per-request: 910×756 vs 910×756, mean absolute pixel difference 0.3564
- gedit cua:none: 910×756 vs 910×756, mean absolute pixel difference 250.169
- gedit cua:settle0: 910×756 vs 910×756, mean absolute pixel difference 250.169
- gedit cua:settle20: 910×756 vs 910×756, mean absolute pixel difference 0.3412
- gedit cua:settle50: 910×756 vs 910×756, mean absolute pixel difference 0.3436
- chrome cua: 1050×780 vs 1050×780, mean absolute pixel difference 0
- chrome cua:per-request: 1050×780 vs 1050×780, mean absolute pixel difference 0
- chrome cua:none: 1050×780 vs 1050×780, mean absolute pixel difference 230.6543
- chrome cua:settle0: 1050×780 vs 1050×780, mean absolute pixel difference 21.5661
- chrome cua:settle20: 1050×780 vs 1050×780, mean absolute pixel difference 0
- chrome cua:settle50: 1050×780 vs 1050×780, mean absolute pixel difference 0

run valid, finished 2026-10-28T12:16:48.463Z

## m0-capture-readiness (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 6.6 | 6.9 | 7.2 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 0 | 20 / 0 |
| gedit | covered | 20 | 12.9 | 21.7 | 26.8 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 7 |
| chrome | visible | 20 | 8.3 | 11.7 | 13.5 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 3 | 20 / 0 |
| chrome | covered | 20 | 15.8 | 16.7 | 18.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 687960 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels

## m0-key-pace (experiment key-pace)

| window | burst | key pace ms | teardown ms | runs | all keys arrived in order | median burst ms |
|---|---|---:|---:|---:|---|---:|
| gedit | letters | 33 | 100 | 3 | 3/3 | 3453 |
| gedit | letters | 33 | 0 | 3 | 3/3 | 1446 |
| gedit | letters | 8 | 0 | 3 | 3/3 | 444 |
| gedit | letters | 0 | 100 | 3 | 3/3 | 2123 |
| gedit | letters | 0 | 50 | 3 | 3/3 | 1125 |
| gedit | letters | 0 | 33 | 3 | 3/3 | 783 |
| gedit | letters | 0 | 20 | 3 | 3/3 | 521 |
| gedit | letters | 0 | 10 | 3 | 3/3 | 329 |
| gedit | letters | 0 | 0 | 3 | 3/3 | 116 |
| gedit | chords | 33 | 100 | 3 | 3/3 | 2116 |
| gedit | chords | 33 | 0 | 3 | 3/3 | 1107 |
| gedit | chords | 8 | 0 | 3 | 3/3 | 362 |
| gedit | chords | 0 | 100 | 3 | 3/3 | 1118 |
| gedit | chords | 0 | 50 | 3 | 3/3 | 613 |
| gedit | chords | 0 | 33 | 3 | 3/3 | 443 |
| gedit | chords | 0 | 20 | 3 | 3/3 | 313 |
| gedit | chords | 0 | 10 | 3 | 3/3 | 212 |
| gedit | chords | 0 | 0 | 3 | 3/3 | 109 |
| chrome | letters | 33 | 100 | 3 | 3/3 | 3451 |
| chrome | letters | 33 | 0 | 3 | 0/3 | 1446 |
| chrome | letters | 8 | 0 | 3 | 2/3 | 445 |
| chrome | letters | 0 | 100 | 3 | 3/3 | 2125 |
| chrome | letters | 0 | 50 | 3 | 0/3 | 1123 |
| chrome | letters | 0 | 33 | 3 | 0/3 | 785 |
| chrome | letters | 0 | 20 | 3 | 0/3 | 523 |
| chrome | letters | 0 | 10 | 3 | 0/3 | 322 |
| chrome | letters | 0 | 0 | 3 | 0/3 | 119 |
| chrome | chords | 33 | 100 | 3 | 3/3 | 2110 |
| chrome | chords | 33 | 0 | 3 | 3/3 | 1108 |
| chrome | chords | 8 | 0 | 3 | 0/3 | 356 |
| chrome | chords | 0 | 100 | 3 | 3/3 | 1115 |
| chrome | chords | 0 | 50 | 3 | 3/3 | 613 |
| chrome | chords | 0 | 33 | 3 | 3/3 | 443 |
| chrome | chords | 0 | 20 | 3 | 0/3 | 312 |
| chrome | chords | 0 | 10 | 3 | 0/3 | 212 |
| chrome | chords | 0 | 0 | 3 | 1/3 | 110 |

## m0-input-covered

commit fc79391d096b4353739779b3cac8e1f52d9917c8; cua-engine 0.0.1 (fc79391d096b); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:teardown0` = `--teardown-ms 0`; `cua:pace0` = `--key-pace-ms 0`; `cua:none-pace0` = `--retention none --settle-ms 0 --key-pace-ms 0`; `cua:fast` = `--retention none --settle-ms 0 --teardown-ms 0 --key-pace-ms 0`

negative check: the witness failed the activating stub (active, stacking, focus); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | press_key | pinned | 343.2 | 268.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 315.3 | 235.7 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 335.6 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 335.6 ms > bar 315.3 ms |
| gedit | press_key | cua:per-request | 344.2 | 268.2 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 344.2 ms > bar 315.3 ms; cua:per-request: warm 268.2 ms > bar 235.7 ms |
| gedit | press_key | cua:none | 231.2 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:settle0 | 234.6 | 167.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:teardown0 | 236.6 | 67.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:pace0 | 269.8 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:none-pace0 | 175.1 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:fast | 71 | 1.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 315.3 | 235.7 | | | | | | | | |
| gedit | click | pinned | 220 | 215.2 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 220.3 | 215.5 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 218.9 | 114.2 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:per-request | 219.1 | 215.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none | 118.4 | 114.2 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:settle0 | 119.3 | 114.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:teardown0 | 118.5 | 14.3 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:pace0 | 219.1 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none-pace0 | 118.1 | 113.9 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:fast | 18.2 | 13.7 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 220 | 215.2 | | | | | | | | |
| chrome | press_key | pinned | 343.5 | 269.1 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 288.5 | 235.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 322.8 | 167.8 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 322.8 ms > bar 288.5 ms |
| chrome | press_key | cua:per-request | 331.4 | 268.5 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 331.4 ms > bar 288.5 ms; cua:per-request: warm 268.5 ms > bar 235.8 ms |
| chrome | press_key | cua:none | 231.6 | 167.7 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none: the effect was not verified |
| chrome | press_key | cua:settle0 | 225.4 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:teardown0 | 247.7 | 67.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:pace0 | 259 | 101.3 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:none-pace0 | 155.4 | 101.3 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none-pace0: the effect was not verified |
| chrome | press_key | cua:fast | 53.2 | 1.1 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:fast: the effect was not verified |
| chrome | press_key | **bar** | 288.5 | 235.8 | | | | | | | | |
| chrome | click | pinned | 273.1 | 214.9 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 283.3 | 215.2 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 276.6 | 113.9 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 276.6 ms > bar 273.1 ms |
| chrome | click | cua:per-request | 273.8 | 214.9 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 273.8 ms > bar 273.1 ms |
| chrome | click | cua:none | 171.4 | 114.1 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none: the effect was not verified |
| chrome | click | cua:settle0 | 172.7 | 113.9 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:teardown0 | 176.5 | 14.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:pace0 | 269.7 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:none-pace0 | 173.3 | 114 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none-pace0: the effect was not verified |
| chrome | click | cua:fast | 72.1 | 14.3 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:fast: the effect was not verified |
| chrome | click | **bar** | 273.1 | 214.9 | | | | | | | | |

run valid, finished 2026-10-28T13:01:43.465Z

## m0-input-visible

commit fc79391d096b4353739779b3cac8e1f52d9917c8; cua-engine 0.0.1 (fc79391d096b); occlusion visible; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:teardown0` = `--teardown-ms 0`; `cua:pace0` = `--key-pace-ms 0`; `cua:none-pace0` = `--retention none --settle-ms 0 --key-pace-ms 0`; `cua:fast` = `--retention none --settle-ms 0 --teardown-ms 0 --key-pace-ms 0`

negative check: the witness failed the activating stub (active, stacking, focus); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | press_key | pinned | 348.2 | 269.5 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 311.2 | 236.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 351.4 | 167.8 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 351.4 ms > bar 311.2 ms |
| gedit | press_key | cua:per-request | 355 | 268.9 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 355 ms > bar 311.2 ms; cua:per-request: warm 268.9 ms > bar 236.4 ms |
| gedit | press_key | cua:none | 249.3 | 167.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:settle0 | 251.8 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:teardown0 | 246.6 | 67.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:pace0 | 302.8 | 101.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:none-pace0 | 178.9 | 101.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:fast | 70.6 | 1.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 311.2 | 236.4 | | | | | | | | |
| gedit | click | pinned | 219.2 | 215.6 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 224.4 | 217.2 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 219.7 | 114.3 | 15 | – | – | – | 18/18 | – | – | FAIL: cua: cold 219.7 ms > bar 219.2 ms |
| gedit | click | cua:per-request | 221.2 | 215.7 | 15 | – | – | – | 18/18 | – | – | FAIL: cua:per-request: cold 221.2 ms > bar 219.2 ms; cua:per-request: warm 215.7 ms > bar 215.6 ms |
| gedit | click | cua:none | 117.4 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:settle0 | 117.3 | 113.9 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:teardown0 | 118.8 | 13.8 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:pace0 | 218.5 | 113.9 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none-pace0 | 118 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:fast | 16.8 | 13.7 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 219.2 | 215.6 | | | | | | | | |
| chrome | press_key | pinned | 344.4 | 270 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 299.3 | 236.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 334.7 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 334.7 ms > bar 299.3 ms |
| chrome | press_key | cua:per-request | 328.1 | 269.2 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 328.1 ms > bar 299.3 ms; cua:per-request: warm 269.2 ms > bar 236.4 ms |
| chrome | press_key | cua:none | 230.3 | 167.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:settle0 | 241.3 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:teardown0 | 236.7 | 67.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:pace0 | 275.2 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:none-pace0 | 162.4 | 101.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:fast | 73.7 | 1.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | **bar** | 299.3 | 236.4 | | | | | | | | |
| chrome | click | pinned | 277.5 | 215.6 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 296.4 | 216 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 274.7 | 114.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:per-request | 283.5 | 215.5 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 283.5 ms > bar 277.5 ms |
| chrome | click | cua:none | 174.2 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:settle0 | 177.4 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:teardown0 | 196.9 | 13.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:pace0 | 277.6 | 114.2 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:pace0: cold 277.6 ms > bar 277.5 ms |
| chrome | click | cua:none-pace0 | 181.5 | 114.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:fast | 74.3 | 13.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | **bar** | 277.5 | 215.6 | | | | | | | | |

run valid, finished 2026-10-28T13:05:33.037Z

## m0-choice

commit fc79391d096b4353739779b3cac8e1f52d9917c8; cua-engine 0.0.1 (fc79391d096b); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:choice` = `--window-calls 32 --settle-ms 40 --key-pace-ms 0`

negative check: the witness failed the activating stub (active, stacking, focus); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| desktop | list_windows | pinned | 96.2 | 87.9 | 21 | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 91.6 | 81.5 | 21 | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 12.2 | 5.9 | 21 | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | cua:choice | 10.9 | 6.3 | 21 | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 91.6 | 81.5 | | | | | | | | |
| gedit | tree | pinned | 541.1 | 553.6 | 21 | 3189 / 3189 | 3189 / 3189 | – | 24/24 | – | 24/24 |  |
| gedit | tree | newest | 529.6 | 545.4 | 21 | 3189 / 3189 | 3189 / 3189 | – | 24/24 | – | 24/24 |  |
| gedit | tree | cua | 74 | 62.4 | 21 | 3189 / 3188 | 27 / 26 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:choice | 90.4 | 69.7 | 21 | 3189 / 3188 | 25 / 22 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | **bar** | 529.6 | 545.4 | | | | | | | | |
| gedit | tree_shot | pinned | 726.6 | 678 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | newest | 664.9 | 690.3 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | cua | 218.1 | 95.9 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:choice | 154.5 | 93.1 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 664.9 | 678 | | | | | | | | |
| gedit | press_key | pinned | 357.5 | 268.6 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 301.9 | 235.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 343.6 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 343.6 ms > bar 301.9 ms |
| gedit | press_key | cua:choice | 220.8 | 101.3 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 301.9 | 235.4 | | | | | | | | |
| gedit | click | pinned | 219.1 | 214.8 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 221.3 | 215.5 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 219.2 | 114 | 15 | – | – | – | 18/18 | – | – | FAIL: cua: cold 219.2 ms > bar 219.1 ms |
| gedit | click | cua:choice | 159.3 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 219.1 | 214.8 | | | | | | | | |
| chrome | tree | pinned | 420.9 | 412.1 | 21 | 2241 / 2241 | 2241 / 2241 | – | 24/24 | – | 24/24 |  |
| chrome | tree | newest | 445.8 | 405.1 | 21 | 2241 / 2241 | 2241 / 2241 | – | 24/24 | – | 24/24 |  |
| chrome | tree | cua | 66.8 | 52.3 | 21 | 2241 / 2240 | 19 / 18 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:choice | 65.1 | 48.8 | 21 | 2241 / 2240 | 17 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | **bar** | 420.9 | 405.1 | | | | | | | | |
| chrome | tree_shot | pinned | 553.5 | 565 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | newest | 537.5 | 549.2 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | cua | 195 | 77.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:choice | 125.5 | 78 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 537.5 | 549.2 | | | | | | | | |
| chrome | press_key | pinned | 328.2 | 269.2 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 293.6 | 236 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 327.2 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 327.2 ms > bar 293.6 ms |
| chrome | press_key | cua:choice | 200.6 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | **bar** | 293.6 | 236 | | | | | | | | |
| chrome | click | pinned | 268.4 | 214.6 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 282.9 | 215.3 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 270.5 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 270.5 ms > bar 268.4 ms |
| chrome | click | cua:choice | 221.2 | 114.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | **bar** | 268.4 | 214.6 | | | | | | | | |
| over-budget | tree | pinned | 7096 | 7080.5 | 21 | 45053 / 45053 | 45053 / 45053 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | newest | 7498.7 | 6972.6 | 21 | 45053 / 45053 | 45053 / 45053 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | cua | 943.6 | 910.2 | 21 | 45296 / 45289 | 44 / 61 | 285 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:choice | 978 | 919 | 21 | 45140 / 45165 | 107 / 87 | 114 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | **bar** | 7096 | 6972.6 | | | | | | | | |
| big-text | tree | pinned | 443.8 | 466 | 21 | 2046 / 2046 | 2046 / 2046 | – | 24/24 | – | 24/24 |  |
| big-text | tree | newest | 485.8 | 470.8 | 21 | 2046 / 2046 | 2046 / 2046 | – | 24/24 | – | 24/24 |  |
| big-text | tree | cua | 114.6 | 101.5 | 21 | 2046 / 2045 | 18 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:choice | 115.1 | 108.6 | 21 | 2046 / 2045 | 19 / 25 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | **bar** | 443.8 | 466 | | | | | | | | |

Window screenshots against the pinned build's (each engine's own window):
- gedit cua: 910×756 vs 910×756, mean absolute pixel difference 0.325
- gedit cua:choice: 910×756 vs 910×756, mean absolute pixel difference 0.3482
- chrome cua: 1050×780 vs 1050×780, mean absolute pixel difference 0
- chrome cua:choice: 1050×780 vs 1050×780, mean absolute pixel difference 0

Over-budget retained native ids:
- cua: equal to the pinned build's
- cua:choice: equal to the pinned build's

run valid, finished 2026-10-28T13:17:35.589Z

