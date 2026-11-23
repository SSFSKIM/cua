
## x64/d1n-0-1/run/results.jsonl

| family | kind | pinned ms | newest ms | cua ms | cua took | cua | cua:nopings ms | cua:nopings took | cua:nopings |
|---|---|---:|---:|---:|---:|---|---:|---:|---|
| chrome | select | 453.4 | 322.4 | 454.3 | 30/30 | PASS | 454 | 30/30 | PASS |
| chrome | range | 453 | 324.9 | 454.4 | 30/30 | PASS | 454.2 | 30/30 | PASS |
| chrome | scroller | 279.4 | 263.2 | 454.2 | 30/30 | PASS | 454.1 | 30/30 | PASS |
| chrome | dnd | 509.8 | 338 | 366.3 | 30/30 | declared speed gap (#358) (speed fail [25.3, 31.6] vs newest 338) | 366.1 | 30/30 | declared speed gap (#358) (speed fail [24.1, 30.7] vs newest 338) |
| chrome | canvas | 1154.4 | 514 | 476.5 | 40/40 | PASS | 477 | 40/40 | PASS |
- cua: PASS; declared: chrome dnd: cua declared speed gap (#358): cua 366.3 ms against newest's 338 ms, the interval [25.3, 31.6] within the declared 40 ms
- cua:nopings: PASS; declared: chrome dnd: cua:nopings declared speed gap (#358): cua:nopings 366.1 ms against newest's 338 ms, the interval [24.1, 30.7] within the declared 40 ms

## x64/d2-0-1/run/results.jsonl

| family | kind | pinned ms | newest ms | cua ms | cua took | cua |
|---|---|---:|---:|---:|---:|---|
| electron | select | 457.3 | 324.2 | 456.8 | 30/30 | PASS |
| electron | range | 459.6 | 325.1 | 457.5 | 30/30 | PASS |
| electron | scroller | 279.2 | 262 | 456.5 | 30/30 | PASS |
| electron | dnd | 513.3 | 338.3 | 405.1 | 30/30 | PASS |
| electron | canvas | 1158.1 | 516.3 | 479.2 | 30/30 | PASS |
- cua: PASS
