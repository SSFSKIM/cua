# linux-engine-diff summary

## m4-gate-S1 (experiment settle; release gate)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input press_key background | shipped | 36 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input menu_unconfirmed background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text clipboard_read background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text clipboard_write background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input press_key desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move desktop | shipped | 31 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input press_key background | shipped | 32 | 5 (5 / 0 / 0 / 0) | 0 | not reached |
| electron-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input menu_unconfirmed background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-text press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-text type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-text activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input press_key desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_up desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move desktop | shipped | 31 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input press_key background | clean | 27307 | 5 of 5 | 0 |
| chrome-input key_down background | clean | 27314 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27315 | 5 of 5 | 0 |
| chrome-input click background | clean | 27383 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34063 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34122 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34068 | 5 of 5 | 0 |
| chrome-input menu_unconfirmed background | clean | 34067 | 5 of 5 | 0 |
| chrome-input move background | clean | 59842 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34237 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34158 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20531 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28181 | 5 of 5 | 0 |
| chrome-text clipboard_read background | clean | 7430 | 5 of 5 | 0 |
| chrome-text clipboard_write background | clean | 36026 | 5 of 5 | 0 |
| electron-input press_key background | clean | 33347 | 5 of 5 | 1 |
| electron-input key_down background | clean | 31775 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31774 | 5 of 5 | 0 |
| electron-input click background | clean | 31842 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39643 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39697 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39643 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39643 | 5 of 5 | 0 |
| electron-input move background | clean | 79124 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39812 | 5 of 5 | 0 |
| electron-input drag background | clean | 38645 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23882 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32604 | 5 of 5 | 0 |

**Incomplete or failed:** electron-input press_key background (shipped): no 30 consecutive passing runs in 32.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 14247 requests, 1563 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

