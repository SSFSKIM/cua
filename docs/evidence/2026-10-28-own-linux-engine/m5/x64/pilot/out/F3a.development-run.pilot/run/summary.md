# linux-engine-diff summary

## m4-dev-F3a-pilot (experiment focus-timer; development run, not a release gate)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 42.6 |
| chrome | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 53.8 |
| chrome | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 218.8 |
| electron | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 54.4 |
| electron | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 66.9 |
| electron | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 221.6 |
| gedit | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 70.4 |
| gedit | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 47.4 |
| gedit | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 263.3 |
| kate | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 33.9 |
| kate | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 74.5 |
| kate | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 223.4 |
| qtcreator | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 36.3 |
| qtcreator | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 82.9 |
| qtcreator | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 375.2 |
| firefox | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 34.3 |
| firefox | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 54.3 |
| firefox | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 182 |
| writer | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 44.7 |
| writer | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 98.5 |
| writer | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 563.1 |
| gnome-terminal | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 35 |
| gnome-terminal | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 73.3 |
| gnome-terminal | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 200.3 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| chrome | shipped | burst | – | clean | 20 (0) | yes | – |
| chrome | shipped | aba | – | clean | 24 (0) | yes | – |
| chrome | shipped | paste | – | clean | 9 (0) | yes | – |
| electron | shipped | burst | – | clean | 20 (0) | yes | – |
| electron | shipped | aba | – | clean | 24 (0) | yes | – |
| electron | shipped | paste | – | clean | 9 (0) | yes | – |
| gedit | shipped | burst | – | clean | 20 (0) | yes | – |
| gedit | shipped | aba | – | clean | 24 (0) | yes | – |
| gedit | shipped | paste | – | clean | 9 (0) | yes | – |
| kate | shipped | burst | – | clean | 20 (0) | yes | – |
| kate | shipped | aba | – | clean | 24 (0) | yes | – |
| kate | shipped | paste | – | clean | 9 (0) | yes | – |
| qtcreator | shipped | burst | – | clean | 20 (0) | yes | – |
| qtcreator | shipped | aba | – | clean | 24 (0) | yes | – |
| qtcreator | shipped | paste | – | clean | 9 (0) | yes | – |
| firefox | shipped | burst | – | clean | 20 (0) | yes | – |
| firefox | shipped | aba | – | clean | 24 (0) | yes | – |
| firefox | shipped | paste | – | clean | 9 (0) | yes | – |
| writer | shipped | burst | – | clean | 20 (0) | yes | – |
| writer | shipped | aba | – | clean | 24 (0) | yes | – |
| writer | shipped | paste | – | clean | 9 (0) | yes | – |
| gnome-terminal | shipped | burst | – | clean | 20 (0) | yes | – |
| gnome-terminal | shipped | aba | – | clean | 24 (0) | yes | – |
| gnome-terminal | shipped | paste | – | clean | 9 (0) | yes | – |

**Incomplete or failed:** chrome burst: a development series of 2, not the 30 the proof needs; chrome aba: a development series of 2, not the 30 the proof needs; chrome paste: a development series of 2, not the 30 the proof needs; electron burst: a development series of 2, not the 30 the proof needs; electron aba: a development series of 2, not the 30 the proof needs; electron paste: a development series of 2, not the 30 the proof needs; gedit burst: a development series of 2, not the 30 the proof needs; gedit aba: a development series of 2, not the 30 the proof needs; gedit paste: a development series of 2, not the 30 the proof needs; kate burst: a development series of 2, not the 30 the proof needs; kate aba: a development series of 2, not the 30 the proof needs; kate paste: a development series of 2, not the 30 the proof needs; qtcreator burst: a development series of 2, not the 30 the proof needs; qtcreator aba: a development series of 2, not the 30 the proof needs; qtcreator paste: a development series of 2, not the 30 the proof needs; firefox burst: a development series of 2, not the 30 the proof needs; firefox aba: a development series of 2, not the 30 the proof needs; firefox paste: a development series of 2, not the 30 the proof needs; writer burst: a development series of 2, not the 30 the proof needs; writer aba: a development series of 2, not the 30 the proof needs; writer paste: a development series of 2, not the 30 the proof needs; gnome-terminal burst: a development series of 2, not the 30 the proof needs; gnome-terminal aba: a development series of 2, not the 30 the proof needs; gnome-terminal paste: a development series of 2, not the 30 the proof needs.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 903 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

