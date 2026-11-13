# linux-engine-diff summary

## m4-gate-V5 (release gate)

commit 514f5c62dd6c74b1ed24c48f112ca9c35a70eece; cua-engine 0.4.0 (514f5c62dd6c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.8 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.9 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 34.5 | 31 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 109.1 | 108.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 22.3 | 16.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 24.4 | 16.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 36.6 | 37.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.7 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 13.3 | 3.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 96.6 | 104.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 0.8 | 0.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 196.8 | 189.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 280.3 | 283.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.6 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 115.4 | 113.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 205.2 | 206.1 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 242.6 | 239.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 1.5 | 1.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 341.3 | 345.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 401.5 | 366.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 375.1 | 464.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 163.9 | 180.9 | 6 | – | – | – | 2/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 459.7 | 461.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 460.5 | 462.6 | 6 | – | – | – | 9/9 | clean | 8/9 | – | FAIL: a drag answered ok with no drop and nothing pending on 1 of 9 samples (1/0); the effect was not verified on 1 of 9 samples (1/0) |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 448.9 | 418.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 419.7 | 327.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 177.9 | 160.3 | 6 | – | – | – | 3/9 | clean | – | – | FAIL: a request answered success on 1 of 9 samples (1/1); an answer was not honest on 1 of 9 samples (1/1) |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 178.5 | 171.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 260.2 | 258 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 454.6 | 449.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 259.3 | 257 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 369.6 | 408.3 | 6 | – | – | – | 9/9 | clean | 0/9 | – | FAIL: a drag answered ok with no drop and nothing pending on 1 of 9 samples (1/2) |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 387.2 | 442.2 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| identity | identity_apart | cua | 99.4 | 96.4 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 24.7 | 23.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 24.4 | 23.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 22.8 | 24.4 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 115 | 128.3 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 24.7 | 24.9 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 27.3 | 25 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 27 | 25.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 25.2 | 24.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.5 | 0.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 39.9 | 41.7 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 24.8 | 19.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 45.5 | 41.2 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 23 | 19.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 24.3 | 19.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 21.8 | 19.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 20.2 | 24.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 20.9 | 20.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 169.2 | 158.3 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 8 | 9 | 1 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 9 | 0 | 9 | 1 | 0 |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| **run** | | 63 | 44 | 63 | 2 | 0 |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_dedicated | cua | – | foreground | foreground | stacking, focus, active, pointer | – |
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

run valid; release gate: **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua, device-chrome-dnd chrome_dnd_obscured_in_front_late_shared cua, device-chrome-dnd chrome_dnd_inzone_out_in_front_shared cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-13T22:19:09.418Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 55330 requests, 10803 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

