# linux-engine-diff summary

## t62f-confirm-idle (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-button click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-button secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input click_element background | clean | 24803 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 24803 | 5 of 5 | 0 |
| electron-input click_element background | clean | 27195 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 27197 | 5 of 5 | 0 |
| firefox-input click_element background | clean | 27102 | 5 of 5 | 0 |
| firefox-input secondary_action background | clean | 27102 | 5 of 5 | 0 |
| settle-gtk3 click_element background | clean | 21750 | 5 of 5 | 0 |
| settle-qt5 click_element background | clean | 21652 | 5 of 5 | 0 |
| settle-qt5 secondary_action background | clean | 21652 | 5 of 5 | 0 |
| settle-qt6 click_element background | clean | 21656 | 5 of 5 | 0 |
| settle-qt6 secondary_action background | clean | 21655 | 5 of 5 | 0 |
| gtk4-button click_element background | clean | 21590 | 5 of 5 | 0 |
| gtk4-button secondary_action background | clean | 21590 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 1911 requests, 128 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

