# linux-engine-diff summary

## engine-readiness-20261107T210006 (experiment engine-readiness)

Every family, 30 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gnome-text-editor | unobscured | 30 / 30 of 30 | 30/30 | 10.1 | 13.6 | unobscured | – | 195.8 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 30 of 30 | 30/30 | 10.1 | 12.9 | offscreen | – | 222.5 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 30 of 30 | 30/30 | 10.1 | 12.6 | offscreen | – | 203.6 | 2/2 |

**PASS: every first capture right** of 90; the pinned build's captures against the truth: 0 off and 0 unjudged of 6.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 322 requests, 28 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

