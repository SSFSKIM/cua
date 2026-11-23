# linux-engine-diff summary

## m4-gate-V5 (release gate)

commit f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad; cua-engine 0.4.0 (f96928983006); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.8 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.6 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 35.6 | 33.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 105.5 | 106.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 19 | 16.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 23.8 | 16.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 43.5 | 34.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.8 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 14 | 3.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 99.1 | 98.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 1.4 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 196.7 | 189.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 284.9 | 283.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.9 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 115.7 | 113.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 206.8 | 209.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 242.7 | 239.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.4 | 1.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 346.9 | 344.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 467.1 | 361.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 371.7 | 462 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 699.3 | 702 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 463.2 | 457.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 467 | 504.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 454.6 | 407.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 414.3 | 324.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 702.6 | 693.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 162.5 | 172.9 | 6 | – | – | – | 2/9 | clean | – | – | FAIL: a drop the witness did not record on 1 of 9 samples (2/0) |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 259.8 | 257.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 452.3 | 451.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 260 | 257.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 385.3 | 373.1 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 410.9 | 449.5 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| identity | identity_apart | cua | 93 | 97.3 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 23.7 | 23.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 23.8 | 23.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 26.1 | 24.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 127.3 | 113.6 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 27.7 | 25.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 24.3 | 25.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 27.7 | 24.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 26.7 | 23.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.5 | 0.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 41.5 | 43 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 26.4 | 20.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 38.9 | 42.4 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 19.7 | 20.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 20.2 | 22 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 21.1 | 21 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 24.4 | 18.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 19.2 | 20.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 188.6 | 170.7 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

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

run valid; release gate: **FAIL**: device-chrome-dnd chrome_dnd_late_take_shared cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-14T06:42:10.418Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 55358 requests, 10803 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

