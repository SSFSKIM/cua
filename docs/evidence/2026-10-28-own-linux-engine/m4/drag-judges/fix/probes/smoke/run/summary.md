# linux-engine-diff summary

## drag-20261108T064333 (experiment drag)

Every engine drags the same path 3 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | scroller | 3/3 | 3/3 | 2/3 | 0/3 | 262.6 | 145.2 | 109.8 | 282.2 | clean | reach (pinned mean 125.3 px): cua 1/3 (shortest 90, mean 117), cua:0ms 0/3 (shortest 0, mean 36.7); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 55 (55)/0 (0), cua:0ms 43 (40)/0 (0) | cua **FAIL**, cua:0ms **FAIL** |
| Firefox | scroller | 3/3 | 3/3 | 3/3 | 3/3 | 262.7 | 172.4 | 110.1 | 284.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 46 (46)/0 (0), newest 11 (11)/0 (0), cua 27 (27)/0 (0), cua:0ms 2 (2)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | handle-canvas | 3/3 | 3/3 | 0/3 | 0/3 | 291.5 | 96.7 | 53.7 | 299.2 | **changed** | control (no press) took 0/3; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 20 (20)/20 (2), cua:0ms 8 (8)/8 (2) | cua **FAIL**, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua, cua:0ms); firefox handle-canvas (cua, cua:0ms).

The judges' verdict for `cua`: **FAIL**: chrome scroller: cua missed runs 2; chrome scroller: cua short of the pinned build's mean distance (125.3 px) on 2 of 3 runs (shortest 90 px, mean 117 px); firefox handle-canvas: cua missed runs 0 1 2.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1133 requests, 216 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

