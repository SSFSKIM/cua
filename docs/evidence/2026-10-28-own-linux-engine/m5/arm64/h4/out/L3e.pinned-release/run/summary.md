# linux-engine-diff summary

## pinned-L3e (experiment settle; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

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
| xterm click background | clean | 301 | 5 of 5 | 0 |
| xterm scroll background | clean | 245 | 5 of 5 | 0 |
| xterm drag background | clean | 2151 | 5 of 5 | 0 |
| settle-gtk3 click background | clean | 16508 | 5 of 5 | 0 |
| settle-gtk3 click_element background | clean | 21757 | 5 of 5 | 0 |
| settle-gtk3 move background | clean | 42312 | 5 of 5 | 0 |
| settle-gtk3 scroll background | clean | 16439 | 5 of 5 | 0 |
| settle-qt5 click background | clean | 21794 | 5 of 5 | 0 |
| settle-qt5 key_click background | clean | 21924 | 5 of 5 | 0 |
| settle-qt5 click_element background | clean | 21654 | 5 of 5 | 0 |
| settle-qt5 move background | clean | 44219 | 5 of 5 | 0 |
| settle-qt5 secondary_action background | clean | 21655 | 5 of 5 | 0 |
| settle-qt6 click background | clean | 21792 | 5 of 5 | 0 |
| settle-qt6 key_click background | clean | 21921 | 5 of 5 | 0 |
| settle-qt6 click_element background | clean | 21650 | 5 of 5 | 0 |
| settle-qt6 move background | clean | 42073 | 5 of 5 | 0 |
| settle-qt6 secondary_action background | clean | 21651 | 5 of 5 | 0 |
| gtk4-button click_element background | clean | 38686 | 5 of 5 | 0 |
| gtk4-button secondary_action background | clean | 38686 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 20084 requests, 1667 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1715907 openbox

