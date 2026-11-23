# linux-engine-diff summary

## m4-dev-V3-pilot (development run, not a release gate)

commit 01ff0648f3afc4a234669cd381395c91543ce3f7; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | click_element | pinned | 354.4 | 356.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 346.1 | 349.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 41.7 | 38.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-330.23, -295.67]; warm faster [-330.12, -295.33]) |
| chrome-input | click_element | **bar** | 346.1 | 349.4 | | | | | | | | | |
| chrome-input | right_click | pinned | 375.3 | 349.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 373.5 | 366.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 62.6 | 56.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-334.67, -295.86]; warm faster [-305.255, -284.305]) |
| chrome-input | right_click | **bar** | 373.5 | 349.2 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 725.3 | 700.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 704.1 | 689.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 1046.7 | 1041.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 0/40 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | right_click_fallback | **bar** | 704.1 | 689.2 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 362.5 | 347.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 359.4 | 348.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 1048.3 | 1041.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 0/40 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | secondary_action | **bar** | 359.4 | 347.5 | | | | | | | | | |
| chrome-input | move | pinned | 206.4 | 202.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 207.4 | 203 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 5.6 | 1.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.58, -199.815]; warm faster [-201.295, -200.875]) |
| chrome-input | move | **bar** | 206.4 | 202.3 | | | | | | | | | |
| chrome-input | drag | pinned | 722.8 | 707 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 420.3 | 413.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 3.9 | 1.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top; m4/drop-signals/ (T13), m4/drag-predicates/ (T15)) |
| chrome-input | drag | **bar** | 420.3 | 413.1 | | | | | | | | | |
| chrome-input | scroll | pinned | 314.9 | 311.3 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | newest | 316.3 | 312.4 | 20 | – | – | – | 40/40 | clean | 32/40 | 40/40 |  |
| chrome-input | scroll | cua | 114.5 | 110.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.855, -199.93]; warm faster [-201.59, -201.105]) |
| chrome-input | scroll | **bar** | 314.9 | 311.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 356.5 | 354.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 361.8 | 348.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 43.6 | 36.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-321.64, -299.415]; warm faster [-325.565, -297.56]) |
| chrome-input | scroll_element_hidden | **bar** | 356.5 | 348.9 | | | | | | | | | |
| chrome-input | key_down | pinned | 238.9 | 235.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 205.7 | 202.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 5 | 0.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-201.03, -200.37]; warm faster [-201.57, -201.275]) |
| chrome-input | key_down | **bar** | 205.7 | 202.3 | | | | | | | | | |
| chrome-input | key_up | pinned | 134 | 134 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.8 | 100.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 0.5 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.375, -100.23]; warm faster [-100.545, -100.275]) |
| chrome-input | key_up | **bar** | 100.8 | 100.9 | | | | | | | | | |
| chrome-input | activate_window | pinned | 4.8 | 0.5 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 4.8 | 0.6 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 12.6 | 7.3 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | **declared gap** (#373), a loss, not a pass: cua: cold 12.57 ms > bar 4.77 ms, the interval [5.785, 11.975] above 0; cua: warm 7.25 ms > bar 0.5 ms, the interval [5.905, 9.46] above 0 (Decision Log, M4, T18 gate, candidate 1 (V3, by #373; sminos 666, 667), encoded by M5) |
| chrome-input | activate_window | **bar** | 4.8 | 0.5 | | | | | | | | | |
| retention | after_resize | pinned | 626.6 | 618.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 631.7 | 611.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 99.8 | 107.1 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-567.955, -501.93]; warm faster [-525.27, -467.11]) |
| retention | after_resize | **bar** | 626.6 | 611.7 | | | | | | | | | |
| retention | after_remap | pinned | 611.7 | 621.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 663.9 | 662.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 97.9 | 90.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-597.24, -486.73]; warm faster [-559.305, -497.885]) |
| retention | after_remap | **bar** | 611.7 | 621.9 | | | | | | | | | |
| retention | after_covered_change | pinned | 592 | 647 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 623.1 | 620.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 97.3 | 94.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-543.945, -478.965]; warm faster [-574.445, -504.235]) |
| retention | after_covered_change | **bar** | 592 | 620.6 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.4 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.6 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.4 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.4 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.6 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.4 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.4 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_list | cua | 6.7 | 5.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 85.9 | 88.3 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 86.5 | 79 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 152.2 | 113.8 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 7.5 | 6.7 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 10.3 | 11.3 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1005.1 | 1002.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.3 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.6 | 0.3 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.5 | 0.5 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.5 | 0.4 | 2 | – | – | – | 3/3 | clean | – | – | PASS |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1761 samples, against the run's cap of 1% (17.61).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **declared refusal** (a loss, not a pass): chrome-input drag cua; **declared unconfirmed** (a loss, not a pass): chrome-input right_click_fallback cua, chrome-input secondary_action cua; **declared gap** (a loss, not a pass): chrome-input activate_window cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-15T05:15:49.047Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 10163 requests, 2313 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

