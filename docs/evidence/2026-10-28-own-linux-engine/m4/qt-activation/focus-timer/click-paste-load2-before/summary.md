# linux-engine-diff summary

## t61-click-paste-before-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| kate | shipped | click-paste | 60 | 14 | 1 | **not reached** (desktop 14) | 14 | 1 | 134.6 |
| qtcreator | shipped | click-paste | 60 | 19 | 0 | **not reached** (desktop 19) | 19 | 0 | 228.1 |

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|
| kate | shipped | click-paste | – | **not clean** | 0 (0) | **no** | 0xe00006's session was never closed; 0 FocusOut in the trace and 2 reported by the engine |
| qtcreator | shipped | click-paste | – | clean | 2 (0) | yes | – |

**Incomplete or failed:** kate click-paste: no 30 consecutive passing runs in 60; qtcreator click-paste: no 30 consecutive passing runs in 60; kate shipped click-paste: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 2221 requests, 152 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

