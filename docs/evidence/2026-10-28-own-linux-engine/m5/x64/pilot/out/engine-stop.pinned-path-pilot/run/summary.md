# linux-engine-diff summary

## pinned-engine-stop-pilot (experiment engine-stop; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at 01ff0648f3afc4a234669cd381395c91543ce3f7; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | eof | hold | 2 | 2 | 82.4 | 96.3 |
| drain | signal | hold | 2 | 2 | 81.1 | 92.2 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 119 requests, 6 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

