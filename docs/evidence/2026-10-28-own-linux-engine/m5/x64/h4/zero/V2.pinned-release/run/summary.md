# linux-engine-diff summary

## pinned-V2 (acceptance on the pinned release)

commit 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 114.5 | 85.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 112.3 | 89.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 11.9 | 6.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-113.17, -93.105]; warm faster [-86.61, -72.2]) |
| desktop | list_windows | **bar** | 112.3 | 85.5 | | | | | | | | | |
| desktop | list_apps | pinned | 117.1 | 92.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 108.7 | 88.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 13 | 8.7 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-107.21, -86.7]; warm faster [-90.34, -73.21]) |
| desktop | list_apps | **bar** | 108.7 | 88.4 | | | | | | | | | |
| desktop | get_screenshot | pinned | 35.5 | 28.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 37.3 | 28.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 34 | 24.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-5.715, 1.595]; warm faster [-4.85, -2.84]) |
| desktop | get_screenshot | **bar** | 35.5 | 28.3 | | | | | | | | | |
| desktop | launch_app | pinned | 4.9 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 5 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4.9 | 1.1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.995, 0.71]; warm within the bound [0.2, 0.82]) |
| desktop | launch_app | **bar** | 4.9 | 0.6 | | | | | | | | | |
| desktop | capabilities | cua | 3.3 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 620.7 | 615 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 592.1 | 567.6 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 94.3 | 81.8 | 21 | 3141 / 3140 | 94 / 92 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-543.33, -479.79]; warm faster [-518.58, -459.6]) |
| gedit | tree | **bar** | 592.1 | 567.6 | | | | | | | | | |
| gedit | tree_shot | pinned | 790 | 743.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 738.1 | 772.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 135.9 | 103.7 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-665.32, -532.87]; warm faster [-656.9, -615.28]) |
| gedit | tree_shot | **bar** | 738.1 | 743.2 | | | | | | | | | |
| gedit | press_key | pinned | 273.5 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.3 | 235.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 7.1 | 1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.88, -232.305]; warm faster [-234.95, -234.5]) |
| gedit | press_key | **bar** | 240.3 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 219.9 | 214.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 223.3 | 215.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 20.4 | 13.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-200.51, -196.8]; warm faster [-201.49, -200.955]) |
| gedit | click | **bar** | 219.9 | 214.9 | | | | | | | | | |
| gedit | type_characters | pinned | 4.5 | 0.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 573.1 | 568.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 8.3 | 1.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-566.205, -563.36]; warm faster [-567.095, -566.07]) |
| gedit | type_characters | **bar** | 573.1 | 568.5 | | | | | | | | | |
| chrome | tree | pinned | 507.4 | 453.5 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 502.3 | 480.2 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 72.3 | 61.3 | 21 | 2226 / 2225 | 28 / 27 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-488.23, -403.365]; warm faster [-430.56, -378.34]) |
| chrome | tree | **bar** | 502.3 | 453.5 | | | | | | | | | |
| chrome | tree_shot | pinned | 640.5 | 586.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 621.5 | 590.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 118.8 | 92.9 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-531.475, -461.3]; warm faster [-582.65, -463.39]) |
| chrome | tree_shot | **bar** | 621.5 | 586.5 | | | | | | | | | |
| chrome | press_key | pinned | 273.7 | 269.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.6 | 236.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 6 | 1.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-234.955, -234.22]; warm faster [-235.225, -234.795]) |
| chrome | press_key | **bar** | 240.6 | 236.2 | | | | | | | | | |
| chrome | click | pinned | 219.9 | 215.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.8 | 215.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 19 | 14.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.95, -200.1]; warm faster [-201.14, -200.085]) |
| chrome | click | **bar** | 219.9 | 215.1 | | | | | | | | | |
| over-budget | tree | pinned | 7361 | 7509.4 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7257.3 | 7559.6 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 988.9 | 1001.5 | 21 | 45216 / 45225 | 168 / 213 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6697.09, -6146.045]; warm faster [-6898.02, -6089.3]) (declared: tree) |
| over-budget | tree | **bar** | 7257.3 | 7509.4 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.08 | 0.64 | newest | [0.2, 0.82] | 1 |

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

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-19T03:32:34.764Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1303 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

