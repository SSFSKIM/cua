# linux-engine-diff summary

## m4-gate-S1 (experiment settle; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
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
| chrome-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input press_key background | shipped | 32 | 10 (10 / 0 / 0 / 0) | 0 | not reached |
| electron-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
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
| chrome-input key_down background | clean | 27316 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27315 | 5 of 5 | 0 |
| chrome-input click background | clean | 27382 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34064 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34122 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34063 | 5 of 5 | 0 |
| chrome-input move background | clean | 55778 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34236 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34156 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20530 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28180 | 5 of 5 | 0 |
| chrome-text clipboard_read background | clean | 7430 | 5 of 5 | 0 |
| chrome-text clipboard_write background | clean | 36028 | 5 of 5 | 0 |
| electron-input press_key background | clean | 31769 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31773 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31775 | 5 of 5 | 0 |
| electron-input click background | clean | 31842 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39641 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39698 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39642 | 5 of 5 | 0 |
| electron-input move background | clean | 80702 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39812 | 5 of 5 | 0 |
| electron-input drag background | clean | 38648 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23882 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32602 | 5 of 5 | 0 |

**Incomplete or failed:** electron-input press_key background (shipped): no 30 consecutive passing runs in 32.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 14066 requests, 1547 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

