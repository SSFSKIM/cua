# linux-engine-diff summary

## t56-final-load2-b (experiment focus-timer)

| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |
|---|---|---|---:|---:|---:|---|---:|
| chrome | timer | burst | 30 | 0 | 30 | 30 consecutive | 15.149999999999999 |
| chrome | timer | aba | 30 | 0 | 30 | 30 consecutive | 228.95 |
| chrome | timer | paste | 30 | 0 | 30 | 30 consecutive | 218.4 |
| chrome | unredirect | burst | 60 | 31 | 2 | **not reached** | 14.55 |
| chrome | unredirect | aba | 60 | 6 | 20 | **not reached** | 223.9 |
| chrome | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 252.1 |
| chrome | control | burst | 10 | 9 | 0 | fails without the delay (9/10; the text wrong in 9) | 67.35 |
| chrome | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 81.4 |
| chrome | control | paste | 10 | 6 | 0 | fails without the delay (6/10; the text wrong in 0) | 2098 |
| electron | timer | burst | 30 | 0 | 30 | 30 consecutive | 18.35 |
| electron | timer | aba | 30 | 0 | 30 | 30 consecutive | 227.45 |
| electron | timer | paste | 30 | 0 | 30 | 30 consecutive | 179.5 |
| electron | unredirect | burst | 60 | 39 | 1 | **not reached** | 19.799999999999997 |
| electron | unredirect | aba | 33 | 2 | 30 | 30 consecutive | 230.3 |
| electron | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 188.64999999999998 |
| electron | control | burst | 10 | 9 | 1 | fails without the delay (9/10; the text wrong in 9) | 50.5 |
| electron | control | aba | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 10) | 83.3 |
| electron | control | paste | 10 | 10 | 0 | fails without the delay (10/10; the text wrong in 3) | 2082.8999999999996 |
| gedit | timer | burst | 30 | 0 | 30 | 30 consecutive | 23.5 |
| gedit | timer | aba | 30 | 0 | 30 | 30 consecutive | 233.2 |
| gedit | timer | paste | 30 | 0 | 30 | 30 consecutive | 191.65 |
| gedit | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 19.049999999999997 |
| gedit | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 235.35 |
| gedit | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 197.45 |
| gedit | control | burst | 10 | 0 | 10 | no reorder (not required) | 98.4 |
| gedit | control | aba | 10 | 0 | 10 | no reorder (not required) | 159.75 |
| gedit | control | paste | 10 | 0 | 10 | no reorder (not required) | 141.9 |
| kate | timer | burst | 30 | 0 | 30 | 30 consecutive | 16.4 |
| kate | timer | aba | 30 | 0 | 30 | 30 consecutive | 223.95 |
| kate | timer | paste | 30 | 0 | 30 | 30 consecutive | 202.15 |
| kate | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 15.4 |
| kate | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 226.15 |
| kate | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 192.7 |
| kate | control | burst | 10 | 0 | 10 | no reorder (not required) | 50.9 |
| kate | control | aba | 10 | 0 | 10 | no reorder (not required) | 199.14999999999998 |
| kate | control | paste | 10 | 0 | 10 | no reorder (not required) | 176.55 |
| qtcreator | timer | burst | 30 | 0 | 30 | 30 consecutive | 16.7 |
| qtcreator | timer | aba | 30 | 0 | 30 | 30 consecutive | 226.05 |
| qtcreator | timer | paste | 30 | 0 | 30 | 30 consecutive | 295.95000000000005 |
| qtcreator | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 19 |
| qtcreator | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 227.5 |
| qtcreator | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 292.75 |
| qtcreator | control | burst | 10 | 0 | 10 | no reorder (not required) | 109 |
| qtcreator | control | aba | 10 | 0 | 10 | no reorder (not required) | 200.95 |
| qtcreator | control | paste | 10 | 0 | 10 | no reorder (not required) | 336.1 |
| firefox | timer | burst | 30 | 0 | 30 | 30 consecutive | 14.5 |
| firefox | timer | aba | 59 | 1 | 30 | 30 consecutive | 233.3 |
| firefox | timer | paste | 30 | 0 | 30 | 30 consecutive | 183.95 |
| firefox | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 14.5 |
| firefox | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 227.9 |
| firefox | unredirect | paste | 30 | 0 | 30 | 30 consecutive | 191.45 |
| firefox | control | burst | 10 | 0 | 10 | no reorder (not required) | 54.3 |
| firefox | control | aba | 10 | 0 | 10 | no reorder (not required) | 107.8 |
| firefox | control | paste | 10 | 5 | 1 | fails without the delay (5/10; the text wrong in 3) | 184.25 |
| writer | timer | burst | 30 | 0 | 30 | 30 consecutive | 24 |
| writer | timer | aba | 30 | 0 | 30 | 30 consecutive | 246.3 |
| writer | timer | paste | 30 | 0 | 30 | 30 consecutive | 649.85 |
| writer | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 22.200000000000003 |
| writer | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 242.05 |
| writer | unredirect | paste | 43 | 2 | 30 | 30 consecutive | 648.6 |
| writer | control | burst | 10 | 0 | 10 | no reorder (not required) | 46.75 |
| writer | control | aba | 10 | 0 | 10 | no reorder (not required) | 110.35 |
| writer | control | paste | 10 | 0 | 10 | no reorder (not required) | 495.55 |
| gnome-terminal | timer | burst | 30 | 0 | 30 | 30 consecutive | 24.7 |
| gnome-terminal | timer | aba | 30 | 0 | 30 | 30 consecutive | 233.7 |
| gnome-terminal | timer | paste | 60 | 9 | 2 | **not reached** | 172.60000000000002 |
| gnome-terminal | unredirect | burst | 30 | 0 | 30 | 30 consecutive | 31.25 |
| gnome-terminal | unredirect | aba | 30 | 0 | 30 | 30 consecutive | 232.8 |
| gnome-terminal | unredirect | paste | 60 | 12 | 12 | **not reached** | 180.85 |
| gnome-terminal | control | burst | 10 | 0 | 10 | no reorder (not required) | 87.4 |
| gnome-terminal | control | aba | 10 | 0 | 10 | no reorder (not required) | 121.60000000000001 |
| gnome-terminal | control | paste | 10 | 0 | 10 | no reorder (not required) | 123.75 |

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
| chrome | SIGTERM | 10 | 2/10 | 103.95 |
| chrome | SIGKILL | 3 | 3/3 | 3.3 |
| electron | SIGTERM | 10 | 6/10 | 104.25 |
| electron | SIGKILL | 3 | 3/3 | 2.9 |

**Incomplete or failed:** chrome burst (unredirect): no 30 consecutive passing runs in 60; chrome aba (unredirect): no 30 consecutive passing runs in 60; electron burst (unredirect): no 30 consecutive passing runs in 60; gnome-terminal paste: no 30 consecutive passing runs in 60; gnome-terminal paste (unredirect): no 30 consecutive passing runs in 60; chrome SIGTERM: 8 of 10 runs did not drain the burst and its FocusOut; electron SIGTERM: 4 of 10 runs did not drain the burst and its FocusOut.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 901 requests, 74 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

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

## 43

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 44

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 45

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 46

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 47

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 48

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 49

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 50

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 51

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 52

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 53

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 54

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 55

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 56

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 57

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 58

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

## 59

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|

run unfinished

