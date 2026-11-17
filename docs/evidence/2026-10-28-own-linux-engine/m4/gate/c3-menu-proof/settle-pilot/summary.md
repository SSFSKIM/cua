# linux-engine-diff summary

## t78-settle-pilot (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input right_click background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |
| chrome-input secondary_action background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |
| chrome-input menu_unconfirmed background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |
| electron-input right_click background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |
| electron-input secondary_action background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |
| electron-input menu_unconfirmed background | shipped | 5 | 0 (0 / 0 / 0 / 0) | 5 | 5 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input right_click background | clean | 24868 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 24814 | 5 of 5 | 0 |
| chrome-input menu_unconfirmed background | clean | 24814 | 5 of 5 | 0 |
| electron-input right_click background | clean | 27261 | 5 of 5 | 0 |
| electron-input secondary_action background | clean | 27206 | 5 of 5 | 0 |
| electron-input menu_unconfirmed background | clean | 27207 | 5 of 5 | 0 |

**Incomplete or failed:** chrome-input right_click background (shipped): a development series of 5, not the 30 the rule needs; chrome-input secondary_action background (shipped): a development series of 5, not the 30 the rule needs; chrome-input menu_unconfirmed background (shipped): a development series of 5, not the 30 the rule needs; electron-input right_click background (shipped): a development series of 5, not the 30 the rule needs; electron-input secondary_action background (shipped): a development series of 5, not the 30 the rule needs; electron-input menu_unconfirmed background (shipped): a development series of 5, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 864 requests, 60 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

