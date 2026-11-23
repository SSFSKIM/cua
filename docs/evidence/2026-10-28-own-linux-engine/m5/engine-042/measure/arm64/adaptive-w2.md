## 1. Presses on a draggable source: when the drag is known slow (ms after the press: min / p10 / p50 / p90 / max)

| arch | load | class | n | T ms | known slow at | never slow | a fast ping before the slow one | slow before the take |
|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | took_hold (v5) | 30 | 20 | 69 / 69 / 69 / 69 / 69 (n 30) | 0 | 0 | 30 |
| arm64 | 0 | took_hold (v5) | 30 | 40 | 89 / 89 / 89 / 89 / 89 (n 30) | 0 | 0 | 30 |
| arm64 | 0 | took_hold (v5) | 30 | 80 | 129 / 129 / 129 / 129 / 129 (n 30) | 0 | 0 | 30 |
| arm64 | 2 | tail (v5) | 4 | 20 | 70 / 70 / 76 / 85 / 85 (n 4) | 0 | 0 |  |
| arm64 | 2 | tail (v5) | 4 | 40 | 90 / 90 / 96 / 105 / 105 (n 4) | 0 | 0 |  |
| arm64 | 2 | tail (v5) | 4 | 80 | 130 / 130 / 136 / 145 / 145 (n 4) | 0 | 0 |  |
| arm64 | 2 | no_dragstart (v5) | 7 | 20 | 69 / 69 / 175 / 200 / 200 (n 7) | 0 | 0 |  |
| arm64 | 2 | no_dragstart (v5) | 7 | 40 | 89 / 89 / 195 / 220 / 220 (n 7) | 0 | 0 |  |
| arm64 | 2 | no_dragstart (v5) | 7 | 80 | 129 / 129 / 235 / 260 / 260 (n 7) | 0 | 0 |  |
| arm64 | 2 | took_hold (v5) | 330 | 20 | 69 / 70 / 91 / 180 / 234 (n 289) | 41 | 13 | 289 |
| arm64 | 2 | took_hold (v5) | 330 | 40 | 89 / 90 / 103 / 200 / 254 (n 241) | 89 | 19 | 241 |
| arm64 | 2 | took_hold (v5) | 330 | 80 | 129 / 130 / 140 / 238 / 294 (n 169) | 161 | 21 | 169 |
| arm64 | 2 | took_hold (edn) | 7 | 20 | – | 7 | 0 | 0 |
| arm64 | 2 | took_hold (edn) | 7 | 40 | – | 7 | 0 | 0 |
| arm64 | 2 | took_hold (edn) | 7 | 80 | – | 7 | 0 | 0 |
| arm64 Chrome 158 | 0 | took_hold (v5) | 10 | 20 | 69 / 69 / 69 / 69 / 69 (n 10) | 0 | 0 | 10 |
| arm64 Chrome 158 | 0 | took_hold (v5) | 10 | 40 | 89 / 89 / 89 / 89 / 89 (n 10) | 0 | 0 | 10 |
| arm64 Chrome 158 | 0 | took_hold (v5) | 10 | 80 | 129 / 129 / 129 / 129 / 129 (n 10) | 0 | 0 | 10 |
| arm64 Chrome 158 | 2 | took_hold (v5) | 40 | 20 | 69 / 70 / 78 / 175 / 183 (n 35) | 5 | 1 | 35 |
| arm64 Chrome 158 | 2 | took_hold (v5) | 40 | 40 | 90 / 91 / 99 / 195 / 203 (n 33) | 7 | 6 | 33 |
| arm64 Chrome 158 | 2 | took_hold (v5) | 40 | 80 | 130 / 130 / 139 / 234 / 241 (n 25) | 15 | 6 | 25 |
| arm64:0 | 0 | took_hold (v5) | 30 | 20 | 69 / 69 / 69 / 69 / 69 (n 30) | 0 | 0 | 30 |
| arm64:0 | 0 | took_hold (v5) | 30 | 40 | 89 / 89 / 89 / 89 / 89 (n 30) | 0 | 0 | 30 |
| arm64:0 | 0 | took_hold (v5) | 30 | 80 | 129 / 129 / 129 / 129 / 129 (n 30) | 0 | 0 | 30 |

