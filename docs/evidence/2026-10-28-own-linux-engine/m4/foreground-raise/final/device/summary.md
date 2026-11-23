# linux-engine-diff summary

## t63-final-device (development run, not a release gate)

commit –; cua-engine 0.3.0 (c87e55849f41); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 211cbfd01b2953cb322127f1b0e7c3111b2844812c4400406ef2b5985fd736dc, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (c87e55849f41); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 137.6 | 131.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 136.7 | 115.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 9.1 | 6.6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-141.225, -112.835]; warm faster [-122, -103.48]) |
| desktop | list_windows | **bar** | 136.7 | 115.6 | | | | | | | | | |
| desktop | list_apps | pinned | 119.9 | 127.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 115.6 | 106.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 9.5 | 7.4 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-116.33, -102.48]; warm faster [-106.58, -93.72]) |
| desktop | list_apps | **bar** | 115.6 | 106.6 | | | | | | | | | |
| desktop | get_screenshot | pinned | 34.5 | 27.9 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 36.6 | 28.2 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 33.7 | 23.5 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 33.67 against 34.55, within the pinned build's spread [29.8, 58.38]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm faster [-5.39, -3.12]) |
| desktop | get_screenshot | **bar** | 34.5 | 27.9 | | | | | | | | | |
| desktop | launch_app | pinned | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.1 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.7 | 1.1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.62, 0.3]; warm within the bound [0.27, 0.52]) |
| desktop | launch_app | **bar** | 4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.6 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 1.7 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 99.1 | 15.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 2.8 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 3.1 | 1.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 1.9 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 13.9 | 10.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 15.5 | 11.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2.2 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 196.7 | 112.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 2 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 61.8 | 85.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.3 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 111.8 | 24.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.2 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1.1 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 19.5 | 20.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 99.4 | 15.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 17.3 | 14.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 24.3 | 24.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.1 | 1.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 4.3 | 85.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.3 | 1.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 330.7 | 318.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1.2 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 162.5 | 112.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 1.8 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 196 | 112.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 305.5 | 297.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.5 | 1.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 369.9 | 369.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 340.8 | 331.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 373.2 | 374.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 181.5 | 183.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 457.7 | 451.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 381.6 | 364.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 436.2 | 385.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 335.2 | 335.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 189 | 183.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 190.1 | 179.1 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 257.1 | 254.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 450.5 | 444.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 256.9 | 253.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.9 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 2 | 1.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 15.6 | 15.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.1 | 0.67 | pinned | [0.27, 0.52] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 28 | 0.0079 |  |
| desktop | cua | 61/61 | 28 | 0.0079 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 981 samples, against the run's cap of 1% (9.81).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-06T18:15:11.482Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 48317 requests, 7812 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

