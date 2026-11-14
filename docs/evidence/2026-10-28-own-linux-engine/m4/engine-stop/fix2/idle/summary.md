# linux-engine-diff summary

## engine-stop-20261104T133344 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 127 | 137.6 |
| drain | idle | burst | 10 | 10 | 354.5 | 368.1 |
| drain | idle | handle | 10 | 10 | 144.9 | 155 |
| drain | eof | hold | 10 | 10 | 70 | 80.2 |
| drain | eof | burst | 10 | 10 | 290.9 | 299.5 |
| drain | eof | handle | 10 | 10 | 95.4 | 110.3 |
| drain | signal | hold | 10 | 10 | 78.8 | 90 |
| drain | signal | burst | 10 | 10 | 291.1 | 299.1 |
| drain | signal | handle | 10 | 10 | 69.9 | 85.6 |
| drain | remote | hold | 10 | 10 | 141.9 | 156.4 |
| drain | remote | burst | 10 | 10 | 350.8 | 363 |
| drain | remote | handle | 10 | 10 | 157.8 | 169 |
| drain | held-back | hold | 10 | 10 | 7081.2 | 7395 |
| kill | idle | hold | 10 | 0 | 130.9 | 142.7 |
| kill | idle | burst | 10 | 10 | 127.5 | 137.7 |
| kill | idle | handle | 10 | 0 | 125.9 | 139 |
| kill | eof | hold | 10 | 0 | 70.7 | 82 |
| kill | eof | burst | 10 | 10 | 67.3 | 75.5 |
| kill | eof | handle | 10 | 0 | 71.1 | 83.8 |
| kill | signal | hold | 10 | 0 | 65.4 | 76.7 |
| kill | signal | burst | 10 | 10 | 67.7 | 79.1 |
| kill | signal | handle | 10 | 0 | 70.3 | 83.3 |
| kill | remote | hold | 10 | 0 | 145.4 | 156.9 |
| kill | remote | burst | 10 | 10 | 145.4 | 153 |
| kill | remote | handle | 10 | 0 | 157.5 | 171.1 |
| kill | held-back | hold | 10 | 0 | 7022.3 | 7341 |

The control's bursts: 0 of 40 cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6173 requests, 471 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

