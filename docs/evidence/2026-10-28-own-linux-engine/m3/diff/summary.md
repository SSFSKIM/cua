# linux-engine-diff summary

## m31-verdict

commit 91b2746e253ea307904c26584cbeb6e75f61dfdc; cua-engine 0.3.0 (790d8007c9d0); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 232.3 | 228 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 244.3 | 232.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 18 | 13.4 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | list_windows | **bar** | 232.3 | 228 | | | | | | | | | |
| desktop | list_apps | pinned | 258.7 | 214.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 254.5 | 216.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 19.7 | 13 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | list_apps | **bar** | 254.5 | 214.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38.5 | 27.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.4 | 28.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 32.7 | 23.7 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | get_screenshot | **bar** | 38.4 | 27.6 | | | | | | | | | |
| desktop | launch_app | pinned | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.4 | 0.6 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.6 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (same within noise: warm 0.72 against 0.64, [-0.03, 0.2]) |
| desktop | launch_app | **bar** | 4 | 0.6 | | | | | | | | | |
| desktop | capabilities | cua | 3 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 744.9 | 744.9 | 21 | 3203 / 3203 | 3203 / 3203 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 713.5 | 725.2 | 21 | 3203 / 3203 | 3203 / 3203 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.7 | 91.5 | 21 | 3203 / 3202 | 111 / 102 | 0 | 41/41 | clean | – | 41/41 | PASS |
| gedit | tree | **bar** | 713.5 | 725.2 | | | | | | | | | |
| gedit | tree_shot | pinned | 823.1 | 842.7 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 867.9 | 785.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 138.5 | 109.2 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS |
| gedit | tree_shot | **bar** | 823.1 | 785.2 | | | | | | | | | |
| gedit | press_key | pinned | 273 | 269.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 239.8 | 235.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 107.7 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| gedit | press_key | **bar** | 239.8 | 235.8 | | | | | | | | | |
| gedit | click | pinned | 219.3 | 214.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221.3 | 215.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 121.4 | 113.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS |
| gedit | click | **bar** | 219.3 | 214.9 | | | | | | | | | |
| gedit | type_text | pinned | 10208.9 | 10205.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 1055.6 | 1050.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 187.6 | 171.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| gedit | type_text | **bar** | 1055.6 | 1050.4 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10209.2 | 10205.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1041.1 | 1014.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 188.7 | 175.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| gedit | type_text_selection | **bar** | 1041.1 | 1014.4 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 183.6 | 173.6 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.3 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 572.6 | 568.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108 | 102.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| gedit | type_characters | **bar** | 572.6 | 568.7 | | | | | | | | | |
| gedit | clipboard_read | pinned | 647.3 | 590.5 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | clipboard_read | newest | 667.4 | 698.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 47.7 | 41.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| gedit | clipboard_read | **bar** | 667.4 | 698.7 | | | | | | | | | |
| gedit | clipboard_write | pinned | – | – | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | clipboard_write | newest | 10203.6 | 10203.4 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gedit | clipboard_write | cua | 186.8 | 169.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 2.8 | – | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | newest | 3.1 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | cua | 2.7 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 | PASS (same within noise: warm 0.13 against 0.12, [-0.01, 0.02]) |
| gedit | clipboard_release | **bar** | 2.8 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 553.4 | 597.2 | 21 | 2279 / 2279 | 2279 / 2279 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 558.1 | 610.5 | 21 | 2279 / 2279 | 2279 / 2279 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 74.6 | 71.7 | 21 | 2279 / 2278 | 37 / 45 | 0 | 41/41 | clean | – | 41/41 | PASS |
| chrome | tree | **bar** | 553.4 | 597.2 | | | | | | | | | |
| chrome | tree_shot | pinned | 726.3 | 744 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 732.2 | 797.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 127.3 | 96.7 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS |
| chrome | tree_shot | **bar** | 726.3 | 744 | | | | | | | | | |
| chrome | press_key | pinned | 273.1 | 269.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 240.3 | 236.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.4 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome | press_key | **bar** | 240.3 | 236.5 | | | | | | | | | |
| chrome | click | pinned | 219 | 215 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 220.7 | 215.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 118.8 | 113.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome | click | **bar** | 219 | 215 | | | | | | | | | |
| chrome-input | click_element | pinned | 470.7 | 457.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 464.6 | 488.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 152.3 | 144.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | click_element | **bar** | 464.6 | 457.9 | | | | | | | | | |
| chrome-input | right_click | pinned | 491.7 | 470 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 495.5 | 506 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 166.8 | 158.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | right_click | **bar** | 491.7 | 470 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 954 | 923.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 998.8 | 979.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 258.8 | 249.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | right_click_fallback | **bar** | 954 | 923.6 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 502.9 | 461.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 463.3 | 465.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 153.4 | 147.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | secondary_action | **bar** | 463.3 | 461.7 | | | | | | | | | |
| chrome-input | move | pinned | 206.5 | 202.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208.2 | 203.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 106.3 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | move | **bar** | 206.5 | 202.4 | | | | | | | | | |
| chrome-input | drag | pinned | 710.8 | 723.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 420.1 | 415.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.3 | 1.1 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 420.1 | 415.9 | | | | | | | | | |
| chrome-input | scroll | pinned | 314.7 | 311.5 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 317.1 | 311.9 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 214.9 | 210.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | scroll | **bar** | 314.7 | 311.5 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 478.5 | 467.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 476.2 | 479.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 153.9 | 143.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 476.2 | 467.6 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.3 | 235.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206.1 | 202.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 5.8 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | key_down | **bar** | 206.1 | 202.5 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.7 | 100.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.7 | 100.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-input | key_up | **bar** | 100.7 | 100.9 | | | | | | | | | |
| chrome-input | activate_window | pinned | 4.6 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 5.1 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 3.8 | 0.4 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS |
| chrome-input | activate_window | **bar** | 4.6 | 0.6 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1093.8 | 1096.9 | 20 | – | – | – | 40/40 | clean | 38/40 | 40/40 |  |
| chrome-textarea | type_text | newest | 1146.9 | 2547.9 | 20 | – | – | – | 40/40 | clean | 1/1 | 1/40 |  |
| chrome-textarea | type_text | cua | 184.7 | 176.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-textarea | type_text | **bar** | 1093.8 | 1096.9 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1374.7 | 1381.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | newest | 1373.7 | 1318.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 201.4 | 200.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS |
| chrome-address-bar | type_text | **bar** | 1373.7 | 1318.5 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 586 | 570.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gnome-text-editor | type_text | newest | 1013.4 | 997.6 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gnome-text-editor | type_text | cua | 103.5 | 84.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 3.8 | 1.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 3.3 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 103.2 | 20.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 3.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 5.8 | 3.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 2.1 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 21.2 | 19.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 126.2 | 124.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 208.1 | 118 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 68.5 | 90.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.1 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 138 | 67.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.5 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 31.5 | 38.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 109.2 | 27.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 117.1 | 114.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 132.5 | 137.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.1 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 5.6 | 98.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.3 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 417.8 | 386.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.2 | 1.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 176 | 120.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.6 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 10.3 | 6.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 116.6 | 114.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 202.9 | 113.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 392.3 | 401.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.4 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 443 | 452.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 431.4 | 421.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 528.4 | 397.7 | 6 | – | – | – | 9/9 | clean | 6/9 | – | FAIL: the effect was not verified on 3 of 9 samples (0/2, 1/2, 2/2) |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 316.3 | 500.4 | 6 | – | – | – | 2/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 793.2 | 774.7 | 6 | – | – | – | 9/9 | clean | 8/9 | – | FAIL: the effect was not verified on 1 of 9 samples (0/1) |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0073 |  |
| desktop | cua | 41/41 | 28 | 0.0073 |  |
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
| gedit | clipboard_write | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
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
| chrome-textarea | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 18/18 | foreground | foreground | stacking, active, focus | 0 / 0 / 0 |
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
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
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 177.85610699653625 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 195.34867000579834 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 175.06311902403831 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 162.52376800775528 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 171.44751399755478 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 162.7651409804821 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 658 | next request 182 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 233,197 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 188,222 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 229,192 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 202 | max 237 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2162 | next request 15 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2170 | next request 16 ms |
| gedit | caret_placed | 0 | PASS | success | 194 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 182 | route foreground |

The cases' bus trace (25428 calls of 156 connections): PasteText 0, InsertText 0, SetTextContents 0.

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within

run valid; **FAIL**: device-chrome-dnd chrome_dnd_in_front_shared cua, device-chrome-dnd chrome_dnd_covered_dedicated cua; **declared refusal** (a loss, not a pass): chrome-input drag cua, finished 2026-10-31T03:35:16.893Z

