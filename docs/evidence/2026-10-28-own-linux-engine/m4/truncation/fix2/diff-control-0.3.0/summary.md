# linux-engine-diff summary

## t3-fix2-control-030 (development run, not a release gate)

commit cf6d82f0bf753614a7710eb60666373a8f1f11dc; cua-engine 0.3.0 (cd4c929758ca); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (cd4c929758ca); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 122 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 583.1 | 641.7 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 574.9 | 607.7 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 88.3 | 79.8 | 21 | 3189 / 3188 | 103 / 102 | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-505.19, -465.49]; warm faster [-555.06, -466.69]) |
| gedit | tree | **bar** | 574.9 | 607.7 | | | | | | | | | |
| gedit | tree_shot | pinned | 716.9 | 727.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 704.1 | 689.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 127.1 | 104 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-599.705, -559.935]; warm faster [-609.29, -559.32]) |
| gedit | tree_shot | **bar** | 704.1 | 689.4 | | | | | | | | | |
| chrome | tree | pinned | 512.7 | 426.5 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 447.2 | 435 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 74.7 | 64.7 | 21 | 2247 / 2246 | 30 / 29 | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-407.34, -360.945]; warm faster [-390.88, -349.47]) |
| chrome | tree | **bar** | 447.2 | 426.5 | | | | | | | | | |
| chrome | tree_shot | pinned | 601.6 | 560.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 597.6 | 622.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 123.3 | 86.6 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-551.68, -448.05]; warm faster [-488.78, -461.15]) |
| chrome | tree_shot | **bar** | 597.6 | 560.6 | | | | | | | | | |
| over-budget | tree | pinned | 7034 | 7101.3 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7144.3 | 7203 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 990.3 | 972.5 | 21 | 45230 / 45241 | 243 / 206 | 189 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-6467.705, -5913.93]; warm faster [-6441, -5923.77]) |
| over-budget | tree | **bar** | 7034 | 7101.3 | | | | | | | | | |
| big-text | tree | pinned | 506.7 | 480.4 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | newest | 505.8 | 478.6 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | cua | 123.5 | 125.7 | 21 | 2052 / 2051 | 34 / 23 | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-429.25, -345.875]; warm faster [-378.45, -331.48]) |
| big-text | tree | **bar** | 505.8 | 478.6 | | | | | | | | | |
| gtk-table | tree | pinned | 322.8 | 275.2 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | newest | 310 | 255.7 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | cua | 122.3 | 89.8 | 21 | 937 / 936 | 288 / 294 | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-228.55, -167.07]; warm faster [-182.79, -156.49]) |
| gtk-table | tree | **bar** | 310 | 255.7 | | | | | | | | | |
| calc | tree | pinned | 3544.9 | 3738.7 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | newest | 3648.1 | 3684.4 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | cua | 758.9 | 751.7 | 21 | 19853 / 19852 | 1285 / 1252 | 0 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as recorded on 41 of 41 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-2902.91, -2657.06]; warm faster [-3076.49, -2815.56]) |
| calc | tree | **bar** | 3544.9 | 3684.4 | | | | | | | | | |
| retention | after_resize | pinned | 625.3 | 603.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 584.2 | 635 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 91.9 | 104.1 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | FAIL: cua: truncated not as recorded on 40 of 40 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-552.3, -471.15]; warm faster [-533.305, -491.11]) |
| retention | after_resize | **bar** | 584.2 | 603.3 | | | | | | | | | |
| retention | after_remap | pinned | 603.7 | 576.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 621.2 | 591.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 97.1 | 99.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | FAIL: cua: truncated not as recorded on 40 of 40 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-552.92, -472.865]; warm faster [-510.815, -450.2]) |
| retention | after_remap | **bar** | 603.7 | 576.8 | | | | | | | | | |
| retention | after_covered_change | pinned | 594.8 | 591.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 602.1 | 607.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 107.7 | 115.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | FAIL: cua: truncated not as recorded on 40 of 40 samples (first: its --stats tree record is malformed: it needs the source and the cut points as three u32 counts) (cold faster [-536.97, -456.685]; warm faster [-491.61, -444.88]) |
| retention | after_covered_change | **bar** | 594.8 | 591.7 | | | | | | | | | |

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

run valid; development run, not a release gate: **FAIL**: gedit tree cua, gedit tree_shot cua, chrome tree cua, chrome tree_shot cua, over-budget tree cua, big-text tree cua, gtk-table tree cua, calc tree cua, retention after_resize cua, retention after_remap cua, retention after_covered_change cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T07:26:05.663Z

