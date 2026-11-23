# linux-engine-diff summary

## engine-readiness-20261108T005200 (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 114.2 | 2/2 |
| cua | gedit | partial | 0 / 0 of 12 | 12/12 | 10.7 | 11 | quiet | 0.6 | 120.1 | 2/2 |
| cua | gedit | covered | 0 / 0 of 12 | 12/12 | 13.3 | 17.5 | quiet | 3.3 | 137 | 2/2 |
| cua | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 10 | unobscured | – | 86.7 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 80.3 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 94.3 | 2/2 |
| cua | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 205 | 2/2 |
| cua | kate | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 200.8 | 2/2 |
| cua | kate | covered | 0 / 0 of 12 | 12/12 | 10.1 | 11.3 | quiet | 1.2 | 205.3 | 2/2 |
| cua | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 266 | 2/2 |
| cua | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10.1 | 150 | quiet, cap | 0.1 | 291.3 | 2/2 |
| cua | qtcreator | covered | 0 / 0 of 12 | 12/12 | 10 | 11.5 | quiet | 1.5 | 264.5 | 2/2 |
| cua | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.4 | 12 | quiet | 1.4 | 77.3 | 2/2 |
| cua | firefox | partial | 0 / 0 of 12 | 12/12 | 11.6 | 11.8 | quiet | 1.6 | 81.8 | 2/2 |
| cua | firefox | covered | 0 / 0 of 12 | 12/12 | 11.8 | 12.3 | quiet | 1.8 | 77.7 | 2/2 |
| cua | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 100.3 | 0/2 |
| cua | chrome | partial | 0 / 0 of 12 | 12/12 | 11.5 | 11.9 | quiet | 1.4 | 109.6 | 2/2 |
| cua | chrome | covered | 0 / 0 of 12 | 12/12 | 15.3 | 22.1 | quiet | 3.6 | 101.8 | 2/2 |
| cua | electron | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 59.3 | 2/2 |
| cua | electron | partial | 0 / 0 of 12 | 12/12 | 10.8 | 11.2 | quiet | 0.8 | 52.9 | 2/2 |
| cua | electron | covered | 0 / 0 of 12 | 12/12 | 15.6 | 20.6 | quiet | 2.3 | 67.1 | 2/2 |
| cua | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.3 | 10.5 | quiet | 0.3 | 489.5 | 2/2 |
| cua | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 10.5 | quiet | 0.4 | 463.5 | 2/2 |
| cua | writer | covered | 0 / 0 of 12 | 12/12 | 13.3 | 13.9 | quiet | 3.3 | 462.2 | 2/2 |
| cua | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.9 | 11 | quiet | 0.8 | 63.7 | 2/2 |
| cua | writer-gen | partial | 0 / 0 of 12 | 12/12 | 11.2 | 11.8 | quiet | 1.2 | 52.1 | 2/2 |
| cua | writer-gen | covered | 0 / 0 of 12 | 12/12 | 15.3 | 21 | quiet | 1 | 63.6 | 2/2 |
| cua | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 24.5 | 2/2 |
| cua | xterm | partial | 0 / 0 of 12 | 12/12 | 10 | 149.6 | quiet, cap | 0.1 | 24.2 | 2/2 |
| cua | xterm | covered | 0 / 0 of 12 | 12/12 | 10.1 | 150 | quiet, cap | 0.1 | 26.9 | 2/2 |
| cua | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 25.2 | 2/2 |
| cua | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 9.9 | 10.2 | quiet | 0.1 | 33.3 | 2/2 |
| cua | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.2 | 10.2 | quiet | 0.2 | 28.2 | 2/2 |
| cua:control | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 114.1 | – |
| cua:control | gedit | partial | 0 / 0 of 12 | 12/12 | 10.7 | 10.8 | quiet | 0.6 | 119.9 | – |
| cua:control | gedit | covered | 0 / 0 of 12 | 12/12 | 13.3 | 14.8 | quiet | 3.2 | 132.3 | – |
| cua:control | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 10 | unobscured | – | 99.9 | – |
| cua:control | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 103.5 | – |
| cua:control | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 98.2 | – |
| cua:control | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 199 | – |
| cua:control | kate | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 188.9 | – |
| cua:control | kate | covered | 0 / 0 of 12 | 12/12 | 10.1 | 11.4 | quiet | 1.1 | 215.6 | – |
| cua:control | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 264.4 | – |
| cua:control | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 275.1 | – |
| cua:control | qtcreator | covered | 0 / 0 of 12 | 12/12 | 11.5 | 11.8 | quiet | 1.6 | 261.5 | – |
| cua:control | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.5 | 12.4 | quiet | 1.5 | 78.3 | – |
| cua:control | firefox | partial | 0 / 0 of 12 | 12/12 | 11.6 | 12 | quiet | 1.6 | 75 | – |
| cua:control | firefox | covered | 0 / 0 of 12 | 12/12 | 12.1 | 12.5 | quiet | 2.1 | 74.8 | – |
| cua:control | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 14.8 | unobscured | 4.8 | 100.3 | – |
| cua:control | chrome | partial | 0 / 0 of 12 | 12/12 | 11.7 | 12.9 | quiet | 1.6 | 113.2 | – |
| cua:control | chrome | covered | 0 / 0 of 12 | 12/12 | 14.1 | 21.8 | quiet | 4 | 116.4 | – |
| cua:control | electron | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 59.2 | – |
| cua:control | electron | partial | 0 / 0 of 12 | 12/12 | 11 | 11.4 | quiet | 1 | 69.7 | – |
| cua:control | electron | covered | 0 / 0 of 12 | 12/12 | 13.8 | 19.7 | quiet | 2.5 | 64.6 | – |
| cua:control | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.3 | 10.4 | quiet | 0.3 | 478.7 | – |
| cua:control | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 10.5 | quiet | 0.3 | 462.5 | – |
| cua:control | writer | covered | 0 / 0 of 12 | 12/12 | 13.1 | 14.3 | quiet | 3.1 | 487 | – |
| cua:control | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.8 | 11.3 | quiet | 0.8 | 68.6 | – |
| cua:control | writer-gen | partial | 0 / 0 of 12 | 12/12 | 11.3 | 12 | quiet | 1.3 | 54 | – |
| cua:control | writer-gen | covered | 0 / 0 of 12 | 12/12 | 14.2 | 19.3 | quiet | 0.9 | 59.8 | – |
| cua:control | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 24.7 | – |
| cua:control | xterm | partial | 0 / 0 of 12 | 12/12 | 10 | 10.2 | quiet | 0.1 | 26.2 | – |
| cua:control | xterm | covered | 0 / 0 of 12 | 12/12 | 10.1 | 10.3 | quiet | 0.2 | 24.7 | – |
| cua:control | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 25.7 | – |
| cua:control | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10 | 10.1 | quiet | 0.1 | 32.5 | – |
| cua:control | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 9.9 | 10.3 | quiet | 0.1 | 32.2 | – |

**REFERENCE MISMATCH, CONTROL NON-DISCRIMINATING: every first capture right** of 396; the pinned build's captures against the truth: 2 off and 0 unjudged of 66.

Control lane cua:control: 0 of 396 first captures wrong, so the sitting could not have failed the rule it drops.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2825 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

