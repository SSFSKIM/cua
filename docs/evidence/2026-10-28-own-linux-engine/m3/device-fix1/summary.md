# linux-engine-diff summary

## m31-fix1-device

commit af6b2a1eb3123c6e9d0959a9fb63cf2c42e399fd; cua-engine 0.3.0 (af6b2a1eb312); occlusion covered; 4 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | capabilities | cua | 3 | 0.1 | 28 | – | – | – | – | – | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 2 | 0.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 105.5 | 22 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 2.2 | 0.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 5.9 | 3.6 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 1.9 | 0.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 14.5 | 12 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 117.2 | 113.3 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 2 | 0.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 203.1 | 115.3 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 1.9 | 0.4 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 69.8 | 91 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 2.1 | 0.5 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 131.2 | 51.7 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_click_overlap_shared | cua | 1.2 | 1 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_click_offscreen_shared | cua | 1 | 1 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_right_click_overlap_shared | cua | 23.1 | 22.5 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_click_overlap_dedicated | cua | 114 | 25.1 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 117 | 114.7 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 126.5 | 125.8 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_move_overlap_shared | cua | 1.1 | 0.8 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 9.9 | 93.2 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_drag_overlap_shared | cua | 1.7 | 1.9 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 379.8 | 390.4 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-firefox | firefox_scroll_overlap_shared | cua | 1 | 0.9 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 171.2 | 122.7 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.4 | 0.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 7.2 | 8 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-xterm | xterm_click_shared | cua | 116.2 | 114 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-qt | qt_scroll_shared | cua | 2.7 | 0.4 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 201.8 | 114 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 698 | 693.4 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.2 | 1.1 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 449.6 | 443.1 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 428.1 | 422.6 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 513.4 | 466.1 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 509.8 | 482.8 | 8 | – | – | – | 0/12 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 706.5 | 687 | 8 | – | – | – | 12/12 | clean | 12/12 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 427.5 | 423.3 | 8 | – | – | – | 12/12 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 443.8 | 504.7 | 8 | – | – | – | 0/12 | clean | – | – | PASS |
| gnome-text-editor | gte_type_text_shared | cua | 3.9 | 1.7 | 8 | – | – | – | 12/12 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |

run valid; every verdict PASS, finished 2026-10-31T08:35:15.520Z

