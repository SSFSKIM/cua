# linux-engine-diff summary

## pinned-S2 (experiment settle; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

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
| firefox-input key_down background | clean | 31338 | 5 of 5 | 0 |
| firefox-input key_up background | clean | 31372 | 5 of 5 | 0 |
| firefox-input click background | clean | 31568 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 39035 | 5 of 5 | 0 |
| firefox-input right_click background | clean | 39268 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 39035 | 5 of 5 | 0 |
| firefox-input move background | clean | 85863 | 5 of 5 | 0 |
| firefox-input scroll background | clean | 39383 | 5 of 5 | 0 |
| firefox-input drag background | clean | 37913 | 5 of 5 | 0 |
| firefox-text press_key background | clean | 23513 | 5 of 5 | 0 |
| firefox-text type_text background | clean | 32170 | 5 of 5 | 0 |
| gedit press_key background | clean | 15063 | 5 of 5 | 0 |
| gedit key_down background | clean | 15069 | 5 of 5 | 0 |
| gedit click background | clean | 302 | 5 of 5 | 0 |
| gedit drag background | clean | 1997 | 5 of 5 | 0 |
| gedit type_text background | clean | 20835 | 5 of 5 | 0 |
| gedit clipboard_read background | clean | 5575 | 5 of 5 | 0 |
| gedit clipboard_write background | clean | 26631 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 18953 requests, 1569 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 924214 openbox

