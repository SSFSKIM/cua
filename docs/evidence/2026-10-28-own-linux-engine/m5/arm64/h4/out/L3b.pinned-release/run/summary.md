# linux-engine-diff summary

## pinned-L3b (experiment settle; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| electron-input press_key background | shipped | 30 | 4 (4 / 0 / 0 / 0) | 30 | 30 consecutive, 4 of them #302 |
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
| electron-input press_key desktop | shipped | 30 | 7 (7 / 0 / 0 / 0) | 30 | 30 consecutive, 7 of them #302 |
| electron-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_up desktop | shipped | 33 | 5 (5 / 0 / 0 / 0) | 0 | not reached |
| electron-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| electron-input press_key background | clean | 31772 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31776 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31778 | 5 of 5 | 0 |
| electron-input click background | clean | 31853 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39641 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39698 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39643 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39643 | 5 of 5 | 0 |
| electron-input move background | clean | 58613 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39816 | 5 of 5 | 0 |
| electron-input drag background | clean | 38795 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23888 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32605 | 5 of 5 | 0 |

**#302**, a declared limit (an Electron page's key release reached the tree after press_key's settle, the key-down inside it and the release caught up by the next run's reading): counted toward the streak, listed apart.

| cell | lane | #302 runs | the key-up seen after the answer (ms) |
|---|---|---:|---|
| electron-input press_key background | shipped | 4 of 30 | 271.2, 272.6, 234.8, 292.9 |
| electron-input press_key desktop | shipped | 7 of 30 | 231.4, 249.5, 277.2, 234.3, 256.7, 232.8, 341.8 |

**Incomplete or failed:** electron-input key_up desktop (shipped): no 30 consecutive passing runs in 33.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5122 requests, 456 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1634962 openbox

