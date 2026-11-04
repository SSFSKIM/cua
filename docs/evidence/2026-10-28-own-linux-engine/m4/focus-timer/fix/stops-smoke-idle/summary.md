# linux-engine-diff summary

## t56-stops-smoke2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 101.5 |
| chrome | SIGTERM | clicks | 10 | 10/10 | 10/10 | 101.3 |
| chrome | SIGTERM | drag | 10 | 0/10 | 0/10 | 0.8 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 0.6 |

**Incomplete or failed:** chrome SIGTERM (drag): 10 of 10 runs did not drain the drag's release and its FocusOut.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 160 requests, 18 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

