# linux-engine-diff summary

## t61-click-paste-shipped-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| kate | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 149.9 |
| qtcreator | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 255.1 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| kate | shipped | click-paste | – | clean | 2 (0) | yes | – |
| qtcreator | shipped | click-paste | – | clean | 2 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 209 requests, 20 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

