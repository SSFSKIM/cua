# linux-engine-diff summary

## t18-verdict-fix

commit a769edcddc6aa7cdf458380814b965734b20d52c; cua-engine 0.3.0 (a769edcddc6a); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 203.2 | 225 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 207.8 | 199.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 14.9 | 9.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-206.45, -173.51]; warm faster [-201.87, -177.24]) |
| desktop | list_windows | **bar** | 203.2 | 199.6 | | | | | | | | | |
| desktop | list_apps | pinned | 215.8 | 210.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 204.4 | 213.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 16.8 | 11.4 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-202.49, -169.84]; warm faster [-224.89, -189.22]) |
| desktop | list_apps | **bar** | 204.4 | 210.4 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38.3 | 28.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.7 | 29.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 33 | 24.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold same (within noise) [-6.935, 0.34]; warm faster [-4.81, -2.71]) |
| desktop | get_screenshot | **bar** | 38.3 | 28.7 | | | | | | | | | |
| desktop | launch_app | pinned | 4.2 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.2 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.6 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-0.89, -0.025]; warm same (within noise) [-0.1, 0.04]) |
| desktop | launch_app | **bar** | 4.2 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 3.1 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 725.5 | 737.2 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 733.6 | 715.7 | 21 | 3197 / 3197 | 3197 / 3197 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 99 | 89.8 | 21 | 3197 / 3196 | 70 / 88 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-677.31, -610.37]; warm faster [-647.49, -586.12]) |
| gedit | tree | **bar** | 725.5 | 715.7 | | | | | | | | | |
| gedit | tree_shot | pinned | 848.8 | 812.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 834.3 | 792.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 133.3 | 110 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-789.315, -667.265]; warm faster [-723.79, -656.85]) |
| gedit | tree_shot | **bar** | 834.3 | 792.9 | | | | | | | | | |
| gedit | press_key | pinned | 273.8 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.7 | 236.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 107.9 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-133.845, -132.08]; warm faster [-134.94, -134.42]) |
| gedit | press_key | **bar** | 240.7 | 236.1 | | | | | | | | | |
| gedit | click | pinned | 219.7 | 215.4 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221.5 | 215.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 121.5 | 114.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.375, -97.14]; warm faster [-101.98, -101.13]) |
| gedit | click | **bar** | 219.7 | 215.4 | | | | | | | | | |
| gedit | type_text | pinned | 10208.2 | 10205 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 988.3 | 1002.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 185.1 | 173.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-827.825, -792.47]; warm faster [-840.615, -815.905]) |
| gedit | type_text | **bar** | 988.3 | 1002.4 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10209 | 10204.7 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1007.3 | 1016.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 182.7 | 171.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-844.825, -799.94]; warm faster [-876.845, -802.365]) |
| gedit | type_text_selection | **bar** | 1007.3 | 1016.4 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 195.1 | 178.9 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.7 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 573.7 | 568.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108.7 | 102.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-466.26, -462.72]; warm faster [-467.15, -465.91]) |
| gedit | type_characters | **bar** | 573.7 | 568.9 | | | | | | | | | |
| gedit | clipboard_read | pinned | 619.8 | 625 | 105 | – | – | – | 222/222 | clean | 6/6 | 6/222 |  |
| gedit | clipboard_read | newest | 670 | 655.5 | 105 | – | – | – | 222/222 | clean | 222/222 | 222/222 |  |
| gedit | clipboard_read | cua | 47.2 | 40.2 | 105 | – | – | – | 222/222 | clean | 222/222 | 222/222 | FAIL: cua: cold 47.18 ms against the bar 619.75 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 40.19 ms against the bar 624.98 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| gedit | clipboard_read | **bar** | 619.8 | 625 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10202.7 | 10203.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | clipboard_write | newest | 10202.9 | 10203.3 | 15 | – | – | – | 18/18 | clean | – | 6/18 |  |
| gedit | clipboard_write | cua | 189.1 | 171.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3.9 | 0.1 | 90 | – | – | – | 115/115 | clean | – | 115/115 |  |
| gedit | clipboard_release | newest | 4.3 | 0.1 | 90 | – | – | – | 115/115 | clean | – | 115/115 |  |
| gedit | clipboard_release | cua | 3.6 | 0.1 | 90 | – | – | – | 115/115 | clean | – | 115/115 | FAIL: cua: warm 0.13 ms against the bar 0.11 ms, undetermined: 10 samples a side, fewer than 20; not judged on medians (cold same (within noise) [-0.925, 0.16]) |
| gedit | clipboard_release | **bar** | 4 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 570.7 | 601.3 | 21 | 2273 / 2273 | 2273 / 2273 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 581.4 | 626.2 | 21 | 2273 / 2273 | 2273 / 2273 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 75.4 | 66.4 | 21 | 2273 / 2272 | 36 / 32 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-521.32, -459.16]; warm faster [-554.2, -512.2]) |
| chrome | tree | **bar** | 570.7 | 601.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 745.7 | 757.5 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 743.9 | 732.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 127.2 | 98 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-663.565, -583.41]; warm faster [-690, -605.16]) |
| chrome | tree_shot | **bar** | 743.9 | 732.1 | | | | | | | | | |
| chrome | press_key | pinned | 273.3 | 269.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.6 | 236.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.5 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.6, -133.475]; warm faster [-134.915, -134.6]) |
| chrome | press_key | **bar** | 240.6 | 236.1 | | | | | | | | | |
| chrome | click | pinned | 219.4 | 215.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.7 | 215.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 119 | 114 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.255, -99.905]; warm faster [-101.315, -100.94]) |
| chrome | click | **bar** | 219.4 | 215.2 | | | | | | | | | |
| chrome-input | click_element | pinned | 461.4 | 444.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 450.6 | 470.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 151.9 | 143 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-316.9, -288.27]; warm faster [-323.105, -288.665]) |
| chrome-input | click_element | **bar** | 450.6 | 444.9 | | | | | | | | | |
| chrome-input | right_click | pinned | 461.8 | 463.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 493 | 479.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 168.2 | 160 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-327.525, -275.24]; warm faster [-326.43, -290.945]) |
| chrome-input | right_click | **bar** | 461.8 | 463.9 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 908.2 | 937.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 943.5 | 899.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 255.4 | 245.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-678.28, -636.865]; warm faster [-704.14, -629.575]) |
| chrome-input | right_click_fallback | **bar** | 908.2 | 899.9 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 479.2 | 455.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 471.7 | 449.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 151.4 | 142.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-338.625, -309.135]; warm faster [-325.595, -300.015]) |
| chrome-input | secondary_action | **bar** | 471.7 | 449.4 | | | | | | | | | |
| chrome-input | move | pinned | 207.1 | 202.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208.3 | 203.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 106.8 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.93, -99.82]; warm faster [-101.265, -100.945]) |
| chrome-input | move | **bar** | 207.1 | 202.5 | | | | | | | | | |
| chrome-input | drag | pinned | 726.9 | 708.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 423.2 | 417.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.2 | 1 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 423.2 | 417.3 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.8 | 311.6 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 317.7 | 312.2 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 215.8 | 210.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.795, -99.585]; warm faster [-101.665, -100.935]) |
| chrome-input | scroll | **bar** | 315.8 | 311.6 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 465.7 | 448.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 445.9 | 448.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 149.6 | 140.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-306.245, -284.355]; warm faster [-328.6, -291.05]) |
| chrome-input | scroll_element_hidden | **bar** | 445.9 | 448.7 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.6 | 235.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206.7 | 202.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 6.2 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.09, -199.79]; warm faster [-201.75, -201.41]) |
| chrome-input | key_down | **bar** | 206.7 | 202.4 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.7 | 100.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-0.265, -0.045]; warm faster [-0.29, -0.12]) |
| chrome-input | key_up | **bar** | 100.8 | 100.9 | | | | | | | | | |
| chrome-input | activate_window | pinned | 5.1 | 0.8 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 5.1 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 3.7 | 0.5 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold faster [-2, -0.165]; warm faster [-0.59, -0.09]) |
| chrome-input | activate_window | **bar** | 5.1 | 0.6 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1087.5 | 1085.5 | 20 | – | – | – | 42/42 | clean | 40/42 | 42/42 |  |
| chrome-textarea | type_text | newest | 1116.9 | 2528.1 | 20 | – | – | – | 42/42 | clean | 1/1 | 1/42 |  |
| chrome-textarea | type_text | cua | 190.4 | 174.1 | 20 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS (cold faster [-968.845, -876.42]; warm faster [-922.055, -891.385]) |
| chrome-textarea | type_text | **bar** | 1087.5 | 1085.5 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1305.8 | 1359.3 | 20 | – | – | – | 40/40 | clean | 39/39 | 39/40 |  |
| chrome-address-bar | type_text | newest | 1249.2 | 1276.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 196.8 | 194.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1080.73, -1021.105]; warm faster [-1111.035, -1060.395]) |
| chrome-address-bar | type_text | **bar** | 1249.2 | 1276.4 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 524.9 | 524.8 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gnome-text-editor | type_text | newest | 938.8 | 937.7 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gnome-text-editor | type_text | cua | 80.2 | 80.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 3.9 | 1.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 105.7 | 21.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 7.7 | 3.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 2.2 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 22.4 | 17.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 120.9 | 121.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.8 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 203 | 118.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 63.6 | 90.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.1 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 154.6 | 64.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.1 | 1.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.2 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 29.9 | 36.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 113.1 | 24.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 115.9 | 115 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 135.6 | 136.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.3 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 5.2 | 95.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.4 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 402.6 | 386.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 172.1 | 118.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.4 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 5.7 | 5.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 115.9 | 114.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 201.7 | 119.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 397.8 | 410.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 452.7 | 451.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 426 | 426.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 496.8 | 506.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 515.1 | 451.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 865.4 | 774 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 476.3 | 470.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 452.6 | 402.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 430.3 | 424.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 359.7 | 504.1 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 350 | 521 | 6 | – | – | – | 0/9 | clean | – | – | PASS |

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
| gedit | clipboard_write | pinned | 12/18 | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_write | newest | 0/18 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| chrome | press_key | cua | – | – | background | – | – |
| chrome | click | cua | – | – | background | – | – |
| chrome-input | right_click | cua | – | – | background | – | – |
| chrome-input | right_click_fallback | cua | – | – | background | – | – |
| chrome-input | move | cua | – | – | background | – | – |
| chrome-input | scroll | cua | – | – | background | – | – |
| chrome-input | scroll_element_hidden | cua | – | – | background | – | – |
| chrome-input | key_down | cua | – | – | background | – | – |
| chrome-input | key_up | cua | – | – | background | – | – |
| chrome-textarea | type_text | pinned | 42/42 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 42/42 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 42/42 | background | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 18/18 | foreground | foreground | stacking, focus, active | 0 / 0 / 0 |
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
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
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 172.46581101417542 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 174.3380430340767 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 159.835883975029 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 189.36710101366043 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 179.4181410074234 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 177.32059401273727 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 653 | next request 173 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 196,233 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 262,221 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 237,196 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 214 | max 255 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2164 | next request 13 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2163 | next request 15 ms |
| gedit | caret_placed | 0 | PASS | success | 200 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 192 | route foreground |

The cases' bus trace (25073 calls of 156 connections): PasteText 0, InsertText 0, SetTextContents 0.

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within

run valid; **FAIL**: gedit clipboard_read cua, gedit clipboard_release cua; **declared refusal** (a loss, not a pass): chrome-input drag cua, finished 2026-10-31T17:55:55.520Z

