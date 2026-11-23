# linux-engine-diff summary

## pinned-V3 (acceptance on the pinned release)

commit 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; cua-engine 0.4.1 (7522dcb8fb8c); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | click_element | pinned | 257 | 254 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | newest | 257.8 | 255.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | click_element | cua | 21.7 | 18.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-236.4, -234.385]; warm faster [-236.6, -235.1]) |
| chrome-input | click_element | **bar** | 257 | 254 | | | | | | | | | |
| chrome-input | right_click | pinned | 271.5 | 268.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | newest | 272.7 | 269.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click | cua | 36 | 32.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-236.14, -234.46]; warm faster [-237.3, -235.115]) |
| chrome-input | right_click | **bar** | 271.5 | 268.9 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 508.6 | 512.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | newest | 508.4 | 512.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | right_click_fallback | cua | 1024.9 | 1021 | 20 | – | – | – | 40/40 | clean | 40/40 | 0/40 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | right_click_fallback | **bar** | 508.4 | 512.1 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 254.7 | 253.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | newest | 254.3 | 254.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | secondary_action | cua | 1023.2 | 1020 | 20 | – | – | – | 40/40 | clean | 40/40 | 0/40 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | secondary_action | **bar** | 254.3 | 253.8 | | | | | | | | | |
| chrome-input | move | pinned | 203.6 | 201 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | newest | 204.3 | 201.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | move | cua | 3.1 | 0.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.51, -200.44]; warm faster [-200.55, -200.47]) |
| chrome-input | move | **bar** | 203.6 | 201 | | | | | | | | | |
| chrome-input | drag | pinned | 657.7 | 655.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | newest | 399.9 | 397.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | drag | cua | 2.6 | 0.5 | 20 | – | – | – | 40/40 | clean | – | 0/40 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top; m4/drop-signals/ (T13), m4/drag-predicates/ (T15)) |
| chrome-input | drag | **bar** | 399.9 | 397.1 | | | | | | | | | |
| chrome-input | scroll | pinned | 311.9 | 309.4 | 20 | – | – | – | 40/40 | clean | 34/40 | 40/40 |  |
| chrome-input | scroll | newest | 312.7 | 309.7 | 20 | – | – | – | 40/40 | clean | 35/40 | 40/40 |  |
| chrome-input | scroll | cua | 111.5 | 108.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.43, -200.3]; warm faster [-200.5, -200.405]) |
| chrome-input | scroll | **bar** | 311.9 | 309.4 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 254.2 | 252.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | newest | 255.1 | 252.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| chrome-input | scroll_element_hidden | cua | 21.6 | 18.1 | 20 | – | – | – | 40/40 | clean | – | 40/40 | PASS (cold faster [-233.52, -232.085]; warm faster [-235.055, -233.69]) |
| chrome-input | scroll_element_hidden | **bar** | 254.2 | 252.1 | | | | | | | | | |
| chrome-input | key_down | pinned | 236.6 | 234 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | newest | 203.5 | 200.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_down | cua | 3 | 0.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-200.57, -200.47]; warm faster [-200.59, -200.56]) |
| chrome-input | key_down | **bar** | 203.5 | 200.9 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.4 | 133.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | newest | 100.4 | 100.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome-input | key_up | cua | 0.2 | 0.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-100.18, -100.145]; warm faster [-100.185, -100.15]) |
| chrome-input | key_up | **bar** | 100.4 | 100.4 | | | | | | | | | |
| chrome-input | activate_window | pinned | 2.2 | 0.2 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | newest | 2.3 | 0.2 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 |  |
| chrome-input | activate_window | cua | 2.6 | 1.1 | 20 | – | – | – | 0/40 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 40/40 | 40/40 | PASS (cold within the bound [0.315, 0.405]; warm within the bound [0.885, 0.955]) |
| chrome-input | activate_window | **bar** | 2.2 | 0.2 | | | | | | | | | |
| retention | after_resize | pinned | 294.8 | 296.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | newest | 295.8 | 297.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_resize | cua | 76.6 | 78.5 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-219.22, -217.53]; warm faster [-220.21, -217.35]) |
| retention | after_resize | **bar** | 294.8 | 296.9 | | | | | | | | | |
| retention | after_remap | pinned | 297.8 | 298.1 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | newest | 298.2 | 299.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_remap | cua | 78.8 | 78.9 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-220.33, -217.845]; warm faster [-219.73, -218.55]) |
| retention | after_remap | **bar** | 297.8 | 298.1 | | | | | | | | | |
| retention | after_covered_change | pinned | 297.5 | 297.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | newest | 296.6 | 298.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| retention | after_covered_change | cua | 78.6 | 78.7 | 20 | – | – | 0 | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-219.425, -217.53]; warm faster [-219.17, -218.25]) |
| retention | after_covered_change | **bar** | 296.6 | 297.4 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_list | cua | 4.6 | 4.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 48.9 | 48.2 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 48.3 | 48.2 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 70.1 | 57 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 4.8 | 4.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 5.7 | 5.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1004.8 | 1004.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.2 | 0.1 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.3 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.2 | 0.2 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| chrome-input | activate_window | cua | cold | 2.6 | 2.24 | pinned | [0.315, 0.405] | 1 |
| chrome-input | activate_window | cua | warm | 1.13 | 0.23 | newest | [0.885, 0.955] | 1 |

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

run valid; acceptance on the pinned release: no verdict FAIL; **declared refusal** (a loss, not a pass): chrome-input drag cua; **declared unconfirmed** (a loss, not a pass): chrome-input right_click_fallback cua, chrome-input secondary_action cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-19T10:49:25.089Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 15050 requests, 3339 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

