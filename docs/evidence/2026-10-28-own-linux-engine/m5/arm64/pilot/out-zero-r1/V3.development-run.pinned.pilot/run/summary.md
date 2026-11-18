# linux-engine-diff summary

## pdev-V3 (development run on the pinned release, not acceptance, never counted)

commit da306cc6319e7e9da282812402308c074b872dee; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-input | click_element | pinned | 253.5 | 250.6 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | click_element | newest | 256.1 | 253.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | click_element | cua | 20.6 | 17.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 20.59 ms against the bar 253.53 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 17.52 ms against the bar 250.57 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | click_element | **bar** | 253.5 | 250.6 | | | | | | | | | |
| chrome-input | right_click | pinned | 273 | 270.4 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | right_click | newest | 271.8 | 269.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | right_click | cua | 35.7 | 31.6 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 35.74 ms against the bar 271.75 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 31.59 ms against the bar 269.47 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | right_click | **bar** | 271.8 | 269.5 | | | | | | | | | |
| chrome-input | right_click_fallback | pinned | 505.9 | 503.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | right_click_fallback | newest | 510.3 | 508 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | right_click_fallback | cua | 1023.9 | 1020.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 0/6 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | right_click_fallback | **bar** | 505.9 | 503.2 | | | | | | | | | |
| chrome-input | secondary_action | pinned | 252.1 | 250.4 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | secondary_action | newest | 256.2 | 252.7 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | secondary_action | cua | 1022.3 | 1018.9 | 5 | – | – | – | 6/6 | clean | 6/6 | 0/6 | **declared unconfirmed**, a loss, not a pass (Decision Log, 2026-11-14 (T18 gate: a requested context menu is confirmed, or answered menuUnconfirmed; candidate 3), rulings 687 and 688) |
| chrome-input | secondary_action | **bar** | 252.1 | 250.4 | | | | | | | | | |
| chrome-input | move | pinned | 203.4 | 200.9 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | move | newest | 204.3 | 201.3 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | move | cua | 3 | 0.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 3.03 ms against the bar 203.41 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.45 ms against the bar 200.92 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | move | **bar** | 203.4 | 200.9 | | | | | | | | | |
| chrome-input | drag | pinned | 659.1 | 655.7 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | drag | newest | 400 | 397.1 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | drag | cua | 2.4 | 0.5 | 5 | – | – | – | 6/6 | clean | – | 0/6 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top; m4/drop-signals/ (T13), m4/drag-predicates/ (T15)) |
| chrome-input | drag | **bar** | 400 | 397.1 | | | | | | | | | |
| chrome-input | scroll | pinned | 311.8 | 309.3 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | scroll | newest | 312.6 | 309.6 | 5 | – | – | – | 6/6 | clean | 4/6 | 6/6 |  |
| chrome-input | scroll | cua | 111.4 | 108.9 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 111.36 ms against the bar 311.79 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 108.91 ms against the bar 309.34 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | scroll | **bar** | 311.8 | 309.3 | | | | | | | | | |
| chrome-input | scroll_element_hidden | pinned | 254.5 | 251.7 | 5 | – | – | – | 6/6 | clean | – | 6/6 |  |
| chrome-input | scroll_element_hidden | newest | 261.2 | 255.6 | 5 | – | – | – | 6/6 | clean | – | 6/6 |  |
| chrome-input | scroll_element_hidden | cua | 20.8 | 17.4 | 5 | – | – | – | 6/6 | clean | – | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 20.84 ms against the bar 254.45 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 17.37 ms against the bar 251.74 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | scroll_element_hidden | **bar** | 254.5 | 251.7 | | | | | | | | | |
| chrome-input | key_down | pinned | 236.5 | 234 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | key_down | newest | 203.4 | 200.9 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | key_down | cua | 2.9 | 0.4 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 2.89 ms against the bar 203.42 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.36 ms against the bar 200.94 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | key_down | **bar** | 203.4 | 200.9 | | | | | | | | | |
| chrome-input | key_up | pinned | 133.4 | 133.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | key_up | newest | 100.3 | 100.4 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome-input | key_up | cua | 0.2 | 0.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 0.2 ms against the bar 100.33 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.22 ms against the bar 100.35 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | key_up | **bar** | 100.3 | 100.4 | | | | | | | | | |
| chrome-input | activate_window | pinned | 2.6 | 0.2 | 5 | – | – | – | 0/6 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 6/6 | 6/6 |  |
| chrome-input | activate_window | newest | 2.4 | 0.2 | 5 | – | – | – | 0/6 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 6/6 | 6/6 |  |
| chrome-input | activate_window | cua | 2.6 | 1.1 | 5 | – | – | – | 0/6 | **_NET_ACTIVE_WINDOW ClientMessage, ConfigureWindow stack-mode, SetInputFocus** | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 2.62 ms against the bar 2.43 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 1.12 ms against the bar 0.22 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome-input | activate_window | **bar** | 2.4 | 0.2 | | | | | | | | | |
| retention | after_resize | pinned | 288.3 | 284.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_resize | newest | 285.9 | 285.8 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_resize | cua | 70.3 | 72.7 | 5 | – | – | 0 | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 70.27 ms against the bar 285.9 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 72.65 ms against the bar 284.16 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| retention | after_resize | **bar** | 285.9 | 284.2 | | | | | | | | | |
| retention | after_remap | pinned | 284.6 | 287 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_remap | newest | 286.1 | 290.3 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_remap | cua | 73.1 | 73 | 5 | – | – | 0 | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 73.05 ms against the bar 284.55 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 73.02 ms against the bar 287.02 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| retention | after_remap | **bar** | 284.6 | 287 | | | | | | | | | |
| retention | after_covered_change | pinned | 283.9 | 284.9 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_covered_change | newest | 288.7 | 287.7 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| retention | after_covered_change | cua | 72.3 | 72.4 | 5 | – | – | 0 | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 72.29 ms against the bar 283.91 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 72.43 ms against the bar 284.92 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| retention | after_covered_change | **bar** | 283.9 | 284.9 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_key_down | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_right_click | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click_element | cua | 0.2 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_secondary_action | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_move | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_scroll | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_drag | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_text | cua | 0.2 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_characters | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_clipboard_read | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_clipboard_write | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_press_key_dedicated | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_click_dedicated | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_type_text_dedicated | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_list | cua | 4.5 | 4.4 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_tree | cua | 47.3 | 47.1 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_shot | cua | 47.5 | 47 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_restored_shot | cua | 68.5 | 54.8 | 2 | – | – | 0 | 3/3 | clean | – | – | PASS |
| minimized | minimized_restored_list | cua | 4.7 | 4.6 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized | minimized_activate | cua | 5.6 | 3.3 | 2 | – | – | – | 0/3 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1005.1 | 1004.8 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_shared | cua | 0.1 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_dedicated | cua | 0.2 | 0.1 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-xterm | minimized_xterm_key_up_foreground | cua | 0.2 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |
| minimized-recorder | minimized_key_up_background | cua | 0.2 | 0.2 | 2 | – | – | – | 3/3 | clean | – | – | PASS |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| retention | pinned | 18/18 | 0 | 0 |  |
| retention | newest | 18/18 | 0 | 0 |  |
| retention | cua | 18/18 | 0 | 0 |  |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 333 samples, against the run's cap of 1% (3.33).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run on the pinned release, not acceptance, never counted: no verdict FAIL; **declared refusal** (a loss, not a pass): chrome-input drag cua; **declared unconfirmed** (a loss, not a pass): chrome-input right_click_fallback cua, chrome-input secondary_action cua; **unjudged** (a pilot takes no top-up; not a pass): chrome-input click_element cua, chrome-input right_click cua, chrome-input right_click_fallback cua, chrome-input secondary_action cua, chrome-input move cua, chrome-input drag cua, chrome-input scroll cua, chrome-input scroll_element_hidden cua, chrome-input key_down cua, chrome-input key_up cua, chrome-input activate_window cua, retention after_resize cua, retention after_remap cua, retention after_covered_change cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-18T04:57:36.233Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 6111 requests, 1293 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

