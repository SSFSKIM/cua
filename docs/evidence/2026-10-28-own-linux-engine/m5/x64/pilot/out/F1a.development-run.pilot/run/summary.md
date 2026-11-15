# linux-engine-diff summary

## m4-dev-F1a-pilot (experiment focus-timer; development run, not a release gate)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 35.3 |
| chrome | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 41.5 |
| chrome | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 189.8 |
| electron | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 34.2 |
| electron | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 41.7 |
| electron | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 153.2 |
| gedit | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 25.6 |
| gedit | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 52.4 |
| gedit | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 173.7 |
| kate | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 24.5 |
| kate | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 46.9 |
| kate | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 191.6 |
| qtcreator | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 26.4 |
| qtcreator | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 32.8 |
| qtcreator | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 241.7 |
| firefox | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 32.4 |
| firefox | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 70.6 |
| firefox | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 165.8 |
| writer | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 30 |
| writer | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 35.6 |
| writer | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 307 |
| gnome-terminal | shipped | burst | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 34 |
| gnome-terminal | shipped | aba | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 34.9 |
| gnome-terminal | shipped | paste | 2 | 0 | 2 | 2 consecutive | 0 | 2 | 157.9 |

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

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 996 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

