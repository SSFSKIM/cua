# /Users/new/.local/share/cua-171/task130/out/long-a

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| e042 | long-left | 100 | 100 | 0 | 4 | 18 | 78 (78 / 0 / 0) | 0 | 0 | 0 / 0 | – | – | 0.1 / 5.0 | 1093.0 / 2054.0 / 2324.2 |
| ping | long-left | 100 | 100 | 0 | 0 | 4 | 96 (96 / 0 / 0) | 0 | 0 | 100 / 0 | 0/100 | 5.2 / 10.7 / 20.5 | 6.3 / 23.0 | 1168.1 / 2078.0 / 2379.0 |
| tail | long-left | 100 | 100 | 0 | 0 | 0 | 100 (100 / 0 / 0) | 0 | 0 | 100 / 0 | 0/100 | 25.6 / 29.8 / 32.1 | 26.4 / 36.0 | 1217.6 / 1992.1 / 2398.2 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| e042 | r0 | 6 | warm | long-left | FALSE OK | 10.1 | Activation | 0.1 | – | – |
| e042 | r0 | 8 | warm | long-left | FALSE OK | 2.4 | Activation | 3.7 | – | – |
| e042 | r0 | 9 | warm | long-left | FALSE OK | 1.5 | Activation | 0.1 | – | – |
| e042 | r2 | 0 | cold | long-left | FALSE OK | 4.0 | Activation | 0.2 | – | – |
| e042 | r2 | 5 | warm | long-left | FALSE OK | 2.7 | Activation | 0.1 | – | – |
| e042 | r3 | 3 | warm | long-left | stale | 7.0 | Activation | 0.1 | – | – |
| e042 | r3 | 5 | warm | long-left | stale | 4.2 | Activation | 0.1 | – | – |
| e042 | r3 | 6 | warm | long-left | FALSE OK | 2.9 | Activation | 0.1 | – | – |
| e042 | r3 | 8 | warm | long-left | FALSE OK | 8.8 | Activation | 0.4 | – | – |
| e042 | r3 | 9 | warm | long-left | stale | 5.3 | Activation | 0.1 | – | – |
| e042 | r4 | 7 | warm | long-left | FALSE OK | 3.5 | Activation | 0.1 | – | – |
| e042 | r4 | 9 | warm | long-left | FALSE OK | 4.6 | Activation | 1.3 | – | – |
| e042 | r5 | 5 | warm | long-left | FALSE OK | 3.9 | Activation | 0.9 | – | – |
| e042 | r7 | 1 | warm | long-left | FALSE OK | 1.2 | Activation | 3.1 | – | – |
| e042 | r7 | 2 | warm | long-left | FALSE OK | 6.1 | Activation | 0.1 | – | – |
| e042 | r7 | 3 | warm | long-left | FALSE OK | 1.5 | Activation | 0.1 | – | – |
| e042 | r7 | 7 | warm | long-left | FALSE OK | 2.2 | Activation | 0.1 | – | – |
| e042 | r7 | 9 | warm | long-left | FALSE OK | 2.2 | Activation | 0.0 | – | – |
| e042 | r8 | 1 | warm | long-left | FALSE OK | 13.3 | Activation | 0.1 | – | – |
| e042 | r8 | 2 | warm | long-left | FALSE OK | 2.6 | Activation | 0.0 | – | – |
| e042 | r8 | 3 | warm | long-left | FALSE OK | 3.6 | Activation | 0.1 | – | – |
| e042 | r8 | 5 | warm | long-left | stale | 1.7 | Activation | 0.0 | – | – |
| ping | r1 | 9 | warm | long-left | FALSE OK | 5.3 | Activation | 8.8 | 1, [4.4, 4.0], false | 0.1 |
| ping | r5 | 1 | warm | long-left | FALSE OK | 1.0 | Activation | 9.1 | 1, [1.8, 0.6], false | 3.4 |
| ping | r5 | 2 | warm | long-left | FALSE OK | 7.1 | Activation | 8.9 | 1, [5.5, 1.8], false | 0.1 |
| ping | r9 | 2 | warm | long-left | FALSE OK | 4.4 | Activation | 4.1 | 1, [2.1, 1.2], false | 0.1 |
