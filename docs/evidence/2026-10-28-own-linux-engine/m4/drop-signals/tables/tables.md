3930 drags over 8 runs.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 1000 | 60 | 30 | 0 | 30 | slider 30 |
| idle | role:text | 1000 | 110 | 80 | 30 | 30 | nested 30, link 20, nested-late 30 |
| idle | role:canvas | 1000 | 30 | 0 | 0 | 30 | – |
| idle | role:any | 1000 | 200 | 110 | 30 | 90 | nested 30, slider 30, link 20, nested-late 30 |
| idle | role:any-chain | 1000 | 200 | 110 | 30 | 90 | nested 30, slider 30, link 20, nested-late 30 |
| idle | xdnd-aware | 1000 | 0 | 0 | 0 | 0 | – |
| gate-windows | role:range | 960 | 60 | 30 | 0 | 30 | slider 30 |
| gate-windows | role:text | 960 | 80 | 50 | 2 | 30 | nested 30, link 20 |
| gate-windows | role:canvas | 960 | 30 | 0 | 0 | 30 | – |
| gate-windows | role:any | 960 | 170 | 80 | 2 | 90 | nested 30, slider 30, link 20 |
| gate-windows | role:any-chain | 960 | 170 | 80 | 2 | 90 | nested 30, slider 30, link 20 |
| gate-windows | xdnd-aware | 960 | 0 | 0 | 0 | 0 | – |
| load2 | role:range | 970 | 60 | 30 | 0 | 30 | slider 30 |
| load2 | role:text | 970 | 80 | 50 | 0 | 30 | nested 30, link 20 |
| load2 | role:canvas | 970 | 30 | 0 | 0 | 30 | – |
| load2 | role:any | 970 | 170 | 80 | 0 | 90 | nested 30, slider 30, link 20 |
| load2 | role:any-chain | 970 | 170 | 80 | 0 | 90 | nested 30, slider 30, link 20 |
| load2 | xdnd-aware | 970 | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor change (accept.rs) shown before the release. A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| idle | activation | 735 | 638 | 97 | 638 | 0 | 0 | 97 | 0.9 / 1.6 / 7.4 |
| idle | accept cursor at the release | 735 | 638 | 97 | 574 | 64 | 0 | 97 | – |
| gate-windows | activation | 739 | 641 | 98 | 641 | 0 | 0 | 98 | 1.2 / 2.2 / 52.9 |
| gate-windows | accept cursor at the release | 739 | 641 | 98 | 573 | 68 | 0 | 98 | – |
| load2 | activation | 694 | 582 | 112 | 582 | 0 | 0 | 112 | 1.4 / 4.9 / 34.7 |
| load2 | accept cursor at the release | 694 | 582 | 112 | 505 | 77 | 0 | 112 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| idle | cua:accept | plain | 300 | 258 | 0 | 42 | 0 | 37.331282 / 44.953947 / 67.130532 | 54.2 |
| idle | cua:accept | nozone | 30 | 0 | – | 30 | – | – | 368.2 |
| gate-windows | cua:accept | plain | 300 | 272 | 0 | 28 | 0 | 38.477368999999996 / 59.347496 / 151.055535 | 55.1 |
| gate-windows | cua:accept | nozone | 30 | 0 | – | 30 | – | – | 371.2 |
| gate-windows | cua:accept-gate | plain | 30 | 25 | 0 | 5 | 0 | 34.751654 / 58.561928 / 59.364667000000004 | 57.6 |
| load2 | cua:accept | plain | 300 | 295 | 0 | 5 | 0 | 39.69964 / 74.560831 / 101.61467999999999 | 66 |
| load2 | cua:accept | nozone | 30 | 0 | – | 30 | – | – | 370.2 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | plain | 60 | 60 | 0 | 0 | 0 | – |
| idle | cua | nozone | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | nested | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | slider | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | dragstart-150 | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | press-150 | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | dragstart-400 | 30 | 0 | 0 | 0 | 0 | – |
| idle | cua | press-400 | 30 | 0 | 0 | 0 | 0 | – |
| idle | cua | freeze-250 | 40 | 36 | 21 | 21 | 0 | 1.1 / 3.1 |
| idle | cua | link | 20 | 20 | 0 | 0 | 0 | – |
| idle | cua | image | 20 | 20 | 0 | 0 | 0 | – |
| idle | cua | seltext | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua:accept | plain | 300 | 300 | 0 | 0 | 0 | – |
| idle | cua:accept | nozone | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua:floor0 | plain | 60 | 60 | 0 | 0 | 0 | – |
| idle | cua | freeze-230 | 10 | 10 | 0 | 0 | 0 | – |
| idle | cua | freeze-240 | 10 | 10 | 0 | 0 | 0 | – |
| idle | cua | freeze-255 | 10 | 0 | 0 | 0 | 0 | – |
| idle | cua | freeze-260 | 10 | 0 | 0 | 0 | 0 | – |
| idle | cua | freeze-280 | 10 | 0 | 0 | 0 | 0 | – |
| idle | cua | freeze-330 | 10 | 0 | 0 | 0 | 0 | – |
| idle | cua | nested-late | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | plain | 60 | 60 | 0 | 0 | 0 | – |
| gate-windows | cua | nozone | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | nested | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | slider | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | dragstart-150 | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | press-150 | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua | dragstart-400 | 30 | 0 | 0 | 0 | 0 | – |
| gate-windows | cua | press-400 | 30 | 0 | 0 | 0 | 0 | – |
| gate-windows | cua | freeze-250 | 30 | 29 | 20 | 20 | 0 | 1.7 / 3.2 |
| gate-windows | cua | link | 20 | 20 | 0 | 0 | 0 | – |
| gate-windows | cua | image | 20 | 20 | 0 | 0 | 0 | – |
| gate-windows | cua | seltext | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua:accept | plain | 300 | 300 | 0 | 0 | 0 | – |
| gate-windows | cua:accept | nozone | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua:floor0 | plain | 60 | 60 | 0 | 0 | 0 | – |
| gate-windows | cua:gate | plain | 30 | 30 | 0 | 0 | 0 | – |
| gate-windows | cua:accept-gate | plain | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | plain | 60 | 60 | 0 | 0 | 0 | – |
| load2 | cua | nozone | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | nested | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | slider | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | dragstart-150 | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | press-150 | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | dragstart-400 | 30 | 0 | 0 | 0 | 0 | – |
| load2 | cua | press-400 | 30 | 0 | 0 | 0 | 0 | – |
| load2 | cua | freeze-250 | 40 | 9 | 4 | 4 | 0 | 5.5 / 8.5 |
| load2 | cua | link | 20 | 20 | 0 | 0 | 0 | – |
| load2 | cua | image | 20 | 20 | 0 | 0 | 0 | – |
| load2 | cua | seltext | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua:accept | plain | 300 | 300 | 0 | 0 | 0 | – |
| load2 | cua:accept | nozone | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua:floor0 | plain | 60 | 60 | 0 | 0 | 0 | – |
| load2 | cua | freeze-230 | 10 | 10 | 0 | 0 | 0 | – |
| load2 | cua | freeze-240 | 10 | 10 | 2 | 2 | 0 | 3.3 / 8.6 |
| load2 | cua | freeze-255 | 10 | 1 | 0 | 0 | 0 | – |
| load2 | cua | freeze-260 | 10 | 0 | 0 | 0 | 0 | – |
| load2 | cua | freeze-280 | 10 | 0 | 0 | 0 | 0 | – |
| load2 | cua | freeze-330 | 10 | 0 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|
| select | none | override-redirect | 20 | 20 | static 20 |
| select | start | override-redirect | 20 | 20 | static 20 |
| select | middle | override-redirect | 20 | 20 | static 20 |
| select | end | override-redirect | 20 | 20 | static 20 |
| select | all | override-redirect | 20 | 20 | static 20 |
| range | none | override-redirect | 20 | 20 | slider 20 |
| range | start | override-redirect | 20 | 20 | slider 20 |
| range | middle | override-redirect | 20 | 20 | slider 20 |
| range | end | override-redirect | 20 | 20 | slider 20 |
| range | all | override-redirect | 20 | 20 | slider 20 |
| scroller | none | override-redirect | 20 | 20 | section 20 |
| scroller | start | override-redirect | 20 | 20 | section 20 |
| scroller | middle | override-redirect | 20 | 20 | section 20 |
| scroller | end | override-redirect | 20 | 20 | section 20 |
| scroller | all | override-redirect | 20 | 20 | section 20 |
| canvas | none | override-redirect | 20 | 20 | canvas 20 |
| canvas | start | override-redirect | 20 | 20 | canvas 20 |
| canvas | middle | override-redirect | 20 | 20 | canvas 20 |
| canvas | end | override-redirect | 20 | 20 | canvas 20 |
| canvas | all | override-redirect | 20 | 20 | canvas 20 |
| plain | none | override-redirect | 20 | 20 | panel 20 |
| plain | start | override-redirect | 20 | 20 | panel 20 |
| plain | middle | override-redirect | 20 | 20 | panel 20 |
| plain | end | override-redirect | 20 | 20 | panel 20 |
| plain | all | override-redirect | 20 | 20 | panel 20 |
| select | none | managed | 20 | 20 | static 20 |
| select | start | managed | 20 | 20 | static 20 |
| select | middle | managed | 20 | 20 | static 20 |
| select | end | managed | 20 | 20 | static 20 |
| select | all | managed | 20 | 20 | static 20 |
| range | none | managed | 20 | 20 | slider 20 |
| range | start | managed | 20 | 20 | slider 20 |
| range | middle | managed | 20 | 20 | slider 20 |
| range | end | managed | 20 | 20 | slider 20 |
| range | all | managed | 20 | 20 | slider 20 |
| scroller | none | managed | 20 | 20 | section 20 |
| scroller | start | managed | 20 | 20 | section 20 |
| scroller | middle | managed | 20 | 20 | section 20 |
| scroller | end | managed | 20 | 20 | section 20 |
| scroller | all | managed | 20 | 20 | section 20 |
| canvas | none | managed | 20 | 20 | canvas 20 |
| canvas | start | managed | 20 | 20 | canvas 20 |
| canvas | middle | managed | 20 | 20 | canvas 20 |
| canvas | end | managed | 20 | 20 | canvas 20 |
| canvas | all | managed | 20 | 20 | canvas 20 |
| plain | none | managed | 20 | 20 | panel 20 |
| plain | start | managed | 20 | 20 | panel 20 |
| plain | middle | managed | 20 | 20 | panel 20 |
| plain | end | managed | 20 | 20 | panel 20 |
| plain | all | managed | 20 | 20 | panel 20 |

