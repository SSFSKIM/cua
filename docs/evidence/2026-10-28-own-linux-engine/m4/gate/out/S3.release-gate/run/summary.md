# linux-engine-diff summary

## m4-gate-S3 (experiment settle; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| kate click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| kate press_key background | clean | 16312 | 5 of 5 | 0 |
| kate key_down background | clean | 16312 | 5 of 5 | 0 |
| kate click background | clean | 5702 | 5 of 5 | 0 |
| kate key_click background | clean | 5832 | 5 of 5 | 0 |
| kate drag background | clean | 7219 | 5 of 5 | 0 |
| qtcreator press_key background | clean | 16320 | 5 of 5 | 0 |
| qtcreator key_down background | clean | 16319 | 5 of 5 | 0 |
| qtcreator click background | clean | 5706 | 5 of 5 | 0 |
| qtcreator key_click background | clean | 5841 | 5 of 5 | 0 |
| qtcreator drag background | clean | 7089 | 5 of 5 | 0 |
| writer press_key background | clean | 208 | 5 of 5 | 0 |
| writer key_down background | clean | 213 | 5 of 5 | 0 |
| writer click background | clean | 303 | 5 of 5 | 0 |
| writer drag background | clean | 1823 | 5 of 5 | 0 |
| writer type_text background | clean | 6140 | 5 of 5 | 0 |
| gnome-terminal press_key background | clean | 207 | 5 of 5 | 0 |
| gnome-terminal key_down background | clean | 208 | 5 of 5 | 0 |
| gnome-terminal click background | clean | 307 | 5 of 5 | 0 |
| gnome-terminal scroll background | clean | 262 | 5 of 5 | 0 |
| gnome-terminal type_text background | clean | 6119 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 11931 requests, 718 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

