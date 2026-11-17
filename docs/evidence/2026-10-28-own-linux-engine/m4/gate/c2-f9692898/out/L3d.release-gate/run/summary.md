# linux-engine-diff summary

## m4-gate-L3d (experiment settle; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| kate click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate activate_window background | shipped | 38 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
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
| kate key_down background | clean | 16317 | 5 of 5 | 0 |
| kate click background | clean | 5700 | 5 of 5 | 0 |
| kate key_click background | clean | 5830 | 5 of 5 | 0 |
| kate drag background | clean | 7197 | 5 of 5 | 0 |
| qtcreator press_key background | clean | 16317 | 5 of 5 | 0 |
| qtcreator key_down background | clean | 16326 | 5 of 5 | 0 |
| qtcreator click background | clean | 5705 | 5 of 5 | 0 |
| qtcreator key_click background | clean | 5838 | 5 of 5 | 0 |
| qtcreator drag background | clean | 7071 | 5 of 5 | 0 |
| writer press_key background | clean | 207 | 5 of 5 | 0 |
| writer key_down background | clean | 212 | 5 of 5 | 0 |
| writer click background | clean | 305 | 5 of 5 | 0 |
| writer drag background | clean | 1823 | 5 of 5 | 0 |
| writer type_text background | clean | 6144 | 5 of 5 | 0 |
| gnome-terminal press_key background | clean | 208 | 5 of 5 | 0 |
| gnome-terminal key_down background | clean | 211 | 5 of 5 | 0 |
| gnome-terminal click background | clean | 311 | 5 of 5 | 0 |
| gnome-terminal scroll background | clean | 261 | 5 of 5 | 0 |
| gnome-terminal type_text background | clean | 6120 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 11348 requests, 750 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

