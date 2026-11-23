# linux-engine-diff summary

## m4-dev-F3b-pilot (experiment focus-timer; development run, not a release gate)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 168.5 |
| chrome | shipped | click-field | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 141.5 |
| electron | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 133.1 |
| electron | shipped | click-field | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 93.2 |
| gedit | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 139.5 |
| kate | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 156 |
| qtcreator | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 281.8 |
| writer | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 477.4 |
| gnome-terminal | shipped | click-paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 125.6 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | click-paste | – | clean | 2 (0) | yes | – |
| chrome | shipped | click-field | – | clean | 2 (0) | yes | – |
| electron | shipped | click-paste | – | clean | 2 (0) | yes | – |
| electron | shipped | click-field | – | clean | 2 (0) | yes | – |
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

**Incomplete or failed:** chrome click-paste: a development series of 2, not the 30 the proof needs; chrome click-field: a development series of 2, not the 30 the proof needs; electron click-paste: a development series of 2, not the 30 the proof needs; electron click-field: a development series of 2, not the 30 the proof needs; gedit click-paste: a development series of 2, not the 30 the proof needs; kate click-paste: a development series of 2, not the 30 the proof needs; qtcreator click-paste: a development series of 2, not the 30 the proof needs; writer click-paste: a development series of 2, not the 30 the proof needs; gnome-terminal click-paste: a development series of 2, not the 30 the proof needs.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 903 requests, 90 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

