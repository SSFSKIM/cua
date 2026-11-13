# linux-engine-diff summary

## m4-gate-V2 (release gate)

commit 514f5c62dd6c74b1ed24c48f112ca9c35a70eece; cua-engine 0.4.0 (514f5c62dd6c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 105.8 | 106.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 110.5 | 88.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 10.3 | 6.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-105.78, -83.46]; warm faster [-96.06, -73.76]) |
| desktop | list_windows | **bar** | 105.8 | 88.2 | | | | | | | | | |
| desktop | list_apps | pinned | 106.9 | 85.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 112.2 | 94.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 13.1 | 9.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-104.98, -88.895]; warm faster [-82.92, -70.95]) |
| desktop | list_apps | **bar** | 106.9 | 85.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.7 | 26.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.9 | 29.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 34.4 | 23.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-5.185, 1.26]; warm faster [-3.66, -2.26]) |
| desktop | get_screenshot | **bar** | 37.7 | 26.9 | | | | | | | | | |
| desktop | launch_app | pinned | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.1 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.3 | 1.2 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-1.15, -0.225]; warm within the bound [0.51, 0.63]) |
| desktop | launch_app | **bar** | 4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 4 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 556.5 | 589.9 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 569.4 | 552.5 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 89.6 | 78.3 | 21 | 3141 / 3140 | 100 / 129 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-508.02, -447.55]; warm faster [-522.37, -454.73]) |
| gedit | tree | **bar** | 556.5 | 552.5 | | | | | | | | | |
| gedit | tree_shot | pinned | 713 | 684.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 669.4 | 690.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 127.7 | 95.1 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-561.75, -523.78]; warm faster [-603.05, -579.81]) |
| gedit | tree_shot | **bar** | 669.4 | 684.6 | | | | | | | | | |
| gedit | press_key | pinned | 273.1 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 239.9 | 235.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 7.1 | 1.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.565, -232.29]; warm faster [-234.875, -234.39]) |
| gedit | press_key | **bar** | 239.9 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 219.2 | 214.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221.7 | 215.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 19.8 | 13.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-199.875, -198.68]; warm faster [-201.31, -200.465]) |
| gedit | click | **bar** | 219.2 | 214.8 | | | | | | | | | |
| gedit | type_characters | pinned | 3.4 | 0.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 572.3 | 569.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 7 | 2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-565.68, -564.615]; warm faster [-567.225, -566.335]) |
| gedit | type_characters | **bar** | 572.3 | 569.1 | | | | | | | | | |
| chrome | tree | pinned | 470.8 | 452.7 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 450.4 | 450 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 66.7 | 57.2 | 21 | 2226 / 2225 | 35 / 37 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-416.58, -353.645]; warm faster [-416.19, -371.33]) |
| chrome | tree | **bar** | 450.4 | 450 | | | | | | | | | |
| chrome | tree_shot | pinned | 589.3 | 567.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 597.7 | 579.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 117 | 94.4 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-492.39, -445.795]; warm faster [-493.47, -457.02]) |
| chrome | tree_shot | **bar** | 589.3 | 567.7 | | | | | | | | | |
| chrome | press_key | pinned | 273.2 | 269.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240 | 236.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 5.5 | 1.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-234.77, -234.025]; warm faster [-235.255, -234.635]) |
| chrome | press_key | **bar** | 240 | 236.1 | | | | | | | | | |
| chrome | click | pinned | 219 | 215.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.5 | 215.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 18.9 | 14.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.925, -199.645]; warm faster [-201.175, -200.735]) |
| chrome | click | **bar** | 219 | 215.1 | | | | | | | | | |
| over-budget | tree | pinned | 7173.2 | 6984.9 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7077 | 7029.8 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 981.1 | 986.4 | 21 | 45216 / 45215 | 194 / 237 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6251.16, -5854.94]; warm faster [-6226.27, -5909.39]) (declared: tree) |
| over-budget | tree | **bar** | 7077 | 6984.9 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.23 | 0.66 | pinned | [0.51, 0.63] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0076 |  |
| desktop | cua | 41/41 | 28 | 0.0076 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 8 | 0.0016 |  |
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

run valid; release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-13T20:34:02.504Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1031 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

