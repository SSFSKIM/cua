# linux-engine-diff summary

## m5-pinned-dev-L3c-pilot (experiment settle; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| firefox-input press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input key_up background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input right_click background | shipped | 3 | 1 (0 / 0 / 1 / 0) | 2 | 2 consecutive |
| firefox-input secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-text press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-text type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-text activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input click dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input right_click dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input move dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input scroll dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| firefox-input drag dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit clipboard_read background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit clipboard_write background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit press_key desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gedit drag_handle desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| firefox-input press_key background | clean | 31289 | 5 of 5 | 0 |
| firefox-input key_down background | clean | 31384 | 5 of 5 | 0 |
| firefox-input key_up background | clean | 31398 | 5 of 5 | 0 |
| firefox-input click background | clean | 31596 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 39036 | 5 of 5 | 0 |
| firefox-input right_click background | clean | 39301 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 39035 | 5 of 5 | 0 |
| firefox-input move background | clean | 56346 | 5 of 5 | 0 |
| firefox-input scroll background | clean | 39410 | 5 of 5 | 0 |
| firefox-input drag background | clean | 38004 | 5 of 5 | 0 |
| firefox-text press_key background | clean | 23516 | 5 of 5 | 0 |
| firefox-text type_text background | clean | 32253 | 5 of 5 | 0 |
| gedit press_key background | clean | 15068 | 5 of 5 | 0 |
| gedit key_down background | clean | 15071 | 5 of 5 | 0 |
| gedit click background | clean | 307 | 5 of 5 | 0 |
| gedit drag background | clean | 2048 | 5 of 5 | 0 |
| gedit type_text background | clean | 20779 | 5 of 5 | 0 |
| gedit clipboard_read background | clean | 5575 | 5 of 5 | 0 |
| gedit clipboard_write background | clean | 26596 | 5 of 5 | 0 |

Unjudged in this pilot (a series shorter than its minimum; not a pass): firefox-input press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input key_up background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input click_element background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input right_click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input secondary_action background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input move background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input scroll background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-text press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-text type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-text activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input click dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input right_click dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input move dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input scroll dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); firefox-input drag dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit clipboard_read background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit clipboard_write background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit press_key desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit drag desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); gedit drag_handle desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 3122 requests, 393 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 454448 openbox

