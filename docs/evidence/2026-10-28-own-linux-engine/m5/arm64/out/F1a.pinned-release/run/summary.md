# linux-engine-diff summary

## pinned-F1a (experiment focus-timer; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 9.2 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 13.2 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 147.8 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 9.6 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 13.6 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 133.3 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 7.4 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 9.9 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 137.1 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 8 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 10.6 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 141.8 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 9.4 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 14.2 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 164.3 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 8 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 15 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 138.9 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 7.6 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 11.7 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 221.9 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 7 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 9.1 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 136 |

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

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1061 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1056505 openbox

