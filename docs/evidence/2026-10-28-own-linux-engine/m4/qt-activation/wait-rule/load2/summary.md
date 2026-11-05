# linux-engine-diff summary

## t61-ack-load2 (experiment qt-activation)

| family | kind | lane | runs | activated | activation requests | refused | landed | misses | streak | verdict | focus wait median / max ms | earlier focus let go median / max ms | answered median ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|
| kate | click | ack-25 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7.4 / 16.7 | 0.1 / 0.2 | 30.6 |
| kate | click | ack-50 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7.2 / 15.3 | 0.1 / 2.9 | 32.1 |
| kate | click | ack-100 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7.9 / 15.6 | 0.1 / 3.1 | 30.8 |
| kate | click | ack-200 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7.5 / 20.3 | 0.1 / 1.8 | 30.6 |
| kate | click | control | 30 | 9 | 9 | 0 | 30 | 9 | 1 | activates without the wait (9/30) | – | – | 20.9 |
| qtcreator | click | ack-25 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 4.1 / 17.5 | 0.1 / 3.5 | 30.4 |
| qtcreator | click | ack-50 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 4.5 / 20.5 | 0.1 / 3.4 | 33.5 |
| qtcreator | click | ack-100 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 6.4 / 23.6 | 0.1 / 0.3 | 33.6 |
| qtcreator | click | ack-200 | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 6.3 / 17.5 | 0.1 / 6.7 | 31.4 |
| qtcreator | click | control | 30 | 5 | 5 | 0 | 30 | 5 | 1 | activates without the wait (5/30) | – | – | 21.2 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1054 requests, 72 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

