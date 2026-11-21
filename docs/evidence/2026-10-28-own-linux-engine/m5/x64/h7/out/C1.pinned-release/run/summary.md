# linux-engine-diff summary

## pinned-C1 (experiment drop-signals; acceptance on the pinned release)

candidate: sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (9371d2348cf8); the pin's x64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at ae3fc1e80685e192fd75d01a71ac14c034992a77; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

Drop signals (drop-signals.mjs), chrome, load idle, plan t14-late: 40 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:text | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:canvas | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any-hit-chain | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | xdnd-aware | 40 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 24 | 24 | 0 | 24 | 0 | 0 | 0 | 0 / 0 | 0 | 0.7 / 1.5 / 2 |
| idle | accept cursor at the release | 24 | 24 | 0 | 23 | 1 | 0 | 0 | 0 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | freeze-600 | 10 | 10 | 0 | 0 | 0 | – |
| idle | cua | freeze-646 | 5 | 5 | 0 | 0 | 0 | – |
| idle | cua | freeze-648 | 5 | 5 | 0 | 0 | 0 | – |
| idle | cua | freeze-650 | 5 | 5 | 3 | 3 | 0 | 0.1 / 0.9 |
| idle | cua | freeze-652 | 5 | 4 | 2 | 2 | 0 | 1.5 / 2.2 |
| idle | cua | freeze-700 | 10 | 0 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

T14's Chrome cells (drop-signals-judge.mjs `chromeDropVerdict`), plan t14-late, load idle:

| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| cua | freeze-600 | 10 | 0 | 10 | 10 | 0 | 0 | 0 | 0 | 0 (0) | 0 |
| cua | freeze-646 | 5 | 0 | 5 | 5 | 0 | 0 | 0 | 0 | 0 (0) | 0 |
| cua | freeze-648 | 5 | 0 | 5 | 5 | 0 | 0 | 0 | 0 | 0 (0) | 0 |
| cua | freeze-650 | 5 | 0 | 2 | 2 | 0 | 3 | 3 | 0 | 0 (0) | 0 |
| cua | freeze-652 | 5 | 1 | 2 | 3 | 0 | 2 | 2 | 0 | 0 (0) | 0 |
| cua | freeze-700 | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | 0 (0) | 0 |

| band | cells | drags | its outcome | minimum | late takes | unexercised |
|---|---|---:|---:|---:|---:|---:|
| inside | freeze-600 | 10 | 10 landed after a take inside the hold | 7 | 0 | 0 |
| edge | freeze-646, freeze-648, freeze-650, freeze-652 | 20 | – | – | 5 | 0 |
| past | freeze-700 | 10 | 10 answered the hold notice with no drop and nothing sent after it | 7 | 0 | 0 |

Every late take reported, no false ok, no missing landing, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): 5 late takes, 5 reported; 11 drags whose drag and drop never took, answered as plain drags; T14's share, reported and not a fail: 0 of 24 landed drops answered unconfirmed, within 5%.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1157 requests, 164 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

