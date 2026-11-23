
## arm64/d1-0-1/run/results.jsonl

| family | kind | pinned ms | newest ms | cua ms | cua took | cua |
|---|---|---:|---:|---:|---:|---|
| chrome | select | 415.8 | 311.6 | 451.8 | 30/30 | PASS |
| chrome | range | 415.9 | 311.7 | 451.8 | 30/30 | PASS |
| chrome | scroller | 269.1 | 257.9 | 451.8 | 30/30 | PASS |
| chrome | dnd | 479.7 | 328.1 | 354.5 | 30/30 | declared speed gap (#358) (speed fail [26.4, 26.6] vs newest 328.1) |
| chrome | canvas | 1045.3 | 486.1 | 473.3 | 40/40 | PASS |
- cua: PASS; declared: chrome dnd: cua declared speed gap (#358): cua 354.5 ms against newest's 328.1 ms, the interval [26.4, 26.6] within the declared 40 ms

## arm64/d2-0-1/run/results.jsonl

| family | kind | pinned ms | newest ms | cua ms | cua took | cua |
|---|---|---:|---:|---:|---:|---|
| electron | select | 415.8 | 311.7 | 453 | 30/30 | PASS |
| electron | range | 415.3 | 311.6 | 452.7 | 30/30 | PASS |
| electron | scroller | 268.8 | 257.7 | 452.9 | 30/30 | PASS |
| electron | dnd | 480.1 | 328.2 | 400.3 | 30/30 | PASS |
| electron | canvas | 1047 | 485.5 | 474.4 | 30/30 | PASS |
- cua: PASS
