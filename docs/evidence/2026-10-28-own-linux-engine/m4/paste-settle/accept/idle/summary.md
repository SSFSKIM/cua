# linux-engine-diff summary

## t60-accept-idle-2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 27 |
| chrome | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 32.6 |
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 169.9 |
| chrome | control | burst | 10 | 9 | 0 | fails with each request unredirected (9/10; the text wrong in 9) | 10 | 0 | 48.5 |
| chrome | control | aba | 10 | 10 | 0 | fails with each request unredirected (10/10; the text wrong in 10) | 10 | 0 | 57.9 |
| chrome | control | paste | 10 | 0 | 10 | **shows nothing** | 1 | 9 | 179 |
| electron | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.1 |
| electron | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 32.6 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 148.4 |
| electron | control | burst | 10 | 8 | 0 | fails with each request unredirected (8/10; the text wrong in 8) | 10 | 0 | 45.6 |
| electron | control | aba | 10 | 9 | 0 | fails with each request unredirected (9/10; the text wrong in 9) | 10 | 0 | 61.3 |
| electron | control | paste | 10 | 0 | 10 | **shows nothing** | 1 | 9 | 154.5 |
| gedit | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.9 |
| gedit | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 43.9 |
| gedit | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 162.1 |
| gedit | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 43.1 |
| gedit | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 74.6 |
| gedit | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 179.3 |
| kate | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.5 |
| kate | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 30.6 |
| kate | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 170.4 |
| kate | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 42.4 |
| kate | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 47.7 |
| kate | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 179.5 |
| qtcreator | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.4 |
| qtcreator | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 35.8 |
| qtcreator | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 212.2 |
| qtcreator | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 42.2 |
| qtcreator | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 55.6 |
| qtcreator | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 222.4 |
| firefox | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 30.7 |
| firefox | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 52.5 |
| firefox | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 155.7 |
| firefox | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 51.6 |
| firefox | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 71.9 |
| firefox | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 168.3 |
| writer | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 26 |
| writer | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 39.8 |
| writer | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 271 |
| writer | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 51 |
| writer | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 68.2 |
| writer | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 291.7 |
| gnome-terminal | shipped | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 20.5 |
| gnome-terminal | shipped | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 27.3 |
| gnome-terminal | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 158 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 40.7 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 47.2 |
| gnome-terminal | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 159.1 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | shipped | clean | 53 (0) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | shipped | clean | 53 (0) | yes | – |
| electron | control | clean | 53 (0) | yes | – |
| gedit | shipped | clean | 53 (0) | yes | – |
| gedit | control | clean | 53 (0) | yes | – |
| kate | shipped | clean | 53 (0) | yes | – |
| kate | control | clean | 53 (0) | yes | – |
| qtcreator | shipped | clean | 53 (0) | yes | – |
| qtcreator | control | clean | 53 (0) | yes | – |
| firefox | shipped | clean | 53 (0) | yes | – |
| firefox | control | clean | 53 (0) | yes | – |
| writer | shipped | clean | 53 (0) | yes | – |
| writer | control | clean | 53 (0) | yes | – |
| gnome-terminal | shipped | clean | 53 (0) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.3 |
| chrome | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.1 |
| chrome | SIGKILL | keys | 3 | 3/3 | 1/3 | 0.7 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.4 |
| electron | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.2 |
| electron | SIGKILL | keys | 3 | 3/3 | 1/3 | 0.6 |

**Incomplete or failed:** chrome paste: the control lane showed no reorder in 10 runs, so the test cannot see one; electron paste: the control lane showed no reorder in 10 runs, so the test cannot see one.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1002 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

