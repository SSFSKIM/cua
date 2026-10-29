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

## m1a4-wire-final

commit 2104e8cd856649f2a311245b8a82bf9289f51bf1; cua-engine 0.0.1 (2104e8cd8566); occlusion covered; 7 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 152.5 | 126 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_windows | newest | 127.7 | 113.6 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_windows | cua | 13.2 | 7.3 | 49 | – | – | – | – | – | – | 56/56 | PASS |
| desktop | list_windows | **bar** | 127.7 | 113.6 | | | | | | | | | |
| desktop | list_apps | pinned | 134.8 | 120 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_apps | newest | 129.9 | 128.4 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_apps | cua | 14.1 | 7.4 | 49 | – | – | – | – | – | – | 56/56 | PASS |
| desktop | list_apps | **bar** | 129.9 | 120 | | | | | | | | | |
| desktop | get_screenshot | pinned | 41.1 | 27.5 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | get_screenshot | newest | 39 | 28.5 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | get_screenshot | cua | 40.8 | 23.9 | 49 | – | – | – | – | – | – | 56/56 | FAIL: cua: cold 40.83 ms > bar 39.03 ms |
| desktop | get_screenshot | **bar** | 39 | 27.5 | | | | | | | | | |
| desktop | launch_app | pinned | 5.7 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 |  |
| desktop | launch_app | newest | 6.7 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 |  |
| desktop | launch_app | cua | 5.3 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 | PASS |
| desktop | launch_app | **bar** | 5.7 | 0.7 | | | | | | | | | |
| gedit | tree | pinned | 630.4 | 627.7 | 49 | 3190 / 3190 | 3190 / 3190 | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree | newest | 627.2 | 600.8 | 49 | 3190 / 3190 | 3190 / 3190 | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree | cua | 91.8 | 83 | 49 | 3190 / 3189 | 75 / 48 | 0 | 56/56 | clean | – | 56/56 | PASS |
| gedit | tree | **bar** | 627.2 | 600.8 | | | | | | | | | |
| gedit | tree_shot | pinned | 793.6 | 754.6 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree_shot | newest | 760.5 | 735.7 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree_shot | cua | 128.6 | 109.8 | 49 | – | – | 0 | 56/56 | clean | – | 56/56 | PASS |
| gedit | tree_shot | **bar** | 760.5 | 735.7 | | | | | | | | | |
| gedit | press_key | pinned | 275.8 | 269.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| gedit | press_key | newest | 241 | 235.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| gedit | press_key | cua | 107.2 | 101.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| gedit | press_key | **bar** | 241 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 220.7 | 214.9 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| gedit | click | newest | 222.9 | 215.5 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| gedit | click | cua | 120.7 | 113.8 | 35 | – | – | – | 42/42 | clean | – | 42/42 | PASS |
| gedit | click | **bar** | 220.7 | 214.9 | | | | | | | | | |
| chrome | tree | pinned | 492.7 | 508.9 | 49 | 2257 / 2257 | 2257 / 2257 | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree | newest | 523.5 | 500.3 | 49 | 2257 / 2257 | 2257 / 2257 | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree | cua | 77.1 | 61 | 49 | 2257 / 2256 | 26 / 28 | 0 | 56/56 | clean | – | 56/56 | PASS |
| chrome | tree | **bar** | 492.7 | 500.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 675.8 | 615.3 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree_shot | newest | 582.3 | 616.9 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree_shot | cua | 123.7 | 88.2 | 49 | – | – | 0 | 56/56 | clean | – | 56/56 | PASS |
| chrome | tree_shot | **bar** | 582.3 | 615.3 | | | | | | | | | |
| chrome | press_key | pinned | 275.4 | 269 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | press_key | newest | 241.9 | 236 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | press_key | cua | 108 | 101.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome | press_key | **bar** | 241.9 | 236 | | | | | | | | | |
| chrome | click | pinned | 219.9 | 215.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | click | newest | 222.2 | 215.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | click | cua | 120.3 | 113.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome | click | **bar** | 219.9 | 215.1 | | | | | | | | | |
| chrome-input | click_element | pinned | 366.9 | 365.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | click_element | newest | 375.5 | 356.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | click_element | cua | 143.4 | 136.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | click_element | **bar** | 366.9 | 356.3 | | | | | | | | | |
| chrome-input | right_click | pinned | 383.5 | 384.9 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click | newest | 383.4 | 391.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click | cua | 159.6 | 150.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | right_click | **bar** | 383.4 | 384.9 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 823.4 | 747.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click_fallback | newest | 756.2 | 729.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click_fallback | cua | 248.4 | 240.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | right_click_fallback | **bar** | 756.2 | 729.2 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 367.1 | 377.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | secondary_action | newest | 368.4 | 365.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | secondary_action | cua | 143.4 | 137 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | secondary_action | **bar** | 367.1 | 365.2 | | | | | | | | | |
| chrome-input | move | pinned | 207.9 | 202.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | move | newest | 209.3 | 203.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | move | cua | 107 | 101.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | move | **bar** | 207.9 | 202.5 | | | | | | | | | |
| chrome-input | drag | pinned | 708.8 | 706.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | drag | newest | 416.5 | 412.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | drag | cua | 397.7 | 393.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | drag | **bar** | 416.5 | 412.8 | | | | | | | | | |
| chrome-input | scroll | pinned | 316.4 | 311.3 | 35 | – | – | – | 42/42 | clean | 28/42 | 42/42 |  |
| chrome-input | scroll | newest | 319 | 312.4 | 35 | – | – | – | 42/42 | clean | 28/42 | 42/42 |  |
| chrome-input | scroll | cua | 216 | 210.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | scroll | **bar** | 316.4 | 311.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 376.4 | 374.3 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| chrome-input | scroll_element_hidden | newest | 367.2 | 378.8 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| chrome-input | scroll_element_hidden | cua | 144.4 | 137.1 | 35 | – | – | – | 42/42 | clean | – | 42/42 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 367.2 | 374.3 | | | | | | | | | |
| chrome-input | key_down | pinned | 240.2 | 235.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_down | newest | 207.6 | 202.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_down | cua | 6.8 | 0.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | key_down | **bar** | 207.6 | 202.2 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.9 | 133.9 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_up | cua | 100.7 | 100.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 6.8 | 0.5 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 |  |
| chrome-input | activate_window | newest | 5.9 | 0.5 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 |  |
| chrome-input | activate_window | cua | 4.8 | 0.3 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 | PASS |
| chrome-input | activate_window | **bar** | 5.9 | 0.5 | | | | | | | | | |
| over-budget | tree | pinned | 7147.9 | 7091.1 | 49 | 45069 / 45069 | 45069 / 45069 | – | 56/56 | clean | – | 56/56 |  |
| over-budget | tree | newest | 7113.3 | 7020.2 | 49 | 45069 / 45069 | 45069 / 45069 | – | 56/56 | clean | – | 56/56 |  |
| over-budget | tree | cua | 958.7 | 951.7 | 49 | 45258 / 45251 | 143 / 196 | 190 | 56/56 | clean | – | 56/56 | PASS |
| over-budget | tree | **bar** | 7113.3 | 7020.2 | | | | | | | | | |
| big-text | tree | pinned | 570.1 | 515.7 | 49 | 2062 / 2062 | 2062 / 2062 | – | 56/56 | clean | – | 56/56 |  |
| big-text | tree | newest | 537.4 | 523.7 | 49 | 2062 / 2062 | 2062 / 2062 | – | 56/56 | clean | – | 56/56 |  |
| big-text | tree | cua | 119.4 | 117.2 | 49 | 2062 / 2061 | 21 / 21 | 0 | 56/56 | clean | – | 56/56 | PASS |
| big-text | tree | **bar** | 537.4 | 515.7 | | | | | | | | | |
| gtk-table | tree | pinned | 328.8 | 317.4 | 49 | 940 / 940 | 940 / 940 | – | 56/56 | clean | – | 56/56 |  |
| gtk-table | tree | newest | 287.8 | 282.2 | 49 | 940 / 940 | 940 / 940 | – | 56/56 | clean | – | 56/56 |  |
| gtk-table | tree | cua | 94.8 | 91.5 | 49 | 938 / 937 | 289 / 289 | 0 | 56/56 | clean | – | 56/56 | PASS |
| gtk-table | tree | **bar** | 287.8 | 282.2 | | | | | | | | | |
| calc | tree | pinned | 3623.8 | 3744 | 49 | 19856 / 19856 | 19856 / 19856 | – | 56/56 | clean | – | 56/56 |  |
| calc | tree | newest | 3731.5 | 3560.1 | 49 | 19856 / 19856 | 19856 / 19856 | – | 56/56 | clean | – | 56/56 |  |
| calc | tree | cua | 765.1 | 745.3 | 49 | 19854 / 19853 | 1298 / 1250 | 0 | 56/56 | clean | – | 56/56 | PASS |
| calc | tree | **bar** | 3623.8 | 3560.1 | | | | | | | | | |
| retention | after_resize | pinned | 633.7 | 619.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_resize | newest | 622.8 | 620.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_resize | cua | 87.8 | 91.8 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_resize | **bar** | 622.8 | 619.1 | | | | | | | | | |
| retention | after_remap | pinned | 624.8 | 647.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_remap | newest | 650.3 | 606.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_remap | cua | 104.1 | 99 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_remap | **bar** | 624.8 | 606.2 | | | | | | | | | |
| retention | after_covered_change | pinned | 610.1 | 622.9 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_covered_change | newest | 613.9 | 598.4 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_covered_change | cua | 99.6 | 110.4 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_covered_change | **bar** | 610.1 | 598.4 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 56/56 | 0 | 0 |  |
| desktop | newest | 56/56 | 28 | 0.0073 |  |
| desktop | cua | 56/56 | 28 | 0.0073 |  |
| gedit | pinned | 56/56 | 0 | 0 |  |
| gedit | newest | 56/56 | 0 | 0 |  |
| gedit | cua | 56/56 | 0 | 0 |  |
| chrome | pinned | 56/56 | 0 | 0 |  |
| chrome | newest | 56/56 | 0 | 0 |  |
| chrome | cua | 56/56 | 0 | 0 |  |
| retention | pinned | 126/126 | 0 | 0 |  |
| retention | newest | 126/126 | 0 | 0 |  |
| retention | cua | 126/126 | 0 | 0 |  |

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

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within
- big-text cua: within
- gtk-table cua: within
- calc cua: within

run valid; **FAIL**: desktop get_screenshot cua, finished 2026-10-29T13:27:48.020Z

## m1a4-vendor-js-final

