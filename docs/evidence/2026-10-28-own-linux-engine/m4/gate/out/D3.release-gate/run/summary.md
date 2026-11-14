# linux-engine-diff summary

## m4-gate-D3 (experiment drag; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 324.6 | 123.3 | 27.6 | 462.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 187 (187)/187 (16), newest 43 (43)/43 (6.5), cua 106 (106)/106 (5), cua:0ms 13.5 (13.5)/13.5 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 326.1 | 123.5 | 30.2 | 461.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 225 (225)/225 (18.5), newest 50.5 (50.5)/50.5 (7), cua 139.5 (139.5)/139.5 (5.5), cua:0ms 20.5 (20.5)/20.5 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 264 | 81.8 | 11.6 | 282.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 1/30 | 344 | 140.6 | 37.2 | 512.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 10 (10)/2 (1), cua 41 (41)/3.5 (2), cua:0ms 3 (3)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 26/40 | 40/40 | 0/40 | 518.6 | 354.6 | 88.5 | 1177.1 | clean | speed (warm): cua faster [-164, -158.5], 354.6 ms against newest's 514.75 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 754 (754)/754 (58), newest 180 (180)/180 (18), cua 640 (640)/640 (19), cua:0ms 298 (298)/298 (6) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11872 requests, 2725 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

