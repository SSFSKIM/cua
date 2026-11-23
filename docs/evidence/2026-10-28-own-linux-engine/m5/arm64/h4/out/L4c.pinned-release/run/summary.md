# linux-engine-diff summary

## pinned-L4c (experiment drop-signals; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Drop signals (drop-signals.mjs), chrome, load load2, plan t14-late: 40 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| load2 | role:range | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:text | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:canvas | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | role:any-hit-chain | 40 (under 300) | 0 | 0 | 0 | 0 | – |
| load2 | xdnd-aware | 40 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| load2 | activation | 9 | 9 | 0 | 9 | 0 | 0 | 0 | 0 / 0 | 0 | 2.7 / 5.4 / 5.4 |
| load2 | accept cursor at the release | 9 | 9 | 0 | 8 | 0 | 0 | 0 | 1 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| load2 | cua | freeze-250 | 40 | 14 | 5 | 5 | 0 | 3.6 / 7.6 |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

T14's Chrome cells (drop-signals-judge.mjs `chromeDropVerdict`), plan t14-late, load load2:

| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| cua | freeze-250 | 40 | 26 | 9 | 35 | 0 | 5 | 5 | 0 | 0 (0) | 0 |

Every late take reported, no false ok, no missing landing, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): 5 late takes, 5 reported; 26 drags whose drag and drop never took, answered as plain drags; T14's share, reported and not a fail: 0 of 9 landed drops answered unconfirmed, within 5%.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 898 requests, 156 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

