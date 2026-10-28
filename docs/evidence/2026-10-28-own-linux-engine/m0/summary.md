# linux-engine-diff summary

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

## m0-tree

commit f637fcfadeed8f8c05efa1aeb566eca79142e1db; cua-engine 0.0.1 (f637fcfadeed); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:seq` = `--tree sequential --bus per-request`; `cua:cache` = `--tree cache`; `cua:W8` = `--window-calls 8`; `cua:W16` = `--window-calls 16`; `cua:W32` = `--window-calls 32`; `cua:W128` = `--window-calls 128`; `cua:W256` = `--window-calls 256`; `cua:R64K` = `--window-bytes 65536`; `cua:R256K` = `--window-bytes 262144`; `cua:R1M` = `--window-bytes 1048576`; `cua:R16M` = `--window-bytes 16777216`; `cua:res1K` = `--call-reservation 1024`; `cua:res16K` = `--call-reservation 16384`; `cua:R256K-res16K` = `--window-bytes 262144 --call-reservation 16384`; `cua:slack4` = `--slack-nodes 4`; `cua:slack64` = `--slack-nodes 64`

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | tree | pinned | 546.3 | 566 | 21 | 3185 / 3185 | 3185 / 3185 | – | 24/24 | – | 24/24 |  |
| gedit | tree | newest | 494.6 | 499.2 | 21 | 3185 / 3185 | 3185 / 3185 | – | 24/24 | – | 24/24 |  |
| gedit | tree | cua | 71 | 55.6 | 21 | 3185 / 3184 | 20 / 21 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:seq | 448.1 | 484 | 21 | 3185 / 3185 | 3185 / 3185 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:cache | 68.6 | 60.9 | 21 | 3186 / 3185 | 19 / 21 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W8 | 90.7 | 86 | 21 | 3185 / 3184 | 144 / 80 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W16 | 69.5 | 73.2 | 21 | 3185 / 3184 | 45 / 36 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W32 | 75.4 | 60.8 | 21 | 3185 / 3184 | 38 / 23 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W128 | 72.5 | 58.6 | 21 | 3185 / 3184 | 16 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:W256 | 59 | 57.2 | 21 | 3185 / 3184 | 22 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R64K | 75.2 | 63.7 | 21 | 3185 / 3184 | 36 / 31 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R256K | 60 | 59.4 | 21 | 3185 / 3184 | 20 / 29 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R1M | 71.5 | 56.3 | 21 | 3185 / 3184 | 29 / 23 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R16M | 71.2 | 63.3 | 21 | 3185 / 3184 | 15 / 22 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:res1K | 72.8 | 62.5 | 21 | 3185 / 3184 | 27 / 22 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:res16K | 66.9 | 59.3 | 21 | 3185 / 3184 | 21 / 21 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:R256K-res16K | 71.6 | 68.8 | 21 | 3185 / 3184 | 53 / 49 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:slack4 | 68.5 | 65.1 | 21 | 3185 / 3184 | 69 / 84 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:slack64 | 68.1 | 58.9 | 21 | 3185 / 3184 | 33 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | **bar** | 494.6 | 499.2 | | | | | | | | |
| chrome | tree | pinned | 403.4 | 395.2 | 21 | 2222 / 2222 | 2222 / 2222 | – | 24/24 | – | 24/24 |  |
| chrome | tree | newest | 381 | 402.9 | 21 | 2222 / 2222 | 2222 / 2222 | – | 24/24 | – | 24/24 |  |
| chrome | tree | cua | 72.1 | 47.7 | 21 | 2222 / 2221 | 12 / 10 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:seq | 354.5 | 363.8 | 21 | 2222 / 2222 | 2222 / 2222 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:cache | 61.1 | 42.8 | 21 | 2223 / 2222 | 16 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W8 | 67.3 | 60.2 | 21 | 2222 / 2221 | 19 / 36 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W16 | 53 | 49 | 21 | 2222 / 2221 | 31 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W32 | 53 | 51.7 | 21 | 2222 / 2221 | 12 / 16 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W128 | 53.1 | 49.6 | 21 | 2222 / 2221 | 13 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:W256 | 55.9 | 49.1 | 21 | 2222 / 2221 | 12 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R64K | 67.3 | 54.1 | 21 | 2222 / 2221 | 27 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R256K | 51.2 | 46.2 | 21 | 2222 / 2221 | 14 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R1M | 49.3 | 49.6 | 21 | 2222 / 2221 | 14 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R16M | 53.9 | 50.1 | 21 | 2222 / 2221 | 15 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:res1K | 55.6 | 46.8 | 21 | 2222 / 2221 | 13 / 10 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:res16K | 60.5 | 47.2 | 21 | 2222 / 2221 | 17 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:R256K-res16K | 68.4 | 50.3 | 21 | 2222 / 2221 | 11 / 28 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:slack4 | 54.1 | 46 | 21 | 2222 / 2221 | 16 / 18 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:slack64 | 67.9 | 45.5 | 21 | 2222 / 2221 | 11 / 11 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | **bar** | 381 | 395.2 | | | | | | | | |
| over-budget | tree | pinned | 7054.4 | 6906.4 | 21 | 45034 / 45034 | 45034 / 45034 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | newest | 6791.9 | 6959.1 | 21 | 45034 / 45034 | 45034 / 45034 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | cua | 860.1 | 880.4 | 21 | 45277 / 45293 | 26 / 31 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:seq | 6740.8 | 6976.9 | 21 | 45034 / 45034 | 45034 / 45034 | 0 | 24/24 | – | 24/24 | FAIL: cua:seq: warm 6976.9 ms > bar 6906.4 ms |
| over-budget | tree | cua:cache | 894.7 | 903.3 | 21 | 45284 / 45277 | 97 / 27 | 263 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W8 | 1230.3 | 1289.6 | 21 | 45039 / 45039 | 963 / 1001 | 10 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W16 | 1019.4 | 1028.4 | 21 | 45077 / 45075 | 189 / 316 | 60 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W32 | 908.1 | 907.1 | 21 | 45124 / 45125 | 102 / 155 | 128 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W128 | 920.9 | 880.1 | 21 | 45340 / 45375 | 81 / 65 | 348 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:W256 | 909.7 | 887.6 | 21 | 45346 / 45345 | 43 / 69 | 348 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R64K | 1053.8 | 1036.4 | 21 | 45076 / 45069 | 157 / 218 | 53 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R256K | 905.6 | 900.2 | 21 | 45283 / 45276 | 26 / 33 | 255 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R1M | 888.7 | 924.5 | 21 | 45282 / 45270 | 39 / 41 | 252 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R16M | 926.4 | 901.3 | 21 | 45279 / 45276 | 24 / 21 | 285 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:res1K | 940.4 | 927.7 | 21 | 45283 / 45280 | 41 / 32 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:res16K | 933.7 | 914.5 | 21 | 45283 / 45280 | 34 / 43 | 258 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:R256K-res16K | 1039.5 | 969.8 | 21 | 45070 / 45076 | 220 / 144 | 52 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:slack4 | 955.6 | 945.9 | 21 | 45157 / 45150 | 120 / 118 | 129 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:slack64 | 931.4 | 929 | 21 | 45297 / 45275 | 24 / 42 | 266 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6791.9 | 6906.4 | | | | | | | | |
| big-text | tree | pinned | 411 | 403.7 | 21 | 2027 / 2027 | 2027 / 2027 | – | 24/24 | – | 24/24 |  |
| big-text | tree | newest | 436.2 | 409.6 | 21 | 2027 / 2027 | 2027 / 2027 | – | 24/24 | – | 24/24 |  |
| big-text | tree | cua | 114.6 | 96.2 | 21 | 2027 / 2026 | 17 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:seq | 525.1 | 388.8 | 21 | 2027 / 2027 | 2027 / 2027 | 0 | 24/24 | – | 24/24 | FAIL: cua:seq: cold 525.1 ms > bar 411 ms |
| big-text | tree | cua:cache | 102.2 | 96.6 | 21 | 2028 / 2027 | 17 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W8 | 120.8 | 107.3 | 21 | 2027 / 2026 | 28 / 38 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W16 | 106.8 | 98.6 | 21 | 2027 / 2026 | 23 / 18 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W32 | 108 | 96.6 | 21 | 2027 / 2026 | 20 / 22 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W128 | 107.7 | 99.6 | 21 | 2027 / 2026 | 13 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:W256 | 101.6 | 110.5 | 21 | 2027 / 2026 | 14 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R64K | 128.7 | 97 | 21 | 2027 / 2026 | 16 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R256K | 111 | 96.2 | 21 | 2027 / 2026 | 13 / 13 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R1M | 102.8 | 97.6 | 21 | 2027 / 2026 | 15 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R16M | 106 | 90.2 | 21 | 2027 / 2026 | 15 / 14 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:res1K | 105.2 | 91.2 | 21 | 2027 / 2026 | 15 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:res16K | 104.8 | 92.8 | 21 | 2027 / 2026 | 14 / 12 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:R256K-res16K | 116.1 | 99.1 | 21 | 2027 / 2026 | 15 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:slack4 | 112.5 | 101.2 | 21 | 2027 / 2026 | 12 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:slack64 | 99.8 | 98.7 | 21 | 2027 / 2026 | 16 / 15 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | **bar** | 411 | 403.7 | | | | | | | | |

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

run valid; **FAIL**: over-budget tree cua:seq, big-text tree cua:seq, finished 2026-10-28T14:02:59.379Z

## m0-shot

commit f637fcfadeed8f8c05efa1aeb566eca79142e1db; cua-engine 0.0.1 (f637fcfadeed); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:settle20` = `--settle-ms 20`; `cua:settle50` = `--settle-ms 50`

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | tree_shot | pinned | 678.8 | 699.6 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | newest | 726.8 | 738.9 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | cua | 228.6 | 90.5 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:per-request | 209.2 | 203.8 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:none | 93.6 | 87.5 | 21 | – | – | 0 | 24/24 | – | 0/24 | FAIL: cua:none: the output differs from the vendor's |
| gedit | tree_shot | cua:settle0 | 114.9 | 86.6 | 21 | – | – | 0 | 24/24 | – | 21/24 | FAIL: cua:settle0: the output differs from the vendor's |
| gedit | tree_shot | cua:settle20 | 125.8 | 87.4 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:settle50 | 139.3 | 84.5 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 678.8 | 699.6 | | | | | | | | |
| chrome | tree_shot | pinned | 544.2 | 588.2 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | newest | 662.7 | 572.4 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | cua | 202.7 | 79.2 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:per-request | 191.2 | 188 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:none | 82.8 | 82 | 21 | – | – | 0 | 24/24 | – | 0/24 | FAIL: cua:none: the output differs from the vendor's |
| chrome | tree_shot | cua:settle0 | 93.6 | 88.2 | 21 | – | – | 0 | 24/24 | – | 21/24 | FAIL: cua:settle0: the output differs from the vendor's |
| chrome | tree_shot | cua:settle20 | 112.2 | 80.9 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:settle50 | 135.3 | 84.3 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 544.2 | 572.4 | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| gedit | cua:per-request | 24/24 | 0 | 0 |  |
| gedit | cua:none | 0/24 | 651019 | 252.0201 | block 0 sample 0: 651019 of 651560 pixels differ (mean 252.0201) |
| gedit | cua:settle0 | 21/24 | 651019 | 252.0201 | block 0 sample 0: 651019 of 651560 pixels differ (mean 252.0201) |
| gedit | cua:settle20 | 24/24 | 0 | 0 |  |
| gedit | cua:settle50 | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| chrome | cua:per-request | 24/24 | 0 | 0 |  |
| chrome | cua:none | 0/24 | 774229 | 230.7449 | block 0 sample 0: 774229 of 777000 pixels differ (mean 230.7449) |
| chrome | cua:settle0 | 21/24 | 31451 | 21.6998 | block 0 sample 0: 31451 of 777000 pixels differ (mean 21.6998) |
| chrome | cua:settle20 | 24/24 | 0 | 0 |  |
| chrome | cua:settle50 | 24/24 | 0 | 0 |  |

