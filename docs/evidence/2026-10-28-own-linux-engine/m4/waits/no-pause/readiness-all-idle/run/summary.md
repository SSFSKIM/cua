# linux-engine-diff summary

## engine-readiness-20261107T181122 (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 115 | 2/2 |
| cua | gedit | partial | 0 / 0 of 12 | 12/12 | 10.6 | 10.8 | quiet | 0.6 | 132.3 | 2/2 |
| cua | gedit | covered | 0 / 0 of 12 | 12/12 | 13.3 | 15.8 | quiet | 3.3 | 146 | 2/2 |
| cua | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 87.1 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 89.8 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 96.9 | 2/2 |
| cua | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 212.6 | 2/2 |
| cua | kate | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 204.3 | 2/2 |
| cua | kate | covered | 0 / 0 of 12 | 12/12 | 10.5 | 11.2 | quiet | 1 | 198.8 | 2/2 |
| cua | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 267.1 | 2/2 |
| cua | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 269 | 2/2 |
| cua | qtcreator | covered | 0 / 0 of 12 | 12/12 | 10.1 | 150 | quiet, cap | 1.5 | 258 | 2/2 |
| cua | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.5 | 11.8 | quiet | 1.4 | 74.8 | 2/2 |
| cua | firefox | partial | 0 / 0 of 12 | 12/12 | 11.5 | 11.9 | quiet | 1.4 | 72.5 | 2/2 |
| cua | firefox | covered | 0 / 0 of 12 | 12/12 | 11.7 | 11.9 | quiet | 1.7 | 72.7 | 2/2 |
| cua | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 96.3 | 0/2 |
| cua | chrome | partial | 0 / 0 of 12 | 12/12 | 11.5 | 11.9 | quiet | 1.5 | 95.2 | 2/2 |
| cua | chrome | covered | 0 / 0 of 12 | 12/12 | 14.9 | 22.5 | quiet | 4.3 | 98.2 | 2/2 |
| cua | electron | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 51.4 | 2/2 |
| cua | electron | partial | 0 / 0 of 12 | 12/12 | 11.1 | 58.2 | quiet | 1.1 | 57.8 | 2/2 |
| cua | electron | covered | 0 / 0 of 12 | 12/12 | 16.7 | 22.1 | quiet | 2.9 | 71.7 | 2/2 |
| cua | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.3 | 10.6 | quiet | 0.3 | 460.8 | 2/2 |
| cua | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 10.6 | quiet | 0.4 | 470.6 | 2/2 |
| cua | writer | covered | 0 / 0 of 12 | 12/12 | 13.2 | 13.9 | quiet | 3.2 | 466.9 | 2/2 |
| cua | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.7 | 11.2 | quiet | 0.7 | 53.7 | 2/2 |
| cua | writer-gen | partial | 0 / 0 of 12 | 12/12 | 11.2 | 11.9 | quiet | 1.2 | 55.1 | 2/2 |
| cua | writer-gen | covered | 0 / 0 of 12 | 12/12 | 14 | 17.1 | quiet | 0.8 | 55.8 | 2/2 |
| cua | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 28.9 | 2/2 |
| cua | xterm | partial | 0 / 0 of 12 | 12/12 | 10 | 150 | quiet, cap | 0.1 | 27.2 | 2/2 |
| cua | xterm | covered | 0 / 0 of 12 | 12/12 | 10.2 | 10.4 | quiet | 0.2 | 25.3 | 2/2 |
| cua | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 24.4 | 2/2 |
| cua | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10 | 10 | quiet | 0.1 | 27.1 | 2/2 |
| cua | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.2 | 150.1 | quiet, cap | 0.1 | 25.5 | 2/2 |
| cua:control | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 125.1 | – |
| cua:control | gedit | partial | 0 / 0 of 12 | 12/12 | 10.7 | 11.1 | quiet | 0.7 | 148.2 | – |
| cua:control | gedit | covered | 0 / 0 of 12 | 12/12 | 13.3 | 14.7 | quiet | 3.2 | 112.3 | – |
| cua:control | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 10 | unobscured | – | 85 | – |
| cua:control | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 99.2 | – |
| cua:control | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 91.4 | – |
| cua:control | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 212.4 | – |
| cua:control | kate | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.2 | quiet | 0.1 | 201.7 | – |
| cua:control | kate | covered | 0 / 0 of 12 | 12/12 | 10.1 | 11.2 | quiet | 1.1 | 221.3 | – |
| cua:control | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 266.1 | – |
| cua:control | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10.1 | 10.4 | quiet | 0.1 | 263.6 | – |
| cua:control | qtcreator | covered | 0 / 0 of 12 | 12/12 | 10.7 | 11.9 | quiet | 1.5 | 258.9 | – |
| cua:control | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.5 | 12.2 | quiet | 1.5 | 76.6 | – |
| cua:control | firefox | partial | 0 / 0 of 12 | 12/12 | 11.5 | 12.4 | quiet | 1.5 | 74.9 | – |
| cua:control | firefox | covered | 0 / 0 of 12 | 12/12 | 11.8 | 12.7 | quiet | 1.8 | 72.2 | – |
| cua:control | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 11.8 | unobscured | 1.7 | 98.1 | – |
| cua:control | chrome | partial | 0 / 0 of 12 | 12/12 | 11.5 | 12.1 | quiet | 1.5 | 117.2 | – |
| cua:control | chrome | covered | 0 / 0 of 12 | 12/12 | 16.8 | 23.1 | quiet | 4.4 | 110.2 | – |
| cua:control | electron | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 53.6 | – |
| cua:control | electron | partial | 0 / 0 of 12 | 12/12 | 10.9 | 11.4 | quiet | 0.8 | 53.8 | – |
| cua:control | electron | covered | 0 / 0 of 12 | 12/12 | 15.4 | 19.5 | quiet | 2.7 | 76.2 | – |
| cua:control | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.3 | 10.9 | quiet | 0.3 | 445.5 | – |
| cua:control | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 10.9 | quiet | 0.4 | 490.1 | – |
| cua:control | writer | covered | 0 / 0 of 12 | 12/12 | 13.1 | 13.5 | quiet | 3.1 | 491.1 | – |
| cua:control | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.7 | 11 | quiet | 0.7 | 65.9 | – |
| cua:control | writer-gen | partial | 0 / 0 of 12 | 12/12 | 11.2 | 11.3 | quiet | 1.2 | 52.2 | – |
| cua:control | writer-gen | covered | 0 / 0 of 12 | 12/12 | 14.7 | 20.8 | quiet | 1 | 58.4 | – |
| cua:control | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 25.7 | – |
| cua:control | xterm | partial | 0 / 0 of 12 | 12/12 | 10 | 10.2 | quiet | 0.1 | 26.1 | – |
| cua:control | xterm | covered | 0 / 0 of 12 | 12/12 | 10.1 | 10.3 | quiet | 0.1 | 25.1 | – |
| cua:control | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10 | unobscured | – | 25.9 | – |
| cua:control | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10 | 10.1 | quiet | 0.1 | 26.7 | – |
| cua:control | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.2 | 10.3 | quiet | 0.1 | 25 | – |

**FAIL: every first capture right** of 396; the pinned build's captures against the truth: 2 off and 0 unjudged of 66.

Control lane cua:control: 0 of 396 first captures wrong, so it shows nothing and the run fails.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2821 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

