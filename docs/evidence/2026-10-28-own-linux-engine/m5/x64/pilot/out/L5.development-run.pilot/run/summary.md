# linux-engine-diff summary

## m4-dev-L5-pilot (experiment engine-readiness; development run, not a release gate)

Every family, 2 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gnome-text-editor | unobscured | 2 / 2 of 2 | 2/2 | 10 | 10 | unobscured | – | 160.5 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 2 of 2 | 2/2 | 10 | 10.1 | offscreen | – | 189.4 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 2 of 2 | 2/2 | 10.1 | 10.1 | offscreen | – | 212.3 | 2/2 |

**PASS: every first capture right** of 6; the pinned build's captures against the truth: 0 off and 0 unjudged of 6.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 324 requests, 28 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

