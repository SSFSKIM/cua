# linux-engine-diff summary

## m5-dev-V2 (development run, not a release gate)

commit 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 36.8 | 33.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 37.4 | 34.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 7.9 | 5.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-30.135, -28.38]; warm faster [-31.42, -28.13]) |
| desktop | list_windows | **bar** | 36.8 | 33.7 | | | | | | | | | |
| desktop | list_apps | pinned | 37.7 | 35.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 37.8 | 35.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 9.2 | 5.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-28.95, -27.845]; warm faster [-30.83, -28.66]) |
| desktop | list_apps | **bar** | 37.7 | 35.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 16.7 | 12.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 16.6 | 12.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 14.4 | 9.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-2.38, -2.035]; warm faster [-3.37, -3.15]) |
| desktop | get_screenshot | **bar** | 16.6 | 12.5 | | | | | | | | | |
| desktop | launch_app | pinned | 3.5 | 0.4 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.4 | 0.4 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.2 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.375, -0.21]; warm within the bound [0.18, 0.28]) |
| desktop | launch_app | **bar** | 3.4 | 0.4 | | | | | | | | | |
| desktop | capabilities | cua | 2.7 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 192.6 | 188.5 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 187.4 | 184.6 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 52.3 | 49.2 | 21 | 3141 / 3140 | 69 / 69 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-135.86, -134.235]; warm faster [-137.59, -134.06]) |
| gedit | tree | **bar** | 187.4 | 184.6 | | | | | | | | | |
| gedit | tree_shot | pinned | 304.1 | 297.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 300 | 294.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 74.2 | 58 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-227.175, -225.075]; warm faster [-237.82, -235.4]) |
| gedit | tree_shot | **bar** | 300 | 294.8 | | | | | | | | | |
| gedit | press_key | pinned | 271 | 267.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 237.9 | 234.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 4.7 | 0.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.47, -232.83]; warm faster [-233.68, -233.63]) |
| gedit | press_key | **bar** | 237.9 | 234.1 | | | | | | | | | |
| gedit | click | pinned | 216.8 | 213.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 217.4 | 213.4 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 16.9 | 12.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-200, -199.595]; warm faster [-200.56, -200.465]) |
| gedit | click | **bar** | 216.8 | 213.2 | | | | | | | | | |
| gedit | type_characters | pinned | 2.7 | 0.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 567.8 | 565.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 4 | 0.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-563.9, -563.73]; warm faster [-564.47, -564.38]) |
| gedit | type_characters | **bar** | 567.8 | 565.1 | | | | | | | | | |
| chrome | tree | pinned | 180.6 | 178 | 21 | 2232 / 2232 | 2232 / 2232 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 181.5 | 177.7 | 21 | 2232 / 2232 | 2232 / 2232 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 67.8 | 64.5 | 21 | 2232 / 2231 | 16 / 15 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-113.86, -111.345]; warm faster [-114.91, -112.72]) |
| chrome | tree | **bar** | 180.6 | 177.7 | | | | | | | | | |
| chrome | tree_shot | pinned | 293.1 | 289.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 292.9 | 289.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 93.8 | 74.7 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-199.675, -197.61]; warm faster [-216.36, -213.64]) |
| chrome | tree_shot | **bar** | 292.9 | 289.2 | | | | | | | | | |
| chrome | press_key | pinned | 270.9 | 267.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 237.9 | 234.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 4 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.97, -233.79]; warm faster [-233.885, -233.83]) |
| chrome | press_key | **bar** | 237.9 | 234.3 | | | | | | | | | |
| chrome | click | pinned | 216.8 | 213.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 217.3 | 213.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 16.3 | 12.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.585, -200.405]; warm faster [-200.55, -200.505]) |
| chrome | click | **bar** | 216.8 | 213.2 | | | | | | | | | |
| over-budget | tree | pinned | 2953.5 | 2951 | 21 | 45026 / 45026 | 45026 / 45026 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 2948.2 | 2957.2 | 21 | 45026 / 45026 | 45026 / 45026 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 1199.2 | 1194.1 | 21 | 45197 / 45203 | 23 / 23 | 186 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-1760.8, -1737.49]; warm faster [-1767.72, -1747.95]) (declared: tree) |
| over-budget | tree | **bar** | 2948.2 | 2951 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 0.59 | 0.36 | pinned | [0.18, 0.28] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0073 |  |
| desktop | cua | 41/41 | 28 | 0.0073 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 4 | 0.0009 |  |
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

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-19T12:20:47.900Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1313 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

