# linux-engine-diff summary

## t72f-fix-confirm-idle (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| writer drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| writer drag background | clean | 1823 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 205 requests, 15 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

