# linux-engine-diff summary

## t56-fix2-fresh-others-paste-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 231.9 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 229.9 |
| chrome | control | paste | 10 | 4 | 0 | fails without the delay (4/10; the text wrong in 0) | 6 | 0 | 244.9 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 185.4 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 193.6 |
| electron | control | paste | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 1) | 10 | 0 | 2073.7 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 215.6 |
| gedit | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 189.5 |
| gedit | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 144.8 |
| kate | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 212.5 |
| kate | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 204.5 |
| kate | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 124.1 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 293.2 |
| qtcreator | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 293.1 |
| qtcreator | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 248.1 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 202.6 |
| firefox | unredirect | paste | 51 | 1 | 30 | 30 consecutive (unconfirmed 1) | 2 | 29 | 198.4 |
| firefox | control | paste | 10 | 3 | 0 | fails without the delay (3/10; the text wrong in 3) | 3 | 0 | 178.8 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 640.8 |
| writer | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 648.7 |
| writer | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 544.5 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 2 (2) | yes | – |
| chrome | control | clean | 9 (0) | yes | – |
| electron | timer | clean | 2 (2) | yes | – |
| electron | control | clean | 9 (0) | yes | – |
| gedit | timer | clean | 2 (2) | yes | – |
| gedit | control | clean | 9 (0) | yes | – |
| kate | timer | clean | 2 (2) | yes | – |
| kate | control | clean | 9 (0) | yes | – |
| qtcreator | timer | clean | 2 (2) | yes | – |
| qtcreator | control | clean | 9 (0) | yes | – |
| firefox | timer | clean | 2 (2) | yes | – |
| firefox | control | clean | 9 (0) | yes | – |
| writer | timer | clean | 2 (2) | yes | – |
| writer | control | clean | 9 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 750 requests, 66 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

