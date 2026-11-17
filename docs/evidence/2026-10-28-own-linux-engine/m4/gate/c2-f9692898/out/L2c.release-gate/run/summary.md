# linux-engine-diff summary

## m4-gate-L2c (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 40/40 | 40/40 | 40/40 | 33/40 | 325.7 | 132.1 | 24.3 | 470.1 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 33/40 (mean –, shortest –, Fisher p 0.006); received, coalesced samples (events), raw/moves, median: pinned 58.5 (58.5)/58.5 (14.5), newest 15 (15)/15 (6.5), cua 12.5 (12.5)/12.5 (5), cua:0ms 2 (2)/2 (2) | cua PASS, cua:0ms **FAIL** |
| Firefox | range | 40/40 | 40/40 | 40/40 | 36/40 | 326.3 | 149.5 | 27.5 | 483.5 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 36/40 (mean 47.9, shortest 25, Fisher p 0.058); received, coalesced samples (events), raw/moves, median: pinned 88 (88)/88 (20), newest 19 (19)/19 (7), cua 15 (15)/15 (5.5), cua:0ms 2 (2)/2 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 267.6 | 84 | 8.9 | 283.6 | clean | load: pinned 40/40 (mean 108), cua 40/40 (mean 108, shortest 108), cua:0ms 40/40 (mean 108, shortest 108); received, coalesced samples (events), raw/moves, median: pinned 15 (15)/0 (0), newest 5 (5)/0 (0), cua 3 (3)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 40/40 | 40/40 | 39/40 | 9/40 | 356.6 | 144.3 | 37.1 | 579.7 | clean | load: pinned 40/40 (mean –), cua 39/40 (mean –, shortest –, Fisher p 0.500), cua:0ms 9/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 4.5 (4.5)/2 (1), newest 3 (3)/1 (1), cua 3 (3)/2 (1), cua:0ms 2 (2)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 25/40 | 39/40 | 7/40 | 543.5 | 384.3 | 72.2 | 1204.3 | clean | load: pinned 40/40 (mean –), cua 39/40 (mean –, shortest –, Fisher p 0.500), cua:0ms 7/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 502.5 (502.5)/502.5 (59), newest 112.5 (112.5)/112.5 (19), cua 125 (125)/125 (19), cua:0ms 20 (20)/20 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox select (cua:0ms); firefox range (cua:0ms); firefox dnd (cua, cua:0ms); firefox canvas (cua, cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 14752 requests, 3397 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

