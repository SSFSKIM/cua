# /Users/new/.local/share/cua-171/task126/out/long-1-gate1-stopped

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| e042 | long-left | 36 | 36 | 0 | 2 | 1 | 33 (33 / 0 / 0) | 0 | 1 | 0 / 0 | – | – | 0.3 / 6.0 | 1164.4 / 1804.9 / 1874.2 |
| keep | long-left | 30 | 30 | 0 | 2 | 3 | 25 (25 / 0 / 0) | 0 | 0 | 28 / 2 | 0/28 | 12.2 / 16.0 / 16.1 | 13.4 / 20.0 | 1098.3 / 2009.2 / 2043.3 |
| ping | long-left | 30 | 30 | 0 | 0 | 0 | 30 (30 / 0 / 0) | 0 | 0 | 24 / 6 | 0/24 | 5.3 / 10.4 / 15.9 | 6.0 / 18.0 | 1333.0 / 2020.3 / 2159.0 |
| ping30 | long-left | 40 | 40 | 0 | 0 | 5 | 35 (35 / 0 / 0) | 0 | 0 | 37 / 3 | 0/37 | 36.2 / 40.7 / 46.9 | 37.0 / 47.0 | 1338.3 / 2111.1 / 2136.1 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| e042 | r1 | 6 | warm | long-left | FALSE OK | 2.5 | Activation | 0.1 | – | – |
| e042 | r2 | 1 | warm | long-left | stale | 1.7 | Activation | 0.0 | – | – |
| e042 | r2 | 8 | warm | long-left | stale | 4.5 | Activation | 0.0 | – | – |
| keep | r0 | 5 | warm | long-left | stale | 2.3 | Activation | 12.2 | 1, [], false | – |
| keep | r1 | 2 | warm | long-left | FALSE OK | 1.8 | Activation | 12.3 | 1, [], false | – |
| keep | r2 | 3 | warm | long-left | FALSE OK | 1.4 | Activation | 12.2 | 1, [], false | – |
| keep | r2 | 5 | warm | long-left | stale | 1.3 | Activation | 13.3 | 1, [], false | – |
| keep | r2 | 8 | warm | long-left | FALSE OK | 0.9 | Activation | 12.4 | 1, [], false | – |
| ping30 | r0 | 1 | warm | long-left | FALSE OK | 1.3 | Activation | 34.6 | 1, [2.6, 1.1], false | 30.1 |
| ping30 | r0 | 6 | warm | long-left | FALSE OK | 1.5 | Activation | 0.1 | skipped (keepalives 0, spaced 7) | – |
| ping30 | r2 | 2 | warm | long-left | FALSE OK | 1.5 | Activation | 47.0 | 1, [5.5, 10.9], false | 30.1 |
| ping30 | r2 | 9 | warm | long-left | FALSE OK | -0.1 | Activation | 38.1 | 1, [2.3, 0.6], false | 33.6 |
| ping30 | r3 | 2 | warm | long-left | FALSE OK | 0.8 | Activation | 34.2 | 1, [2.3, 1.1], false | 30.4 |
