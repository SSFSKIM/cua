## 1. Outcomes

| arch | load | source | cell | lane | series | n | took_path | took_hold | tail | no_dragstart | plain | refused | other |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| arm64 | 0 | d1 | chrome:canvas | cua | all | 40 | 0 | 0 | 0 | 0 | 40 | 0 | 0 |
| arm64 | 0 | d1 | chrome:dnd | cua | all | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| arm64 | 0 | d1 | chrome:range | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d1 | chrome:scroller | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d1 | chrome:select | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d2 | electron:canvas | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d2 | electron:dnd | cua | all | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| arm64 | 0 | d2 | electron:range | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d2 | electron:scroller | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64 | 0 | d2 | electron:select | cua | all | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| arm64:0 | 0 | v5 | shared | cua | cold | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| arm64:0 | 0 | v5 | shared | cua | warm | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| arm64:0 | 0 | v5 | short_in_front | cua | cold | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 |
| arm64:0 | 0 | v5 | short_in_front | cua | warm | 60 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |

## 2. The ping predictor (default lane)

### arm64, load 0

No-take drags: 250; with pings: tail 0 (the watch missed 0), plain 180 (d1 90, d2 90), V5 no-dragstart 0. Without pings: ('plain', 'chrome:canvas', 'no ping sent'): 40; ('plain', 'electron:canvas', 'no ping sent'): 30.

Thresholds from D1's and D2's plain drags (n 180):

| metric | controls' percentile | threshold ms | tail hits | of them the watch missed | false alarms, controls | false alarms, V5 no-dragstart | false alarms, both |
|---|---|---|---|---|---|---|---|
| max_ms | p90 | 1.1 | 0/0 | 0/0 | 1/180 | 0/0 | 1/180 |
| max_ms | p95 | 1.1 | 0/0 | 0/0 | 1/180 | 0/0 | 1/180 |
| max_ms | p99 | 1.1 | 0/0 | 0/0 | 1/180 | 0/0 | 1/180 |
| first_ms | p90 | 1.1 | 0/0 | 0/0 | 0/180 | 0/0 | 0/180 |
| first_ms | p95 | 1.1 | 0/0 | 0/0 | 0/180 | 0/0 | 0/180 |
| first_ms | p99 | 1.1 | 0/0 | 0/0 | 0/180 | 0/0 | 0/180 |

V5's scene's select control: none with pings, no thresholds.

### arm64:0, load 0

No-take drags: 0; with pings: tail 0 (the watch missed 0), plain 0 (), V5 no-dragstart 0. Without pings: none.

D1's and D2's plain drags: none with pings, no thresholds.

V5's scene's select control: none with pings, no thresholds.

## 3. Round trips (p50 / p90 / p95 / p99 / max, ms), default lane

| arch | load | group | first ping | largest ping | pings a drag | drags with an unanswered ping |
|---|---|---|---|---|---|---|
| arm64 | 0 | plain chrome:range | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| arm64 | 0 | plain chrome:scroller | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 15.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 30) | 0 |
| arm64 | 0 | plain chrome:select | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 6.3 / 6.3 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| arm64 | 0 | plain electron:range | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| arm64 | 0 | plain electron:scroller | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 15.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 30) | 0 |
| arm64 | 0 | plain electron:select | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 30) | 12.0 / 12.0 / 12.0 / 12.0 / 12.0 (n 30) | 0 |
| arm64 | 0 | plain, all controls | 1.1 / 1.1 / 1.1 / 1.1 / 1.1 (n 180) | 1.1 / 1.1 / 1.1 / 1.1 / 6.3 (n 180) | 12.0 / 15.0 / 15.0 / 15.0 / 15.0 (n 180) | 0 |
| arm64:0 | 0 | took_hold (short_in_front) | 100.3 / 102.8 / 105.5 / 107.0 / 107.0 (n 60) | 100.3 / 102.8 / 105.5 / 107.0 / 107.0 (n 60) | 1.0 / 2.0 / 2.0 / 3.0 / 3.0 (n 60) | 59 |

Takes during the hold, ms after the press:

