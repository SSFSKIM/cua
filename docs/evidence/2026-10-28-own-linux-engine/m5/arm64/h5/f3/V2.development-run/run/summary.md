# linux-engine-diff summary

## m5-dev-V2 (development run, not a release gate)

commit 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 39.3 | 36.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 38.8 | 33.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 9.4 | 5.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-30.16, -28.52]; warm faster [-30.1, -28.32]) |
| desktop | list_windows | **bar** | 38.8 | 33.9 | | | | | | | | | |
| desktop | list_apps | pinned | 39.7 | 35.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 39.8 | 36.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 10.4 | 6.4 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-30.16, -27.505]; warm faster [-29.82, -26.55]) |
| desktop | list_apps | **bar** | 39.7 | 35.7 | | | | | | | | | |
| desktop | get_screenshot | pinned | 18.5 | 13.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 18.6 | 13.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 16.2 | 9.6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-2.55, -1.945]; warm faster [-3.65, -3.22]) |
| desktop | get_screenshot | **bar** | 18.5 | 13.1 | | | | | | | | | |
| desktop | launch_app | pinned | 4.8 | 0.5 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.9 | 0.5 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4.4 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.495, -0.085]; warm within the bound [0.23, 0.41]) |
| desktop | launch_app | **bar** | 4.8 | 0.5 | | | | | | | | | |
| desktop | capabilities | cua | 2.7 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 197.8 | 191.5 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 193.3 | 187.5 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 54.6 | 49.8 | 21 | 3141 / 3140 | 70 / 77 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-141.305, -136.76]; warm faster [-141.2, -135.16]) |
| gedit | tree | **bar** | 193.3 | 187.5 | | | | | | | | | |
| gedit | tree_shot | pinned | 308.2 | 297.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 307.2 | 298.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 77 | 59 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-231.42, -229.005]; warm faster [-242.73, -237.83]) |
| gedit | tree_shot | **bar** | 307.2 | 297.8 | | | | | | | | | |
| gedit | press_key | pinned | 271.7 | 267.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 238.7 | 234.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 5.4 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.435, -233.11]; warm faster [-233.87, -233.68]) |
| gedit | press_key | **bar** | 238.7 | 234.3 | | | | | | | | | |
| gedit | click | pinned | 217.6 | 213.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 218.2 | 213.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 17.8 | 12.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-199.93, -199.705]; warm faster [-200.525, -200.395]) |
| gedit | click | **bar** | 217.6 | 213.2 | | | | | | | | | |
| gedit | type_characters | pinned | 4.1 | 0.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 569.8 | 565.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 5.4 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-564.49, -564.185]; warm faster [-565, -564.495]) |
| gedit | type_characters | **bar** | 569.8 | 565.5 | | | | | | | | | |
| chrome | tree | pinned | 185.4 | 181.6 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 185.1 | 179.9 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 69.8 | 65.7 | 21 | 2226 / 2225 | 18 / 16 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-116.405, -114.305]; warm faster [-118.06, -112.1]) |
| chrome | tree | **bar** | 185.1 | 179.9 | | | | | | | | | |
| chrome | tree_shot | pinned | 298.4 | 292.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 299.7 | 292.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 97.7 | 76.6 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-202.11, -198.09]; warm faster [-220.51, -213.58]) |
| chrome | tree_shot | **bar** | 298.4 | 292.4 | | | | | | | | | |
| chrome | press_key | pinned | 271.9 | 267.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 238.8 | 234.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 4.7 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-234.275, -234.055]; warm faster [-234.07, -233.89]) |
| chrome | press_key | **bar** | 238.8 | 234.5 | | | | | | | | | |
| chrome | click | pinned | 217.4 | 213.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 218.1 | 213.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 16.8 | 12.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.66, -200.49]; warm faster [-200.58, -200.475]) |
| chrome | click | **bar** | 217.4 | 213.3 | | | | | | | | | |
| over-budget | tree | pinned | 2993.3 | 3051.6 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 2993.7 | 3046 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 1225.2 | 1235 | 21 | 45221 / 45227 | 22 / 22 | 187 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-1780.93, -1762.64]; warm faster [-1851.92, -1753.01]) (declared: tree) |
| over-budget | tree | **bar** | 2993.3 | 3046 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 0.78 | 0.45 | pinned | [0.23, 0.41] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0073 |  |
| desktop | cua | 41/41 | 28 | 0.0073 |  |
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

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-19T13:46:12.332Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1312 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

