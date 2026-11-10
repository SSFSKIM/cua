4080 drags over 9 runs, judged again by the fix wave's judge.

### chrome

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 735 | 638 | 97 | 638 | 0 | 0 | 97 | 0 / 0 | 0 | 0.9 / 1.6 / 7.4 |
| idle | accept cursor at the release | 735 | 638 | 97 | 563 | 62 | 0 | 91 | 13 / 6 | 6 | – |
| gate-windows | activation | 739 | 641 | 98 | 641 | 0 | 0 | 98 | 0 / 0 | 0 | 1.2 / 2.2 / 52.9 |
| gate-windows | accept cursor at the release | 739 | 641 | 98 | 544 | 64 | 0 | 85 | 33 / 13 | 13 | – |
| load2 | activation | 694 | 582 | 112 | 582 | 0 | 0 | 112 | 0 / 0 | 0 | 1.4 / 4.9 / 34.7 |
| load2 | accept cursor at the release | 694 | 582 | 112 | 393 | 15 | 0 | 75 | 174 / 37 | 37 | – |

### electron

After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own `_NET_ACTIVE_WINDOW` request for its window within 300 ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (`acceptAtRelease`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.

| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| idle | activation | 150 | 116 | 34 | 0 | 116 | 0 | 34 | 0 / 0 | 0 | – |
| idle | accept cursor at the release | 150 | 116 | 34 | 78 | 18 | 0 | 32 | 20 / 2 | 2 | – |

The accept read at the release, read again taking Chrome's return to its drag loop's cursor (the serial it showed at the take, shown again after the take) as Chrome's handling of the release, so that it and everything after it come after the release. This rests on Chrome's behaviour, not on the server's order: the return was never read more than 10 ms before the engine's release stamp in any drag that took.

| load | leaves | of them with the return seen | false accepts | indeterminate | false accepts, indeterminates counted | drops | true positives | false negatives | indeterminate drops |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 97 | 89 | 0 | 0 | 0 | 638 | 572 | 62 | 4 |
| gate-windows | 98 | 85 | 0 | 0 | 0 | 641 | 572 | 64 | 5 |
| load2 | 112 | 109 | 0 | 0 | 0 | 582 | 492 | 15 | 75 |
| idle (electron) | 34 | 29 | 0 | 0 | 0 | 116 | 92 | 18 | 6 |

The live accept lane (`--drag-dnd-release-at-accept`) replayed on the engine's own cursor record (`accept.changes`: each change's serial, server time and name) with the withdrawal rule, over the changes up to Chrome's return to its drag loop's cursor (the release's; the whole record where there is none): whether the accept the engine released on was still the cursor shown, and the sequences seen after the take (L: the loop's cursor).

| load | lane | cell | released at the accept | still shown at the release | withdrawn before it | sequences after the take |
|---|---|---|---:|---:|---:|---|
| idle | cua:accept | plain | 258 | 258 | 0 | 82, 83, L: 40; 82, 83: 202; 82, 83, L, 80: 16 |
| gate-windows | cua:accept | plain | 272 | 272 | 0 | 82, 83, L: 64; 82, 83: 182; 82, 83, L, 80: 26 |
| gate-windows | cua:accept-gate | plain | 25 | 25 | 0 | 82, 83: 14; 82, 83, L: 8; 82, 83, L, 80: 3 |
| load2 | cua:accept | plain | 295 | 295 | 0 | 82, 83: 187; 82, 83, L, 80: 102; 82, 83, L: 6 |
| idle (electron) | cua:accept | plain | 28 | 28 | 0 | 82, 83: 10; 82, 83, L: 18 |

The populations: drags whose source took by the release and did not land (the after-release table's leaves), and late takes (the take after the release; none landed), apart.

| load | leaves after an in-time take | of them with an activation request | late takes | of them with an activation request | late takes landed |
|---|---:|---:|---:|---:|---:|
| idle | 97 | 0 | 21 | 0 | 0 |
| gate-windows | 98 | 0 | 20 | 0 | 0 |
| load2 | 112 | 0 | 6 | 0 | 0 |
| idle (electron) | 34 | 0 | 0 | 0 | 0 |

Chrome: 307 leaves after an in-time take and 47 late takes, 354 drags that did not land after a take, 0 of them with an activation request.

