# linux-engine-diff summary

## pdev-V4 (development run on the pinned release, not acceptance, never counted)

commit da306cc6319e7e9da282812402308c074b872dee; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-textarea | type_text | pinned | 933.2 | 839.8 | 5 | – | – | – | 6/6 | clean | 4/6 | 6/6 |  |
| chrome-textarea | type_text | newest | 843.3 | 2299.3 | 5 | – | – | – | 6/6 | clean | 1/1 | 1/6 |  |
| chrome-textarea | type_text | cua | 54.4 | 51.8 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 54.44 ms against the bar 843.29 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 51.79 ms against the bar 839.84 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-textarea | type_text | **bar** | 843.3 | 839.8 | | | | | | | | | |
| chrome-address-bar | type_text | pinned | 935.1 | 923 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-address-bar | type_text | newest | 883.9 | 888 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-address-bar | type_text | cua | 65.9 | 66.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 65.85 ms against the bar 883.89 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 66.23 ms against the bar 887.98 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-address-bar | type_text | **bar** | 883.9 | 888 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 307.3 | 303.7 | 5 | – | – | – | 6/6 | clean | – | 6/6 |  |
| gnome-text-editor | type_text | newest | 756.9 | 769.9 | 5 | – | – | – | 6/6 | clean | – | 0/6 |  |
| gnome-text-editor | type_text | cua | 46.8 | 44.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 (6 declared) | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 46.83 ms with no vendor bar, undetermined: 1 samples, fewer than 20; not judged on medians; cua: warm 44.24 ms with no vendor bar, undetermined: 5 samples, fewer than 20; not judged on medians (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |
| gnome-text-editor | gte_type_text_shared | cua | 1.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_shared | cua | 1 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_click_dedicated | cua | 87.8 | 14.1 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-gtk4 | gtk4_key_shared | cua | 1 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_key_dedicated | cua | 1.9 | 0.9 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-gtk4 | gtk4_key_down_shared | cua | 0.9 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_right_click_shared | cua | 8.3 | 7.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_element_click | cua | 9.5 | 8.2 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-gtk4 | gtk4_scroll_shared | cua | 1 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_scroll_dedicated | cua | 184.5 | 110.6 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-gtk4 | gtk4_move_shared | cua | 0.9 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_move_dedicated | cua | 51.3 | 74.9 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-gtk4 | gtk4_drag_shared | cua | 1 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-gtk4 | gtk4_drag_dedicated | cua | 84.1 | 10.9 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-xterm | xterm_key_shared | cua | 0.3 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-xterm | xterm_key_dedicated | cua | 1.4 | 1.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-xterm | xterm_click_shared | cua | 13.6 | 12.8 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-qt | qt_scroll_shared | cua | 0.9 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 183.8 | 110.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| chrome-textarea | type_text | pinned | 6/6 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 6/6 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 6/6 | background | background | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | pinned | 6/6 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 6/6 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 6/6 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 6/6 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 6/6 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 6/6 | foreground | foreground | stacking, focus, active | 0 / 0 / 0 |
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-gtk4 | gtk4_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_move_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-gtk4 | gtk4_drag_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-xterm | xterm_key_dedicated | cua | – | foreground | foreground | stacking, active, focus | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 40.53484500013292 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 38.44647400081158 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 37.757006000727415 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 39.473891999572515 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 37.48869000002742 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 37.695948999375105 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 526 | next request 60 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 103,71 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 95,64 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 95,65 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 140 | max 152 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2054 | next request 7 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2055 | next request 7 ms |
| paste-target | stalled_incr | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2065 | next request 7 ms; transfer ended |
| paste-target | late_convert | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2066 | late-convert:1500 |
| paste-target | late_convert | 1 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2065 | late-convert:3000 |
| paste-target | late_convert | 2 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2066 | late-convert-current:3000 |
| paste-target | unreadable | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 69 |  |
| gnome-text-editor | restore_refused | 0 | PASS | success | 66 | route foreground |

The cases' bus trace (23744 calls of 248 connections): PasteText 0, InsertText 0, SetTextContents 0.

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 111 samples, against the run's cap of 1% (1.11).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

Text windows a lane ended (a vendor's restarted before its next request, never scored; a candidate's stops the run): pinned 0, newest 0, cua 0.

run valid; development run on the pinned release, not acceptance, never counted: no verdict FAIL; **unjudged** (a pilot takes no top-up; not a pass): chrome-textarea type_text cua, chrome-address-bar type_text cua, gnome-text-editor type_text cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-18T05:08:28.541Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 11814 requests, 3346 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

