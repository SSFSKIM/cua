# linux-engine-diff summary

## m4-gate-F3a (experiment focus-timer; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 48.9 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 238.1 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 44.8 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 57.8 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 198.1 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 49.8 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 82.2 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 203.5 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 95.6 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 105.4 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 209.9 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 96.1 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 82.6 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 336.9 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 40.1 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 78.1 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 199.1 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 31.8 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 75.3 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 563.5 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 68.2 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 83.1 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 184.2 |

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

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 903 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