commit 2104e8cd856649f2a311245b8a82bf9289f51bf1; cua-engine 0.0.1 (2104e8cd8566); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 142.5 | 110.9 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 195.9 | 125 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 13.2 | 7.1 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 142.5 | 110.9 | | | | | | | | | |
| desktop | list_apps | pinned | 140.2 | 105.4 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | newest | 141.6 | 109.4 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | cua | 13 | 7.8 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_apps | **bar** | 140.2 | 105.4 | | | | | | | | | |
| desktop | get_screenshot | pinned | 36.7 | 27.7 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | newest | 45 | 29.3 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | cua | 36.1 | 25.1 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | get_screenshot | **bar** | 36.7 | 27.7 | | | | | | | | | |
| desktop | launch_app | pinned | 5.5 | 0.9 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | newest | 6 | 0.9 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | cua | 7.2 | 0.8 | 21 | – | – | – | – | – | 24/24 | 24/24 | PASS |
| desktop | launch_app | **bar** | 5.5 | 0.9 | | | | | | | | | |
| gedit | tree | pinned | 594.7 | 569.8 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | newest | 537.2 | 664.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | cua | 114.7 | 85.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree | **bar** | 537.2 | 569.8 | | | | | | | | | |
| gedit | tree_shot | pinned | 831.6 | 753.2 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | newest | 775.9 | 756.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | cua | 162.9 | 114.7 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 775.9 | 753.2 | | | | | | | | | |
| gedit | press_key | pinned | 274.8 | 269.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 241.6 | 235.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 107 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 241.6 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 220 | 215.3 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 223.6 | 216.3 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 121.4 | 114.1 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 220 | 215.3 | | | | | | | | | |
| chrome | tree | pinned | 453.1 | 461.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | newest | 529.3 | 507 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | cua | 80.5 | 60.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree | **bar** | 453.1 | 461.3 | | | | | | | | | |
| chrome | tree_shot | pinned | 696.8 | 605.5 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | newest | 588.2 | 629 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | cua | 125.8 | 98.5 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 588.2 | 605.5 | | | | | | | | | |
| chrome | press_key | pinned | 274.5 | 269.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 240.8 | 236.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 107.6 | 101.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 240.8 | 236.3 | | | | | | | | | |
| chrome | click | pinned | 221 | 215.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 221.4 | 216 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 120.7 | 114 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 221 | 215.2 | | | | | | | | | |
| chrome-input | click_element | pinned | 346.4 | 352.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | newest | 351.3 | 364.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | cua | 140.7 | 137.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | click_element | **bar** | 346.4 | 352.5 | | | | | | | | | |
| chrome-input | right_click | pinned | 382.4 | 369.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | newest | 402.9 | 383.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | cua | 154.7 | 154.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click | **bar** | 382.4 | 369.6 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 715.4 | 760 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | newest | 758.5 | 761.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | cua | 241.7 | 240.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click_fallback | **bar** | 715.4 | 760 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 374.5 | 374.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | newest | 365.8 | 371 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | cua | 145.8 | 136.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | secondary_action | **bar** | 365.8 | 371 | | | | | | | | | |
| chrome-input | move | pinned | 202.9 | 202.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | newest | 204.6 | 203.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | cua | 103.3 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | move | **bar** | 202.9 | 202.7 | | | | | | | | | |
| chrome-input | drag | pinned | 733.8 | 721.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | newest | 416.3 | 411.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | cua | 396.4 | 401.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | drag | **bar** | 416.3 | 411.9 | | | | | | | | | |
| chrome-input | scroll | pinned | 311.7 | 311.3 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | newest | 313.4 | 312.5 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | cua | 212.9 | 210.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | scroll | **bar** | 311.7 | 311.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 356.5 | 360.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | newest | 357.4 | 350.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | cua | 138.3 | 134 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 356.5 | 350.2 | | | | | | | | | |
| chrome-input | key_down | pinned | 235.7 | 235.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | newest | 202.7 | 202.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | cua | 2.7 | 0.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_down | **bar** | 202.7 | 202.5 | | | | | | | | | |
| chrome-input | key_up | pinned | 134.2 | 134.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | newest | 101 | 101 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | cua | 100.8 | 100.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_up | **bar** | 101 | 101 | | | | | | | | | |
| chrome-input | activate_window | pinned | 0.7 | 0.9 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | newest | 0.7 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | cua | 0.7 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 | PASS |
| chrome-input | activate_window | **bar** | 0.7 | 0.7 | | | | | | | | | |
| over-budget | tree | pinned | 7073.9 | 7198.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | newest | 6928.6 | 7001.6 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | cua | 969.7 | 958.8 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6928.6 | 7001.6 | | | | | | | | | |
| big-text | tree | pinned | 779.5 | 594.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| big-text | tree | newest | 629.5 | 651.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| big-text | tree | cua | 249.6 | 227.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| big-text | tree | **bar** | 629.5 | 594.3 | | | | | | | | | |
| gtk-table | tree | pinned | 301.7 | 300.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gtk-table | tree | newest | 280.1 | 268.8 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gtk-table | tree | cua | 87.9 | 91.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gtk-table | tree | **bar** | 280.1 | 268.8 | | | | | | | | | |
| calc | tree | pinned | 3465.3 | 3717.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| calc | tree | newest | 3766.1 | 3706 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| calc | tree | cua | 746.5 | 779 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| calc | tree | **bar** | 3465.3 | 3706 | | | | | | | | | |
| retention | after_resize | pinned | 652.8 | 644.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 699.9 | 634.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 95.1 | 96.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 652.8 | 634.7 | | | | | | | | | |
| retention | after_remap | pinned | 592.1 | 594.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 634.8 | 608 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 112 | 95 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 592.1 | 594.7 | | | | | | | | | |
| retention | after_covered_change | pinned | 650.4 | 609.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 657.6 | 682.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 107 | 92.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 650.4 | 609.3 | | | | | | | | | |

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

run valid; every verdict PASS, finished 2026-10-29T14:03:40.666Z

## m1a4-events-final (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | click | first | 3 | 88 | 88.6 | 87.2 | yes |
| desktop | click | later | 1 | 158.4 | 92.4 | 25.3 | yes |
| desktop | drag_handle | first | 2 | 38.4 | 38.6 | 37.9 | yes |
| desktop | drag_handle | later | 2 | 33 | 30.1 | 33.1 | **no** |
| desktop | drag | first | 2 | 331.1 | 109.1 | 51.5 | yes |
| desktop | key_down | first | 4 | 53 | 2.2 | 1.6 | yes |
| desktop | key_down | later | 1 | 34.1 | 0.8 | 0.3 | yes |
| desktop | key_up | later | 5 | 33.4 | 0.2 | 0.2 | **no** |
| desktop | move_relative | first | 1 | 1.4 | 2.2 | 1 | yes |
| desktop | move_relative | later | 2 | 33.6 | 17.2 | 0.2 | yes |
| desktop | move | first | 1 | 83.5 | 84.7 | 83 | yes |
| desktop | move | later | 2 | 37.9 | 20 | 4.4 | yes |
| desktop | press_key | first | 7 | 70.2 | 36 | 1.3 | yes |
| desktop | press_key | later | 1 | 67.9 | 34 | 0.5 | yes |
| desktop | scroll | first | 1 | 74 | 75.2 | 73.6 | yes |
| desktop | scroll | later | 1 | 440.6 | 407.3 | 373.6 | yes |
| window | activate_window | first | 1 | 1.4 | 1.7 | 1 | yes |
| window | click | first | 7 | 216.1 | 216.9 | 115.1 | yes |
| window | click | later | 5 | 113.4 | 114.2 | 12.9 | yes |
| window | drag | first | 2 | 578.1 | 305.9 | 126.4 | yes |
| window | drag | later | 3 | 202 | 201.8 | 100.8 | yes |
| window | key_down | first | 12 | 237.9 | 203.5 | 2.6 | yes |
| window | key_down | later | 4 | 67.1 | 50.7 | 0.1 | yes |
| window | key_up | first | 1 | 1.2 | 1.1 | 0.8 | yes |
| window | key_up | later | 15 | 134.1 | 100.9 | 100.5 | yes |
| window | launch_app | first | 1 | 1.4 | 1.4 | 1 | yes |
| window | launch_app | later | 4 | 0.2 | 0.2 | 0.2 | yes |
| window | move | first | 2 | 203.2 | 203.8 | 104.5 | yes |
| window | move | later | 4 | 100.9 | 101.7 | 0.5 | yes |
| window | press_key | first | 33 | 337 | 237.4 | 103 | yes |
| window | press_key | later | 3 | 167.4 | 134.5 | 0.3 | yes |
| window | scroll | first | 3 | 240.7 | 241.6 | 139.8 | yes |
| window | scroll | later | 6 | 202.4 | 202.7 | 101.1 | yes |

## m1a4-vendor-js-desktop-final (experiment events)

Through OpenAI's JavaScript client (the desktop-only commands, well-formed requests, effects read back):

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| desktop move_relative | same | same | 2/2 / 2/2 / 2/2 |
| drag_handle | differs at step 0 (event) | same | 3/3 / 3/3 / 3/3 |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest; through the client they include its deferred settle, so they are recorded, not judged):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | drag_handle | first | 1 | 76.4 | 77.2 | 79 | **no** |
| desktop | drag_handle | later | 2 | 126.2 | 118.8 | 123.1 | **no** |
| desktop | move_relative | first | 1 | 4.8 | 6.4 | 2.3 | yes |
| desktop | move_relative | later | 1 | 161.7 | 123.6 | 94.7 | yes |

## m1a4-matrix-covered-final (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-covered-final |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m1a4-matrix-covered-final |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-covered-final |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-covered-final |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered-final |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-covered-final |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-covered-final |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-covered-final |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m1a4-matrix-covered-final |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m1a4-matrix-covered-final |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered-final |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered-final |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m1a4-matrix-covered-final |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered-final |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered-final |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered-final |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 4/5 | 5/5 / 0/5 |  | clean | partial: partial | m1a4-matrix-covered-final |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 0/5 | 5/5 / 0/5 |  | clean | partial: partial | m1a4-matrix-covered-final |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered-final |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m1a4-matrix-covered-final |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m1a4-matrix-covered-final |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered-final |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m1a4-matrix-covered-final`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `m1a4-matrix-covered-final`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m1a4-matrix-covered-final`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m1a4-matrix-covered-final`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m1a4-matrix-covered-final`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 kate | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 qtcreator | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / clean | PASS |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| Electron (cua fixture) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gen, X11 only) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / clean | PASS |
| xterm, allowSendEvents on | clean / clean / clean | clean / clean / clean | PASS |

The run is complete.

## m1a4-matrix-visible-final (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible-final |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m1a4-matrix-visible-final |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-visible-final |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-visible-final |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (69) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible-final |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-visible-final |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible-final |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-visible-final |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m1a4-matrix-visible-final |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m1a4-matrix-visible-final |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m1a4-matrix-visible-final |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m1a4-matrix-visible-final |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (69) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible-final |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m1a4-matrix-visible-final |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m1a4-matrix-visible-final |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-visible-final |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m1a4-matrix-visible-final`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m1a4-matrix-visible-final`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m1a4-matrix-visible-final`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m1a4-matrix-visible-final`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 kate | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 qtcreator | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / clean | PASS |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| Electron (cua fixture) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gen, X11 only) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / clean | PASS |
| xterm, allowSendEvents on | clean / clean / clean | clean / clean / clean | PASS |

