# linux-engine-diff summary

## pinned-S4 (experiment settle; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| xterm click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| xterm press_key dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 activate_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 activate_click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 scroll dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 scroll dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-button click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-button secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input press_key dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input move dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input scroll dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-text-editor type_text dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-text-editor activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| xterm click background | clean | 302 | 5 of 5 | 0 |
| xterm scroll background | clean | 247 | 5 of 5 | 0 |
| xterm drag background | clean | 2152 | 5 of 5 | 0 |
| settle-gtk3 click background | clean | 16482 | 5 of 5 | 0 |
| settle-gtk3 click_element background | clean | 21753 | 5 of 5 | 0 |
| settle-gtk3 move background | clean | 70362 | 5 of 5 | 0 |
| settle-gtk3 scroll background | clean | 16437 | 5 of 5 | 0 |
| settle-qt5 click background | clean | 21798 | 5 of 5 | 0 |
| settle-qt5 key_click background | clean | 21928 | 5 of 5 | 0 |
| settle-qt5 click_element background | clean | 21658 | 5 of 5 | 0 |
| settle-qt5 move background | clean | 69973 | 5 of 5 | 0 |
| settle-qt5 secondary_action background | clean | 21659 | 5 of 5 | 0 |
| settle-qt6 click background | clean | 21798 | 5 of 5 | 0 |
| settle-qt6 key_click background | clean | 21928 | 5 of 5 | 0 |
| settle-qt6 click_element background | clean | 21660 | 5 of 5 | 0 |
| settle-qt6 move background | clean | 69973 | 5 of 5 | 0 |
| settle-qt6 secondary_action background | clean | 21658 | 5 of 5 | 0 |
| gtk4-button click_element background | clean | 38686 | 5 of 5 | 0 |
| gtk4-button secondary_action background | clean | 38686 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 29319 requests, 1667 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1005059 openbox

