# /Users/new/.local/share/cua-171/task130/out/long-b

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| ping | long-left | 100 | 100 | 0 | 0 | 11 | 89 (89 / 0 / 0) | 0 | 0 | 100 / 0 | 0/100 | 5.7 / 10.1 / 13.4 | 6.8 / 15.9 | 1219.9 / 2103.3 / 2347.0 |
| tail | long-left | 100 | 100 | 0 | 0 | 0 | 100 (100 / 0 / 0) | 0 | 0 | 100 / 0 | 0/100 | 26.0 / 32.1 / 32.1 | 28.2 / 38.0 | 1247.2 / 2209.6 / 2366.9 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| ping | r0 | 5 | warm | long-left | FALSE OK | 2.0 | Activation | 4.0 | 1, [2.4, 1.1], false | 0.1 |
| ping | r0 | 8 | warm | long-left | FALSE OK | -0.2 | Activation | 8.6 | 1, [2.5, 3.9], false | 1.2 |
| ping | r0 | 9 | warm | long-left | FALSE OK | 2.0 | Activation | 10.2 | 1, [5.8, 3.9], false | 0.1 |
| ping | r1 | 7 | warm | long-left | FALSE OK | 1.8 | Activation | 3.8 | 1, [2.3, 0.6], false | 0.1 |
| ping | r2 | 2 | warm | long-left | FALSE OK | -0.4 | Activation | 9.9 | 1, [2.2, 1.1], false | 2.8 |
| ping | r2 | 9 | warm | long-left | FALSE OK | 2.1 | Activation | 6.2 | 1, [3.0, 1.7], false | 0.3 |
| ping | r5 | 2 | warm | long-left | FALSE OK | 1.8 | Activation | 8.5 | 1, [6.8, 1.2], false | 0.1 |
| ping | r5 | 9 | warm | long-left | FALSE OK | 0.1 | Activation | 6.2 | 1, [0.6, 2.3], false | 2.0 |
| ping | r6 | 1 | warm | long-left | FALSE OK | 1.3 | Activation | 7.9 | 1, [4.0, 3.4], false | 0.1 |
| ping | r7 | 9 | warm | long-left | FALSE OK | 2.8 | Activation | 6.2 | 1, [2.8, 1.1], false | 0.8 |
| ping | r8 | 9 | warm | long-left | FALSE OK | 4.5 | Activation | 4.0 | 1, [2.2, 1.3], false | 0.1 |
