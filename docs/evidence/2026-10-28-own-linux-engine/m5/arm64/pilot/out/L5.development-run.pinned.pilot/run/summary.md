# linux-engine-diff summary

## m5-pinned-dev-L5-pilot (experiment engine-readiness; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every family, 2 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gnome-text-editor | unobscured | 2 / 2 of 2 | 2/2 | 10 | 10 | unobscured | – | 179.1 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 2 of 2 | 2/2 | 10 | 10 | offscreen | – | 179.1 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 2 of 2 | 2/2 | 10 | 10 | offscreen | – | 137.1 | 2/2 |

**PASS: every first capture right** of 6; the pinned build's captures against the truth: 0 off and 0 unjudged of 6.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 242 requests, 28 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