| arch | load | source | cell | lane | p50 / p90 / p95 / p99 / max |
|---|---|---|---|---|---|
| arm64:0 | 0 | v5 | short_in_front | cua | 149.7 / 151.9 / 155.9 / 195.1 / 195.1 (n 60) |

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
| arm64 | 0 | chrome:canvas | cua | 1.8 / 2.7 / 2.8 / 2.9 / 2.9 (n 40) | 0 |
| arm64 | 0 | chrome:range | cua | 1.6 / 2.7 / 2.7 / 2.8 / 2.8 (n 30) | 0 |
| arm64 | 0 | chrome:scroller | cua | 1.6 / 2.6 / 2.6 / 2.6 / 2.6 (n 30) | 0 |
| arm64 | 0 | chrome:select | cua | 1.6 / 2.6 / 2.6 / 3.5 / 3.5 (n 30) | 0 |
| arm64 | 0 | electron:canvas | cua | 2.9 / 17.3 / 18.0 / 18.1 / 18.1 (n 30) | 0 |
| arm64 | 0 | electron:range | cua | 2.6 / 17.5 / 18.1 / 18.4 / 18.4 (n 30) | 0 |
| arm64 | 0 | electron:scroller | cua | 2.8 / 17.4 / 17.8 / 17.8 / 17.8 (n 30) | 0 |
| arm64 | 0 | electron:select | cua | 2.8 / 16.9 / 17.2 / 17.2 / 17.2 (n 30) | 0 |

Held drags with no take whose path ended before B: the release after the press, past the bound (ms). A path that itself ran past B (arm64 at twice the load, Electron) is held for nothing and released at its end.

| arch | load | source | lane | p50 / p90 / p95 / p99 / max | > 25 ms past |
|---|---|---|---|---|---|
| arm64 | 0 | d1 | cua | 0.2 / 0.3 / 0.3 / 0.3 / 0.3 (n 90) | 0 |
| arm64 | 0 | d2 | cua | 0.2 / 0.2 / 0.2 / 0.3 / 0.3 (n 90) | 0 |

## 6. The sampler and the release (ruling 892)

The engine's wall release after its press, p50 / p95 / max (ms); a refused drag records none, so its answer time stands beside it.

| arch | load | source | cell | class | lane | release after press | answer |
|---|---|---|---|---|---|---|---|
| arm64 | 0 | d1 | chrome:canvas | no take | cua | 471.5 / 471.6 / 471.6 (n 40) | 473.3 / 474.3 / 474.5 (n 40) |
| arm64 | 0 | d1 | chrome:dnd | take before the hold | cua | 352.9 / 361.8 / 365.4 (n 30) | 354.6 / 363.5 / 367.0 (n 30) |
| arm64 | 0 | d1 | chrome:range | no take | cua | 450.2 / 450.3 / 450.3 (n 30) | 451.8 / 452.9 / 453.0 (n 30) |
| arm64 | 0 | d1 | chrome:scroller | no take | cua | 450.2 / 450.3 / 450.3 (n 30) | 451.8 / 452.8 / 452.8 (n 30) |
| arm64 | 0 | d1 | chrome:select | no take | cua | 450.2 / 450.3 / 450.3 (n 30) | 451.8 / 452.9 / 453.7 (n 30) |
| arm64 | 0 | d2 | electron:canvas | no take | cua | 471.5 / 471.6 / 471.6 (n 30) | 474.4 / 489.6 / 489.7 (n 30) |
| arm64 | 0 | d2 | electron:dnd | take before the hold | cua | 396.4 / 399.3 / 399.5 (n 30) | 400.4 / 413.7 / 413.7 (n 30) |
| arm64 | 0 | d2 | electron:range | no take | cua | 450.2 / 450.2 / 450.2 (n 30) | 452.8 / 468.3 / 468.6 (n 30) |
| arm64 | 0 | d2 | electron:scroller | no take | cua | 450.2 / 450.3 / 450.3 (n 30) | 453.0 / 468.0 / 468.0 (n 30) |
| arm64 | 0 | d2 | electron:select | no take | cua | 450.2 / 450.2 / 450.2 (n 30) | 453.0 / 467.4 / 467.4 (n 30) |
| arm64:0 | 0 | v5 | shared | take before the hold | cua | – | 365.4 / 403.1 / 406.8 (n 90) |
| arm64:0 | 0 | v5 | short_in_front | take before the hold | cua | 363.9 / 398.2 / 398.2 (n 30) | 367.4 / 401.8 / 401.9 (n 30) |
| arm64:0 | 0 | v5 | short_in_front | take during the hold | cua | 499.8 / 506.0 / 545.3 (n 60) | 502.3 / 508.3 / 547.7 (n 60) |
