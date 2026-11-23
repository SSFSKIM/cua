> Fix wave (task 68's review): the `role:any-chain` rows are measured on hit-test results only (the probe's chain is `GetAccessibleAtPoint`'s steps, a single node in every drag here), not an ancestor check; the judge now calls the rule `role:any-hit-chain`. The "accept cursor at the release" rows are superseded by `fix-wave.md`, which orders the release as the records allow and counts indeterminate leaves against the bar.

150 drags over 1 runs.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 150 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:text | 150 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:canvas | 150 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any | 150 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any-chain | 150 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | xdnd-aware | 150 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor change (accept.rs) shown before the release. A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| idle | activation | 150 | 116 | 34 | 0 | 116 | 0 | 34 | – |
| idle | accept cursor at the release | 150 | 116 | 34 | 92 | 24 | 0 | 34 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| idle | cua:accept | plain | 30 | 28 | 0 | 2 | 0 | 35.911891000000004 / 56.393826000000004 / 56.4143 | 52.5 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | plain | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua | nozone | 30 | 30 | 0 | 0 | 0 | – |
| idle | cua:floor0 | plain | 60 | 60 | 0 | 0 | 0 | – |
| idle | cua:accept | plain | 30 | 30 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

Start-point roles per cell (all loads): the role probe's deepest accessible, whether the point was in a selection, and the takes.

| cell | drags | deepest role | in a selection | took | took after the path | probe ms p50 / p95 / max |
|---|---:|---|---:|---:|---:|---|

Take latency on the short drop (ms after the press, from the engine's hold record), per load and lane.

| load | lane | drags | took | p50 / p95 / max | after the path | 53 ms or later |
|---|---|---:|---:|---|---:|---:|
| idle (electron) | cua | 30 | 30 | 11.4 / 48.5 / 48.6 | 0 | 0 |
| idle (electron) | cua:floor0 | 60 | 60 | 13.8 / 48.5 / 48.7 | 0 | 0 |
| idle (electron) | cua:accept | 30 | 30 | 11.8 / 48.6 / 48.9 | 0 | 0 |

The short drop per load and lane: answers, landings, and the answer time.

| load | lane | drags | answered ok | landed | answer ms p50 / p95 / max |
|---|---|---:|---:|---:|---|
| idle (electron) | cua | 30 | 30 | 30 | 365.5 / 401.6 / 401.7 |
| idle (electron) | cua:floor0 | 60 | 60 | 56 | 51.7 / 54.4 / 58.6 |
| idle (electron) | cua:accept | 30 | 30 | 30 | 52.5 / 355.9 / 365.7 |

The freeze cells: the run's browser stopped from 60 ms after the request to the cell's number, the press-150 source (dragstart about 150 ms after the press).

| load | cell | drags | took by the release (held) | late takes (after the release) | refused (dragstart, no take) | landed | late take after the release p50 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---|

Harness notes: drags whose drag and drop the harness ended with an Escape, answers that were errors, and drags with no wall clock from the engine.

| load | lane | cell | escaped | errors | no wall clock |
|---|---|---|---:|---:|---:|

Sittings:

- idle-electron: {"sitting":"idle-electron","run":"t68-idle-electron","kind":"meta","experiment":"drop-signals","commit":null,"cua_version":"cua-engine 0.3.0 (405aa7730d02)","families":["electron"],"load":false,"plan":"electron","ballast":null,"load_factor":null,"lanes":null,"trials":null,"started":"2026-11-09T06:05
