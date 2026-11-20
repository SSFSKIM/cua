## 1. Presses on a draggable source: when the drag is known slow (ms after the press: min / p10 / p50 / p90 / max)

| arch | load | class | n | T ms | known slow at | never slow | a fast ping before the slow one | slow before the take |
|---|---|---|---|---|---|---|---|---|
| x64 | 0 | took_hold (v5) | 88 | 20 | 69 / 69 / 70 / 70 / 70 (n 44) | 44 | 0 | 44 |
| x64 | 0 | took_hold (v5) | 88 | 40 | 89 / 89 / 90 / 90 / 90 (n 7) | 81 | 0 | 7 |
| x64 | 0 | took_hold (v5) | 88 | 80 | – | 88 | 0 | 0 |
| x64 | 2 | no_dragstart (v5) | 3 | 20 | 177 / 177 / 177 / 218 / 218 (n 3) | 0 | 0 |  |
| x64 | 2 | no_dragstart (v5) | 3 | 40 | 197 / 197 / 197 / 238 / 238 (n 3) | 0 | 0 |  |
| x64 | 2 | no_dragstart (v5) | 3 | 80 | 237 / 237 / 237 / 278 / 278 (n 3) | 0 | 0 |  |
| x64 | 2 | took_hold (v5) | 263 | 20 | 69 / 70 / 80 / 179 / 236 (n 198) | 65 | 0 | 198 |
| x64 | 2 | took_hold (v5) | 263 | 40 | 89 / 90 / 97 / 198 / 218 (n 172) | 91 | 0 | 172 |
| x64 | 2 | took_hold (v5) | 263 | 80 | 129 / 130 / 134 / 236 / 258 (n 120) | 143 | 0 | 120 |

The tail and no-dragstart drags one by one (each ping: sent after the press / round trip or unanswered age):

- x64 load 2 no_dragstart (shared) v5n-2-1 block 0 i 2: dragstart None, path 155.8, pings 157/113.5, 271/4.3, 297/1.1, 322/1.1, 348/1.1, 374/1.1, 399/1.1
- x64 load 2 no_dragstart (shared) v5n-2-1 block 11 i 2: dragstart None, path 177.5, pings 198/148.9, 347/2.2, 373/2.2, 401/2.2
- x64 load 2 no_dragstart (shared) v5n-2-3 block 1 i 1: dragstart None, path 154.0, pings 157/106.5, 264/1.1, 290/1.1, 315/1.1, 341/1.1, 367/1.1, 392/1.1, 418/1.1

## 2. Plain drags: every ping's round trip, by when it was sent

| arch | load | source | drags | pings | sent 0-99 | 100-199 | 200-299 | 300-399 | 400+ | drags with a slow ping at 20, 40, 80 ms |
|---|---|---|---|---|---|---|---|---|---|---|
| x64 | 0 | d1 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 4 (n 345) | 1 / 1 / 1 / 1 / 4 (n 360) | 1 / 1 / 1 / 1 / 1 (n 90) | 0, 0, 0 |
| x64 | 0 | d2 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 2 (n 346) | 1 / 1 / 1 / 1 / 1 (n 359) | 1 / 1 / 1 / 1 / 1 (n 90) | 0, 0, 0 |
| x64 | 2 | d1 | 120 | 1516 | 1 / 1 / 1 / 2 / 5 (n 80) | 1 / 1 / 1 / 1 / 6 (n 364) | 1 / 1 / 1 / 1 / 6 (n 475) | 1 / 1 / 1 / 2 / 8 (n 478) | 1 / 1 / 1 / 1 / 4 (n 119) | 0, 0, 0 |

Plain drags with a slow ping (T 20): when it was known slow


## 3. The rules' arithmetic

Extend: a drag known slow by B (450 ms) is held longer.

| arch | load | T ms | tails known slow by 450 | V5 no-dragstart extended | Electron no-take extended | plain drags extended |
|---|---|---|---|---|---|---|
| x64 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/180 |
| x64 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/180 |
| x64 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/180 |
| x64 | 2 | 20 | 0/0 | 3/3 | 0/0 | 0/120 |
| x64 | 2 | 40 | 0/0 | 3/3 | 0/0 | 0/120 |
| x64 | 2 | 80 | 0/0 | 3/3 | 0/0 | 0/120 |

