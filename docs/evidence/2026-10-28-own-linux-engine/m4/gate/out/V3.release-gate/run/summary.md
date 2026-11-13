# linux-engine-diff summary

## m4-gate-V3 (release gate)

commit 514f5c62dd6c74b1ed24c48f112ca9c35a70eece; cua-engine 0.4.0 (514f5c62dd6c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | click_element | pinned | 343 | 339.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 341.2 | 341.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 43 | 35.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-315.61, -288.64]; warm faster [-319.4, -298.645]) |
| chrome-input | click_element | **bar** | 341.2 | 339.4 | | | | | | | | | |
| chrome-input | right_click | pinned | 359.3 | 368.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 359.4 | 360.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 55.7 | 51.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-316.165, -293.675]; warm faster [-319.56, -297.755]) |
| chrome-input | right_click | **bar** | 359.3 | 360.3 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 700.3 | 702.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 700.7 | 715.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 45.3 | 41.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-670.66, -637.34]; warm faster [-669.51, -641.25]) |
| chrome-input | right_click_fallback | **bar** | 700.3 | 702.4 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 350.5 | 352.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 348.4 | 353.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 41.7 | 36.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-315.755, -295.58]; warm faster [-326.555, -308.985]) |
| chrome-input | secondary_action | **bar** | 348.4 | 352.3 | | | | | | | | | |
| chrome-input | move | pinned | 206.1 | 202.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 207.8 | 203.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 5.7 | 1.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.23, -200.21]; warm faster [-201.4, -200.95]) |
| chrome-input | move | **bar** | 206.1 | 202.2 | | | | | | | | | |
| chrome-input | drag | pinned | 712.5 | 708.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 416.8 | 412.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 4.1 | 1.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top; m4/drop-signals/ (T13), m4/drag-predicates/ (T15)) |
| chrome-input | drag | **bar** | 416.8 | 412.3 | | | | | | | | | |
| chrome-input | scroll | pinned | 314.8 | 311.2 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 316.3 | 311.8 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 114 | 110.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.14, -200.06]; warm faster [-201.32, -200.93]) |
| chrome-input | scroll | **bar** | 314.8 | 311.2 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 350.7 | 340.5 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 349 | 347.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 41.9 | 37.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-314.22, -292.25]; warm faster [-312.19, -296.255]) |
| chrome-input | scroll_element_hidden | **bar** | 349 | 340.5 | | | | | | | | | |
| chrome-input | key_down | pinned | 239 | 235.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 206 | 202.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 5.1 | 0.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.335, -200.35]; warm faster [-201.635, -201.33]) |
| chrome-input | key_down | **bar** | 206 | 202.3 | | | | | | | | | |
| chrome-input | key_up | pinned | 134 | 133.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 0.5 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.34, -100.165]; warm faster [-100.39, -100.235]) |
| chrome-input | key_up | **bar** | 100.8 | 100.8 | | | | | | | | | |
| chrome-input | activate_window | pinned | 4.1 | 0.5 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 3.9 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 10.4 | 7.9 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | FAIL: cua: cold 10.4 ms > bar 3.86 ms, the interval [5.635, 7.8] above 0; cua: warm 7.9 ms > bar 0.52 ms, the interval [6.145, 8.97] above 0 |
| chrome-input | activate_window | **bar** | 3.9 | 0.5 | | | | | | | | | |
| retention | after_resize | pinned | 620.5 | 596.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 597.1 | 604.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 85.7 | 92.3 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-521.47, -479.7]; warm faster [-521.485, -486.38]) |
| retention | after_resize | **bar** | 597.1 | 596.7 | | | | | | | | | |
| retention | after_remap | pinned | 598.9 | 604.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 583.8 | 586.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 97.7 | 90.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-513.99, -476.2]; warm faster [-513.235, -474.02]) |
| retention | after_remap | **bar** | 583.8 | 586.5 | | | | | | | | | |
| retention | after_covered_change | pinned | 600.9 | 620.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 593.7 | 606.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 90.7 | 93.4 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-525.535, -483.19]; warm faster [-547.375, -499.965]) |
| retention | after_covered_change | **bar** | 593.7 | 606.6 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.4 | 0.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.5 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 8.2 | 6.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 83 | 88.2 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 88.6 | 80.3 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 117.5 | 110.1 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 10.2 | 7.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 10.2 | 9.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1002.8 | 1001.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.4 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.5 | 0.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.7 | 0.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| retention | pinned | 120/120 | 0 | 0 |  |
| retention | newest | 120/120 | 0 | 0 |  |
| retention | cua | 120/120 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| chrome-input | right_click | cua | – | – | background | – | – |
| chrome-input | right_click_fallback | cua | – | – | background | – | – |
| chrome-input | move | cua | – | – | background | – | – |
| chrome-input | scroll | cua | – | – | background | – | – |
| chrome-input | scroll_element_hidden | cua | – | – | background | – | – |
| chrome-input | key_down | cua | – | – | background | – | – |
| chrome-input | key_up | cua | – | – | background | – | – |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | – | – | foreground | – | – |
| minimized-recorder | minimized_key_up_background | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1923 samples, against the run's cap of 1% (19.23).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; release gate: **FAIL**: chrome-input activate_window cua; **declared refusal** (a loss, not a pass): chrome-input drag cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-13T21:10:28.354Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 15022 requests, 3339 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

