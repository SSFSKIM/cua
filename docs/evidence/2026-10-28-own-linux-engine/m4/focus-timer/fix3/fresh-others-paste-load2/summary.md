# linux-engine-diff summary

## t56-fix3-fresh-others-paste-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 245 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 236.5 |
| chrome | control | paste | 10 | 4 | 4 | fails without the delay (4/10; the text wrong in 0) | 6 | 3 | 236.3 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 195 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 209.6 |
| electron | control | paste | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 1) | 10 | 0 | 2071.9 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 199.4 |
| gedit | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 208 |
| gedit | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 172.4 |
| kate | timer | paste | 31 | 1 | 30 | 30 consecutive (error 1) | 1 | 30 | 201.4 |
| kate | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 199 |
| kate | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 139.7 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 298.4 |
| qtcreator | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 307.3 |
| qtcreator | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 253.3 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 196.4 |
| firefox | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 199.8 |
| firefox | control | paste | 10 | 1 | 7 | fails without the delay (1/10; the text wrong in 0) | 2 | 6 | 178.9 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 619.1 |
| writer | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 613.3 |
| writer | control | paste | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 607.5 |

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

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 738 requests, 66 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

