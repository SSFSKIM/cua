## 1. Outcomes

| arch | load | source | cell | lane | series | n | took_path | took_hold | tail | no_dragstart | plain | refused | other |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| x64 | 0 | d1 | chrome:canvas | cua | all | 40 | 0 | 0 | 0 | 0 | 40 | 0 | 0 |
| x64 | 0 | d1 | chrome:range | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| x64 | 0 | d1 | chrome:scroller | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| x64 | 0 | d1 | chrome:select | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| x64 | 0 | edn | electron:dnd-short | cua | all | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 0 | sel | chrome_select_nudged | cua | all | 45 | 0 | 0 | 0 | 0 | 45 | 0 | 0 |
| x64 | 0 | v5 | shared | cua | cold | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 0 | v5 | shared | cua | warm | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 0 | v5 | short_in_front | cua | cold | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 0 | v5 | short_in_front | cua | warm | 30 | 0 | 30 | 0 | 0 | 0 | 0 | 0 |
| x64 | 2 | d1 | chrome:canvas | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d1 | chrome:range | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d1 | chrome:scroller | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d1 | chrome:select | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d2 | electron:canvas | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d2 | electron:dnd | cua | all | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 2 | d2 | electron:range | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d2 | electron:scroller | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | d2 | electron:select | cua | all | 80 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| x64 | 2 | edn | electron:dnd-short | cua | all | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| x64 | 2 | sel | chrome_select_nudged | cua | all | 156 | 0 | 0 | 0 | 0 | 156 | 0 | 0 |
| x64 | 2 | v5 | shared | cua | cold | 52 | 14 | 37 | 0 | 1 | 0 | 0 | 0 |
| x64 | 2 | v5 | shared | cua | warm | 104 | 20 | 80 | 0 | 4 | 0 | 0 | 0 |
| x64 | 2 | v5 | short_in_front | cua | cold | 52 | 1 | 51 | 0 | 0 | 0 | 0 | 0 |
| x64 | 2 | v5 | short_in_front | cua | warm | 104 | 7 | 97 | 0 | 0 | 0 | 0 | 0 |

## 2. The ping predictor (default lane)

### x64, load 0

No-take drags: 175; with pings: tail 0 (the watch missed 0), plain 135 (d1 90, sel 45), V5 no-dragstart 0. Without pings: ('plain', 'chrome:canvas', 'no ping sent'): 40.

Thresholds from D1's and D2's plain drags (n 90):

| metric | controls' percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no-dragstart | false alarms, both |
|---|---|---|---|---|---|---|---|
| max_ms | p90 | 1.2 | 0/0 | 0/0 | 3/90 | 0/0 | 3/90 |
| max_ms | p95 | 1.2 | 0/0 | 0/0 | 3/90 | 0/0 | 3/90 |
| max_ms | p99 | 4.3 | 0/0 | 0/0 | 0/90 | 0/0 | 0/90 |
| first_ms | p90 | 1.1 | 0/0 | 0/0 | 2/90 | 0/0 | 2/90 |
| first_ms | p95 | 1.1 | 0/0 | 0/0 | 2/90 | 0/0 | 2/90 |
| first_ms | p99 | 1.2 | 0/0 | 0/0 | 0/90 | 0/0 | 0/90 |

Thresholds from V5's scene's select control (n 45):

| metric | controls' percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no-dragstart | false alarms, both |
|---|---|---|---|---|---|---|---|
| max_ms | p90 | 1.2 | 0/0 | 0/0 | 2/45 | 0/0 | 2/45 |
| max_ms | p95 | 1.2 | 0/0 | 0/0 | 2/45 | 0/0 | 2/45 |
| max_ms | p99 | 3.4 | 0/0 | 0/0 | 0/45 | 0/0 | 0/45 |
| first_ms | p90 | 1.1 | 0/0 | 0/0 | 1/45 | 0/0 | 1/45 |
| first_ms | p95 | 1.1 | 0/0 | 0/0 | 1/45 | 0/0 | 1/45 |
| first_ms | p99 | 1.2 | 0/0 | 0/0 | 0/45 | 0/0 | 0/45 |

