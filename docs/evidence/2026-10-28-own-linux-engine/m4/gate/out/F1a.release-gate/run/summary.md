# linux-engine-diff summary

## m4-gate-F1a (experiment focus-timer; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.3 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 39.1 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 174 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.3 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 147.5 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 25 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 38.5 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 167.3 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.1 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 30 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 182.4 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 28.7 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 36.9 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 221.2 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 31.9 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 58.7 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 166.5 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 30.2 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 39.3 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 286.2 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 22 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 28 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 154.4 |

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

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 987 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

