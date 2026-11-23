# linux-engine-diff summary

## pinned-L3b (experiment settle; acceptance on the pinned release)

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); the pin's arm64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| electron-input press_key background | shipped | 30 | 3 (3 / 0 / 0 / 0) | 30 | 30 consecutive, 3 of them #302 |
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
| electron-input press_key desktop | shipped | 30 | 5 (5 / 0 / 0 / 0) | 30 | 30 consecutive, 5 of them #302 |
| electron-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input key_up desktop | shipped | 30 | 2 (2 / 0 / 0 / 0) | 30 | 30 consecutive, 2 of them #302 |
| electron-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| electron-input press_key background | clean | 31774 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31776 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31777 | 5 of 5 | 0 |
| electron-input click background | clean | 31850 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39641 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39697 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39644 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39643 | 5 of 5 | 0 |
| electron-input move background | clean | 57038 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39816 | 5 of 5 | 0 |
| electron-input drag background | clean | 38908 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23887 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32604 | 5 of 5 | 0 |

**#302**, a declared limit (an Electron page's key release reached the tree after the settle, the release caught up by the next run's reading: press_key's with its key-down inside the settle, or key_up's with the held key's press before the run and only its autorepeats late beside the release): counted toward the streak, listed apart.

| cell | lane | #302 runs | the key-up seen after the answer (ms) |
|---|---|---:|---|
| electron-input press_key background | shipped | 3 of 30 | 243, 240.5, 252.4 |
| electron-input press_key desktop | shipped | 5 of 30 | 331.2, 267.4, 276.8, 250.9, 244.9 |
| electron-input key_up desktop | shipped | 2 of 30 | 184.8, 188.6 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5060 requests, 456 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 489438 openbox

