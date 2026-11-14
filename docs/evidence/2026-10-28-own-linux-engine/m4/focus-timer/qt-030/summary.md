# linux-engine-diff summary

## t56-qt-030 (experiment focus-timer)

| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |
|---|---|---|---:|---:|---:|---|---:|
| kate | timer | burst | 3 | 0 | 3 | 3 consecutive | 2027.1 |
| kate | timer | aba | 3 | 0 | 3 | 3 consecutive | 2437.8 |
| kate | timer | paste | 6 | 6 | 0 | **not reached** | 970.8 |
| kate | control | burst | 10 | 0 | 10 | no reorder (not required) | 18.15 |
| kate | control | aba | 10 | 0 | 10 | no reorder (not required) | 26.450000000000003 |
| kate | control | paste | 10 | 10 | 0 | shows the reorder (10/10) | 71.25 |
| qtcreator | timer | burst | 3 | 0 | 3 | 3 consecutive | 2027.1 |
| qtcreator | timer | aba | 3 | 0 | 3 | 3 consecutive | 2432.9 |
| qtcreator | timer | paste | 6 | 6 | 0 | **not reached** | 1021.9499999999999 |
| qtcreator | control | burst | 10 | 0 | 10 | no reorder (not required) | 19.6 |
| qtcreator | control | aba | 10 | 0 | 10 | no reorder (not required) | 28.25 |
| qtcreator | control | paste | 10 | 10 | 0 | shows the reorder (10/10) | 102.55 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| kate | timer | **not clean** | 0 (0) | **no** | 53 FocusOut in the trace and 0 reported by the engine |
| kate | control | **not clean** | 0 (0) | yes | 53 FocusOut in the trace and 0 reported by the engine |
| qtcreator | timer | **not clean** | 0 (0) | **no** | 53 FocusOut in the trace and 0 reported by the engine |
| qtcreator | control | **not clean** | 0 (0) | yes | 53 FocusOut in the trace and 0 reported by the engine |

**Incomplete or failed:** kate burst: a development series of 3, not the 30 the proof needs; kate aba: a development series of 3, not the 30 the proof needs; kate paste: no 3 consecutive passing runs in 6; kate paste: a development series of 3, not the 30 the proof needs; qtcreator burst: a development series of 3, not the 30 the proof needs; qtcreator aba: a development series of 3, not the 30 the proof needs; qtcreator paste: no 3 consecutive passing runs in 6; qtcreator paste: a development series of 3, not the 30 the proof needs; kate timer: the audit is not clean; kate control: the audit is not clean; qtcreator timer: the audit is not clean; qtcreator control: the audit is not clean.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 221 requests, 20 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

## 0

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 1

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 2

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 3

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 4

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 5

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 6

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 7

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 8

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 9

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

