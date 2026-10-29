# linux-engine-diff summary

## m1a3-wire-5

commit f45244098295f7e47c35fa9ed0308b597a4935a6; cua-engine 0.0.1 (f45244098295); occlusion covered; 5 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 134.4 | 113.4 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | list_windows | newest | 125.5 | 113.8 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | list_windows | cua | 12.8 | 7.1 | 35 | – | – | – | – | – | – | 40/40 | PASS |
| desktop | list_windows | **bar** | 125.5 | 113.4 | | | | | | | | | |
| desktop | list_apps | pinned | 129.2 | 129.3 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | list_apps | newest | 135.8 | 128.9 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | list_apps | cua | 13.5 | 8.5 | 35 | – | – | – | – | – | – | 40/40 | PASS |
| desktop | list_apps | **bar** | 129.2 | 128.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.7 | 27.8 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | get_screenshot | newest | 42.2 | 28.8 | 35 | – | – | – | – | – | – | 40/40 |  |
| desktop | get_screenshot | cua | 37.4 | 28.5 | 35 | – | – | – | – | – | – | 40/40 | FAIL: cua: warm 28.5 ms > bar 27.8 ms |
| desktop | get_screenshot | **bar** | 39.7 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 4.7 | 0.6 | 35 | – | – | – | – | – | 40/40 | 40/40 |  |
| desktop | launch_app | newest | 5.7 | 0.7 | 35 | – | – | – | – | – | 40/40 | 40/40 |  |
| desktop | launch_app | cua | 4.3 | 0.4 | 35 | – | – | – | – | – | 40/40 | 40/40 | PASS |
| desktop | launch_app | **bar** | 4.7 | 0.6 | | | | | | | | | |
| gedit | tree | pinned | 590.7 | 629.7 | 35 | 3190 / 3190 | 3190 / 3190 | – | 40/40 | – | – | 40/40 |  |
| gedit | tree | newest | 615.2 | 591.2 | 35 | 3190 / 3190 | 3190 / 3190 | – | 40/40 | – | – | 40/40 |  |
| gedit | tree | cua | 90.8 | 78 | 35 | 3190 / 3189 | 93 / 88 | 0 | 40/40 | – | – | 40/40 | PASS |
| gedit | tree | **bar** | 590.7 | 591.2 | | | | | | | | | |
| gedit | tree_shot | pinned | 724.2 | 720.5 | 35 | – | – | – | 40/40 | – | – | 40/40 |  |
| gedit | tree_shot | newest | 724 | 751.8 | 35 | – | – | – | 40/40 | – | – | 40/40 |  |
| gedit | tree_shot | cua | 126.9 | 100.4 | 35 | – | – | 0 | 40/40 | – | – | 40/40 | PASS |
| gedit | tree_shot | **bar** | 724 | 720.5 | | | | | | | | | |
| gedit | press_key | pinned | 274.1 | 268.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| gedit | press_key | newest | 240.6 | 235.6 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| gedit | press_key | cua | 106.9 | 101.2 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| gedit | press_key | **bar** | 240.6 | 235.6 | | | | | | | | | |
| gedit | click | pinned | 220 | 215.2 | 25 | – | – | – | 30/30 | clean | – | 30/30 |  |
| gedit | click | newest | 222 | 215.4 | 25 | – | – | – | 30/30 | clean | – | 30/30 |  |
| gedit | click | cua | 119.9 | 113.8 | 25 | – | – | – | 30/30 | clean | – | 30/30 | PASS |
| gedit | click | **bar** | 220 | 215.2 | | | | | | | | | |
| chrome | tree | pinned | 472.3 | 474.6 | 35 | 2257 / 2257 | 2257 / 2257 | – | 40/40 | – | – | 40/40 |  |
| chrome | tree | newest | 495.7 | 484.2 | 35 | 2257 / 2257 | 2257 / 2257 | – | 40/40 | – | – | 40/40 |  |
| chrome | tree | cua | 68.8 | 61.2 | 35 | 2257 / 2256 | 31 / 28 | 0 | 40/40 | – | – | 40/40 | PASS |
| chrome | tree | **bar** | 472.3 | 474.6 | | | | | | | | | |
| chrome | tree_shot | pinned | 605.6 | 619.2 | 35 | – | – | – | 40/40 | – | – | 40/40 |  |
| chrome | tree_shot | newest | 691.5 | 632.8 | 35 | – | – | – | 40/40 | – | – | 40/40 |  |
| chrome | tree_shot | cua | 108.9 | 87.3 | 35 | – | – | 0 | 40/40 | – | – | 40/40 | PASS |
| chrome | tree_shot | **bar** | 605.6 | 619.2 | | | | | | | | | |
| chrome | press_key | pinned | 274.4 | 269.2 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome | press_key | newest | 241.9 | 235.9 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome | press_key | cua | 106.8 | 101.2 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome | press_key | **bar** | 241.9 | 235.9 | | | | | | | | | |
| chrome | click | pinned | 218.6 | 214.8 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome | click | newest | 221 | 215.4 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome | click | cua | 118.9 | 113.8 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome | click | **bar** | 218.6 | 214.8 | | | | | | | | | |
| chrome-input | click_element | pinned | 363.5 | 353.8 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | click_element | newest | 375.8 | 354 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | click_element | cua | 141 | 134.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | click_element | **bar** | 363.5 | 353.8 | | | | | | | | | |
| chrome-input | right_click | pinned | 369 | 372.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | right_click | newest | 396.5 | 374.5 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | right_click | cua | 157.1 | 149.6 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | right_click | **bar** | 369 | 372.1 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 733.2 | 725.2 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | right_click_fallback | newest | 745.7 | 730.9 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | right_click_fallback | cua | 248.6 | 240.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | right_click_fallback | **bar** | 733.2 | 725.2 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 359.7 | 363.5 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | secondary_action | newest | 354.2 | 370.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | secondary_action | cua | 141.4 | 134.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | secondary_action | **bar** | 354.2 | 363.5 | | | | | | | | | |
| chrome-input | move | pinned | 207 | 202.3 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | move | newest | 208.1 | 203.2 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | move | cua | 106.4 | 101.3 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | move | **bar** | 207 | 202.3 | | | | | | | | | |
| chrome-input | drag | pinned | 713.6 | 708 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | drag | newest | 424.1 | 413.9 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | drag | cua | 628.5 | 603.4 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | FAIL: cua: cold 628.5 ms > bar 424.1 ms; cua: warm 603.4 ms > bar 413.9 ms |
| chrome-input | drag | **bar** | 424.1 | 413.9 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.2 | 311.1 | 25 | – | – | – | 30/30 | clean | 20/30 | 30/30 |  |
| chrome-input | scroll | newest | 317.8 | 311.7 | 25 | – | – | – | 30/30 | clean | 20/30 | 30/30 |  |
| chrome-input | scroll | cua | 215.9 | 210.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | scroll | **bar** | 315.2 | 311.1 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 369.8 | 363.2 | 25 | – | – | – | 30/30 | clean | – | 30/30 |  |
| chrome-input | scroll_element_hidden | newest | 369.1 | 362.8 | 25 | – | – | – | 30/30 | clean | – | 30/30 |  |
| chrome-input | scroll_element_hidden | cua | 143.8 | 135.8 | 25 | – | – | – | 30/30 | clean | – | 30/30 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 369.1 | 362.8 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.6 | 235.3 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | key_down | newest | 206.6 | 202.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | key_down | cua | 6.5 | 0.6 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | key_down | **bar** | 206.6 | 202.1 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.8 | 133.9 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | key_up | newest | 100.7 | 100.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| chrome-input | key_up | cua | 100.7 | 100.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 | PASS |
| chrome-input | key_up | **bar** | 100.7 | 100.7 | | | | | | | | | |
| chrome-input | activate_window | pinned | 4.5 | 0.5 | 25 | – | – | – | 0/30 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 30/30 | 30/30 |  |
| chrome-input | activate_window | newest | 4.1 | 0.5 | 25 | – | – | – | 0/30 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 30/30 | 30/30 |  |
| chrome-input | activate_window | cua | 3.8 | 0.5 | 25 | – | – | – | 0/30 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 30/30 | 30/30 | PASS |
| chrome-input | activate_window | **bar** | 4.1 | 0.5 | | | | | | | | | |
| over-budget | tree | pinned | 7172.9 | 7028.9 | 35 | 45069 / 45069 | 45069 / 45069 | – | 40/40 | – | – | 40/40 |  |
| over-budget | tree | newest | 7213 | 7057 | 35 | 45069 / 45069 | 45069 / 45069 | – | 40/40 | – | – | 40/40 |  |
| over-budget | tree | cua | 942.4 | 952.9 | 35 | 45240 / 45256 | 191 / 165 | 189 | 40/40 | – | – | 40/40 | PASS |
| over-budget | tree | **bar** | 7172.9 | 7028.9 | | | | | | | | | |
| big-text | tree | pinned | 490.6 | 496.2 | 35 | 2062 / 2062 | 2062 / 2062 | – | 40/40 | – | – | 40/40 |  |
| big-text | tree | newest | 486.3 | 496.7 | 35 | 2062 / 2062 | 2062 / 2062 | – | 40/40 | – | – | 40/40 |  |
| big-text | tree | cua | 119.2 | 108.3 | 35 | 2062 / 2061 | 22 / 30 | 0 | 40/40 | – | – | 40/40 | PASS |
| big-text | tree | **bar** | 486.3 | 496.2 | | | | | | | | | |
| gtk-table | tree | pinned | 352.6 | 319.4 | 35 | 940 / 940 | 940 / 940 | – | 40/40 | – | – | 40/40 |  |
| gtk-table | tree | newest | 291.1 | 305.3 | 35 | 940 / 940 | 940 / 940 | – | 40/40 | – | – | 40/40 |  |
| gtk-table | tree | cua | 98.5 | 98.5 | 35 | 938 / 937 | 287 / 286 | 0 | 40/40 | – | – | 40/40 | PASS |
| gtk-table | tree | **bar** | 291.1 | 305.3 | | | | | | | | | |
| calc | tree | pinned | 3699.4 | 3619 | 35 | 19856 / 19856 | 19856 / 19856 | – | 40/40 | – | – | 40/40 |  |
| calc | tree | newest | 3569.8 | 3594.6 | 35 | 19856 / 19856 | 19856 / 19856 | – | 40/40 | – | – | 40/40 |  |
| calc | tree | cua | 758.8 | 750.5 | 35 | 19854 / 19853 | 1274 / 1251 | 0 | 40/40 | – | – | 40/40 | PASS |
| calc | tree | **bar** | 3569.8 | 3594.6 | | | | | | | | | |
| retention | after_resize | pinned | 602.1 | 601.7 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_resize | newest | 618 | 609.4 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_resize | cua | 83.7 | 92.8 | 25 | – | – | 0 | 30/30 | clean | 30/30 | 30/30 | PASS |
| retention | after_resize | **bar** | 602.1 | 601.7 | | | | | | | | | |
| retention | after_remap | pinned | 591.2 | 652.6 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_remap | newest | 665.4 | 609.4 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_remap | cua | 89.4 | 96.2 | 25 | – | – | 0 | 30/30 | clean | 30/30 | 30/30 | PASS |
| retention | after_remap | **bar** | 591.2 | 609.4 | | | | | | | | | |
| retention | after_covered_change | pinned | 634.8 | 647 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_covered_change | newest | 607 | 627.1 | 25 | – | – | – | 30/30 | clean | 30/30 | 30/30 |  |
| retention | after_covered_change | cua | 93.4 | 94.4 | 25 | – | – | 0 | 30/30 | clean | 30/30 | 30/30 | PASS |
| retention | after_covered_change | **bar** | 607 | 627.1 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 40/40 | 0 | 0 |  |
| desktop | newest | 40/40 | 28 | 0.0073 |  |
| desktop | cua | 40/40 | 28 | 0.0073 |  |
| gedit | pinned | 40/40 | 0 | 0 |  |
| gedit | newest | 40/40 | 0 | 0 |  |
| gedit | cua | 40/40 | 0 | 0 |  |
| chrome | pinned | 40/40 | 0 | 0 |  |
| chrome | newest | 40/40 | 0 | 0 |  |
| chrome | cua | 40/40 | 0 | 0 |  |
| retention | pinned | 90/90 | 0 | 0 |  |
| retention | newest | 90/90 | 0 | 0 |  |
| retention | cua | 90/90 | 0 | 0 |  |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `type_characters is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

Over-budget retained native ids:
- cua: equal to the pinned build's

run valid; **FAIL**: desktop get_screenshot cua, chrome-input drag cua, finished 2026-10-29T01:45:52.427Z

## m1a3-vendor-js

commit f45244098295f7e47c35fa9ed0308b597a4935a6; cua-engine 0.0.1 (f45244098295); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 159.8 | 129.8 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 156.9 | 125.1 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 12.8 | 7.4 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 156.9 | 125.1 | | | | | | | | | |
| desktop | list_apps | pinned | 137.4 | 128.5 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | newest | 143.1 | 115 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | cua | 14.9 | 8 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_apps | **bar** | 137.4 | 115 | | | | | | | | | |
| desktop | get_screenshot | pinned | 40.8 | 32.3 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | newest | 33.1 | 28.7 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | cua | 35.1 | 28.5 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | get_screenshot | **bar** | 33.1 | 28.7 | | | | | | | | | |
| desktop | launch_app | pinned | 4.8 | 70.5 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | newest | 5.1 | 70.4 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | cua | 4.9 | 70.5 | 21 | – | – | – | – | – | 24/24 | 24/24 | PASS |
| desktop | launch_app | **bar** | 4.8 | 70.4 | | | | | | | | | |
| gedit | tree | pinned | 595.3 | 588.8 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree | newest | 613.2 | 579.7 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree | cua | 88.7 | 82.6 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| gedit | tree | **bar** | 595.3 | 579.7 | | | | | | | | | |
| gedit | tree_shot | pinned | 764.3 | 748.8 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree_shot | newest | 714.5 | 740.1 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree_shot | cua | 139.9 | 109.2 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 714.5 | 740.1 | | | | | | | | | |
| gedit | press_key | pinned | 274.9 | 269.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 240.9 | 235.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 107.9 | 101.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 240.9 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 219.9 | 288.5 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 221.7 | 288.4 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 119.3 | 187.7 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 219.9 | 288.4 | | | | | | | | | |
| chrome | tree | pinned | 493.9 | 476.7 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree | newest | 517.8 | 516.9 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree | cua | 62.9 | 61.3 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| chrome | tree | **bar** | 493.9 | 476.7 | | | | | | | | | |
| chrome | tree_shot | pinned | 593.5 | 670.3 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree_shot | newest | 613 | 604.6 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree_shot | cua | 122.3 | 91.6 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 593.5 | 604.6 | | | | | | | | | |
| chrome | press_key | pinned | 274.2 | 269.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 241 | 236.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 106.4 | 101.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 241 | 236.4 | | | | | | | | | |
| chrome | click | pinned | 220.2 | 215.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 222.1 | 215.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 121.7 | 114.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 220.2 | 215.1 | | | | | | | | | |
| chrome-input | click_element | pinned | 350.9 | 365.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | newest | 364.3 | 363.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | cua | 138.1 | 136.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | click_element | **bar** | 350.9 | 363.8 | | | | | | | | | |
| chrome-input | right_click | pinned | 366.6 | 394.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | newest | 400.1 | 376.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | cua | 149.3 | 150.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click | **bar** | 366.6 | 376.6 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 764.8 | 724.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | newest | 726.2 | 736.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | cua | 241.1 | 240.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click_fallback | **bar** | 726.2 | 724.2 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 356.6 | 348.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | newest | 358 | 368.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | cua | 134.6 | 133.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | secondary_action | **bar** | 356.6 | 348.2 | | | | | | | | | |
| chrome-input | move | pinned | 202.5 | 202.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | newest | 204.7 | 203.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | cua | 103.2 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | move | **bar** | 202.5 | 202.4 | | | | | | | | | |
| chrome-input | drag | pinned | 708.2 | 705.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | newest | 417.4 | 417.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | cua | 619 | 606.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | drag | **bar** | 417.4 | 417.7 | | | | | | | | | |
| chrome-input | scroll | pinned | 311.6 | 311.5 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | newest | 312.9 | 312.1 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | cua | 212.1 | 210.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | scroll | **bar** | 311.6 | 311.5 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 351.8 | 363.8 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | newest | 375.5 | 381.1 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | cua | 137.3 | 139 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 351.8 | 363.8 | | | | | | | | | |
| chrome-input | key_down | pinned | 235.6 | 235.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | newest | 202.8 | 202.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | cua | 3 | 0.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_down | **bar** | 202.8 | 202.4 | | | | | | | | | |
| chrome-input | key_up | pinned | 166.8 | 171.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | newest | 120.5 | 132.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | cua | 129.4 | 136.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_up | **bar** | 120.5 | 132.7 | | | | | | | | | |
| chrome-input | activate_window | pinned | 0.8 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | newest | 0.7 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | cua | 0.5 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 | PASS |
| chrome-input | activate_window | **bar** | 0.7 | 0.7 | | | | | | | | | |
| over-budget | tree | pinned | 7087.6 | 7013 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| over-budget | tree | newest | 7222.9 | 7121.7 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| over-budget | tree | cua | 945.2 | 990.3 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| over-budget | tree | **bar** | 7087.6 | 7013 | | | | | | | | | |
| big-text | tree | pinned | 754.4 | 640.9 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| big-text | tree | newest | 662.6 | 620.2 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| big-text | tree | cua | 261.3 | 226.4 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| big-text | tree | **bar** | 662.6 | 620.2 | | | | | | | | | |
| gtk-table | tree | pinned | 294.8 | 339.6 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gtk-table | tree | newest | 322.9 | 348.5 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gtk-table | tree | cua | 94.2 | 91 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| gtk-table | tree | **bar** | 294.8 | 339.6 | | | | | | | | | |
| calc | tree | pinned | 3785.2 | 3647.5 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| calc | tree | newest | 3817.1 | 3721.3 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| calc | tree | cua | 748.4 | 789.1 | 21 | – | – | – | 24/24 | – | – | 24/24 | PASS |
| calc | tree | **bar** | 3785.2 | 3647.5 | | | | | | | | | |
| retention | after_resize | pinned | 592.6 | 653.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 604.6 | 637.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 110.5 | 88.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 592.6 | 637.5 | | | | | | | | | |
| retention | after_remap | pinned | 648.5 | 614.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 624 | 664.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 96.7 | 96.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 624 | 614.6 | | | | | | | | | |
| retention | after_covered_change | pinned | 596.3 | 587.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 603.4 | 631.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 92.2 | 93.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 596.3 | 587.9 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 24/24 | 0 | 0 |  |
| desktop | newest | 24/24 | 28 | 0.0073 |  |
| desktop | cua | 24/24 | 28 | 0.0073 |  |
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| retention | pinned | 54/54 | 0 | 0 |  |
| retention | newest | 54/54 | 0 | 0 |  |
| retention | cua | 54/54 | 0 | 0 |  |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `the vendor client has no type_characters` | – | n/a (not in the client) |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

Over-budget retained native ids:
- cua: equal to the pinned build's

run valid; every verdict PASS, finished 2026-10-29T02:12:06.624Z

## m1a3-wire

commit 34ce9a2c88fd13659a19e3d9d9a62bdd4876c551; cua-engine 0.0.1 (34ce9a2c88fd); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 127.1 | 125.2 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 110 | 124.2 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 14.5 | 7.5 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 110 | 124.2 | | | | | | | | | |
| desktop | list_apps | pinned | 148 | 124.8 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | newest | 111.5 | 116.3 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | cua | 13.4 | 8.2 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_apps | **bar** | 111.5 | 116.3 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39 | 27.8 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | newest | 44.8 | 29 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | cua | 32.6 | 27.2 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | get_screenshot | **bar** | 39 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 4.4 | 0.6 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | newest | 6.1 | 0.7 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | cua | 3.9 | 0.4 | 21 | – | – | – | – | – | 24/24 | 24/24 | PASS |
| desktop | launch_app | **bar** | 4.4 | 0.6 | | | | | | | | | |
| gedit | tree | pinned | 754.7 | 609.2 | 21 | 3190 / 3190 | 3190 / 3190 | – | 24/24 | – | – | 24/24 |  |
| gedit | tree | newest | 636.8 | 625.8 | 21 | 3190 / 3190 | 3190 / 3190 | – | 24/24 | – | – | 24/24 |  |
| gedit | tree | cua | 105.9 | 80.7 | 21 | 3190 / 3189 | 105 / 81 | 0 | 24/24 | – | – | 24/24 | PASS |
| gedit | tree | **bar** | 636.8 | 609.2 | | | | | | | | | |
| gedit | tree_shot | pinned | 767 | 756.1 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree_shot | newest | 720.8 | 701.1 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| gedit | tree_shot | cua | 134.8 | 109.2 | 21 | – | – | 0 | 24/24 | – | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 720.8 | 701.1 | | | | | | | | | |
| gedit | press_key | pinned | 273.6 | 268.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 241 | 235.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 106.1 | 101.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 241 | 235.8 | | | | | | | | | |
| gedit | click | pinned | 220.6 | 215.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 223.2 | 215.4 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 118.9 | 114.1 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 220.6 | 215.2 | | | | | | | | | |
| chrome | tree | pinned | 446.7 | 473.6 | 21 | 2257 / 2257 | 2257 / 2257 | – | 24/24 | – | – | 24/24 |  |
| chrome | tree | newest | 512.6 | 473.6 | 21 | 2257 / 2257 | 2257 / 2257 | – | 24/24 | – | – | 24/24 |  |
| chrome | tree | cua | 66.4 | 63.8 | 21 | 2257 / 2256 | 23 / 26 | 0 | 24/24 | – | – | 24/24 | PASS |
| chrome | tree | **bar** | 446.7 | 473.6 | | | | | | | | | |
| chrome | tree_shot | pinned | 592.4 | 648.5 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree_shot | newest | 659.4 | 613.6 | 21 | – | – | – | 24/24 | – | – | 24/24 |  |
| chrome | tree_shot | cua | 113.3 | 78.7 | 21 | – | – | 0 | 24/24 | – | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 592.4 | 613.6 | | | | | | | | | |
| chrome | press_key | pinned | 273.8 | 269.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 240.3 | 236 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 106.8 | 101.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 240.3 | 236 | | | | | | | | | |
| chrome | click | pinned | 219.7 | 214.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 221.8 | 215.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 119.7 | 114 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 219.7 | 214.8 | | | | | | | | | |
| chrome-input | click_element | pinned | 359.1 | 358.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | newest | 379.3 | 386.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | cua | 146.4 | 136.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | click_element | **bar** | 359.1 | 358.5 | | | | | | | | | |
| chrome-input | right_click | pinned | 454.9 | 389.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | newest | 369.8 | 382.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | cua | 157.7 | 149.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click | **bar** | 369.8 | 382.4 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 714 | 727.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | newest | 743.5 | 759.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | cua | 244.3 | 239.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click_fallback | **bar** | 714 | 727.9 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 352.7 | 362.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | newest | 355.4 | 365.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | cua | 141 | 134.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | secondary_action | **bar** | 352.7 | 362.9 | | | | | | | | | |
| chrome-input | move | pinned | 206.9 | 202.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | newest | 208.4 | 202.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | cua | 106.5 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | move | **bar** | 206.9 | 202.3 | | | | | | | | | |
| chrome-input | drag | pinned | 719.9 | 709.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | newest | 424.3 | 412.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | cua | 631 | 610.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | FAIL: cua: cold 631 ms > bar 424.3 ms; cua: warm 610.7 ms > bar 412.4 ms |
| chrome-input | drag | **bar** | 424.3 | 412.4 | | | | | | | | | |
| chrome-input | scroll | pinned | 315.6 | 311.1 | 15 | – | – | – | 18/18 | clean | 13/18 | 18/18 |  |
| chrome-input | scroll | newest | 318.5 | 311.7 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | cua | 215.4 | 210.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | scroll | **bar** | 315.6 | 311.1 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 351.1 | 348.3 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | newest | 355.1 | 357.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | cua | 143.8 | 135.8 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 351.1 | 348.3 | | | | | | | | | |
| chrome-input | key_down | pinned | 240.4 | 235.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | newest | 206.4 | 202.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | cua | 6.4 | 0.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_down | **bar** | 206.4 | 202.1 | | | | | | | | | |
| chrome-input | key_up | pinned | 134.2 | 133.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | newest | 101 | 100.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | cua | 100.8 | 100.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_up | **bar** | 101 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 3.5 | 0.5 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | newest | 5.2 | 0.5 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | cua | 4.2 | 0.4 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 | FAIL: cua: cold 4.2 ms > bar 3.5 ms |
| chrome-input | activate_window | **bar** | 3.5 | 0.5 | | | | | | | | | |
| over-budget | tree | pinned | 7281 | 7014.6 | 21 | 45069 / 45069 | 45069 / 45069 | – | 24/24 | – | – | 24/24 |  |
| over-budget | tree | newest | 6862 | 7125 | 21 | 45069 / 45069 | 45069 / 45069 | – | 24/24 | – | – | 24/24 |  |
| over-budget | tree | cua | 1018.6 | 955.3 | 21 | 45254 / 45251 | 156 / 177 | 188 | 24/24 | – | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6862 | 7014.6 | | | | | | | | | |
| big-text | tree | pinned | 508.4 | 498.8 | 21 | 2062 / 2062 | 2062 / 2062 | – | 24/24 | – | – | 24/24 |  |
| big-text | tree | newest | 573.9 | 529.5 | 21 | 2062 / 2062 | 2062 / 2062 | – | 24/24 | – | – | 24/24 |  |
| big-text | tree | cua | 109 | 108.7 | 21 | 2062 / 2061 | 24 / 23 | 0 | 24/24 | – | – | 24/24 | PASS |
| big-text | tree | **bar** | 508.4 | 498.8 | | | | | | | | | |
| gtk-table | tree | pinned | 282.5 | 315.6 | 21 | 940 / 940 | 940 / 940 | – | 24/24 | – | – | 24/24 |  |
| gtk-table | tree | newest | 260.7 | 298.9 | 21 | 940 / 940 | 940 / 940 | – | 24/24 | – | – | 24/24 |  |
| gtk-table | tree | cua | 91.3 | 86.4 | 21 | 938 / 937 | 288 / 287 | 0 | 24/24 | – | – | 24/24 | PASS |
| gtk-table | tree | **bar** | 260.7 | 298.9 | | | | | | | | | |
| calc | tree | pinned | 3503.5 | 3674.6 | 21 | 19856 / 19856 | 19856 / 19856 | – | 24/24 | – | – | 24/24 |  |
| calc | tree | newest | 3719.4 | 3575.8 | 21 | 19856 / 19856 | 19856 / 19856 | – | 24/24 | – | – | 24/24 |  |
| calc | tree | cua | 762.1 | 753 | 21 | 19854 / 19853 | 1258 / 1255 | 0 | 24/24 | – | – | 24/24 | PASS |
| calc | tree | **bar** | 3503.5 | 3575.8 | | | | | | | | | |
| retention | after_resize | pinned | 616.9 | 582.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 643.4 | 577.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 96.9 | 107.3 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 616.9 | 577.2 | | | | | | | | | |
| retention | after_remap | pinned | 627.7 | 622.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 597.5 | 622.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 107.4 | 91 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 597.5 | 622.5 | | | | | | | | | |
| retention | after_covered_change | pinned | 620.5 | 604.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 606.8 | 623.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 96.9 | 95.5 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 606.8 | 604.6 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 24/24 | 0 | 0 |  |
| desktop | newest | 24/24 | 28 | 0.0073 |  |
| desktop | cua | 24/24 | 28 | 0.0073 |  |
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| retention | pinned | 54/54 | 0 | 0 |  |
| retention | newest | 54/54 | 0 | 0 |  |
| retention | cua | 54/54 | 0 | 0 |  |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `type_characters is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

