# linux-engine-diff summary

## t3-fix2-record (development run, not a release gate)

commit eb1cb69ab6459596a249d72794a73692b2932d66; cua-engine 0.3.0 (eb1cb69ab645); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 93f47c56fdf13f28bbd1d9c24036d1edb92df75df9d925dd21c2e008fb1ce9d5, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (eb1cb69ab645); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 566.5 | 601.9 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 553.8 | 579.3 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 87.4 | 81 | 21 | 3189 / 3188 | 137 / 129 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-498.33, -451.675]; warm faster [-536.33, -472.25]) |
| gedit | tree | **bar** | 553.8 | 579.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 726.1 | 714.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 697.4 | 735.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 132.6 | 99.2 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-585.68, -541.25]; warm faster [-655.22, -578.44]) |
| gedit | tree_shot | **bar** | 697.4 | 714.3 | | | | | | | | | |
| chrome | tree | pinned | 468.3 | 469.3 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 462 | 478 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 64.9 | 70.4 | 21 | 2247 / 2246 | 40 / 26 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-417.63, -375.985]; warm faster [-430.63, -374.69]) |
| chrome | tree | **bar** | 462 | 469.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 608.1 | 611.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 613.8 | 591 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 113.7 | 96 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-538.195, -477.245]; warm faster [-508.63, -481.4]) |
| chrome | tree_shot | **bar** | 608.1 | 591 | | | | | | | | | |
| over-budget | tree | pinned | 7210.8 | 7045.3 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 6938.2 | 7117 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 977.6 | 966.4 | 21 | 45240 / 45244 | 158 / 228 | 189 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6388.325, -5892.145]; warm faster [-6303.77, -5981.06]) (declared: tree) |
| over-budget | tree | **bar** | 6938.2 | 7045.3 | | | | | | | | | |
| big-text | tree | pinned | 493.3 | 495.3 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | newest | 479.9 | 472.8 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | cua | 123.2 | 110.8 | 21 | 2052 / 2051 | 39 / 41 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-369.95, -347.88]; warm faster [-396.24, -344.62]) |
| big-text | tree | **bar** | 479.9 | 472.8 | | | | | | | | | |
| gtk-table | tree | pinned | 264.5 | 277.7 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | newest | 260 | 258.3 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | cua | 94.7 | 93 | 21 | 937 / 936 | 288 / 287 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-187.47, -159.04]; warm faster [-229.32, -152.88]) |
| gtk-table | tree | **bar** | 260 | 258.3 | | | | | | | | | |
| calc | tree | pinned | 3549.6 | 3579 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | newest | 3605.5 | 3647.2 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | cua | 751.1 | 748.3 | 21 | 19853 / 19852 | 1289 / 1272 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-2907.695, -2675.63]; warm faster [-2929.97, -2718.44]) |
| calc | tree | **bar** | 3549.6 | 3579 | | | | | | | | | |
| retention | after_resize | pinned | 595 | 589.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 568.9 | 609.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 91.9 | 93.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-495.59, -456.28]; warm faster [-543.42, -474.735]) |
| retention | after_resize | **bar** | 568.9 | 589.3 | | | | | | | | | |
| retention | after_remap | pinned | 596.7 | 616.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 613.8 | 610.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 92.4 | 99.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-528.78, -476.46]; warm faster [-535.205, -476.97]) |
| retention | after_remap | **bar** | 596.7 | 610.1 | | | | | | | | | |
| retention | after_covered_change | pinned | 591.7 | 578.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 588.2 | 573 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 93.4 | 94.4 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-514.37, -473.415]; warm faster [-507.42, -462.47]) |
| retention | after_covered_change | **bar** | 588.2 | 573 | | | | | | | | | |

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

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T06:49:13.688Z

