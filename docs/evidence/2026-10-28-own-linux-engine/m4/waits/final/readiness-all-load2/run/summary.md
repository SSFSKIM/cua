# linux-engine-diff summary

## engine-readiness-20261107T211430 (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 11.1 | unobscured | – | 383.5 | 2/2 |
| cua | gedit | partial | 0 / 0 of 12 | 12/12 | 150 | 152.7 | cap, quiet | 0.8 | 496.3 | 2/2 |
| cua | gedit | covered | 0 / 0 of 12 | 12/12 | 19.5 | 153 | quiet, cap | 6.8 | 435.2 | 2/2 |
| cua | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 210.1 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 176.5 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10.1 | 12.5 | offscreen | – | 196.4 | 2/2 |
| cua | kate | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.2 | unobscured | – | 723.1 | 2/2 |
| cua | kate | partial | 0 / 0 of 12 | 12/12 | 81.4 | 150.1 | quiet, cap | 0.1 | 877.7 | 2/2 |
| cua | kate | covered | 0 / 0 of 12 | 12/12 | 11.9 | 152.6 | quiet, cap | 1.1 | 757.2 | 2/2 |
| cua | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 968.4 | 2/2 |
| cua | qtcreator | partial | 0 / 0 of 12 | 12/12 | 150 | 152.9 | cap, quiet | 0.1 | 1186.4 | 2/2 |
| cua | qtcreator | covered | 0 / 0 of 12 | 12/12 | 12.1 | 153.6 | quiet, cap | 1.7 | 1059.2 | 2/2 |
| cua | firefox | unobscured | 0 / 0 of 12 | 12/12 | 14.9 | 20.4 | quiet | 4.8 | 154.9 | 2/2 |
| cua | firefox | partial | 0 / 0 of 12 | 12/12 | 17.4 | 152.1 | quiet, cap | 7.1 | 166.9 | 2/2 |
| cua | firefox | covered | 0 / 0 of 12 | 12/12 | 18.5 | 20.6 | quiet | 7.2 | 157 | 2/2 |
| cua | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 12.6 | unobscured | – | 296.3 | 2/2 |
| cua | chrome | partial | 0 / 0 of 12 | 12/12 | 13 | 150 | cap, quiet | 2.6 | 303.6 | 2/2 |
| cua | chrome | covered | 0 / 0 of 12 | 12/12 | 18 | 25.8 | quiet | 6.6 | 291.5 | 2/2 |
| cua | electron | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 11.8 | unobscured | – | 124.6 | 2/2 |
| cua | electron | partial | 0 / 0 of 12 | 12/12 | 18.2 | 153.7 | quiet, cap | 1.2 | 144.1 | 2/2 |
| cua | electron | covered | 0 / 0 of 12 | 12/12 | 18.5 | 29.2 | quiet | 6.4 | 120.7 | 2/2 |
| cua | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.4 | 152.9 | quiet, cap | 0.2 | 1788 | 2/2 |
| cua | writer | partial | 0 / 0 of 12 | 12/12 | 150.1 | 151.6 | cap, quiet | 1.1 | 1800.4 | 2/2 |
| cua | writer | covered | 0 / 0 of 12 | 12/12 | 19.1 | 151 | cap, quiet | 5.9 | 1850.5 | 2/2 |
| cua | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 150 | 150.1 | quiet, cap | 3.6 | 228.4 | 2/2 |
| cua | writer-gen | partial | 0 / 0 of 12 | 12/12 | 150.1 | 153.1 | cap, quiet | 4.3 | 230.2 | 2/2 |
| cua | writer-gen | covered | 0 / 0 of 12 | 12/12 | 20.1 | 151.8 | quiet, cap | 2.9 | 96.7 | 2/2 |
| cua | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 11.5 | unobscured | – | 33.7 | 2/2 |
| cua | xterm | partial | 0 / 0 of 12 | 12/12 | 150.1 | 152.9 | cap, quiet | 2.9 | 175 | 2/2 |
| cua | xterm | covered | 0 / 0 of 12 | 12/12 | 150.1 | 152.5 | cap, quiet | 3.4 | 180.7 | 2/2 |
| cua | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 10.7 | unobscured | – | 36.4 | 2/2 |
| cua | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 150.1 | 152.1 | cap | – | 180.8 | 2/2 |
| cua | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 150.1 | 153.1 | cap, quiet | 3.2 | 177.9 | 2/2 |
| cua:control | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.4 | unobscured | – | 369.8 | – |
| cua:control | gedit | partial | 0 / 0 of 12 | 12/12 | 10.1 | 12.7 | quiet | 2.5 | 386.3 | – |
| cua:control | gedit | covered | 0 / 0 of 12 | 12/12 | 13.5 | 17.6 | quiet | 4.7 | 382.6 | – |
| cua:control | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10.1 | 12.9 | unobscured | – | 186.3 | – |
| cua:control | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10 | 10.1 | offscreen | – | 192.7 | – |
| cua:control | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10 | 12 | offscreen | – | 193.8 | – |
| cua:control | kate | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12 | unobscured | – | 733 | – |
| cua:control | kate | partial | 0 / 0 of 12 | 12/12 | 10 | 15.4 | quiet | 0.1 | 749.7 | – |
| cua:control | kate | covered | 0 / 0 of 12 | 12/12 | 11.4 | 14.3 | quiet | 1.6 | 717.8 | – |
| cua:control | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 12 | unobscured | – | 1012.5 | – |
| cua:control | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10 | 12.4 | quiet | 0.1 | 1015.2 | – |
| cua:control | qtcreator | covered | 0 / 0 of 12 | 12/12 | 11.6 | 17.1 | quiet | 1.5 | 1025.3 | – |
| cua:control | firefox | unobscured | 0 / 0 of 12 | 12/12 | 11.8 | 19 | quiet | 2.1 | 147.1 | – |
| cua:control | firefox | partial | 0 / 0 of 12 | 11/12 | 14.1 | 18 | quiet | 5 | 181.8 | – |
| cua:control | firefox | covered | 0 / 0 of 12 | 12/12 | 15.1 | 21.1 | quiet | 5.8 | 160.2 | – |
| cua:control | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 11 | unobscured | – | 292.7 | – |
| cua:control | chrome | partial | 0 / 0 of 12 | 12/12 | 12.6 | 19.4 | quiet | 3.9 | 286.9 | – |
| cua:control | chrome | covered | 0 / 0 of 12 | 11/12 | 14.1 | 30.3 | quiet | 6.5 | 290.7 | – |
| cua:control | electron | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.8 | unobscured | – | 96.7 | – |
| cua:control | electron | partial | 0 / 0 of 12 | 12/12 | 10.7 | 16.4 | quiet | 2.8 | 103.9 | – |
| cua:control | electron | covered | 0 / 0 of 12 | 12/12 | 16.3 | 21.5 | quiet | 3.1 | 107.2 | – |
| cua:control | writer | unobscured | 0 / 0 of 12 | 12/12 | 10 | 13.1 | quiet | 0.3 | 1673.7 | – |
| cua:control | writer | partial | 0 / 0 of 12 | 12/12 | 10.4 | 12.5 | quiet | 0.5 | 1855.5 | – |
| cua:control | writer | covered | 0 / 0 of 12 | 12/12 | 10.1 | 18.6 | quiet | 4.7 | 1766.2 | – |
| cua:control | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10.1 | 16.6 | quiet | 0.6 | 87.3 | – |
| cua:control | writer-gen | partial | 0 / 0 of 12 | 12/12 | 10 | 12.8 | quiet | 1 | 83.9 | – |
| cua:control | writer-gen | covered | 0 / 0 of 12 | 12/12 | 17.8 | 25.7 | quiet | 1.9 | 86.3 | – |
| cua:control | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 11.4 | unobscured | – | 44.2 | – |
| cua:control | xterm | partial | 0 / 0 of 12 | 12/12 | 10.1 | 13.1 | quiet | 3 | 37.4 | – |
| cua:control | xterm | covered | 0 / 0 of 12 | 12/12 | 10.1 | 14.7 | quiet | 3.7 | 38.3 | – |
| cua:control | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 38.9 | – |
| cua:control | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10.1 | 12.3 | quiet | 0 | 39.1 | – |
| cua:control | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.1 | 12.7 | quiet | – | 36.7 | – |

**PASS: every first capture right** of 396; the pinned build's captures against the truth: 0 off and 0 unjudged of 66.

Control lane cua:control: 2 of 396 first captures wrong.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2571 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

