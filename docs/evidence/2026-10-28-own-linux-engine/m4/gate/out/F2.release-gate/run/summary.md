# linux-engine-diff summary

## m4-gate-F2 (experiment focus-timer; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.3 |
| chrome | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.2 |
| chrome | SIGKILL | keys | 3 | 3/3 | 3/3 | 0.6 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 300.4 |
| electron | SIGTERM | clicks | 30 | 30/30 | 30/30 | 300.1 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 0.6 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 236 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

