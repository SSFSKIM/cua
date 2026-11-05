# linux-engine-diff summary

## t60-accept-idle-control-paste (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| chrome | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 165.1 |
| chrome | control | paste | 10 | 2 | 3 | fails with each request unredirected (2/10; the text wrong in 2) | 2 | 3 | 67.9 |
| electron | shipped | paste | 30 | 0 | 30 | 30 consecutive | 0 | 30 | 148.6 |
| electron | control | paste | 10 | 10 | 0 | fails with each request unredirected (10/10; the text wrong in 0) | 10 | 0 | 2038.1 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | shipped | clean | 9 (0) | yes | – |
| chrome | control | clean | 9 (0) | yes | – |
| electron | shipped | clean | 9 (0) | yes | – |
| electron | control | clean | 9 (0) | yes | – |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 239 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

