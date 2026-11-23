# linux-engine-diff summary

## m4-dev-L3d-pilot (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| kate click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| kate activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| qtcreator activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| writer type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal press_key background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal key_down background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal type_text background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-terminal activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| kate press_key background | clean | 16311 | 5 of 5 | 0 |
| kate key_down background | clean | 16315 | 5 of 5 | 0 |
| kate click background | clean | 5700 | 5 of 5 | 0 |
| kate key_click background | clean | 5830 | 5 of 5 | 0 |
| kate drag background | clean | 7202 | 5 of 5 | 0 |
| qtcreator press_key background | clean | 16319 | 5 of 5 | 0 |
| qtcreator key_down background | clean | 16322 | 5 of 5 | 0 |
| qtcreator click background | clean | 5706 | 5 of 5 | 0 |
| qtcreator key_click background | clean | 5838 | 5 of 5 | 0 |
| qtcreator drag background | clean | 7073 | 5 of 5 | 0 |
| writer press_key background | clean | 207 | 5 of 5 | 0 |
| writer key_down background | clean | 212 | 5 of 5 | 0 |
| writer click background | clean | 303 | 5 of 5 | 0 |
| writer drag background | clean | 1827 | 5 of 5 | 0 |
| writer type_text background | clean | 6134 | 5 of 5 | 0 |
| gnome-terminal press_key background | clean | 208 | 5 of 5 | 0 |
| gnome-terminal key_down background | clean | 212 | 5 of 5 | 0 |
| gnome-terminal click background | clean | 310 | 5 of 5 | 0 |
| gnome-terminal scroll background | clean | 262 | 5 of 5 | 0 |
| gnome-terminal type_text background | clean | 6123 | 5 of 5 | 0 |

**Incomplete or failed:** kate click desktop (shipped): a development series of 2, not the 30 the rule needs; kate drag desktop (shipped): a development series of 2, not the 30 the rule needs; kate press_key background (shipped): a development series of 2, not the 30 the rule needs; kate key_down background (shipped): a development series of 2, not the 30 the rule needs; kate click background (shipped): a development series of 2, not the 30 the rule needs; kate key_click background (shipped): a development series of 2, not the 30 the rule needs; kate drag background (shipped): a development series of 2, not the 30 the rule needs; kate activate_window background (shipped): a development series of 2, not the 30 the rule needs; qtcreator click desktop (shipped): a development series of 2, not the 30 the rule needs; qtcreator drag desktop (shipped): a development series of 2, not the 30 the rule needs; qtcreator press_key background (shipped): a development series of 2, not the 30 the rule needs; qtcreator key_down background (shipped): a development series of 2, not the 30 the rule needs; qtcreator click background (shipped): a development series of 2, not the 30 the rule needs; qtcreator key_click background (shipped): a development series of 2, not the 30 the rule needs; qtcreator drag background (shipped): a development series of 2, not the 30 the rule needs; qtcreator activate_window background (shipped): a development series of 2, not the 30 the rule needs; writer click desktop (shipped): a development series of 2, not the 30 the rule needs; writer press_key background (shipped): a development series of 2, not the 30 the rule needs; writer key_down background (shipped): a development series of 2, not the 30 the rule needs; writer click background (shipped): a development series of 2, not the 30 the rule needs; writer drag background (shipped): a development series of 2, not the 30 the rule needs; writer activate_window background (shipped): a development series of 2, not the 30 the rule needs; writer type_text background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal click desktop (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal scroll desktop (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal press_key background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal key_down background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal click background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal scroll background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal type_text background (shipped): a development series of 2, not the 30 the rule needs; gnome-terminal activate_window background (shipped): a development series of 2, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 3747 requests, 270 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

