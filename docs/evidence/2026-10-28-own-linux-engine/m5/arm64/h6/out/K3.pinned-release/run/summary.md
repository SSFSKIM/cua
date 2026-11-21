# linux-engine-diff summary

## pinned-K3 (experiment drop-signals; acceptance on the pinned release)

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); the pin's arm64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

Drop signals (drop-signals.mjs), chrome, load idle, plan hold-regression: 20 drags.

Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (`XdndSelection`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from 300 drags.

| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |
|---|---|---:|---:|---:|---:|---:|---|
| idle | role:range | 20 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:text | 20 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:canvas | 20 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any | 20 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | role:any-hit-chain | 20 (under 300) | 0 | 0 | 0 | 0 | – |
| idle | xdnd-aware | 20 (under 300) | 0 | 0 | 0 | 0 | – |

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 20 | 20 | 0 | 20 | 0 | 0 | 0 | 0 / 0 | 0 | 0.8 / 1.2 / 1.2 |
| idle | accept cursor at the release | 20 | 20 | 0 | 20 | 0 | 0 | 0 | 0 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| idle | cua | dragstart-150 | 10 | 10 | 0 | 0 | 0 | – |
| idle | cua | dragstart-400 | 10 | 10 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|


The hold's regression cells (drop-signals-judge.mjs `holdRegressionVerdict`, ruling 900): every drop whose page started it late landed inside B.

- dragstart-150: 10 of 10 landed
- dragstart-400: 10 of 10 landed

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 651 requests, 88 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

