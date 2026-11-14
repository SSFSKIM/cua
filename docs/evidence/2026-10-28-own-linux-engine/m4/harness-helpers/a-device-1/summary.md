# linux-engine-diff summary

## t74w3-a-device-1 (development run, not a release gate)

commit –; cua-engine 0.3.0 (83dd7e5bfedb); occlusion covered; 1 blocks; 2 warm tree reads and 2 warm inputs per block

candidate: sha256 0239447e9d53762d6699d8f39b6bf02e8ac717eb76834e33d62772fe76ae1f66, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (83dd7e5bfedb); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | 93.3 | 15.7 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_click_pointer_out_dedicated | cua | 91.4 | 91.5 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | 20.1 | 15.7 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-xterm | xterm_click_shared | cua | 16.2 | 15.4 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-qt | qt_scroll_dedicated | cua | 187.8 | 114.3 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome | chrome_drag_covered_dedicated | cua | 334.2 | 332.2 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 396.6 | 406.6 | 2 | – | – | – | 3/3 | clean | 3/3 | – | PASS |
| minimized | minimized_press_key | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.4 | 0.4 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.4 | 0.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 3 | 3 | 3 | 0 | 0 |
| **run** | | 3 | 3 | 3 | 0 | 0 |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-gtk4 | gtk4_click_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_pointer_out_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-firefox | firefox_click_overlap_pointer_in_shared | cua | – | background | background | – | – |
| device-xterm | xterm_click_shared | cua | – | background | background | – | – |
| device-qt | qt_scroll_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome | chrome_drag_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 30 samples, against the run's cap of 1% (0.3).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-12T15:20:28.957Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 4249 requests, 504 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

