# linux-engine-diff summary

## dev2

commit 386d0877c8b9ba80ad8db6d05883502f58537128; cua-engine 0.3.0 (386d0877c8b9); occlusion covered; 2 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 38.5 | 34.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 37.9 | 36.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 5.9 | 3.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-35.535, -28.06]; warm faster [-32.68, -27.32]) |
| desktop | list_windows | **bar** | 37.9 | 34.5 | | | | | | | | | |
| desktop | list_apps | pinned | 42.3 | 36.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 40.9 | 34.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 6.9 | 4.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-36.4, -29.2]; warm faster [-32.04, -24.54]) |
| desktop | list_apps | **bar** | 40.9 | 34.3 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38.5 | 28.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 37.5 | 29.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 35.7 | 24.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-3.93, -0.23]; warm faster [-4.6, -3.43]) |
| desktop | get_screenshot | **bar** | 37.5 | 28.7 | | | | | | | | | |
| desktop | launch_app | pinned | 3.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.3 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.865, 0.03]; warm same (within noise) [-0.07, 0.04]) |
| desktop | launch_app | **bar** | 3.8 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3.2 | 0.1 | 14 | – | – | – | – | – | – | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 407.6 | 396.7 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.1 | 0.9 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 477.2 | 435.3 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 429.4 | 423.6 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 507.3 | 507.9 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 507.8 | 499.1 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 651.4 | 646 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 467.4 | 473.1 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 456.6 | 399.2 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 443.4 | 428.2 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 526 | 517.6 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 511.2 | 492 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 134.1 | 132.6 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 451.4 | 454.8 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 255.1 | 249.9 | 4 | – | – | – | 6/6 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 146 | 0.0211 |  |
| desktop | cua | 41/41 | 146 | 0.0211 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome | chrome_drag_visible_path_shared | cua | – | background | background | – | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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

run valid; every verdict PASS, finished 2026-11-01T08:03:49.134Z

