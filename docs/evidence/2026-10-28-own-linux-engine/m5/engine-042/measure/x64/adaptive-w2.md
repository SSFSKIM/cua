## 1. Presses on a draggable source: when the drag is known slow (ms after the press: min / p10 / p50 / p90 / max)

| arch | load | class | n | T ms | known slow at | never slow | a fast ping before the slow one | slow before the take |
|---|---|---|---|---|---|---|---|---|
| x64 | 0 | took_hold (v5) | 30 | 20 | 69 / 69 / 70 / 70 / 70 (n 9) | 21 | 0 | 9 |
| x64 | 0 | took_hold (v5) | 30 | 40 | 90 / 90 / 90 / 90 / 90 (n 1) | 29 | 0 | 1 |
| x64 | 0 | took_hold (v5) | 30 | 80 | – | 30 | 0 | 0 |
| x64 | 2 | no_dragstart (v5) | 5 | 20 | 175 / 175 / 176 / 188 / 188 (n 5) | 0 | 0 |  |
| x64 | 2 | no_dragstart (v5) | 5 | 40 | 195 / 195 / 196 / 208 / 208 (n 5) | 0 | 0 |  |
| x64 | 2 | no_dragstart (v5) | 5 | 80 | 235 / 235 / 236 / 248 / 248 (n 5) | 0 | 0 |  |
| x64 | 2 | took_hold (v5) | 256 | 20 | 69 / 70 / 77 / 180 / 197 (n 184) | 72 | 1 | 184 |
| x64 | 2 | took_hold (v5) | 256 | 40 | 89 / 90 / 95 / 200 / 217 (n 164) | 92 | 1 | 164 |
| x64 | 2 | took_hold (v5) | 256 | 80 | 129 / 130 / 133 / 235 / 246 (n 119) | 137 | 0 | 119 |

The tail and no-dragstart drags one by one (each ping: sent after the press / round trip or unanswered age):

- x64 load 2 no_dragstart (shared) v5-2-1 block 13 i 1: dragstart None, path 153.8, pings 156/165.0, 321/19.2, 347/3.2, 372/1.1, 398/1.1, 423/1.1
- x64 load 2 no_dragstart (shared) v5-2-1 block 15 i 0: dragstart None, path 153.8, pings 155/130.8, 286/10.7, 312/1.1, 337/1.1, 363/1.1, 388/1.1, 414/1.1
- x64 load 2 no_dragstart (shared) v5-2-1 block 25 i 1: dragstart None, path 160.5, pings 168/96.8, 265/2.2, 290/1.1, 316/1.1, 342/1.1, 367/1.1, 393/1.1, 418/1.1
- x64 load 2 no_dragstart (shared) v5-2-2 block 12 i 1: dragstart None, path 153.8, pings 156/91.2, 247/1.1, 272/1.1, 298/1.2, 324/1.1, 349/1.1, 375/1.1, 400/1.1
- x64 load 2 no_dragstart (shared) v5-2-2 block 21 i 1: dragstart None, path 153.7, pings 156/182.9, 339/27.7, 367/4.3, 393/3.2, 418/1.1

## 2. Plain drags: every ping's round trip, by when it was sent

| arch | load | source | drags | pings | sent 0-99 | 100-199 | 200-299 | 300-399 | 400+ | drags with a slow ping at 20, 40, 80 ms |
|---|---|---|---|---|---|---|---|---|---|---|
| x64 | 0 | d1 | 90 | 1140 | 1 / 1 / 1 / 1 / 1 (n 60) | 1 / 1 / 1 / 1 / 1 (n 285) | 1 / 1 / 1 / 1 / 1 (n 345) | 1 / 1 / 1 / 1 / 1 (n 360) | 1 / 1 / 1 / 1 / 4 (n 90) | 0, 0, 0 |
| x64 | 0 | sel | 45 | 540 | – | 1 / 1 / 1 / 1 / 1 (n 135) | 1 / 1 / 1 / 1 / 1 (n 180) | 1 / 1 / 1 / 1 / 1 (n 180) | 1 / 1 / 1 / 1 / 3 (n 45) | 0, 0, 0 |
| x64 | 2 | d1 | 240 | 3022 | 1 / 1 / 1 / 2 / 7 (n 160) | 1 / 1 / 1 / 2 / 10 (n 726) | 1 / 1 / 1 / 1 / 11 (n 945) | 1 / 1 / 1 / 2 / 14 (n 952) | 1 / 1 / 1 / 2 / 8 (n 239) | 0, 0, 0 |
| x64 | 2 | d2 | 240 | 3010 | 1 / 1 / 1 / 2 / 8 (n 157) | 1 / 1 / 1 / 2 / 10 (n 726) | 1 / 1 / 1 / 2 / 8 (n 943) | 1 / 1 / 1 / 2 / 11 (n 948) | 1 / 1 / 1 / 2 / 9 (n 236) | 0, 0, 0 |
| x64 | 2 | sel | 156 | 1847 | – | 1 / 1 / 1 / 2 / 10 (n 454) | 1 / 1 / 1 / 3 / 11 (n 620) | 1 / 1 / 1 / 3 / 16 (n 619) | 1 / 1 / 1 / 3 / 6 (n 154) | 0, 0, 0 |

Plain drags with a slow ping (T 20): when it was known slow


## 3. The rules' arithmetic

Extend: a drag known slow by B (450 ms) is held longer.

