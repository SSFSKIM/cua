# linux-engine-diff summary

## t61-final-idle (experiment qt-activation)

| family | kind | lane | runs | activated | activation requests | refused | landed | misses | streak | verdict | focus wait median / max ms | earlier focus let go median / max ms | answered median ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|
| kate | click | pinned | 30 | 0 | 0 | 0 | 30 | 0 | 30 | counted | – | – | 215.2 |
| kate | click | released | 30 | 0 | 0 | 0 | 30 | 0 | 30 | counted | – | – | 116.4 |
| kate | click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 0.7 / 1 | 0.2 / 0.4 | 19.5 |
| kate | click | control | 30 | 0 | 0 | 0 | 30 | 0 | 30 | activated nothing | – | – | 16.4 |
| qtcreator | click | pinned | 30 | 0 | 0 | 0 | 30 | 0 | 30 | counted | – | – | 215.1 |
| qtcreator | click | released | 30 | 0 | 0 | 0 | 30 | 0 | 30 | counted | – | – | 116.7 |
| qtcreator | click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 1.5 / 2.1 | 0.3 / 0.5 | 23.3 |
| qtcreator | click | control | 30 | 0 | 0 | 0 | 30 | 0 | 30 | activated nothing | – | – | 16.6 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 213 requests, 16 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

