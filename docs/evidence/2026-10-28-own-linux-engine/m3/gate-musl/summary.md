# linux-engine-diff summary

## m3-gate-musl

commit cd4c929758caf90329fd5cfb0d5028f1ec1c92c2; cua-engine 0.3.0 (cd4c929758ca); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 218.9 | 226.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 221.9 | 240.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 17.7 | 11.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-218.035, -182.14]; warm faster [-243.01, -194.33]) |
| desktop | list_windows | **bar** | 218.9 | 226.8 | | | | | | | | | |
| desktop | list_apps | pinned | 236.3 | 226.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 233.2 | 210.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 20.4 | 15.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-228.145, -195.305]; warm faster [-212.67, -183.25]) |
| desktop | list_apps | **bar** | 233.2 | 210.6 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.3 | 28.8 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 38.3 | 29.3 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 37.5 | 26.2 | 21 | – | – | – | – | – | – | 61/61 | PASS (cold same (within noise) [-3.525, 0.905]; warm faster [-3.05, -1.92]) |
| desktop | get_screenshot | **bar** | 38.3 | 28.8 | | | | | | | | | |
| desktop | launch_app | pinned | 4.4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.2 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.1 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-1.745, -0.71]; warm same (within noise) [-0.1, 0.05]) |
| desktop | launch_app | **bar** | 4.2 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.7 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 686.1 | 715.2 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 690.4 | 700.9 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 102.5 | 85.2 | 21 | 3197 / 3196 | 84 / 91 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-611.635, -560.19]; warm faster [-668.64, -594.97]) |
| gedit | tree | **bar** | 686.1 | 700.9 | | | | | | | | | |
| gedit | tree_shot | pinned | 816.1 | 844.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 822 | 786.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 140.6 | 105 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-699.975, -658.225]; warm faster [-704.49, -653.26]) |
| gedit | tree_shot | **bar** | 816.1 | 786.6 | | | | | | | | | |
| gedit | press_key | pinned | 273.6 | 269 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.8 | 235.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 108.1 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-133.685, -131.715]; warm faster [-134.825, -134.4]) |
| gedit | press_key | **bar** | 240.8 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 220.1 | 215 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 222 | 215.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 120.9 | 113.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-100.06, -97.45]; warm faster [-101.165, -100.9]) |
| gedit | click | **bar** | 220.1 | 215 | | | | | | | | | |
| gedit | type_text | pinned | 10208.7 | 10204.8 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 1006.3 | 1017.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 184.2 | 172.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-832.16, -812.46]; warm faster [-880.66, -823.305]) |
| gedit | type_text | **bar** | 1006.3 | 1017.4 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10209 | 10205 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1012.4 | 1015.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 187.4 | 175.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-860.62, -809.14]; warm faster [-852.975, -806.295]) |
| gedit | type_text_selection | **bar** | 1012.4 | 1015.2 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 182 | 172 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.6 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 573.3 | 568.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 109 | 102.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-465.245, -462.45]; warm faster [-466.665, -465.76]) |
| gedit | type_characters | **bar** | 573.3 | 568.4 | | | | | | | | | |
| gedit | clipboard_read | pinned | 649.1 | 656.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | newest | 660.6 | 658.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 48.7 | 45.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-627.69, -590.255]; warm faster [-635.42, -582.385]) |
| gedit | clipboard_read | **bar** | 649.1 | 656.9 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10203 | 10203 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | newest | 10203.1 | 10203 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | cua | 179.4 | 178.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3.4 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | newest | 3.6 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | cua | 2.7 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 | PASS (cold faster [-1.055, -0.31]; warm same (within noise) [0, 0.04]) |
| gedit | clipboard_release | **bar** | 3.4 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 590 | 598.7 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 581.1 | 587.9 | 21 | 2285 / 2285 | 2285 / 2285 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 79.1 | 71.8 | 21 | 2285 / 2284 | 40 / 43 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-517.39, -473.8]; warm faster [-551.26, -494.08]) |
| chrome | tree | **bar** | 581.1 | 587.9 | | | | | | | | | |
| chrome | tree_shot | pinned | 739.4 | 690.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 734.3 | 691.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 128.7 | 93.6 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-644.05, -574.075]; warm faster [-613.71, -577.8]) |
| chrome | tree_shot | **bar** | 734.3 | 690.8 | | | | | | | | | |
| chrome | press_key | pinned | 273.7 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.9 | 236.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.6 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.835, -133.76]; warm faster [-135.31, -134.705]) |
| chrome | press_key | **bar** | 240.9 | 236.2 | | | | | | | | | |
| chrome | click | pinned | 219.4 | 215.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.8 | 215.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 118.6 | 113.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.47, -100.285]; warm faster [-101.665, -101.08]) |
| chrome | click | **bar** | 219.4 | 215.1 | | | | | | | | | |
| chrome-input | click_element | pinned | 487.8 | 461.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 465.1 | 472.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 156.5 | 149.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-351.065, -291.175]; warm faster [-354.055, -295.86]) |
| chrome-input | click_element | **bar** | 465.1 | 461.1 | | | | | | | | | |
| chrome-input | right_click | pinned | 498.7 | 477.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 487.3 | 489.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 171.9 | 163 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-329.675, -294.31]; warm faster [-347.37, -296.095]) |
| chrome-input | right_click | **bar** | 487.3 | 477.6 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 969.7 | 952 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 949.9 | 947 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 260.5 | 255.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-741.71, -656.46]; warm faster [-720.065, -660.54]) |
| chrome-input | right_click_fallback | **bar** | 949.9 | 947 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 476.5 | 470.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 471.5 | 448.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 157.1 | 148.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-334.38, -299.26]; warm faster [-331.015, -291.34]) |
| chrome-input | secondary_action | **bar** | 471.5 | 448.2 | | | | | | | | | |
| chrome-input | move | pinned | 206.8 | 202.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208.6 | 203.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 106.6 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.87, -99.745]; warm faster [-101.305, -100.92]) |
| chrome-input | move | **bar** | 206.8 | 202.5 | | | | | | | | | |
| chrome-input | drag | pinned | 709.1 | 716 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 417.6 | 412.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.4 | 1.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 417.6 | 412.1 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.5 | 311.2 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 317.6 | 312.1 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 215.1 | 210.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.89, -99.55]; warm faster [-101.375, -100.67]) |
| chrome-input | scroll | **bar** | 315.5 | 311.2 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 455.1 | 464 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 463.1 | 472.4 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 154.6 | 151.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-321.235, -282.415]; warm faster [-351.265, -287.52]) |
| chrome-input | scroll_element_hidden | **bar** | 455.1 | 464 | | | | | | | | | |
| chrome-input | key_down | pinned | 240 | 235.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 207 | 202.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 5.5 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-202.14, -200.6]; warm faster [-201.755, -201.325]) |
| chrome-input | key_down | **bar** | 207 | 202.4 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.7 | 100.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.6 | 100.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-0.16, -0.07]; warm faster [-0.28, -0.05]) |
| chrome-input | key_up | **bar** | 100.7 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 6 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 6 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 3.5 | 0.4 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold faster [-4.13, -0.55]; warm faster [-0.2, -0.045]) |
| chrome-input | activate_window | **bar** | 6 | 0.6 | | | | | | | | | |
| over-budget | tree | pinned | 7433.2 | 7064.3 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7228.4 | 7081.9 | 21 | 45097 / 45097 | 45097 / 45097 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 976.5 | 976.7 | 21 | 45271 / 45276 | 233 / 233 | 189 | 41/41 | clean | – | 41/41 | PASS (cold faster [-6513.31, -6033.375]; warm faster [-6253.09, -5970.07]) |
| over-budget | tree | **bar** | 7228.4 | 7064.3 | | | | | | | | | |
| retention | after_resize | pinned | 727.1 | 713 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 718 | 712 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 102.2 | 106.4 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-637.24, -566.21]; warm faster [-643.895, -548.92]) |
| retention | after_resize | **bar** | 718 | 712 | | | | | | | | | |
| retention | after_remap | pinned | 711.6 | 688.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 720.6 | 735 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 106.6 | 119 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-641.255, -573.13]; warm faster [-607.325, -541.125]) |
| retention | after_remap | **bar** | 711.6 | 688.6 | | | | | | | | | |
| retention | after_covered_change | pinned | 717.5 | 734.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 736.3 | 732.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 101.7 | 108.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-657.69, -583.045]; warm faster [-661.99, -595.16]) |
| retention | after_covered_change | **bar** | 717.5 | 732.7 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1095.9 | 1076.8 | 20 | – | – | – | 61/61 | clean | 59/61 | 61/61 |  |
| chrome-textarea | type_text | newest | 1059.4 | 2530.1 | 20 | – | – | – | 61/61 | clean | 1/1 | 1/61 |  |
| chrome-textarea | type_text | cua | 186 | 178.7 | 20 | – | – | – | 61/61 | clean | 61/61 | 61/61 | PASS (cold faster [-938.12, -895.59]; warm faster [-935.125, -885.375]) |
| chrome-textarea | type_text | **bar** | 1095.9 | 1076.8 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1369.8 | 1349.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | newest | 1290 | 1334.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 200.8 | 197.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1149.51, -1081.42]; warm faster [-1185.71, -1108.135]) |
| chrome-address-bar | type_text | **bar** | 1290 | 1334.2 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 559.3 | 549.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 962.8 | 950.4 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 86.5 | 79.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 4.2 | 1.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 105.7 | 20.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 3 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 6.2 | 3.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 3.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 28.5 | 22.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 123.8 | 124 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 206.7 | 117.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2.5 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 65.4 | 88.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 3 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 139.6 | 49.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.2 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 33.9 | 33.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 116.7 | 20.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 117.5 | 114.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 134.7 | 137.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.2 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 4 | 97.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 380.4 | 402.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.4 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 174.1 | 115.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 8.4 | 6.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 115.8 | 114.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.3 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 205.3 | 117.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 393.3 | 403.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.6 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 449.2 | 446 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 499.3 | 463 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 526.1 | 523.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 529.5 | 504.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 708.5 | 700.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 570.9 | 563.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 454.3 | 405.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 430.4 | 427.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 518.6 | 519 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 355.8 | 505.4 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 357.1 | 355.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 464.6 | 454 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 360.1 | 355.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

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
| gedit | clipboard_write | pinned | 0/40 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | newest | 0/40 | – | – | – | 1 / 0 / 0 |
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
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
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
| gedit | type_characters | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | type_characters | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | pinned | – | – | – | – | 0 / 1 / 0 |
| gedit | clipboard_read | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | cua | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | cua | – | – | – | – | 0 / 0 / 0 |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 228.52500700950623 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 203.42607599496841 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 196.88434702157974 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 201.6767789721489 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 169.8420940041542 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 164.26687401533127 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 655 | next request 179 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 199,236 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 242,202 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 231,196 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 183 | max 224 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2185 | next request 17 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2179 | next request 16 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2158 | next request 17 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2153 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2163 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2146 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 162 |  |
| gedit | caret_placed | 0 | PASS | success | 189 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 190 | route foreground |

The cases' bus trace (26898 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 4956 samples, against the run's cap of 1% (49.56).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 43, newest 0, cua 0:

- gedit type_text_selection pinned 0/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 1/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 2/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/5 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-1/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-2/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-3/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-4/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-5/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-6/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-7/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-8/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-9/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-10/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-11/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-12/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-13/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-14/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-15/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-16/0 (cold): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned topup-0-0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned audit/1: found ' diffe', put back 'cua171'
- gedit clipboard_read pinned audit/0: found ' diffe', put back 'cua171'
- gedit clipboard_read pinned bus/0: found ' diffe', put back 'cua171'

run valid; no verdict FAIL; **declared refusal** (a loss, not a pass): chrome-input drag cua; text restores (the first word put back before a sample): pinned 43, newest 0, cua 0, finished 2026-11-01T23:52:32.084Z

