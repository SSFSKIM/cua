# linux-engine-diff summary

## m4-dev-F2-pilot (experiment focus-timer; development run, not a release gate)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.4 |
| chrome | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.1 |
| chrome | SIGKILL | keys | 3 | 3/3 | 1/3 | 0.7 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.5 |
| electron | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.1 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 0.6 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 237 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

