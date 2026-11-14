# linux-engine-diff summary

## t68-idle-cover (experiment drop-signals)

Drop signals (drop-signals.mjs), chrome, load idle, plan cover: 500 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor change (accept.rs) shown before the release. A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode: an override-redirect window of the harness's over a part of the path. A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | drags | survived | start role |
|---|---|---:|---:|---|
| select@none | none | 20 | 20 | static 20 |
| select@start | start | 20 | 20 | static 20 |
| select@middle | middle | 20 | 20 | static 20 |
| select@end | end | 20 | 20 | static 20 |
| select@all | all | 20 | 20 | static 20 |
| range@none | none | 20 | 20 | slider 20 |
| range@start | start | 20 | 20 | slider 20 |
| range@middle | middle | 20 | 20 | slider 20 |
| range@end | end | 20 | 20 | slider 20 |
| range@all | all | 20 | 20 | slider 20 |
| scroller@none | none | 20 | 20 | section 20 |
| scroller@start | start | 20 | 20 | section 20 |
| scroller@middle | middle | 20 | 20 | section 20 |
| scroller@end | end | 20 | 20 | section 20 |
| scroller@all | all | 20 | 20 | section 20 |
| canvas@none | none | 20 | 20 | canvas 20 |
| canvas@start | start | 20 | 20 | canvas 20 |
| canvas@middle | middle | 20 | 20 | canvas 20 |
| canvas@end | end | 20 | 20 | canvas 20 |
| canvas@all | all | 20 | 20 | canvas 20 |
| plain@none | none | 20 | 0 | panel 20 |
| plain@start | start | 20 | 0 | panel 20 |
| plain@middle | middle | 20 | 0 | panel 20 |
| plain@end | end | 20 | 0 | panel 20 |
| plain@all | all | 20 | 0 | panel 20 |


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11188 requests, 2920 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

