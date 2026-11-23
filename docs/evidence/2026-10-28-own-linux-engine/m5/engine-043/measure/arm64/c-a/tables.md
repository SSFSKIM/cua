# /Users/new/.local/share/cua-171/task132/out/c-a (judged as t14-long)

| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|
| c-alone | long-left | 30 | 30 | 0 | 1 | 0 | 0 | 29 (0 / 29 / 0 / 0) | 0 | 0 | 1 | 26 / 4 / 0 | 30 / 0 | 0 / 0 | 0 / 0 | – | – |
| c-on | long-left | 30 | 30 | 0 | 0 | 0 | 0 | 30 (0 / 30 / 0 / 0) | 0 | 0 | 0 | 30 / 0 / 0 | 30 / 0 | 30 / 0 | 0 / 0 | 26.4 / 31.1 / 31.1 | – |

The judge per lane (H7.1 `chromeDropVerdict`, the lane's rows of every round together):

- c-alone: **fails:** cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 30 (#6); findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%
- c-on: no fail; findings: T14's share, reported and not a fail: 0 of 0 landed drops answered unconfirmed, within 5%

The residue: every false ok and stale-position drop (1).

| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |
|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|
| c-alone | r2 | 6 | warm | long-left | STALE | 8.8 | accept | Outlasted | 1283.2 | 0 | 0.1 | open | –, 0, 0, – |

In-floor rows with a visit dropped (ruling 1023): 0.

