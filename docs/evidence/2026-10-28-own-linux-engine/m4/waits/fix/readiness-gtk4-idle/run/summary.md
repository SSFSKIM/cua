# linux-engine-diff summary

## engine-readiness-20261108T004946 (experiment engine-readiness)

Every family, 30 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gnome-text-editor | unobscured | 30 / 30 of 30 | 30/30 | 10 | 10.1 | unobscured | – | 92.6 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 30 of 30 | 30/30 | 10 | 10.1 | offscreen | – | 98.9 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 30 of 30 | 30/30 | 10 | 10.1 | offscreen | – | 99.6 | 2/2 |

**PASS: every first capture right** of 90; the pinned build's captures against the truth: 0 off and 0 unjudged of 6.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 357 requests, 28 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

