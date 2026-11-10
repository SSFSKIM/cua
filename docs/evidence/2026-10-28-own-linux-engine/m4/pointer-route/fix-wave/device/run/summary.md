# linux-engine-diff summary

## t71-fix1-device (development run, not a release gate)

commit –; cua-engine 0.3.0 (77935e73bc5d); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 ef033ea5fbf05086ab2414d7baa97086b243bebb815aeef13c4db92f592b00b3, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (77935e73bc5d); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 74.1 | 73.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 72.8 | 68.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.4 | 4.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-80.22, -60.545]; warm faster [-74.28, -60.13]) |
| desktop | list_windows | **bar** | 72.8 | 68.5 | | | | | | | | | |
| desktop | list_apps | pinned | 87.9 | 71.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 85 | 64.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.5 | 5.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-83.48, -69.955]; warm faster [-66.28, -58.07]) |
| desktop | list_apps | **bar** | 85 | 64.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 34.2 | 27.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.4 | 28.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 30.1 | 25.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-8.78, 0.42]; warm faster [-4.3, -0.98]) |
| desktop | get_screenshot | **bar** | 34.2 | 27.9 | | | | | | | | | |
| desktop | launch_app | pinned | 3.8 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.9 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.4 | 1.1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.865, -0.065]; warm within the bound [0.29, 0.48]) |
| desktop | launch_app | **bar** | 3.8 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-firefox | firefox_click_pointer_out_shared | cua | 0.7 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.8 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 20.2 | 22.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 89.6 | 90 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 17.5 | 14.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 22.3 | 14.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 22 | 32.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.6 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 6.4 | 2.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 77.8 | 77 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 0.9 | 0.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 190.8 | 186.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 263.2 | 262.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.9 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 117.3 | 111 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 185.8 | 185.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 240.3 | 237.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 331.2 | 329.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.1 | 0.68 | newest | [0.29, 0.48] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0079 |  |
| desktop | cua | 41/41 | 28 | 0.0079 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome | chrome_drag_visible_path_shared | cua | – | background | background | – | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 687 samples, against the run's cap of 1% (6.87).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T19:28:04.266Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 20610 requests, 2225 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

