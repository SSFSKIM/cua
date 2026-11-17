# linux-engine-diff summary

## t60fix-fieldsteps-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | click-25 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 150.6 |
| chrome | click-50 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 183.4 |
| chrome | click-75 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 202.7 |
| chrome | click-100 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 241.3 |
| electron | click-25 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 112.1 |
| electron | click-50 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 140.7 |
| electron | click-75 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 161.6 |
| electron | click-100 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 203.7 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | click-25 | click-field | `--paste-click-settle-ms 25` | clean | 2 (0) | yes | – |
| chrome | click-50 | click-field | `--paste-click-settle-ms 50` | clean | 2 (0) | yes | – |
| chrome | click-75 | click-field | `--paste-click-settle-ms 75` | clean | 2 (0) | yes | – |
| chrome | click-100 | click-field | `--paste-click-settle-ms 100` | clean | 2 (0) | yes | – |
| electron | click-25 | click-field | `--paste-click-settle-ms 25` | clean | 2 (0) | yes | – |
| electron | click-50 | click-field | `--paste-click-settle-ms 50` | clean | 2 (0) | yes | – |
| electron | click-75 | click-field | `--paste-click-settle-ms 75` | clean | 2 (0) | yes | – |
| electron | click-100 | click-field | `--paste-click-settle-ms 100` | clean | 2 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 3304 requests, 526 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

