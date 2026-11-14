# linux-engine-diff summary

## t64-c3-idle-move (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| electron-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| firefox-input move dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-gtk3 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt5 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| settle-qt6 move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| gtk4-input move dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input move background | clean | 44547 | 5 of 5 | 0 |
| electron-input move background | clean | 56428 | 5 of 5 | 0 |
| firefox-input move background | clean | 49986 | 5 of 5 | 0 |
| settle-gtk3 move background | clean | 55260 | 5 of 5 | 0 |
| settle-qt5 move background | clean | 56028 | 5 of 5 | 0 |
| settle-qt6 move background | clean | 54955 | 5 of 5 | 0 |

desktop: started with no window active, ended with 0x00e0000c active (harness), neither acted on; holder none; the harness's own trace: 5348 requests, 353 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

