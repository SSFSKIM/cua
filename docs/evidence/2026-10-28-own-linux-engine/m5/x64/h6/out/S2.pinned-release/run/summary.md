# linux-engine-diff summary

## pinned-S2 (experiment settle; acceptance on the pinned release)

candidate: sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (9371d2348cf8); the pin's x64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| firefox-input press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input right_click background | shipped | 31 | 1 (0 / 0 / 1 / 0) | 30 | 30 consecutive |
| firefox-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-text press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-text type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-text activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input right_click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input scroll dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit clipboard_read background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit clipboard_write background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit press_key desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gedit drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| firefox-input press_key background | clean | 31283 | 5 of 5 | 0 |
| firefox-input key_down background | clean | 31360 | 5 of 5 | 0 |
| firefox-input key_up background | clean | 31386 | 5 of 5 | 0 |
| firefox-input click background | clean | 31568 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 39035 | 5 of 5 | 0 |
| firefox-input right_click background | clean | 39273 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 39035 | 5 of 5 | 0 |
| firefox-input move background | clean | 76539 | 5 of 5 | 0 |
| firefox-input scroll background | clean | 39396 | 5 of 5 | 0 |
| firefox-input drag background | clean | 37913 | 5 of 5 | 0 |
| firefox-text press_key background | clean | 23513 | 5 of 5 | 0 |
| firefox-text type_text background | clean | 32183 | 5 of 5 | 0 |
| gedit press_key background | clean | 15065 | 5 of 5 | 0 |
| gedit key_down background | clean | 15069 | 5 of 5 | 0 |
| gedit click background | clean | 303 | 5 of 5 | 0 |
| gedit drag background | clean | 2005 | 5 of 5 | 0 |
| gedit type_text background | clean | 20836 | 5 of 5 | 0 |
| gedit clipboard_read background | clean | 5575 | 5 of 5 | 0 |
| gedit clipboard_write background | clean | 26634 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 17720 requests, 1569 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1387597 openbox

