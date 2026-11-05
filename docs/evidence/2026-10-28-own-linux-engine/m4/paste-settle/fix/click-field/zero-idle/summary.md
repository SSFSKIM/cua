# linux-engine-diff summary

## t60fix-field-idle (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | click-0 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 70.1 |
| electron | click-0 | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 53.1 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | click-0 | click-field | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| electron | click-0 | click-field | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1073 requests, 154 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

