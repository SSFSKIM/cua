# linux-engine-diff summary

## t49-recordjudge (development run, not a release gate)

commit 297f8c20736f2ec1ef53c2ac55b58fa7719fe4c0; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 105.1 | 105.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 117.5 | 114.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 14 | 11.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-97.495, -85]; warm faster [-103.54, -87.69]) |
| desktop | list_windows | **bar** | 105.1 | 105.5 | | | | | | | | | |
| desktop | list_apps | pinned | 114.4 | 106.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 107.9 | 102.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 14.4 | 11.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-103.825, -85.895]; warm faster [-102.41, -85.96]) |
| desktop | list_apps | **bar** | 107.9 | 102.9 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38.3 | 27.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | newest | 38.2 | 28.2 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | get_screenshot | cua | 33.9 | 24.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-7.115, -0.5]; warm faster [-3.85, -0.51]) |
| desktop | get_screenshot | **bar** | 38.2 | 27.3 | | | | | | | | | |
| desktop | launch_app | pinned | 3.9 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.1 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.1 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-1.48, 0.065]; warm within the bound [0.02, 0.19]) |
| desktop | launch_app | **bar** | 3.9 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.4 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 592 | 569.2 | 21 | 3144 / 3144 | 3144 / 3144 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 594.4 | 572 | 21 | 3144 / 3144 | 3144 / 3144 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.7 | 86.9 | 21 | 3144 / 3143 | 100 / 61 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-541.41, -454.59]; warm faster [-512.91, -465.4]) |
| gedit | tree | **bar** | 592 | 569.2 | | | | | | | | | |
| gedit | tree_shot | pinned | 664.1 | 740.9 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | newest | 686.4 | 703.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree_shot | cua | 131.5 | 126.2 | 21 | – | – | 0 | 41/41 | clean | – | 0/41 | FAIL: cua: the output differs from the vendor's (cold faster [-567.175, -505.83]; warm faster [-611.29, -551.73]) |
| gedit | tree_shot | **bar** | 664.1 | 703.1 | | | | | | | | | |
| gedit | press_key | pinned | 273.3 | 269.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.3 | 235.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 106.8 | 101.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.59, -133.105]; warm faster [-134.52, -134.14]) |
| gedit | press_key | **bar** | 240.3 | 235.9 | | | | | | | | | |
| gedit | click | pinned | 219.1 | 215.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221.3 | 215.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 120.1 | 114.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.52, -98.435]; warm faster [-101.13, -100.815]) |
| gedit | click | **bar** | 219.1 | 215.1 | | | | | | | | | |
| gedit | type_text | pinned | 10208.3 | 10204.6 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_text | newest | 911.3 | 893.8 | 20 | – | – | – | 40/40 | **not traced** | 40/40 | 40/40 |  |
| gedit | type_text | cua | 182.6 | 175.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-743.64, -704.21]; warm faster [-731.69, -697.06]) |
| gedit | type_text | **bar** | 911.3 | 893.8 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10208.5 | 10204.5 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_text_selection | newest | 916.1 | 898.7 | 20 | – | – | – | 40/40 | **not traced** | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 187.1 | 181 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-735.515, -707.04]; warm faster [-746.585, -701.91]) |
| gedit | type_text_selection | **bar** | 916.1 | 898.7 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 191.8 | 175.4 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | type_characters | pinned | 3.4 | 0.2 | 20 | – | – | – | 40/40 | **not traced** | – | 0/40 |  |
| gedit | type_characters | newest | 573 | 568.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_characters | cua | 108.5 | 102.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-465.36, -462.395]; warm faster [-466.69, -465.595]) |
| gedit | type_characters | **bar** | 573 | 568.7 | | | | | | | | | |
| gedit | clipboard_read | pinned | 546 | 511.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | newest | 543.5 | 527.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 44.1 | 44.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-524.54, -483.81]; warm faster [-500.29, -459.585]) |
| gedit | clipboard_read | **bar** | 543.5 | 511.9 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10202.9 | 10203.3 | 20 | – | – | – | 40/40 | **not traced** | – | 40/40 |  |
| gedit | clipboard_write | newest | 10203.1 | 10202.9 | 20 | – | – | – | 40/40 | **not traced** | – | 40/40 |  |
| gedit | clipboard_write | cua | 176 | 171.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3.6 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | newest | 3.4 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | cua | 2.2 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 | PASS (cold faster [-1.89, -0.38]; warm same (within noise) [-0.01, 0.01]) |
| gedit | clipboard_release | **bar** | 3.4 | 0.1 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 450.3 | 423.5 | 20 | – | – | – | 40/40 | **not traced** | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 872.4 | 857.3 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 81.7 | 76.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 2.8 | 0.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 0.75 | 0.65 | pinned | [0.02, 0.19] | 1 |

