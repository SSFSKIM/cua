# linux-engine-diff summary

## t62f-device-idle (development run, not a release gate)

commit –; cua-engine 0.3.0 (0ad17f8f0ed8); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 a695199151f1f6d8e23e0aee758acb61070d869c3849cd544d669134ee827e7d, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (0ad17f8f0ed8); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 85.1 | 79.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 81.7 | 65.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.8 | 5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-91.83, -63.765]; warm faster [-71.77, -56.46]) |
| desktop | list_windows | **bar** | 81.7 | 65.1 | | | | | | | | | |
| desktop | list_apps | pinned | 89.4 | 67.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 99 | 63.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.4 | 7.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-100.425, -68.02]; warm faster [-63.37, -54.22]) |
| desktop | list_apps | **bar** | 89.4 | 63.7 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38 | 29 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 40.4 | 29.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 36.3 | 27.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-5.76, 1.04]; warm faster [-2.41, -0.66]) |
| desktop | get_screenshot | **bar** | 38 | 29 | | | | | | | | | |
| desktop | launch_app | pinned | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.2 | 1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-1.57, -0.065]; warm within the bound [0.25, 0.48]) |
| desktop | launch_app | **bar** | 4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.7 | 0.2 | 7 | – | – | – | – | – | – | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 0.9 | 0.9 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.5 | 1.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 33.1 | 27.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 98.1 | 16.5 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 17.6 | 14.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 20.4 | 32.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.2 | 1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 7.8 | 86.7 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 2 | 1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 348.4 | 321.6 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.2 | 2.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 163.8 | 112.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 328.1 | 326.7 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 364.6 | 372.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 178.8 | 190.8 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 421.7 | 450 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 365.2 | 366.2 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 443.3 | 394.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 320.2 | 332.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 179.9 | 190.1 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 189.9 | 182.3 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 255.5 | 253.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 444.9 | 453.6 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 257.5 | 255.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.01 | 0.65 | newest | [0.25, 0.48] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 152 | 0.0191 |  |
| desktop | cua | 41/41 | 152 | 0.0191 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | – | foreground | foreground | stacking, pointer | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 572 samples, against the run's cap of 1% (5.72).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-07T12:48:48.485Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13875 requests, 2911 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

