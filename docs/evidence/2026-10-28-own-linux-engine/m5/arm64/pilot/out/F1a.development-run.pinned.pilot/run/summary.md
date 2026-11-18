# linux-engine-diff summary

## m5-pinned-dev-F1a-pilot (experiment focus-timer; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 8.3 |
| chrome | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 12.8 |
| chrome | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 156.8 |
| electron | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 9.9 |
| electron | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 14.2 |
| electron | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 133.1 |
| gedit | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 6.9 |
| gedit | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 10.5 |
| gedit | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 135.2 |
| kate | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 7.9 |
| kate | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 10.3 |
| kate | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 137.8 |
| qtcreator | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 8.6 |
| qtcreator | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 13.6 |
| qtcreator | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 162.2 |
| firefox | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 7.3 |
| firefox | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 13.4 |
| firefox | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 138.4 |
| writer | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 6.6 |
| writer | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 10.2 |
| writer | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 217 |
| gnome-terminal | shipped | burst | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 6.4 |
| gnome-terminal | shipped | aba | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 8.1 |
| gnome-terminal | shipped | paste | 2 | 0 | 2 | **unjudged** (a pilot) | 0 | 2 | 135 |

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

Unjudged in this pilot (a series shorter than its minimum; not a pass): chrome burst: a series of 2, shorter than the 30 the proof needs (a pilot); chrome aba: a series of 2, shorter than the 30 the proof needs (a pilot); chrome paste: a series of 2, shorter than the 30 the proof needs (a pilot); electron burst: a series of 2, shorter than the 30 the proof needs (a pilot); electron aba: a series of 2, shorter than the 30 the proof needs (a pilot); electron paste: a series of 2, shorter than the 30 the proof needs (a pilot); gedit burst: a series of 2, shorter than the 30 the proof needs (a pilot); gedit aba: a series of 2, shorter than the 30 the proof needs (a pilot); gedit paste: a series of 2, shorter than the 30 the proof needs (a pilot); kate burst: a series of 2, shorter than the 30 the proof needs (a pilot); kate aba: a series of 2, shorter than the 30 the proof needs (a pilot); kate paste: a series of 2, shorter than the 30 the proof needs (a pilot); qtcreator burst: a series of 2, shorter than the 30 the proof needs (a pilot); qtcreator aba: a series of 2, shorter than the 30 the proof needs (a pilot); qtcreator paste: a series of 2, shorter than the 30 the proof needs (a pilot); firefox burst: a series of 2, shorter than the 30 the proof needs (a pilot); firefox aba: a series of 2, shorter than the 30 the proof needs (a pilot); firefox paste: a series of 2, shorter than the 30 the proof needs (a pilot); writer burst: a series of 2, shorter than the 30 the proof needs (a pilot); writer aba: a series of 2, shorter than the 30 the proof needs (a pilot); writer paste: a series of 2, shorter than the 30 the proof needs (a pilot); gnome-terminal burst: a series of 2, shorter than the 30 the proof needs (a pilot); gnome-terminal aba: a series of 2, shorter than the 30 the proof needs (a pilot); gnome-terminal paste: a series of 2, shorter than the 30 the proof needs (a pilot).

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1078 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 138164 openbox