The run is complete.

## m1a4-wire-7

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 7 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 133.5 | 124 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_windows | newest | 129.4 | 128.2 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_windows | cua | 12.4 | 7.6 | 49 | – | – | – | – | – | – | 56/56 | PASS |
| desktop | list_windows | **bar** | 129.4 | 124 | | | | | | | | | |
| desktop | list_apps | pinned | 139.8 | 113.9 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_apps | newest | 149.6 | 121.8 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | list_apps | cua | 14.4 | 8.9 | 49 | – | – | – | – | – | – | 56/56 | PASS |
| desktop | list_apps | **bar** | 139.8 | 113.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.5 | 27.8 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | get_screenshot | newest | 37.5 | 29.2 | 49 | – | – | – | – | – | – | 56/56 |  |
| desktop | get_screenshot | cua | 39.5 | 24.4 | 49 | – | – | – | – | – | – | 56/56 | FAIL: cua: cold 39.5 ms > bar 37.5 ms |
| desktop | get_screenshot | **bar** | 37.5 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 5.3 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 |  |
| desktop | launch_app | newest | 5 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 |  |
| desktop | launch_app | cua | 5.2 | 0.7 | 49 | – | – | – | – | – | 56/56 | 56/56 | FAIL: cua: cold 5.2 ms > bar 5 ms |
| desktop | launch_app | **bar** | 5 | 0.7 | | | | | | | | | |
| gedit | tree | pinned | 634.2 | 600.1 | 49 | 3190 / 3190 | 3190 / 3190 | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree | newest | 598.8 | 599.7 | 49 | 3190 / 3190 | 3190 / 3190 | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree | cua | 96.9 | 74.3 | 49 | 3190 / 3189 | 82 / 87 | 0 | 56/56 | clean | – | 56/56 | PASS |
| gedit | tree | **bar** | 598.8 | 599.7 | | | | | | | | | |
| gedit | tree_shot | pinned | 724.4 | 746.5 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree_shot | newest | 736.7 | 720.2 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| gedit | tree_shot | cua | 129.4 | 101.2 | 49 | – | – | 0 | 56/56 | clean | – | 56/56 | PASS |
| gedit | tree_shot | **bar** | 724.4 | 720.2 | | | | | | | | | |
| gedit | press_key | pinned | 273.7 | 268.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| gedit | press_key | newest | 241.2 | 235.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| gedit | press_key | cua | 107 | 101.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| gedit | press_key | **bar** | 241.2 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 220.3 | 215.3 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| gedit | click | newest | 221.4 | 215.9 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| gedit | click | cua | 120.2 | 114 | 35 | – | – | – | 42/42 | clean | – | 42/42 | PASS |
| gedit | click | **bar** | 220.3 | 215.3 | | | | | | | | | |
| chrome | tree | pinned | 479.7 | 494.1 | 49 | 2257 / 2257 | 2257 / 2257 | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree | newest | 512.4 | 488.5 | 49 | 2257 / 2257 | 2257 / 2257 | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree | cua | 72.5 | 61 | 49 | 2257 / 2256 | 34 / 31 | 0 | 56/56 | clean | – | 56/56 | PASS |
| chrome | tree | **bar** | 479.7 | 488.5 | | | | | | | | | |
| chrome | tree_shot | pinned | 630.4 | 636.2 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree_shot | newest | 656.7 | 602.1 | 49 | – | – | – | 56/56 | clean | – | 56/56 |  |
| chrome | tree_shot | cua | 118.9 | 90.1 | 49 | – | – | 0 | 56/56 | clean | – | 56/56 | PASS |
| chrome | tree_shot | **bar** | 630.4 | 602.1 | | | | | | | | | |
| chrome | press_key | pinned | 274.1 | 269.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | press_key | newest | 241.3 | 236 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | press_key | cua | 107.6 | 101.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome | press_key | **bar** | 241.3 | 236 | | | | | | | | | |
| chrome | click | pinned | 220.1 | 215 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | click | newest | 222 | 215.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome | click | cua | 120 | 113.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome | click | **bar** | 220.1 | 215 | | | | | | | | | |
| chrome-input | click_element | pinned | 383.4 | 361.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | click_element | newest | 375.6 | 364.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | click_element | cua | 144.5 | 137.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | click_element | **bar** | 375.6 | 361.2 | | | | | | | | | |
| chrome-input | right_click | pinned | 399.3 | 399.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click | newest | 399.8 | 385.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click | cua | 161.2 | 152.5 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | right_click | **bar** | 399.3 | 385.8 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 813.8 | 732.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click_fallback | newest | 756.7 | 748.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | right_click_fallback | cua | 252.3 | 241.9 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | right_click_fallback | **bar** | 756.7 | 732.3 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 382.1 | 383.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | secondary_action | newest | 380.5 | 370.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | secondary_action | cua | 145.9 | 138.4 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | secondary_action | **bar** | 380.5 | 370.3 | | | | | | | | | |
| chrome-input | move | pinned | 207.6 | 202.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | move | newest | 210.1 | 203.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | move | cua | 107.9 | 101.4 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | move | **bar** | 207.6 | 202.3 | | | | | | | | | |
| chrome-input | drag | pinned | 720.5 | 721.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | drag | newest | 421.5 | 412.4 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | drag | cua | 403.3 | 392.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | drag | **bar** | 421.5 | 412.4 | | | | | | | | | |
| chrome-input | scroll | pinned | 316.3 | 311.1 | 35 | – | – | – | 42/42 | clean | 28/42 | 42/42 |  |
| chrome-input | scroll | newest | 317.9 | 311.8 | 35 | – | – | – | 42/42 | clean | 28/42 | 42/42 |  |
| chrome-input | scroll | cua | 216.6 | 210 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | scroll | **bar** | 316.3 | 311.1 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 391.8 | 354.3 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| chrome-input | scroll_element_hidden | newest | 359.5 | 360.3 | 35 | – | – | – | 42/42 | clean | – | 42/42 |  |
| chrome-input | scroll_element_hidden | cua | 144.8 | 137.1 | 35 | – | – | – | 42/42 | clean | – | 42/42 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 359.5 | 354.3 | | | | | | | | | |
| chrome-input | key_down | pinned | 239.6 | 235.3 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_down | newest | 207.7 | 202.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_down | cua | 6.7 | 0.7 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | key_down | **bar** | 207.7 | 202.2 | | | | | | | | | |
| chrome-input | key_up | pinned | 134.1 | 133.9 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| chrome-input | key_up | cua | 100.7 | 100.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 | PASS |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 6.2 | 0.5 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 |  |
| chrome-input | activate_window | newest | 5.2 | 0.5 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 |  |
| chrome-input | activate_window | cua | 4.2 | 0.4 | 35 | – | – | – | 0/42 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 42/42 | 42/42 | PASS |
| chrome-input | activate_window | **bar** | 5.2 | 0.5 | | | | | | | | | |
| over-budget | tree | pinned | 7178 | 7190.4 | 49 | 45069 / 45069 | 45069 / 45069 | – | 56/56 | clean | – | 56/56 |  |
| over-budget | tree | newest | 6984.1 | 7077.8 | 49 | 45069 / 45069 | 45069 / 45069 | – | 56/56 | clean | – | 56/56 |  |
| over-budget | tree | cua | 966.7 | 968.6 | 49 | 45252 / 45246 | 144 / 153 | 190 | 56/56 | clean | – | 56/56 | PASS |
| over-budget | tree | **bar** | 6984.1 | 7077.8 | | | | | | | | | |
| big-text | tree | pinned | 541.2 | 544.1 | 49 | 2062 / 2062 | 2062 / 2062 | – | 56/56 | clean | – | 56/56 |  |
| big-text | tree | newest | 560 | 508.8 | 49 | 2062 / 2062 | 2062 / 2062 | – | 56/56 | clean | – | 56/56 |  |
| big-text | tree | cua | 133.5 | 117.9 | 49 | 2062 / 2061 | 26 / 30 | 0 | 56/56 | clean | – | 56/56 | PASS |
| big-text | tree | **bar** | 541.2 | 508.8 | | | | | | | | | |
| gtk-table | tree | pinned | 293.3 | 292.9 | 49 | 940 / 940 | 940 / 940 | – | 56/56 | clean | – | 56/56 |  |
| gtk-table | tree | newest | 284.5 | 299.2 | 49 | 940 / 940 | 940 / 940 | – | 56/56 | clean | – | 56/56 |  |
| gtk-table | tree | cua | 90 | 87.6 | 49 | 938 / 937 | 287 / 288 | 0 | 56/56 | clean | – | 56/56 | PASS |
| gtk-table | tree | **bar** | 284.5 | 292.9 | | | | | | | | | |
| calc | tree | pinned | 3651.7 | 3704.3 | 49 | 19856 / 19856 | 19856 / 19856 | – | 56/56 | clean | – | 56/56 |  |
| calc | tree | newest | 3737.5 | 3641.4 | 49 | 19856 / 19856 | 19856 / 19856 | – | 56/56 | clean | – | 56/56 |  |
| calc | tree | cua | 761.6 | 741.5 | 49 | 19854 / 19853 | 1256 / 1213 | 0 | 56/56 | clean | – | 56/56 | PASS |
| calc | tree | **bar** | 3651.7 | 3641.4 | | | | | | | | | |
| retention | after_resize | pinned | 615.1 | 627.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_resize | newest | 631 | 614 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_resize | cua | 90.4 | 91.1 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_resize | **bar** | 615.1 | 614 | | | | | | | | | |
| retention | after_remap | pinned | 635.7 | 620.8 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_remap | newest | 623.1 | 629.6 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_remap | cua | 87.8 | 98.5 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_remap | **bar** | 623.1 | 620.8 | | | | | | | | | |
| retention | after_covered_change | pinned | 611.7 | 633.2 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_covered_change | newest | 592.5 | 641.1 | 35 | – | – | – | 42/42 | clean | 42/42 | 42/42 |  |
| retention | after_covered_change | cua | 94.9 | 97.4 | 35 | – | – | 0 | 42/42 | clean | 42/42 | 42/42 | PASS |
| retention | after_covered_change | **bar** | 592.5 | 633.2 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 56/56 | 0 | 0 |  |
| desktop | newest | 56/56 | 28 | 0.0073 |  |
| desktop | cua | 56/56 | 28 | 0.0073 |  |
| gedit | pinned | 56/56 | 0 | 0 |  |
| gedit | newest | 56/56 | 0 | 0 |  |
| gedit | cua | 56/56 | 0 | 0 |  |
| chrome | pinned | 56/56 | 0 | 0 |  |
| chrome | newest | 56/56 | 0 | 0 |  |
| chrome | cua | 56/56 | 0 | 0 |  |
| retention | pinned | 126/126 | 0 | 0 |  |
| retention | newest | 126/126 | 0 | 0 |  |
| retention | cua | 126/126 | 0 | 0 |  |

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

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within
- big-text cua: within
- gtk-table cua: within
- calc cua: within

