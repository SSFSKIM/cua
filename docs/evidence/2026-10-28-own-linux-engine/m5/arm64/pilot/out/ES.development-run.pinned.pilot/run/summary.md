# linux-engine-diff summary

## m5-pinned-dev-ES-pilot (experiment engine-stop; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 2 | 2 | 75.5 | 83.6 |
| drain | idle | burst chrome | 2 | 2 | 329.5 | 335.1 |
| drain | idle | pairs chrome | 2 | 2 | 330.3 | 335.8 |
| drain | idle | handle | 2 | 2 | 68.7 | 76.1 |
| drain | eof | hold | 2 | 2 | 37.9 | 45.6 |
| drain | eof | burst chrome | 2 | 2 | 293.8 | 299.4 |
| drain | eof | pairs chrome | 2 | 2 | 294.5 | 299.9 |
| drain | eof | handle | 2 | 2 | 37.7 | 45.2 |
| drain | signal | hold | 2 | 2 | 36.3 | 44 |
| drain | signal | burst chrome | 2 | 2 | 294.1 | 299.7 |
| drain | signal | pairs chrome | 2 | 2 | 294.8 | 300.4 |
| drain | signal | handle | 2 | 2 | 37.7 | 45.8 |
| drain | remote | hold | 2 | 2 | 79.8 | 88.6 |
| drain | remote | burst chrome | 2 | 2 | 337.4 | 343.2 |
| drain | remote | pairs chrome | 2 | 2 | 335.1 | 340.9 |
| drain | remote | handle | 2 | 2 | 79.7 | 88.3 |
| drain | held-back | hold | 2 | 2 | 7029.7 | 7339.2 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 1340 requests, 75 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 155831 openbox

