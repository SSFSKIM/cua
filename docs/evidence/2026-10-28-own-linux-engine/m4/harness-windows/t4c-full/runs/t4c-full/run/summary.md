# linux-engine-diff summary

## task50-t4c-full-2 (development run, not a release gate)

commit d778a092cafa3e9efa65978ff8768697c7d9768a; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 457.6 | 393 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 424 | 429.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 24.2 | 18.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-450.22, -391.505]; warm faster [-419.04, -357.5]) |
| desktop | list_windows | **bar** | 424 | 393 | | | | | | | | | |
| desktop | list_apps | pinned | 410.7 | 430 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 402.4 | 412.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 25.5 | 24.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-394.735, -365.36]; warm faster [-400.62, -372.44]) |
| desktop | list_apps | **bar** | 402.4 | 412.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.4 | 27.5 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 37.3 | 28.6 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 35.3 | 24.8 | 21 | – | – | – | – | – | – | 61/61 | PASS (cold same (within noise) [-3.585, 0.285]; warm faster [-3.22, -2.49]) |
| desktop | get_screenshot | **bar** | 37.3 | 27.5 | | | | | | | | | |
| desktop | launch_app | pinned | 4.3 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-1.805, -0.43]; warm same (within noise) [-0.12, 0.04]) |
| desktop | launch_app | **bar** | 4.3 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.9 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 944.1 | 935.7 | 21 | 3169 / 3169 | 3169 / 3169 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 954 | 921.4 | 21 | 3169 / 3169 | 3169 / 3169 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 102.4 | 97.4 | 21 | 3169 / 3168 | 103 / 118 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-873.935, -793.43]; warm faster [-857.54, -795.05]) |
| gedit | tree | **bar** | 944.1 | 921.4 | | | | | | | | | |
| gedit | tree_shot | pinned | 1042.8 | 1117.6 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 1051.4 | 1022.2 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 147.3 | 114.1 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-929.22, -872.26]; warm faster [-935.05, -856.06]) |
| gedit | tree_shot | **bar** | 1042.8 | 1022.2 | | | | | | | | | |
| gedit | press_key | pinned | 273.3 | 269 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.3 | 235.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 107.4 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-133.28, -131.99]; warm faster [-134.755, -134.31]) |
| gedit | press_key | **bar** | 240.3 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 219.3 | 215.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 222 | 216.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 121.5 | 114.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-98.36, -97.16]; warm faster [-100.97, -100.29]) |
| gedit | click | **bar** | 219.3 | 215.1 | | | | | | | | | |
| gedit | type_text | pinned | 10208.8 | 10204.8 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 1225.5 | 1227.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 194.8 | 181.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1059.825, -996.17]; warm faster [-1066.045, -1018.3]) |
| gedit | type_text | **bar** | 1225.5 | 1227.3 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10208.5 | 10204.7 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 1222.9 | 1203.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 193.3 | 183.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1074.755, -983.595]; warm faster [-1060.07, -993.64]) |
| gedit | type_text_selection | **bar** | 1222.9 | 1203.3 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 192.7 | 184 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.6 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 572.3 | 568.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108.2 | 102.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-465.53, -462.81]; warm faster [-467.045, -465.505]) |
| gedit | type_characters | **bar** | 572.3 | 568.8 | | | | | | | | | |
| gedit | clipboard_read | pinned | 837.2 | 844.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | newest | 862.2 | 829 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 55.9 | 50.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-804.595, -746.005]; warm faster [-832.43, -757.55]) |
| gedit | clipboard_read | **bar** | 837.2 | 829 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10203 | 10203.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | newest | 10203.1 | 10203 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | cua | 188.2 | 181.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3.5 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | newest | 3.7 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | cua | 2.8 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 | PASS (cold faster [-1.185, -0.46]; warm same (within noise) [-0.01, 0.025]) |
| gedit | clipboard_release | **bar** | 3.5 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 800.6 | 803.9 | 21 | 2289 / 2289 | 2289 / 2289 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 804 | 768.9 | 21 | 2289 / 2289 | 2289 / 2289 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | cua | 86.1 | 81 | 21 | 2289 / 2288 | 35 / 41 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-770.985, -649.69]; warm faster [-730.14, -660.93]) |
| chrome | tree | **bar** | 800.6 | 768.9 | | | | | | | | | |
| chrome | tree_shot | pinned | 936.1 | 977.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 935.2 | 904.8 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 137.8 | 110.9 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-850.175, -771.42]; warm faster [-833.15, -767.91]) |
| chrome | tree_shot | **bar** | 935.2 | 904.8 | | | | | | | | | |
| chrome | press_key | pinned | 273.8 | 269.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 241 | 236.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 106.5 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-135.165, -134.1]; warm faster [-135.3, -134.82]) |
| chrome | press_key | **bar** | 241 | 236.4 | | | | | | | | | |
| chrome | click | pinned | 219.4 | 215.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 221.2 | 215.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 119 | 113.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.19, -99.705]; warm faster [-101.5, -101.115]) |
| chrome | click | **bar** | 219.4 | 215.1 | | | | | | | | | |
| chrome-input | click_element | pinned | 709.1 | 656.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 679 | 654.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 162.2 | 158.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-545.46, -491.345]; warm faster [-539.43, -465.53]) |
| chrome-input | click_element | **bar** | 679 | 654.8 | | | | | | | | | |
| chrome-input | right_click | pinned | 716.4 | 723.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 718.9 | 698 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 179.9 | 171.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-559.93, -520.81]; warm faster [-564.81, -493.925]) |
| chrome-input | right_click | **bar** | 716.4 | 698 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 1348.1 | 1295.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 1354.4 | 1407 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 269.7 | 261.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1097.105, -1049.075]; warm faster [-1085.905, -1013.695]) |
| chrome-input | right_click_fallback | **bar** | 1348.1 | 1295.6 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 638.5 | 684.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 640.1 | 685 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 161.3 | 156.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-520.67, -458.525]; warm faster [-533.37, -509.94]) |
| chrome-input | secondary_action | **bar** | 638.5 | 684.9 | | | | | | | | | |
| chrome-input | move | pinned | 206.4 | 202.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 208 | 203.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 105.7 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.12, -100.13]; warm faster [-101.225, -100.73]) |
| chrome-input | move | **bar** | 206.4 | 202.4 | | | | | | | | | |
| chrome-input | drag | pinned | 719.5 | 707.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 420.9 | 412.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4 | 1.4 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top) |
| chrome-input | drag | **bar** | 420.9 | 412.2 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.3 | 311.3 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 316.7 | 312.1 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 215 | 210.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.225, -99.99]; warm faster [-101.18, -100.77]) |
| chrome-input | scroll | **bar** | 315.3 | 311.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 675.7 | 677.3 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 698.1 | 677.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 162.1 | 156.4 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-542.71, -486.09]; warm faster [-568.395, -474.89]) |
| chrome-input | scroll_element_hidden | **bar** | 675.7 | 677.3 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.3 | 235.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206.8 | 202.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 5.3 | 0.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.77, -200.81]; warm faster [-201.53, -201.32]) |
| chrome-input | key_down | **bar** | 206.8 | 202.3 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 100.6 | 100.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-0.205, -0.09]; warm faster [-0.345, -0.075]) |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 6.3 | 1.9 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 6 | 2 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 2.6 | 0.4 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold faster [-4.13, -2.26]; warm faster [-1.645, -0.685]) |
| chrome-input | activate_window | **bar** | 6 | 1.9 | | | | | | | | | |
| over-budget | tree | pinned | 7624.1 | 7531.5 | 21 | 45101 / 45101 | 45101 / 45101 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | newest | 7597.6 | 7419.2 | 21 | 45101 / 45101 | 45101 / 45101 | – | 41/41 | clean | – | 41/41 |  |
| over-budget | tree | cua | 1042.1 | 1014.8 | 21 | 45272 / 45283 | 183 / 288 | 190 | 41/41 | clean | – | 41/41 (41 declared) | PASS (cold faster [-6699.83, -6402.83]; warm faster [-6650.62, -6300.5]) (declared: tree) |
| over-budget | tree | **bar** | 7597.6 | 7419.2 | | | | | | | | | |
| retention | after_resize | pinned | 914.2 | 917.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 921.3 | 966.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 109.3 | 118.4 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-827.525, -775.36]; warm faster [-832.79, -772.765]) |
| retention | after_resize | **bar** | 914.2 | 917.8 | | | | | | | | | |
| retention | after_remap | pinned | 912.6 | 960.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 928 | 893 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 111.7 | 110.8 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-860.975, -783.03]; warm faster [-861.53, -769.585]) |
| retention | after_remap | **bar** | 912.6 | 893 | | | | | | | | | |
| retention | after_covered_change | pinned | 945.3 | 899 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 955.1 | 948.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 111.2 | 112.1 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-876.585, -788.22]; warm faster [-824.935, -729.865]) |
| retention | after_covered_change | **bar** | 945.3 | 899 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1335.2 | 1314.6 | 20 | – | – | – | 42/42 | clean | 40/42 | 42/42 |  |
| chrome-textarea | type_text | newest | 1457.3 | 2722.4 | 20 | – | – | – | 42/42 | clean | 1/1 | 1/42 |  |
| chrome-textarea | type_text | cua | 195.6 | 185.4 | 20 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS (cold faster [-1196.14, -1106.34]; warm faster [-1156.465, -1100.995]) |
| chrome-textarea | type_text | **bar** | 1335.2 | 1314.6 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1761.6 | 1774.4 | 20 | – | – | – | 40/40 | clean | 39/39 | 39/40 |  |
| chrome-address-bar | type_text | newest | 1699.7 | 1730 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-address-bar | type_text | cua | 212.7 | 207.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-1536.355, -1467.045]; warm faster [-1548.55, -1482.855]) |
| chrome-address-bar | type_text | **bar** | 1699.7 | 1730 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 739.6 | 741.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 1190.2 | 1179.6 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 100.5 | 90 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 4.4 | 1.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 107.2 | 20.3 | 6 | – | – | – | 8/9 | clean | 9/9 | – | FAIL: the witness changed on 1 of 9 samples (0/0) |
| device-gtk4 | gtk4_key_shared | cua | 2.1 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 5.9 | 3.9 | 6 | – | – | – | 9/9 | **not traced** | 9/9 | – | FAIL: the foreground audit found XTEST KeyRelease on 0x03a00005 |
| device-gtk4 | gtk4_key_down_shared | cua | 2.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 35.6 | 25.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 133 | 129.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.1 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 204.3 | 114.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2.5 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 67.7 | 88.9 | 6 | – | – | – | 9/9 | **not traced** | 9/9 | – | FAIL: the foreground audit found XTEST MotionNotify on 0x005a6d2f |
| device-gtk4 | gtk4_drag_shared | cua | 2.5 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 151.3 | 59.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.2 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.2 | 1.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 42 | 37.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 114.6 | 25.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 117.1 | 115.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 143.5 | 145.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 4.7 | 92.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.3 | 1.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 380.5 | 382.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.5 | 1.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 172.7 | 118.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.6 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 6.1 | 6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 116.4 | 114.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.7 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 204.9 | 115.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 398.5 | 394.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.4 | 1.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 459.6 | 455.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 296.4 | 480.6 | 6 | – | – | – | 9/9 | clean | – | – | FAIL: not cancelled with the drag-and-drop sentence on 1 of 9 samples (1/0) |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 518.6 | 611 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 294.3 | 537.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 928.6 | 638.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 359.2 | 600.4 | 6 | – | – | – | 9/9 | clean | 7/9 | – | FAIL: the effect was not verified on 2 of 9 samples (1/0, 2/0) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 451.3 | 403.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 428.7 | 435.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 299.7 | 550.3 | 6 | – | – | – | 2/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 554.2 | 545.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 359 | 355.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 453.8 | 457 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 360.2 | 355.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| identity | identity_apart | cua | 109.8 | 107.3 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 30.8 | 29.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 30.5 | 30.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 30.2 | 32.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 152.9 | 132.7 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 30.5 | 29.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 33 | 33.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 38.6 | 32 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 36.3 | 32.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 100.7 | 100.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 55.3 | 60.2 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 29.3 | 27.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 61.9 | 56.3 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 29.5 | 27.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 29.1 | 25.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 23.7 | 25.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 26 | 25.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 29.7 | 28.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 155.8 | 161.9 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 25.1 | 23.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 103.3 | 105.1 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 106.4 | 108.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 134.7 | 113.9 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 21.4 | 21.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 10.8 | 8.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1003.6 | 1002.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.8 | 0.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 101 | 100.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 148 | 0.0197 |  |
| desktop | cua | 61/61 | 148 | 0.0197 |  |
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
| chrome-textarea | type_text | pinned | 42/42 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 42/42 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 42/42 | background | background | – | 0 / 0 / 0 |
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
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| identity | identity_type_text | cua | – | – | background | – | – |
| identity | identity_key_up | cua | – | – | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |
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
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 228.8254200220108 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 214.61778092384338 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 197.30888605117798 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 223.51873695850372 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 212.51729905605316 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 183.98700201511383 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 655 | next request 184 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 287,247 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 204,240 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 206,246 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 208 | max 237 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2170 | next request 22 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2191 | next request 21 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2161 | next request 25 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2164 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2158 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2158 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 169 |  |
| gedit | caret_placed | 0 | PASS | success | 198 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 181 | route foreground |

The cases' bus trace (27177 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 5367 samples, against the run's cap of 1% (53.67).

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

run valid; development run, not a release gate: **FAIL**: device-gtk4 gtk4_click_dedicated cua, device-gtk4 gtk4_key_dedicated cua, device-gtk4 gtk4_move_dedicated cua, device-chrome-dnd chrome_dnd_shared cua, device-chrome-dnd chrome_dnd_short_in_front_shared cua, a window the harness did not open was changed: cua on device-gtk4 gtk4_key_dedicated: XTEST KeyRelease on 0x03a00005, a window the harness did not open was changed: cua on device-gtk4 gtk4_key_dedicated: XTEST KeyRelease on 0x03a00005, a window the harness did not open was changed: cua on device-gtk4 gtk4_move_dedicated: XTEST MotionNotify on 0x005a6d2f; **declared refusal** (a loss, not a pass): chrome-input drag cua; text restores (the first word put back before a sample): pinned 43, newest 0, cua 0, finished 2026-11-03T16:51:22.359Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 121477 requests, 57277 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