run valid; **FAIL**: desktop get_screenshot cua, desktop launch_app cua, finished 2026-10-29T09:39:54.130Z

## m1a4-drag-browsers (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | newest took | cua took | cua:0ms took | cua:dwell took | newest drag ms | cua drag ms | cua:0ms drag ms | cua:dwell drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 29/30 | 30/30 | 321.4 | 252.6 | 122.5 | 181.1 | 466.3 | clean | cua PASS, cua:0ms **misses 1**, cua:dwell PASS |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 324.8 | 274.1 | 126.2 | 189.6 | 505.3 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 3/30 | 4/30 | 262.8 | 145.7 | 108.4 | 168.4 | 278.8 | clean | cua PASS, cua:0ms **misses 27**, cua:dwell **misses 26** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 29/30 | 29/30 | 360.4 | 499.8 | 207.1 | 257 | 622.3 | **changed** | cua PASS, cua:0ms **misses 1**, cua:dwell **misses 1** |
| Chrome | canvas | 30/30 | 19/30 | 30/30 | 0/30 | 1/30 | 517 | 646.3 | 171.5 | 236.3 | 1147.6 | clean | cua PASS, cua:0ms **misses 30**, cua:dwell **misses 29** |
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 29/30 | 28/30 | 321.9 | 255.4 | 123.1 | 183.6 | 462.9 | clean | cua PASS, cua:0ms **misses 1**, cua:dwell **misses 2** |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 323.8 | 276.2 | 128.5 | 189 | 507.7 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 3/30 | 6/30 | 262.3 | 145.6 | 108.3 | 168.8 | 282.2 | clean | cua PASS, cua:0ms **misses 27**, cua:dwell **misses 24** |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 28/30 | 29/30 | 357.9 | 508.1 | 196.3 | 294.6 | 621.3 | clean | cua PASS, cua:0ms **misses 2**, cua:dwell **misses 1** |
| Electron (cua fixture) | canvas | 30/30 | 23/30 | 30/30 | 0/30 | 0/30 | 512.2 | 648.6 | 175.4 | 241.9 | 1146.1 | clean | cua PASS, cua:0ms **misses 30**, cua:dwell **misses 30** |
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 330.3 | 250.4 | 131.1 | 184.7 | 467.4 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 334.2 | 277.7 | 137.1 | 188.6 | 519.4 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 268.3 | 170.8 | 115.4 | 169.3 | 289.9 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | dnd | 29/30 | 30/30 | 30/30 | 2/30 | 11/30 | 363.3 | 463.1 | 202.4 | 268.7 | 619.3 | clean | cua PASS, cua:0ms **misses 27**, cua:dwell **misses 18** |
| Firefox | canvas | 30/30 | 23/30 | 30/30 | 1/30 | 1/30 | 527.2 | 553 | 187.9 | 237.6 | 1195.7 | clean | cua PASS, cua:0ms **misses 29**, cua:dwell **misses 29** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms, cua:dwell); chrome dnd (cua:0ms, cua:dwell); chrome canvas (cua:0ms, cua:dwell); electron select (cua:0ms, cua:dwell); electron scroller (cua:0ms, cua:dwell); electron dnd (cua:0ms, cua:dwell); electron canvas (cua:0ms, cua:dwell); firefox dnd (cua:0ms, cua:dwell); firefox canvas (cua:0ms, cua:dwell).

## m1a4-vendor-js

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 146.1 | 115.5 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 134.1 | 113.6 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 13.6 | 7.3 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 134.1 | 113.6 | | | | | | | | | |
| desktop | list_apps | pinned | 129.5 | 123.8 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | newest | 126 | 133.5 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | cua | 14 | 8.9 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_apps | **bar** | 126 | 123.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 34.8 | 28.6 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | newest | 34.6 | 29.5 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | cua | 39.6 | 24.6 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | get_screenshot | **bar** | 34.6 | 28.6 | | | | | | | | | |
| desktop | launch_app | pinned | 5.3 | 0.9 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | newest | 7.9 | 0.9 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | cua | 4.6 | 0.8 | 21 | – | – | – | – | – | 24/24 | 24/24 | PASS |
| desktop | launch_app | **bar** | 5.3 | 0.9 | | | | | | | | | |
| gedit | tree | pinned | 620.2 | 627.7 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | newest | 628.4 | 587.2 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | cua | 97.6 | 81.7 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree | **bar** | 620.2 | 587.2 | | | | | | | | | |
| gedit | tree_shot | pinned | 800.5 | 740.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | newest | 732.3 | 745.8 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | cua | 140.2 | 109.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 732.3 | 740.9 | | | | | | | | | |
| gedit | press_key | pinned | 274.8 | 269.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 241.3 | 235.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 108.6 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 241.3 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 219.5 | 215.2 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 222.6 | 216.5 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 122.8 | 114.6 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 219.5 | 215.2 | | | | | | | | | |
| chrome | tree | pinned | 523.6 | 493.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | newest | 506.1 | 493.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | cua | 90.9 | 65.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree | **bar** | 506.1 | 493.4 | | | | | | | | | |
| chrome | tree_shot | pinned | 578.4 | 622.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | newest | 569.3 | 590.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | cua | 124.3 | 90.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 569.3 | 590.4 | | | | | | | | | |
| chrome | press_key | pinned | 274.7 | 269.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 241.5 | 236.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 108.6 | 101.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 241.5 | 236.4 | | | | | | | | | |
| chrome | click | pinned | 221.1 | 215.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 221.6 | 215.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 120.5 | 113.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 221.1 | 215.5 | | | | | | | | | |
| chrome-input | click_element | pinned | 347.6 | 371.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | newest | 418.6 | 366.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | click_element | cua | 137.7 | 135.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | click_element | **bar** | 347.6 | 366.4 | | | | | | | | | |
| chrome-input | right_click | pinned | 395.2 | 375.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | newest | 434.1 | 394 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click | cua | 153.7 | 151.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click | **bar** | 395.2 | 375.6 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 782.8 | 741.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | newest | 770.8 | 754.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | right_click_fallback | cua | 246.1 | 239.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | right_click_fallback | **bar** | 770.8 | 741.3 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 346.4 | 378.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | newest | 351.2 | 356.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | secondary_action | cua | 137 | 136.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | secondary_action | **bar** | 346.4 | 356.2 | | | | | | | | | |
| chrome-input | move | pinned | 202.8 | 202.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | newest | 204.7 | 203.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | move | cua | 103.9 | 101.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | move | **bar** | 202.8 | 202.4 | | | | | | | | | |
| chrome-input | drag | pinned | 707.5 | 706.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | newest | 411.1 | 412 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | drag | cua | 398 | 388.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | drag | **bar** | 411.1 | 412 | | | | | | | | | |
| chrome-input | scroll | pinned | 311.6 | 311.2 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | newest | 312.8 | 312.2 | 15 | – | – | – | 18/18 | clean | 12/18 | 18/18 |  |
| chrome-input | scroll | cua | 211.9 | 210.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | scroll | **bar** | 311.6 | 311.2 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 356 | 357.5 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | newest | 354 | 360.5 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| chrome-input | scroll_element_hidden | cua | 138.6 | 137.4 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| chrome-input | scroll_element_hidden | **bar** | 354 | 357.5 | | | | | | | | | |
| chrome-input | key_down | pinned | 235.9 | 235.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | newest | 202.7 | 202.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_down | cua | 3.3 | 0.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_down | **bar** | 202.7 | 202.3 | | | | | | | | | |
| chrome-input | key_up | pinned | 134.2 | 134.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | newest | 101.1 | 101.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-input | key_up | cua | 100.9 | 100.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-input | key_up | **bar** | 101.1 | 101.2 | | | | | | | | | |
| chrome-input | activate_window | pinned | 0.6 | 0.7 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | newest | 0.6 | 0.6 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 |  |
| chrome-input | activate_window | cua | 0.6 | 0.5 | 15 | – | – | – | 0/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 18/18 | 18/18 | PASS |
| chrome-input | activate_window | **bar** | 0.6 | 0.6 | | | | | | | | | |
| over-budget | tree | pinned | 7238.7 | 7562.3 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | newest | 6719.3 | 7302.2 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | cua | 1043.4 | 990.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6719.3 | 7302.2 | | | | | | | | | |
| big-text | tree | pinned | 671.2 | 623.7 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| big-text | tree | newest | 649.9 | 649 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| big-text | tree | cua | 231.1 | 237.9 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| big-text | tree | **bar** | 649.9 | 623.7 | | | | | | | | | |
| gtk-table | tree | pinned | 298.1 | 314.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gtk-table | tree | newest | 324.7 | 357.1 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gtk-table | tree | cua | 97.2 | 90 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| gtk-table | tree | **bar** | 298.1 | 314.4 | | | | | | | | | |
| calc | tree | pinned | 3638.8 | 3753.1 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| calc | tree | newest | 3813.7 | 3683.8 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| calc | tree | cua | 810.7 | 758 | 21 | – | – | – | 24/24 | clean | – | 24/24 | PASS |
| calc | tree | **bar** | 3638.8 | 3683.8 | | | | | | | | | |
| retention | after_resize | pinned | 595.7 | 669.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 750.2 | 652.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 83.6 | 92.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 595.7 | 652.6 | | | | | | | | | |
| retention | after_remap | pinned | 597.6 | 671.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 570.1 | 621.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 92.1 | 100.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 570.1 | 621.9 | | | | | | | | | |
| retention | after_covered_change | pinned | 619.4 | 607.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 626.8 | 613.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 107.5 | 98 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 619.4 | 607.9 | | | | | | | | | |

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

run valid; every verdict PASS, finished 2026-10-29T11:19:51.041Z

