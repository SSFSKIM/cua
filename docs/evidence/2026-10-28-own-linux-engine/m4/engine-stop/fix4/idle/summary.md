# linux-engine-diff summary

## engine-stop-20261104T174851 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 126.3 | 137.1 |
| drain | idle | burst | 10 | 10 | 344.9 | 353.6 |
| drain | idle | handle | 10 | 10 | 130.8 | 141.5 |
| drain | eof | hold | 10 | 10 | 70.4 | 80.9 |
| drain | eof | burst | 10 | 10 | 290.7 | 299.4 |
| drain | eof | handle | 10 | 10 | 95.7 | 113.1 |
| drain | signal | hold | 10 | 10 | 73.5 | 85.1 |
| drain | signal | burst | 10 | 10 | 291.2 | 299.6 |
| drain | signal | handle | 10 | 10 | 72.9 | 84.1 |
| drain | remote | hold | 10 | 10 | 149.3 | 163.6 |
| drain | remote | burst | 10 | 10 | 364.4 | 375.1 |
| drain | remote | handle | 10 | 10 | 176 | 188.2 |
| drain | held-back | hold | 10 | 10 | 7086.2 | 7400.2 |
| kill | idle | hold | 10 | 0 | 126.8 | 141.3 |
| kill | idle | burst | 10 | 10 | 128.1 | 138.3 |
| kill | idle | handle | 10 | 0 | 164.4 | 180.5 |
| kill | eof | hold | 10 | 0 | 83.5 | 99.2 |
| kill | eof | burst | 10 | 10 | 75 | 87 |
| kill | eof | handle | 10 | 0 | 70.5 | 82.4 |
| kill | signal | hold | 10 | 0 | 68.3 | 79 |
| kill | signal | burst | 10 | 10 | 63.7 | 71.5 |
| kill | signal | handle | 10 | 0 | 68.1 | 79.1 |
| kill | remote | hold | 10 | 0 | 145.9 | 157.6 |
| kill | remote | burst | 10 | 10 | 146.1 | 154.5 |
| kill | remote | handle | 10 | 0 | 161.5 | 175.4 |
| kill | held-back | hold | 10 | 0 | 7031 | 7345.1 |

The control's bursts: 0 of 40 cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6164 requests, 471 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

