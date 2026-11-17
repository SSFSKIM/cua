# linux-engine-diff summary

## engine-readiness-20261107T195330 (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 128.2 | 2/2 |
| cua | gedit | partial | 0 / 0 of 12 | 12/12 | 10.7 | 11 | quiet | 0.6 | 120.3 | 2/2 |
| cua | gedit | covered | 0 / 0 of 12 | 12/12 | 13.3 | 14.8 | quiet | 3.3 | 125.3 | 2/2 |
| cua | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 10 | unobscured | – | 87 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 97.4 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 86.6 | 2/2 |
| cua | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 199.4 | 2/2 |
| cua | kate | partial | 0 / 0 of 12 | 12/12 | 10.1 | 150 | quiet, cap | 0.1 | 206.3 | 2/2 |
| cua | kate | covered | 0 / 0 of 12 | 12/12 | 10.1 | 11.5 | quiet | 1.1 | 205.4 | 2/2 |
| cua | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 260.1 | 2/2 |
| cua | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 260.1 | 2/2 |
| cua | qtcreator | covered | 0 / 0 of 12 | 12/12 | 10.7 | 11.8 | quiet | 1.3 | 252.5 | 2/2 |
| cua | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.5 | 12 | quiet | 1.5 | 78.8 | 2/2 |
| cua | firefox | partial | 0 / 0 of 12 | 12/12 | 11.4 | 12 | quiet | 1.4 | 77.3 | 2/2 |
| cua | firefox | covered | 0 / 0 of 12 | 12/12 | 11.8 | 12.2 | quiet | 1.8 | 74 | 2/2 |
| cua | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 108.7 | 1/2 |
| cua | chrome | partial | 0 / 0 of 12 | 12/12 | 11.4 | 12.3 | quiet | 1.4 | 100.6 | 2/2 |
| cua | chrome | covered | 0 / 0 of 12 | 12/12 | 14.3 | 21.5 | quiet | 3.9 | 103.7 | 2/2 |
| cua | electron | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 49.8 | 2/2 |
| cua | electron | partial | 0 / 0 of 12 | 12/12 | 11.1 | 12.4 | quiet | 1.1 | 60.3 | 2/2 |
| cua | electron | covered | 0 / 0 of 12 | 12/12 | 13.3 | 22 | quiet | 2.1 | 56.3 | 2/2 |
| cua | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.3 | 10.3 | quiet | 0.3 | 461.3 | 2/2 |
| cua | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 10.5 | quiet | 0.4 | 451.4 | 2/2 |
| cua | writer | covered | 0 / 0 of 12 | 12/12 | 13.5 | 15.6 | quiet | 3.5 | 479.4 | 2/2 |
| cua | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.7 | 11.1 | quiet | 0.6 | 53.4 | 2/2 |
| cua | writer-gen | partial | 0 / 0 of 12 | 12/12 | 11.2 | 11.9 | quiet | 1.1 | 52.9 | 2/2 |
| cua | writer-gen | covered | 0 / 0 of 12 | 12/12 | 14 | 17.1 | quiet | 0.8 | 58.1 | 2/2 |
| cua | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 25.3 | 2/2 |
| cua | xterm | partial | 0 / 0 of 12 | 12/12 | 10 | 10 | quiet | 0.1 | 25.5 | 2/2 |
| cua | xterm | covered | 0 / 0 of 12 | 12/12 | 10.2 | 150.1 | cap, quiet | 0.1 | 25.4 | 2/2 |
| cua | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 29.3 | 2/2 |
| cua | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10 | 150 | quiet, cap | 0.1 | 26.1 | 2/2 |
| cua | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.1 | 150.1 | quiet, cap | 0.1 | 33.1 | 2/2 |

**FAIL: every first capture right** of 396; the pinned build's captures against the truth: 1 off and 0 unjudged of 66.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2836 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

