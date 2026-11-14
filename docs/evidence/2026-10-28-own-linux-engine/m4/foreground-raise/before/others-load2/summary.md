# linux-engine-diff summary

## t63-base-others-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input drag dedicated | shipped | 38 | 5 (0 / 4) | 0 | not reached |
| electron-input drag dedicated | shipped | 36 | 7 (0 / 4) | 0 | not reached |
| firefox-input click dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input right_click dedicated | shipped | 31 | 1 (0 / 1) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input drag dedicated | shipped | 35 | 8 (0 / 8) | 0 | not reached |
| settle-qt5 scroll dedicated | shipped | 31 | 31 (0 / 31) | 0 | not reached |
| settle-qt6 scroll dedicated | shipped | 31 | 31 (0 / 31) | 0 | not reached |

**Incomplete or failed:** firefox-input drag dedicated (shipped): no 30 consecutive passing runs in 35; chrome-input drag dedicated (shipped): no 30 consecutive passing runs in 38; electron-input drag dedicated (shipped): no 30 consecutive passing runs in 36; settle-qt5 scroll dedicated (shipped): no 30 consecutive passing runs in 31; settle-qt6 scroll dedicated (shipped): no 30 consecutive passing runs in 31.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 17466 requests, 1149 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