Over-budget retained native ids:
- cua: equal to the pinned build's

run valid; **FAIL**: chrome-input drag cua, chrome-input activate_window cua, finished 2026-10-28T23:44:33.271Z

## m1a3-events (experiment events)

| scenario | newest | cua |
|---|---|---|
| press_key a | same | same |
| press_key A | same | same |
| press_key z | same | same |
| press_key Z | same | same |
| press_key shift+z | same | same |
| press_key Shift+Z | same | same |
| press_key ctrl+z | same | same |
| press_key Ctrl+Z | same | same |
| press_key CTRL+z | same | same |
| press_key Ctrl+Shift+Z | same | same |
| press_key ctrl+shift+t | same | same |
| press_key Ctrl+Shift+T | same | same |
| press_key XK_Return | same | same |
| press_key Return | same | same |
| press_key alt+F5 | same | same |
| press_key Ctrl+Alt+Shift+A | same | same |
| press_key super+L | same | same |
| press_key ! | same | same |
| press_key @ | same | same |
| press_key shift+! | same | same |
| press_key !+@ | same | same |
| press_key ctrl++ | same | same |
| press_key + | same | same |
| press_key a+a | same | same |
| press_key < | same | same |
| press_key kp_enter | same | same |
| press_key f12 | same | same |
| press_key space | same | same |
| press_key Escape | same | same |
| press_key with duration | same | same |
| press_key bad key | same | same |
| press_key empty | same | same |
| held ctrl around press_key a | same | same |
| held Ctrl around press_key Shift+Z | same | same |
| two holds sharing ctrl | same | same |
| a repeated hold is one hold | same | same |
| key_up of nothing held | same | same |
| a hold is named by its normalized chord | same | same |
| order makes a different hold | same | same |
| held shift under a click chord | differs at step 1 (event) | same |
| bad keys in holds | same | same |
| holds left at exit are released with their state | same | same |
| held key across another window request | differs at step 1 (event) | same |
| click | differs at step 0 (event) | same |
| click in the child | differs at step 0 (event) | same |
| right click | differs at step 0 (event) | same |
| middle double click held 0 | differs at step 0 (event) | same |
| click with a chord | differs at step 0 (event) | same |
| click outside the window | same | same |
| click validation | same | same |
| move | differs at step 0 (event) | same |
| scroll at the centre | differs at step 0 (event) | same |
| scroll at a point | differs at step 0 (event) | same |
| scroll validation | same | same |
| drag | differs at step 0 (event) | same |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) |
| drag with a chord, and a short path | differs at step 0 (event) | same |
| desktop press_key a | same | same |
| desktop press_key Z | same | same |
| desktop press_key Ctrl+Z | same | same |
| desktop press_key ! | same | same |
| desktop press_key ctrl++ | same | same |
| desktop press_key a+a | same | same |
| desktop press_key bad key | same | same |
| desktop held ctrl around press_key a | same | same |
| desktop two holds sharing ctrl | same | same |
| desktop holds left at exit | same | same |
| desktop hold and a window hold are apart | same | same |
| desktop click | differs at step 0 (event) | same |
| desktop click in place | same | same |
| desktop click far | differs at step 0 (event) | same |
| desktop move | differs at step 0 (event) | same |
| desktop move_relative | same | same |
| desktop scroll | differs at step 1 (event) | same |
| desktop drag | differs at step 0 (event) | same |
| desktop drag short path | same | same |
| drag_handle | differs at step 0 (event) | same |
| drag_handle stray end | same | same |
| activate_window | same | same |
| launch_app | same | same |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | click | first | 3 | 87.5 | 87 | 87 | **no** |
| desktop | click | later | 1 | 158 | 91.6 | 25 | yes |
| desktop | drag_handle | first | 2 | 38.6 | 39.3 | 38.2 | yes |
| desktop | drag_handle | later | 2 | 33.1 | 30.6 | 33 | **no** |
| desktop | drag | first | 2 | 333.7 | 109.2 | 345.3 | **no** |
| desktop | key_down | first | 4 | 52.2 | 2.3 | 1.3 | yes |
| desktop | key_down | later | 1 | 34.1 | 0.7 | 0.3 | yes |
| desktop | key_up | later | 5 | 33.3 | 0.2 | 0.2 | yes |
| desktop | move_relative | first | 1 | 2.5 | 2.6 | 1 | yes |
| desktop | move_relative | later | 2 | 34.1 | 17.6 | 0.3 | yes |
| desktop | move | first | 1 | 83.6 | 84.9 | 83.3 | yes |
| desktop | move | later | 2 | 38 | 20.1 | 4.5 | yes |
| desktop | press_key | first | 7 | 68.9 | 36.1 | 1.2 | yes |
| desktop | press_key | later | 1 | 67.5 | 34 | 0.4 | yes |
| desktop | scroll | first | 1 | 75 | 75.9 | 73.5 | yes |
| desktop | scroll | later | 1 | 441.9 | 408.4 | 373.4 | yes |
| window | activate_window | first | 1 | 1.8 | 1.6 | 1.3 | yes |
| window | click | first | 7 | 216 | 217.1 | 115.2 | yes |
| window | click | later | 5 | 113.1 | 113.6 | 12.8 | yes |
| window | drag | first | 2 | 595 | 307.5 | 441.1 | **no** |
| window | drag | later | 3 | 202.3 | 201.7 | 100.8 | yes |
| window | key_down | first | 12 | 236.7 | 203.4 | 2.3 | yes |
| window | key_down | later | 4 | 67.1 | 50.5 | 0.1 | yes |
| window | key_up | first | 1 | 1.2 | 0.9 | 0.8 | yes |
| window | key_up | later | 15 | 134 | 100.8 | 100.5 | yes |
| window | launch_app | first | 1 | 1.7 | 1.3 | 1.2 | yes |
| window | launch_app | later | 4 | 0.3 | 0.2 | 0.2 | **no** |
| window | move | first | 2 | 203.7 | 203.8 | 103 | yes |
| window | move | later | 4 | 100.7 | 101.5 | 0.4 | yes |
| window | press_key | first | 33 | 337 | 237.6 | 103.2 | yes |
| window | press_key | later | 3 | 167.4 | 134.2 | 0.4 | yes |
| window | scroll | first | 3 | 240.1 | 242.2 | 139.7 | yes |
| window | scroll | later | 6 | 203.3 | 202.8 | 101.2 | yes |

