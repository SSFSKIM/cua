# linux-engine-diff summary

## t72f-fix-settle-load2 (experiment settle)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| writer click desktop | settle-0 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer press_key background | settle-0 | 32 | 16 (16 / 0 / 0 / 0) | 0 | not reached |
| writer press_key background | settle-10 | 32 | 8 (8 / 0 / 0 / 0) | 0 | not reached |
| writer press_key background | settle-25 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer key_down background | settle-0 | 32 | 16 (16 / 0 / 0 / 0) | 0 | not reached |
| writer key_down background | settle-10 | 34 | 7 (7 / 0 / 0 / 0) | 0 | not reached |
| writer key_down background | settle-25 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer click background | settle-0 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer drag background | settle-0 | 31 | 10 (10 / 0 / 0 / 0) | 0 | not reached |
| writer drag background | settle-10 | 32 | 3 (3 / 0 / 0 / 0) | 0 | not reached |
| writer drag background | settle-25 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer activate_window background | settle-0 | 36 | 14 (14 / 0 / 0 / 0) | 0 | not reached |
| writer activate_window background | settle-10 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| writer type_text background | settle-0 | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | held step (ms) |
|---|---:|
| writer click desktop | 0 |
| writer press_key background | 25 |
| writer key_down background | 25 |
| writer click background | 0 |
| writer drag background | 25 |
| writer activate_window background | 10 |
| writer type_text background | 0 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5104 requests, 330 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