## m1a4-events (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | click | first | 3 | 87.8 | 88.1 | 87.2 | yes |
| desktop | click | later | 1 | 158.4 | 92.3 | 25.1 | yes |
| desktop | drag_handle | first | 2 | 38.7 | 38.2 | 38.1 | yes |
| desktop | drag_handle | later | 2 | 32.9 | 30.1 | 33.2 | **no** |
| desktop | drag | first | 2 | 332.1 | 109.7 | 49.4 | yes |
| desktop | key_down | first | 4 | 52.2 | 2.2 | 1.1 | yes |
| desktop | key_down | later | 1 | 34 | 0.6 | 0.2 | yes |
| desktop | key_up | later | 5 | 33.5 | 0.2 | 0.1 | yes |
| desktop | move_relative | first | 1 | 1.6 | 2.5 | 1 | yes |
| desktop | move_relative | later | 2 | 33.8 | 17.3 | 0.2 | yes |
| desktop | move | first | 1 | 84.6 | 85 | 83.4 | yes |
| desktop | move | later | 2 | 37.9 | 20.4 | 4.4 | yes |
| desktop | press_key | first | 7 | 68.7 | 35.6 | 1 | yes |
| desktop | press_key | later | 1 | 67.2 | 34.1 | 0.3 | yes |
| desktop | scroll | first | 1 | 74.5 | 75.7 | 73.8 | yes |
| desktop | scroll | later | 1 | 440.8 | 407.4 | 373.9 | yes |
| window | activate_window | first | 1 | 1.7 | 1.5 | 1 | yes |
| window | click | first | 7 | 215.7 | 216.8 | 114.9 | yes |
| window | click | later | 5 | 113.2 | 113.9 | 13 | yes |
| window | drag | first | 2 | 601.6 | 310.2 | 145.9 | yes |
| window | drag | later | 3 | 202.2 | 202.1 | 100.9 | yes |
| window | key_down | first | 12 | 236.6 | 203.5 | 2.4 | yes |
| window | key_down | later | 4 | 67.1 | 50.6 | 0.1 | yes |
| window | key_up | first | 1 | 1.2 | 1.2 | 0.9 | yes |
| window | key_up | later | 15 | 134.1 | 100.9 | 100.5 | yes |
| window | launch_app | first | 1 | 1.2 | 1.3 | 0.9 | yes |
| window | launch_app | later | 4 | 0.2 | 0.3 | 0.2 | yes |
| window | move | first | 2 | 203.9 | 205.4 | 103.5 | yes |
| window | move | later | 4 | 100.9 | 102.1 | 0.4 | yes |
| window | press_key | first | 33 | 336.8 | 237.8 | 103.4 | yes |
| window | press_key | later | 3 | 167.9 | 134.4 | 0.2 | yes |
| window | scroll | first | 3 | 240.6 | 245.1 | 139.5 | yes |
| window | scroll | later | 6 | 203.1 | 202.5 | 101.3 | yes |

## m1a4-vendor-js-desktop (experiment events)

Through OpenAI's JavaScript client (the desktop-only commands, well-formed requests, effects read back):

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| desktop move_relative | same | same | 2/2 / 2/2 / 2/2 |
| drag_handle | differs at step 0 (event) | same | 3/3 / 3/3 / 3/3 |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest; through the client they include its deferred settle, so they are recorded, not judged):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | drag_handle | first | 1 | 77.2 | 76.8 | 77.7 | **no** |
| desktop | drag_handle | later | 2 | 125.7 | 122 | 124.7 | **no** |
| desktop | move_relative | first | 1 | 5.4 | 3.9 | 2.6 | yes |
| desktop | move_relative | later | 1 | 160.4 | 127.7 | 94.3 | yes |

## m1a4-matrix-covered (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-covered |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m1a4-matrix-covered |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-covered |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-covered |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-covered |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-covered |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-covered |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m1a4-matrix-covered |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m1a4-matrix-covered |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m1a4-matrix-covered |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 4/5 | 5/5 / 0/5 |  | clean | partial: partial | m1a4-matrix-covered |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 0/5 | 5/5 / 0/5 |  | clean | partial: partial | m1a4-matrix-covered |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-covered |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m1a4-matrix-covered |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m1a4-matrix-covered |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-covered |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m1a4-matrix-covered`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `m1a4-matrix-covered`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m1a4-matrix-covered`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m1a4-matrix-covered`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m1a4-matrix-covered`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 kate | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 qtcreator | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / clean | PASS |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| Electron (cua fixture) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gen, X11 only) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / clean | PASS |
| xterm, allowSendEvents on | clean / clean / clean | clean / clean / clean | PASS |

The run is complete.

## m1a4-matrix-visible (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m1a4-matrix-visible |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-visible |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m1a4-matrix-visible |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-visible |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m1a4-matrix-visible |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m1a4-matrix-visible |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m1a4-matrix-visible |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m1a4-matrix-visible |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m1a4-matrix-visible |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m1a4-matrix-visible |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m1a4-matrix-visible |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m1a4-matrix-visible |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m1a4-matrix-visible |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m1a4-matrix-visible |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m1a4-matrix-visible`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m1a4-matrix-visible`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m1a4-matrix-visible`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m1a4-matrix-visible`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 kate | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 qtcreator | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / clean | PASS |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| Electron (cua fixture) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gen, X11 only) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / clean | PASS |
| xterm, allowSendEvents on | clean / clean / clean | clean / clean / clean | PASS |

The run is complete.

## m1a4-drag (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | newest took | cua took | cua:0ms took | cua:dwell took | newest drag ms | cua drag ms | cua:0ms drag ms | cua:dwell drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 29/30 | 30/30 | 322.7 | 252.1 | 122.2 | 181.5 | 465.8 | clean | cua PASS, cua:0ms **misses 1**, cua:dwell PASS |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 325.2 | 280.2 | 126.6 | 186.1 | 506.9 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Chrome | scroller | 30/30 | 30/30 | 29/30 | 3/30 | 0/30 | 262.7 | 145.8 | 108.1 | 168.1 | 279.9 | clean | cua **misses 1**, cua:0ms **misses 27**, cua:dwell **misses 30** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 361 | 500.4 | 211.6 | 279.7 | 626.9 | **changed** | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Chrome | canvas | 30/30 | 20/30 | 30/30 | 0/30 | 0/30 | 512.8 | 665 | 175.8 | 235.4 | 1155 | clean | cua PASS, cua:0ms **misses 30**, cua:dwell **misses 30** |
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 330.6 | 210.8 | 135.7 | 182.5 | 475 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 335 | 235.2 | 137.8 | 190.1 | 519.4 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 270.2 | 137.1 | 115.1 | 169.8 | 288.8 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 2/30 | 9/30 | 366 | 421 | 190.9 | 260.5 | 620.9 | clean | cua PASS, cua:0ms **misses 28**, cua:dwell **misses 21** |
| Firefox | canvas | 30/30 | 24/30 | 29/30 | 0/30 | 3/30 | 534.9 | 480.5 | 186.5 | 245.2 | 1207.7 | clean | cua **misses 1**, cua:0ms **misses 30**, cua:dwell **misses 27** |
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 29/30 | 29/30 | 321.9 | 253.3 | 122.7 | 182.5 | 459.7 | clean | cua PASS, cua:0ms **misses 1**, cua:dwell **misses 1** |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 325.5 | 280.8 | 128.4 | 190.1 | 509.8 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 2/30 | 3/30 | 262.3 | 146 | 108.5 | 168.5 | 278.5 | clean | cua PASS, cua:0ms **misses 28**, cua:dwell **misses 27** |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 29/30 | 29/30 | 357 | 511.9 | 219.5 | 298.5 | 627 | clean | cua PASS, cua:0ms **misses 1**, cua:dwell **misses 1** |
| Electron (cua fixture) | canvas | 30/30 | 22/30 | 30/30 | 1/30 | 1/30 | 512.6 | 644.5 | 178.8 | 239.9 | 1159.3 | clean | cua PASS, cua:0ms **misses 29**, cua:dwell **misses 29** |
| GTK3 gedit | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 317.3 | 121.1 | 122.5 | 181.6 | 403.4 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| GTK3 gedit | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 317.5 | 118.8 | 118.5 | 182.1 | 398.8 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| GTK 3 scale (harness scene) | scale | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 330.2 | 135.5 | 138.6 | 198.1 | 625.8 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| GTK4 gnome-text-editor | select | 0/30 | 0/30 | 0/30 | 0/30 | 0/30 | 318.6 | 118.4 | 118.3 | 178.1 | 416.2 | clean | no pinned effect: not judged |
| Qt 5 kate | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 300.3 | 124.8 | 129.7 | 190 | 361 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Qt 5 kate | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 346.3 | 149.6 | 145 | 226.5 | 551.3 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Qt 6 qtcreator | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 300.7 | 118.7 | 117.5 | 177.6 | 373.3 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| Qt 6 qtcreator | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 316.9 | 159.3 | 154.1 | 221.4 | 410.4 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| LibreOffice Writer (gtk3) | select | 29/30 | 29/30 | 29/30 | 29/30 | 29/30 | 307.8 | 117.4 | 117.1 | 175.3 | 373.9 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |
| xterm | select | 30/30 | 30/30 | 29/30 | 30/30 | 30/30 | 288 | 137.7 | 137.8 | 195.1 | 329.3 | clean | cua **misses 1**, cua:0ms PASS, cua:dwell PASS |
| xterm, allowSendEvents on | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 286.2 | 137.4 | 139.9 | 194.1 | 332 | clean | cua PASS, cua:0ms PASS, cua:dwell PASS |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua, cua:0ms, cua:dwell); chrome canvas (cua:0ms, cua:dwell); firefox dnd (cua:0ms, cua:dwell); firefox canvas (cua, cua:0ms, cua:dwell); electron select (cua:0ms, cua:dwell); electron scroller (cua:0ms, cua:dwell); electron dnd (cua:0ms, cua:dwell); electron canvas (cua:0ms, cua:dwell); xterm select (cua).

## m1a4-drag-tune (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | cua:0ms took | cua:c500r20 took | cua:c300r30 took | cua:c250r40 took | cua:s500 took | cua drag ms | cua:0ms drag ms | cua:c500r20 drag ms | cua:c300r30 drag ms | cua:c250r40 drag ms | cua:s500 drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 30/30 | 30/30 | 29/30 | 30/30 | 30/30 | 30/30 | 30/30 | 256.9 | 123.5 | 273.3 | 240.6 | 239.6 | 255.3 | 466.3 | clean | cua PASS, cua:0ms **misses 1**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 PASS |
| Chrome | scroller | 30/30 | 6/30 | 0/30 | 30/30 | 6/30 | 10/30 | 6/30 | 146.1 | 107.6 | 165.4 | 163.3 | 170.1 | 146.1 | 279.3 | clean | cua **misses 24**, cua:0ms **misses 30**, cua:c500r20 PASS, cua:c300r30 **misses 24**, cua:c250r40 **misses 20**, cua:s500 **misses 24** |
| Chrome | dnd | 30/30 | 30/30 | 29/30 | 30/30 | 30/30 | 30/30 | 30/30 | 480.1 | 194.5 | 528.1 | 465.1 | 422.8 | 486.6 | 622.5 | **changed** | cua PASS, cua:0ms **misses 1**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 PASS |
| Chrome | canvas | 30/30 | 30/30 | 0/30 | 30/30 | 29/30 | 28/30 | 30/30 | 656.6 | 175.6 | 673 | 517.7 | 485.1 | 664.9 | 1140.6 | clean | cua PASS, cua:0ms **misses 30**, cua:c500r20 PASS, cua:c300r30 **misses 1**, cua:c250r40 **misses 2**, cua:s500 PASS |
| Electron (cua fixture) | select | 30/30 | 30/30 | 29/30 | 30/30 | 30/30 | 30/30 | 30/30 | 257.7 | 125.1 | 273.9 | 241.8 | 239.2 | 254.1 | 466.2 | clean | cua PASS, cua:0ms **misses 1**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 PASS |
| Electron (cua fixture) | scroller | 30/30 | 18/30 | 1/30 | 4/30 | 10/30 | 21/30 | 29/30 | 145.2 | 109.9 | 167.8 | 162.6 | 169.5 | 145.9 | 278.9 | clean | cua **misses 12**, cua:0ms **misses 29**, cua:c500r20 **misses 26**, cua:c300r30 **misses 20**, cua:c250r40 **misses 9**, cua:s500 **misses 1** |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 27/30 | 30/30 | 30/30 | 30/30 | 30/30 | 509.5 | 220.8 | 522.7 | 518.9 | 530.2 | 507.4 | 617.8 | clean | cua PASS, cua:0ms **misses 3**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 PASS |
| Electron (cua fixture) | canvas | 30/30 | 30/30 | 0/30 | 30/30 | 30/30 | 28/30 | 30/30 | 651.9 | 179.5 | 670.2 | 518.5 | 491.7 | 648.1 | 1143.1 | clean | cua PASS, cua:0ms **misses 30**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 **misses 2**, cua:s500 PASS |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua, cua:0ms, cua:c300r30, cua:c250r40, cua:s500); chrome dnd (cua:0ms); chrome canvas (cua:0ms, cua:c300r30, cua:c250r40); electron select (cua:0ms); electron scroller (cua, cua:0ms, cua:c500r20, cua:c300r30, cua:c250r40, cua:s500); electron dnd (cua:0ms); electron canvas (cua:0ms, cua:c250r40).

