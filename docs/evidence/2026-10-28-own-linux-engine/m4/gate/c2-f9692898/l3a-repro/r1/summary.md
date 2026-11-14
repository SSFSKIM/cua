# linux-engine-diff summary

## t77-l3a-repro (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-text clipboard_read background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-text clipboard_read background | clean | 5620 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00e0000c active (harness), neither acted on; holder none; the harness's own trace: 832 requests, 648 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

