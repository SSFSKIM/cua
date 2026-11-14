# linux-engine-diff summary

## t74w3-a-settle-2 (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input move_relative desktop | shipped | 3 | 0 (0 / 0 / 0 / 0) | 3 | 3 consecutive |
| electron-input move_relative desktop | shipped | 3 | 0 (0 / 0 / 0 / 0) | 3 | 3 consecutive |

**Incomplete or failed:** chrome-input move_relative desktop (shipped): a development series of 3, not the 30 the rule needs; electron-input move_relative desktop (shipped): a development series of 3, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 265 requests, 32 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

