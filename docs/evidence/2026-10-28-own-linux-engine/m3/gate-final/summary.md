# linux-engine-diff summary

## m3-gate-final

commit 37c3228cc6a40780a336cdce188109146b45ded2; cua-engine 0.3.0 (37c3228cc6a4); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 228.1 | 217.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 240.4 | 223.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 15.8 | 10 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-237.41, -189.58]; warm faster [-229.85, -182.24]) |
| desktop | list_windows | **bar** | 228.1 | 217.6 | | | | | | | | | |
| desktop | list_apps | pinned | 199.5 | 204 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 214.8 | 217.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 17.7 | 12.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-203.955, -174.685]; warm faster [-218.98, -181.42]) |
| desktop | list_apps | **bar** | 199.5 | 204 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.3 | 29.3 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 40 | 29.4 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 39.8 | 25 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 39.8 against 39.3, within the pinned build's spread [30.88, 60.17]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm faster [-5.96, -3.25]) |
| desktop | get_screenshot | **bar** | 39.3 | 29.3 | | | | | | | | | |
| desktop | launch_app | pinned | 4.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4.5 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.965, 0.625]; warm faster [-0.21, -0.01]) |
| desktop | launch_app | **bar** | 4.7 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3.2 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 699.3 | 670.8 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 710.7 | 703.4 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 92.1 | 81.9 | 21 | 3197 / 3196 | 62 / 73 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-648.055, -592.8]; warm faster [-607.21, -550.53]) |
| gedit | tree | **bar** | 699.3 | 670.8 | | | | | | | | | |
| gedit | tree_shot | pinned | 888.9 | 852.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 851.3 | 822 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 134.7 | 106.1 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-791.56, -660.665]; warm faster [-733.32, -700.81]) |
| gedit | tree_shot | **bar** | 851.3 | 822 | | | | | | | | | |
| gedit | press_key | pinned | 273.9 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.7 | 235.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 108.1 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-133.1, -131.75]; warm faster [-134.65, -134.26]) |
| gedit | press_key | **bar** | 240.7 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 219.4 | 215.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 220.9 | 215.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 121 | 113.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.115, -97.62]; warm faster [-101.355, -101.085]) |
| gedit | click | **bar** | 219.4 | 215.1 | | | | | | | | | |
| gedit | type_text | pinned | 10208.3 | 10204.6 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 1001.5 | 1007.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 183.1 | 169 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-831.57, -803.535]; warm faster [-863.715, -822.82]) |
| gedit | type_text | **bar** | 1001.5 | 1007.7 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10209.1 | 10204.8 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1006.1 | 1015.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 185.5 | 168 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-834.745, -808.78]; warm faster [-859.365, -822.745]) |
| gedit | type_text_selection | **bar** | 1006.1 | 1015.8 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 182.9 | 170.2 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.6 | 0.1 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 572.7 | 568.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108.4 | 102.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-466.135, -462.98]; warm faster [-466.905, -465.575]) |
| gedit | type_characters | **bar** | 572.7 | 568.3 | | | | | | | | | |
| gedit | clipboard_read | pinned | 600.3 | 648.1 | 45 | – | – | – | 86/86 | clean | 6/6 | 6/86 |  |
| gedit | clipboard_read | newest | 668.1 | 678 | 45 | – | – | – | 86/86 | clean | 86/86 | 86/86 |  |
| gedit | clipboard_read | cua | 46.8 | 42.3 | 45 | – | – | – | 86/86 | clean | 86/86 | 86/86 | PASS (cold faster [-643.18, -604.26]; warm faster [-653.36, -608.35]) |
| gedit | clipboard_read | **bar** | 668.1 | 678 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10203.6 | 10202.8 | 20 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | clipboard_write | newest | 10203.1 | 10202.9 | 20 | – | – | – | 41/41 | clean | – | 6/41 |  |
| gedit | clipboard_write | cua | 176.4 | 176.4 | 20 | – | – | – | 40/41 | clean | 40/40 | 41/41 (40 declared) | FAIL: cua: a request failed; cua: 1 sample's preparation failed (clipboard_read for a handle failed: cua171-diff-m3-gate-final-gedit-text_cua refused the selection); cua: the witness changed (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3.3 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 |  |
| gedit | clipboard_release | newest | 3.4 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 |  |
| gedit | clipboard_release | cua | 2.9 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 | PASS (cold same (within noise) [-0.735, 0.14]; warm same (within noise) [-0.01, 0.025]) |
| gedit | clipboard_release | **bar** | 3.3 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 584.8 | 578.9 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 624.4 | 555.2 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 75.7 | 68.5 | 21 | 2285 / 2284 | 33 / 28 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-521.06, -475.04]; warm faster [-504.27, -456.29]) |
| chrome | tree | **bar** | 584.8 | 555.2 | | | | | | | | | |
| chrome | tree_shot | pinned | 678.7 | 687.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 695.2 | 726.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 117.6 | 93.5 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-598.1, -548.28]; warm faster [-632.29, -549.94]) |
| chrome | tree_shot | **bar** | 678.7 | 687.8 | | | | | | | | | |
| chrome | press_key | pinned | 273.6 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.7 | 236 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.3 | 101.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.895, -133.8]; warm faster [-134.955, -134.68]) |
| chrome | press_key | **bar** | 240.7 | 236 | | | | | | | | | |
| chrome | click | pinned | 219 | 215.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 221.2 | 216.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 119.3 | 113.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.1, -99.18]; warm faster [-101.49, -101.01]) |
| chrome | click | **bar** | 219 | 215.1 | | | | | | | | | |
| chrome-input | click_element | pinned | 476.2 | 432.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 469.7 | 448 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 153.5 | 147.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-341.285, -297.385]; warm faster [-316.715, -279.29]) |
| chrome-input | click_element | **bar** | 469.7 | 432.9 | | | | | | | | | |
| chrome-input | right_click | pinned | 485.5 | 472.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 489.9 | 461.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 168.2 | 159.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-342.77, -290.775]; warm faster [-317.825, -295.74]) |
| chrome-input | right_click | **bar** | 485.5 | 461.3 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 951.7 | 957.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 957.5 | 956.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 258.5 | 249.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-734.36, -660.605]; warm faster [-736.995, -640.565]) |
| chrome-input | right_click_fallback | **bar** | 951.7 | 956.5 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 450.2 | 462.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 451.2 | 455.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 151.8 | 145.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-323.145, -290.225]; warm faster [-330.155, -296.28]) |
| chrome-input | secondary_action | **bar** | 450.2 | 455.3 | | | | | | | | | |
| chrome-input | move | pinned | 206.7 | 202.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208.6 | 203.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 106.8 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.745, -99.645]; warm faster [-101.5, -100.925]) |
| chrome-input | move | **bar** | 206.7 | 202.5 | | | | | | | | | |
| chrome-input | drag | pinned | 717.7 | 704.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 421.1 | 413.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.9 | 1.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 421.1 | 413.6 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.9 | 311.3 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 317.2 | 311.8 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 215.6 | 210.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.985, -99.955]; warm faster [-101.635, -100.765]) |
| chrome-input | scroll | **bar** | 315.9 | 311.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 467.6 | 464.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 477.9 | 464.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 151.4 | 144.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-344.905, -295.25]; warm faster [-334.305, -304.26]) |
| chrome-input | scroll_element_hidden | **bar** | 467.6 | 464.7 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.5 | 235.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206.7 | 202.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 6.5 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.74, -199.595]; warm faster [-201.665, -201.315]) |
| chrome-input | key_down | **bar** | 206.7 | 202.3 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.7 | 100.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-0.22, -0.02]; warm faster [-0.38, -0.03]) |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 4.3 | 0.7 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 4.9 | 0.5 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 3.5 | 0.4 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold faster [-1.535, -0.155]; warm faster [-0.305, -0.14]) |
| chrome-input | activate_window | **bar** | 4.3 | 0.5 | | | | | | | | | |
| over-budget | tree | pinned | 7466.7 | 7310.1 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7476.8 | 7057.9 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 998.4 | 969.7 | 21 | 45287 / 45274 | 175 / 193 | 190 | 41/41 | clean | – | 41/41 | PASS (cold faster [-6711.08, -6296.14]; warm faster [-6317.69, -6028.3]) |
| over-budget | tree | **bar** | 7466.7 | 7057.9 | | | | | | | | | |
| retention | after_resize | pinned | 727.9 | 714.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 735.9 | 771.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 96.6 | 98.1 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-677.96, -594.76]; warm faster [-655.705, -575.62]) |
| retention | after_resize | **bar** | 727.9 | 714.7 | | | | | | | | | |
| retention | after_remap | pinned | 708.5 | 699.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 750.1 | 750.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 102.2 | 99.6 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-627.275, -585.53]; warm faster [-637.67, -578.96]) |
| retention | after_remap | **bar** | 708.5 | 699.1 | | | | | | | | | |
| retention | after_covered_change | pinned | 744.1 | 745.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 709.3 | 704.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 98.6 | 100.5 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-655.44, -578.85]; warm faster [-649.145, -578.585]) |
| retention | after_covered_change | **bar** | 709.3 | 704.5 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1121.4 | 1077.1 | 20 | – | – | – | 61/61 | clean | 59/61 | 61/61 |  |
| chrome-textarea | type_text | newest | 1118.9 | 2539 | 20 | – | – | – | 61/61 | clean | 1/1 | 1/61 |  |
| chrome-textarea | type_text | cua | 184.9 | 173.1 | 20 | – | – | – | 61/61 | clean | 61/61 | 61/61 | PASS (cold faster [-980.12, -909.1]; warm faster [-920.405, -884.35]) |
| chrome-textarea | type_text | **bar** | 1121.4 | 1077.1 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1365.6 | 1337.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | newest | 1292.9 | 1302 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 195.9 | 205.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1127.365, -1073.53]; warm faster [-1125.305, -1052.175]) |
| chrome-address-bar | type_text | **bar** | 1292.9 | 1302 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 548.2 | 524.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 998.6 | 952.3 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 88.7 | 80 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 3.9 | 1.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 106.5 | 22.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 3.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 10.4 | 3.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 17 | 25.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 122.7 | 120.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 202.5 | 116.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 67.2 | 91.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.3 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 141.2 | 55.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 28 | 28.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 104.5 | 24.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 116.4 | 114.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 136 | 133.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 4 | 96.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.8 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 414.9 | 404.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.2 | 0.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 176 | 122 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.4 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 6.1 | 5.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 115.6 | 114.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 203.7 | 113.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 399.6 | 390.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.5 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 451.4 | 468.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 519.6 | 462.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 494.5 | 497.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 519.4 | 440.1 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 786.5 | 813.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 134.4 | 471.4 | 6 | – | – | – | 9/9 | clean | 6/9 | – | FAIL: the effect was not verified on 3 of 9 samples (0/0, 1/0, 2/0) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 458.8 | 402.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 434.9 | 423.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 499 | 513.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 295.3 | 504.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 134.5 | 131 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 456.8 | 451.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 263.8 | 249.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 146 | 0.0211 |  |
| desktop | cua | 61/61 | 146 | 0.0211 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 0 | 0 |  |
| gedit | cua | 41/41 | 0 | 0 |  |
| chrome | pinned | 41/41 | 0 | 0 |  |
| chrome | newest | 41/41 | 0 | 0 |  |
| chrome | cua | 41/41 | 0 | 0 |  |
| retention | pinned | 120/120 | 0 | 0 |  |
| retention | newest | 120/120 | 0 | 0 |  |
| retention | cua | 120/120 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |
| gedit | click | cua | – | – | background | – | – |
| gedit | type_text | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_selection | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text_selection | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text_selection | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_dedicated | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gedit | type_characters | cua | – | background | background | – | 0 / 0 / 0 |
| gedit | clipboard_write | pinned | 35/41 | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_write | newest | 0/41 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 41/41 | background | background | – | 0 / 0 / 0 |
| chrome | press_key | cua | – | – | background | – | – |
| chrome | click | cua | – | – | background | – | – |
| chrome-input | right_click | cua | – | – | background | – | – |
| chrome-input | right_click_fallback | cua | – | – | background | – | – |
| chrome-input | move | cua | – | – | background | – | – |
| chrome-input | scroll | cua | – | – | background | – | – |
| chrome-input | scroll_element_hidden | cua | – | – | background | – | – |
| chrome-input | key_down | cua | – | – | background | – | – |
| chrome-input | key_up | cua | – | – | background | – | – |
| chrome-textarea | type_text | pinned | 61/61 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 61/61 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 61/61 | background | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 40/40 | foreground | foreground | stacking, focus, active | 0 / 0 / 0 |
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome | chrome_drag_visible_path_shared | cua | – | background | background | – | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | – | foreground | foreground | stacking, pointer | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |
| gedit | type_characters | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | type_characters | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | cua | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | cua | – | – | – | – | 0 / 0 / 0 |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 173.0391889810562 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 160.43447798490524 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 169.56059300899506 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 179.73229801654816 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 166.87928104400635 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 178.92592203617096 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 659 | next request 201 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 196,235 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 189,225 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 231,193 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 190 | max 236 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2185 | next request 18 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2183 | next request 19 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2152 | next request 14 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2150 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2157 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2164 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 167 |  |
| gedit | caret_placed | 0 | PASS | success | 181 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 158 | route foreground |

The cases' bus trace (26898 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

run valid; **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua, gedit clipboard_write cua; **parity** (declared, not a pass): desktop get_screenshot cua; **declared refusal** (a loss, not a pass): chrome-input drag cua, finished 2026-11-01T12:50:31.160Z

