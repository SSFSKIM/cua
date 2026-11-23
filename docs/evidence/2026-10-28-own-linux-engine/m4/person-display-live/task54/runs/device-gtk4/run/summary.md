# linux-engine-diff summary

## task54-device-gtk4 (development run, not a release gate)

commit 1525e2beee2bcd81864ef951bf73487cfde4562a; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 66.9 | 62.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 70.4 | 60.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.4 | 4 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-64.44, -55.75]; warm faster [-63.05, -48.43]) |
| desktop | list_windows | **bar** | 66.9 | 60.6 | | | | | | | | | |
| desktop | list_apps | pinned | 70.1 | 59.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 66.2 | 55.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.3 | 8.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-66.365, -54.305]; warm faster [-61.03, -43.48]) |
| desktop | list_apps | **bar** | 66.2 | 55.3 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.1 | 27.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 36.4 | 29 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 34.2 | 24.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-7.38, 0.865]; warm faster [-3.49, -2.08]) |
| desktop | get_screenshot | **bar** | 36.4 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 3.9 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.9 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 2.5 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-2.005, -0.96]; warm same (within noise) [-0.13, 0.1]) |
| desktop | launch_app | **bar** | 3.9 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.4 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2.7 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 100.8 | 19.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 1.7 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 9.1 | 4.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 2.2 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 8.3 | 8.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 112.1 | 109.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 1.8 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 199.6 | 117.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 1.8 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 72 | 89.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.3 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 139.6 | 54 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0076 |  |
| desktop | cua | 41/41 | 28 | 0.0076 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 633 samples, against the run's cap of 1% (6.33).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-03T19:20:07.684Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 11496 requests, 934 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