The tail and no-dragstart drags one by one (each ping: sent after the press / round trip or unanswered age):

- arm64 load 2 tail (short_in_front) v5n-2-1 block 0 i 1: dragstart 495.6, path 48.7, pings 56/268.3, 324/unanswered 126.0
- arm64 load 2 tail (short_in_front) v5n-2-1 block 4 i 0: dragstart 458.4, path 48.4, pings 52/162.7, 214/unanswered 235.6
- arm64 load 2 tail (short_in_front) v5n-2-1 block 4 i 1: dragstart 486.8, path 48.4, pings 50/266.3, 316/unanswered 134.2
- arm64 load 2 no_dragstart (shared) v5n-2-1 block 7 i 1: dragstart None, path 153.9, pings 162/282.7
- arm64 load 2 no_dragstart (short_in_front) v5n-2-2 block 4 i 0: dragstart None, path 48.4, pings 49/204.2, 254/unanswered 196.6
- arm64 load 2 tail (short_in_front) v5n-2-2 block 9 i 2: dragstart 485.1, path 56.2, pings 65/333.1, 398/unanswered 51.7
- arm64 load 2 no_dragstart (short_in_front) v5-2-1 block 13 i 0: dragstart None, path 49.9, pings 53/207.7, 261/unanswered 189.1
- arm64 load 2 no_dragstart (shared) v5-2-2 block 1 i 1: dragstart None, path 179.4, pings 180/249.7
- arm64 load 2 no_dragstart (shared) v5-2-2 block 8 i 0: dragstart None, path 154.2, pings 156/254.6, 410/1.1
- arm64 load 2 no_dragstart (short_in_front) v5-2-2 block 14 i 0: dragstart None, path 48.4, pings 51/189.5, 240/unanswered 209.8
- arm64 load 2 no_dragstart (shared) v5-2-2 block 18 i 0: dragstart None, path 153.8, pings 155/254.9, 410/1.1

## 2. Plain drags: every ping's round trip, by when it was sent

| arch | load | source | drags | pings | sent 0-99 | 100-199 | 200-299 | 300-399 | 400+ | drags with a slow ping at 20, 40, 80 ms |
|---|---|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | d1 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 1 (n 360) | 1 / 1 / 1 / 1 / 1 (n 345) | 1 / 1 / 1 / 1 / 8 (n 90) | 0, 0, 0 |
| arm64 | 0 | sel | 45 | 540 | – | 1 / 1 / 1 / 1 / 1 (n 135) | 1 / 1 / 1 / 1 / 1 (n 180) | 1 / 1 / 1 / 1 / 1 (n 180) | 1 / 1 / 1 / 1 / 1 (n 45) | 0, 0, 0 |
| arm64 | 2 | d1 | 229 | 2801 | 1 / 1 / 1 / 2 / 7 (n 158) | 1 / 1 / 1 / 2 / 27 (n 649) | 1 / 1 / 1 / 2 / 6 (n 866) | 1 / 1 / 1 / 2 / 6 (n 899) | 1 / 1 / 1 / 2 / 5 (n 229) | 1, 0, 0 |
| arm64 | 2 | d2 | 210 | 2501 | 1 / 1 / 1 / 2 / 5 (n 142) | 1 / 1 / 1 / 2 / 15 (n 556) | 1 / 1 / 1 / 2 / 7 (n 766) | 1 / 1 / 1 / 2 / 7 (n 829) | 1 / 1 / 1 / 2 / 5 (n 208) | 0, 0, 0 |
| arm64 | 2 | sel | 129 | 1415 | – | 1 / 1 / 1 / 3 / 6 (n 334) | 1 / 1 / 1 / 3 / 6 (n 466) | 1 / 1 / 1 / 3 / 7 (n 487) | 1 / 1 / 1 / 2 / 7 (n 128) | 0, 0, 0 |
| arm64 Chrome 158 | 0 | sel | 30 | 360 | – | 1 / 1 / 1 / 1 / 1 (n 90) | 1 / 1 / 1 / 1 / 1 (n 120) | 1 / 1 / 1 / 1 / 1 (n 120) | 1 / 1 / 1 / 1 / 2 (n 30) | 0, 0, 0 |
| arm64 Chrome 158 | 2 | sel | 24 | 250 | – | 1 / 1 / 2 / 4 / 5 (n 54) | 1 / 1 / 2 / 3 / 5 (n 83) | 1 / 1 / 2 / 3 / 4 (n 90) | 1 / 1 / 1 / 3 / 3 (n 23) | 0, 0, 0 |

