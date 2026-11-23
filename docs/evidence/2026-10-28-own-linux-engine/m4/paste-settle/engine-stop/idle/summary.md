# linux-engine-diff summary

## engine-stop-20261105T091703 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 133.3 | 145.9 |
| drain | idle | burst | 10 | 10 | 372.8 | 384.9 |
| drain | idle | handle | 10 | 10 | 132 | 143.6 |
| drain | eof | hold | 10 | 10 | 80.1 | 90.7 |
| drain | eof | burst | 10 | 10 | 289.7 | 299 |
| drain | eof | handle | 10 | 10 | 81.3 | 97.7 |
| drain | signal | hold | 10 | 10 | 78.4 | 89.9 |
| drain | signal | burst | 10 | 10 | 290.4 | 298.9 |
| drain | signal | handle | 10 | 10 | 74.3 | 87.9 |
| drain | remote | hold | 10 | 10 | 152.3 | 163.8 |
| drain | remote | burst | 10 | 10 | 358.8 | 369.7 |
| drain | remote | handle | 10 | 10 | 170.7 | 185.7 |
| drain | held-back | hold | 10 | 10 | 7083.7 | 7397.4 |
| kill | idle | hold | 10 | 0 | 131.3 | 144.1 |
| kill | idle | burst | 10 | 10 | 139.8 | 149.4 |
| kill | idle | handle | 10 | 0 | 140.1 | 152.1 |
| kill | eof | hold | 10 | 0 | 77.6 | 91 |
| kill | eof | burst | 10 | 10 | 70.8 | 79.5 |
| kill | eof | handle | 10 | 0 | 83.8 | 102.7 |
| kill | signal | hold | 10 | 0 | 86.4 | 98.7 |
| kill | signal | burst | 10 | 10 | 72.8 | 81.9 |
| kill | signal | handle | 10 | 0 | 79.1 | 91.4 |
| kill | remote | hold | 10 | 0 | 154 | 169.8 |
| kill | remote | burst | 10 | 10 | 151.1 | 160.5 |
| kill | remote | handle | 10 | 0 | 155 | 170.9 |
| kill | held-back | hold | 10 | 0 | 7020.7 | 7334.2 |

The control's bursts: 0 of 40 cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6188 requests, 471 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

