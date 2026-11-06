# linux-engine-diff summary

## t63-fix-others-idle (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input click dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input right_click dedicated | shipped | 31 | 1 (0 / 1) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| settle-qt5 scroll dedicated | shipped | 31 | 31 (0 / 31) | 0 | not reached |
| settle-qt6 scroll dedicated | shipped | 31 | 31 (0 / 31) | 0 | not reached |

**Incomplete or failed:** settle-qt5 scroll dedicated (shipped): no 30 consecutive passing runs in 31; settle-qt6 scroll dedicated (shipped): no 30 consecutive passing runs in 31.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 18561 requests, 1109 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

