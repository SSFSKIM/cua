# linux-engine-diff summary

## t56-fix2-fresh-terminal-load2-b (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 25.9 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 238.9 |
| gnome-terminal | timer | paste | 45 | 2 | 30 | 30 consecutive (unconfirmed 2) | 3 | 29 | 189.2 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35.3 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 247.1 |
| gnome-terminal | unredirect | paste | 38 | 2 | 30 | 30 consecutive (unconfirmed 2) | 4 | 29 | 200.9 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 122.8 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 126.4 |
| gnome-terminal | control | paste | 10 | 2 | 1 | fails without the delay (2/10; the text wrong in 2) | 4 | 0 | 146 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| gnome-terminal | timer | **not clean** | 6 (6) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

**Incomplete or failed:** gnome-terminal timer: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 230 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

