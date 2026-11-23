# linux-engine-diff summary

## engine-stop-20261104T135622 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | burst | 10 | 10 | 395.3 | 411 |
| drain | eof | burst | 10 | 10 | 280.9 | 296.9 |
| drain | signal | burst | 10 | 10 | 280.4 | 297.6 |
| drain | remote | burst | 10 | 10 | 386.8 | 403.4 |
| kill | idle | burst | 10 | 10 | 279.2 | 298.7 |
| kill | eof | burst | 10 | 10 | 140.1 | 159.8 |
| kill | signal | burst | 10 | 10 | 121.8 | 141.7 |
| kill | remote | burst | 10 | 10 | 286.3 | 302.2 |

The control's bursts: 0 of 40 cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 4871 requests, 331 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

