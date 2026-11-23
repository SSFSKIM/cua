## 1. Presses on a draggable source: when the drag is known slow (ms after the press: min / p10 / p50 / p90 / max)

| arch | load | class | n | T ms | known slow at | never slow | a fast ping before the slow one | slow before the take |
|---|---|---|---|---|---|---|---|---|
| arm64:0 | 0 | took_hold (v5) | 60 | 20 | 69 / 69 / 69 / 69 / 69 (n 60) | 0 | 0 | 60 |
| arm64:0 | 0 | took_hold (v5) | 60 | 40 | 89 / 89 / 89 / 89 / 89 (n 57) | 3 | 0 | 57 |
| arm64:0 | 0 | took_hold (v5) | 60 | 80 | 129 / 129 / 129 / 129 / 129 (n 57) | 3 | 0 | 57 |

The tail and no-dragstart drags one by one (each ping: sent after the press / round trip or unanswered age):


## 2. Plain drags: every ping's round trip, by when it was sent

| arch | load | source | drags | pings | sent 0-99 | 100-199 | 200-299 | 300-399 | 400+ | drags with a slow ping at 20, 40, 80 ms |
|---|---|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | d1 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 1 (n 360) | 1 / 1 / 1 / 1 / 1 (n 345) | 1 / 1 / 1 / 1 / 6 (n 90) | 0, 0, 0 |
| arm64 | 0 | d2 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 1 (n 360) | 1 / 1 / 1 / 1 / 1 (n 345) | 1 / 1 / 1 / 1 / 1 (n 90) | 0, 0, 0 |

Plain drags with a slow ping (T 20): when it was known slow


## 3. The rules' arithmetic

Extend: a drag known slow by B (450 ms) is held longer.

| arch | load | T ms | tails known slow by 450 | V5 no-dragstart extended | Electron no-take extended | plain drags extended |
|---|---|---|---|---|---|---|
| arm64 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/180 |
| arm64 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/180 |
| arm64 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/180 |
| arm64:0 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/0 |

An extended drag with no take would answer at about press + 650 (ok with the notice) instead of 450: each one above pays about 200 ms. The tails' dragstarts against 650 are in section 1's list.

Early release at X: released when by X a ping was answered within T and none was slow.

| arch | load | T ms | X ms | misses: takes after X released early | of them Electron | tails released early | plain drags (path < X) released early |
|---|---|---|---|---|---|---|---|
| arm64 | 0 | 20 | 100 | 0/0 | 0/0 | 0/0 | 60/60 |
| arm64 | 0 | 20 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| arm64 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 40 | 100 | 0/0 | 0/0 | 0/0 | 60/60 |
| arm64 | 0 | 40 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| arm64 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 80 | 100 | 0/0 | 0/0 | 0/0 | 60/60 |
| arm64 | 0 | 80 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| arm64 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| arm64:0 | 0 | 20 | 100 | 0/57 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 150 | 0/22 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 100 | 0/57 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 150 | 0/22 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 100 | 0/57 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 150 | 0/22 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 0/0 |
| arm64:0 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 0/0 |

## 4. The gap (ruling 897): plain drags' slowest ping against the draggable presses' slow readings

Plain: the largest wait of any ping of any plain drag (D1, D2, sel; an unanswered ping at its age). Draggable, no take: the smallest of each no-take press's largest wait (tail, V5 no-dragstart, Electron no-take). Draggable, take after 150: of the presses with a ping answered by 150 (the only ones a rule could release then), the smallest slowest reading by 150 ms. A threshold between the two with a margin each side is proposed as their geometric mean.

| arch | load | plain drags | plain max ms | no-take presses | their min of max ms | takes after 150 | their min reading by 150 ms | gap | proposed threshold |
|---|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | 180 | 6.3 (d1 chrome:select) | 0 | None | 0 | None (n 0; 0 with no ping answered by 150, held) | – | – |
| arm64:0 | 0 | 0 | None | 0 | None | 22 | 99.2 (n 8; 14 with no ping answered by 150, held) | – | – |

## 5. Failing toward the hold: pings that were not a fast answer, by class

| arch | load | class | held drags | with an unanswered ping | pings in flight at the end | pings failed to send | not asked (why: n) |
|---|---|---|---|---|---|---|---|
| arm64 | 0 | plain d1 | 90 | 0 | 0 | 0 | – |
| arm64 | 0 | plain d2 | 120 | 0 | 0 | 0 | no record: the path reached B: 30 |
| arm64:0 | 0 | took_hold (short_in_front) | 60 | 59 | 0 | 0 | – |
