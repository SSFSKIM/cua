# linux-engine-diff summary

## t64-search-idle-path2 (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input move desktop | shipped | 31 | 23 (23 / 0 / 0 / 0) | 0 | not reached |
| electron-input move desktop | shipped | 31 | 30 (30 / 0 / 0 / 0) | 0 | not reached |

**Incomplete or failed:** chrome-input move desktop (shipped): no 30 consecutive passing runs in 31; electron-input move desktop (shipped): no 30 consecutive passing runs in 31.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 250 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

