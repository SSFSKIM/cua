# linux-engine-diff summary

## t56-final-idle-b (experiment focus-timer)

| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |
|---|---|---|---:|---:|---:|---|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 10.649999999999999 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 217.55 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 162.65 |
| chrome | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 10.350000000000001 |
| chrome | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 218 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 176.85 |
| chrome | control | burst | 10 | 3 | 7 | fails without the delay (3/10; the text wrong in 3) | 43.45 |
| chrome | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 55.75 |
| chrome | control | paste | 10 | 2 | 3 | fails without the delay (2/10; the text wrong in 2) | 97.95 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 10.95 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 217.75 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 143.05 |
| electron | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 11.2 |
| electron | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 217.14999999999998 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 145.9 |
| electron | control | burst | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 9) | 44.95 |
| electron | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 53.35 |
| electron | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 0) | 2048.05 |
| gedit | timer | burst | 30 | 0 | 30 | 30 consecutive | 11.75 |
| gedit | timer | aba | 30 | 0 | 30 | 30 consecutive | 218.75 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 151.25 |
| gedit | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 9.95 |
| gedit | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 217.55 |
| gedit | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 160.10000000000002 |
| gedit | control | burst | 10 | 0 | 10 | no reorder (not required) | 45.25 |
| gedit | control | aba | 10 | 0 | 10 | no reorder (not required) | 49.75 |
| gedit | control | paste | 10 | 0 | 10 | no reorder (not required) | 75.4 |
| kate | timer | burst | 30 | 0 | 30 | 30 consecutive | 10 |
| kate | timer | aba | 30 | 0 | 30 | 30 consecutive | 214.64999999999998 |
| kate | timer | paste | 30 | 0 | 30 | 30 consecutive | 156.39999999999998 |
| kate | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 9.649999999999999 |
| kate | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 214.75 |
| kate | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 154.85 |
| kate | control | burst | 10 | 0 | 10 | no reorder (not required) | 37.2 |
| kate | control | aba | 10 | 0 | 10 | no reorder (not required) | 44.45 |
| kate | control | paste | 10 | 0 | 10 | no reorder (not required) | 84.55000000000001 |
| qtcreator | timer | burst | 30 | 0 | 30 | 30 consecutive | 10 |
| qtcreator | timer | aba | 30 | 0 | 30 | 30 consecutive | 213.55 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 199.4 |
| qtcreator | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 9.75 |
| qtcreator | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 216.10000000000002 |
| qtcreator | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 209.85 |
| qtcreator | control | burst | 10 | 0 | 10 | no reorder (not required) | 35.55 |
| qtcreator | control | aba | 10 | 0 | 10 | no reorder (not required) | 52.45 |
| qtcreator | control | paste | 10 | 0 | 10 | no reorder (not required) | 128.60000000000002 |
| firefox | timer | burst | 30 | 0 | 30 | 30 consecutive | 10.350000000000001 |
| firefox | timer | aba | 30 | 0 | 30 | 30 consecutive | 222.75 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 154.05 |
| firefox | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 10.600000000000001 |
| firefox | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 217.95 |
| firefox | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 153.2 |
| firefox | control | burst | 10 | 0 | 10 | no reorder (not required) | 40.7 |
| firefox | control | aba | 10 | 0 | 10 | no reorder (not required) | 61.9 |
| firefox | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 4) | 2066.25 |
| writer | timer | burst | 30 | 0 | 30 | 30 consecutive | 11.45 |
| writer | timer | aba | 30 | 0 | 30 | 30 consecutive | 216.75 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 272.85 |
| writer | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 12.25 |
| writer | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 217 |
| writer | unredirect | paste | 43 | 2 | 30 | 30 consecutive | 275 |
| writer | control | burst | 10 | 0 | 10 | no reorder (not required) | 58.400000000000006 |
| writer | control | aba | 10 | 0 | 10 | no reorder (not required) | 58.25 |
| writer | control | paste | 10 | 0 | 10 | no reorder (not required) | 181.7 |
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 9.600000000000001 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 214.64999999999998 |
| gnome-terminal | timer | paste | 30 | 0 | 30 | 30 consecutive | 140.95 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 10.9 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 219.2 |
| gnome-terminal | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 142.25 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 47.55 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 44.65 |
| gnome-terminal | control | paste | 10 | 2 | 2 | fails without the delay (2/10; the text wrong in 0) | 51.8 |

| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---:|---|---|
| chrome | timer | clean | 6 (6) | yes | – |
| chrome | control | clean | 53 (0) | yes | – |
| electron | timer | clean | 6 (6) | yes | – |
| electron | control | clean | 53 (0) | yes | – |
| gedit | timer | clean | 6 (6) | yes | – |
| gedit | control | clean | 53 (0) | yes | – |
| kate | timer | clean | 6 (6) | yes | – |
| kate | control | clean | 53 (0) | yes | – |
| qtcreator | timer | clean | 6 (6) | yes | – |
| qtcreator | control | clean | 53 (0) | yes | – |
| firefox | timer | clean | 6 (6) | yes | – |
| firefox | control | clean | 53 (0) | yes | – |
| writer | timer | clean | 6 (6) | yes | – |
| writer | control | clean | 53 (0) | yes | – |
| gnome-terminal | timer | clean | 6 (6) | yes | – |
| gnome-terminal | control | clean | 53 (0) | yes | – |

| family | signal | runs | as required | exit ms after the last answer (median) |
|---|---|---:|---|---:|
| chrome | SIGTERM | 10 | 10/10 | 101.35 |
| chrome | SIGKILL | 3 | 3/3 | 0.5 |
| electron | SIGTERM | 10 | 10/10 | 101.3 |
| electron | SIGKILL | 3 | 3/3 | 0.5 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1003 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

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

## 30

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 31

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 32

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 33

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 34

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 35

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 36

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 37

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 38

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 39

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 40

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 41

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 42

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

