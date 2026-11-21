# linux-engine-diff summary

## pinned-V5 (acceptance on the pinned release)

commit 69bd7993e1f1cb252574939bd6e8e80674bab5b8; cua-engine 0.4.2 (9371d2348cf8); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); the pin's arm64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 17.7 | 17 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 87.9 | 87.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 15.1 | 13.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 15.1 | 14.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 19.4 | 20.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 3.5 | 1.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 74.9 | 75.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 187.1 | 185.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 260.5 | 260.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 111.4 | 110.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 184.4 | 183.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 454.7 | 453.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 0.6 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 529.9 | 529.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 386.6 | 351.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 368.3 | 471.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 656.7 | 655.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 441.2 | 438.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 484.2 | 485.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 434.5 | 473.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 426.8 | 355.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 656.4 | 656 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 158.3 | 157.6 | 6 | – | – | – | 6/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 455.1 | 653.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 476.8 | 475.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 455.4 | 453.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 429.7 | 430.2 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 430.6 | 432.7 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| identity | identity_apart | cua | 91.2 | 90.8 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 16.3 | 16 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 16.2 | 16 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 16.2 | 15.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 101.7 | 100.2 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 16.2 | 15.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 16.3 | 15.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 17.6 | 17.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 17.6 | 17.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.3 | 0.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 26.8 | 26.2 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 13.2 | 12.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 26.4 | 26 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 13.3 | 12.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 13.1 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 12.9 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 13.2 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 13.3 | 12.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 101.8 | 100.1 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

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
| device-chrome-dnd | chrome_dnd_short_in_front_shared | draggable | absolute | 9 | 9 | 84.5 | 82.4 | – | 20 |
| device-chrome-dnd | chrome_select_nudged_shared | plain | – | 9 | – | 1.1 | – | – | – |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_visible_shared | cua | – | background | background | – | – |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_move_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-firefox | firefox_scroll_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
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
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | – | background | background | – | – |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | – | background | background | – | – |
| identity | identity_type_text | cua | – | – | background | – | – |
| identity | identity_key_up | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 522 samples, against the run's cap of 1% (5.22).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-21T01:08:09.625Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0140000e; the harness's own trace: 56891 requests, 10803 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead); left undone, the window not the run's then: pointer restore on (640, 400); pointer restore on (640, 400); pointer restore on (640, 400)

