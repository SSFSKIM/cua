# linux-engine-diff summary

## m3-gate

commit bcf64d68401c36bee3e7eeec859f8560bc44dc4f; cua-engine 0.3.0 (bcf64d68401c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 251.3 | 233.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 237.8 | 242.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 17 | 12.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-239.915, -204.5]; warm faster [-233.01, -206.44]) |
| desktop | list_windows | **bar** | 237.8 | 233.5 | | | | | | | | | |
| desktop | list_apps | pinned | 238.3 | 247.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 237.9 | 210.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 17.3 | 11.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-237.78, -195.27]; warm faster [-218.84, -194.1]) |
| desktop | list_apps | **bar** | 237.9 | 210.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 36.9 | 28.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 36.7 | 29.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 34 | 25 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-6.085, 0.19]; warm faster [-3.89, -2.57]) |
| desktop | get_screenshot | **bar** | 36.7 | 28.1 | | | | | | | | | |
| desktop | launch_app | pinned | 4 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.1 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.7 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.535, 0.14]; warm same (within noise) [-0.12, 0.07]) |
| desktop | launch_app | **bar** | 4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.9 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 715.7 | 700.3 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 723.9 | 716.4 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.2 | 93.3 | 21 | 3197 / 3196 | 67 / 97 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-685.73, -594.515]; warm faster [-654.27, -584.7]) |
| gedit | tree | **bar** | 715.7 | 700.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 824.5 | 838.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 830.2 | 840.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 130.9 | 105.3 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-747.095, -660.33]; warm faster [-770.44, -694.1]) |
| gedit | tree_shot | **bar** | 824.5 | 838.2 | | | | | | | | | |
| gedit | press_key | pinned | 273.6 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.8 | 236 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 108.4 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-133.365, -131.57]; warm faster [-135.005, -134.56]) |
| gedit | press_key | **bar** | 240.8 | 236 | | | | | | | | | |
| gedit | click | pinned | 219.1 | 215 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221.2 | 215.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 121.2 | 113.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.03, -97.55]; warm faster [-101.265, -100.885]) |
| gedit | click | **bar** | 219.1 | 215 | | | | | | | | | |
| gedit | type_text | pinned | 10208.2 | 10204.5 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 1018.4 | 1022.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 185.6 | 168.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-853.45, -815.08]; warm faster [-858.97, -827.505]) |
| gedit | type_text | **bar** | 1018.4 | 1022.5 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10208.3 | 10204.7 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1011.5 | 1008 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 184 | 172.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-860.39, -807.76]; warm faster [-845.64, -814.33]) |
| gedit | type_text_selection | **bar** | 1011.5 | 1008 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 189.3 | 176.7 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.8 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 572.7 | 568.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108.2 | 102.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-465.755, -463.2]; warm faster [-466.74, -465.825]) |
| gedit | type_characters | **bar** | 572.7 | 568.6 | | | | | | | | | |
| gedit | clipboard_read | pinned | 709.8 | 701.5 | 20 | – | – | – | 40/40 | clean | 6/6 | 6/40 |  |
| gedit | clipboard_read | newest | 650.3 | 638.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 45.9 | 38.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-634.185, -594.145]; warm faster [-607.625, -592.05]) |
| gedit | clipboard_read | **bar** | 650.3 | 638.1 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10203.1 | 10203 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | newest | 10203 | 10202.8 | 20 | – | – | – | 40/40 | clean | – | 7/40 |  |
| gedit | clipboard_write | cua | 177.7 | 174.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 |  |
| gedit | clipboard_release | newest | 2.9 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 |  |
| gedit | clipboard_release | cua | 2.6 | 0.1 | 40 | – | – | – | 60/60 | clean | – | 60/60 | PASS (cold same (within noise) [-1.975, 0.37]; warm same (within noise) [0, 0.025]) |
| gedit | clipboard_release | **bar** | 2.9 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 572.4 | 597 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 595.3 | 602.2 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 80 | 62.2 | 21 | 2285 / 2284 | 35 / 36 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-513.87, -473.685]; warm faster [-578.4, -473.37]) |
| chrome | tree | **bar** | 572.4 | 597 | | | | | | | | | |
| chrome | tree_shot | pinned | 710 | 759.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 720.7 | 680.4 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 132.5 | 94.3 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-616.15, -554.635]; warm faster [-633.06, -572.25]) |
| chrome | tree_shot | **bar** | 710 | 680.4 | | | | | | | | | |
| chrome | press_key | pinned | 273.1 | 269.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.6 | 236.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.3 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.92, -134.025]; warm faster [-134.99, -134.67]) |
| chrome | press_key | **bar** | 240.6 | 236.2 | | | | | | | | | |
| chrome | click | pinned | 218.9 | 215.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.5 | 216 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 119.1 | 113.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.34, -99.3]; warm faster [-101.93, -101.15]) |
| chrome | click | **bar** | 218.9 | 215.3 | | | | | | | | | |
| chrome-input | click_element | pinned | 482.5 | 465.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 457.1 | 466.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 150.6 | 146.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-336.115, -296.49]; warm faster [-335.78, -300.8]) |
| chrome-input | click_element | **bar** | 457.1 | 465.2 | | | | | | | | | |
| chrome-input | right_click | pinned | 486 | 481.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 490.3 | 471.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 166.2 | 158.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-341.335, -302.77]; warm faster [-347.48, -299.645]) |
| chrome-input | right_click | **bar** | 486 | 471.8 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 979 | 942.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 973.3 | 923 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 256.5 | 248.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-724.595, -689.61]; warm faster [-726.72, -648.42]) |
| chrome-input | right_click_fallback | **bar** | 973.3 | 923 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 479.5 | 470.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 478.8 | 456.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 153.8 | 142.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-353.205, -300.19]; warm faster [-341.88, -295.39]) |
| chrome-input | secondary_action | **bar** | 478.8 | 456.4 | | | | | | | | | |
| chrome-input | move | pinned | 206.6 | 202.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208.4 | 203.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 106.4 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.555, -99.625]; warm faster [-101.445, -100.935]) |
| chrome-input | move | **bar** | 206.6 | 202.5 | | | | | | | | | |
| chrome-input | drag | pinned | 710.6 | 711.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 416.3 | 413.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.4 | 1 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 416.3 | 413.3 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.3 | 311.5 | 20 | – | – | – | 40/40 | clean | 33/40 | 40/40 |  |
| chrome-input | scroll | newest | 317 | 311.9 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 215.5 | 210 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.405, -99.43]; warm faster [-101.75, -101.18]) |
| chrome-input | scroll | **bar** | 315.3 | 311.5 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 474.2 | 444.4 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 478.5 | 458.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 152.8 | 141.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-351.495, -300.57]; warm faster [-326.42, -297.84]) |
| chrome-input | scroll_element_hidden | **bar** | 474.2 | 444.4 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.7 | 235.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206.5 | 202.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 6.1 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.915, -199.86]; warm faster [-201.66, -201.345]) |
| chrome-input | key_down | **bar** | 206.5 | 202.4 | | | | | | | | | |
| chrome-input | key_up | pinned | 134 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.7 | 100.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold same (within noise) [-0.31, 0.02]; warm faster [-0.23, -0.095]) |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 5.6 | 0.7 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 4.5 | 0.7 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 3.8 | 0.4 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold faster [-1.81, -0.025]; warm faster [-0.405, -0.155]) |
| chrome-input | activate_window | **bar** | 4.5 | 0.7 | | | | | | | | | |
| over-budget | tree | pinned | 7238.7 | 7203.6 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7266.8 | 7100.8 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 983.5 | 974.7 | 21 | 45285 / 45284 | 147 / 171 | 190 | 41/41 | clean | – | 41/41 | PASS (cold faster [-6507.305, -6118.78]; warm faster [-6434.6, -5944.8]) |
| over-budget | tree | **bar** | 7238.7 | 7100.8 | | | | | | | | | |
| retention | after_resize | pinned | 719.1 | 677.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 770.2 | 702.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 104.3 | 94 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-641.675, -593.09]; warm faster [-612.875, -564.86]) |
| retention | after_resize | **bar** | 719.1 | 677.4 | | | | | | | | | |
| retention | after_remap | pinned | 732.8 | 733.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 706.3 | 714.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 108.5 | 96.9 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-636.76, -570.525]; warm faster [-679.63, -558.115]) |
| retention | after_remap | **bar** | 706.3 | 714.1 | | | | | | | | | |
| retention | after_covered_change | pinned | 726.1 | 768.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 708.9 | 761.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 100.8 | 119.5 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-633.885, -580.785]; warm faster [-703.51, -583.22]) |
| retention | after_covered_change | **bar** | 708.9 | 761.8 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1095.3 | 1089.9 | 20 | – | – | – | 61/61 | clean | 59/61 | 61/61 |  |
| chrome-textarea | type_text | newest | 1083 | 2547.4 | 20 | – | – | – | 61/61 | clean | 1/1 | 1/61 |  |
| chrome-textarea | type_text | cua | 182.4 | 173.8 | 20 | – | – | – | 61/61 | clean | 61/61 | 61/61 | PASS (cold faster [-936.37, -902.19]; warm faster [-948.59, -890.61]) |
| chrome-textarea | type_text | **bar** | 1095.3 | 1089.9 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1349.8 | 1366.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | newest | 1299.4 | 1313.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 195.6 | 196 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1146.65, -1065.02]; warm faster [-1137.955, -1082.13]) |
| chrome-address-bar | type_text | **bar** | 1299.4 | 1313.6 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 578.8 | 561.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 971.4 | 977.4 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 81.9 | 79.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 4.1 | 1.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 105.4 | 20 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 1.8 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 7.6 | 5.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 26 | 18.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 127.3 | 120.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 202.9 | 114.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 69.5 | 91.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 3 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 170.4 | 54.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 31.5 | 30.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 113.3 | 26.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 116.7 | 115.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 150.4 | 134.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 0.9 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 5.3 | 96.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 372 | 377.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.2 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 173.4 | 119.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 5.9 | 7.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 115.9 | 114.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 1.9 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 204.7 | 120.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 426.1 | 397.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.3 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 509.4 | 499 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 431.1 | 424.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 517.8 | 514.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 568 | 499.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 740.6 | 821 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 477 | 467.5 | 6 | – | – | – | 9/9 | clean | 8/9 | – | FAIL: the effect was not verified on 1 of 9 samples (2/0) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 452.2 | 402.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 427.9 | 430.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 330.4 | 494.3 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 332.6 | 432.9 | 6 | – | – | – | 2/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 146 | 0.0211 |  |
| desktop | cua | 41/41 | 146 | 0.0211 |  |
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
| gedit | clipboard_write | pinned | 34/40 | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_write | newest | 1/40 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 40/40 | background | background | – | 0 / 0 / 0 |
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
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome | chrome_drag_visible_path_shared | cua | – | background | background | – | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | – | – | background | – | – |
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
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 178.34067195653915 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 180.4148119688034 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 165.28499102592468 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 165.2302680015564 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 169.93253803253174 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 162.61688101291656 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 657 | next request 185 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 240,205 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 233,196 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 231,194 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 188 | max 236 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2172 | next request 30 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2199 | next request 16 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2161 | next request 22 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2150 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2151 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2149 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 158 |  |
| gedit | caret_placed | 0 | PASS | success | 185 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 193 | route foreground |

The cases' bus trace (26898 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

run valid; **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua; **declared refusal** (a loss, not a pass): chrome-input drag cua, finished 2026-10-31T22:00:46.092Z

