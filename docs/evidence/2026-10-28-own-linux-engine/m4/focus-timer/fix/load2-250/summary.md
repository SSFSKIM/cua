# linux-engine-diff summary

## t56-fix-load2-b (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 18.8 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 230.8 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 231.7 |
| chrome | unredirect | burst | 60 | 21 | 2 | **not reached** (text 21) | 35 | 1 | 19.2 |
| chrome | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 230.8 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 236.5 |
| chrome | control | burst | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 10 | 0 | 76.9 |
| chrome | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 10 | 0 | 68.9 |
| chrome | control | paste | 10 | 5 | 1 | fails without the delay (5/10; the text wrong in 1) | 7 | 0 | 229.6 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 24.8 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 235.4 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 203 |
| electron | unredirect | burst | 60 | 18 | 1 | **not reached** (text 18) | 31 | 0 | 25.5 |
| electron | unredirect | aba | 49 | 1 | 30 | 30 consecutive (text 1) | 2 | 29 | 237.3 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 191.3 |
| electron | control | burst | 10 | 7 | 0 | fails without the delay (7/10; the text wrong in 7) | 9 | 0 | 76.9 |
| electron | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 10 | 0 | 88.3 |
| electron | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 3) | 10 | 0 | 2078.2 |
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 34.4 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 241.2 |
| gnome-terminal | timer | paste | 59 | 6 | 30 | 30 consecutive (unconfirmed 6) | 11 | 29 | 187.3 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 37.5 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 233.1 |
| gnome-terminal | unredirect | paste | 60 | 12 | 7 | **not reached** (unconfirmed 12) | 21 | 6 | 188.2 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 113 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 0 | 10 | 136.1 |
| gnome-terminal | control | paste | 10 | 3 | 1 | fails without the delay (3/10; the text wrong in 1) | 6 | 0 | 167.3 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control | clean | 53 (0) | yes | – |
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 29/30 | 28/30 | 253 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 101.9 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 1.1 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 252.8 |
| electron | SIGTERM | clicks | 10 | 10/10 | 10/10 | 104.8 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 2.3 |

**Incomplete or failed:** chrome burst (unredirect): no 30 consecutive passing runs in 60; electron burst (unredirect): no 30 consecutive passing runs in 60; gnome-terminal paste (unredirect): no 30 consecutive passing runs in 60; chrome SIGTERM: 1 of 30 runs did not drain the burst and its FocusOut.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 378 requests, 34 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

