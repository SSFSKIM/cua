# linux-engine-diff summary

## t59-zero-idle-firefox (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| firefox | timer | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 12.2 |
| firefox | timer | aba | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 221 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 155.3 |
| firefox | control-0ms | burst | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 31.2 |
| firefox | control-0ms | aba | 52 | 1 | 30 | 30 consecutive (text 1) | 1 | 30 | 53.1 |
| firefox | control-0ms | paste | 60 | 40 | 0 | **not reached** (unconfirmed 15, refused 25) | 44 | 0 | 63.6 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| firefox | timer | clean | 6 (6) | yes | – |
| firefox | control-0ms | clean | 53 (0) | yes | – |

**Incomplete or failed:** firefox paste (control-0ms): no 30 consecutive passing runs in 60.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 244 requests, 12 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

