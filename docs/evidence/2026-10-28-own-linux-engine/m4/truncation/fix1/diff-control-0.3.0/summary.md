# linux-engine-diff summary

## t3-fix1-control-030 (development run, not a release gate)

commit d4a8ba7ec5b2c1e979214677369e0e2de5775f36; cua-engine 0.3.0 (cd4c929758ca); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (cd4c929758ca); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 640.3 | 586.1 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 578.5 | 561.4 | 21 | 3189 / 3189 | 3189 / 3189 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.2 | 81 | 21 | 3189 / 3188 | 103 / 106 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-507.51, -441.15]; warm faster [-512.91, -454.14]) |
| gedit | tree | **bar** | 578.5 | 561.4 | | | | | | | | | |
| gedit | tree_shot | pinned | 724.8 | 707.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 704.3 | 721.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 132.4 | 103 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-632.99, -537.21]; warm faster [-615.14, -581.05]) |
| gedit | tree_shot | **bar** | 704.3 | 707.5 | | | | | | | | | |
| chrome | tree | pinned | 490.5 | 494.4 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 503.5 | 441.9 | 21 | 2247 / 2247 | 2247 / 2247 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 71.5 | 61.2 | 21 | 2247 / 2246 | 34 / 27 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-488.72, -381.37]; warm faster [-424.89, -363.66]) |
| chrome | tree | **bar** | 490.5 | 441.9 | | | | | | | | | |
| chrome | tree_shot | pinned | 642.8 | 600.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 653.6 | 656.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 122.3 | 89.1 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-561.83, -478.06]; warm faster [-556.92, -488.37]) |
| chrome | tree_shot | **bar** | 642.8 | 600.7 | | | | | | | | | |
| over-budget | tree | pinned | 7472.2 | 7439.7 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7076.9 | 6929 | 21 | 45059 / 45059 | 45059 / 45059 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 1005.1 | 979.7 | 21 | 45247 / 45241 | 155 / 178 | 188 | 41/41 | clean | – | 41/41 | FAIL: cua: truncated not as declared on 41 of 41 samples (cold faster [-6324.32, -5978.72]; warm faster [-6065.01, -5901.04]) |
| over-budget | tree | **bar** | 7076.9 | 6929 | | | | | | | | | |
| big-text | tree | pinned | 499.5 | 507.3 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | newest | 486 | 470.7 | 21 | 2052 / 2052 | 2052 / 2052 | – | 41/41 | clean | – | 41/41 |  |
| big-text | tree | cua | 122.6 | 116.2 | 21 | 2052 / 2051 | 31 / 31 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-392.54, -350.07]; warm faster [-422.36, -343.78]) |
| big-text | tree | **bar** | 486 | 470.7 | | | | | | | | | |
| gtk-table | tree | pinned | 281.6 | 258.1 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | newest | 276.3 | 272.6 | 21 | 939 / 939 | 939 / 939 | – | 41/41 | clean | – | 41/41 |  |
| gtk-table | tree | cua | 93 | 85 | 21 | 937 / 936 | 287 / 284 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-196.035, -173.96]; warm faster [-192.36, -163.59]) |
| gtk-table | tree | **bar** | 276.3 | 258.1 | | | | | | | | | |
| calc | tree | pinned | 3666 | 3660.3 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | newest | 3716.6 | 3687.4 | 21 | 19855 / 19855 | 19855 / 19855 | – | 41/41 | clean | – | 41/41 |  |
| calc | tree | cua | 755.8 | 749 | 21 | 19853 / 19852 | 1264 / 1257 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-3096.22, -2831.15]; warm faster [-3153.02, -2810.55]) |
| calc | tree | **bar** | 3666 | 3660.3 | | | | | | | | | |
| retention | after_resize | pinned | 652.2 | 589.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 607.9 | 620.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 91.6 | 99.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-567.325, -485.825]; warm faster [-509.93, -471.04]) |
| retention | after_resize | **bar** | 607.9 | 589.2 | | | | | | | | | |
| retention | after_remap | pinned | 618.3 | 606.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 597.3 | 587.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 94.1 | 97.6 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-528.36, -477.435]; warm faster [-557.68, -478.525]) |
| retention | after_remap | **bar** | 597.3 | 587.3 | | | | | | | | | |
| retention | after_covered_change | pinned | 619.8 | 592.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 598.2 | 649.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 97.3 | 95.4 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-518.415, -478.5]; warm faster [-586.3, -467.815]) |
| retention | after_covered_change | **bar** | 598.2 | 592.4 | | | | | | | | | |

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

run valid; development run, not a release gate: **FAIL**: over-budget tree cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T05:12:02.769Z

