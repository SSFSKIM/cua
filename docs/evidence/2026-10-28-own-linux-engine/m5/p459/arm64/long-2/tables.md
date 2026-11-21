# /Users/new/.local/share/cua-171/task126/out/long-2

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| e042 | long-left | 50 | 50 | 0 | 5 | 5 | 40 (40 / 0 / 0) | 0 | 0 | 0 / 0 | – | – | 0.1 / 4.6 | 1181.6 / 1930.0 / 2223.0 |
| keep | long-left | 50 | 50 | 0 | 5 | 5 | 40 (40 / 0 / 0) | 0 | 0 | 50 / 0 | 0/50 | 12.2 / 16.1 / 17.0 | 13.4 / 21.2 | 1187.4 / 2006.1 / 2195.8 |
| ping | long-left | 75 | 75 | 0 | 0 | 7 | 68 (68 / 0 / 0) | 0 | 0 | 75 / 0 | 0/75 | 5.1 / 7.7 / 11.4 | 6.4 / 12.3 | 1221.0 / 2042.0 / 2284.3 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| e042 | r0 | 2 | warm | long-left | stale | 2.0 | Activation | 4.6 | – | – |
| e042 | r0 | 5 | warm | long-left | FALSE OK | 2.5 | Activation | 0.1 | – | – |
| e042 | r0 | 7 | warm | long-left | FALSE OK | 2.3 | Activation | 0.2 | – | – |
| e042 | r0 | 8 | warm | long-left | FALSE OK | 5.0 | Activation | 0.1 | – | – |
| e042 | r1 | 3 | warm | long-left | stale | 5.6 | Activation | 0.1 | – | – |
| e042 | r3 | 4 | warm | long-left | stale | 2.8 | Activation | 0.0 | – | – |
| e042 | r4 | 3 | warm | long-left | FALSE OK | 7.9 | Activation | 0.1 | – | – |
| e042 | r4 | 5 | warm | long-left | FALSE OK | 4.4 | Activation | 0.1 | – | – |
| e042 | r4 | 7 | warm | long-left | stale | 2.5 | Activation | 0.2 | – | – |
| e042 | r4 | 8 | warm | long-left | stale | 1.9 | Activation | 0.0 | – | – |
| keep | r0 | 3 | warm | long-left | stale | 1.1 | Activation | 12.2 | 1, [], false | – |
| keep | r0 | 5 | warm | long-left | FALSE OK | 3.2 | Activation | 12.2 | 1, [], false | – |
| keep | r0 | 9 | warm | long-left | stale | 2.4 | Activation | 13.3 | 1, [], false | – |
| keep | r1 | 2 | warm | long-left | FALSE OK | 3.0 | Activation | 12.2 | 1, [], false | – |
| keep | r1 | 6 | warm | long-left | FALSE OK | 3.2 | Activation | 12.2 | 1, [], false | – |
| keep | r2 | 1 | warm | long-left | FALSE OK | -2.4 | Activation | 15.8 | 1, [], false | – |
| keep | r2 | 5 | warm | long-left | stale | 0.6 | Activation | 14.7 | 1, [], false | – |
| keep | r3 | 1 | warm | long-left | stale | 2.8 | Activation | 12.2 | 1, [], false | – |
| keep | r3 | 2 | warm | long-left | stale | 1.8 | Activation | 12.2 | 1, [], false | – |
| keep | r4 | 1 | warm | long-left | FALSE OK | 2.8 | Activation | 12.2 | 1, [], false | – |
| ping | r1 | 12 | warm | long-left | FALSE OK | 3.0 | Activation | 5.8 | 1, [2.6, 2.8], false | 0.1 |
| ping | r2 | 5 | warm | long-left | FALSE OK | 0.1 | Activation | 8.2 | 1, [2.4, 0.6], false | 3.5 |
| ping | r3 | 7 | warm | long-left | FALSE OK | 1.8 | Activation | 5.1 | 1, [2.2, 1.1], false | 0.9 |
| ping | r3 | 9 | warm | long-left | FALSE OK | 0.4 | Activation | 5.4 | 1, [1.3, 2.8], false | 0.1 |
| ping | r3 | 10 | cold | long-left | FALSE OK | 0.1 | Activation | 6.8 | 1, [1.9, 0.6], false | 2.4 |
| ping | r4 | 2 | warm | long-left | FALSE OK | 1.1 | Activation | 6.9 | 1, [0.6, 3.9], false | 1.3 |
| ping | r4 | 14 | warm | long-left | FALSE OK | 3.2 | Activation | 3.0 | 1, [2.0, 0.7], false | 0.1 |
