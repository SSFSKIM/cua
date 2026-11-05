# linux-engine-diff summary

## t59-zero-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 21 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 234.7 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 232.7 |
| chrome | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 38 |
| chrome | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 45.2 |
| chrome | control-0ms | paste | 60 | 28 | 0 | **not reached** (unconfirmed 17, refused 11) | 36 | 0 | 185.2 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 27.7 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 241.4 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 187 |
| electron | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 48.1 |
| electron | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 62.3 |
| electron | control-0ms | paste | 60 | 60 | 0 | **not reached** (unconfirmed 55, refused 5) | 60 | 0 | 2071.2 |
| gedit | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 27.4 |
| gedit | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 245.2 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 187.3 |
| gedit | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 53.2 |
| gedit | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 52.6 |
| gedit | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 119.7 |
| kate | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 21.2 |
| kate | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 231.1 |
| kate | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 208.5 |
| kate | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 93 |
| kate | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 95.5 |
| kate | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 140.9 |
| qtcreator | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 27.7 |
| qtcreator | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 238.5 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 289.6 |
| qtcreator | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 116.4 |
| qtcreator | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 121 |
| qtcreator | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 219.8 |
| firefox | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 21.4 |
| firefox | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 241.1 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 190 |
| firefox | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35.5 |
| firefox | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 74.6 |
| firefox | control-0ms | paste | 60 | 31 | 0 | **not reached** (unconfirmed 19, refused 12) | 41 | 0 | 155.7 |
| writer | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 26.8 |
| writer | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 250.4 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 614 |
| writer | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35 |
| writer | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 80.7 |
| writer | control-0ms | paste | 35 | 2 | 30 | 30 consecutive (text 2) | 2 | 30 | 564 |
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 32.9 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 239.5 |
| gnome-terminal | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 191 |
| gnome-terminal | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 70.8 |
| gnome-terminal | control-0ms | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 67.5 |
| gnome-terminal | control-0ms | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 120.6 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control-0ms | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control-0ms | **not clean** | 53 (0) | yes | – |
| gedit | timer | clean | 6 (6) | yes | – |
| gedit | control-0ms | clean | 53 (0) | yes | – |
| kate | timer | clean | 6 (6) | yes | – |
| kate | control-0ms | clean | 53 (0) | yes | – |
| qtcreator | timer | clean | 6 (6) | yes | – |
| qtcreator | control-0ms | clean | 53 (0) | yes | – |
| firefox | timer | clean | 6 (6) | yes | – |
| firefox | control-0ms | clean | 53 (0) | yes | – |
| writer | timer | clean | 6 (6) | yes | – |
| writer | control-0ms | clean | 53 (0) | yes | – |
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control-0ms | clean | 53 (0) | yes | – |

**Incomplete or failed:** chrome paste (control-0ms): no 30 consecutive passing runs in 60; electron paste (control-0ms): no 30 consecutive passing runs in 60; firefox paste (control-0ms): no 30 consecutive passing runs in 60; electron control-0ms: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 901 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

