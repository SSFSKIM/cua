# linux-engine-diff summary

## pinned-L4d (experiment drop-signals; acceptance on the pinned release)

candidate: sha256 eff8befcf591b937c3b019f32a2b9e36b47d126ffb12b1c187dc18519e4d67ca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.4 (23f342178d94); the pin's x64 asset of linux-engine-v0.4.4; native/linux-engine as at 23f342178d94f81fc37a95124e818f8238b36ef0, the checkout at cd03a47bde2a484e1c3ecbf07cc97aada720fda7; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/45138098451/attempts/1, built from 23f342178d94f81fc37a95124e818f8238b36ef0 (refs/heads/engine-044) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/45135771944/attempts/1, built from 23f342178d94f81fc37a95124e818f8238b36ef0 (refs/heads/engine-044) on a github-hosted runner

Drop signals (drop-signals.mjs), chrome, load load2, plan t14-long (part 1 of t14-stale): 100 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| load2 | role:range | 100 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:text | 100 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:canvas | 100 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any | 100 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any-hit-chain | 100 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | xdnd-aware | 100 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

Drop signals (drop-signals.mjs), chrome, load load2, plan t14-floor (part 2 of t14-stale): 360 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| load2 | role:range | 360 | 0 | 0 | 0 | 0 | – |
| load2 | role:text | 360 | 0 | 0 | 0 | 0 | – |
| load2 | role:canvas | 360 | 0 | 0 | 0 | 0 | – |
| load2 | role:any | 360 | 0 | 0 | 0 | 0 | – |
| load2 | role:any-hit-chain | 360 | 0 | 0 | 0 | 0 | – |
| load2 | xdnd-aware | 360 | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| load2 | activation | 300 | 300 | 0 | 300 | 0 | 0 | 0 | 0 / 0 | 0 | 1.1 / 3.9 / 6.3 |
| load2 | accept cursor at the release | 300 | 300 | 0 | 134 | 5 | 0 | 0 | 161 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| load2 | cua | plain-long | 300 | 300 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

Drop signals (drop-signals.mjs), electron, load load2, plan t17-long (part 3 of t14-stale): 30 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| load2 | role:range | 30 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:text | 30 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:canvas | 30 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any | 30 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any-hit-chain | 30 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | xdnd-aware | 30 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

A plan of parts, t14-stale (drop-signals-judge.mjs `partsVerdict`): each part judged by its own plan's judge.

### part 1 (chrome t14-long)

T14's Chrome cells (drop-signals-judge.mjs `chromeDropVerdict`), plan t14-long, load load2:

| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes | stale-position drops | ambiguous |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| cua | long-left | 100 | 0 | 0 | 0 | 100 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |

Every late take reported, no false ok, no drop at a stale position, no missing landing, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%.

### part 2 (chrome t14-floor)

T14's Chrome cells (drop-signals-judge.mjs `chromeDropVerdict`), plan t14-floor, load load2:

| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes | stale-position drops | ambiguous |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| cua | plain-long | 300 | 0 | 300 | 300 | 0 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |
| cua | left | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |
| cua | inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |

Every late take reported, no false ok, no drop at a stale position, no missing landing, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): T14's share, reported and not a fail: 0 of 300 landed drops answered unconfirmed, within 5%.

### part 3 (electron t17-long)

T17's Electron cells (drop-signals-judge.mjs `electronDropVerdict`), load load2:

| lane | cell | drags | end not verified | landed | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (move or link / cold handle at load / other) | stale-position drops | ambiguous |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| cua | long-left | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |

No false ok, no drop at a stale position, no missing landing, no false error, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): cua long-left: 30 of 30 drags exercised the long path (a take, its motion after the take past the 350 ms floor, and the expected end); 30 took, 30 outlasted the floor; zone-truth mismatches (ruling 830, a declared app-level limit: an ok answer whose own dragend reported copy while the zone's drop counter did not move), load load2: none in 30 drags of the window's cells; T14's share, reported and not a fail for these cells: 0 of 0 landed drops answered unconfirmed, within 5%.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9773 requests, 1707 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

