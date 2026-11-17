# linux-engine-diff summary

## t62-confirm-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| electron-input move background | settle-10 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input move background | settle-25 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input move background | settle-50 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input move background | settle-75 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input move background | settle-100 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | settle-10 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | settle-25 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | settle-50 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | settle-75 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| electron-input scroll background | settle-100 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| xterm scroll background | settle-10 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| xterm scroll background | settle-25 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| xterm scroll background | settle-50 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| xterm scroll background | settle-75 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| xterm scroll background | settle-100 | 30 | 0 (0 / 0) | 30 | 30 consecutive |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1016 requests, 68 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

