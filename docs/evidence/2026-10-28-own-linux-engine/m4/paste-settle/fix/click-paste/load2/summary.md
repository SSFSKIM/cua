# linux-engine-diff summary

## t60fix-click-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 153.6 |
| electron | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 114.7 |
| gedit | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 123.7 |
| kate | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 110.4 |
| qtcreator | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 213.9 |
| writer | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 554.8 |
| gnome-terminal | click-0 | click-paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 103.4 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| electron | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| gedit | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| kate | click-0 | click-paste | `--paste-click-settle-ms 0` | **not clean** | 0 (0) | **no** | input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (ButtonPress); input to 0xc00006 outside a session (ButtonRelease); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyRelease); input to 0xc00006 outside a session (KeyRelease) |
| qtcreator | click-0 | click-paste | `--paste-click-settle-ms 0` | **not clean** | 0 (0) | **no** | input to 0xc0000e outside a session (EnterNotify); input to 0xc0000e outside a session (MotionNotify); input to 0xc0000e outside a session (EnterNotify); input to 0xc0000e outside a session (MotionNotify); input to 0xc0000e outside a session (ButtonPress); input to 0xc0000e outside a session (ButtonRelease); input to 0xc0000e outside a session (KeyPress); input to 0xc0000e outside a session (KeyPress); input to 0xc0000e outside a session (KeyRelease); input to 0xc0000e outside a session (KeyRelease) |
| writer | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |
| gnome-terminal | click-0 | click-paste | `--paste-click-settle-ms 0` | clean | 2 (0) | yes | – |

| family | scenario | not applicable |
|---|---|---|
| firefox | click-paste | a background click moves no Gecko caret (refused while covered, taken but caret unmoved while fully unobscured) |

**Incomplete or failed:** kate click-0 click-paste: the audit is not clean; qtcreator click-0 click-paste: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 750 requests, 66 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

