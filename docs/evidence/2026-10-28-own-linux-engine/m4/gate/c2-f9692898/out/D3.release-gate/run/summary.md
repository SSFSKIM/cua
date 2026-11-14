# linux-engine-diff summary

## m4-gate-D3 (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 323.8 | 123.3 | 25.4 | 454.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 186.5 (186.5)/186.5 (15.5), newest 43 (43)/43 (7), cua 111.5 (111.5)/111.5 (5), cua:0ms 5.5 (5.5)/5.5 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 326.3 | 123.6 | 27.9 | 455.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 225 (225)/225 (18.5), newest 51 (51)/51 (7), cua 133 (133)/133 (6), cua:0ms 17.5 (17.5)/17.5 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 265.4 | 81.8 | 10.4 | 280.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 340.4 | 140.1 | 34.5 | 517.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 11 (11)/2 (1), cua 4 (4)/1 (1), cua:0ms 3 (3)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 30/30 | 23/30 | 30/30 | 0/30 | 515.6 | 354.6 | 80.7 | 1161 | clean | speed (warm): cua faster [-161.7, -158.45], 354.6 ms against newest's 514.05 ms; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 30, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 754.5 (754.5)/754.5 (57), newest 180 (180)/180 (18), cua 641 (641)/641 (19), cua:0ms 244.5 (244.5)/244.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11150 requests, 2557 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

