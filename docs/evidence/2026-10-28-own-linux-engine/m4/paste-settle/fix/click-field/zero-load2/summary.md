# linux-engine-diff summary

## t60fix-field-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | click-0 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 141.8 |
| electron | click-0 | click-field | 60 | 3 | 11 | **not reached** (refused 3) | 3 | 11 | 102.6 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | click-0 | click-field | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| electron | click-0 | click-field | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |

**Incomplete or failed:** electron click-field (click-0): no 30 consecutive passing runs in 60.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1374 requests, 214 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

