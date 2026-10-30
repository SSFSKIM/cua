# linux-engine-diff summary

## m2-wire

commit e0168c63871cfa140ea81e2f97ec6a8f9d73adc1; cua-engine 0.2.0 (e0168c63871c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 153.6 | 126.5 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | newest | 139.5 | 132.1 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_windows | cua | 13.2 | 8.7 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_windows | **bar** | 139.5 | 126.5 | | | | | | | | | |
| desktop | list_apps | pinned | 147.2 | 143.4 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | newest | 132.8 | 138.7 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | list_apps | cua | 12.7 | 8.8 | 21 | – | – | – | – | – | – | 24/24 | PASS |
| desktop | list_apps | **bar** | 132.8 | 138.7 | | | | | | | | | |
| desktop | get_screenshot | pinned | 33.6 | 29.4 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | newest | 39 | 29 | 21 | – | – | – | – | – | – | 24/24 |  |
| desktop | get_screenshot | cua | 36.4 | 24.6 | 21 | – | – | – | – | – | – | 24/24 | FAIL: cua: cold 36.44 ms > bar 33.58 ms |
| desktop | get_screenshot | **bar** | 33.6 | 29 | | | | | | | | | |
| desktop | launch_app | pinned | 3.8 | 0.7 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | newest | 3.5 | 0.7 | 21 | – | – | – | – | – | 24/24 | 24/24 |  |
| desktop | launch_app | cua | 3.1 | 0.7 | 21 | – | – | – | – | – | 24/24 | 24/24 | PASS |
| desktop | launch_app | **bar** | 3.5 | 0.7 | | | | | | | | | |
| gedit | tree | pinned | 700.7 | 587.8 | 21 | 3194 / 3194 | 3194 / 3194 | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | newest | 630.2 | 596.2 | 21 | 3194 / 3194 | 3194 / 3194 | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | cua | 77 | 78 | 21 | 3194 / 3193 | 59 / 90 | 0 | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree | **bar** | 630.2 | 587.8 | | | | | | | | | |
| gedit | tree_shot | pinned | 704.1 | 726.6 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | newest | 687.5 | 730.2 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | cua | 125.4 | 105.3 | 21 | – | – | 0 | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 687.5 | 726.6 | | | | | | | | | |
| gedit | press_key | pinned | 273.8 | 268.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 239.5 | 235.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 106.1 | 101.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 239.5 | 235.8 | | | | | | | | | |
| gedit | click | pinned | 220 | 215.3 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 223.2 | 216.5 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 118.5 | 114.7 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 220 | 215.3 | | | | | | | | | |
| gedit | type_text | pinned | 10207.7 | 10204.3 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gedit | type_text | newest | 921.2 | 929.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_text | cua | 171.5 | 159.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_text | **bar** | 921.2 | 929.5 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10207.8 | 10204.3 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gedit | type_text_selection | newest | 943.6 | 939.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_text_selection | cua | 167.2 | 160.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_text_selection | **bar** | 943.6 | 939.8 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 173.5 | 160.8 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 2.7 | 0.2 | 15 | – | – | – | 18/18 | **not traced** | – | 0/18 |  |
| gedit | type_characters | newest | 570.7 | 568.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_characters | cua | 107.2 | 101.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_characters | **bar** | 570.7 | 568.2 | | | | | | | | | |
| gedit | clipboard_read | pinned | 533.2 | 565.4 | 15 | – | – | – | 18/18 | clean | 6/6 | 6/18 |  |
| gedit | clipboard_read | newest | 552.9 | 557.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | clipboard_read | cua | 38.1 | 34.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | clipboard_read | **bar** | 533.2 | 557.7 | | | | | | | | | |
| gedit | clipboard_write | pinned | 202.5 | 202 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | clipboard_write | newest | 10202.7 | 10202.9 | 15 | – | – | – | 18/18 | clean | – | 6/18 |  |
| gedit | clipboard_write | cua | 169.4 | 162.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 |  |
| gedit | clipboard_release | newest | 3.2 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 |  |
| gedit | clipboard_release | cua | 2.6 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 | PASS (same within noise: warm 0.13 against 0.12, [0, 0.02]) |
| gedit | clipboard_release | **bar** | 3 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 559.3 | 479.9 | 21 | 2267 / 2267 | 2267 / 2267 | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | newest | 484.9 | 491.8 | 21 | 2267 / 2267 | 2267 / 2267 | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | cua | 75.1 | 60 | 21 | 2267 / 2266 | 36 / 25 | 0 | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree | **bar** | 484.9 | 479.9 | | | | | | | | | |
| chrome | tree_shot | pinned | 648.5 | 613.1 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | newest | 612 | 640.6 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | cua | 135.2 | 87.4 | 21 | – | – | 0 | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 612 | 613.1 | | | | | | | | | |
| chrome | press_key | pinned | 272.7 | 269.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 240.9 | 235.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 106.9 | 101.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 240.9 | 235.9 | | | | | | | | | |
| chrome | click | pinned | 218.3 | 215 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 220.3 | 215.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 118.3 | 113.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 218.3 | 215 | | | | | | | | | |
| over-budget | tree | pinned | 6777 | 6948.7 | 21 | 45079 / 45079 | 45079 / 45079 | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | newest | 7283.4 | 7118.4 | 21 | 45079 / 45079 | 45079 / 45079 | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | cua | 944.3 | 974.2 | 21 | 45264 / 45256 | 131 / 201 | 190 | 24/24 | clean | – | 24/24 | PASS |
| over-budget | tree | **bar** | 6777 | 6948.7 | | | | | | | | | |
| retention | after_resize | pinned | 644 | 642.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 586.1 | 629.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 108 | 92.6 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 586.1 | 629.3 | | | | | | | | | |
| retention | after_remap | pinned | 568.8 | 635.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 619.3 | 672.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 94.1 | 104.7 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 568.8 | 635.7 | | | | | | | | | |
| retention | after_covered_change | pinned | 613.5 | 619.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 632.6 | 592.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 105.3 | 91 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 613.5 | 592.3 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1045.1 | 1010.4 | 15 | – | – | – | 18/18 | clean | 16/18 | 18/18 |  |
| chrome-textarea | type_text | newest | 1028.5 | 2437.6 | 15 | – | – | – | 18/18 | clean | 1/1 | 1/18 |  |
| chrome-textarea | type_text | cua | 175.4 | 169.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-textarea | type_text | **bar** | 1028.5 | 1010.4 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1125.4 | 1168.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-address-bar | type_text | newest | 1157.8 | 1127.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-address-bar | type_text | cua | 189.1 | 184 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-address-bar | type_text | **bar** | 1125.4 | 1127.7 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 434.6 | 438.3 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gnome-text-editor | type_text | newest | 873.6 | 868.4 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gnome-text-editor | type_text | cua | 73.6 | 67.8 | 15 | – | – | – | 18/18 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus, XTEST FakeInput** | 18/18 | 18/18 (18 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 24/24 | 0 | 0 |  |
| desktop | newest | 24/24 | 28 | 0.0076 |  |
| desktop | cua | 24/24 | 28 | 0.0076 |  |
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| retention | pinned | 54/54 | 0 | 0 |  |
| retention | newest | 54/54 | 0 | 0 |  |
| retention | cua | 54/54 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua reports, the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|
| gedit | type_text | pinned | 18/18 | – | – | 1 / 0 / 0 |
| gedit | type_text | newest | 18/18 | – | – | 0 / 0 / 0 |
| gedit | type_text | cua | 18/18 | background | – | 0 / 0 / 0 |
| gedit | type_text_selection | pinned | 18/18 | – | – | 1 / 0 / 0 |
| gedit | type_text_selection | newest | 18/18 | – | – | 0 / 0 / 0 |
| gedit | type_text_selection | cua | 18/18 | background | – | 0 / 0 / 0 |
| gedit | type_text_dedicated | cua | 18/18 | background | – | 0 / 0 / 0 |
| gedit | type_characters | cua | – | background | – | 0 / 0 / 0 |
| gedit | clipboard_write | pinned | 12/18 | – | – | 0 / 0 / 0 |
| gedit | clipboard_write | newest | 0/18 | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 18/18 | background | – | 0 / 0 / 0 |
| chrome-textarea | type_text | pinned | 18/18 | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 18/18 | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 18/18 | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 18/18 | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 18/18 | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 18/18 | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 18/18 | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 18/18 | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 18/18 | foreground | focus, stacking, active | 0 / 0 / 0 |
| gedit | type_characters | pinned | – | – | – | 0 / 0 / 0 |
| gedit | type_characters | newest | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | pinned | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | newest | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | cua | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | pinned | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | newest | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | cua | – | – | – | 0 / 0 / 0 |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 175.58801499009132 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 191.33537802100182 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 173.53831800818443 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 160.1408360004425 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 152.9284389913082 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 152.1502640247345 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 640 | next request 188 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 235,198 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 217,182 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 217,183 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 185 | max 262 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2203 | next request 17 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2166 | next request 11 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2141 | next request 12 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2143 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2157 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2142 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 152 |  |
| gedit | caret_placed | 0 | PASS | success | 182 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 77 | route foreground |

The cases' bus trace (25843 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

run valid; **FAIL**: desktop get_screenshot cua, finished 2026-10-30T08:45:04.993Z

