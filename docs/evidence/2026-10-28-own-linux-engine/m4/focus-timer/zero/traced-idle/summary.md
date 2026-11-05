# linux-engine-diff summary

## t59-zero-traced-idle (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 206.2 |
| chrome | control-0ms | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 98.6 |
| electron | timer | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 179.6 |
| electron | control-0ms | paste | 20 | 1 | 10 | 10 consecutive (refused 1) | 1 | 10 | 87.4 |
| firefox | timer | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 191.2 |
| firefox | control-0ms | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 105.3 |
| gnome-terminal | timer | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 185.5 |
| gnome-terminal | control-0ms | paste | 10 | 0 | 10 | 10 consecutive | 0 | 10 | 87.8 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 2 (2) | yes | – |
| chrome | control-0ms | clean | 9 (0) | yes | – |
| electron | timer | clean | 2 (2) | yes | – |
| electron | control-0ms | clean | 9 (0) | yes | – |
| firefox | timer | clean | 2 (2) | yes | – |
| firefox | control-0ms | clean | 9 (0) | yes | – |
| gnome-terminal | timer | clean | 2 (2) | yes | – |
| gnome-terminal | control-0ms | clean | 9 (0) | yes | – |

**Incomplete or failed:** chrome paste: a development series of 10, not the 30 the proof needs; chrome paste (control-0ms): a development series of 10, not the 30 the proof needs; electron paste: a development series of 10, not the 30 the proof needs; electron paste (control-0ms): a development series of 10, not the 30 the proof needs; firefox paste: a development series of 10, not the 30 the proof needs; firefox paste (control-0ms): a development series of 10, not the 30 the proof needs; gnome-terminal paste: a development series of 10, not the 30 the proof needs; gnome-terminal paste (control-0ms): a development series of 10, not the 30 the proof needs.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 599 requests, 42 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