run valid; **FAIL**: gedit tree_shot cua:none, gedit tree_shot cua:settle0, chrome tree_shot cua:none, chrome tree_shot cua:settle0, finished 2026-10-28T14:05:13.510Z

## m0-input-covered

commit f637fcfadeed8f8c05efa1aeb566eca79142e1db; cua-engine 0.0.1 (f637fcfadeed); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:teardown0` = `--teardown-ms 0`; `cua:pace0` = `--key-pace-ms 0`; `cua:none-pace0` = `--retention none --settle-ms 0 --key-pace-ms 0`; `cua:fast` = `--retention none --settle-ms 0 --teardown-ms 0 --key-pace-ms 0`

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | press_key | pinned | 272.3 | 268.7 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 238.7 | 235.5 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 270.4 | 167.5 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 270.4 ms > bar 238.7 ms |
| gedit | press_key | cua:per-request | 270.8 | 268.5 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 270.8 ms > bar 238.7 ms; cua:per-request: warm 268.5 ms > bar 235.5 ms |
| gedit | press_key | cua:none | 170.2 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:settle0 | 170.1 | 167.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:teardown0 | 170 | 67.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:pace0 | 204.3 | 101.3 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:none-pace0 | 103.3 | 101.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:fast | 3 | 1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 238.7 | 235.5 | | | | | | | | |
| gedit | click | pinned | 218.3 | 214.9 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 220.4 | 215.5 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 216.7 | 114.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:per-request | 217 | 214.6 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none | 116.3 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:settle0 | 117.4 | 114.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:teardown0 | 116.8 | 13.7 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:pace0 | 216.9 | 114.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none-pace0 | 116.6 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:fast | 16.3 | 13.9 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 218.3 | 214.9 | | | | | | | | |
| chrome | press_key | pinned | 272.9 | 269.2 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 239 | 236 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 270.4 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 270.4 ms > bar 239 ms |
| chrome | press_key | cua:per-request | 270.9 | 268.4 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 270.9 ms > bar 239 ms; cua:per-request: warm 268.4 ms > bar 236 ms |
| chrome | press_key | cua:none | 170.1 | 167.6 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none: the effect was not verified |
| chrome | press_key | cua:settle0 | 171.4 | 167.9 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:teardown0 | 171.6 | 67.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:pace0 | 204.4 | 101.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:none-pace0 | 103.9 | 101.5 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none-pace0: the effect was not verified |
| chrome | press_key | cua:fast | 3.2 | 1.1 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:fast: the effect was not verified |
| chrome | press_key | **bar** | 239 | 236 | | | | | | | | |
| chrome | click | pinned | 218.2 | 214.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 219.1 | 215.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 216.8 | 113.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:per-request | 217.9 | 215 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: warm 215 ms > bar 214.8 ms |
| chrome | click | cua:none | 116.6 | 114 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none: the effect was not verified |
| chrome | click | cua:settle0 | 117.6 | 114.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:teardown0 | 117.4 | 14.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:pace0 | 217.8 | 114.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:none-pace0 | 116.9 | 114.2 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:none-pace0: the effect was not verified |
| chrome | click | cua:fast | 17.2 | 14.2 | 15 | – | – | – | 18/18 | 0/18 | – | FAIL: cua:fast: the effect was not verified |
| chrome | click | **bar** | 218.2 | 214.8 | | | | | | | | |

run valid; **FAIL**: gedit press_key cua, gedit press_key cua:per-request, chrome press_key cua, chrome press_key cua:per-request, chrome press_key cua:none, chrome press_key cua:none-pace0, chrome press_key cua:fast, chrome click cua:per-request, chrome click cua:none, chrome click cua:none-pace0, chrome click cua:fast, finished 2026-10-28T14:11:38.658Z

## m0-input-visible

commit f637fcfadeed8f8c05efa1aeb566eca79142e1db; cua-engine 0.0.1 (f637fcfadeed); occlusion visible; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:per-request` = `--retention per-request`; `cua:none` = `--retention none --settle-ms 0`; `cua:settle0` = `--settle-ms 0`; `cua:teardown0` = `--teardown-ms 0`; `cua:pace0` = `--key-pace-ms 0`; `cua:none-pace0` = `--retention none --settle-ms 0 --key-pace-ms 0`; `cua:fast` = `--retention none --settle-ms 0 --teardown-ms 0 --key-pace-ms 0`

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| gedit | press_key | pinned | 272.6 | 269.7 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 240.3 | 236.6 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 271.8 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 271.8 ms > bar 240.3 ms |
| gedit | press_key | cua:per-request | 271.7 | 269 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 271.7 ms > bar 240.3 ms; cua:per-request: warm 269 ms > bar 236.6 ms |
| gedit | press_key | cua:none | 170.4 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:settle0 | 171.6 | 168.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:teardown0 | 171.6 | 67.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:pace0 | 204.5 | 101.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:none-pace0 | 105.3 | 101.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | cua:fast | 3.4 | 1.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 240.3 | 236.6 | | | | | | | | |
| gedit | click | pinned | 219.1 | 215.6 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 219.6 | 216 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 217.4 | 114.3 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:per-request | 217.9 | 215.4 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none | 116.5 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:settle0 | 117.9 | 114.7 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:teardown0 | 117.9 | 14.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:pace0 | 217.5 | 114.1 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:none-pace0 | 116.9 | 114.2 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:fast | 16 | 13.9 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 219.1 | 215.6 | | | | | | | | |
| chrome | press_key | pinned | 273.3 | 269.5 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 241.4 | 236.6 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 271.6 | 167.6 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 271.6 ms > bar 241.4 ms |
| chrome | press_key | cua:per-request | 271.2 | 269 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: cold 271.2 ms > bar 241.4 ms; cua:per-request: warm 269 ms > bar 236.6 ms |
| chrome | press_key | cua:none | 170.1 | 167.6 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:settle0 | 170.8 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:teardown0 | 171.6 | 67.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:pace0 | 204.7 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:none-pace0 | 103.7 | 101.5 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | cua:fast | 3.5 | 1.1 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | **bar** | 241.4 | 236.6 | | | | | | | | |
| chrome | click | pinned | 219.5 | 215.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 220.3 | 215.9 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 217.4 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:per-request | 218.2 | 215.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua:per-request: warm 215.7 ms > bar 215.4 ms |
| chrome | click | cua:none | 116.4 | 113.8 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:settle0 | 117.1 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:teardown0 | 117.3 | 13.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:pace0 | 217.2 | 113.9 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:none-pace0 | 116.2 | 114.2 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:fast | 16.2 | 13.7 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | **bar** | 219.5 | 215.4 | | | | | | | | |

