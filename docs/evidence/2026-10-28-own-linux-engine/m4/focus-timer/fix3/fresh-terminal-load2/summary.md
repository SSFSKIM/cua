# linux-engine-diff summary

## t56-fix3-fresh-terminal-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 38.4 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 245.4 |
| gnome-terminal | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 197.8 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 44.2 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 247.1 |
| gnome-terminal | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 220.2 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 120.6 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 153.2 |
| gnome-terminal | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 152.4 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 226 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

