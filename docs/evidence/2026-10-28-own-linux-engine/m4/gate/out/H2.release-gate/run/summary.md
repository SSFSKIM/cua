# linux-engine-diff summary

## m4-gate-H2 (experiment drop-signals; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

Drop signals (drop-signals.mjs), electron, load gate-windows, plan t17-fix3: 560 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| gate-windows | role:range | 560 | 0 | 0 | 0 | 0 | – |
| gate-windows | role:text | 560 | 0 | 0 | 0 | 0 | – |
| gate-windows | role:canvas | 560 | 0 | 0 | 0 | 0 | – |
| gate-windows | role:any | 560 | 0 | 0 | 0 | 0 | – |
| gate-windows | role:any-hit-chain | 560 | 0 | 0 | 0 | 0 | – |
| gate-windows | xdnd-aware | 560 | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| gate-windows | activation | 200 | 200 | 0 | 0 | 200 | 0 | 0 | 0 / 0 | 0 | – |
| gate-windows | accept cursor at the release | 200 | 200 | 0 | 69 | 43 | 0 | 0 | 88 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| gate-windows | cua | plain | 100 | 100 | 0 | 0 | 0 | – |
| gate-windows | cua:handle | plain | 100 | 100 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

T17's Electron cells (drop-signals-judge.mjs `electronDropVerdict`), load gate-windows:

| lane | cell | drags | end not verified | landed | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (move or link / cold handle at load / other) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| cua | plain | 100 | 0 | 100 | 100 | 0 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua | left | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua | inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:desktop | root | 0 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:desktop | xterm | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:desktop | other | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:desktop | slow | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | plain | 100 | 0 | 100 | 96 | 4 | 0 | 0 | 0 | 4 (0 / 4 / 0) |
| cua:handle | left | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | root | 0 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | xterm | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | other | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0 / 0 / 0) |
| cua:handle | slow | 29 | 1 | 0 | 0 | 29 | 0 | 0 | 0 | 0 (0 / 0 / 0) |

No false ok, no missing landing, no false error, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): cua:desktop root unmeasured: every end (30) was not verified where the drag left the pointer; cua:handle root unmeasured: every end (30) was not verified where the drag left the pointer; #365's declared race, load gate-windows: the hung sink answered ok with no drop and nothing pending on 0 of 59 drags (cua:desktop 0 of 30, cua:handle 0 of 29), a finding, not a fail; 4 cold handle drops at load landed while Electron's cursor still showed no drop, answered unconfirmed (#364); T14's share, reported and not a fail for these cells: 4 of 200 landed drops answered unconfirmed, within 5%.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 12045 requests, 2223 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

