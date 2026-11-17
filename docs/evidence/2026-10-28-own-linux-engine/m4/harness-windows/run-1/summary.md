# linux-engine-diff summary

## harness-windows-1 (development run, not a release gate)

commit 1773390c64af2e43c6dc3f65eef7c8da807a9842; cua-engine 0.3.0 (e6ed649f9d91); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 858f75ab4b1fa994bf4d58b87010ca466b2b2d95cf229c8a2d2f697d2a8b679c, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (e6ed649f9d91); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 558.1 | 613.5 | 21 | 3188 / 3188 | 3188 / 3188 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 563.4 | 602 | 21 | 3188 / 3188 | 3188 / 3188 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 82.9 | 78.6 | 21 | 3188 / 3187 | 75 / 87 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-517.71, -459.025]; warm faster [-565.42, -505.74]) |
| gedit | tree | **bar** | 558.1 | 602 | | | | | | | | | |
| gedit | press_key | pinned | 272.9 | 269.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 239.8 | 235.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 106.2 | 101.3 | 20 | – | – | – | 40/40 | clean | 0/40 | 40/40 | FAIL: cua: the effect was not verified on 40 samples (0/0, 0/1, 0/2, 0/3, 0/4) (cold faster [-134.09, -133.095]; warm faster [-134.555, -134.23]) |
| gedit | press_key | **bar** | 239.8 | 235.7 | | | | | | | | | |
| gedit | click | pinned | 218.9 | 214.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | newest | 221 | 215.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | click | cua | 119.6 | 114 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-99.87, -98.82]; warm faster [-101.28, -100.64]) |
| gedit | click | **bar** | 218.9 | 214.8 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.4 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 6.6 | 5.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 93.3 | 86.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 84.8 | 90.6 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 149.1 | 107.4 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 7.1 | 7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 10.7 | 10.3 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1004.1 | 1003.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.4 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.5 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 100.8 | 100.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |
| gedit | click | cua | – | – | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 606 samples, against the run's cap of 1% (6.06).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: gedit press_key cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T12:31:46.762Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0140000e; the harness's own trace: 32407 requests, 1997 changes of a window, every one of its own

