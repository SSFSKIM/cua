# linux-engine-diff summary

## m4-dev-L3a-pilot (experiment settle; development run, not a release gate)

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
| chrome-input move desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input move_relative desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag_handle desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| chrome-input drag dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input press_key background | clean | 27331 | 5 of 5 | 0 |
| chrome-input key_down background | clean | 27317 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27316 | 5 of 5 | 0 |
| chrome-input click background | clean | 27384 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34063 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34126 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34070 | 5 of 5 | 0 |
| chrome-input menu_unconfirmed background | clean | 34068 | 5 of 5 | 0 |
| chrome-input move background | clean | 46290 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34236 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34155 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20529 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28181 | 5 of 5 | 0 |
| chrome-text clipboard_read background | clean | 7430 | 5 of 5 | 0 |
| chrome-text clipboard_write background | clean | 36028 | 5 of 5 | 0 |

**Incomplete or failed:** chrome-input press_key background (shipped): a development series of 2, not the 30 the rule needs; chrome-input key_down background (shipped): a development series of 2, not the 30 the rule needs; chrome-input key_up background (shipped): a development series of 2, not the 30 the rule needs; chrome-input click background (shipped): a development series of 2, not the 30 the rule needs; chrome-input click_element background (shipped): a development series of 2, not the 30 the rule needs; chrome-input right_click background (shipped): a development series of 2, not the 30 the rule needs; chrome-input secondary_action background (shipped): a development series of 2, not the 30 the rule needs; chrome-input menu_unconfirmed background (shipped): a development series of 2, not the 30 the rule needs; chrome-input move background (shipped): a development series of 2, not the 30 the rule needs; chrome-input scroll background (shipped): a development series of 2, not the 30 the rule needs; chrome-input drag background (shipped): a development series of 2, not the 30 the rule needs; chrome-text press_key background (shipped): a development series of 2, not the 30 the rule needs; chrome-text type_text background (shipped): a development series of 2, not the 30 the rule needs; chrome-text clipboard_read background (shipped): a development series of 2, not the 30 the rule needs; chrome-text clipboard_write background (shipped): a development series of 2, not the 30 the rule needs; chrome-text activate_window background (shipped): a development series of 2, not the 30 the rule needs; chrome-input press_key desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input key_down desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input key_up desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input click desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input move desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input move_relative desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input scroll desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input drag desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input drag_handle desktop (shipped): a development series of 2, not the 30 the rule needs; chrome-input drag dedicated (shipped): a development series of 2, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 3011 requests, 356 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

