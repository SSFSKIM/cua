# linux-engine-diff summary

## t56-fix-load2-c (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 20.4 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 230.3 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 229.6 |
| chrome | unredirect | burst | 60 | 24 | 2 | **not reached** (text 24) | 37 | 1 | 19.2 |
| chrome | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 228.1 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 229.2 |
| chrome | control | burst | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 10 | 0 | 65.3 |
| chrome | control | aba | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 9) | 10 | 0 | 74 |
| chrome | control | paste | 10 | 4 | 0 | fails without the delay (4/10; the text wrong in 1) | 6 | 0 | 192.7 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 23.3 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 234 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 191 |
| electron | unredirect | burst | 60 | 18 | 0 | **not reached** (text 18) | 31 | 0 | 23.2 |
| electron | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 1 | 29 | 237.1 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 204.9 |
| electron | control | burst | 10 | 8 | 2 | fails without the delay (8/10; the text wrong in 8) | 9 | 1 | 65.3 |
| electron | control | aba | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 9) | 10 | 0 | 82 |
| electron | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 3) | 10 | 0 | 2059.9 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control | clean | 53 (0) | yes | – |

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 302.9 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 104.6 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 3.1 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 302.9 |
| electron | SIGTERM | clicks | 10 | 10/10 | 10/10 | 103.8 |
| electron | SIGKILL | keys | 3 | 3/3 | 3/3 | 5 |

**Incomplete or failed:** chrome burst (unredirect): no 30 consecutive passing runs in 60; electron burst (unredirect): no 30 consecutive passing runs in 60.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 224 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

