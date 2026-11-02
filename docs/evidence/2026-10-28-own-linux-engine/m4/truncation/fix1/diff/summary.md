# linux-engine-diff summary

## t3-fix1-generic (development run, not a release gate)

commit d4a8ba7ec5b2c1e979214677369e0e2de5775f36; cua-engine 0.3.0 (e112f4f37f6b); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 76ab258416ca09c97d06c379ed3e2c19748aef19f29497986ce248965b2cf3a9, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (e112f4f37f6b); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 599.3 | 617.4 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 569.7 | 573.6 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.1 | 76.4 | 21 | 3189 / 3188 | 76 / 62 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-500.96, -458.415]; warm faster [-515.38, -486.34]) |
| gedit | tree | **bar** | 569.7 | 573.6 | | | | | | | | | |
| gedit | tree_shot | pinned | 717.3 | 746.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 728.3 | 821.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 128 | 103.9 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-608.95, -561.47]; warm faster [-721.83, -602.46]) |
| gedit | tree_shot | **bar** | 717.3 | 746.4 | | | | | | | | | |
| chrome | tree | pinned | 447.8 | 524.6 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 478.8 | 462.1 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 71 | 63.2 | 21 | 2247 / 2246 | 38 / 39 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-441.815, -363.025]; warm faster [-443.11, -387.42]) |
| chrome | tree | **bar** | 447.8 | 462.1 | | | | | | | | | |
| chrome | tree_shot | pinned | 618 | 583.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 676 | 579.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 118.2 | 93.9 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-550.8, -480.53]; warm faster [-495.41, -454.32]) |
| chrome | tree_shot | **bar** | 618 | 579.5 | | | | | | | | | |
| over-budget | tree | pinned | 7515.1 | 7324.9 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7274.5 | 7410.9 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 996.5 | 981.4 | 21 | 45240 / 45246 | 167 / 184 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6464.155, -6069.515]; warm faster [-6717.85, -6010.11]) (declared: tree) |
| over-budget | tree | **bar** | 7274.5 | 7324.9 | | | | | | | | | |
| big-text | tree | pinned | 504.2 | 495.9 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | newest | 515.3 | 467.2 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | cua | 119.7 | 118.8 | 21 | 2052 / 2051 | 32 / 32 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-438.335, -345.8]; warm faster [-373.48, -328.02]) |
| big-text | tree | **bar** | 504.2 | 467.2 | | | | | | | | | |
| gtk-table | tree | pinned | 283.7 | 295.2 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | newest | 294.5 | 283.8 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | cua | 90.6 | 93 | 21 | 937 / 936 | 290 / 285 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-244.545, -178.45]; warm faster [-217.97, -171.21]) |
| gtk-table | tree | **bar** | 283.7 | 283.8 | | | | | | | | | |
| calc | tree | pinned | 3825.9 | 3942.5 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | newest | 3658.9 | 3691.1 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | cua | 772.2 | 784 | 21 | 19853 / 19852 | 1243 / 1242 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-2996.78, -2768.21]; warm faster [-3082.83, -2837.08]) |
| calc | tree | **bar** | 3658.9 | 3691.1 | | | | | | | | | |
| retention | after_resize | pinned | 605.5 | 653.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 623.9 | 630.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 92.2 | 92.2 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-571.86, -488.645]; warm faster [-621.265, -514.62]) |
| retention | after_resize | **bar** | 605.5 | 630.8 | | | | | | | | | |
| retention | after_remap | pinned | 609.7 | 646.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 626.6 | 645.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 100.5 | 103.9 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-533.225, -484.685]; warm faster [-597.73, -519.93]) |
| retention | after_remap | **bar** | 609.7 | 645.7 | | | | | | | | | |
| retention | after_covered_change | pinned | 633 | 596.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 606.4 | 582.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 90.3 | 92.8 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-534.57, -490.46]; warm faster [-518.935, -481.33]) |
| retention | after_covered_change | **bar** | 606.4 | 582.3 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 0 | 0 |  |
| gedit | cua | 41/41 | 0 | 0 |  |
| chrome | pinned | 41/41 | 0 | 0 |  |
| chrome | newest | 41/41 | 0 | 0 |  |
| chrome | cua | 41/41 | 0 | 0 |  |
| retention | pinned | 120/120 | 0 | 0 |  |
| retention | newest | 120/120 | 0 | 0 |  |
| retention | cua | 120/120 | 0 | 0 |  |

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within
- big-text cua: within
- gtk-table cua: within
- calc cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1344 samples, against the run's cap of 1% (13.44).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T04:34:41.148Z

