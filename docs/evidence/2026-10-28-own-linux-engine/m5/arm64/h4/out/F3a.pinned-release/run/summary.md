# linux-engine-diff summary

## pinned-F3a (experiment focus-timer; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 42.8 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 62.1 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 270.4 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 58.3 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 68.7 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 222.3 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 535.6 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 748.2 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 428.1 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 434.5 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 90.1 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 498.1 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 411.9 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 93.3 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 446 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 44.7 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 78 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 194.9 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 44.4 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 71.1 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 543.1 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 582.1 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 744.5 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 540.7 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | burst | – | clean | 20 (0) | yes | – |
| chrome | shipped | aba | – | clean | 24 (0) | yes | – |
| chrome | shipped | paste | – | clean | 9 (0) | yes | – |
| electron | shipped | burst | – | clean | 20 (0) | yes | – |
| electron | shipped | aba | – | clean | 24 (0) | yes | – |
| electron | shipped | paste | – | clean | 9 (0) | yes | – |
| gedit | shipped | burst | – | clean | 20 (0) | yes | – |
| gedit | shipped | aba | – | clean | 24 (0) | yes | – |
| gedit | shipped | paste | – | clean | 9 (0) | yes | – |
| kate | shipped | burst | – | clean | 20 (0) | yes | – |
| kate | shipped | aba | – | clean | 24 (0) | yes | – |
| kate | shipped | paste | – | clean | 9 (0) | yes | – |
| qtcreator | shipped | burst | – | clean | 20 (0) | yes | – |
| qtcreator | shipped | aba | – | clean | 24 (0) | yes | – |
| qtcreator | shipped | paste | – | clean | 9 (0) | yes | – |
| firefox | shipped | burst | – | clean | 20 (0) | yes | – |
| firefox | shipped | aba | – | clean | 24 (0) | yes | – |
| firefox | shipped | paste | – | clean | 9 (0) | yes | – |
| writer | shipped | burst | – | clean | 20 (0) | yes | – |
| writer | shipped | aba | – | clean | 24 (0) | yes | – |
| writer | shipped | paste | – | clean | 9 (0) | yes | – |
| gnome-terminal | shipped | burst | – | clean | 20 (0) | yes | – |
| gnome-terminal | shipped | aba | – | clean | 24 (0) | yes | – |
| gnome-terminal | shipped | paste | – | clean | 9 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 731 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1779092 openbox

