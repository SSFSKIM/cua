# linux-engine-diff summary

## t62f-fitted-load2 (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text clipboard_read background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text clipboard_write background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input press_key desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
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
| firefox-text activate_window background | shipped | 34 | 1 (1 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input right_click dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input scroll dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input press_key background | clean | 27304 | 5 of 5 | 0 |
| chrome-input key_down background | clean | 27316 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27318 | 5 of 5 | 0 |
| chrome-input click background | clean | 27381 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34055 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34120 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34052 | 5 of 5 | 0 |
| chrome-input move background | clean | 43578 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34240 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34196 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20527 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28178 | 5 of 5 | 0 |
| chrome-text clipboard_read background | clean | 7429 | 5 of 5 | 0 |
| chrome-text clipboard_write background | clean | 36025 | 5 of 5 | 0 |
| firefox-input press_key background | clean | 31283 | 5 of 5 | 0 |
| firefox-input key_down background | clean | 31391 | 5 of 5 | 0 |
| firefox-input key_up background | clean | 31404 | 5 of 5 | 0 |
| firefox-input click background | clean | 31629 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 39027 | 5 of 5 | 0 |
| firefox-input right_click background | clean | 39331 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 39029 | 5 of 5 | 0 |
| firefox-input move background | clean | 59507 | 5 of 5 | 0 |
| firefox-input scroll background | clean | 39460 | 5 of 5 | 0 |
| firefox-input drag background | clean | 38017 | 5 of 5 | 0 |
| firefox-text press_key background | clean | 23512 | 5 of 5 | 0 |
| firefox-text type_text background | clean | 32210 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 19661 requests, 1974 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