## m1a3-cover-800x600 (experiment partial-cover)

Firefox on the matrix page, one window per engine at the same place (800×600 at 1,20); the click point is the button's centre (window-relative 400, 220). Effects seen / coordinate clicks:

| front window | its real geometry | click point | window visible | pinned | newest | cua |
|---|---|---|---:|---|---|---|
| over everything | 2,40,1276,797 | covered | 4% | 0/5 | 0/5 | 0/5 |
| over the bottom 60% | 2,300,1276,537 | visible | 47% | 0/5 | 0/5 | 0/5 |
| over the bottom 54% | 2,336,1276,498 | visible | 53% | 0/5 | 0/5 | 0/5 |
| over the bottom 50% | 2,360,1276,472 | visible | 57% | 0/5 | 0/5 | 0/5 |
| over the bottom 48% | 2,372,1276,459 | visible | 59% | 0/5 | 0/5 | 0/5 |
| over the bottom 46% | 2,384,1276,446 | visible | 61% | 0/5 | 0/5 | 0/5 |
| over the bottom 44% | 2,396,1276,433 | visible | 63% | 0/5 | 0/5 | 0/5 |
| over the bottom 42% | 2,408,1276,420 | visible | 65% | 0/5 | 0/5 | 0/5 |
| over the bottom 40% | 2,420,1276,420 | visible | 67% | 0/5 | 0/5 | 0/5 |
| over the bottom 36% | 2,444,1276,394 | visible | 71% | 5/5 | 5/5 | 5/5 |
| over the bottom 30% | 2,480,1276,355 | visible | 77% | 5/5 | 5/5 | 5/5 |
| over the left 60% | 2,40,478,797 | covered | 42% | 5/5 | 5/5 | 5/5 |
| over the left 54% | 2,40,430,797 | covered | 48% | 5/5 | 5/5 | 5/5 |
| over the left 50% | 2,40,400,797 | covered | 52% | 5/5 | 5/5 | 5/5 |
| over the left 48% | 2,40,382,797 | visible | 54% | 5/5 | 5/5 | 5/5 |
| over the left 46% | 2,40,364,797 | visible | 56% | 5/5 | 5/5 | 5/5 |
| over the left 44% | 2,40,352,797 | visible | 57% | 5/5 | 5/5 | 5/5 |
| over the left 42% | 2,40,334,797 | visible | 60% | 5/5 | 5/5 | 5/5 |
| over the left 40% | 2,40,316,797 | visible | 62% | 5/5 | 5/5 | 5/5 |
| over the left 36% | 2,40,286,797 | visible | 65% | 5/5 | 5/5 | 5/5 |
| over the left 30% | 2,40,238,797 | visible | 71% | 5/5 | 5/5 | 5/5 |
| off the window | 1272,40,100,69 | visible | 100% | 5/5 | 5/5 | 5/5 |

