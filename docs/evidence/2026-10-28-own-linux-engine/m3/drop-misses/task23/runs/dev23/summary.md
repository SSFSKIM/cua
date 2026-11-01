# linux-engine-diff summary

## dev23

commit a206f38dff6d13ec7ed1691698b3addd019db0e0; cua-engine 0.3.0 (3f00e0d317b4); occlusion covered; 2 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 35.1 | 32.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 37.2 | 39.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.1 | 2.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-30.67, -25.755]; warm faster [-35.23, -23.03]) |
| desktop | list_windows | **bar** | 35.1 | 32.6 | | | | | | | | | |
| desktop | list_apps | pinned | 38.5 | 33.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 38.3 | 33.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 7.8 | 5.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-33.175, -26.955]; warm faster [-30.64, -26.67]) |
| desktop | list_apps | **bar** | 38.3 | 33.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 40.3 | 28.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.8 | 30 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 37.6 | 25.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-5.72, 1.27]; warm faster [-4.14, -2.52]) |
| desktop | get_screenshot | **bar** | 38.8 | 28.8 | | | | | | | | | |
| desktop | launch_app | pinned | 3.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.2 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.795, -0.145]; warm same (within noise) [-0.12, 0.02]) |
| desktop | launch_app | **bar** | 3.7 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.4 | 0.1 | 14 | – | – | – | – | – | – | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 402.4 | 393.2 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 0.8 | 0.8 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 368.8 | 368.4 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 428.9 | 421.1 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 465.8 | 468.7 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 280.6 | 278.5 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 444.9 | 449.4 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 469.8 | 472.2 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 446.5 | 390 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 434.1 | 431.9 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 278.9 | 276.3 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 277.7 | 272.2 | 4 | – | – | – | 0/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 355.2 | 353.4 | 4 | – | – | – | 6/6 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 451.3 | 448.1 | 4 | – | – | – | 6/6 | clean | 6/6 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 356.2 | 354.3 | 4 | – | – | – | 6/6 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 152 | 0.0191 |  |
| desktop | cua | 41/41 | 152 | 0.0191 |  |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 598 samples, against the run's cap of 1% (5.98).

run valid; every verdict PASS, finished 2026-11-01T17:06:30.618Z

