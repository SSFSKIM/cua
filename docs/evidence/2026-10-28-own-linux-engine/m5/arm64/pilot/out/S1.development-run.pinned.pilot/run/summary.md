# linux-engine-diff summary

## m5-pinned-dev-S1-pilot (experiment settle; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input key_up background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input right_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input menu_unconfirmed background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-text press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-text type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-text clipboard_read background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-text clipboard_write background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-text activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input press_key desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input key_down desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input key_up desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input move desktop | shipped | 3 | 1 (1 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input move_relative desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag_handle desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input key_up background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input right_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input menu_unconfirmed background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-text press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-text type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-text activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input press_key desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input key_down desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input key_up desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input move desktop | shipped | 3 | 1 (1 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input move_relative desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input drag_handle desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| electron-input drag dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input press_key background | clean | 27302 | 5 of 5 | 0 |
| chrome-input key_down background | clean | 27314 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27315 | 5 of 5 | 0 |
| chrome-input click background | clean | 27382 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34064 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34123 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34069 | 5 of 5 | 0 |
| chrome-input menu_unconfirmed background | clean | 34068 | 5 of 5 | 0 |
| chrome-input move background | clean | 59842 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34236 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34159 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20526 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28179 | 5 of 5 | 0 |
| chrome-text clipboard_read background | clean | 7430 | 5 of 5 | 0 |
| chrome-text clipboard_write background | clean | 36024 | 5 of 5 | 0 |
| electron-input press_key background | clean | 31768 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31774 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31773 | 5 of 5 | 0 |
| electron-input click background | clean | 31841 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39638 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39694 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39643 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39643 | 5 of 5 | 0 |
| electron-input move background | clean | 96484 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39812 | 5 of 5 | 0 |
| electron-input drag background | clean | 38646 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23883 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32602 | 5 of 5 | 0 |

Unjudged in this pilot (a series shorter than its minimum; not a pass): chrome-input press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input key_up background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input click_element background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input right_click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input secondary_action background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input menu_unconfirmed background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input move background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input scroll background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-text press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-text type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-text clipboard_read background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-text clipboard_write background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-text activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input press_key desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input key_down desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input key_up desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input move desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input move_relative desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input scroll desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input drag desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input drag_handle desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); chrome-input drag dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input key_down background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input key_up background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input click_element background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input right_click background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input secondary_action background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input menu_unconfirmed background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input move background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input scroll background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input drag background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-text press_key background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-text type_text background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-text activate_window background (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input press_key desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input key_down desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input key_up desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input click desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input move desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input move_relative desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input scroll desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input drag desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input drag_handle desktop (shipped): a series of 2, shorter than the 30 the rule needs (a pilot); electron-input drag dedicated (shipped): a series of 2, shorter than the 30 the rule needs (a pilot).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6532 requests, 555 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 92472 openbox