An extended drag with no take would answer at about press + 650 (ok with the notice) instead of 450: each one above pays about 200 ms. The tails' dragstarts against 650 are in section 1's list.

Early release at X: released when by X a ping was answered within T and none was slow.

| arch | load | T ms | X ms | misses: takes after X released early | of them Electron | tails released early | plain drags (path < X) released early |
|---|---|---|---|---|---|---|---|
| x64 | 0 | 20 | 100 | 0/7 | 0/0 | 0/0 | 60/60 |
| x64 | 0 | 20 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| x64 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 40 | 100 | 0/7 | 0/0 | 0/0 | 60/60 |
| x64 | 0 | 40 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| x64 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 80 | 100 | 0/7 | 0/0 | 0/0 | 60/60 |
| x64 | 0 | 80 | 150 | 0/0 | 0/0 | 0/0 | 150/150 |
| x64 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 180/180 |
| x64 | 2 | 20 | 100 | 0/228 | 0/0 | 0/0 | 40/40 |
| x64 | 2 | 20 | 150 | 0/219 | 0/0 | 0/0 | 100/100 |
| x64 | 2 | 20 | 200 | 0/111 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 20 | 250 | 0/22 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 20 | 300 | 0/5 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 20 | 350 | 0/1 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 20 | 400 | 0/1 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 40 | 100 | 0/228 | 0/0 | 0/0 | 40/40 |
| x64 | 2 | 40 | 150 | 0/219 | 0/0 | 0/0 | 100/100 |
| x64 | 2 | 40 | 200 | 0/111 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 40 | 250 | 0/22 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 40 | 300 | 0/5 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 40 | 350 | 0/1 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 40 | 400 | 0/1 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 80 | 100 | 0/228 | 0/0 | 0/0 | 40/40 |
| x64 | 2 | 80 | 150 | 0/219 | 0/0 | 0/0 | 100/100 |
| x64 | 2 | 80 | 200 | 0/111 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 80 | 250 | 0/22 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 80 | 300 | 0/5 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 80 | 350 | 0/1 | 0/0 | 0/0 | 120/120 |
| x64 | 2 | 80 | 400 | 0/1 | 0/0 | 0/0 | 120/120 |

## 4. The gap (ruling 897): plain drags' slowest ping against the draggable presses' slow readings

Plain: the largest wait of any ping of any plain drag (D1, D2, sel; an unanswered ping at its age). Draggable, no take: the smallest of each no-take press's largest wait (tail, V5 no-dragstart, Electron no-take). Draggable, take after 150: of the presses with a ping answered by 150 (the only ones a rule could release then), the smallest slowest reading by 150 ms. A threshold between the two with a margin each side is proposed as their geometric mean.

| arch | load | plain drags | plain max ms | no-take presses | their min of max ms | takes after 150 | their min reading by 150 ms | gap | proposed threshold |
|---|---|---|---|---|---|---|---|---|---|
| x64 | 0 | 180 | 4.4 (d1 chrome:select) | 0 | None | 0 | None (n 0; 0 with no ping answered by 150, held) | – | – |
| x64 | 2 | 120 | 8.5 (d1 chrome:select) | 3 | 106.5 | 219 | None (n 0; 219 with no ping answered by 150, held) | 12.5x | 30 ms (3.5x under the draggable side, 3.5x over the plain side) |

## 5. Failing toward the hold: pings that were not a fast answer, by class

| arch | load | class | held drags | with an unanswered ping | pings in flight at the end | pings failed to send | not asked (why: n) |
|---|---|---|---|---|---|---|---|
| x64 | 0 | plain d1 | 90 | 0 | 0 | 0 | – |
| x64 | 0 | plain d2 | 120 | 0 | 0 | 0 | no record: the path reached B: 30 |
| x64 | 0 | took_hold (short_in_front) | 88 | 84 | 0 | 0 | – |
| x64 | 2 | no_dragstart (shared) | 3 | 0 | 0 | 0 | – |
| x64 | 2 | plain d1 | 120 | 0 | 0 | 0 | – |
| x64 | 2 | took_hold (shared) | 120 | 114 | 0 | 0 | the ping's connection was not ready by the hold's end: 4 |
| x64 | 2 | took_hold (short_in_front) | 147 | 113 | 0 | 0 | – |
