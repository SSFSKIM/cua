# linux-engine-diff summary

## vendor-short (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 12 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | pinned | 11/12 | 0 / 0 | stacking 11 | 12/12 | 0/12 | 0/12 | none | none |
| chrome | newest | 12/12 | 0 / 0 | stacking 12 | 12/12 | 0/12 | 0/12 | none | none |
| chrome | cua | 12/12 | 0 / 0 | stacking 12 | 12/12 | 0/12 | 0/12 | none | none |

