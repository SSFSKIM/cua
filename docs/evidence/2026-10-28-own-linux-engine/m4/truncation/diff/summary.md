# linux-engine-diff summary

## t3-truncation-dev2

commit 7b2077e4bfd436f8d5b3fc929e84f7cf95192f26; cua-engine 0.3.0 (7b2077e4bfd4); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 538.8 | 592.8 | 21 | 3187 / 3187 | 3187 / 3187 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 523.8 | 546.3 | 21 | 3187 / 3187 | 3187 / 3187 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 84.6 | 72.7 | 21 | 3187 / 3186 | 110 / 82 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-461.28, -416.765]; warm faster [-537.92, -448.87]) |
| gedit | tree | **bar** | 523.8 | 546.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 656.1 | 675.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 656.7 | 717.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 126.1 | 102.8 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-543.62, -510.245]; warm faster [-629.45, -553.42]) |
| gedit | tree_shot | **bar** | 656.1 | 675.1 | | | | | | | | | |
| chrome | tree | pinned | 424.6 | 414.3 | 21 | 2230 / 2230 | 2230 / 2230 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 423.2 | 433.6 | 21 | 2230 / 2230 | 2230 / 2230 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 62.6 | 58.4 | 21 | 2230 / 2229 | 33 / 35 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-374.44, -340.49]; warm faster [-365.54, -333.31]) |
| chrome | tree | **bar** | 423.2 | 414.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 563.9 | 609.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 561 | 582.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 112.4 | 89.6 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-483.39, -424.49]; warm faster [-543.07, -473.95]) |
| chrome | tree_shot | **bar** | 561 | 582.3 | | | | | | | | | |
| over-budget | tree | pinned | 6997.6 | 6990.5 | 21 | 45042 / 45042 | 45042 / 45042 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 6955.6 | 7200.5 | 21 | 45042 / 45042 | 45042 / 45042 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 958.4 | 986.1 | 21 | 45224 / 45229 | 207 / 218 | 189 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6233.95, -5815.765]; warm faster [-6086.7, -5769.66]) (declared: tree) |
| over-budget | tree | **bar** | 6955.6 | 6990.5 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 0 | 0 |  |
| gedit | cua | 41/41 | 0 | 0 |  |
| chrome | pinned | 41/41 | 0 | 0 |  |
| chrome | newest | 41/41 | 0 | 0 |  |
| chrome | cua | 41/41 | 0 | 0 |  |

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 615 samples, against the run's cap of 1% (6.15).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T03:09:18.043Z

