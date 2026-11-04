# linux-engine-diff summary

## t56-settle-0-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 24/30 | 19/30 | 104.3 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 104.5 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 1 |
| electron | SIGTERM | keys | 30 | 17/30 | 9/30 | 104.2 |
| electron | SIGTERM | clicks | 10 | 10/10 | 10/10 | 104.1 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 0.7 |

**Incomplete or failed:** chrome SIGTERM: 6 of 30 runs did not drain the burst and its FocusOut; electron SIGTERM: 13 of 30 runs did not drain the burst and its FocusOut.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 223 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

