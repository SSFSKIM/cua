# linux-engine-diff summary

## t69-select-40 (experiment dnd)

HTML5 drag and drop (pages/drag.html's `select-short` path), 40 drags a lane, each window covered (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where the server granted a grab during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | pinned | 0/40 | 0 / 0 | none | 0/40 | 40/40 | 0/40 | none | none |
| chrome | newest | 0/40 | 0 / 0 | none | 0/40 | 40/40 | 0/40 | none | none |
| chrome | cua | 0/40 | 0 / 0 | none | 0/40 | 40/40 | 0/40 | none | none |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 12125 requests, 1004 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

