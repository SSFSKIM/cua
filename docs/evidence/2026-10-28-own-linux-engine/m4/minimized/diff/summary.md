# linux-engine-diff summary

## t4-minimized (development run, not a release gate)

commit 81a1ba773b0a7519f3ca3a4fa5bd12eb986f870e; cua-engine 0.3.0 (81a1ba773b0a); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 02787b64a1dac1056e127544a5fe8b0fb63bffda809d8291a6f151f58f124c42, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (81a1ba773b0a); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 63.6 | 52.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 59.1 | 42.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.8 | 5.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-54.61, -40.79]; warm faster [-41.55, -33.42]) |
| desktop | list_windows | **bar** | 59.1 | 42.7 | | | | | | | | | |
| desktop | list_apps | pinned | 58.7 | 46.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 59.5 | 49.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.2 | 5.7 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-56.54, -46.845]; warm faster [-46.38, -36.21]) |
| desktop | list_apps | **bar** | 58.7 | 46.7 | | | | | | | | | |
| desktop | get_screenshot | pinned | 37.3 | 27.4 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 38.7 | 29.5 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 36.5 | 24.4 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 36.52 against 37.32, within the pinned build's spread [30.5, 60.57]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm faster [-4.23, -1.23]) |
| desktop | get_screenshot | **bar** | 37.3 | 27.4 | | | | | | | | | |
| desktop | launch_app | pinned | 4.2 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 2.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-2.015, -0.47]; warm same (within noise) [-0.07, 0.07]) |
| desktop | launch_app | **bar** | 4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.2 | 0.1 | 21 | – | – | – | – | – | – | – | PASS |
| minimized | minimized_press_key | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.4 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.3 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 4 | 3.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 76.6 | 79.4 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 82.6 | 72 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 119 | 100.8 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 3.8 | 4.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_up_background | cua | 100.7 | 100.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 10.6 | 8.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1002 | 1001.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.4 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 28 | 0.0074 |  |
| desktop | cua | 61/61 | 28 | 0.0074 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| minimized | minimized_key_up_background | cua | – | – | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 819 samples, against the run's cap of 1% (8.19).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T08:35:47.828Z

