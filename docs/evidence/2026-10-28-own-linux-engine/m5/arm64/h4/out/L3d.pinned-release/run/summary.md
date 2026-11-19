# linux-engine-diff summary

## pinned-L3d (experiment settle; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| kate click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| kate activate_window background | shipped | 33 | 3 (3 / 0 / 0 / 0) | 0 | not reached |
| qtcreator click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator key_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| qtcreator activate_window background | shipped | 51 | 3 (3 / 0 / 0 / 0) | 0 | not reached |
| writer click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer activate_window background | shipped | 39 | 2 (2 / 0 / 0 / 0) | 0 | not reached |
| writer type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal click desktop | shipped | 31 | 2 (2 / 0 / 0 / 0) | 0 | not reached |
| gnome-terminal scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal click background | shipped | 34 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gnome-terminal activate_window background | shipped | 40 | 2 (2 / 0 / 0 / 0) | 0 | not reached |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| kate press_key background | clean | 16311 | 5 of 5 | 0 |
| kate key_down background | clean | 16316 | 5 of 5 | 0 |
| kate click background | clean | 5700 | 5 of 5 | 0 |
| kate key_click background | clean | 5828 | 5 of 5 | 0 |
| kate drag background | clean | 7194 | 5 of 5 | 0 |
| qtcreator press_key background | clean | 16317 | 5 of 5 | 0 |
| qtcreator key_down background | clean | 16330 | 5 of 5 | 0 |
| qtcreator click background | clean | 5706 | 5 of 5 | 0 |
| qtcreator key_click background | clean | 5837 | 5 of 5 | 0 |
| qtcreator drag background | clean | 7351 | 5 of 5 | 0 |
| writer press_key background | clean | 206 | 5 of 5 | 0 |
| writer key_down background | clean | 215 | 5 of 5 | 0 |
| writer click background | clean | 304 | 5 of 5 | 0 |
| writer drag background | clean | 1876 | 5 of 5 | 0 |
| writer type_text background | clean | 6141 | 5 of 5 | 0 |
| gnome-terminal press_key background | clean | 210 | 5 of 5 | 0 |
| gnome-terminal key_down background | clean | 214 | 5 of 5 | 0 |
| gnome-terminal click background | clean | 310 | 5 of 5 | 0 |
| gnome-terminal scroll background | clean | 283 | 5 of 5 | 0 |
| gnome-terminal type_text background | clean | 6115 | 5 of 5 | 0 |

**Incomplete or failed:** gnome-terminal click desktop (shipped): no 30 consecutive passing runs in 31; kate activate_window background (shipped): no 30 consecutive passing runs in 33; qtcreator activate_window background (shipped): no 30 consecutive passing runs in 51; writer activate_window background (shipped): no 30 consecutive passing runs in 39; gnome-terminal activate_window background (shipped): no 30 consecutive passing runs in 40.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 10692 requests, 890 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1673631 openbox

