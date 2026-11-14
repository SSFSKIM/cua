# linux-engine-diff summary

## t68-pilot1 (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd-short` path), 15 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where the server granted a grab during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | cua | 15/15 | 0 / 0 | stacking 15 | 15/15 | 0/15 | 0/15 | none | none |
| chrome | cua:f0 | 14/15 | 0 / 0 | stacking 14 | 15/15 | 0/15 | 0/15 | none | none |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x0120000c; the harness's own trace: 1619 requests, 243 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

