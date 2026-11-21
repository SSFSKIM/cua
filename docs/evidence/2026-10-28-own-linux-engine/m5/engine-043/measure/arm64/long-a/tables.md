# /Users/new/.local/share/cua-171/task132/out/long-a (judged as t14-long)

| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|
| e042 | long-left | 50 | 50 | 0 | 3 | 4 | 0 | 43 (43 / 0 / 0 / 0) | 0 | 0 | 7 | 40 / 10 / 0 | – | – | – | – | – |
| e043 | long-left | 100 | 100 | 0 | 0 | 0 | 0 | 100 (100 / 0 / 0 / 0) | 0 | 0 | 0 | 100 / 0 / 0 | 100 / 0 | 100 / 0 | 0 / 0 | 25.9 / 31.1 / 32.1 | – |

The judge per lane (H7.1 `chromeDropVerdict`, the lane's rows of every round together):

- e042: **fails:** cua long-left: answered ok with no drop and nothing pending on 4 of 50 (#2, #3, #2); cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 3 of 50 (#1, #1, #1); findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%
- e043: no fail; findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%

The residue: every false ok and stale-position drop (7).

| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |
|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|
| e042 | r0 | 2 | warm | long-left | FALSE OK | 18.5 | accept | Activation | 1359.1 | 0 | 0.1 | – | – |
| e042 | r1 | 3 | warm | long-left | FALSE OK | 3.0 | accept | Activation | 758.8 | 0 | 0.3 | – | – |
| e042 | r2 | 1 | warm | long-left | STALE | 1.5 | accept | Activation | 1317.9 | 0 | 0.1 | – | – |
| e042 | r5 | 2 | warm | long-left | FALSE OK | 9.0 | accept | Activation | 1361.1 | 0 | 0.1 | – | – |
| e042 | r7 | 1 | warm | long-left | STALE | 3.1 | accept | Activation | 1228.3 | 0 | 0.1 | – | – |
| e042 | r8 | 1 | warm | long-left | STALE | 5.6 | accept | Activation | 1446.3 | 0 | 0.0 | – | – |
| e042 | r8 | 4 | warm | long-left | FALSE OK | 2.0 | accept | Activation | 1254.3 | 0 | 0.1 | – | – |

In-floor rows with a visit dropped (ruling 1023): 0.