Output differences (first sample against the pinned build's):
- gedit tree_shot cua: nodes 492 vs 492, first difference {"position":null,"field":"window","a":"{\"app\":\"org.gnome.gedit\",\"focused\":false,\"height\":756,\"modal\":false,\"title\":\"<label>.txt (/tmp/cua171-task49-WqJ6…-t49-recordjudge-oVS5JT) - gedit\",\"width\":910,","b":"{\"app\":\"org.gnome.gedit\",\"focused\":false,\"height\":756,\"modal\":false,\"title\":\"<label>.txt (/tmp/cua171-task49-WqJ6J…ff-t49-recordjudge-oVS5JT) - gedit\",\"width\":9"}

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 41/41 | 0 | 0 |  |
| desktop | newest | 41/41 | 28 | 0.0079 |  |
| desktop | cua | 41/41 | 28 | 0.0079 |  |
| gedit | pinned | 41/41 | 0 | 0 |  |
| gedit | newest | 41/41 | 0 | 0 |  |
| gedit | cua | 41/41 | 0 | 0 |  |

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
| gnome-text-editor | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 40/40 | foreground | foreground | stacking, active, focus | 0 / 0 / 0 |
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
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2153 | next request 19 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2140 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2157 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2151 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 157 |  |
| gedit | caret_placed | 0 | PASS | success | 181 | route background |
| gnome-text-editor | restore_refused | 0 | PASS | success | 187 | route foreground |

The cases' bus trace (1383 calls of 32 connections): PasteText 0, InsertText 0, SetTextContents 0.

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1899 samples, against the run's cap of 1% (18.99).

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

run valid; development run, not a release gate: **FAIL**: gedit tree_shot cua, a window the harness did not open was changed: pinned on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000, a window the harness did not open was changed: pinned on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: newest on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: newest on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000, a window the harness did not open was changed: newest on gedit type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000, a window the harness did not open was changed: pinned on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: newest on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: newest on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000, a window the harness did not open was changed: newest on gedit type_text_selection: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gedit clipboard_write: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: newest on gedit clipboard_write: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gnome-text-editor type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: pinned on gnome-text-editor type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000, a window the harness did not open was changed: pinned on gnome-text-editor type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000, a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2981896) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2982341) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2983522) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2988005) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2990135) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2990544) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2991596) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2992049) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2998122) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2999955) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3001069) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3001516) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3002648) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3007502) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3011903) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3012285) (5 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04000000 (sky_linux_x64 pid 3012285), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013377), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013555), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013650), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013813), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013871), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3013943), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014149), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014327), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014361), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014531), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014594), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014704), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3014918), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015084), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015112), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015304), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015374), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015431), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015628), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015804), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3015888), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016081), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016138), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016212), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016594), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04400000 (sky_linux_x64 pid 3016625), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016796), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016853), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3016964), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3017168), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3017356), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3017403) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3018515) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3018956), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019075), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019278), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019435), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019470), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019624), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019718), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019784), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3019971), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020131), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020222), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020394), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020456), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020538), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020718), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020895), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3020929), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021087), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021201), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021290), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021587), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021775), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3021831), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022015), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022088), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022164), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022447), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022618), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022655), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022838), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3022929), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3023004), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3036712) (6 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3036918), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3036980), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037183), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037235), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037278), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037455), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037564), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037603), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037764), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037819), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3037917), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3038046), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3038123), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3038175), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3038362), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3038425), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (xtrace pid 3038857) (2 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (xtrace pid 3039228) (2 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (xtrace pid 3039399) (2 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (xtrace pid 3039779) (2 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (xtrace pid 3041271) (2 times), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3041844), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3042033), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3042101), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3042276), a window the harness did not open was changed: the run's record: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 3043076); text restores (the first word put back before a sample): pinned 43, newest 0, cua 0, finished 2026-11-03T10:21:03.808Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x0140000c; the harness's own trace: 29271 requests, 25492 changes of a window, every one of its own; the run's record: 85622 requests of the harness's and the engines' clients, 74042 changes of a window, **10 changes of a window it did not open: SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2979812); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2981896); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2981896); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2981896); SKY_CLIPBOARD_STOP ClientMessage on 0x04200000 (sky_linux_x64 pid 2981896)**

