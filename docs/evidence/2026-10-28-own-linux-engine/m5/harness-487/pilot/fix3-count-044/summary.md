# linux-engine-diff summary

## t142-fix3-count-044 (experiment drop-signals; development run, not a release gate)

Drop signals (drop-signals.mjs), electron, load idle, plan t17-fix3: 14 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 14 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:text | 14 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:canvas | 14 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any | 14 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any-hit-chain | 14 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | xdnd-aware | 14 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 / 0 | 0 | – |
| idle | accept cursor at the release | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 1 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | plain | 1 | 1 | 0 | 0 | 0 | – |
| idle | cua:handle | plain | 1 | 1 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

T17's Electron cells (drop-signals-judge.mjs `electronDropVerdict`), load idle:

| lane | cell | drags | end not verified | landed | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (move or link / cold handle at load / other) | stale-position drops | ambiguous |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| cua | plain | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua | left | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua | inzone-out | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:desktop | root | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:desktop | xterm | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:desktop | other | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:desktop | slow | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | plain | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | left | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | inzone-out | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | root | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | xterm | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | other | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |
| cua:handle | slow | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 |

The settle's rest (#487, engine 0.4.4): 0 of 14 settled drags rested 30 ms; 0 another rest, 14 without rest_ms, 0 without the settle record; 0 drops without the engine's settle count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's.

**Fails:** a settled drag lacks the settle's rest (drop_cursor.settle.rest_ms, an integer in ms) on 14 of 14 settled drags (cua plain #0, cua left #0, cua inzone-out #0, cua:desktop root #0, cua:desktop xterm #0, …) (#487: engine 0.4.4 records it on every settle).

Findings (counted, not fails): #365's declared race, load idle: the hung sink answered ok with no drop and nothing pending on 0 of 2 drags (cua:desktop 0 of 1, cua:handle 0 of 1), a finding, not a fail; zone-truth mismatches (ruling 830, a declared app-level limit: an ok answer whose own dragend reported copy while the zone's drop counter did not move), load idle: none in 6 drags of the window's cells; T14's share, reported and not a fail for these cells: 0 of 2 landed drops answered unconfirmed, within 5%.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1397 requests, 129 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

