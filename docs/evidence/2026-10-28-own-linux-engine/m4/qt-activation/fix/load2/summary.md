# linux-engine-diff summary

## t61fix-fix-load2 (experiment qt-activation)

| family | kind | lane | runs | activated | activation requests | refused | landed | misses | streak | verdict | focus wait median / max ms | earlier focus let go median / max ms | answered median ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|
| kate | click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 6.2 / 13.1 | 0.1 / 6.7 | 30.1 |
| kate | click | control | 30 | 5 | 5 | 0 | 30 | 5 | 0 | activates without the wait (5/30) | – | – | 22.6 |
| kate | key-click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7.5 / 20.2 | 105.8 / 118.9 | 151.2 |
| kate | key-click | control | 30 | 3 | 3 | 0 | 30 | 3 | 2 | activates without the wait (3/30) | – | – | 25.4 |
| kate | drag | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 7 / 16.9 | 0.1 / 4.8 | 23 |
| kate | drag | control | 30 | 4 | 4 | 0 | 30 | 4 | 3 | activates without the wait (4/30) | – | – | 11.7 |
| qtcreator | click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 4.9 / 16.1 | 0.1 / 7.5 | 32.8 |
| qtcreator | click | control | 30 | 4 | 4 | 0 | 30 | 4 | 8 | activates without the wait (4/30) | – | – | 22.4 |
| qtcreator | key-click | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 1.9 / 16.8 | 97.7 / 116.4 | 137.2 |
| qtcreator | key-click | control | 30 | 1 | 1 | 0 | 30 | 1 | 25 | activates without the wait (1/30) | – | – | 23.3 |
| qtcreator | drag | shipped | 30 | 0 | 0 | 0 | 30 | 0 | 30 | 30 consecutive | 2.8 / 13.1 | 0.1 / 4.1 | 19.8 |
| qtcreator | drag | control | 30 | 7 | 7 | 0 | 30 | 7 | 3 | activates without the wait (7/30) | – | – | 11.3 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1651 requests, 112 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

