# linux-engine-diff summary

## t4b-run-3 (development run, not a release gate)

commit 39b4d1bb07fb4b1ea71064d5824527a11ad01adb; cua-engine 0.3.0 (ac4a5367cac9); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8a7f2af94eda5cdacd51ebc2bbbb8517f2bf9d40e0882f105878084264cf2e1f, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (ac4a5367cac9); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 632.8 | 643.2 | 21 | 3188 / 3188 | 3188 / 3188 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 596.3 | 577.3 | 21 | 3188 / 3188 | 3188 / 3188 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 95.8 | 92.5 | 21 | 3188 / 3187 | 91 / 78 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-536.97, -475.55]; warm faster [-525.44, -466.09]) |
| gedit | tree | **bar** | 596.3 | 577.3 | | | | | | | | | |
| gedit | press_key | pinned | 272.9 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240 | 235.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 106.3 | 101.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.47, -132.935]; warm faster [-134.85, -134.37]) |
| gedit | press_key | **bar** | 240 | 235.8 | | | | | | | | | |
| gedit | click | pinned | 218.8 | 215.2 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 220.5 | 215.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 119.6 | 114.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.615, -98.76]; warm faster [-101.245, -100.8]) |
| gedit | click | **bar** | 218.8 | 215.2 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 18 | 17.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 110.4 | 106.9 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 110 | 91.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 137.7 | 114.5 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 14.3 | 15.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 8.6 | 8.4 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1003.2 | 1003 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.7 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 100.8 | 100.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.6 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 8.9 | 6.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-xterm | xterm_click_shared | cua | 116.1 | 114.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 497.8 | 503.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 649.2 | 683.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 358 | 354.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 357.8 | 354.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |
| gedit | click | cua | – | – | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, focus, active | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 669 samples, against the run's cap of 1% (6.69).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T15:43:27.130Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0220000e; the harness's own trace: 20540 requests, 6100 changes of a window, every one of its own; the run's record: 23866 requests of the harness's and the engines' clients, 18474 changes of a window, every one of its own

