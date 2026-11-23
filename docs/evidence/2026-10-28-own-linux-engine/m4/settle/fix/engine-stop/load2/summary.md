# linux-engine-diff summary

## engine-stop-20261107T145813 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | burst chrome | 10 | 10 | 383 | 409.7 |
| drain | idle | burst electron | 10 | 10 | 400.3 | 416.9 |
| drain | idle | pairs chrome | 10 | 10 | 410.3 | 430.2 |
| drain | idle | pairs electron | 10 | 10 | 421.1 | 445.7 |
| drain | eof | burst chrome | 10 | 10 | 276.9 | 297.2 |
| drain | eof | burst electron | 10 | 10 | 279 | 299.1 |
| drain | eof | pairs chrome | 10 | 10 | 275.2 | 297.5 |
| drain | eof | pairs electron | 10 | 10 | 280.4 | 297.9 |
| drain | signal | burst chrome | 10 | 10 | 273.8 | 296 |
| drain | signal | burst electron | 10 | 10 | 277.5 | 296.5 |
| drain | signal | pairs chrome | 10 | 10 | 275 | 297.3 |
| drain | signal | pairs electron | 10 | 10 | 275 | 296.7 |
| drain | remote | burst chrome | 10 | 10 | 402.4 | 420.8 |
| drain | remote | burst electron | 10 | 10 | 400.9 | 427.7 |
| drain | remote | pairs chrome | 10 | 10 | 411.5 | 431.9 |
| drain | remote | pairs electron | 10 | 10 | 418.2 | 434.7 |
| kill | idle | burst chrome | 10 | 10 | 300.5 | 322.8 |
| kill | idle | burst electron | 10 | 10 | 322 | 344.9 |
| kill | idle | pairs chrome | 10 | 10 | 289.7 | 309.7 |
| kill | idle | pairs electron | 10 | 10 | 322.5 | 341.4 |
| kill | eof | burst chrome | 10 | 10 | 149.1 | 170.9 |
| kill | eof | burst electron | 10 | 10 | 165.4 | 185.7 |
| kill | eof | pairs chrome | 10 | 10 | 157.7 | 181.8 |
| kill | eof | pairs electron | 10 | 10 | 150.4 | 171.1 |
| kill | signal | burst chrome | 10 | 10 | 161.6 | 181.6 |
| kill | signal | burst electron | 10 | 10 | 168.4 | 185.5 |
| kill | signal | pairs chrome | 10 | 10 | 165.5 | 184 |
| kill | signal | pairs electron | 10 | 10 | 152.2 | 174.1 |
| kill | remote | burst chrome | 10 | 10 | 300.8 | 326 |
| kill | remote | burst electron | 10 | 10 | 301.6 | 330.4 |
| kill | remote | pairs chrome | 10 | 10 | 332.7 | 353.3 |
| kill | remote | pairs electron | 10 | 10 | 336.1 | 357.5 |

The control's press_key bursts: 0 of 80 cut (required on each path and browser).

The control's key_down/key_up pair bursts: 0 of 80 cut (required on each path and browser).

**Incomplete or failed:** kill idle burst chrome: the control cut no burst (0 of 10): no pending burst was shown; kill idle burst electron: the control cut no burst (0 of 10): no pending burst was shown; kill idle pairs chrome: the control cut no burst (0 of 10): no pending burst was shown; kill idle pairs electron: the control cut no burst (0 of 10): no pending burst was shown; kill eof burst chrome: the control cut no burst (0 of 10): no pending burst was shown; kill eof burst electron: the control cut no burst (0 of 10): no pending burst was shown; kill eof pairs chrome: the control cut no burst (0 of 10): no pending burst was shown; kill eof pairs electron: the control cut no burst (0 of 10): no pending burst was shown; kill signal burst chrome: the control cut no burst (0 of 10): no pending burst was shown; kill signal burst electron: the control cut no burst (0 of 10): no pending burst was shown; kill signal pairs chrome: the control cut no burst (0 of 10): no pending burst was shown; kill signal pairs electron: the control cut no burst (0 of 10): no pending burst was shown; kill remote burst chrome: the control cut no burst (0 of 10): no pending burst was shown; kill remote burst electron: the control cut no burst (0 of 10): no pending burst was shown; kill remote pairs chrome: the control cut no burst (0 of 10): no pending burst was shown; kill remote pairs electron: the control cut no burst (0 of 10): no pending burst was shown.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 18982 requests, 1293 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

