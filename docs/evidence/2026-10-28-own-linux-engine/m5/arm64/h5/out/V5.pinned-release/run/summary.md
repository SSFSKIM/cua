# linux-engine-diff summary

## pinned-V5 (acceptance on the pinned release)

commit 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 17.3 | 16.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 87.7 | 87.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 15.1 | 13.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 14.9 | 13.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 19 | 20.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 3.2 | 1.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 74.9 | 75.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 0.4 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 187 | 185.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 259.6 | 259.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 111.1 | 110.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 184.1 | 183.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 237.1 | 236 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 0.6 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 328.1 | 327.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 157.9 | 354.6 | 6 | – | – | – | 9/9 | clean | – | – | FAIL: not cancelled with the drag-and-drop sentence on 2 of 9 samples (1/0, 2/0) |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 360.3 | 469.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 656 | 655.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 434.2 | 440.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 482.9 | 481.9 | 6 | – | – | – | 9/9 | clean | 8/9 | – | FAIL: a drag answered ok with no drop and nothing pending on 1 of 9 samples (1/2); the effect was not verified on 1 of 9 samples (1/2) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 427.1 | 471.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 461.6 | 351.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 656.4 | 654.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 157.5 | 156.8 | 6 | – | – | – | 6/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 254.2 | 252.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 445.1 | 439 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 254.3 | 253 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 428.3 | 427.3 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 431 | 434.2 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| identity | identity_apart | cua | 90.6 | 89.3 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 16.2 | 15.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 16 | 15.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 16.1 | 15.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 99.6 | 98.7 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 16.2 | 15.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 15.8 | 15.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 17.4 | 16.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 17.6 | 17.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.3 | 0.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 26.2 | 25.6 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 13.2 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 26.1 | 25.8 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 13.1 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 13 | 12.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 12.8 | 12.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 13.1 | 12.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 13.1 | 12.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 99.5 | 99.2 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 8 | 9 | 1 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| **run** | | 63 | 44 | 63 | 1 | 0 |

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

run valid; acceptance on the pinned release: **FAIL**: device-chrome-dnd chrome_dnd_shared cua, device-chrome-dnd chrome_dnd_short_in_front_shared cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-19T12:04:54.517Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 56918 requests, 10803 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead); left undone, the window not the run's then: pointer restore on (640, 400); pointer restore on (640, 400); pointer restore on (640, 400)