## m1a3-drag-step

commit 6de1cfbb7d4913ce5c92872c93e606cbdba4fe58; cua-engine 0.0.1 (6de1cfbb7d49); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

variants: `cua:step0` = `--drag-step-ms 0`

negative check: the witness failed the activating stub (stacking, active, focus); no X request audit in this run

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | drag | pinned | 716 | 710.6 | 15 | – | – | – | 18/18 | – | 18/18 | 18/18 |  |
| chrome-input | drag | newest | 419.2 | 413.7 | 15 | – | – | – | 18/18 | – | 18/18 | 18/18 |  |
| chrome-input | drag | cua | 613.7 | 601.3 | 15 | – | – | – | 18/18 | – | 18/18 | 18/18 | FAIL: cua: cold 613.7 ms > bar 419.2 ms; cua: warm 601.3 ms > bar 413.7 ms |
| chrome-input | drag | cua:step0 | 141.1 | 138.9 | 15 | – | – | – | 18/18 | – | 18/18 | 18/18 | PASS |
| chrome-input | drag | **bar** | 419.2 | 413.7 | | | | | | | | | |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `type_characters is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

run valid; **FAIL**: chrome-input drag cua, finished 2026-10-28T23:18:01.405Z

## readiness-idle (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| family | condition | engine judged unobscured | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| gedit | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 118.5 | 2/2 |
| gedit | partial | 0/12 | 12/12 | 10.6 | 10.9 | quiet | 0.6 | 122.3 | 2/2 |
| gedit | covered | 0/12 | 12/12 | 13.3 | 14 | quiet | 3.3 | 130 | 2/2 |
| gnome-text-editor | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 82.6 | 2/2 |
| gnome-text-editor | partial | 0/12 | 12/12 | 150.1 | 150.1 | cap | – | 223.2 | 2/2 |
| gnome-text-editor | covered | 0/12 | 12/12 | 150.1 | 150.1 | cap | – | 223.8 | 2/2 |
| kate | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 41.2 | 2/2 |
| kate | partial | 0/12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 41.5 | 2/2 |
| kate | covered | 0/12 | 12/12 | 10.3 | 10.4 | quiet | 0.3 | 40.4 | 2/2 |
| qtcreator | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 268.8 | 2/2 |
| qtcreator | partial | 0/12 | 12/12 | 10.1 | 10.3 | quiet | 0.1 | 273.5 | 2/2 |
| qtcreator | covered | 0/12 | 12/12 | 10.4 | 10.6 | quiet | 0.4 | 246.7 | 2/2 |
| firefox | unobscured | 0/12 | 12/12 | 11.4 | 11.6 | quiet | 1.4 | 71.3 | 2/2 |
| firefox | partial | 0/12 | 12/12 | 11.4 | 11.5 | quiet | 1.4 | 72.6 | 2/2 |
| firefox | covered | 0/12 | 12/12 | 11.5 | 11.8 | quiet | 1.4 | 70.8 | 2/2 |
| chrome | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 103.5 | 2/2 |
| chrome | partial | 0/12 | 12/12 | 11.5 | 11.9 | quiet | 1.4 | 111.8 | 2/2 |
| chrome | covered | 0/12 | 12/12 | 20.6 | 24.7 | quiet | 5 | 136.3 | 2/2 |
| electron | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 51.5 | 2/2 |
| electron | partial | 0/12 | 12/12 | 11 | 11.5 | quiet | 1 | 54.3 | 2/2 |
| electron | covered | 0/12 | 12/12 | 14.6 | 21.1 | quiet | 2.3 | 60.2 | 2/2 |
| writer | unobscured | 0/12 | 12/12 | 10.4 | 10.5 | quiet | 0.4 | 496.6 | 2/2 |
| writer | partial | 0/12 | 12/12 | 10.4 | 10.5 | quiet | 0.4 | 477.3 | 2/2 |
| writer | covered | 0/12 | 12/12 | 13.3 | 14.3 | quiet | 3.3 | 486.8 | 2/2 |
| writer-gen | unobscured | 0/12 | 12/12 | 10.8 | 11.3 | quiet | 0.8 | 53.2 | 2/2 |
| writer-gen | partial | 0/12 | 12/12 | 11.3 | 11.9 | quiet | 1.2 | 52.9 | 2/2 |
| writer-gen | covered | 0/12 | 12/12 | 10.9 | 11.9 | quiet | 0.8 | 54.6 | 2/2 |
| xterm | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 27.6 | 2/2 |
| xterm | partial | 0/12 | 12/12 | 9.9 | 10.2 | quiet | 0.1 | 25.8 | 2/2 |
| xterm | covered | 0/12 | 12/12 | 10.2 | 10.2 | quiet | 0.1 | 25.7 | 2/2 |
| xterm-allow | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 25.3 | 2/2 |
| xterm-allow | partial | 0/12 | 12/12 | 9.9 | 10.1 | quiet | 0.1 | 25.6 | 2/2 |
| xterm-allow | covered | 0/12 | 12/12 | 10.1 | 10.3 | quiet | 0.1 | 27.9 | 2/2 |

**every first capture right** of 396; the pinned build's captures off the truth: 0/66.

## readiness-idle-sized (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| family | condition | engine judged unobscured | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| firefox | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 61.2 | 2/2 |
| firefox | partial | 0/12 | 12/12 | 11.2 | 12 | quiet | 1.1 | 65.3 | 2/2 |
| firefox | covered | 0/12 | 12/12 | 11.2 | 13.4 | quiet | 1.1 | 63.4 | 2/2 |
| writer | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 484.9 | 2/2 |
| writer | partial | 0/12 | 12/12 | 10.4 | 10.5 | quiet | 0.3 | 459.7 | 2/2 |
| writer | covered | 0/12 | 12/12 | 12.9 | 13.6 | quiet | 2.9 | 468.8 | 2/2 |
| writer-gen | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 45.1 | 2/2 |
| writer-gen | partial | 0/12 | 12/12 | 11.2 | 11.6 | quiet | 1.2 | 43.5 | 2/2 |
| writer-gen | covered | 0/12 | 12/12 | 13.9 | 16.3 | quiet | 0.8 | 47.8 | 2/2 |

**every first capture right** of 108; the pinned build's captures off the truth: 0/18.

## readiness-loaded (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| family | condition | engine judged unobscured | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| gedit | unobscured | 12/12 | 12/12 | 10 | 10.2 | unobscured | – | 298.4 | 2/2 |
| gedit | partial | 0/12 | 12/12 | 10.6 | 12 | quiet | 0.5 | 235.4 | 2/2 |
| gedit | covered | 0/12 | 12/12 | 15.9 | 151.7 | quiet, cap | 4.9 | 233.2 | 2/2 |
| gnome-text-editor | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 140.8 | 2/2 |
| gnome-text-editor | partial | 0/12 | 12/12 | 150.1 | 150.1 | cap | – | 285.8 | 2/2 |
| gnome-text-editor | covered | 0/12 | 12/12 | 150.1 | 150.1 | cap | – | 285.4 | 2/2 |
| kate | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 62.2 | 2/2 |
| kate | partial | 0/12 | 12/12 | 10.2 | 150.1 | quiet, cap | 0.2 | 64.1 | 2/2 |
| kate | covered | 0/12 | 12/12 | 10.5 | 10.8 | quiet | 0.4 | 61.5 | 2/2 |
| qtcreator | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 677.8 | 2/2 |
| qtcreator | partial | 0/12 | 12/12 | 10.2 | 11.1 | quiet | 0.1 | 725.2 | 2/2 |
| qtcreator | covered | 0/12 | 12/12 | 10.2 | 150.4 | quiet, cap | 0.4 | 768.8 | 2/2 |
| firefox | unobscured | 12/12 | 12/12 | 10 | 12.8 | unobscured | – | 113.8 | 2/2 |
| firefox | partial | 0/12 | 12/12 | 13.2 | 18.6 | quiet | 3.2 | 113.5 | 2/2 |
| firefox | covered | 0/12 | 12/12 | 19 | 31.8 | quiet | 3.5 | 112.8 | 2/2 |
| chrome | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 154 | 2/2 |
| chrome | partial | 0/12 | 12/12 | 11.4 | 146.9 | quiet, cap | 1.3 | 148.3 | 2/2 |
| chrome | covered | 0/12 | 12/12 | 17.9 | 25.9 | quiet | 4.9 | 145.4 | 2/2 |
| electron | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 79.9 | 2/2 |
| electron | partial | 0/12 | 12/12 | 11 | 152.5 | quiet, cap | 0.9 | 80.8 | 2/2 |
| electron | covered | 0/12 | 12/12 | 16.8 | 24.7 | quiet | 2.9 | 86.1 | 2/2 |
| writer | unobscured | 12/12 | 12/12 | 10 | 12.1 | unobscured | – | 1045 | 2/2 |
| writer | partial | 0/12 | 12/12 | 10.6 | 151.7 | quiet, cap | 0.5 | 1082.8 | 2/2 |
| writer | covered | 0/12 | 12/12 | 13.7 | 18.9 | quiet | 3.6 | 1048.1 | 2/2 |
| writer-gen | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 61.2 | 2/2 |
| writer-gen | partial | 0/12 | 12/12 | 11.4 | 150.1 | cap, quiet | 1.2 | 69.5 | 2/2 |
| writer-gen | covered | 0/12 | 12/12 | 17.2 | 18.5 | quiet | 0.8 | 73.8 | 2/2 |
| xterm | unobscured | 12/12 | 12/12 | 10 | 10.1 | unobscured | – | 59.6 | 2/2 |
| xterm | partial | 0/12 | 12/12 | 80.1 | 150.1 | cap, quiet | 0.1 | 130.1 | 2/2 |
| xterm | covered | 0/12 | 12/12 | 11.9 | 150.1 | quiet, cap | 0.4 | 66.2 | 2/2 |
| xterm-allow | unobscured | 12/12 | 12/12 | 10.1 | 10.1 | unobscured | – | 57.9 | 2/2 |
| xterm-allow | partial | 0/12 | 12/12 | 10.1 | 150.1 | quiet, cap | 0.1 | 62.8 | 2/2 |
| xterm-allow | covered | 0/12 | 12/12 | 82.3 | 150.1 | cap, quiet | 0.4 | 129.5 | 2/2 |

**every first capture right** of 396; the pinned build's captures off the truth: 0/66.

## m1a2-events-fix3 (experiment events)

| scenario | newest | cua |
|---|---|---|
| press_key a | same | same |
| press_key A | same | same |
| press_key z | same | same |
| press_key Z | same | same |
| press_key shift+z | same | same |
| press_key Shift+Z | same | same |
| press_key ctrl+z | same | same |
| press_key Ctrl+Z | same | same |
| press_key CTRL+z | same | same |
| press_key Ctrl+Shift+Z | same | same |
| press_key ctrl+shift+t | same | same |
| press_key Ctrl+Shift+T | same | same |
| press_key XK_Return | same | same |
| press_key Return | same | same |
| press_key alt+F5 | same | same |
| press_key Ctrl+Alt+Shift+A | same | same |
| press_key super+L | same | same |
| press_key ! | same | same |
| press_key @ | same | same |
| press_key shift+! | same | same |
| press_key !+@ | same | same |
| press_key ctrl++ | same | same |
| press_key + | same | same |
| press_key a+a | same | same |
| press_key < | same | same |
| press_key kp_enter | same | same |
| press_key f12 | same | same |
| press_key space | same | same |
| press_key Escape | same | same |
| press_key with duration | same | same |
| press_key bad key | same | same |
| press_key empty | same | same |
| held ctrl around press_key a | same | same |
| held Ctrl around press_key Shift+Z | same | same |
| two holds sharing ctrl | same | same |
| a repeated hold is one hold | same | same |
| key_up of nothing held | same | same |
| a hold is named by its normalized chord | same | same |
| order makes a different hold | same | same |
| held shift under a click chord | differs at step 1 (event) | same |
| bad keys in holds | same | same |
| holds left at exit are released with their state | same | same |
| held key across another window request | differs at step 1 (event) | same |
| click | differs at step 0 (event) | same |
| click in the child | differs at step 0 (event) | same |
| right click | differs at step 0 (event) | same |
| middle double click held 0 | differs at step 0 (event) | same |
| click with a chord | differs at step 0 (event) | same |
| click outside the window | same | same |
| click validation | same | same |
| move | differs at step 0 (event) | same |
| scroll at the centre | differs at step 0 (event) | same |
| scroll at a point | differs at step 0 (event) | same |
| scroll validation | same | same |
| drag | differs at step 0 (event) | same |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same |
| drag with a chord, and a short path | differs at step 0 (event) | same |
| desktop press_key a | same | same |
| desktop press_key Z | same | same |
| desktop press_key Ctrl+Z | same | same |
| desktop press_key ! | same | same |
| desktop press_key ctrl++ | same | same |
| desktop press_key a+a | same | same |
| desktop press_key bad key | same | same |
| desktop held ctrl around press_key a | same | same |
| desktop two holds sharing ctrl | same | same |
| desktop holds left at exit | same | same |
| desktop hold and a window hold are apart | same | same |
| desktop click | differs at step 0 (event) | same |
| desktop click in place | same | same |
| desktop click far | differs at step 0 (event) | same |
| desktop move | differs at step 0 (event) | same |
| desktop move_relative | same | same |
| desktop scroll | differs at step 1 (event) | same |
| desktop drag | differs at step 0 (event) | same |
| desktop drag short path | same | same |
| drag_handle | differs at step 0 (event) | same |
| drag_handle stray end | same | same |
| activate_window | same | same |
| launch_app | same | same |

cua sent the pinned build's events and answers in every scenario.

