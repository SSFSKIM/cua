# /Users/new/.local/share/cua-171/task147/out/floor-left (judged as t14-floor)

| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|
| h9 | left | 100 | 100 | 0 | 0 | 2 | 0 | 98 (98 / 0 / 0 / 0) | 0 | 0 | 2 | 98 / 2 / 0 | 51 / 49 | 51 / 49 | 3 / 4 | 24.3 / 32.1 / 33.1 | 0.1 / 0.1 |

The judge per lane (H7.1 `chromeDropVerdict`, the lane's rows of every round together):

- h9: **fails:** cua left: answered ok with no drop and nothing pending on 2 of 100 (#3, #13); findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%

The residue: every false ok and stale-position drop (2).

| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |
|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|
| h9 | r2 | 3 | warm | left | FALSE OK | 2.0 | accept | Activation | 350.2 | 0 | 16.2 | shut (spaced true) | in_floor, 1, 1, 15.3 |
| h9 | r2 | 13 | warm | left | FALSE OK | 0.0 | accept | Activation | 351.1 | 0 | 19.9 | shut (spaced true) | in_floor, 2, 0, 16.8 |

In-floor rows with a visit dropped (ruling 1023): 7.

| lane | round | # | cold | cell | class | visits_dropped | skipped | activation after the release (ms) | past_floor_ms |
|---|---|---:|---|---|---|---:|---|---:|---:|
| h9 | r0 | 2 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| h9 | r0 | 7 | warm | left | honest unconfirmed | 2 | true | none | 0.0 |
| h9 | r1 | 16 | warm | left | honest unconfirmed | 1 | false | none | 0.1 |
| h9 | r2 | 3 | warm | left | FALSE OK | 1 | false | 2.0 | 0.1 |
| h9 | r2 | 24 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| h9 | r3 | 5 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| h9 | r3 | 22 | warm | left | honest unconfirmed | 1 | false | none | 0.1 |
