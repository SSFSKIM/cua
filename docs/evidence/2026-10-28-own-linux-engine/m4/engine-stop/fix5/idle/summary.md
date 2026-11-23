# linux-engine-diff summary

## engine-stop-20261104T201108 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 131.7 | 141.4 |
| drain | idle | burst | 10 | 10 | 368.5 | 378.2 |
| drain | idle | handle | 10 | 10 | 133.1 | 144.2 |
| drain | eof | hold | 10 | 10 | 72.2 | 86.9 |
| drain | eof | burst | 10 | 10 | 290.3 | 299.3 |
| drain | eof | handle | 10 | 10 | 72.8 | 86 |
| drain | signal | hold | 10 | 10 | 70.8 | 84.8 |
| drain | signal | burst | 10 | 10 | 291 | 299.3 |
| drain | signal | handle | 10 | 10 | 78.9 | 91.3 |
| drain | remote | hold | 10 | 10 | 189.8 | 205 |
| drain | remote | burst | 10 | 10 | 349.7 | 358 |
| drain | remote | handle | 10 | 10 | 150.2 | 162 |
| drain | held-back | hold | 10 | 10 | 7077.4 | 7389.7 |
| kill | idle | hold | 10 | 0 | 124.1 | 135.3 |
| kill | idle | burst | 10 | 10 | 134.1 | 142 |
| kill | idle | handle | 10 | 0 | 120.7 | 132.1 |
| kill | eof | hold | 10 | 0 | 71.2 | 82.7 |
| kill | eof | burst | 10 | 10 | 64.3 | 73 |
| kill | eof | handle | 10 | 0 | 70.2 | 82 |
| kill | signal | hold | 10 | 0 | 68.4 | 80.3 |
| kill | signal | burst | 10 | 10 | 69.1 | 79.2 |
| kill | signal | handle | 10 | 0 | 64.7 | 75.8 |
| kill | remote | hold | 10 | 0 | 144.2 | 159 |
| kill | remote | burst | 10 | 10 | 147.6 | 155.6 |
| kill | remote | handle | 10 | 0 | 151.6 | 162.6 |
| kill | held-back | hold | 10 | 0 | 7024 | 7337.6 |

The control's bursts: 0 of 40 cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6192 requests, 471 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

