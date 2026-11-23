# linux-engine-diff summary

## t72-pilot-hierarchy (experiment writer-drag)

Writer's AT-SPI path from frame to first paragraph, by state (writer-drag.mjs `hierarchyPlan`): `y` of each level.

- writer run 0, after the arrangement: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,21 1280x752 > panel 0,99 1280x649 > panel 0,99 1221x649 > document text 0,125 1207x623 > paragraph 207,220 793x15
- writer run 0, after a background move: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,48 1280x752 > panel 0,126 1280x649 > panel 0,126 1221x649 > document text 0,152 1207x623 > paragraph 207,247 793x15
- writer run 0, after the arrangement again: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,21 1280x752 > panel 0,99 1280x649 > panel 0,99 1221x649 > document text 0,125 1207x623 > paragraph 207,220 793x15
- calc run 0, after the arrangement: (levels in results.jsonl)
- calc run 0, after a background move: (levels in results.jsonl)
- calc run 0, after the arrangement again: (levels in results.jsonl)
- impress run 0, after the arrangement: (levels in results.jsonl)
- impress run 0, after a background move: (levels in results.jsonl)
- impress run 0, after the arrangement again: (levels in results.jsonl)
- writer run 1, after the arrangement: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,21 1280x752 > panel 0,99 1280x649 > panel 0,99 1221x649 > document text 0,125 1207x623 > paragraph 207,220 793x15
- writer run 1, after a background move: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,48 1280x752 > panel 0,126 1280x649 > panel 0,126 1221x649 > document text 0,152 1207x623 > paragraph 207,247 793x15
- writer run 1, after the arrangement again: frame 0,0 1280x800 > panel 0,21 1280x779 > panel 0,48 1280x752 > root pane 0,21 1280x752 > panel 0,99 1280x649 > panel 0,99 1221x649 > document text 0,125 1207x623 > paragraph 207,220 793x15
- calc run 1, after the arrangement: (levels in results.jsonl)
- calc run 1, after a background move: (levels in results.jsonl)
- calc run 1, after the arrangement again: (levels in results.jsonl)
- impress run 1, after the arrangement: (levels in results.jsonl)
- impress run 1, after a background move: (levels in results.jsonl)
- impress run 1, after the arrangement again: (levels in results.jsonl)

The pinned build's element right click on fresh Writer windows (`elementProbe`), the context menu's corner against its point:

- run 0, fresh: paragraph y 220, point 603, 227, menu at 603, 228
- run 0, after a pointer event: paragraph y 247, point 603, 254, menu at 603, 255
- run 1, fresh: paragraph y 220, point 603, 227, menu at 603, 228
- run 1, after a pointer event: paragraph y 247, point 603, 254, menu at 603, 255

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1295 requests, 106 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