run valid; **FAIL**: gedit press_key cua, gedit press_key cua:per-request, chrome press_key cua, chrome press_key cua:per-request, chrome click cua:per-request, finished 2026-10-28T14:15:27.979Z

## m0-choice

commit f637fcfadeed8f8c05efa1aeb566eca79142e1db; cua-engine 0.0.1 (f637fcfadeed); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:choice` = `--window-calls 32 --settle-ms 40 --key-pace-ms 0`

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit is M1a's

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| desktop | list_windows | pinned | 92.3 | 70.3 | 21 | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 100.7 | 80.9 | 21 | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 9.3 | 5.3 | 21 | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | cua:choice | 9.1 | 4.5 | 21 | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 92.3 | 70.3 | | | | | | | | |
| gedit | tree | pinned | 567.5 | 554.1 | 21 | 3189 / 3189 | 3189 / 3189 | – | 24/24 | – | 24/24 |  |
| gedit | tree | newest | 553.4 | 580 | 21 | 3189 / 3189 | 3189 / 3189 | – | 24/24 | – | 24/24 |  |
| gedit | tree | cua | 87.4 | 69 | 21 | 3189 / 3188 | 22 / 25 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | cua:choice | 78.2 | 66.2 | 21 | 3189 / 3188 | 41 / 27 | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree | **bar** | 553.4 | 554.1 | | | | | | | | |
| gedit | tree_shot | pinned | 671.5 | 711.6 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | newest | 633.6 | 659.1 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| gedit | tree_shot | cua | 197.2 | 85.6 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | cua:choice | 145 | 91.7 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 633.6 | 659.1 | | | | | | | | |
| gedit | press_key | pinned | 273.6 | 268.7 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | newest | 239.9 | 235.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| gedit | press_key | cua | 272.7 | 167.7 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 272.7 ms > bar 239.9 ms |
| gedit | press_key | cua:choice | 145.6 | 101.3 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| gedit | press_key | **bar** | 239.9 | 235.8 | | | | | | | | |
| gedit | click | pinned | 219.5 | 214.8 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | newest | 221.4 | 215.4 | 15 | – | – | – | 18/18 | – | – |  |
| gedit | click | cua | 219.1 | 114.3 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | cua:choice | 159 | 114 | 15 | – | – | – | 18/18 | – | – | PASS |
| gedit | click | **bar** | 219.5 | 214.8 | | | | | | | | |
| chrome | tree | pinned | 445.8 | 471.1 | 21 | 2241 / 2241 | 2241 / 2241 | – | 24/24 | – | 24/24 |  |
| chrome | tree | newest | 431.3 | 442.2 | 21 | 2241 / 2241 | 2241 / 2241 | – | 24/24 | – | 24/24 |  |
| chrome | tree | cua | 63.1 | 50.3 | 21 | 2241 / 2240 | 19 / 16 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | cua:choice | 53.2 | 52.6 | 21 | 2241 / 2240 | 16 / 21 | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree | **bar** | 431.3 | 442.2 | | | | | | | | |
| chrome | tree_shot | pinned | 595.1 | 571.2 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | newest | 581 | 575.6 | 21 | – | – | – | 24/24 | – | 24/24 |  |
| chrome | tree_shot | cua | 207.8 | 75.9 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | cua:choice | 137.6 | 98.5 | 21 | – | – | 0 | 24/24 | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 581 | 571.2 | | | | | | | | |
| chrome | press_key | pinned | 274.4 | 268.9 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | newest | 241.9 | 235.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | press_key | cua | 272.2 | 167.5 | 15 | – | – | – | 18/18 | 18/18 | – | FAIL: cua: cold 272.2 ms > bar 241.9 ms |
| chrome | press_key | cua:choice | 146.5 | 101.4 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | press_key | **bar** | 241.9 | 235.8 | | | | | | | | |
| chrome | click | pinned | 219.9 | 214.8 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | newest | 220.5 | 215.4 | 15 | – | – | – | 18/18 | 18/18 | – |  |
| chrome | click | cua | 218.5 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | cua:choice | 158.5 | 114 | 15 | – | – | – | 18/18 | 18/18 | – | PASS |
| chrome | click | **bar** | 219.9 | 214.8 | | | | | | | | |
| over-budget | tree | pinned | 6826.1 | 7114.7 | 21 | 45053 / 45053 | 45053 / 45053 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | newest | 7030.2 | 6974.2 | 21 | 45053 / 45053 | 45053 / 45053 | – | 24/24 | – | 24/24 |  |
| over-budget | tree | cua | 884.5 | 898 | 21 | 45308 / 45297 | 41 / 24 | 252 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | cua:choice | 914.5 | 920.7 | 21 | 45153 / 45142 | 69 / 75 | 124 | 24/24 | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6826.1 | 6974.2 | | | | | | | | |
| big-text | tree | pinned | 446 | 461.2 | 21 | 2046 / 2046 | 2046 / 2046 | – | 24/24 | – | 24/24 |  |
| big-text | tree | newest | 477.9 | 482.1 | 21 | 2046 / 2046 | 2046 / 2046 | – | 24/24 | – | 24/24 |  |
| big-text | tree | cua | 120.9 | 98.7 | 21 | 2046 / 2045 | 20 / 17 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | cua:choice | 127.3 | 105.6 | 21 | 2046 / 2045 | 21 / 16 | 0 | 24/24 | – | 24/24 | PASS |
| big-text | tree | **bar** | 446 | 461.2 | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| gedit | cua:choice | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| chrome | cua:choice | 24/24 | 0 | 0 |  |

Over-budget retained native ids:
- cua: equal to the pinned build's
- cua:choice: equal to the pinned build's

run valid; **FAIL**: gedit press_key cua, chrome press_key cua, finished 2026-10-28T14:27:31.531Z

