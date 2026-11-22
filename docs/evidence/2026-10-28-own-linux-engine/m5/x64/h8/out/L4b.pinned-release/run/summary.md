# linux-engine-diff summary

## pinned-L4b (experiment drop-signals; acceptance on the pinned release)

candidate: sha256 f1513e79f4efdb3dd950e108fec05ce59b090926907a3071ee65ca3899d4921f, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.3 (ba5b043834ce); the pin's x64 asset of linux-engine-v0.4.3; native/linux-engine as at ba5b043834ce8239936743ec8de395deca15bd43, the checkout at 048140a2bde0f6398cc910c1aa14ecf2e7e51004; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44966356899/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44964231636/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner

Drop signals (drop-signals.mjs), chrome, load load2, plan t14: 360 drags.

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
| load2 | activation | 300 | 300 | 0 | 300 | 0 | 0 | 0 | 0 / 0 | 0 | 1.5 / 5.1 / 8.8 |
| load2 | accept cursor at the release | 300 | 300 | 0 | 216 | 7 | 0 | 0 | 77 / 0 | 0 | – |

The release at the accept (measurement only, `--drag-dnd-release-at-accept`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on `nozone`, a drag bound to leave, any accept read is a false accept.

| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| load2 | cua:accept | plain-long | 300 | 293 | 0 | 7 | 0 | 14.813043 / 55.234509 / 100.734033 | 254.4 |

Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.

| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|
| load2 | cua:accept | plain-long | 300 | 300 | 0 | 0 | 0 | – |

Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.

| cell | covered part | cover | drags | survived | start role |
|---|---|---|---:|---:|---|

T14's Chrome cells (drop-signals-judge.mjs `chromeDropVerdict`), plan t14, load load2:

| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes | stale-position drops | ambiguous |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| cua:accept | plain-long | 300 | 0 | 300 | 300 | 0 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |
| cua:accept | left | 30 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 |
| cua:accept | inzone-out | 30 | 0 | 0 | 1 | 29 | 0 | 0 | 0 | 5 (1) | 0 | 0 | 0 |

Every late take reported, no false ok, no drop at a stale position, no missing landing, every notice refused once; every cell of the plan ran.

Findings (counted, not fails): T14's share, reported and not a fail: 0 of 300 landed drops answered unconfirmed, within 5%; 5 false releases at the accept (measurement lane `cua:accept`, not shipped), 1 of them answered ok with nothing pending.


desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7141 requests, 1244 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

