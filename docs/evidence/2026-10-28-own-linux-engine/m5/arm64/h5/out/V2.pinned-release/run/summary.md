# linux-engine-diff summary

## pinned-V2 (acceptance on the pinned release)

commit 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 37 | 33.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 37.5 | 34.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 8.1 | 5.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-29.345, -27.24]; warm faster [-30.4, -28.49]) |
| desktop | list_windows | **bar** | 37 | 33.9 | | | | | | | | | |
| desktop | list_apps | pinned | 38.3 | 35.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 37.7 | 33.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 9.3 | 6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-29.13, -27.945]; warm faster [-29.88, -27.6]) |
| desktop | list_apps | **bar** | 37.7 | 33.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 17.1 | 12.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 17.1 | 12.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 14.9 | 9.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-2.4, -2]; warm faster [-3.46, -3.05]) |
| desktop | get_screenshot | **bar** | 17.1 | 12.6 | | | | | | | | | |
| desktop | launch_app | pinned | 3.6 | 0.4 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.6 | 0.4 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.335, -0.105]; warm within the bound [0.2, 0.31]) |
| desktop | launch_app | **bar** | 3.6 | 0.4 | | | | | | | | | |
| desktop | capabilities | cua | 2.8 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 194.3 | 191.3 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 190.2 | 186.4 | 21 | 3141 / 3141 | 3141 / 3141 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 53.3 | 49.3 | 21 | 3141 / 3140 | 57 / 67 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-137.55, -136.28]; warm faster [-140.14, -136.19]) |
| gedit | tree | **bar** | 190.2 | 186.4 | | | | | | | | | |
| gedit | tree_shot | pinned | 302.9 | 295.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 298 | 293.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 75 | 58 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-224.22, -221.88]; warm faster [-236.93, -234.81]) |
| gedit | tree_shot | **bar** | 298 | 293.9 | | | | | | | | | |
| gedit | press_key | pinned | 270.7 | 267.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 237.7 | 234.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 4.6 | 0.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-233.24, -233.01]; warm faster [-233.715, -233.65]) |
| gedit | press_key | **bar** | 237.7 | 234.1 | | | | | | | | | |
| gedit | click | pinned | 216.6 | 213.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 217.1 | 213.3 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 16.9 | 12.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-199.8, -199.565]; warm faster [-200.45, -200.38]) |
| gedit | click | **bar** | 216.6 | 213.1 | | | | | | | | | |
| gedit | type_characters | pinned | 3.3 | 0.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_characters | newest | 568.5 | 565.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 4.6 | 0.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-564.125, -563.755]; warm faster [-564.485, -564.33]) |
| gedit | type_characters | **bar** | 568.5 | 565.2 | | | | | | | | | |
| chrome | tree | pinned | 182.9 | 180.2 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 182.6 | 181.5 | 21 | 2226 / 2226 | 2226 / 2226 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 71.4 | 68 | 21 | 2226 / 2225 | 17 / 16 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-112.41, -110.295]; warm faster [-114.01, -111.28]) |
| chrome | tree | **bar** | 182.6 | 180.2 | | | | | | | | | |
| chrome | tree_shot | pinned | 295.1 | 290.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 295.2 | 292.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 97.9 | 78.2 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-197.92, -196.24]; warm faster [-214.78, -211.45]) |
| chrome | tree_shot | **bar** | 295.1 | 290.8 | | | | | | | | | |
| chrome | press_key | pinned | 270.9 | 267.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 237.9 | 234.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 4 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-234.025, -233.885]; warm faster [-233.9, -233.8]) |
| chrome | press_key | **bar** | 237.9 | 234.3 | | | | | | | | | |
| chrome | click | pinned | 216.7 | 213.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 217.3 | 213.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 16.2 | 12.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.51, -200.35]; warm faster [-200.53, -200.48]) |
| chrome | click | **bar** | 216.7 | 213.2 | | | | | | | | | |
| over-budget | tree | pinned | 3005.4 | 3002.6 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 3006.7 | 3012.6 | 21 | 45038 / 45038 | 45038 / 45038 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 1294.7 | 1294.4 | 21 | 45209 / 45219 | 19 / 17 | 182 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-1723.99, -1706.31]; warm faster [-1713.65, -1699.54]) (declared: tree) |
| over-budget | tree | **bar** | 3005.4 | 3002.6 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 0.66 | 0.39 | newest | [0.2, 0.31] | 1 |

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

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-19T10:15:30.583Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1313 requests, 382 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

