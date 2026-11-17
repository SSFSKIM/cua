# linux-engine-diff summary

## drag-20261108T141543 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:before took | cua:h6L took | newest warm ms | cua warm ms | cua:before warm ms | cua:h6L warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 30/30 | 30/30 | 30/30 | 4/30 | 30/30 | 292.6 | 169.6 | 90 | 262.5 | 299.1 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 25 (25)/25 (7), cua:before 23 (23)/23 (2), cua:h6L 31.5 (31.5)/31.5 (13) | cua PASS, cua:before **FAIL**, cua:h6L PASS |
| Firefox | handle-dnd | 30/30 | 30/30 | 30/30 | 3/30 | 30/30 | 183.1 | 174.1 | 113.2 | 181.7 | 183.5 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/1 (1), newest 3 (3)/1 (1), cua 2 (2)/1 (1), cua:before 11 (11)/0 (0), cua:h6L 3 (3)/1 (1) | cua PASS, cua:before **FAIL**, cua:h6L PASS |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua:before); firefox handle-dnd (cua:before).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 5938 requests, 1186 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

