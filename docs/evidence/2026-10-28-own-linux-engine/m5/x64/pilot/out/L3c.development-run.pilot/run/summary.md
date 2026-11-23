# linux-engine-diff summary

## m4-dev-L3c-pilot (experiment settle; development run, not a release gate)

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
| firefox-input press_key background | clean | 31282 | 5 of 5 | 0 |
| firefox-input key_down background | clean | 31373 | 5 of 5 | 0 |
| firefox-input key_up background | clean | 31400 | 5 of 5 | 0 |
| firefox-input click background | clean | 31571 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 39035 | 5 of 5 | 0 |
| firefox-input right_click background | clean | 39281 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 39038 | 5 of 5 | 0 |
| firefox-input move background | clean | 57893 | 5 of 5 | 0 |
| firefox-input scroll background | clean | 39396 | 5 of 5 | 0 |
| firefox-input drag background | clean | 37947 | 5 of 5 | 0 |
| firefox-text press_key background | clean | 23518 | 5 of 5 | 0 |
| firefox-text type_text background | clean | 32221 | 5 of 5 | 0 |
| gedit press_key background | clean | 15066 | 5 of 5 | 0 |
| gedit key_down background | clean | 15071 | 5 of 5 | 0 |
| gedit click background | clean | 303 | 5 of 5 | 0 |
| gedit drag background | clean | 2014 | 5 of 5 | 0 |
| gedit type_text background | clean | 20780 | 5 of 5 | 0 |
| gedit clipboard_read background | clean | 5575 | 5 of 5 | 0 |
| gedit clipboard_write background | clean | 26589 | 5 of 5 | 0 |

**Incomplete or failed:** firefox-input press_key background (shipped): a development series of 2, not the 30 the rule needs; firefox-input key_down background (shipped): a development series of 2, not the 30 the rule needs; firefox-input key_up background (shipped): a development series of 2, not the 30 the rule needs; firefox-input click background (shipped): a development series of 2, not the 30 the rule needs; firefox-input click_element background (shipped): a development series of 2, not the 30 the rule needs; firefox-input right_click background (shipped): a development series of 2, not the 30 the rule needs; firefox-input secondary_action background (shipped): a development series of 2, not the 30 the rule needs; firefox-input move background (shipped): a development series of 2, not the 30 the rule needs; firefox-input scroll background (shipped): a development series of 2, not the 30 the rule needs; firefox-input drag background (shipped): a development series of 2, not the 30 the rule needs; firefox-text press_key background (shipped): a development series of 2, not the 30 the rule needs; firefox-text type_text background (shipped): a development series of 2, not the 30 the rule needs; firefox-text activate_window background (shipped): a development series of 2, not the 30 the rule needs; firefox-input click dedicated (shipped): a development series of 2, not the 30 the rule needs; firefox-input right_click dedicated (shipped): a development series of 2, not the 30 the rule needs; firefox-input move dedicated (shipped): a development series of 2, not the 30 the rule needs; firefox-input scroll dedicated (shipped): a development series of 2, not the 30 the rule needs; firefox-input drag dedicated (shipped): a development series of 2, not the 30 the rule needs; gedit press_key background (shipped): a development series of 2, not the 30 the rule needs; gedit key_down background (shipped): a development series of 2, not the 30 the rule needs; gedit click background (shipped): a development series of 2, not the 30 the rule needs; gedit drag background (shipped): a development series of 2, not the 30 the rule needs; gedit activate_window background (shipped): a development series of 2, not the 30 the rule needs; gedit type_text background (shipped): a development series of 2, not the 30 the rule needs; gedit clipboard_read background (shipped): a development series of 2, not the 30 the rule needs; gedit clipboard_write background (shipped): a development series of 2, not the 30 the rule needs; gedit press_key desktop (shipped): a development series of 2, not the 30 the rule needs; gedit click desktop (shipped): a development series of 2, not the 30 the rule needs; gedit drag desktop (shipped): a development series of 2, not the 30 the rule needs; gedit drag_handle desktop (shipped): a development series of 2, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 3801 requests, 393 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