| arch | load | T ms | tails known slow by 450 | V5 no-dragstart extended | Electron no-take extended | plain drags extended |
|---|---|---|---|---|---|---|
| x64 | 0 | 20 | 0/0 | 0/0 | 0/0 | 0/135 |
| x64 | 0 | 40 | 0/0 | 0/0 | 0/0 | 0/135 |
| x64 | 0 | 80 | 0/0 | 0/0 | 0/0 | 0/135 |
| x64 | 2 | 20 | 0/0 | 5/5 | 0/0 | 0/636 |
| x64 | 2 | 40 | 0/0 | 5/5 | 0/0 | 0/636 |
| x64 | 2 | 80 | 0/0 | 5/5 | 0/0 | 0/636 |

An extended drag with no take would answer at about press + 650 (ok with the notice) instead of 450: each one above pays about 200 ms. The tails' dragstarts against 650 are in section 1's list.

Early release at X: released when by X a ping was answered within T and none was slow.

| arch | load | T ms | X ms | misses: takes after X released early | of them Electron | tails released early | plain drags (path < X) released early |
|---|---|---|---|---|---|---|---|
| x64 | 0 | 20 | 100 | 0/1 | 0/0 | 0/0 | 30/30 |
| x64 | 0 | 20 | 150 | 0/0 | 0/0 | 0/0 | 120/120 |
| x64 | 0 | 20 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 20 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 20 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 20 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 20 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 40 | 100 | 0/1 | 0/0 | 0/0 | 30/30 |
| x64 | 0 | 40 | 150 | 0/0 | 0/0 | 0/0 | 120/120 |
| x64 | 0 | 40 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 40 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 40 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 40 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 40 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 80 | 100 | 0/1 | 0/0 | 0/0 | 30/30 |
| x64 | 0 | 80 | 150 | 0/0 | 0/0 | 0/0 | 120/120 |
| x64 | 0 | 80 | 200 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 80 | 250 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 80 | 300 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 80 | 350 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 0 | 80 | 400 | 0/0 | 0/0 | 0/0 | 135/135 |
| x64 | 2 | 20 | 100 | 0/216 | 0/0 | 0/0 | 159/160 |
| x64 | 2 | 20 | 150 | 0/205 | 0/0 | 0/0 | 539/547 |
| x64 | 2 | 20 | 200 | 0/106 | 0/0 | 0/0 | 634/634 |
| x64 | 2 | 20 | 250 | 0/15 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 20 | 300 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 20 | 350 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 20 | 400 | 0/0 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 40 | 100 | 1/216 | 0/0 | 0/0 | 159/160 |
| x64 | 2 | 40 | 150 | 0/205 | 0/0 | 0/0 | 539/547 |
| x64 | 2 | 40 | 200 | 0/106 | 0/0 | 0/0 | 634/634 |
| x64 | 2 | 40 | 250 | 0/15 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 40 | 300 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 40 | 350 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 40 | 400 | 0/0 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 80 | 100 | 1/216 | 0/0 | 0/0 | 159/160 |
| x64 | 2 | 80 | 150 | 0/205 | 0/0 | 0/0 | 539/547 |
| x64 | 2 | 80 | 200 | 0/106 | 0/0 | 0/0 | 634/634 |
| x64 | 2 | 80 | 250 | 0/15 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 80 | 300 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 80 | 350 | 0/1 | 0/0 | 0/0 | 636/636 |
| x64 | 2 | 80 | 400 | 0/0 | 0/0 | 0/0 | 636/636 |

## 4. The gap (ruling 897): plain drags' slowest ping against the draggable presses' slow readings

Plain: the largest wait of any ping of any plain drag (D1, D2, sel; an unanswered ping at its age). Draggable, no take: the smallest of each no-take press's largest wait (tail, V5 no-dragstart, Electron no-take). Draggable, take after 150: of the presses with a ping answered by 150 (the only ones a rule could release then), the smallest slowest reading by 150 ms. A threshold between the two with a margin each side is proposed as their geometric mean.

| arch | load | plain drags | plain max ms | no-take presses | their min of max ms | takes after 150 | their min reading by 150 ms | gap | proposed threshold |
|---|---|---|---|---|---|---|---|---|---|
| x64 | 0 | 135 | 4.3 (d1 chrome:select) | 0 | None | 0 | None (n 0; 0 with no ping answered by 150, held) | – | – |
| x64 | 2 | 636 | 16.1 (sel chrome_select_nudged_shared) | 5 | 91.2 | 205 | None (n 0; 205 with no ping answered by 150, held) | 5.7x | 38 ms (2.4x under the draggable side, 2.4x over the plain side) |

## 5. Failing toward the hold: pings that were not a fast answer, by class

| arch | load | class | held drags | with an unanswered ping | pings in flight at the end | pings failed to send | not asked (why: n) |
|---|---|---|---|---|---|---|---|
| x64 | 0 | plain d1 | 90 | 0 | 0 | 0 | – |
| x64 | 0 | plain sel | 45 | 0 | 0 | 0 | – |
| x64 | 0 | took_hold (short_in_front) | 30 | 29 | 0 | 0 | – |
| x64 | 2 | no_dragstart (shared) | 5 | 0 | 0 | 0 | – |
| x64 | 2 | plain d1 | 240 | 0 | 0 | 0 | – |
| x64 | 2 | plain d2 | 320 | 0 | 0 | 0 | no record: the path reached B: 80 |
| x64 | 2 | plain sel | 156 | 0 | 0 | 0 | – |
| x64 | 2 | took_hold (shared) | 117 | 107 | 0 | 0 | the ping's connection was not ready by the hold's end: 9 |
| x64 | 2 | took_hold (short_in_front) | 148 | 106 | 0 | 0 | – |
