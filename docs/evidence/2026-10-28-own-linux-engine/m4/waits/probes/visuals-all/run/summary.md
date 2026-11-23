# linux-engine-diff summary

## engine-readiness-20261107T172336 (experiment engine-readiness)

Every family, 2 trials per condition, a fresh cua-engine per trial, idle: the first capture against the same engine's capture 400 ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.

| family | condition | engine judged unobscured | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| gedit | unobscured | 2/2 | 2/2 | 10 | 10.1 | unobscured | – | 129.6 | 2/2 |
| gedit | partial | 0/2 | 2/2 | 10.7 | 10.7 | quiet | 0.7 | 124 | 2/2 |
| gedit | covered | 0/2 | 2/2 | 13.8 | 14.6 | quiet | 3.8 | 112.9 | 2/2 |
| gnome-text-editor | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 99.1 | 2/2 |
| gnome-text-editor | partial | 0/2 | 2/2 | 150 | 150 | cap | – | 241.9 | 2/2 |
| gnome-text-editor | covered | 0/2 | 2/2 | 150 | 150.1 | cap | – | 245.9 | 2/2 |
| kate | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 206.5 | 2/2 |
| kate | partial | 0/2 | 2/2 | 10.2 | 10.3 | quiet | 0.2 | 234.6 | 2/2 |
| kate | covered | 0/2 | 2/2 | 10.6 | 11.1 | quiet | 1.1 | 215.8 | 2/2 |
| qtcreator | unobscured | 2/2 | 2/2 | 10 | 10.1 | unobscured | – | 270.3 | 2/2 |
| qtcreator | partial | 0/2 | 2/2 | 10.1 | 10.1 | quiet | 0.1 | 270.9 | 2/2 |
| qtcreator | covered | 0/2 | 2/2 | 11 | 11.9 | quiet | 1.7 | 243 | 2/2 |
| firefox | unobscured | 0/2 | 2/2 | 11.7 | 11.9 | quiet | 1.7 | 81 | 2/2 |
| firefox | partial | 0/2 | 2/2 | 11.9 | 11.9 | quiet | 1.8 | 95.2 | 2/2 |
| firefox | covered | 0/2 | 2/2 | 11.6 | 11.8 | quiet | 1.6 | 68.4 | 2/2 |
| chrome | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 105.6 | 2/2 |
| chrome | partial | 0/2 | 2/2 | 11.6 | 11.9 | quiet | 1.7 | 111.7 | 2/2 |
| chrome | covered | 0/2 | 2/2 | 15.4 | 16.8 | quiet | 4.1 | 93.2 | 2/2 |
| electron | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 67 | 2/2 |
| electron | partial | 0/2 | 2/2 | 11.3 | 11.6 | quiet | 1.3 | 57.9 | 2/2 |
| electron | covered | 0/2 | 2/2 | 14.8 | 17 | quiet | 2.7 | 57.3 | 2/2 |
| writer | unobscured | 0/2 | 2/2 | 10.3 | 10.3 | quiet | 0.3 | 466.6 | 2/2 |
| writer | partial | 0/2 | 2/2 | 10.4 | 10.5 | quiet | 0.4 | 485.8 | 2/2 |
| writer | covered | 0/2 | 2/2 | 13.2 | 13.3 | quiet | 3.2 | 478 | 2/2 |
| writer-gen | unobscured | 0/2 | 2/2 | 11.1 | 11.2 | quiet | 1 | 59.1 | 2/2 |
| writer-gen | partial | 0/2 | 2/2 | 11.8 | 12.6 | quiet | 1.5 | 51.8 | 2/2 |
| writer-gen | covered | 0/2 | 2/2 | 14 | 14.3 | quiet | 0.8 | 56.4 | 2/2 |
| xterm | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 24 | 2/2 |
| xterm | partial | 0/2 | 2/2 | 10 | 10 | quiet | 0 | 30 | 2/2 |
| xterm | covered | 0/2 | 2/2 | 9.8 | 9.9 | quiet | 0.1 | 25.1 | 2/2 |
| xterm-allow | unobscured | 2/2 | 2/2 | 10 | 10 | unobscured | – | 30.1 | 2/2 |
| xterm-allow | partial | 0/2 | 2/2 | 10 | 10 | quiet | 0.1 | 29 | 2/2 |
| xterm-allow | covered | 0/2 | 2/2 | 10.1 | 10.2 | quiet | 0.1 | 24.1 | 2/2 |

**PASS: every first capture right** of 66; the pinned build's captures against the truth: 0 off and 0 unjudged of 66.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2818 requests, 211 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