### x64, load 2

No-take drags: 801; with pings: tail 0 (the watch missed 0), plain 636 (d1 240, d2 240, sel 156), V5 no-dragstart 5. Without pings: ('plain', 'chrome:canvas', 'no ping sent'): 80; ('plain', 'electron:canvas', 'no ping sent'): 80.

Thresholds from D1's and D2's plain drags (n 480):

| metric | controls' percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no-dragstart | false alarms, both |
|---|---|---|---|---|---|---|---|
| max_ms | p90 | 5.3 | 0/0 | 0/0 | 41/480 | 5/5 | 46/485 |
| max_ms | p95 | 6.4 | 0/0 | 0/0 | 23/480 | 5/5 | 28/485 |
| max_ms | p99 | 9.7 | 0/0 | 0/0 | 4/480 | 5/5 | 9/485 |
| first_ms | p90 | 1.9 | 0/0 | 0/0 | 47/480 | 5/5 | 52/485 |
| first_ms | p95 | 2.7 | 0/0 | 0/0 | 23/480 | 5/5 | 28/485 |
| first_ms | p99 | 6.4 | 0/0 | 0/0 | 4/480 | 5/5 | 9/485 |

Thresholds from V5's scene's select control (n 156):

| metric | controls' percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no-dragstart | false alarms, both |
|---|---|---|---|---|---|---|---|
| max_ms | p90 | 6.4 | 0/0 | 0/0 | 7/156 | 5/5 | 12/161 |
| max_ms | p95 | 6.4 | 0/0 | 0/0 | 7/156 | 5/5 | 12/161 |
| max_ms | p99 | 10.7 | 0/0 | 0/0 | 1/156 | 5/5 | 6/161 |
| first_ms | p90 | 2.2 | 0/0 | 0/0 | 14/156 | 5/5 | 19/161 |
| first_ms | p95 | 3.7 | 0/0 | 0/0 | 7/156 | 5/5 | 12/161 |
| first_ms | p99 | 6.4 | 0/0 | 0/0 | 1/156 | 5/5 | 6/161 |

## 3. Round trips (p50 / p90 / p95 / p99 / max, ms), default lane

