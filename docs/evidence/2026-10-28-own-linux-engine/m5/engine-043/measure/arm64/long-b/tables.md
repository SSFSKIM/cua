# /Users/new/.local/share/cua-171/task132/out/long-b (judged as t14-long)

| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|
| e042 | long-left | 50 | 50 | 0 | 3 | 5 | 0 | 42 (42 / 0 / 0 / 0) | 0 | 0 | 8 | 41 / 9 / 0 | – | – | – | – | – |
| e043 | long-left | 100 | 100 | 0 | 0 | 0 | 0 | 100 (100 / 0 / 0 / 0) | 0 | 0 | 0 | 100 / 0 / 0 | 100 / 0 | 100 / 0 | 0 / 0 | 25.7 / 32.0 / 32.1 | – |

The judge per lane (H7.1 `chromeDropVerdict`, the lane's rows of every round together):

- e042: **fails:** cua long-left: answered ok with no drop and nothing pending on 5 of 50 (#0, #2, #2); cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 3 of 50 (#2, #2, #0); findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%
- e043: no fail; findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%

The residue: every false ok and stale-position drop (8).

| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |
|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|
| e042 | r2 | 2 | warm | long-left | STALE | 4.5 | accept | Activation | 1285.5 | 0 | 0.1 | – | – |
| e042 | r4 | 0 | cold | long-left | FALSE OK | 10.5 | accept | Activation | 519.1 | 0 | 0.1 | – | – |
| e042 | r4 | 2 | warm | long-left | STALE | 2.4 | accept | Activation | 1241.7 | 0 | 0.1 | – | – |
| e042 | r6 | 2 | warm | long-left | FALSE OK | 2.8 | accept | Activation | 1339.3 | 0 | 0.1 | – | – |
| e042 | r7 | 2 | warm | long-left | FALSE OK | 2.9 | accept | Activation | 958.3 | 0 | 0.0 | – | – |
| e042 | r8 | 0 | cold | long-left | STALE | 2.0 | accept | Activation | 1002.6 | 0 | 0.1 | – | – |
| e042 | r9 | 1 | warm | long-left | FALSE OK | 7.8 | accept | Activation | 1110.2 | 0 | 0.1 | – | – |
| e042 | r9 | 2 | warm | long-left | FALSE OK | 3.3 | accept | Activation | 503.5 | 0 | 0.2 | – | – |

In-floor rows with a visit dropped (ruling 1023): 0.

