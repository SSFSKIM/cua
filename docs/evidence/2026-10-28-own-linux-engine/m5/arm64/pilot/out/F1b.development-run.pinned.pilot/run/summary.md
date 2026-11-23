# linux-engine-diff summary

## m5-pinned-dev-F1b-pilot (experiment focus-timer; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 80 |
| chrome | shipped | click-field | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 90.5 |
| electron | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 66.8 |
| electron | shipped | click-field | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 66.9 |
| gedit | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 70.6 |
| kate | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 74.6 |
| qtcreator | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 99.5 |
| writer | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 162.1 |
| gnome-terminal | shipped | click-paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 70.2 |

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

Unjudged in this pilot (a series shorter than its minimum; not a pass): chrome click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); chrome click-field: a series of 2, shorter than the 30 the proof needs (a pilot); electron click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); electron click-field: a series of 2, shorter than the 30 the proof needs (a pilot); gedit click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); kate click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); qtcreator click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); writer click-paste: a series of 2, shorter than the 30 the proof needs (a pilot); gnome-terminal click-paste: a series of 2, shorter than the 30 the proof needs (a pilot).

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1044 requests, 90 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 145201 openbox

