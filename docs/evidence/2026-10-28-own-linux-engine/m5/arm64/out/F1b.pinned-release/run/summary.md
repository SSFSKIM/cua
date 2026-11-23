# linux-engine-diff summary

## pinned-F1b (experiment focus-timer; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 80.6 |
| chrome | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 80.5 |
| electron | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 67.2 |
| electron | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 67 |
| gedit | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 71.3 |
| kate | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 76.8 |
| qtcreator | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 100.7 |
| writer | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 155 |
| gnome-terminal | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 70.3 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | click-paste | – | clean | 2 (0) | yes | – |
| chrome | shipped | click-field | – | clean | 2 (0) | yes | – |
| electron | shipped | click-paste | – | clean | 2 (0) | yes | – |
| electron | shipped | click-field | – | clean | 2 (0) | yes | – |
| gedit | shipped | click-paste | – | clean | 2 (0) | yes | – |
| kate | shipped | click-paste | – | clean | 2 (0) | yes | – |
| qtcreator | shipped | click-paste | – | clean | 2 (0) | yes | – |
| writer | shipped | click-paste | – | clean | 2 (0) | yes | – |
| gnome-terminal | shipped | click-paste | – | clean | 2 (0) | yes | – |

| family | scenario | not applicable |
|---|---|---|
| gedit | click-field | the family's scene has one text field a window |
| kate | click-field | the family's scene has one text field a window |
| qtcreator | click-field | the family's scene has one text field a window |
| firefox | click-paste | a background click moves no Gecko caret (refused while covered, taken but caret unmoved while fully unobscured) |
| firefox | click-field | the family's scene has one text field a window |
| writer | click-field | the family's scene has one text field a window |
| gnome-terminal | click-field | the family's scene has one text field a window |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 2489 requests, 314 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1091564 openbox

