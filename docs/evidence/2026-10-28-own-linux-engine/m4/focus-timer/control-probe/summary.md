# linux-engine-diff summary

## t56-probe-perreq (experiment focus-timer)

| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |
|---|---|---|---:|---:|---:|---|---:|
| chrome | timer | burst | 3 | 0 | 3 | 3 consecutive | 19 |
| chrome | timer | aba | 3 | 0 | 3 | 3 consecutive | 216.7 |
| chrome | timer | paste | 3 | 0 | 3 | 3 consecutive | 180.8 |
| chrome | control | burst | 10 | 7 | 2 | shows the reorder (7/10) | 48.35 |
| chrome | control | aba | 10 | 9 | 0 | shows the reorder (9/10) | 63.8 |
| chrome | control | paste | 10 | 4 | 0 | shows the reorder (4/10) | 71.75 |
| electron | timer | burst | 3 | 0 | 3 | 3 consecutive | 11.1 |
| electron | timer | aba | 3 | 0 | 3 | 3 consecutive | 216 |
| electron | timer | paste | 3 | 0 | 3 | 3 consecutive | 143.2 |
| electron | control | burst | 10 | 10 | 0 | shows the reorder (10/10) | 41.5 |
| electron | control | aba | 10 | 10 | 0 | shows the reorder (10/10) | 53.150000000000006 |
| electron | control | paste | 10 | 9 | 0 | shows the reorder (9/10) | 2052.3500000000004 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control | clean | 53 (0) | yes | – |

| family | signal | runs | as required | exit ms after the last answer (median) |
|---|---|---:|---|---:|
| chrome | SIGTERM | 10 | 10/10 | 101.55 |
| chrome | SIGKILL | 3 | 3/3 | 0.6 |
| electron | SIGTERM | 10 | 10/10 | 101.45 |
| electron | SIGKILL | 3 | 3/3 | 0.5 |

**Incomplete or failed:** chrome burst: a development series of 3, not the 30 the proof needs; chrome aba: a development series of 3, not the 30 the proof needs; chrome paste: a development series of 3, not the 30 the proof needs; electron burst: a development series of 3, not the 30 the proof needs; electron aba: a development series of 3, not the 30 the proof needs; electron paste: a development series of 3, not the 30 the proof needs.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 237 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

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

