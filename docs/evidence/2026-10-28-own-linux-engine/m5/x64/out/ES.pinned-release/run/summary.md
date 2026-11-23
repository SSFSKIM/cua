# linux-engine-diff summary

## pinned-ES (experiment engine-stop; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 127.4 | 141.1 |
| drain | idle | burst chrome | 10 | 10 | 365.8 | 375.4 |
| drain | idle | pairs chrome | 10 | 10 | 369.6 | 378.6 |
| drain | idle | handle | 10 | 10 | 141 | 154.2 |
| drain | eof | hold | 10 | 10 | 77.7 | 89.4 |
| drain | eof | burst chrome | 10 | 10 | 289.7 | 299.4 |
| drain | eof | pairs chrome | 10 | 10 | 290.5 | 298.9 |
| drain | eof | handle | 10 | 10 | 80.3 | 91.8 |
| drain | signal | hold | 10 | 10 | 84.7 | 96.9 |
| drain | signal | burst chrome | 10 | 10 | 290.5 | 299.5 |
| drain | signal | pairs chrome | 10 | 10 | 291.3 | 299.6 |
| drain | signal | handle | 10 | 10 | 82.8 | 94.9 |
| drain | remote | hold | 10 | 10 | 160.6 | 174.1 |
| drain | remote | burst chrome | 10 | 10 | 351.2 | 360.6 |
| drain | remote | pairs chrome | 10 | 10 | 350.3 | 358.4 |
| drain | remote | handle | 10 | 10 | 155.9 | 169.6 |
| drain | held-back | hold | 10 | 10 | 7067.3 | 7381.2 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5641 requests, 331 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 3862465 openbox

