# linux-engine-diff summary

## pinned-L3b (experiment settle; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| electron-input press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
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
| electron-input press_key background | clean | 31770 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31778 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31775 | 5 of 5 | 0 |
| electron-input click background | clean | 31843 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39640 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39697 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39643 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39644 | 5 of 5 | 0 |
| electron-input move background | clean | 61767 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39816 | 5 of 5 | 0 |
| electron-input drag background | clean | 38646 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23881 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32603 | 5 of 5 | 0 |

**#302**, a declared limit (an Electron page's key release reached the tree after press_key's settle, the key-down inside it and the release caught up by the next run's reading): counted toward the streak, listed apart.

| cell | lane | #302 runs | the key-up seen after the answer (ms) |
|---|---|---:|---|
| electron-input press_key desktop | shipped | 5 of 30 | 291.6, 303.4, 230, 233.9, 273.1 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6067 requests, 456 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 927023 openbox

