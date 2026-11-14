# linux-engine-diff summary

## t74w3-a-drops-1 (experiment drop-signals; development run, not a release gate)

Drop signals (drop-signals.mjs), chrome, load idle, plan pilot: 44 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 40 (under 300) | 4 | 2 | 0 | 2 | slider 2 |
| idle | role:text | 40 (under 300) | 6 | 4 | 0 | 2 | nested 2, link 2 |
| idle | role:canvas | 40 (under 300) | 2 | 0 | 0 | 2 | – |
| idle | role:any | 40 (under 300) | 12 | 6 | 0 | 6 | nested 2, slider 2, link 2 |
| idle | role:any-hit-chain | 40 (under 300) | 12 | 6 | 0 | 6 | nested 2, slider 2, link 2 |
| idle | xdnd-aware | 40 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 25 | 18 | 7 | 18 | 0 | 0 | 7 | 0 / 0 | 0 | 1 / 1.5 / 1.5 |
| idle | accept cursor at the release | 25 | 18 | 7 | 17 | 1 | 0 | 4 | 0 / 3 | 3 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| idle | cua:accept | plain | 2 | 2 | 0 | 0 | 0 | 46.056463 / 73.488353 / 73.488353 | 69.5 |
| idle | cua:accept | nozone | 2 | 0 | – | 2 | – | – | 374.5 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | plain | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | nozone | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | nested | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | slider | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | dragstart-150 | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | press-150 | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | dragstart-400 | 2 | 0 | 0 | 0 | 0 | – |
| idle | cua | press-400 | 2 | 0 | 0 | 0 | 0 | – |
| idle | cua | freeze-250 | 2 | 2 | 1 | 1 | 0 | 1.9 / 1.9 |
| idle | cua | link | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | image | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua | seltext | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua:accept | plain | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua:accept | nozone | 2 | 2 | 0 | 0 | 0 | – |
| idle | cua:floor0 | plain | 2 | 2 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|
| select | middle | override-redirect | 2 | 2 | static 2 |
| plain | end | override-redirect | 2 | 2 | panel 2 |


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2338 requests, 252 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

