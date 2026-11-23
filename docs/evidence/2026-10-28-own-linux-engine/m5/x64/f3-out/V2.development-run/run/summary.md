# linux-engine-diff summary

## m5-dev-V2 (development run, not a release gate)

commit fefe306c288956a48b6c086017f3cd1a58462a07; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 109.2 | 90.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 114.1 | 98.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 12 | 7.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-117.385, -89.33]; warm faster [-111.05, -76.1]) |
| desktop | list_windows | **bar** | 109.2 | 90.6 | | | | | | | | | |
| desktop | list_apps | pinned | 110.9 | 114.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 108.9 | 105.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 13.1 | 8.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-105.61, -89.015]; warm faster [-99.52, -82.04]) |
| desktop | list_apps | **bar** | 108.9 | 105.3 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38.1 | 28.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 36.3 | 28.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 33.6 | 24.7 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-5.605, -0.445]; warm faster [-5.49, -1.66]) |
| desktop | get_screenshot | **bar** | 36.3 | 28.4 | | | | | | | | | |
| desktop | launch_app | pinned | 4.8 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4.2 | 1.1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-1.265, 0.075]; warm within the bound [0.31, 0.57]) |
| desktop | launch_app | **bar** | 4.7 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 647 | 572.6 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 600.3 | 574.1 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 93 | 80.3 | 21 | 3141 / 3140 | 81 / 67 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-563.895, -489.295]; warm faster [-554.66, -462.26]) |
| gedit | tree | **bar** | 600.3 | 572.6 | | | | | | | | | |
| gedit | tree_shot | pinned | 751.8 | 720.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 732.2 | 709.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 137 | 106.4 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-624.45, -561.36]; warm faster [-676.04, -584.02]) |
| gedit | tree_shot | **bar** | 732.2 | 709.8 | | | | | | | | | |
| gedit | press_key | pinned | 273.3 | 269 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.5 | 235.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 6.9 | 1.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.925, -233.04]; warm faster [-234.785, -234.46]) |
| gedit | press_key | **bar** | 240.5 | 235.8 | | | | | | | | | |
| gedit | click | pinned | 219.5 | 215.3 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 222.9 | 215.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 21.2 | 13.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-199.63, -195.15]; warm faster [-201.58, -200.88]) |
| gedit | click | **bar** | 219.5 | 215.3 | | | | | | | | | |
| gedit | type_characters | pinned | 4.1 | 0.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 572.7 | 568.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 7.1 | 2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-566.195, -564.33]; warm faster [-566.395, -565.915]) |
| gedit | type_characters | **bar** | 572.7 | 568.1 | | | | | | | | | |
| chrome | tree | pinned | 454.8 | 440.3 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 445.3 | 426.5 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 67.3 | 63.7 | 21 | 2226 / 2225 | 22 / 25 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-426.92, -362.81]; warm faster [-391.8, -339.64]) |
| chrome | tree | **bar** | 445.3 | 426.5 | | | | | | | | | |
| chrome | tree_shot | pinned | 594.5 | 572.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 606.4 | 553.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 124.8 | 89.1 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-551.925, -443.25]; warm faster [-474.09, -444.45]) |
| chrome | tree_shot | **bar** | 594.5 | 553.7 | | | | | | | | | |
| chrome | press_key | pinned | 273.5 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.4 | 236 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 5.8 | 1.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-235, -234.055]; warm faster [-235, -234.405]) |
| chrome | press_key | **bar** | 240.4 | 236 | | | | | | | | | |
| chrome | click | pinned | 219 | 215 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.4 | 215.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 18.9 | 14 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.61, -199.495]; warm faster [-201.285, -200.85]) |
| chrome | click | **bar** | 219 | 215 | | | | | | | | | |
| over-budget | tree | pinned | 7492.2 | 7301.7 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7512.1 | 7077.1 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 995.5 | 971 | 21 | 45226 / 45221 | 188 / 220 | 189 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6665.125, -6362.3]; warm faster [-6594.25, -6017.04]) (declared: tree) |
| over-budget | tree | **bar** | 7492.2 | 7077.1 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.09 | 0.7 | newest | [0.31, 0.57] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0076 |  |
| desktop | cua | 41/41 | 28 | 0.0076 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 14 | 0.0038 |  |
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

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-17T11:06:17.522Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1294 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

