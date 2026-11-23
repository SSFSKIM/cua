# linux-engine-diff summary

## t60fix-shipped-clicks-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 163.5 |
| chrome | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 154.3 |
| electron | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 138.1 |
| electron | shipped | click-field | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 118.6 |
| gedit | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 145.2 |
| kate | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 149.8 |
| qtcreator | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 239.9 |
| writer | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 588.1 |
| gnome-terminal | shipped | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 118.9 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | click-paste | – | clean | 2 (0) | yes | – |
| chrome | shipped | click-field | – | clean | 2 (0) | yes | – |
| electron | shipped | click-paste | – | clean | 2 (0) | yes | – |
| electron | shipped | click-field | – | clean | 2 (0) | yes | – |
| gedit | shipped | click-paste | – | clean | 2 (0) | yes | – |
| kate | shipped | click-paste | – | **not clean** | 0 (0) | **no** | input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (ButtonPress); input to 0xc00006 outside a session (ButtonRelease); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyRelease); input to 0xc00006 outside a session (KeyRelease) |
| qtcreator | shipped | click-paste | – | **not clean** | 0 (0) | **no** | input to 0xc0000e outside a session (EnterNotify); input to 0xc0000e outside a session (MotionNotify); input to 0xc0000e outside a session (EnterNotify); input to 0xc0000e outside a session (MotionNotify); input to 0xc0000e outside a session (ButtonPress); input to 0xc0000e outside a session (ButtonRelease); input to 0xc0000e outside a session (KeyPress); input to 0xc0000e outside a session (KeyPress); input to 0xc0000e outside a session (KeyRelease); input to 0xc0000e outside a session (KeyRelease) |
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

**Incomplete or failed:** kate shipped click-paste: the audit is not clean; qtcreator shipped click-paste: the audit is not clean.

desktop: started with no window active, ended with 0x0080000c active (harness), neither acted on; holder none; the harness's own trace: 2277 requests, 314 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

