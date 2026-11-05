# linux-engine-diff summary

## t61-vendor-load2 (experiment qt-activation)

| family | kind | lane | runs | activated | activation requests | refused | landed | misses | streak | verdict | focus wait median / max ms | answered median ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| kate | click | pinned | 30 | 11 | 0 | 0 | 30 | 11 | 2 | counted | – | 219.3 |
| kate | click | released | 30 | 8 | 0 | 0 | 30 | 8 | 2 | counted | – | 118.2 |
| kate | click | shipped | 60 | 10 | 0 | 0 | 60 | 10 | 0 | **not reached** | – | 21.2 |
| qtcreator | click | pinned | 30 | 8 | 0 | 0 | 30 | 8 | 1 | counted | – | 218 |
| qtcreator | click | released | 30 | 5 | 0 | 0 | 30 | 5 | 1 | counted | – | 118.6 |
| qtcreator | click | shipped | 60 | 13 | 0 | 0 | 60 | 13 | 3 | **not reached** | – | 20.7 |

**Incomplete or failed:** kate click (shipped): no 30 consecutive passing runs in 60; qtcreator click (shipped): no 30 consecutive passing runs in 60.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 3468 requests, 232 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

