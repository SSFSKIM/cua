# /Users/new/.local/share/cua-171/task126/out/long-1

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| e042 | long-left | 50 | 50 | 0 | 2 | 5 | 43 (43 / 0 / 0) | 0 | 0 | 0 / 0 | – | – | 0.1 / 4.0 | 1046.0 / 1979.2 / 2855.0 |
| keep | long-left | 50 | 50 | 0 | 3 | 6 | 41 (41 / 0 / 0) | 0 | 0 | 50 / 0 | 0/50 | 12.1 / 15.1 / 16.0 | 13.2 / 20.0 | 909.0 / 2072.1 / 2633.0 |
| ping | long-left | 75 | 75 | 0 | 0 | 3 | 72 (72 / 0 / 0) | 0 | 0 | 75 / 0 | 0/75 | 5.4 / 8.8 / 14.9 | 6.3 / 15.0 | 1126.0 / 2123.0 / 2393.2 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| e042 | r0 | 9 | warm | long-left | FALSE OK | 12.2 | Activation | 0.2 | – | – |
| e042 | r1 | 2 | warm | long-left | FALSE OK | 1.8 | Activation | 0.2 | – | – |
| e042 | r1 | 8 | warm | long-left | FALSE OK | 5.7 | Activation | 0.1 | – | – |
| e042 | r2 | 3 | warm | long-left | FALSE OK | 4.9 | Activation | 0.1 | – | – |
| e042 | r2 | 6 | warm | long-left | FALSE OK | 4.3 | Activation | 0.1 | – | – |
| e042 | r2 | 7 | warm | long-left | stale | 2.6 | Activation | 0.1 | – | – |
| e042 | r4 | 7 | warm | long-left | stale | 7.2 | Activation | 0.1 | – | – |
| keep | r0 | 3 | warm | long-left | FALSE OK | 1.6 | Activation | 14.4 | 1, [], false | – |
| keep | r1 | 1 | warm | long-left | FALSE OK | 0.5 | Activation | 12.2 | 1, [], false | – |
| keep | r1 | 7 | warm | long-left | FALSE OK | 3.7 | Activation | 12.4 | 1, [], false | – |
| keep | r1 | 9 | warm | long-left | FALSE OK | 3.2 | Activation | 12.5 | 1, [], false | – |
| keep | r2 | 6 | warm | long-left | FALSE OK | 1.4 | Activation | 14.7 | 1, [], false | – |
| keep | r2 | 9 | warm | long-left | stale | 2.9 | Activation | 12.2 | 1, [], false | – |
| keep | r4 | 1 | warm | long-left | stale | 0.7 | Activation | 15.3 | 1, [], false | – |
| keep | r4 | 6 | warm | long-left | stale | 2.9 | Activation | 12.1 | 1, [], false | – |
| keep | r4 | 8 | warm | long-left | FALSE OK | 1.7 | Activation | 12.2 | 1, [], false | – |
| ping | r1 | 14 | warm | long-left | FALSE OK | 0.8 | Activation | 9.2 | 1, [2.0, 0.6], false | 3.4 |
| ping | r3 | 10 | cold | long-left | FALSE OK | 0.5 | Activation | 10.0 | 1, [2.6, 0.6], false | 3.5 |
| ping | r4 | 12 | warm | long-left | FALSE OK | 1.4 | Activation | 8.8 | 1, [5.4, 3.0], false | 0.1 |
