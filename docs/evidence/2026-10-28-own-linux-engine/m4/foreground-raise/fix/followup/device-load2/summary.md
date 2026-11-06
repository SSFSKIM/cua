# linux-engine-diff summary

## t63-fu-device-load2 (development run, not a release gate)

commit –; cua-engine 0.3.0 (5138f698741b); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 f0e821aaf84275a22ad1fde6f5b3900235faade8f2242b5a837d6e137c483f99, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (5138f698741b); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 122 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 87.2 | 83.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 87.1 | 81.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 22.1 | 12.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-67.585, -61.695]; warm faster [-75.4, -66.48]) |
| desktop | list_windows | **bar** | 87.1 | 81.1 | | | | | | | | | |
| desktop | list_apps | pinned | 91.5 | 82.4 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 89.2 | 85.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 23.6 | 16.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-87.455, -62.975]; warm faster [-68.86, -62.1]) |
| desktop | list_apps | **bar** | 89.2 | 82.4 | | | | | | | | | |
| desktop | get_screenshot | pinned | 64 | 58.1 | 42 | – | – | – | – | – | – | 62/62 |  |
| desktop | get_screenshot | newest | 63.8 | 60.6 | 42 | – | – | – | – | – | – | 62/62 |  |
| desktop | get_screenshot | cua | 60.1 | 49.2 | 42 | – | – | – | – | – | – | 62/62 | PASS (cold faster [-8.7, -0.695]; warm faster [-12.72, -6.975]) |
| desktop | get_screenshot | **bar** | 63.8 | 58.1 | | | | | | | | | |
| desktop | launch_app | pinned | 10.4 | 3.9 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 9.1 | 2.5 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 13.1 | 4.9 | 21 | – | – | – | – | – | 41/41 | 41/41 | FAIL: cua: cold 13.15 ms > bar 9.14 ms, the interval [1.685, 6.025] above 0; cua: warm 4.9 ms > bar 2.54 ms, the interval [0.55, 3.59] above 0 |
| desktop | launch_app | **bar** | 9.1 | 2.5 | | | | | | | | | |
| desktop | capabilities | cua | 7.1 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 7.2 | 1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 113.2 | 17.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 14.9 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 11.9 | 4.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 5.4 | 3.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 17 | 21.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 25.6 | 27.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 12 | 1.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 222.1 | 113.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 9.7 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 77.5 | 92 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 7.6 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 117.7 | 81.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 4.2 | 2.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 6 | 1.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 72.2 | 49.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 108.7 | 20.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 28.4 | 17.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 82.8 | 73 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 8.8 | 4.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 10.6 | 94.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 7.4 | 1.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 641.9 | 408.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 10.8 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 177.3 | 121.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-qt | qt_scroll_shared | cua | 5.8 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 201.8 | 117.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 390.7 | 306.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 4.2 | 4.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 461.6 | 448.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 398.3 | 418.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 448 | 454.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 262.8 | 217.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 488.8 | 472.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 401.7 | 420.1 | 6 | – | – | – | 9/9 | clean | 8/9 | – | FAIL: the effect was not verified on 1 of 9 samples (0/0) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 464.7 | 404.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 409.6 | 415.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 232.7 | 237.5 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 253 | 245.8 | 6 | – | – | – | 1/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 260.8 | 255.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 463.1 | 468 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 272.9 | 256.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_shared | cua | 7.4 | 0.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 8 | 3.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 20.8 | 13.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| minimized | minimized_press_key | cua | 2.1 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.2 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.5 | 1.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 3 | 2.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 2.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 1.7 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 3.8 | 2.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.4 | 1.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 1.8 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 1.2 | 0.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 4.2 | 3.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 4.7 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 2.6 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 4.7 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 2.6 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 12.4 | 14.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 298.1 | 256.8 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 264.8 | 293.9 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 379.3 | 344.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 15.7 | 12.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 8.3 | 5.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1007.3 | 1003.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.7 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 1.5 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.4 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 62/62 | 0 | 0 |  |
| desktop | newest | 62/62 | 28 | 0.0079 |  |
| desktop | cua | 62/62 | 28 | 0.0079 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer, focus after the request | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_overlap_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1227 samples, against the run's cap of 1% (12.27).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua, desktop launch_app cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-06T23:51:12.904Z

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 54206 requests, 9760 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

