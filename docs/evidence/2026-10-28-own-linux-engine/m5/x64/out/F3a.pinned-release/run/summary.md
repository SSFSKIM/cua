# linux-engine-diff summary

## pinned-F3a (experiment focus-timer; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 36.3 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 53.2 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 229.5 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 43.5 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 59.3 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 195 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 57 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 75.7 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 219.5 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 44.5 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 104.7 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 230.6 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 71.7 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 130 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 359.3 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 37.6 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 75.4 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 197.9 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 36 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 76.4 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 565.7 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 66.6 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 85.9 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 230.3 |

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

desktop: started with no window active, ended with 0x0080000c active (harness), neither acted on; holder none; the harness's own trace: 896 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1228348 openbox