Plain drags with a slow ping (T 20): when it was known slow

- arm64 load 2 d1 chrome:scroller d1n-2-1 i 5: known slow at 159 ms, worst ping 26.8 ms

## 3. The rules' arithmetic

Extend: a drag known slow by B (450 ms) is held longer.

| arch | load | T ms | tails known slow by 450 | V5 no-dragstart extended | Electron no-take extended | plain drags extended |
|---|---|---|---|---|---|---|
| arm64 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/135 |
| arm64 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/135 |
| arm64 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/135 |
| arm64 | 2 | 20 | 4/4 | 7/7 | 0/0 | 1/568 |
| arm64 | 2 | 40 | 4/4 | 7/7 | 0/0 | 0/568 |
| arm64 | 2 | 80 | 4/4 | 7/7 | 0/0 | 0/568 |
| arm64 Chrome 158 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/30 |
| arm64 Chrome 158 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/30 |
| arm64 Chrome 158 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/30 |
| arm64 Chrome 158 | 2 | 20 | 0/0 | 0/0 | 0/0 | 0/24 |
| arm64 Chrome 158 | 2 | 40 | 0/0 | 0/0 | 0/0 | 0/24 |
| arm64 Chrome 158 | 2 | 80 | 0/0 | 0/0 | 0/0 | 0/24 |
| arm64:0 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/0 |

An extended drag with no take would answer at about press + 650 (ok with the notice) instead of 450: each one above pays about 200 ms. The tails' dragstarts against 650 are in section 1's list.

Early release at X: released when by X a ping was answered within T and none was slow.

