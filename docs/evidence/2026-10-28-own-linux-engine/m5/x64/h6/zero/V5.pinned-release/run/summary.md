# linux-engine-diff summary

## pinned-V5 (acceptance on the pinned release)

commit 69bd7993e1f1cb252574939bd6e8e80674bab5b8; cua-engine 0.4.2 (9371d2348cf8); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (9371d2348cf8); the pin's x64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.9 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.7 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 33.7 | 43.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 108.2 | 106.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 18.5 | 17.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 23.8 | 16.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 36 | 39.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.9 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 12.4 | 4.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 107.6 | 99.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 1 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 201.6 | 188.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 297.4 | 284.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.6 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 117.5 | 113.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 201.5 | 211.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 462.2 | 457.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.1 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 552.1 | 546.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 409.5 | 368 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 375.6 | 470.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 699.3 | 697.3 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 467.1 | 459.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 472.1 | 471.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 451.8 | 401.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 416.2 | 336.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 705.2 | 700.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 165 | 180.5 | 6 | – | – | – | 2/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 463.9 | 560 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 450.8 | 451 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 461.4 | 458.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 382.3 | 370.1 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 394.7 | 421.4 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| identity | identity_apart | cua | 107.3 | 107.2 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 38.7 | 28.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 24.7 | 23.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 26 | 22.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 120.7 | 122.6 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 34.8 | 32 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 27.6 | 25.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 28.5 | 28.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 27.9 | 26.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.5 | 0.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 47.4 | 41.1 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 21.4 | 21.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 43.4 | 41.5 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 21.7 | 21.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 30.9 | 20.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 22 | 18.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 21.2 | 20.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 21.5 | 19.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 172.7 | 169.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| **run** | | 63 | 45 | 63 | 0 | 0 |

The hold canary (device.mjs `holdCanary`): each cell's ping waits in ms. A draggable cell passes on a press that started a drag and read slow by the engine's own 20 ms (`absolute`), or waited 3x the plain control's warm largest and 5 ms at least (`relative`, x64's K1, K2 and V5):

| scene | op | kind | criterion | held | started | largest wait | median wait | plain largest | bar |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | draggable | relative | 9 | 9 | 88 | 57.4 | 1.2 | 5 |
| device-chrome-dnd | chrome_select_nudged_shared | plain | – | 9 | – | 1.2 | – | – | – |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome | chrome_drag_visible_path_shared | cua | – | background | background | – | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | – | foreground | foreground | stacking, pointer | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | – | background | background | – | – |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | – | background | background | – | – |
| identity | identity_type_text | cua | – | – | background | – | – |
| identity | identity_key_up | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 522 samples, against the run's cap of 1% (5.22).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-21T03:07:24.709Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 55041 requests, 10803 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

