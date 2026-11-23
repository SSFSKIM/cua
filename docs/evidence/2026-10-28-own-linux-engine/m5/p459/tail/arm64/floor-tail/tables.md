# /Users/new/.local/share/cua-171/task130/out/floor-tail

| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|
| tail | plain-long | 300 | 300 | 300 | 0 | 0 | 0 (0 / 0 / 0) | 0 | 0 | 215 / 85 | 0/215 | 28.1 / 32.1 / 33.9 | 28.7 / 40.6 | 509.5 / 1121.0 / 1423.0 |
| tail | left | 30 | 30 | 0 | 0 | 1 | 29 (29 / 0 / 0) | 0 | 0 | 14 / 16 | 0/14 | 28.0 / 31.1 / 32.1 | 1.9 / 35.0 | 396.4 / 659.0 / 762.2 |
| tail | inzone-out | 30 | 30 | 0 | 0 | 0 | 30 (30 / 0 / 0) | 0 | 0 | 0 / 30 | – | – | 1.4 / 253.2 | 373.6 / 395.0 / 401.1 |

The residue: every false ok and stale-position drop, with the time from the second ping's answer to the release (ruling 958.1).

| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |
|---|---|---:|---|---|---|---:|---|---:|---|---:|
| tail | r0 | 3 | warm | left | FALSE OK | -0.1 | Activation | 1.9 | skipped (keepalives 0, spaced undefined) | – |