| arch | load | T ms | X ms | misses: takes after X released early | of them Electron | tails released early | plain drags (path < X) released early |
|---|---|---|---|---|---|---|---|
| arm64 | 0 | 20 | 100 | 0/30 | 0/0 | 0/0 | 30/30 |
| arm64 | 0 | 20 | 150 | 0/15 | 0/0 | 0/0 | 120/120 |
| arm64 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 40 | 100 | 0/30 | 0/0 | 0/0 | 30/30 |
| arm64 | 0 | 40 | 150 | 0/15 | 0/0 | 0/0 | 120/120 |
| arm64 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 80 | 100 | 0/30 | 0/0 | 0/0 | 30/30 |
| arm64 | 0 | 80 | 150 | 0/15 | 0/0 | 0/0 | 120/120 |
| arm64 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| arm64 | 2 | 20 | 100 | 9/316 | 0/0 | 0/4 | 150/150 |
| arm64 | 2 | 20 | 150 | 0/252 | 0/0 | 0/4 | 423/431 |
| arm64 | 2 | 20 | 200 | 0/112 | 0/0 | 0/4 | 507/509 |
| arm64 | 2 | 20 | 250 | 0/53 | 0/0 | 0/4 | 523/525 |
| arm64 | 2 | 20 | 300 | 0/18 | 0/0 | 0/4 | 542/545 |
| arm64 | 2 | 20 | 350 | 0/14 | 0/0 | 0/4 | 555/558 |
| arm64 | 2 | 20 | 400 | 0/4 | 0/0 | 0/4 | 565/566 |
| arm64 | 2 | 40 | 100 | 29/316 | 0/0 | 0/4 | 150/150 |
| arm64 | 2 | 40 | 150 | 0/252 | 0/0 | 0/4 | 423/431 |
| arm64 | 2 | 40 | 200 | 0/112 | 0/0 | 0/4 | 508/509 |
| arm64 | 2 | 40 | 250 | 0/53 | 0/0 | 0/4 | 524/525 |
| arm64 | 2 | 40 | 300 | 0/18 | 0/0 | 0/4 | 543/545 |
| arm64 | 2 | 40 | 350 | 0/14 | 0/0 | 0/4 | 556/558 |
| arm64 | 2 | 40 | 400 | 0/4 | 0/0 | 0/4 | 566/566 |
| arm64 | 2 | 80 | 100 | 30/316 | 0/0 | 0/4 | 150/150 |
| arm64 | 2 | 80 | 150 | 21/252 | 0/0 | 0/4 | 423/431 |
| arm64 | 2 | 80 | 200 | 0/112 | 0/0 | 0/4 | 508/509 |
| arm64 | 2 | 80 | 250 | 0/53 | 0/0 | 0/4 | 524/525 |
| arm64 | 2 | 80 | 300 | 0/18 | 0/0 | 0/4 | 543/545 |
| arm64 | 2 | 80 | 350 | 0/14 | 0/0 | 0/4 | 556/558 |
| arm64 | 2 | 80 | 400 | 0/4 | 0/0 | 0/4 | 566/566 |
| arm64 Chrome 158 | 0 | 20 | 100 | 0/10 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 0 | 20 | 150 | 0/7 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 100 | 0/10 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 0 | 40 | 150 | 0/7 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 100 | 0/10 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 0 | 80 | 150 | 0/7 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 30/30 |
| arm64 Chrome 158 | 2 | 20 | 100 | 0/39 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 2 | 20 | 150 | 0/32 | 0/0 | 0/0 | 16/16 |
| arm64 Chrome 158 | 2 | 20 | 200 | 0/12 | 0/0 | 0/0 | 19/19 |
| arm64 Chrome 158 | 2 | 20 | 250 | 0/7 | 0/0 | 0/0 | 20/20 |
| arm64 Chrome 158 | 2 | 20 | 300 | 0/1 | 0/0 | 0/0 | 22/22 |
| arm64 Chrome 158 | 2 | 20 | 350 | 0/0 | 0/0 | 0/0 | 23/23 |
| arm64 Chrome 158 | 2 | 20 | 400 | 0/0 | 0/0 | 0/0 | 24/24 |
| arm64 Chrome 158 | 2 | 40 | 100 | 7/39 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 2 | 40 | 150 | 1/32 | 0/0 | 0/0 | 16/16 |
| arm64 Chrome 158 | 2 | 40 | 200 | 0/12 | 0/0 | 0/0 | 19/19 |
| arm64 Chrome 158 | 2 | 40 | 250 | 0/7 | 0/0 | 0/0 | 20/20 |
| arm64 Chrome 158 | 2 | 40 | 300 | 0/1 | 0/0 | 0/0 | 22/22 |
| arm64 Chrome 158 | 2 | 40 | 350 | 0/0 | 0/0 | 0/0 | 23/23 |
| arm64 Chrome 158 | 2 | 40 | 400 | 0/0 | 0/0 | 0/0 | 24/24 |
| arm64 Chrome 158 | 2 | 80 | 100 | 7/39 | 0/0 | 0/0 | 0/0 |
| arm64 Chrome 158 | 2 | 80 | 150 | 6/32 | 0/0 | 0/0 | 16/16 |
| arm64 Chrome 158 | 2 | 80 | 200 | 0/12 | 0/0 | 0/0 | 19/19 |
| arm64 Chrome 158 | 2 | 80 | 250 | 0/7 | 0/0 | 0/0 | 20/20 |
| arm64 Chrome 158 | 2 | 80 | 300 | 0/1 | 0/0 | 0/0 | 22/22 |
| arm64 Chrome 158 | 2 | 80 | 350 | 0/0 | 0/0 | 0/0 | 23/23 |
| arm64 Chrome 158 | 2 | 80 | 400 | 0/0 | 0/0 | 0/0 | 24/24 |
| arm64:0 | 0 | 20 | 100 | 0/30 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 150 | 0/14 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 100 | 0/30 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 150 | 0/14 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 100 | 0/30 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 150 | 0/14 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |

## 4. The gap (ruling 897): plain drags' slowest ping against the draggable presses' slow readings

