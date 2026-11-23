# linux-engine-diff summary

## pdev-V5 (development run on the pinned release, not acceptance, never counted)

commit da306cc6319e7e9da282812402308c074b872dee; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-firefox | firefox_click_pointer_out_shared | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_under_shared | cua | 0.3 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_right_click_pointer_out_shared | cua | 17.4 | 16.4 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 87.7 | 87.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_click_visible_shared | cua | 14.9 | 13.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 14.8 | 14 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_element_click_covered | cua | 18.4 | 19.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_move_pointer_out_shared | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_move_overlap_pointer_in_shared | cua | 3.1 | 1.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_move_covered_dedicated | cua | 74.9 | 75.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_drag_pointer_out_shared | cua | 0.4 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_drag_overlap_pointer_in_shared | cua | 186.8 | 185.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_drag_covered_dedicated | cua | 260 | 259.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_scroll_pointer_out_shared | cua | 0.3 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-firefox | firefox_scroll_overlap_pointer_in_shared | cua | 110.9 | 109.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_scroll_covered_dedicated | cua | 184 | 183.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome | chrome_drag_visible_path_shared | cua | 236.8 | 235.9 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome | chrome_drag_covered_path_shared | cua | 0.6 | 0.5 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 327.8 | 327.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 386.7 | 348.4 | 2 | – | – | – | 3/3 | clean | – | – | FAIL: the background audit's requests did not answer as the case expects (success; Google-chrome began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped. Use a dedicated desktop, or activate the window first) |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 370.1 | 464.5 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 656.2 | 655.9 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 434.1 | 442.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 493.2 | 493.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 426.9 | 466.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 428.8 | 359.7 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 656.4 | 653.8 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 157.2 | 156.8 | 2 | – | – | – | 2/3 | clean | – | – | FAIL: a drop the witness did not record on 1 of 3 samples (0/0) |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 254 | 252.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 435.3 | 434.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 254.1 | 252.9 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 426.4 | 425.1 | 2 | – | – | – | 3/3 | clean | 0/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 443.9 | 431.2 | 2 | – | – | – | 3/3 | clean | 0/3 | – | PASS |
| identity | identity_apart | cua | 87.9 | 87.6 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity | identity_stacked | cua | 16.2 | 15.7 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 16.1 | 15.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 15.5 | 15.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 97.1 | 96.9 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity | identity_click_element | cua | 15.6 | 15.6 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 15.5 | 15.1 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_type_text | cua | 17.1 | 16.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 17.2 | 16.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_key_up | cua | 0.3 | 0.2 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 25.3 | 25.2 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 12.8 | 12.3 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 25.2 | 25.1 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 13 | 12.3 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 12.7 | 12.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 12.7 | 12.4 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 12.5 | 12.3 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 12.8 | 12 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 97.3 | 98.2 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 3 | 3 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 3 | 3 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 3 | 3 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 3 | 3 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 3 | 3 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 3 | 0 | 3 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 3 | 0 | 3 | 0 | 0 |
| **run** | | 21 | 15 | 21 | 0 | 0 |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 174 samples, against the run's cap of 1% (1.74).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run on the pinned release, not acceptance, never counted: **FAIL**: device-chrome-dnd chrome_dnd_shared cua, device-chrome-dnd chrome_dnd_late_take_shared cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-18T05:30:16.197Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 26153 requests, 4967 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead); left undone, the window not the run's then: pointer restore on (640, 400); pointer restore on (640, 400); pointer restore on (640, 400)

