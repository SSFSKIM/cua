# linux-engine-diff summary

## t62-search-idle-4 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| gedit press_key background | settle-0 | 31 | 1 (1 / 0) | 30 | 30 consecutive |
| gedit key_down background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit drag background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit activate_window background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit type_text background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit clipboard_read background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit clipboard_write background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit press_key desktop | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit click desktop | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit drag desktop | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gedit drag_handle desktop | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| kate press_key background | settle-0 | 31 | 1 (1 / 0) | 30 | 30 consecutive |
| kate key_down background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| kate click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| kate key_click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| kate drag background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| kate activate_window background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator press_key background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator key_down background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator key_click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator drag background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| qtcreator activate_window background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| writer press_key background | settle-0 | 32 | 16 (16 / 0) | 0 | not reached |
| writer press_key background | settle-10 | 32 | 7 (7 / 0) | 0 | not reached |
| writer press_key background | settle-25 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| writer key_down background | settle-0 | 32 | 16 (16 / 0) | 0 | not reached |
| writer key_down background | settle-10 | 32 | 6 (6 / 0) | 0 | not reached |
| writer key_down background | settle-25 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| writer click background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| writer activate_window background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| writer type_text background | settle-0 | 30 | 0 (0 / 0) | 30 | 30 consecutive |

| cell | held step (ms) |
|---|---:|
| gedit press_key background | 0 |
| gedit key_down background | 0 |
| gedit click background | 0 |
| gedit drag background | 0 |
| gedit activate_window background | 0 |
| gedit type_text background | 0 |
| gedit clipboard_read background | 0 |
| gedit clipboard_write background | 0 |
| gedit press_key desktop | 0 |
| gedit click desktop | 0 |
| gedit drag desktop | 0 |
| gedit drag_handle desktop | 0 |
| kate press_key background | 0 |
| kate key_down background | 0 |
| kate click background | 0 |
| kate key_click background | 0 |
| kate drag background | 0 |
| kate activate_window background | 0 |
| qtcreator press_key background | 0 |
| qtcreator key_down background | 0 |
| qtcreator click background | 0 |
| qtcreator key_click background | 0 |
| qtcreator drag background | 0 |
| qtcreator activate_window background | 0 |
| writer press_key background | 25 |
| writer key_down background | 25 |
| writer click background | 0 |
| writer activate_window background | 0 |
| writer type_text background | 0 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 10634 requests, 902 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