Plain: the largest wait of any ping of any plain drag (D1, D2, sel; an unanswered ping at its age). Draggable, no take: the smallest of each no-take press's largest wait (tail, V5 no-dragstart, Electron no-take). Draggable, take after 150: of the presses with a ping answered by 150 (the only ones a rule could release then), the smallest slowest reading by 150 ms. A threshold between the two with a margin each side is proposed as their geometric mean.

| arch | load | plain drags | plain max ms | no-take presses | their min of max ms | takes after 150 | their min reading by 150 ms | gap | proposed threshold |
|---|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | 135 | 8.5 (d1 chrome:select) | 0 | None | 15 | None (n 0; 15 with no ping answered by 150, held) | – | – |
| arm64 | 2 | 568 | 26.8 (d1 chrome:scroller) | 11 | 204.2 | 252 | 40.900000000000006 (n 21; 231 with no ping answered by 150, held) | 1.5x | 33 ms (1.2x under the draggable side, 1.2x over the plain side) |
| arm64 Chrome 158 | 0 | 30 | 2.1 (sel chrome_select_nudged_shared) | 0 | None | 7 | 100.2 (n 2; 5 with no ping answered by 150, held) | 47.7x | 15 ms (6.9x under the draggable side, 6.9x over the plain side) |
| arm64 Chrome 158 | 2 | 24 | 5.3 (sel chrome_select_nudged_shared) | 0 | None | 32 | 37.5 (n 6; 26 with no ping answered by 150, held) | 7.1x | 14 ms (2.7x under the draggable side, 2.7x over the plain side) |
| arm64:0 | 0 | 0 | None | 0 | None | 14 | 100.4 (n 1; 13 with no ping answered by 150, held) | – | – |

## 5. Failing toward the hold: pings that were not a fast answer, by class

| arch | load | class | held drags | with an unanswered ping | pings in flight at the end | pings failed to send | not asked (why: n) |
|---|---|---|---|---|---|---|---|
| arm64 | 0 | plain d1 | 90 | 0 | 0 | 0 | – |
| arm64 | 0 | plain sel | 45 | 0 | 0 | 0 | – |
| arm64 | 0 | took_hold (short_in_front) | 30 | 29 | 0 | 0 | – |
| arm64 | 2 | no_dragstart (shared) | 4 | 0 | 0 | 0 | – |
| arm64 | 2 | no_dragstart (short_in_front) | 3 | 3 | 0 | 0 | – |
| arm64 | 2 | plain d1 | 230 | 0 | 0 | 0 | no ping fitted in what was left of the hold: 1 |
| arm64 | 2 | plain d2 | 320 | 0 | 0 | 0 | no ping fitted in what was left of the hold: 4; no record: the path reached B: 106 |
| arm64 | 2 | plain sel | 150 | 0 | 0 | 0 | no ping fitted in what was left of the hold: 2; no record: the path reached B: 19 |
| arm64 | 2 | tail (short_in_front) | 4 | 4 | 0 | 0 | – |
| arm64 | 2 | took_hold (edn) | 9 | 1 | 0 | 0 | the ping's connection was not ready by the hold's end: 2 |
| arm64 | 2 | took_hold (shared) | 139 | 131 | 0 | 0 | the ping's connection was not ready by the hold's end: 3 |
| arm64 | 2 | took_hold (short_in_front) | 194 | 174 | 0 | 0 | – |
| arm64 Chrome 158 | 0 | plain sel | 30 | 0 | 0 | 0 | – |
| arm64 Chrome 158 | 0 | took_hold (short_in_front) | 10 | 10 | 0 | 0 | – |
| arm64 Chrome 158 | 2 | plain sel | 30 | 0 | 0 | 0 | no record: the path reached B: 6 |
| arm64 Chrome 158 | 2 | took_hold (shared) | 12 | 12 | 0 | 0 | – |
| arm64 Chrome 158 | 2 | took_hold (short_in_front) | 28 | 26 | 0 | 0 | – |
| arm64:0 | 0 | took_hold (short_in_front) | 30 | 30 | 0 | 0 | – |
