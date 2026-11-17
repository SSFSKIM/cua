# linux-engine-diff summary

## pinned-V2 (acceptance on the pinned release)

commit fefe306c288956a48b6c086017f3cd1a58462a07; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 102 | 96.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 103.7 | 105.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 10.9 | 7.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-97.24, -80.02]; warm faster [-100.84, -75.71]) |
| desktop | list_windows | **bar** | 102 | 96.5 | | | | | | | | | |
| desktop | list_apps | pinned | 102.4 | 98.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 96.4 | 90.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 12.4 | 9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-100.295, -77.115]; warm faster [-90.29, -77.03]) |
| desktop | list_apps | **bar** | 96.4 | 90.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.6 | 28.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.6 | 30.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 35.2 | 24.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-5.63, 1.865]; warm faster [-4.77, -2.6]) |
| desktop | get_screenshot | **bar** | 37.6 | 28.5 | | | | | | | | | |
| desktop | launch_app | pinned | 5.2 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4.3 | 1.2 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.895, -0.035]; warm within the bound [0.29, 0.62]) |
| desktop | launch_app | **bar** | 4.7 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3.7 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 572.8 | 650 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 564.8 | 558.3 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 91.8 | 80.9 | 21 | 3141 / 3140 | 69 / 87 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-497.57, -459.205]; warm faster [-492.48, -452.68]) |
| gedit | tree | **bar** | 564.8 | 558.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 703.8 | 745.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 696.5 | 719.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 129.1 | 103.5 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-592.45, -532.405]; warm faster [-636.98, -570.84]) |
| gedit | tree_shot | **bar** | 696.5 | 719.5 | | | | | | | | | |
| gedit | press_key | pinned | 273.4 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.4 | 235.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 7 | 1.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-234.12, -232.615]; warm faster [-234.82, -234.39]) |
| gedit | press_key | **bar** | 240.4 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 219.5 | 214.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221 | 215.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 20 | 14 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-200.7, -198.95]; warm faster [-201.17, -200.43]) |
| gedit | click | **bar** | 219.5 | 214.9 | | | | | | | | | |
| gedit | type_characters | pinned | 4.1 | 0.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 572.4 | 568.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 9.4 | 2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-565.03, -560.35]; warm faster [-566.7, -565.94]) |
| gedit | type_characters | **bar** | 572.4 | 568.4 | | | | | | | | | |
| chrome | tree | pinned | 475.2 | 448.1 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 459.6 | 434.3 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 68.8 | 65.5 | 21 | 2226 / 2225 | 31 / 37 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-414.695, -365.545]; warm faster [-403.74, -350.43]) |
| chrome | tree | **bar** | 459.6 | 434.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 609.6 | 575.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 632.8 | 621.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 121.7 | 84.5 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-518.72, -464.625]; warm faster [-523.35, -474.08]) |
| chrome | tree_shot | **bar** | 609.6 | 575.9 | | | | | | | | | |
| chrome | press_key | pinned | 273.5 | 269.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.7 | 236.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 5.9 | 1.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-236.01, -234.035]; warm faster [-235.23, -234.725]) |
| chrome | press_key | **bar** | 240.7 | 236.2 | | | | | | | | | |
| chrome | click | pinned | 219 | 214.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.4 | 215.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 18.4 | 14 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.19, -200.215]; warm faster [-201.33, -200.355]) |
| chrome | click | **bar** | 219 | 214.9 | | | | | | | | | |
| over-budget | tree | pinned | 6988.1 | 7471.8 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 6925.9 | 7163.6 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 989.5 | 1000.9 | 21 | 45219 / 45218 | 257 / 237 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6120.245, -5843.835]; warm faster [-6407.5, -6037.33]) (declared: tree) |
| over-budget | tree | **bar** | 6925.9 | 7163.6 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.24 | 0.73 | newest | [0.29, 0.62] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0076 |  |
| desktop | cua | 41/41 | 28 | 0.0076 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 0 | 0 |  |
| gedit | cua | 41/41 | 0 | 0 |  |
| chrome | pinned | 41/41 | 0 | 0 |  |
| chrome | newest | 41/41 | 0 | 0 |  |
| chrome | cua | 41/41 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |
| gedit | click | cua | – | – | background | – | – |
| gedit | type_characters | cua | – | background | background | – | 0 / 0 / 0 |
| chrome | press_key | cua | – | – | background | – | – |
| chrome | click | cua | – | – | background | – | – |
| gedit | type_characters | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | type_characters | newest | – | – | – | – | 0 / 0 / 0 |

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1731 samples, against the run's cap of 1% (17.31).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

Text windows a lane ended (a vendor's restarted before its next request, never scored; a candidate's stops the run): pinned 0, newest 0, cua 0.

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-17T00:55:21.438Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1295 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