| arch | load | group | first ping | largest ping | pings a drag | drags with an unanswered ping |
|---|---|---|---|---|---|---|
| x64 | 0 | plain chrome:range | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.2 / 1.2 / 1.2 / 1.2 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| x64 | 0 | plain chrome:scroller | 1.1 / 1.1 / 1.1 / 1.2 / 1.2 (n 30) | 1.2 / 1.2 / 1.2 / 1.3 / 1.3 (n 30) | 15.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 30) | 0 |
| x64 | 0 | plain chrome:select | 1.1 / 1.1 / 1.1 / 1.2 / 1.2 (n 30) | 1.1 / 1.2 / 3.3 / 4.3 / 4.3 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| x64 | 0 | plain chrome_select_nudged_shared | 1.1 / 1.1 / 1.1 / 1.2 / 1.2 (n 45) | 1.1 / 1.2 / 1.2 / 3.4 / 3.4 (n 45) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 45) | 0 |
| x64 | 0 | plain, all controls | 1.1 / 1.1 / 1.1 / 1.2 / 1.2 (n 135) | 1.1 / 1.2 / 1.2 / 3.4 / 4.3 (n 135) | 12.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 135) | 0 |
| x64 | 0 | took_hold (short_in_front) | 18.3 / 26.5 / 31.1 / 54.6 / 54.6 (n 30) | 18.3 / 26.5 / 31.1 / 54.6 / 54.6 (n 30) | 1.0 / 1.0 / 1.0 / 2.0 / 2.0 (n 30) | 29 |
| x64 | 2 | no_dragstart (shared) | 130.8 / 182.9 / 182.9 / 182.9 / 182.9 (n 5) | 130.8 / 182.9 / 182.9 / 182.9 / 182.9 (n 5) | 7.0 / 8.0 / 8.0 / 8.0 / 8.0 (n 5) | 0 |
| x64 | 2 | plain chrome:range | 1.1 / 1.2 / 3.2 / 4.2 / 4.2 (n 80) | 2.2 / 4.2 / 4.3 / 6.7 / 6.7 (n 80) | 11.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 80) | 0 |
| x64 | 2 | plain chrome:scroller | 1.1 / 1.2 / 2.2 / 6.7 / 6.7 (n 80) | 2.3 / 5.4 / 6.7 / 13.6 / 13.6 (n 80) | 15.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 80) | 0 |
| x64 | 2 | plain chrome:select | 1.1 / 1.7 / 3.6 / 5.7 / 5.7 (n 80) | 2.2 / 4.3 / 6.4 / 10.8 / 10.8 (n 80) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 80) | 0 |
| x64 | 2 | plain chrome_select_nudged_shared | 1.1 / 2.2 / 3.7 / 6.4 / 7.4 (n 156) | 3.2 / 6.4 / 6.4 / 10.7 / 16.1 (n 156) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 156) | 0 |
| x64 | 2 | plain electron:range | 1.1 / 2.7 / 3.2 / 6.1 / 6.1 (n 80) | 3.2 / 6.4 / 7.5 / 9.6 / 9.6 (n 80) | 11.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 80) | 0 |
| x64 | 2 | plain electron:scroller | 1.1 / 2.0 / 4.4 / 7.6 / 7.6 (n 80) | 2.2 / 5.3 / 6.7 / 8.5 / 8.5 (n 80) | 15.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 80) | 0 |
| x64 | 2 | plain electron:select | 1.1 / 1.6 / 2.1 / 6.5 / 6.5 (n 80) | 2.2 / 5.4 / 6.9 / 10.6 / 10.6 (n 80) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 80) | 0 |
| x64 | 2 | plain, all controls | 1.1 / 2.1 / 3.2 / 6.4 / 7.6 (n 636) | 2.2 / 5.4 / 6.4 / 9.7 / 16.1 (n 636) | 12.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 636) | 0 |
| x64 | 2 | took_hold (shared) | 42.0 / 85.8 / 88.1 / 104.2 / 106.2 (n 108) | 42.0 / 85.8 / 88.1 / 104.2 / 106.2 (n 108) | 1.0 / 1.0 / 1.0 / 2.0 / 2.0 (n 108) | 107 |
| x64 | 2 | took_hold (short_in_front) | 115.2 / 175.1 / 182.0 / 205.5 / 207.9 (n 148) | 115.2 / 175.1 / 182.0 / 205.5 / 207.9 (n 148) | 1.0 / 2.0 / 2.0 / 3.0 / 3.0 (n 148) | 106 |

Takes during the hold, ms after the press:

| arch | load | source | cell | lane | p50 / p90 / p95 / p99 / max |
|---|---|---|---|---|---|
| x64 | 0 | v5 | short_in_front | cua | 67.8 / 76.6 / 80.5 / 120.9 / 120.9 (n 30) |
| x64 | 2 | v5 | shared | cua | 197.2 / 242.8 / 251.9 / 259.5 / 261.2 (n 117) |
| x64 | 2 | v5 | short_in_front | cua | 176.5 / 240.5 / 251.7 / 273.1 / 354.1 (n 148) |

The tail: the page's dragstart after the press (ms):

| arch | load | cell | lane | p50 / p90 / p95 / p99 / max | past B | late take reported |
|---|---|---|---|---|---|---|

## 4. The late-take watch

| arch | load | source | cell | lane | outcome | ok | take after release ms | escaped | read notice | next request |
|---|---|---|---|---|---|---|---|---|---|---|

By time after the release: none

## 5. Plain drags' answers and the hold's release

Time outside press-to-release (answer_ms less the release after the press; ms):

