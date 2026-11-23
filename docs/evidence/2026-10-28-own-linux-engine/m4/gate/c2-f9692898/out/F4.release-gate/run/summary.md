# linux-engine-diff summary

## m4-gate-F4 (experiment focus-timer; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |
|---|---|---|---:|---:|---:|---|---:|---:|---:|

| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |
|---|---|---|---|---|---:|---|---|

| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |
|---|---|---|---:|---|---|---:|
| chrome | SIGTERM | keys | 30 | 30/30 | 30/30 | 301.6 |
| chrome | SIGTERM | clicks | 30 | 30/30 | 30/30 | 301.1 |
| chrome | SIGKILL | keys | 3 | 3/3 | 2/3 | 2.7 |
| electron | SIGTERM | keys | 30 | 30/30 | 30/30 | 301.6 |
| electron | SIGTERM | clicks | 30 | 30/30 | 30/30 | 301.1 |
| electron | SIGKILL | keys | 3 | 3/3 | 2/3 | 1.2 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 219 requests, 26 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