Start-point roles per cell (all loads): the role probe's deepest accessible, whether the point was in a selection, and the takes.

| cell | drags | deepest role | in a selection | took | took after the path | probe ms p50 / p95 / max |
|---|---:|---|---:|---:|---:|---|
| plain | 1320 | panel 1320 | 0 | 1320 | 2 | 63.6 / 136.7 / 375.4 |
| nozone | 180 | panel 180 | 0 | 180 | 0 | 60.4 / 121.1 / 197.8 |
| nested | 90 | static 90 | 0 | 90 | 0 | 61.4 / 152.5 / 181.2 |
| slider | 90 | slider 90 | 0 | 90 | 0 | 63.4 / 143.4 / 175.1 |
| dragstart-150 | 90 | panel 90 | 0 | 90 | 90 | 65.9 / 96 / 163.2 |
| press-150 | 90 | panel 90 | 0 | 90 | 90 | 66.3 / 152.7 / 190.6 |
| dragstart-400 | 90 | panel 90 | 0 | 0 | 0 | 61.7 / 141.2 / 166.1 |
| press-400 | 90 | panel 90 | 0 | 0 | 0 | 61.8 / 108.7 / 143.1 |
| freeze-250 | 110 | panel 110 | 0 | 74 | 74 | 61.5 / 106 / 156.7 |
| link | 60 | static 60 | 0 | 60 | 2 | 69.8 / 140.5 / 156.2 |
| image | 60 | image 60 | 0 | 60 | 0 | 49.1 / 101.7 / 135 |
| seltext | 90 | static 90 | 90 | 90 | 1 | 68.7 / 120.6 / 150.9 |
| select | 90 | static 90 | 0 | 0 | 0 | 62.6 / 155.5 / 184.3 |
| range | 90 | slider 90 | 0 | 0 | 0 | 65.8 / 118.2 / 165.9 |
| scroller | 90 | section 90 | 0 | 0 | 0 | 61.9 / 117.2 / 166.1 |
| canvas | 90 | canvas 90 | 0 | 0 | 0 | 53.1 / 90.5 / 131.8 |
| inert | 60 | section 60 | 0 | 0 | 0 | 59.7 / 126.9 / 175.8 |
| freeze-230 | 20 | panel 20 | 0 | 20 | 20 | 71.8 / 164.1 / 170 |
| freeze-240 | 20 | panel 20 | 0 | 20 | 20 | 73.6 / 106.9 / 158.2 |
| freeze-255 | 20 | panel 20 | 0 | 1 | 1 | 66.8 / 126.1 / 162 |
| freeze-260 | 20 | panel 20 | 0 | 0 | 0 | 70.8 / 115 / 153 |
| freeze-280 | 20 | panel 20 | 0 | 0 | 0 | 68.9 / 127.6 / 142.5 |
| freeze-330 | 20 | panel 20 | 0 | 0 | 0 | 70.3 / 158.1 / 187.5 |
| nested-late | 30 | static 30 | 0 | 30 | 30 | 51.4 / 72.1 / 74.6 |

