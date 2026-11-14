# linux-engine-diff summary

## t56-settle-250-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 252.6 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 252.7 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 0.6 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 252.6 |
| electron | SIGTERM | clicks | 10 | 10/10 | 10/10 | 252.4 |
| electron | SIGKILL | keys | 3 | 3/3 | 3/3 | 0.6 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 222 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

