# linux-engine-diff summary

## t56-fix2-terminal-030-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 2072.4 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 2487.9 |
| gnome-terminal | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 1005.8 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 2125.6 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 2546.4 |
| gnome-terminal | unredirect | paste | 60 | 6 | 0 | **not reached** (unconfirmed 6) | 11 | 0 | 1038 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 108 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 129.1 |
| gnome-terminal | control | paste | 10 | 3 | 0 | fails without the delay (3/10; the text wrong in 1) | 4 | 0 | 163.7 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| gnome-terminal | timer | **not clean** | 0 (0) | **no** | 53 FocusOut in the trace and 0 reported by the engine |
| gnome-terminal | control | **not clean** | 0 (0) | yes | 53 FocusOut in the trace and 0 reported by the engine |

**Incomplete or failed:** gnome-terminal paste (unredirect): no 30 consecutive passing runs in 60; gnome-terminal timer: the audit is not clean; gnome-terminal control: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 222 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

