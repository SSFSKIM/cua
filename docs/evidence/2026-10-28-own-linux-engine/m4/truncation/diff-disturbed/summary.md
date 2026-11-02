# linux-engine-diff summary

## t3-truncation-dev

commit 402be2ec2fc6fcac023391410c8da4b30c21667d; cua-engine 0.3.0 (402be2ec2fc6); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 564.7 | 565.3 | 21 | 3187 / 3187 | 3187 / 3187 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 575 | 507.3 | 21 | 3187 / 3187 | 3187 / 3187 | – | 40/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 82.5 | 77.1 | 21 | 3187 / 3186 | 77 / 73 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-498.485, -454.71]; warm faster [-475.24, -417.89]) |
| gedit | tree | **bar** | 564.7 | 507.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 708.3 | 683.7 | 21 | – | – | – | 40/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 701.1 | 659.1 | 21 | – | – | – | 39/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 133.1 | 103.6 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-624.625, -520.33]; warm faster [-578.41, -543.07]) |
| gedit | tree_shot | **bar** | 701.1 | 659.1 | | | | | | | | | |
| chrome | tree | pinned | 418.5 | 411.7 | 21 | 2230 / 2230 | 2230 / 2230 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 419.2 | 430.2 | 21 | 2230 / 2230 | 2230 / 2230 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 72.3 | 60.8 | 21 | 2230 / 2229 | 23 / 27 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-367.69, -330.115]; warm faster [-395.53, -327.97]) |
| chrome | tree | **bar** | 418.5 | 411.7 | | | | | | | | | |
| chrome | tree_shot | pinned | 510 | 560.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 515.4 | 582.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 113.5 | 82.9 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-421.365, -386.39]; warm faster [-516.29, -457.29]) |
| chrome | tree_shot | **bar** | 510 | 560.2 | | | | | | | | | |
| over-budget | tree | pinned | 7149.2 | 6900.5 | 21 | 45042 / 45042 | 45042 / 45042 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7035 | 7373.8 | 21 | 45042 / 45042 | 45042 / 45042 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 969 | 1024.4 | 21 | 45219 / 45226 | 203 / 256 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6170.06, -5865.785]; warm faster [-6187.41, -5820.12]) (declared: tree) |
| over-budget | tree | **bar** | 7035 | 6900.5 | | | | | | | | | |

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

run valid; every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T02:52:27.643Z

