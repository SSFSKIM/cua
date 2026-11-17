# linux-engine-diff summary

## t68-gate-main (experiment drop-signals)

Drop signals (drop-signals.mjs), chrome, load gate-windows, plan main: 960 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| gate-windows | role:range | 960 | 60 | 30 | 0 | 30 | slider 30 |
| gate-windows | role:text | 960 | 80 | 50 | 2 | 30 | nested 30, link 20 |
| gate-windows | role:canvas | 960 | 30 | 0 | 0 | 30 | – |
| gate-windows | role:any | 960 | 170 | 80 | 2 | 90 | nested 30, slider 30, link 20 |
| gate-windows | role:any-chain | 960 | 170 | 80 | 2 | 90 | nested 30, slider 30, link 20 |
| gate-windows | xdnd-aware | 960 | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor change (accept.rs) shown before the release. A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| gate-windows | activation | 739 | 641 | 98 | 641 | 0 | 0 | 98 | 1.2 / 2.2 / 52.9 |
| gate-windows | accept cursor at the release | 739 | 641 | 98 | 575 | 66 | 0 | 98 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| gate-windows | cua:accept | plain | 300 | 272 | 0 | 28 | 0 | 38.477368999999996 / 59.347496 / 151.055535 | 55.1 |
| gate-windows | cua:accept | nozone | 30 | 0 | – | 30 | – | – | 371.2 |
| gate-windows | cua:accept-gate | plain | 30 | 25 | 0 | 5 | 0 | 34.751654 / 58.561928 / 59.364667000000004 | 57.6 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
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

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode: an override-redirect window of the harness's over a part of the path. A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | drags | survived | start role |
|---|---|---:|---:|---|


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 27896 requests, 3916 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

