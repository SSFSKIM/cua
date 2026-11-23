# linux-engine-diff summary

## t63-base-qt-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| settle-qt5 scroll dedicated | shipped | 36 | 5 (0 / 5) | 0 | not reached |
| settle-qt6 scroll dedicated | shipped | 33 | 17 (0 / 17) | 0 | not reached |

**Incomplete or failed:** settle-qt5 scroll dedicated (shipped): no 30 consecutive passing runs in 36; settle-qt6 scroll dedicated (shipped): no 30 consecutive passing runs in 33.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 4353 requests, 284 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

