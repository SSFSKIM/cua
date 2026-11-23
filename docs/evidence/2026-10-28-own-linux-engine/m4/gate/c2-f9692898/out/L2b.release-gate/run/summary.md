# linux-engine-diff summary

## m4-gate-L2b (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 40/40 | 39/40 | 40/40 | 40/40 | 330.1 | 258.9 | 262.1 | 494.7 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 188 (169)/188 (18), newest 50 (47)/50 (8), cua 161.5 (101)/161.5 (13), cua:0ms 86 (32)/86 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 346 | 380.8 | 388.2 | 527.8 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9.5 (8)/10 (1), newest 3.5 (2.5)/3.5 (1), cua 12 (6)/12 (1), cua:0ms 14.5 (8)/14.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 40/40 | 24/40 | 40/40 | 7/40 | 515.5 | 488.8 | 263.1 | 1137 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 7/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 656 (599)/656 (57), newest 175 (152)/175 (19), cua 486 (357.5)/486 (29), cua:0ms 421 (195.5)/421 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7042 requests, 1573 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

