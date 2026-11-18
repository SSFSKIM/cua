# linux-engine-diff summary

## m5-pinned-dev-L3d-pilot (experiment settle; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| kate click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer activate_window background | shipped | 3 | 1 (1 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| kate press_key background | clean | 16309 | 5 of 5 | 0 |
| kate key_down background | clean | 16314 | 5 of 5 | 0 |
| kate click background | clean | 5696 | 5 of 5 | 0 |
| kate key_click background | clean | 5825 | 5 of 5 | 0 |
| kate drag background | clean | 7197 | 5 of 5 | 0 |
| qtcreator press_key background | clean | 16320 | 5 of 5 | 0 |
| qtcreator key_down background | clean | 16328 | 5 of 5 | 0 |
| qtcreator click background | clean | 5706 | 5 of 5 | 0 |
| qtcreator key_click background | clean | 5837 | 5 of 5 | 0 |
| qtcreator drag background | clean | 7231 | 5 of 5 | 0 |
| writer press_key background | clean | 205 | 5 of 5 | 0 |
| writer key_down background | clean | 213 | 5 of 5 | 0 |
| writer click background | clean | 303 | 5 of 5 | 0 |
| writer drag background | clean | 1890 | 5 of 5 | 0 |
| writer type_text background | clean | 6141 | 5 of 5 | 0 |
| gnome-terminal press_key background | clean | 216 | 5 of 5 | 0 |
| gnome-terminal key_down background | clean | 234 | 5 of 5 | 0 |
| gnome-terminal click background | clean | 335 | 5 of 5 | 0 |
| gnome-terminal scroll background | clean | 266 | 5 of 5 | 0 |
| gnome-terminal type_text background | clean | 6124 | 5 of 5 | 0 |

Unjudged in this pilot (a series shorter than its minimum; not a pass): kate click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate drag desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate key_click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); kate activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator drag desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator key_click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); qtcreator activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); writer type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal scroll desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal scroll background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gnome-terminal activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 3088 requests, 274 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 462189 openbox

