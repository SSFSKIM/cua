# linux-engine-diff summary

## t63-final-others-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input click dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input right_click dedicated | shipped | 31 | 1 (0 / 1) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| firefox-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| settle-qt5 scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| settle-qt6 scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 16784 requests, 1101 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