Take latency on the short drop (ms after the press, from the engine's hold record), per load and lane.

| load | lane | drags | took | p50 / p95 / max | after the path | 53 ms or later |
|---|---|---:|---:|---|---:|---:|
| idle | cua | 60 | 60 | 13.8 / 48.8 / 49.3 | 0 | 0 |
| idle | cua:accept | 300 | 300 | 12.2 / 48.7 / 49.4 | 0 | 0 |
| idle | cua:floor0 | 60 | 60 | 12.2 / 48.6 / 49 | 0 | 0 |
| gate-windows | cua | 60 | 60 | 15.2 / 49.1 / 62.3 | 1 | 1 |
| gate-windows | cua:accept | 300 | 300 | 12.6 / 48.9 / 53.2 | 1 | 1 |
| gate-windows | cua:floor0 | 60 | 60 | 12.1 / 48.6 / 49.1 | 0 | 0 |
| gate-windows | cua:gate | 30 | 30 | 10.1 / 48.5 / 48.7 | 0 | 0 |
| gate-windows | cua:accept-gate | 30 | 30 | 14.7 / 48.6 / 48.8 | 0 | 0 |
| load2 | cua | 60 | 60 | 15.3 / 50.3 / 61 | 0 | 2 |
| load2 | cua:accept | 300 | 300 | 16.2 / 51.2 / 58.1 | 0 | 4 |
| load2 | cua:floor0 | 60 | 60 | 15.1 / 51.9 / 52.7 | 0 | 0 |

The short drop per load and lane: answers, landings, and the answer time.

| load | lane | drags | answered ok | landed | answer ms p50 / p95 / max |
|---|---|---:|---:|---:|---|
| idle | cua | 60 | 60 | 60 | 367.3 / 402.7 / 407.6 |
| idle | cua:accept | 300 | 300 | 300 | 54.2 / 371.1 / 402.7 |
| idle | cua:floor0 | 60 | 60 | 53 | 52.4 / 54.9 / 59.1 |
| gate-windows | cua | 60 | 60 | 60 | 369.3 / 404.9 / 419 |
| gate-windows | cua:accept | 300 | 300 | 300 | 55.1 / 365.4 / 403.9 |
| gate-windows | cua:floor0 | 60 | 60 | 52 | 53.1 / 57 / 57.8 |
| gate-windows | cua:gate | 30 | 30 | 30 | 367.3 / 405.3 / 405.7 |
| gate-windows | cua:accept-gate | 30 | 30 | 30 | 57.6 / 365.7 / 374.5 |
| load2 | cua | 60 | 60 | 60 | 372.1 / 410 / 437.4 |
| load2 | cua:accept | 300 | 300 | 300 | 66 / 110.8 / 400.2 |
| load2 | cua:floor0 | 60 | 60 | 38 | 55.3 / 70.4 / 76.3 |

The freeze cells: the run's browser stopped from 60 ms after the request to the cell's number, the press-150 source (dragstart about 150 ms after the press).

| load | cell | drags | took by the release (held) | late takes (after the release) | refused (dragstart, no take) | landed | late take after the release p50 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---|
| idle | freeze-250 | 40 | 15 | 21 | 4 | 15 | 1.1 / 3.1 |
| idle | freeze-230 | 10 | 10 | 0 | 0 | 10 | – |
| idle | freeze-240 | 10 | 10 | 0 | 0 | 10 | – |
| idle | freeze-255 | 10 | 0 | 0 | 10 | 0 | – |
| idle | freeze-260 | 10 | 0 | 0 | 10 | 0 | – |
| idle | freeze-280 | 10 | 0 | 0 | 10 | 0 | – |
| idle | freeze-330 | 10 | 0 | 0 | 10 | 0 | – |
| gate-windows | freeze-250 | 30 | 9 | 20 | 1 | 9 | 1.7 / 3.2 |
| load2 | freeze-250 | 40 | 5 | 4 | 31 | 5 | 5.5 / 8.5 |
| load2 | freeze-230 | 10 | 10 | 0 | 0 | 10 | – |
| load2 | freeze-240 | 10 | 8 | 2 | 0 | 8 | 3.3 / 8.6 |
| load2 | freeze-255 | 10 | 1 | 0 | 9 | 1 | – |
| load2 | freeze-260 | 10 | 0 | 0 | 10 | 0 | – |
| load2 | freeze-280 | 10 | 0 | 0 | 10 | 0 | – |
| load2 | freeze-330 | 10 | 0 | 0 | 10 | 0 | – |

Harness notes: drags whose drag and drop the harness ended with an Escape, answers that were errors, and drags with no wall clock from the engine.

| load | lane | cell | escaped | errors | no wall clock |
|---|---|---|---:|---:|---:|
| idle | cua:cover | plain@none | 0 | 20 | 20 |
| idle | cua:cover | plain@start | 0 | 20 | 20 |
| idle | cua:cover | plain@middle | 0 | 20 | 20 |
| idle | cua:cover | plain@end | 0 | 20 | 20 |
| idle | cua:cover | plain@all | 0 | 20 | 20 |
| idle | cua:cover-managed | plain@none | 0 | 20 | 20 |
| idle | cua:cover-managed | plain@start | 0 | 20 | 20 |
| idle | cua:cover-managed | plain@middle | 0 | 20 | 20 |
| idle | cua:cover-managed | plain@end | 0 | 20 | 20 |
| idle | cua:cover-managed | plain@all | 0 | 20 | 20 |

Sittings:

- idle-main: {"sitting":"idle-main","run":"t68-idle-main","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"main","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T02:55:25.018Z"}
- idle-freeze: {"sitting":"idle-freeze","run":"t68-idle-freeze","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"freeze","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T03:24:07.171Z"}
- idle-cover: {"sitting":"idle-cover","run":"t68-idle-cover","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"cover","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T03:26:47.651Z"}
- idle-extra: {"sitting":"idle-extra","run":"t68-idle-extra","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"extra","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T05:04:12.044Z"}
- idle-cover-managed: {"sitting":"idle-cover-managed","run":"t68-idle-cover-managed","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"cover-managed","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T
- gate-main: {"sitting":"gate-main","run":"t68-gate-main","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":false,"plan":"main","ballast":"gate","load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T03:44:44.616Z"}
- load2-main: {"sitting":"load2-main","run":"t68-load2-main","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":true,"plan":"main","ballast":null,"load_factor":2,"lanes":null,"trials":null,"started":"2026-11-09T04:25:30.021Z"}
- load2-main: {"sitting":"load2-main","run":"t68-load2-main","kind":"load","started":true,"cores":8,"workers":16,"pid":2562698,"loadavg_before":[0.63,1,0.79]}
- load2-main: {"sitting":"load2-main","run":"t68-load2-main","kind":"load","loadavg_running":[1.86,1.25,0.87]}
- load2-main: {"sitting":"load2-main","run":"t68-load2-main","kind":"load","loadavg_at_end":[16.49,16.55,14.77]}
- load2-main: {"sitting":"load2-main","run":"t68-load2-main","kind":"load","stopped":true}
- load2-freeze: {"sitting":"load2-freeze","run":"t68-load2-freeze","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":[],"load":true,"plan":"freeze","ballast":null,"load_factor":2,"lanes":null,"trials":null,"started":"2026-11-09T04:58:01.211Z"}
- load2-freeze: {"sitting":"load2-freeze","run":"t68-load2-freeze","kind":"load","started":true,"cores":8,"workers":16,"pid":2609010,"loadavg_before":[16.49,16.55,14.77]}
- load2-freeze: {"sitting":"load2-freeze","run":"t68-load2-freeze","kind":"load","loadavg_running":[16.45,16.54,14.77]}
- load2-freeze: {"sitting":"load2-freeze","run":"t68-load2-freeze","kind":"load","loadavg_at_end":[16.56,16.53,15.09]}
- load2-freeze: {"sitting":"load2-freeze","run":"t68-load2-freeze","kind":"load","stopped":true}
