# linux-engine-diff summary

## m2-final

commit 426e25f2cf3d44bef8d6db65ce6bba31f90781bd; cua-engine 0.2.0 (de4802a5f277); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 144.7 | 124.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 146.4 | 130.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 13.6 | 7.4 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | list_windows | **bar** | 144.7 | 124.1 | | | | | | | | | |
| desktop | list_apps | pinned | 128.9 | 136 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 119.6 | 127.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 13.7 | 9.7 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | list_apps | **bar** | 119.6 | 127.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 35.8 | 27.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 36.5 | 29.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 33.7 | 24.3 | 21 | – | – | – | – | – | – | 41/41 | PASS |
| desktop | get_screenshot | **bar** | 35.8 | 27.4 | | | | | | | | | |
| desktop | launch_app | pinned | 4.4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.6 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (same within noise: warm 0.68 against 0.67, [-0.1, 0.08]) |
| desktop | launch_app | **bar** | 4.4 | 0.7 | | | | | | | | | |
| gedit | tree | pinned | 614.9 | 630.7 | 21 | 3193 / 3193 | 3193 / 3193 | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | newest | 606.8 | 601.3 | 21 | 3193 / 3193 | 3193 / 3193 | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree | cua | 85.8 | 74.3 | 21 | 3193 / 3192 | 91 / 60 | 0 | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree | **bar** | 606.8 | 601.3 | | | | | | | | | |
| gedit | tree_shot | pinned | 778.6 | 738.6 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | newest | 717.5 | 718.2 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| gedit | tree_shot | cua | 130.9 | 102 | 21 | – | – | 0 | 24/24 | clean | – | 24/24 | PASS |
| gedit | tree_shot | **bar** | 717.5 | 718.2 | | | | | | | | | |
| gedit | press_key | pinned | 272.4 | 269.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | newest | 239.8 | 235.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | press_key | cua | 105.8 | 101.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | press_key | **bar** | 239.8 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 221.1 | 215 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | newest | 223.2 | 216.1 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | click | cua | 118.4 | 114 | 15 | – | – | – | 18/18 | clean | – | 18/18 | PASS |
| gedit | click | **bar** | 221.1 | 215 | | | | | | | | | |
| gedit | type_text | pinned | 10210 | 10204.5 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gedit | type_text | newest | 908.6 | 923.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_text | cua | 179 | 166.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_text | **bar** | 908.6 | 923.9 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10209.8 | 10204.4 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gedit | type_text_selection | newest | 900 | 932.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_text_selection | cua | 178.1 | 164 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_text_selection | **bar** | 900 | 932.9 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 177.1 | 174.3 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 2.4 | 0.2 | 15 | – | – | – | 18/18 | **not traced** | – | 0/18 |  |
| gedit | type_characters | newest | 575.3 | 569.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | type_characters | cua | 107.7 | 102.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | type_characters | **bar** | 575.3 | 569.4 | | | | | | | | | |
| gedit | clipboard_read | pinned | 523.6 | 541.3 | 15 | – | – | – | 18/18 | clean | 6/6 | 6/18 |  |
| gedit | clipboard_read | newest | 612.7 | 558.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| gedit | clipboard_read | cua | 39.1 | 35.7 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| gedit | clipboard_read | **bar** | 523.6 | 541.3 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10202.4 | 10202.7 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gedit | clipboard_write | newest | 10202.9 | 10203 | 15 | – | – | – | 18/18 | clean | – | 6/18 |  |
| gedit | clipboard_write | cua | 172.7 | 164.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 4.3 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 |  |
| gedit | clipboard_release | newest | 3.3 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 |  |
| gedit | clipboard_release | cua | 2.3 | 0.1 | 30 | – | – | – | 33/33 | clean | – | 33/33 | PASS (same within noise: warm 0.13 against 0.11, [0, 0.04]) |
| gedit | clipboard_release | **bar** | 3.3 | 0.1 | | | | | | | | | |
| chrome | tree | pinned | 567 | 547.9 | 21 | 2266 / 2266 | 2266 / 2266 | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | newest | 551.3 | 514.2 | 21 | 2266 / 2266 | 2266 / 2266 | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree | cua | 89.2 | 65.1 | 21 | 2266 / 2265 | 31 / 29 | 0 | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree | **bar** | 551.3 | 514.2 | | | | | | | | | |
| chrome | tree_shot | pinned | 703 | 609.6 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | newest | 641.1 | 639.4 | 21 | – | – | – | 24/24 | clean | – | 24/24 |  |
| chrome | tree_shot | cua | 111.3 | 92.3 | 21 | – | – | 0 | 24/24 | clean | – | 24/24 | PASS |
| chrome | tree_shot | **bar** | 641.1 | 609.6 | | | | | | | | | |
| chrome | press_key | pinned | 272.8 | 269.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | newest | 240.2 | 236.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | press_key | cua | 106.3 | 101.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | press_key | **bar** | 240.2 | 236.3 | | | | | | | | | |
| chrome | click | pinned | 219.3 | 215.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | newest | 220.8 | 215.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome | click | cua | 118.6 | 113.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome | click | **bar** | 219.3 | 215.2 | | | | | | | | | |
| over-budget | tree | pinned | 7090.2 | 7026.1 | 21 | 45078 / 45078 | 45078 / 45078 | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | newest | 7135.4 | 7249.3 | 21 | 45078 / 45078 | 45078 / 45078 | – | 24/24 | clean | – | 24/24 |  |
| over-budget | tree | cua | 1014.9 | 983.8 | 21 | 45252 / 45265 | 190 / 216 | 188 | 24/24 | clean | – | 24/24 | PASS |
| over-budget | tree | **bar** | 7090.2 | 7026.1 | | | | | | | | | |
| retention | after_resize | pinned | 713.8 | 618.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | newest | 609.4 | 615.4 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_resize | cua | 83.7 | 95.4 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_resize | **bar** | 609.4 | 615.4 | | | | | | | | | |
| retention | after_remap | pinned | 601.9 | 599.6 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | newest | 629.7 | 665.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_remap | cua | 85.3 | 97.1 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_remap | **bar** | 601.9 | 599.6 | | | | | | | | | |
| retention | after_covered_change | pinned | 594.5 | 619.3 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | newest | 615.9 | 662.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| retention | after_covered_change | cua | 89.8 | 94.5 | 15 | – | – | 0 | 18/18 | clean | 18/18 | 18/18 | PASS |
| retention | after_covered_change | **bar** | 594.5 | 619.3 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 1041.9 | 1002.9 | 15 | – | – | – | 18/18 | clean | 16/18 | 18/18 |  |
| chrome-textarea | type_text | newest | 989.3 | 2438.7 | 15 | – | – | – | 18/18 | clean | 1/1 | 1/18 |  |
| chrome-textarea | type_text | cua | 180.7 | 167.8 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-textarea | type_text | **bar** | 989.3 | 1002.9 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 1116.6 | 1167.5 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-address-bar | type_text | newest | 1187.9 | 1158.9 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 |  |
| chrome-address-bar | type_text | cua | 209.7 | 189.1 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 | PASS |
| chrome-address-bar | type_text | **bar** | 1116.6 | 1158.9 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 475.4 | 450.7 | 15 | – | – | – | 18/18 | clean | – | 18/18 |  |
| gnome-text-editor | type_text | newest | 864.2 | 861.1 | 15 | – | – | – | 18/18 | clean | – | 0/18 |  |
| gnome-text-editor | type_text | cua | 75.6 | 82.2 | 15 | – | – | – | 18/18 | clean | 18/18 | 18/18 (18 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0076 |  |
| desktop | cua | 41/41 | 28 | 0.0076 |  |
| gedit | pinned | 24/24 | 0 | 0 |  |
| gedit | newest | 24/24 | 0 | 0 |  |
| gedit | cua | 24/24 | 0 | 0 |  |
| chrome | pinned | 24/24 | 0 | 0 |  |
| chrome | newest | 24/24 | 0 | 0 |  |
| chrome | cua | 24/24 | 0 | 0 |  |
| retention | pinned | 54/54 | 0 | 0 |  |
| retention | newest | 54/54 | 0 | 0 |  |
| retention | cua | 54/54 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | type_text | pinned | 18/18 | – | – | – | 1 / 0 / 0 |
| gedit | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| gedit | type_text | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_selection | pinned | 18/18 | – | – | – | 1 / 0 / 0 |
| gedit | type_text_selection | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| gedit | type_text_selection | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_dedicated | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gedit | type_characters | cua | – | background | background | – | 0 / 0 / 0 |
| gedit | clipboard_write | pinned | 12/18 | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_write | newest | 0/18 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| chrome-textarea | type_text | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 18/18 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 18/18 | foreground | foreground | stacking, active, focus | 0 / 0 / 0 |
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
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 165.76126298308372 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 187.2281939983368 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 177.29635599255562 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 170.5139960050583 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 190.86882001161575 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 171.7597800195217 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 646 | next request 169 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 233,196 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 214,181 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 184,218 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 179 | max 240 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2190 | next request 14 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2179 | next request 10 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2147 | next request 11 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2144 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2147 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2148 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 155 |  |
| gedit | caret_placed | 0 | PASS | success | 179 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 106 | route foreground |

The cases' bus trace (25775 calls of 174 connections): PasteText 0, InsertText 0, SetTextContents 0.

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

run valid; every verdict PASS, finished 2026-10-30T14:49:56.494Z

