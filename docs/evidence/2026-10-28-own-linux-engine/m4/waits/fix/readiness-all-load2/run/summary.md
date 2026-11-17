# linux-engine-diff summary

## engine-readiness-20261108T011539 (experiment engine-readiness)

Every family, 12 trials per condition, a fresh cua-engine per trial, every core busy (stress-ng): the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| lane | family | condition | engine judged unobscured / kept offscreen | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| cua | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 363.6 | 2/2 |
| cua | gedit | partial | 0 / 0 of 12 | 12/12 | 150 | 152.5 | quiet, cap | 1.1 | 493.2 | 2/2 |
| cua | gedit | covered | 0 / 0 of 12 | 12/12 | 17.7 | 150 | cap, quiet | 6.3 | 407.7 | 2/2 |
| cua | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10 | 11.1 | unobscured | – | 197 | 2/2 |
| cua | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10.1 | 12.4 | offscreen | – | 173.6 | 2/2 |
| cua | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10.1 | 12.7 | offscreen | – | 183.3 | 2/2 |
| cua | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 11.6 | unobscured | – | 683.2 | 2/2 |
| cua | kate | partial | 0 / 0 of 12 | 12/12 | 150.1 | 151.9 | cap, quiet | 0 | 823 | 2/2 |
| cua | kate | covered | 0 / 0 of 12 | 12/12 | 12.1 | 150.1 | quiet, cap | 1.5 | 779.2 | 2/2 |
| cua | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.1 | unobscured | – | 961.2 | 2/2 |
| cua | qtcreator | partial | 0 / 0 of 12 | 12/12 | 150 | 150.1 | cap, quiet | 0.1 | 1005.5 | 2/2 |
| cua | qtcreator | covered | 0 / 0 of 12 | 12/12 | 12.1 | 151.6 | quiet, cap | 0.8 | 1042.8 | 2/2 |
| cua | firefox | unobscured | 0 / 0 of 12 | 12/12 | 17.9 | 150.1 | quiet, cap | 7.3 | 175.4 | 2/2 |
| cua | firefox | partial | 0 / 0 of 12 | 12/12 | 12.7 | 150 | quiet, cap | 3.1 | 159.3 | 2/2 |
| cua | firefox | covered | 0 / 0 of 12 | 12/12 | 16.3 | 150.1 | quiet, cap | 6.4 | 155.7 | 2/2 |
| cua | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.8 | unobscured | – | 266.1 | 2/2 |
| cua | chrome | partial | 0 / 0 of 12 | 12/12 | 16.1 | 152.8 | quiet, cap | 2.6 | 350 | 2/2 |
| cua | chrome | covered | 0 / 0 of 12 | 12/12 | 20.6 | 29.1 | quiet | 5.3 | 288.5 | 2/2 |
| cua | electron | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 112.6 | 2/2 |
| cua | electron | partial | 0 / 0 of 12 | 12/12 | 150.1 | 150.1 | quiet, cap | 4 | 243.7 | 2/2 |
| cua | electron | covered | 0 / 0 of 12 | 12/12 | 22.7 | 150 | cap, quiet | 4 | 111.2 | 2/2 |
| cua | writer | unobscured | 0 / 0 of 12 | 12/12 | 12.5 | 151.9 | cap, quiet | 0.2 | 1719.7 | 2/2 |
| cua | writer | partial | 0 / 0 of 12 | 12/12 | 150 | 151.5 | cap, quiet | 0.5 | 1887.8 | 2/2 |
| cua | writer | covered | 0 / 0 of 12 | 12/12 | 84.5 | 152.1 | quiet, cap | 7 | 1926.6 | 2/2 |
| cua | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 150.1 | 150.1 | cap, quiet | 0.6 | 230.1 | 2/2 |
| cua | writer-gen | partial | 0 / 0 of 12 | 12/12 | 150 | 153.1 | cap, quiet | 1.1 | 222.6 | 2/2 |
| cua | writer-gen | covered | 0 / 0 of 12 | 12/12 | 20.5 | 150.1 | quiet, cap | 4 | 108.6 | 2/2 |
| cua | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 36.4 | 2/2 |
| cua | xterm | partial | 0 / 0 of 12 | 12/12 | 150.1 | 153.3 | cap, quiet | 4.6 | 178.3 | 2/2 |
| cua | xterm | covered | 0 / 0 of 12 | 12/12 | 150.1 | 151.2 | cap, quiet | 1.2 | 177.2 | 2/2 |
| cua | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 15.4 | unobscured | – | 35.1 | 2/2 |
| cua | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 150.1 | 154.9 | cap | – | 177.2 | 2/2 |
| cua | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 150.1 | 152.4 | cap, quiet | 3.1 | 180.1 | 2/2 |
| cua:control | gedit | unobscured | 12 / 0 of 12 | 12/12 | 10 | 12.6 | unobscured | – | 372.1 | – |
| cua:control | gedit | partial | 0 / 0 of 12 | 12/12 | 10.4 | 15.1 | quiet | 1.5 | 376.8 | – |
| cua:control | gedit | covered | 0 / 0 of 12 | 12/12 | 14.9 | 18.8 | quiet | 5.2 | 384.2 | – |
| cua:control | gnome-text-editor | unobscured | 12 / 12 of 12 | 12/12 | 10.1 | 12.7 | unobscured | – | 193.1 | – |
| cua:control | gnome-text-editor | partial | 0 / 12 of 12 | 12/12 | 10.1 | 10.5 | offscreen | – | 206.9 | – |
| cua:control | gnome-text-editor | covered | 0 / 12 of 12 | 12/12 | 10.1 | 12.6 | offscreen | – | 205.9 | – |
| cua:control | kate | unobscured | 12 / 0 of 12 | 12/12 | 10 | 12 | unobscured | – | 708.5 | – |
| cua:control | kate | partial | 0 / 0 of 12 | 12/12 | 10 | 16.1 | quiet | 2.3 | 676 | – |
| cua:control | kate | covered | 0 / 0 of 12 | 12/12 | 12.9 | 18.2 | quiet | 2.7 | 751.1 | – |
| cua:control | qtcreator | unobscured | 12 / 0 of 12 | 12/12 | 10 | 12.9 | unobscured | – | 988.8 | – |
| cua:control | qtcreator | partial | 0 / 0 of 12 | 12/12 | 10 | 12.4 | quiet | 1.3 | 940.4 | – |
| cua:control | qtcreator | covered | 0 / 0 of 12 | 12/12 | 11.9 | 16.8 | quiet | 1.5 | 965.3 | – |
| cua:control | firefox | unobscured | 0 / 0 of 12 | 12/12 | 14.7 | 20 | quiet | 5.2 | 162 | – |
| cua:control | firefox | partial | 0 / 0 of 12 | 12/12 | 14 | 20.7 | quiet | 4.9 | 149 | – |
| cua:control | firefox | covered | 0 / 0 of 12 | 12/12 | 15.6 | 18.9 | quiet | 6.3 | 164.1 | – |
| cua:control | chrome | unobscured | 12 / 0 of 12 | 12/12 | 10 | 10.6 | unobscured | – | 279.7 | – |
| cua:control | chrome | partial | 0 / 0 of 12 | 12/12 | 10.1 | 13.9 | quiet | 1.3 | 311.2 | – |
| cua:control | chrome | covered | 0 / 0 of 12 | 10/12 | 13.7 | 23.6 | quiet | 5.3 | 303.2 | – |
| cua:control | electron | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.8 | unobscured | – | 127.7 | – |
| cua:control | electron | partial | 0 / 0 of 12 | 12/12 | 10.1 | 18.6 | quiet | 3.3 | 103.3 | – |
| cua:control | electron | covered | 0 / 0 of 12 | 12/12 | 13.8 | 29 | quiet | 4 | 104.3 | – |
| cua:control | writer | unobscured | 0 / 0 of 12 | 12/12 | 10.1 | 18.5 | quiet | 0 | 1740.8 | – |
| cua:control | writer | partial | 0 / 0 of 12 | 12/12 | 10 | 18.8 | quiet | 0.5 | 1723.5 | – |
| cua:control | writer | covered | 0 / 0 of 12 | 12/12 | 10.1 | 19.1 | quiet | 6.1 | 1722.7 | – |
| cua:control | writer-gen | unobscured | 0 / 0 of 12 | 12/12 | 10 | 13.9 | quiet | 3.4 | 82.9 | – |
| cua:control | writer-gen | partial | 0 / 0 of 12 | 12/12 | 10 | 16.2 | quiet | 5.1 | 87.4 | – |
| cua:control | writer-gen | covered | 0 / 0 of 12 | 12/12 | 16.4 | 22.7 | quiet | 4.6 | 114.9 | – |
| cua:control | xterm | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 42.9 | – |
| cua:control | xterm | partial | 0 / 0 of 12 | 12/12 | 10.1 | 13.3 | quiet | – | 38.2 | – |
| cua:control | xterm | covered | 0 / 0 of 12 | 12/12 | 10.5 | 15.2 | quiet | 3.4 | 43.7 | – |
| cua:control | xterm-allow | unobscured | 12 / 0 of 12 | 12/12 | 10.1 | 12.6 | unobscured | – | 44.3 | – |
| cua:control | xterm-allow | partial | 0 / 0 of 12 | 12/12 | 10.1 | 12.5 | quiet | 0.1 | 37.5 | – |
| cua:control | xterm-allow | covered | 0 / 0 of 12 | 12/12 | 10.1 | 14.8 | quiet | 3.2 | 34.9 | – |

**PASS: every first capture right** of 396; the pinned build's captures against the truth: 0 off and 0 unjudged of 66.

Control lane cua:control: 2 of 396 first captures wrong.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2577 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

