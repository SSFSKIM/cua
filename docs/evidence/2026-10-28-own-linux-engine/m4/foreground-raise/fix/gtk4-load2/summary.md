# linux-engine-diff summary

## t63-fixw-gtk4-load2 (experiment settle)

| cell | lane | runs | misses (late / never) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| gtk4-input press_key dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gtk4-input click dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gtk4-input move dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gtk4-input scroll dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gtk4-input drag dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |
| gnome-text-editor type_text dedicated | shipped | 30 | 0 (0 / 0) | 30 | 30 consecutive |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 11146 requests, 730 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

