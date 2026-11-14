# linux-engine-diff summary

## t60fix-shipped-clicks-idle (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 93.9 |
| chrome | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 94.1 |
| electron | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 77.2 |
| electron | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 76.8 |
| gedit | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 86.4 |
| kate | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 94.2 |
| qtcreator | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 143.5 |
| writer | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 202.8 |
| gnome-terminal | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 83.3 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | click-paste | – | clean | 2 (0) | yes | – |
| chrome | shipped | click-field | – | **not clean** | 2 (0) | yes | – |
| electron | shipped | click-paste | – | clean | 2 (0) | yes | – |
| electron | shipped | click-field | – | **not clean** | 2 (0) | yes | – |
| gedit | shipped | click-paste | – | clean | 2 (0) | yes | – |
| kate | shipped | click-paste | – | clean | 2 (0) | yes | – |
| qtcreator | shipped | click-paste | – | clean | 2 (0) | yes | – |
| writer | shipped | click-paste | – | clean | 2 (0) | yes | – |
| gnome-terminal | shipped | click-paste | – | clean | 2 (0) | yes | – |

| family | scenario | not applicable |
|---|---|---|
| gedit | click-field | the family's scene has one text field a window |
| kate | click-field | the family's scene has one text field a window |
| qtcreator | click-field | the family's scene has one text field a window |
| firefox | click-paste | a background click moves no Gecko caret (refused while covered, taken but caret unmoved while fully unobscured) |
| firefox | click-field | the family's scene has one text field a window |
| writer | click-field | the family's scene has one text field a window |
| gnome-terminal | click-field | the family's scene has one text field a window |

**Incomplete or failed:** chrome shipped click-field: the audit is not clean; electron shipped click-field: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1659 requests, 194 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

