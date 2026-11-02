# linux-engine-diff summary

## t4-fix-minimized (development run, not a release gate)

commit 48b828acb98771e9fd7e0aa395b0eb3f5d2766fe; cua-engine 0.3.0 (f4db168a5e0a); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 850296c9d9dabc6373488a01ac109e7e1abe87ce91d5086d7791385d677100b4, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (f4db168a5e0a); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| minimized | minimized_press_key | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 4.6 | 4.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 85.5 | 75.7 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 91 | 105.2 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 117.3 | 113.7 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 5.5 | 4.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 8.7 | 8.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1002.2 | 1003.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.4 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 100.7 | 100.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 243 samples, against the run's cap of 1% (2.43).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T10:38:32.962Z

