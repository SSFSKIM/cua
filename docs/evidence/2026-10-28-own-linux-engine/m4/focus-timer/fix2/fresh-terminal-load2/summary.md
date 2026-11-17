# linux-engine-diff summary

## t56-fix2-fresh-terminal-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 29.4 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 245.4 |
| gnome-terminal | timer | paste | 34 | 1 | 30 | 30 consecutive (unconfirmed 1) | 2 | 29 | 180.6 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 42.8 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 242.6 |
| gnome-terminal | unredirect | paste | 48 | 3 | 30 | 30 consecutive (unconfirmed 3) | 6 | 29 | 185.1 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 118 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 165.7 |
| gnome-terminal | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 124.4 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

desktop: started with no window active, ended with 0x0080000c active (harness), neither acted on; holder none; the harness's own trace: 226 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

