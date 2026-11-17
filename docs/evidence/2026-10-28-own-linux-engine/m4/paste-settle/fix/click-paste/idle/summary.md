# linux-engine-diff summary

## t60fix-click-idle (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 68.2 |
| electron | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 52 |
| gedit | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 61.7 |
| kate | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 66.4 |
| qtcreator | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 123 |
| writer | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 182.4 |
| gnome-terminal | click-0 | click-paste | 48 | 2 | 30 | 30 consecutive (refused 2) | 2 | 30 | 59.1 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| electron | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| gedit | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| kate | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| qtcreator | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| writer | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| gnome-terminal | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |

| family | scenario | not applicable |
|---|---|---|
| firefox | click-paste | a background click moves no Gecko caret (refused while covered, taken but caret unmoved while fully unobscured) |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 833 requests, 66 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