## m1a4-drag-tune-gecko (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | cua:0ms took | cua:c500r20 took | cua:c300r30 took | cua:c250r40 took | cua:s500 took | cua drag ms | cua:0ms drag ms | cua:c500r20 drag ms | cua:c300r30 drag ms | cua:c250r40 drag ms | cua:s500 drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Firefox | dnd | 30/30 | 29/30 | 7/30 | 30/30 | 30/30 | 30/30 | 29/30 | 434 | 195.7 | 491.2 | 475.2 | 472.5 | 466.9 | 625.1 | clean | cua **misses 1**, cua:0ms **misses 23**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 **misses 1** |
| Firefox | canvas | 30/30 | 30/30 | 1/30 | 30/30 | 30/30 | 30/30 | 30/30 | 486.1 | 188.1 | 715.2 | 553.2 | 517.2 | 678.9 | 1190.8 | clean | cua PASS, cua:0ms **misses 29**, cua:c500r20 PASS, cua:c300r30 PASS, cua:c250r40 PASS, cua:s500 PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua, cua:0ms, cua:s500); firefox canvas (cua:0ms).

## m1a4-drag-xterm (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | cua:0ms took | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| xterm | select | 30/30 | 30/30 | 30/30 | 137.9 | 137 | 335.5 | clean | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 30/30 | 30/30 | 30/30 | 136.4 | 137.7 | 335 | clean | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

## m1a4-drag-scroller (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | cua:0ms took | cua:s500 took | cua:c500r20 took | cua:c400r20 took | cua:c300r30 took | cua drag ms | cua:0ms drag ms | cua:s500 drag ms | cua:c500r20 drag ms | cua:c400r20 drag ms | cua:c300r30 drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | scroller | 30/30 | 30/30 | 5/30 | 30/30 | 30/30 | 27/30 | 28/30 | 145.6 | 107.8 | 145.9 | 166.4 | 159.6 | 163.1 | 279.1 | clean | cua PASS, cua:0ms **misses 25**, cua:s500 PASS, cua:c500r20 PASS, cua:c400r20 **misses 3**, cua:c300r30 **misses 2** |
| Electron (cua fixture) | scroller | 30/30 | 29/30 | 2/30 | 30/30 | 30/30 | 28/30 | 22/30 | 144.8 | 108.3 | 145.7 | 166.3 | 158.8 | 163 | 278.6 | clean | cua **misses 1**, cua:0ms **misses 28**, cua:s500 PASS, cua:c500r20 PASS, cua:c400r20 **misses 2**, cua:c300r30 **misses 8** |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 138.1 | 114.8 | 154.2 | 175.2 | 167.6 | 171.2 | 290.3 | clean | cua PASS, cua:0ms PASS, cua:s500 PASS, cua:c500r20 PASS, cua:c400r20 PASS, cua:c300r30 PASS |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms, cua:c400r20, cua:c300r30); electron scroller (cua, cua:0ms, cua:c400r20, cua:c300r30).

## m1a4-scroll-covered

