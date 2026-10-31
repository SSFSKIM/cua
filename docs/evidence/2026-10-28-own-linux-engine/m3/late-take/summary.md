# linux-engine-diff summary

## m31-late-take-idle (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 60 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | cua | 0/60 | 60 / 0 | none | 60/60 | 0/60 | 0/60 | none | none |

## m31-late-take-load (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 60 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | cua | 0/60 | 59 / 0 | none | 59/60 | 0/60 | 0/60 | none | none |

## m31-late-take-load4 (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 100 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | cua | 0/100 | 93 / 0 | none | 93/100 | 4/100 | 0/100 | none | none |

