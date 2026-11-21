# /Users/new/.local/share/cua-171/task132/out/floor-a (judged as t14-floor)

| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|
| e042 | plain-long | 32 | 32 | 32 | 0 | 0 | 0 | 0 (0 / 0 / 0 / 0) | 0 | 0 | 32 | 3 / 29 / 0 | – | – | – | – | – |
| e043 | plain-long | 300 | 300 | 300 | 0 | 0 | 0 | 0 (0 / 0 / 0 / 0) | 0 | 0 | 300 | 12 / 288 / 0 | 182 / 118 | 182 / 118 | 9 / 2 | 25.5 / 32.0 / 33.0 | 0.1 / 0.1 |
| e042 | left | 32 | 32 | 0 | 0 | 1 | 0 | 31 (31 / 0 / 0 / 0) | 0 | 0 | 1 | 31 / 1 / 0 | – | – | – | – | – |
| e043 | left | 100 | 100 | 0 | 0 | 0 | 0 | 100 (100 / 0 / 0 / 0) | 0 | 0 | 0 | 100 / 0 / 0 | 59 / 41 | 59 / 41 | 1 / 3 | 24.5 / 32.1 / 32.1 | 0.1 / 0.1 |
| e042 | inzone-out | 32 | 32 | 0 | 0 | 0 | 0 | 32 (32 / 0 / 0 / 0) | 0 | 0 | 0 | 32 / 0 / 0 | – | – | – | – | – |
| e043 | inzone-out | 32 | 32 | 0 | 0 | 0 | 0 | 32 (32 / 0 / 0 / 0) | 0 | 0 | 0 | 32 / 0 / 0 | 0 / 32 | 0 / 32 | 0 / 0 | 24.0 / 24.0 / 24.0 | 0.1 / 0.1 |

The judge per lane (H7.1 `chromeDropVerdict`, the lane's rows of every round together):

- e042: **fails:** cua left: answered ok with no drop and nothing pending on 1 of 32 (#3); findings: T14's share, reported and not a fail: 0 of 32 landed drops answered unconfirmed, within 5%
- e043: no fail; findings: T14's share, reported and not a fail: 0 of 300 landed drops answered unconfirmed, within 5%

The residue: every false ok and stale-position drop (1).

| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |
|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|
| e042 | r3 | 3 | warm | left | FALSE OK | 3.0 | accept | Activation | 537.2 | 0 | 0.4 | – | – |

In-floor rows with a visit dropped (ruling 1023): 15.

| lane | round | # | cold | cell | class | visits_dropped | skipped | activation after the release (ms) | past_floor_ms |
|---|---|---:|---|---|---|---:|---|---:|---:|
| e043 | r0 | 17 | warm | left | honest unconfirmed | 1 | false | none | 0.1 |
| e043 | r0 | 13 | warm | plain-long | landed | 2 | true | 0.7 | 0.1 |
| e043 | r0 | 21 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r0 | 57 | warm | plain-long | landed | 1 | false | -1.3 | 0.1 |
| e043 | r1 | 0 | cold | plain-long | landed | 2 | true | 1.2 | 0.1 |
| e043 | r1 | 15 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r1 | 19 | warm | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r1 | 59 | warm | plain-long | landed | 1 | false | 1.4 | 0.1 |
| e043 | r2 | 3 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r2 | 55 | warm | plain-long | landed | 1 | false | 1.1 | 0.1 |
| e043 | r2 | 67 | warm | plain-long | landed | 1 | false | 2.0 | 0.1 |
| e043 | r2 | 69 | warm | plain-long | landed | 1 | false | 0.4 | 0.1 |
| e043 | r3 | 6 | warm | plain-long | landed | 1 | false | 1.2 | 0.1 |
| e043 | r3 | 0 | cold | left | honest unconfirmed | 2 | true | none | 0.1 |
| e043 | r3 | 27 | warm | plain-long | landed | 1 | false | 0.0 | 0.1 |