commit 6271419fed15d534b441884900b9759a0ff20970; cua-engine 0.0.1 (a1b6d62b6171); occlusion covered; 5 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, focus, active); no X request audit in this run

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | scroll | pinned | 314.4 | 311.4 | 25 | – | – | – | 30/30 | – | 21/30 | 30/30 |  |
| chrome-input | scroll | newest | 316 | 312 | 25 | – | – | – | 30/30 | – | 20/30 | 30/30 |  |
| chrome-input | scroll | cua | 213.7 | 210.2 | 25 | – | – | – | 30/30 | – | 30/30 | 30/30 | PASS |
| chrome-input | scroll | **bar** | 314.4 | 311.4 | | | | | | | | | |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `type_characters is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

run valid; every verdict PASS, finished 2026-10-29T07:56:52.429Z

## m1a4-scroll-visible

commit 6271419fed15d534b441884900b9759a0ff20970; cua-engine 0.0.1 (a1b6d62b6171); occlusion visible; 5 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); no X request audit in this run

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | scroll | pinned | 315.5 | 312.1 | 25 | – | – | – | 30/30 | – | 30/30 | 30/30 |  |
| chrome-input | scroll | newest | 317.2 | 313.5 | 25 | – | – | – | 30/30 | – | 30/30 | 30/30 |  |
| chrome-input | scroll | cua | 214.9 | 210.2 | 25 | – | – | – | 30/30 | – | 30/30 | 30/30 | PASS |
| chrome-input | scroll | **bar** | 315.5 | 312.1 | | | | | | | | | |

Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):

| command | cua answered | declared | verdict |
|---|---|---|---|
| type_text | `type_text is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| type_characters | `type_characters is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_read | `clipboard_read is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_write | `clipboard_write is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |
| clipboard_release | `clipboard_release is not available in this engine build` | Plan of Work, M1a, Decisions; M2 | PASS |

run valid; every verdict PASS, finished 2026-10-29T07:58:30.691Z

## m1a4-shot-1

commit 8b03626db77fa0852e46cdc67eb265b7b0fbed1c; cua-engine 0.0.1 (a1b6d62b6171); occlusion covered; 6 blocks; 20 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 39.2 | 28 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | newest | 40.5 | 29.1 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | cua | 35.9 | 24.1 | 120 | – | – | – | – | – | – | 126/126 | PASS |
| desktop | get_screenshot | **bar** | 39.2 | 28 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 126/126 | 0 | 0 |  |
| desktop | newest | 126/126 | 28 | 0.0073 |  |
| desktop | cua | 126/126 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T04:09:05.874Z

## m1a4-shot-2

commit 8b03626db77fa0852e46cdc67eb265b7b0fbed1c; cua-engine 0.0.1 (a1b6d62b6171); occlusion covered; 6 blocks; 20 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 37.5 | 27.6 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | newest | 38.1 | 28.9 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | cua | 37.4 | 23.8 | 120 | – | – | – | – | – | – | 126/126 | PASS |
| desktop | get_screenshot | **bar** | 37.5 | 27.6 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 126/126 | 0 | 0 |  |
| desktop | newest | 126/126 | 28 | 0.0073 |  |
| desktop | cua | 126/126 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T04:51:41.800Z

## m1a4-shot-final-1

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 6 blocks; 20 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 35.7 | 28.3 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | newest | 40.3 | 28.7 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | cua | 37.1 | 23.8 | 120 | – | – | – | – | – | – | 126/126 | FAIL: cua: cold 37.1 ms > bar 35.7 ms |
| desktop | get_screenshot | **bar** | 35.7 | 28.3 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 126/126 | 0 | 0 |  |
| desktop | newest | 126/126 | 28 | 0.0073 |  |
| desktop | cua | 126/126 | 28 | 0.0073 |  |

run valid; **FAIL**: desktop get_screenshot cua, finished 2026-10-29T08:27:18.551Z

## m1a4-shot-final-2

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 6 blocks; 20 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 35.8 | 27.9 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | newest | 39.3 | 28.7 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | cua | 37.8 | 24.3 | 120 | – | – | – | – | – | – | 126/126 | FAIL: cua: cold 37.8 ms > bar 35.8 ms |
| desktop | get_screenshot | **bar** | 35.8 | 27.9 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 126/126 | 0 | 0 |  |
| desktop | newest | 126/126 | 28 | 0.0073 |  |
| desktop | cua | 126/126 | 28 | 0.0073 |  |

run valid; **FAIL**: desktop get_screenshot cua, finished 2026-10-29T09:40:15.383Z

## m1a4-shot-final-3

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 6 blocks; 20 warm tree reads and 5 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 37.7 | 27.8 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | newest | 36.1 | 28.9 | 120 | – | – | – | – | – | – | 126/126 |  |
| desktop | get_screenshot | cua | 36.9 | 24.3 | 120 | – | – | – | – | – | – | 126/126 | FAIL: cua: cold 36.9 ms > bar 36.1 ms |
| desktop | get_screenshot | **bar** | 36.1 | 27.8 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 126/126 | 0 | 0 |  |
| desktop | newest | 126/126 | 28 | 0.0073 |  |
| desktop | cua | 126/126 | 28 | 0.0073 |  |

run valid; **FAIL**: desktop get_screenshot cua, finished 2026-10-29T11:20:12.493Z

## m1a4-cold-1

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 38.8 | 27.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.8 | 28.7 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 37.8 | 24.9 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 38.8 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 3.2 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.4 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.2 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T11:53:39.328Z

## m1a4-cold-2

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 37.6 | 28.1 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.8 | 29.3 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 36.8 | 24.7 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 37.6 | 28.1 | | | | | | | | | |
| desktop | launch_app | pinned | 3.3 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.2 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 2.9 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.2 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T11:57:13.155Z

## m1a4-cold-3

commit 7a86032088eae05ed6f20fd16c5c792a89ec8507; cua-engine 0.0.1 (7a86032088ea); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 38 | 27.9 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.3 | 28.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 34.3 | 24.4 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 38 | 27.9 | | | | | | | | | |
| desktop | launch_app | pinned | 3.5 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.2 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3.1 | 0.8 | 60 | – | – | – | – | – | 80/80 | 80/80 | FAIL: cua: warm 0.8 ms > bar 0.7 ms |
| desktop | launch_app | **bar** | 3.2 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; **FAIL**: desktop launch_app cua, finished 2026-10-29T12:00:46.770Z

## m1a4-cold-check

commit 4566caadde15c672aec68492869428f755f62885; cua-engine 0.0.1 (4566caadde15); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 37.8 | 27.9 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.7 | 29.1 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 36.5 | 24 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 37.8 | 27.9 | | | | | | | | | |
| desktop | launch_app | pinned | 3.2 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.4 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | FAIL: cua: warm 0.73 ms > bar 0.68 ms |
| desktop | launch_app | **bar** | 3.2 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; **FAIL**: desktop launch_app cua, finished 2026-10-29T12:07:30.137Z

## m1a4-cold-check2

commit 4566caadde15c672aec68492869428f755f62885; cua-engine 0.0.1 (4566caadde15); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 38.3 | 27.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.4 | 28.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 38 | 24.2 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 38.3 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 3.5 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.4 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.4 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T12:10:32.005Z

## m1a4-final-sitting-1

commit 2104e8cd856649f2a311245b8a82bf9289f51bf1; cua-engine 0.0.1 (2104e8cd8566); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 39.5 | 28.1 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.6 | 29 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 36.9 | 24.7 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 38.6 | 28.1 | | | | | | | | | |
| desktop | launch_app | pinned | 3.5 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.4 | 0.8 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 2.8 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.4 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T12:15:20.425Z

## m1a4-final-sitting-2

commit 2104e8cd856649f2a311245b8a82bf9289f51bf1; cua-engine 0.0.1 (2104e8cd8566); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 37.5 | 27.7 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.9 | 28.9 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 36.1 | 24.3 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 37.5 | 27.7 | | | | | | | | | |
| desktop | launch_app | pinned | 3.4 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.3 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3.1 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.3 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T13:29:21.987Z

## m1a4-final-sitting-3

commit 2104e8cd856649f2a311245b8a82bf9289f51bf1; cua-engine 0.0.1 (2104e8cd8566); occlusion covered; 20 blocks; 3 warm tree reads and 3 warm inputs per block

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | get_screenshot | pinned | 38.1 | 27.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | newest | 38.8 | 28.8 | 60 | – | – | – | – | – | – | 80/80 |  |
| desktop | get_screenshot | cua | 38.1 | 24.1 | 60 | – | – | – | – | – | – | 80/80 | PASS |
| desktop | get_screenshot | **bar** | 38.1 | 27.8 | | | | | | | | | |
| desktop | launch_app | pinned | 3.4 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | newest | 3.5 | 0.8 | 60 | – | – | – | – | – | 80/80 | 80/80 |  |
| desktop | launch_app | cua | 3.2 | 0.7 | 60 | – | – | – | – | – | 80/80 | 80/80 | PASS |
| desktop | launch_app | **bar** | 3.4 | 0.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 80/80 | 0 | 0 |  |
| desktop | newest | 80/80 | 28 | 0.0073 |  |
| desktop | cua | 80/80 | 28 | 0.0073 |  |

run valid; every verdict PASS, finished 2026-10-29T14:06:13.991Z

## m1a4-thumb-dwell (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | cua:0ms took | cua:r16 took | cua:r33 took | cua:r50 took | cua drag ms | cua:0ms drag ms | cua:r16 drag ms | cua:r33 drag ms | cua:r50 drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | scroller | 30/30 | 30/30 | 8/30 | 29/30 | 28/30 | 27/30 | 145.5 | 108.2 | 161.8 | 179 | 195.2 | 280.6 | clean | cua PASS, cua:0ms **misses 22**, cua:r16 **misses 1**, cua:r33 **misses 2**, cua:r50 **misses 3** |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 2/30 | 30/30 | 27/30 | 30/30 | 145.6 | 108.5 | 161.9 | 178.5 | 195.4 | 277.9 | clean | cua PASS, cua:0ms **misses 28**, cua:r16 PASS, cua:r33 **misses 3**, cua:r50 PASS |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms, cua:r16, cua:r33, cua:r50); electron scroller (cua:0ms, cua:r33).

## m1a4-events-br (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | click | first | 3 | 88.1 | 87.2 | 87.5 | **no** |
| desktop | click | later | 1 | 158.6 | 92 | 25.2 | yes |
| desktop | drag_handle | first | 2 | 39 | 40.4 | 39.9 | **no** |
| desktop | drag_handle | later | 2 | 33.1 | 30.6 | 0.6 | yes |
| desktop | drag | first | 2 | 343.7 | 116.8 | 64 | yes |
| desktop | key_down | first | 4 | 51.9 | 2.1 | 1 | yes |
| desktop | key_down | later | 1 | 33.8 | 0.5 | 0.2 | yes |
| desktop | key_up | later | 5 | 33.3 | 0.1 | 0.1 | yes |
| desktop | move_relative | first | 1 | 1.4 | 2.2 | 0.9 | yes |
| desktop | move_relative | later | 2 | 33.7 | 17.1 | 0.2 | yes |
| desktop | move | first | 1 | 83.6 | 85.9 | 83.7 | **no** |
| desktop | move | later | 2 | 38 | 20.2 | 4.5 | yes |
| desktop | press_key | first | 7 | 69 | 35.6 | 1.2 | yes |
| desktop | press_key | later | 1 | 67.1 | 33.9 | 0.2 | yes |
| desktop | scroll | first | 1 | 74 | 75.1 | 74.5 | **no** |
| desktop | scroll | later | 1 | 441.8 | 407.7 | 375 | yes |
| window | activate_window | first | 1 | 3.7 | 3 | 1.4 | yes |
| window | click | first | 7 | 215.9 | 217.1 | 115.3 | yes |
| window | click | later | 5 | 113.6 | 113.7 | 12.8 | yes |
| window | drag | first | 2 | 584.4 | 309.7 | 129.5 | yes |
| window | drag | later | 3 | 202.2 | 201.8 | 100.9 | yes |
| window | key_down | first | 12 | 238.1 | 203.4 | 2.7 | yes |
| window | key_down | later | 4 | 67.3 | 50.5 | 0.2 | yes |
| window | key_up | first | 1 | 1.1 | 1.1 | 0.9 | yes |
| window | key_up | later | 15 | 134.1 | 101 | 100.5 | yes |
| window | launch_app | first | 1 | 2.3 | 2.5 | 2 | yes |
| window | launch_app | later | 4 | 0.4 | 0.4 | 0.3 | yes |
| window | move | first | 2 | 204.4 | 204.6 | 103.8 | yes |
| window | move | later | 4 | 100.8 | 101.7 | 0.3 | yes |
| window | press_key | first | 33 | 337.2 | 237.9 | 103 | yes |
| window | press_key | later | 3 | 167.8 | 134.4 | 0.3 | yes |
| window | scroll | first | 3 | 240.9 | 242 | 139.6 | yes |
| window | scroll | later | 6 | 202.5 | 202.7 | 100.9 | yes |

cua is slower than the faster vendor build over the wire: desktop click first, desktop drag_handle first, desktop move first, desktop scroll first.

## m1a4-vendor-js-desktop-br (experiment events)

Through OpenAI's JavaScript client (the desktop-only commands, well-formed requests, effects read back):

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| desktop move_relative | same | same | 2/2 / 2/2 / 2/2 |
| drag_handle | differs at step 0 (event) | same | 3/3 / 3/3 / 3/3 |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest; through the client they include its deferred settle, so they are recorded, not judged):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | drag_handle | first | 1 | 78.2 | 80.9 | 77.7 | yes |
| desktop | drag_handle | later | 2 | 122.9 | 118 | 89 | yes |
| desktop | move_relative | first | 1 | 5.9 | 7 | 2.4 | yes |
| desktop | move_relative | later | 1 | 162.3 | 124.3 | 94 | yes |

## m1a4-events-br2 (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms over every scenario step; `first` is the request after the engine started, `later` the rest):

| route | command | series | n | pinned | newest | cua | cua at or below the faster |
|---|---|---|---:|---:|---:|---:|---|
| desktop | click | first | 3 | 87.5 | 87.2 | 87 | yes |
| desktop | click | later | 1 | 158.7 | 91.9 | 24.9 | yes |
| desktop | drag_handle | first | 2 | 40.9 | 38.5 | 38 | yes |
| desktop | drag_handle | later | 2 | 33 | 30.2 | 0.4 | yes |
| desktop | drag | first | 2 | 331.1 | 109.5 | 51.3 | yes |
| desktop | key_down | first | 4 | 52.2 | 2.7 | 1.3 | yes |
| desktop | key_down | later | 1 | 34.2 | 0.9 | 0.2 | yes |
| desktop | key_up | later | 5 | 33.4 | 0.2 | 0.1 | yes |
| desktop | move_relative | first | 1 | 1.7 | 2.5 | 1.2 | yes |
| desktop | move_relative | later | 2 | 33.8 | 17.3 | 0.3 | yes |
| desktop | move | first | 1 | 84.3 | 85.9 | 83.4 | yes |
| desktop | move | later | 2 | 38 | 20.3 | 4.4 | yes |
| desktop | press_key | first | 7 | 69.4 | 36.2 | 1.2 | yes |
| desktop | press_key | later | 1 | 67.4 | 34.1 | 0.3 | yes |
| desktop | scroll | first | 1 | 74.1 | 75.7 | 73.6 | yes |
| desktop | scroll | later | 1 | 440.2 | 407.9 | 373.4 | yes |
| window | activate_window | first | 1 | 1.7 | 1.9 | 0.9 | yes |
| window | click | first | 7 | 216.3 | 217.7 | 115.4 | yes |
| window | click | later | 5 | 113.1 | 113.6 | 12.8 | yes |
| window | drag | first | 2 | 583.8 | 308.8 | 124.2 | yes |
| window | drag | later | 3 | 202.3 | 202.5 | 100.9 | yes |
| window | key_down | first | 12 | 236.4 | 203.2 | 2.3 | yes |
| window | key_down | later | 4 | 67.1 | 50.6 | 0.2 | yes |
| window | key_up | first | 1 | 1.4 | 1.6 | 1 | yes |
| window | key_up | later | 15 | 134.1 | 100.9 | 100.5 | yes |
| window | launch_app | first | 1 | 1.4 | 1.5 | 1.1 | yes |
| window | launch_app | later | 4 | 0.3 | 0.4 | 0.2 | yes |
| window | move | first | 2 | 203.4 | 205.6 | 102.8 | yes |
| window | move | later | 4 | 100.8 | 101.9 | 0.4 | yes |
| window | press_key | first | 33 | 336.9 | 237.6 | 103.1 | yes |
| window | press_key | later | 3 | 167.7 | 134.3 | 0.3 | yes |
| window | scroll | first | 3 | 241.5 | 242.7 | 141.3 | yes |
| window | scroll | later | 6 | 203 | 202.9 | 101.3 | yes |

## m1a4-events-gate (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 31 interleaved fresh engines per engine and sequence, its scenarios' own beside them; a group is judged only with 20 samples an engine; `first` above the bar with a bootstrap 95% interval of cua minus the faster build that includes 0 is the same within noise):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 93 | 87.01 | 86.53 | 86.69 | [-0.46, 0.72] | **same (within noise)** |
| desktop | click | first in a scenario | 3 | 87.68 | 87.73 | 87.32 | – | too few samples, not judged |
| desktop | click | later | 124 | 46.45 | 30.1 | 12.75 | [-33.89, -0.53] | pass |
| desktop | click | later in a scenario | 1 | 158.52 | 91.98 | 25.17 | – | too few samples, not judged |
| desktop | drag_handle | first | 62 | 37.85 | 38.5 | 37.49 | [-74.06, 73.43] | pass |
| desktop | drag_handle | first in a scenario | 2 | 38.4 | 38.02 | 38.74 | – | too few samples, not judged |
| desktop | drag_handle | later | 124 | 32.99 | 30.44 | 0.51 | [-59.81, 0.155] | pass |
| desktop | drag_handle | later in a scenario | 2 | 34.1 | 30.48 | 0.39 | – | too few samples, not judged |
| desktop | drag | first | 62 | 324.82 | 106.47 | 47.42 | [-213.15, 96.15] | pass |
| desktop | drag | first in a scenario | 2 | 336.87 | 110.2 | 55.45 | – | too few samples, not judged |
| desktop | drag | later | 62 | 328.79 | 111.02 | 50.23 | [-222.61, 103.01] | pass |
| desktop | key_down | first | 124 | 51.57 | 1.44 | 0.59 | [-0.89, -0.79] | pass |
| desktop | key_down | first in a scenario | 4 | 52.07 | 2.09 | 1.02 | – | too few samples, not judged |
| desktop | key_down | later | 155 | 34.1 | 0.63 | 0.2 | [-0.46, -0.41] | pass |
| desktop | key_down | later in a scenario | 1 | 33.96 | 0.59 | 0.21 | – | too few samples, not judged |
| desktop | key_up | later | 124 | 33.52 | 0.17 | 0.16 | [-0.03, 0.005] | pass |
| desktop | key_up | later in a scenario | 5 | 33.42 | 0.15 | 0.14 | – | too few samples, not judged |
| desktop | move_relative | first | 31 | 0.7 | 1.52 | 0.47 | [-0.3, -0.16] | pass |
| desktop | move_relative | first in a scenario | 1 | 1.74 | 2.57 | 1.02 | – | too few samples, not judged |
| desktop | move_relative | later | 93 | 0.28 | 0.67 | 0.15 | [-0.17, -0.07] | pass |
| desktop | move_relative | later in a scenario | 2 | 33.78 | 17.48 | 0.21 | – | too few samples, not judged |
| desktop | move | first | 31 | 82.91 | 83.82 | 82.67 | [-0.64, -0.09] | pass |
| desktop | move | first in a scenario | 1 | 83.9 | 86.89 | 83.32 | – | too few samples, not judged |
| desktop | move | later | 93 | 8.56 | 6.05 | 8.45 | [2.27, 2.59] | **fail** |
| desktop | move | later in a scenario | 2 | 37.92 | 20.35 | 4.38 | – | too few samples, not judged |
| desktop | press_key | first | 217 | 68.29 | 34.73 | 0.64 | [-34.13, -34.03] | pass |
| desktop | press_key | first in a scenario | 7 | 68.79 | 35.35 | 1.18 | – | too few samples, not judged |
| desktop | press_key | later | 248 | 67.55 | 34.18 | 0.3 | [-33.915, -33.84] | pass |
| desktop | press_key | later in a scenario | 1 | 67.45 | 33.9 | 0.24 | – | too few samples, not judged |
| desktop | scroll | first | 31 | 73.45 | 74.33 | 73.22 | [-0.38, -0.06] | pass |
| desktop | scroll | first in a scenario | 1 | 74.24 | 77.89 | 75.74 | – | too few samples, not judged |
| desktop | scroll | later | 62 | 256.18 | 240.11 | 223 | [-333.535, 299.205] | pass |
| desktop | scroll | later in a scenario | 1 | 441.54 | 408.77 | 373.93 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.55 | 1.33 | 1.01 | – | too few samples, not judged |
| window | click | first | 7 | 216.52 | 217.18 | 115.14 | – | too few samples, not judged |
| window | click | later | 5 | 113.17 | 113.38 | 12.64 | – | too few samples, not judged |
| window | drag | first | 2 | 579.35 | 307.27 | 125.5 | – | too few samples, not judged |
| window | drag | later | 3 | 202.18 | 201.75 | 100.91 | – | too few samples, not judged |
| window | key_down | first | 12 | 237.83 | 203.29 | 2.7 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.2 | 50.54 | 0.14 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.14 | 1.03 | 0.99 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.05 | 101.12 | 100.54 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.61 | 1.39 | 1.07 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.26 | 0.27 | 0.2 | – | too few samples, not judged |
| window | move | first | 2 | 203.16 | 204.5 | 102.98 | – | too few samples, not judged |
| window | move | later | 4 | 100.78 | 101.65 | 0.52 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.44 | 237.47 | 102.83 | [-134.92, -134.34] | pass |
| window | press_key | later | 3 | 168.13 | 134.25 | 0.36 | – | too few samples, not judged |
| window | scroll | first | 3 | 239.85 | 240.95 | 138.82 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.48 | 202.59 | 100.96 | – | too few samples, not judged |

Same within noise (cua above the bar, the interval including 0): desktop click first (86.69 against 86.53, [-0.46, 0.72]).

cua is slower than the faster vendor build over the wire: desktop move later (8.45 against 6.05, [2.27, 2.59]).

## m1a4-drag-writer-primed (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 306 | 117.5 | 117.6 | 378.6 | clean | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

## m1a4-events-gate3 (experiment events)

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 31 interleaved fresh engines per engine and sequence, its scenarios' own beside them; a group is judged only with 20 samples an engine; `first` above the bar with a bootstrap 95% interval of cua minus the faster build that includes 0 is the same within noise):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 93 | 87.15 | 86.51 | 86.77 | [-0.05, 0.6] | **same (within noise)** |
| desktop | click | first in a scenario | 3 | 87.89 | 87.81 | 87.15 | – | too few samples, not judged |
| desktop | click | later | 124 | 46.29 | 30.02 | 12.74 | [-17.395, -17.175] | pass |
| desktop | click | later in a scenario | 1 | 158.54 | 92.01 | 24.95 | – | too few samples, not judged |
| desktop | drag_handle | first | 62 | 37.76 | 37.53 | 37.51 | [-0.1, 0.12] | pass |
| desktop | drag_handle | first in a scenario | 2 | 38.61 | 39.5 | 38.62 | – | too few samples, not judged |
| desktop | drag_handle | later | 124 | 33.05 | 30.3 | 0.46 | [-29.93, -29.74] | pass |
| desktop | drag_handle | later in a scenario | 2 | 33.03 | 30.74 | 0.41 | – | too few samples, not judged |
| desktop | drag | first | 62 | 326.87 | 106.64 | 47.63 | [-59.315, -58.82] | pass |
| desktop | drag | first in a scenario | 2 | 340.97 | 110.28 | 50.11 | – | too few samples, not judged |
| desktop | drag | later | 62 | 329.6 | 110.5 | 50.88 | [-60.14, -59.04] | pass |
| desktop | key_down | first | 124 | 51.46 | 1.42 | 0.6 | [-0.88, -0.76] | pass |
| desktop | key_down | first in a scenario | 4 | 51.91 | 2.12 | 1.08 | – | too few samples, not judged |
| desktop | key_down | later | 155 | 34.15 | 0.64 | 0.21 | [-0.46, -0.39] | pass |
| desktop | key_down | later in a scenario | 1 | 34.06 | 0.63 | 0.19 | – | too few samples, not judged |
| desktop | key_up | later | 124 | 33.55 | 0.17 | 0.16 | [-0.02, 0.005] | pass |
| desktop | key_up | later in a scenario | 5 | 33.41 | 0.14 | 0.14 | – | too few samples, not judged |
| desktop | move_relative | first | 31 | 0.71 | 1.45 | 0.45 | [-0.28, -0.2] | pass |
| desktop | move_relative | first in a scenario | 1 | 1.7 | 2.83 | 1.12 | – | too few samples, not judged |
| desktop | move_relative | later | 93 | 0.23 | 0.62 | 0.15 | [-0.11, -0.06] | pass |
| desktop | move_relative | later in a scenario | 2 | 33.71 | 17.48 | 0.23 | – | too few samples, not judged |
| desktop | move | first | 31 | 82.89 | 83.77 | 82.68 | [-0.43, 0.02] | pass |
| desktop | move | first in a scenario | 1 | 83.94 | 85.21 | 83.1 | – | too few samples, not judged |
| desktop | move | later | 93 | 8.58 | 6.01 | 8.43 | [2.32, 2.49] | **declared gap** (M4) |
| desktop | move | later in a scenario | 2 | 38 | 20.3 | 4.43 | – | too few samples, not judged |
| desktop | press_key | first | 217 | 68.46 | 34.76 | 0.66 | [-34.15, -34.03] | pass |
| desktop | press_key | first in a scenario | 7 | 69.86 | 35.54 | 1.04 | – | too few samples, not judged |
| desktop | press_key | later | 248 | 67.74 | 34.2 | 0.33 | [-33.92, -33.83] | pass |
| desktop | press_key | later in a scenario | 1 | 67.16 | 33.96 | 0.27 | – | too few samples, not judged |
| desktop | scroll | first | 31 | 73.4 | 74.33 | 73.18 | [-0.38, -0.1] | pass |
| desktop | scroll | first in a scenario | 1 | 74.66 | 75.7 | 73.86 | – | too few samples, not judged |
| desktop | scroll | later | 62 | 256.57 | 240.05 | 223 | [-17.315, -16.875] | pass |
| desktop | scroll | later in a scenario | 1 | 440.93 | 407.78 | 374.05 | – | too few samples, not judged |
| window | activate_window | first | 1 | 2.91 | 2.66 | 1.76 | – | too few samples, not judged |
| window | click | first | 7 | 216.28 | 217.04 | 115.22 | – | too few samples, not judged |
| window | click | later | 5 | 113.1 | 113.66 | 12.7 | – | too few samples, not judged |
| window | drag | first | 2 | 580.89 | 307.57 | 128.54 | – | too few samples, not judged |
| window | drag | later | 3 | 201.97 | 202.25 | 100.8 | – | too few samples, not judged |
| window | key_down | first | 12 | 237.46 | 203.64 | 2.45 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.06 | 50.57 | 0.18 | – | too few samples, not judged |
| window | key_up | first | 1 | 2.26 | 2.2 | 1.5 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.18 | 101.02 | 100.51 | – | too few samples, not judged |
| window | launch_app | first | 1 | 2.52 | 1.88 | 0.77 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.45 | 0.33 | 0.26 | – | too few samples, not judged |
| window | move | first | 2 | 203.81 | 204.12 | 102.61 | – | too few samples, not judged |
| window | move | later | 4 | 100.85 | 101.74 | 0.39 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.72 | 237.65 | 102.92 | [-134.92, -134.42] | pass |
| window | press_key | later | 3 | 167.69 | 134.37 | 0.33 | – | too few samples, not judged |
| window | scroll | first | 3 | 240.83 | 241.28 | 139.33 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.32 | 202.3 | 101.02 | – | too few samples, not judged |

Same within noise (cua above the bar, the interval including 0): desktop click first (86.77 against 86.51, [-0.05, 0.6]).

Declared speed gaps (deviations.mjs; not a pass): desktop move later (8.43 against 6.01, M4: cua sends the pinned build's motions, the first at the pointer's own position, with the vendor's 8 ms path wait after each; the newest build leaves that first motion out, so a short move waits 8 ms less. M4 shortens the wait).

