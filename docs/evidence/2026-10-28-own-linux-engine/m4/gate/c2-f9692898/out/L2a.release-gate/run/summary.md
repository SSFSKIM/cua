# linux-engine-diff summary

## m4-gate-L2a (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 40/40 | 40/40 | 40/40 | 21/40 | 333.9 | 141.1 | 22.3 | 490.5 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 21/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 188 (167.5)/188 (18), newest 48 (44)/48 (8), cua 134.5 (76)/134.5 (8), cua:0ms 10.5 (4.5)/10.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 343.7 | 374.3 | 380.9 | 531.2 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9 (8)/9 (1), newest 4 (4)/4 (1), cua 8 (5.5)/8 (1), cua:0ms 21.5 (9)/21.5 (1) | cua PASS, cua:0ms PASS |
| Chrome | canvas | 40/40 | 32/40 | 40/40 | 9/40 | 521.1 | 487.7 | 207.7 | 1164.8 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 9/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 708.5 (646.5)/708.5 (58.5), newest 187 (176.5)/187 (20), cua 620.5 (443.5)/620.5 (28), cua:0ms 419 (237.5)/419 (12) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9298 requests, 1905 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

