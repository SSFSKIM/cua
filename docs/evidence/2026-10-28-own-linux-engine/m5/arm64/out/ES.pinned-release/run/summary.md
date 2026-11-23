# linux-engine-diff summary

## pinned-ES (experiment engine-stop; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 105.1 | 113.7 |
| drain | idle | burst chrome | 10 | 10 | 344.5 | 351 |
| drain | idle | pairs chrome | 10 | 10 | 345 | 351.9 |
| drain | idle | handle | 10 | 10 | 105.1 | 114.7 |
| drain | eof | hold | 10 | 10 | 45.7 | 55 |
| drain | eof | burst chrome | 10 | 10 | 293.2 | 299.6 |
| drain | eof | pairs chrome | 10 | 10 | 293.4 | 299.9 |
| drain | eof | handle | 10 | 10 | 41.4 | 50.5 |
| drain | signal | hold | 10 | 10 | 41.6 | 50.6 |
| drain | signal | burst chrome | 10 | 10 | 294.4 | 300.9 |
| drain | signal | pairs chrome | 10 | 10 | 294.3 | 301 |
| drain | signal | handle | 10 | 10 | 43 | 52 |
| drain | remote | hold | 10 | 10 | 116.4 | 126 |
| drain | remote | burst chrome | 10 | 10 | 352.7 | 359.1 |
| drain | remote | pairs chrome | 10 | 10 | 353.7 | 360.3 |
| drain | remote | handle | 10 | 10 | 115.8 | 125.6 |
| drain | held-back | hold | 10 | 10 | 7034.8 | 7346.4 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6010 requests, 331 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1149724 openbox

