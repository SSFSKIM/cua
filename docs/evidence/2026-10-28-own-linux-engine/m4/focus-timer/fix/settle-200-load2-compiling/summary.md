# linux-engine-diff summary

## t56-settle-200-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 26/30 | 22/30 | 203.3 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 201.8 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 6 |
| electron | SIGTERM | keys | 30 | 29/30 | 28/30 | 202.3 |
| electron | SIGTERM | clicks | 10 | 10/10 | 10/10 | 201.4 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 1.9 |

**Incomplete or failed:** chrome SIGTERM: 4 of 30 runs did not drain the burst and its FocusOut; electron SIGTERM: 1 of 30 runs did not drain the burst and its FocusOut.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 226 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