| arch | load | cell | lane | p50 / p90 / p95 / p99 / max | >= 300 |
|---|---|---|---|---|---|
| x64 | 0 | chrome:canvas | cua | 4.1 / 5.8 / 6.6 / 7.8 / 7.8 (n 40) | 0 |
| x64 | 0 | chrome:range | cua | 4.0 / 5.7 / 6.5 / 7.0 / 7.0 (n 30) | 0 |
| x64 | 0 | chrome:scroller | cua | 3.9 / 5.8 / 7.0 / 10.4 / 10.4 (n 30) | 0 |
| x64 | 0 | chrome:select | cua | 3.8 / 6.2 / 6.4 / 6.8 / 6.8 (n 30) | 0 |
| x64 | 0 | chrome_select_nudged_shared | cua | 5.8 / 7.6 / 9.3 / 10.4 / 10.4 (n 45) | 0 |
| x64 | 2 | chrome:canvas | cua | 9.4 / 18.7 / 24.3 / 47.9 / 47.9 (n 80) | 0 |
| x64 | 2 | chrome:range | cua | 7.1 / 17.0 / 21.6 / 28.3 / 28.3 (n 80) | 0 |
| x64 | 2 | chrome:scroller | cua | 7.2 / 16.6 / 18.2 / 26.2 / 26.2 (n 80) | 0 |
| x64 | 2 | chrome:select | cua | 8.0 / 18.6 / 22.6 / 31.5 / 31.5 (n 80) | 0 |
| x64 | 2 | chrome_select_nudged_shared | cua | 11.7 / 19.7 / 23.6 / 29.0 / 35.5 (n 156) | 0 |
| x64 | 2 | electron:canvas | cua | 14.3 / 53.6 / 76.9 / 123.6 / 123.6 (n 80) | 0 |
| x64 | 2 | electron:range | cua | 12.4 / 42.0 / 57.1 / 92.0 / 92.0 (n 80) | 0 |
| x64 | 2 | electron:scroller | cua | 9.1 / 50.9 / 56.3 / 93.3 / 93.3 (n 80) | 0 |
| x64 | 2 | electron:select | cua | 11.5 / 53.4 / 65.3 / 84.4 / 84.4 (n 80) | 0 |

Held drags with no take whose path ended before B: the release after the press, past the bound (ms). A path that itself ran past B (arm64 at twice the load, Electron) is held for nothing and released at its end.

| arch | load | source | lane | p50 / p90 / p95 / p99 / max | > 25 ms past |
|---|---|---|---|---|---|
| x64 | 0 | d1 | cua | 0.4 / 0.5 / 0.6 / 2.3 / 2.3 (n 90) | 0 |
| x64 | 0 | sel | cua | 0.7 / 1.1 / 1.1 / 1.2 / 1.2 (n 45) | 0 |
| x64 | 2 | d1 | cua | 0.3 / 2.0 / 3.4 / 5.2 / 8.3 (n 240) | 0 |
| x64 | 2 | d2 | cua | 0.3 / 1.6 / 2.6 / 4.2 / 5.1 (n 240) | 0 |
| x64 | 2 | sel | cua | 0.7 / 2.3 / 4.3 / 6.3 / 7.0 (n 156) | 0 |
| x64 | 2 | v5 | cua | 0.3 / 5.1 / 5.1 / 5.1 / 5.1 (n 5) | 0 |

## 6. The sampler and the release (ruling 892)

The engine's wall release after its press, p50 / p95 / max (ms); a refused drag records none, so its answer time stands beside it.

