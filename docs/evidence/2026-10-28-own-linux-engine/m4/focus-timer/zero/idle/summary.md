# linux-engine-diff summary

## t59-zero-idle (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 14.7 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 219.9 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 167.7 |
| chrome | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.1 |
| chrome | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 31.6 |
| chrome | control-0ms | paste | 60 | 21 | 4 | **not reached** (refused 17, unconfirmed 4) | 24 | 4 | 68.6 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 13.6 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 222.8 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 143.2 |
| electron | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 23.4 |
| electron | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 32.1 |
| electron | control-0ms | paste | 60 | 60 | 0 | **not reached** (unconfirmed 59, refused 1) | 60 | 0 | 2037.6 |
| gedit | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 14.5 |
| gedit | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 223 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 155.6 |
| gedit | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24 |
| gedit | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 36.7 |
| gedit | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 70.3 |
| kate | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 12.5 |
| kate | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 217.4 |
| kate | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 166.3 |
| kate | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 23.2 |
| kate | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 30.1 |
| kate | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 78.9 |
| qtcreator | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 17.2 |
| qtcreator | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 224.2 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 207.5 |
| qtcreator | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 25.4 |
| qtcreator | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 34.1 |
| qtcreator | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 136 |
| writer | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 14.8 |
| writer | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 222.1 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 289.5 |
| writer | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 25.7 |
| writer | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 39.8 |
| writer | control-0ms | paste | 35 | 2 | 30 | 30 consecutive (text 2) | 2 | 30 | 175.8 |
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 12.6 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 215.9 |
| gnome-terminal | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 148.4 |
| gnome-terminal | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 22.6 |
| gnome-terminal | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 26.1 |
| gnome-terminal | control-0ms | paste | 60 | 11 | 3 | **not reached** (refused 11) | 11 | 3 | 53.6 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control-0ms | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control-0ms | clean | 53 (0) | yes | – |
| gedit | timer | clean | 6 (6) | yes | – |
| gedit | control-0ms | clean | 53 (0) | yes | – |
| kate | timer | clean | 6 (6) | yes | – |
| kate | control-0ms | clean | 53 (0) | yes | – |
| qtcreator | timer | clean | 6 (6) | yes | – |
| qtcreator | control-0ms | clean | 53 (0) | yes | – |
| writer | timer | clean | 6 (6) | yes | – |
| writer | control-0ms | clean | 53 (0) | yes | – |
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control-0ms | clean | 53 (0) | yes | – |

**Incomplete or failed:** chrome paste (control-0ms): no 30 consecutive passing runs in 60; electron paste (control-0ms): no 30 consecutive passing runs in 60; gnome-terminal paste (control-0ms): no 30 consecutive passing runs in 60; firefox could not be opened: cua171-diff-t59-zero-idle-5fdcff18-firefox-focus-a did not appear as exactly one window.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 828 requests, 66 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

