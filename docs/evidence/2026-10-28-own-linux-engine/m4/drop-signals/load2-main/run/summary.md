# linux-engine-diff summary

## t68-load2-main (experiment drop-signals)

Drop signals (drop-signals.mjs), chrome, load load2, plan main: 900 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| load2 | role:range | 900 | 60 | 30 | 0 | 30 | slider 30 |
| load2 | role:text | 900 | 80 | 50 | 0 | 30 | nested 30, link 20 |
| load2 | role:canvas | 900 | 30 | 0 | 0 | 30 | – |
| load2 | role:any | 900 | 170 | 80 | 0 | 90 | nested 30, slider 30, link 20 |
| load2 | role:any-chain | 900 | 170 | 80 | 0 | 90 | nested 30, slider 30, link 20 |
| load2 | xdnd-aware | 900 | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor change (accept.rs) shown before the release. A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| load2 | activation | 673 | 561 | 112 | 540 | 21 | 0 | 112 | 1.5 / 5.1 / 34.7 |
| load2 | accept cursor at the release | 673 | 561 | 112 | 514 | 47 | 2 | 110 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| load2 | cua:accept | plain | 300 | 295 | 0 | 5 | 0 | 39.69964 / 74.560831 / 101.61467999999999 | 66 |
| load2 | cua:accept | nozone | 30 | 0 | – | 30 | – | – | 370.2 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| load2 | cua | plain | 60 | 60 | 0 | 0 | 0 | – |
| load2 | cua | nozone | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | nested | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | slider | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | dragstart-150 | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | press-150 | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua | dragstart-400 | 30 | 0 | 0 | 0 | 0 | – |
| load2 | cua | press-400 | 30 | 0 | 0 | 0 | 0 | – |
| load2 | cua | freeze-250 | 30 | 6 | 3 | 3 | 0 | 6 / 8.5 |
| load2 | cua | link | 20 | 20 | 0 | 0 | 0 | – |
| load2 | cua | image | 20 | 20 | 0 | 0 | 0 | – |
| load2 | cua | seltext | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua:accept | plain | 300 | 300 | 0 | 0 | 0 | – |
| load2 | cua:accept | nozone | 30 | 30 | 0 | 0 | 0 | – |
| load2 | cua:floor0 | plain | 60 | 60 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode: an override-redirect window of the harness's over a part of the path. A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | drags | survived | start role |
|---|---|---:|---:|---|


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 17558 requests, 3080 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

