# linux-engine-diff summary

## t56-delay-400-load2 (experiment focus-timer)

| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |
|---|---|---|---:|---:|---:|---|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 16.6 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 832.05 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 532.6500000000001 |
| chrome | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 16.95 |
| chrome | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 826.25 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 559.55 |
| chrome | control | burst | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 56.25 |
| chrome | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 87.05000000000001 |
| chrome | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 3) | 2113.8 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 20.700000000000003 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 832.9 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 500.9 |
| electron | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 19.95 |
| electron | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 833.3 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 502.5 |
| electron | control | burst | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 63.8 |
| electron | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 78.15 |
| electron | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 1) | 2073.6499999999996 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control | clean | 53 (0) | yes | – |

| family | signal | runs | as required | exit ms after the last answer (median) |
|---|---|---:|---|---:|
| chrome | SIGTERM | 10 | 10/10 | 405.45 |
| chrome | SIGKILL | 3 | 3/3 | 3 |
| electron | SIGTERM | 10 | 10/10 | 405.45000000000005 |
| electron | SIGKILL | 3 | 3/3 | 1.7 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 224 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

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

## 10

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 11

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 12

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 13

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 14

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 15

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 16

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 17

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 18

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 19

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 20

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 21

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 22

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 23

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 24

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 25

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 26

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 27

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 28

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 29

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