| arch | load | source | cell | class | lane | release after press | answer |
|---|---|---|---|---|---|---|---|
| x64 | 0 | d1 | chrome:canvas | no take | cua | 472.4 / 473.1 / 473.9 (n 40) | 476.4 / 479.2 / 480.2 (n 40) |
| x64 | 0 | d1 | chrome:range | no take | cua | 450.4 / 450.5 / 450.7 (n 30) | 454.4 / 456.8 / 457.4 (n 30) |
| x64 | 0 | d1 | chrome:scroller | no take | cua | 450.4 / 450.6 / 450.7 (n 30) | 454.3 / 457.7 / 460.9 (n 30) |
| x64 | 0 | d1 | chrome:select | no take | cua | 450.4 / 450.5 / 452.3 (n 30) | 454.1 / 456.7 / 457.2 (n 30) |
| x64 | 0 | edn | electron:dnd-short | take before the hold | cua | 369.0 / 402.0 / 402.4 (n 30) | 375.6 / 407.2 / 407.2 (n 30) |
| x64 | 0 | sel | chrome_select_nudged | no take | cua | 450.7 / 451.1 / 451.2 (n 45) | 456.3 / 459.9 / 461.2 (n 45) |
| x64 | 0 | v5 | shared | take before the hold | cua | – | 367.9 / 389.6 / 395.1 (n 45) |
| x64 | 0 | v5 | short_in_front | take before the hold | cua | 363.6 / 399.6 / 399.6 (n 15) | 370.9 / 408.0 / 408.0 (n 15) |
| x64 | 0 | v5 | short_in_front | take during the hold | cua | 418.1 / 430.7 / 471.2 (n 30) | 423.5 / 435.0 / 477.4 (n 30) |
| x64 | 2 | d1 | chrome:canvas | no take | cua | 475.8 / 505.5 / 553.9 (n 80) | 486.6 / 541.5 / 564.0 (n 80) |
| x64 | 2 | d1 | chrome:range | no take | cua | 450.3 / 453.1 / 458.3 (n 80) | 457.6 / 471.9 / 478.5 (n 80) |
| x64 | 2 | d1 | chrome:scroller | no take | cua | 450.3 / 453.6 / 456.4 (n 80) | 458.1 / 470.7 / 476.4 (n 80) |
| x64 | 2 | d1 | chrome:select | no take | cua | 450.3 / 453.4 / 455.2 (n 80) | 458.5 / 472.9 / 481.7 (n 80) |
| x64 | 2 | d2 | electron:canvas | no take | cua | 477.9 / 501.7 / 514.0 (n 80) | 492.5 / 563.3 / 637.6 (n 80) |
| x64 | 2 | d2 | electron:dnd | take before the hold | cua | 399.8 / 412.8 / 416.2 (n 80) | 418.3 / 469.0 / 492.1 (n 80) |
| x64 | 2 | d2 | electron:range | no take | cua | 450.3 / 454.1 / 454.4 (n 80) | 463.0 / 507.3 / 546.4 (n 80) |
| x64 | 2 | d2 | electron:scroller | no take | cua | 450.3 / 452.0 / 455.1 (n 80) | 459.4 / 506.6 / 543.6 (n 80) |
| x64 | 2 | d2 | electron:select | no take | cua | 450.3 / 452.6 / 454.1 (n 80) | 461.9 / 515.5 / 538.1 (n 80) |
| x64 | 2 | edn | electron:dnd-short | take before the hold | cua | 374.2 / 407.0 / 409.1 (n 30) | 384.2 / 424.0 / 468.8 (n 30) |
| x64 | 2 | sel | chrome_select_nudged | no take | cua | 450.7 / 454.3 / 457.0 (n 156) | 463.0 / 474.5 / 486.7 (n 156) |
| x64 | 2 | v5 | shared | no take | cua | 450.3 / 455.1 / 455.1 (n 5) | 462.7 / 472.1 / 472.1 (n 5) |
| x64 | 2 | v5 | shared | take before the hold | cua | – | 466.7 / 491.7 / 497.4 (n 34) |
| x64 | 2 | v5 | shared | take during the hold | cua | – | 516.5 / 569.0 / 582.6 (n 117) |
| x64 | 2 | v5 | short_in_front | take before the hold | cua | 372.4 / 400.3 / 400.3 (n 8) | 385.8 / 415.4 / 415.4 (n 8) |
| x64 | 2 | v5 | short_in_front | take during the hold | cua | 527.8 / 601.9 / 704.8 (n 148) | 540.3 / 614.2 / 719.2 (n 148) |
