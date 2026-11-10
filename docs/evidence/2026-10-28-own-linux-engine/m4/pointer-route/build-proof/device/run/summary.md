# linux-engine-diff summary

## t71-proof2-device (development run, not a release gate)

commit –; cua-engine 0.3.0 (ddee5fd5ae5a); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 c51164ac234a8de82963d94162d7f4f56130eb97189a5d2e9c32daa7cd1746b3, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (ddee5fd5ae5a); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 86.6 | 68.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 87.6 | 69 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.7 | 3.6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-82.375, -73.655]; warm faster [-69.08, -59.3]) |
| desktop | list_windows | **bar** | 86.6 | 68.8 | | | | | | | | | |
| desktop | list_apps | pinned | 81.7 | 73.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 83.8 | 67.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.1 | 4.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-82.855, -66.505]; warm faster [-69.91, -58.21]) |
| desktop | list_apps | **bar** | 81.7 | 67.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.4 | 27.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 35.7 | 28.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 33.5 | 23.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-6.065, 1.735]; warm faster [-5.34, -3.8]) |
| desktop | get_screenshot | **bar** | 35.7 | 27.3 | | | | | | | | | |
| desktop | launch_app | pinned | 3.8 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.3 | 1.2 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.865, 0.01]; warm within the bound [0.34, 0.82]) |
| desktop | launch_app | **bar** | 3.8 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3.4 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-firefox | firefox_click_pointer_out_shared | cua | 0.8 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.7 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 18.6 | 18.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 90.5 | 89.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 18.3 | 14.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 18.4 | 15.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 35.7 | 36.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.7 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 5.4 | 3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 76.9 | 76.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 1.5 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 193.2 | 187.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 265.4 | 263.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.8 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 112.9 | 111.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 185.7 | 187 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 241.1 | 238.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.4 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 330.4 | 329.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.21 | 0.72 | newest | [0.34, 0.82] | 1 |

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

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T11:07:10.595Z

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 20623 requests, 2225 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

