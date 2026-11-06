# linux-engine-diff summary

## t63-trace-base-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| gtk4-input click dedicated | shipped | 36 | 6 (0 / 6) | 0 | not reached |
| gtk4-input scroll dedicated | shipped | 31 | 19 (0 / 19) | 0 | not reached |
| gtk4-input drag dedicated | shipped | 31 | 12 (0 / 12) | 0 | not reached |

**Incomplete or failed:** gtk4-input click dedicated (shipped): no 30 consecutive passing runs in 36; gtk4-input scroll dedicated (shipped): no 30 consecutive passing runs in 31; gtk4-input drag dedicated (shipped): no 30 consecutive passing runs in 31.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5588 requests, 368 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

