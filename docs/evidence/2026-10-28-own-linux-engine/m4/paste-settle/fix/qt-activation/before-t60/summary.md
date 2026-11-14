# linux-engine-diff summary

## t60fix-qt-activation-before-t60 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| kate | shipped | click-paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 198.9 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| kate | shipped | click-paste | – | **not clean** | 0 (0) | **no** | input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (EnterNotify); input to 0xc00006 outside a session (MotionNotify); input to 0xc00006 outside a session (ButtonPress); input to 0xc00006 outside a session (ButtonRelease); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyPress); input to 0xc00006 outside a session (KeyRelease); input to 0xc00006 outside a session (KeyRelease) |

**Incomplete or failed:** kate click-paste: a development series of 10, not the 30 the proof needs; kate shipped click-paste: the audit is not clean.

desktop: started with no window active, ended with 0x00c0001d active (foreign), neither acted on; holder none; the harness's own trace: 136 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

