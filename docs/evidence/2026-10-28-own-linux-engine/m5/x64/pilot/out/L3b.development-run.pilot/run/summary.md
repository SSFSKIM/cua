# linux-engine-diff summary

## m4-dev-L3b-pilot (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
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
| electron-input press_key background | clean | 31770 | 5 of 5 | 0 |
| electron-input key_down background | clean | 31772 | 5 of 5 | 0 |
| electron-input key_up background | clean | 31776 | 5 of 5 | 0 |
| electron-input click background | clean | 31842 | 5 of 5 | 0 |
| electron-input click_element background | clean | 39639 | 5 of 5 | 0 |
| electron-input right_click background | clean | 39698 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 39644 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 39644 | 5 of 5 | 0 |
| electron-input move background | clean | 63344 | 5 of 5 | 0 |
| electron-input scroll background | clean | 39813 | 5 of 5 | 0 |
| electron-input drag background | clean | 38650 | 5 of 5 | 0 |
| electron-text press_key background | clean | 23883 | 5 of 5 | 0 |
| electron-text type_text background | clean | 32604 | 5 of 5 | 0 |

**Incomplete or failed:** electron-input press_key background (shipped): a development series of 2, not the 30 the rule needs; electron-input key_down background (shipped): a development series of 2, not the 30 the rule needs; electron-input key_up background (shipped): a development series of 2, not the 30 the rule needs; electron-input click background (shipped): a development series of 2, not the 30 the rule needs; electron-input click_element background (shipped): a development series of 2, not the 30 the rule needs; electron-input right_click background (shipped): a development series of 2, not the 30 the rule needs; electron-input secondary_action background (shipped): a development series of 2, not the 30 the rule needs; electron-input menu_unconfirmed background (shipped): a development series of 2, not the 30 the rule needs; electron-input move background (shipped): a development series of 2, not the 30 the rule needs; electron-input scroll background (shipped): a development series of 2, not the 30 the rule needs; electron-input drag background (shipped): a development series of 2, not the 30 the rule needs; electron-text press_key background (shipped): a development series of 2, not the 30 the rule needs; electron-text type_text background (shipped): a development series of 2, not the 30 the rule needs; electron-text activate_window background (shipped): a development series of 2, not the 30 the rule needs; electron-input press_key desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input key_down desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input key_up desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input click desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input move desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input move_relative desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input scroll desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input drag desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input drag_handle desktop (shipped): a development series of 2, not the 30 the rule needs; electron-input drag dedicated (shipped): a development series of 2, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 2585 requests, 204 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

