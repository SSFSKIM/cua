# linux-engine-diff summary

## pinned-L2b (experiment drag; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 40/40 | 40/40 | 40/40 | 40/40 | 328.4 | 261 | 264.5 | 488.7 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 189.5 (170.5)/189.5 (18), newest 50 (47.5)/50 (8), cua 158.5 (100.5)/158.5 (13), cua:0ms 106.5 (50.5)/106.5 (15) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 349.8 | 419 | 390.5 | 563.2 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9 (7)/9 (1), newest 3 (3)/3 (1), cua 12.5 (6.5)/14 (1), cua:0ms 19.5 (6.5)/23.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 40/40 | 25/40 | 40/40 | 9/40 | 516 | 491.9 | 262.9 | 1134.1 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 9/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 671.5 (582)/671.5 (57), newest 179 (169)/179 (19), cua 515 (372.5)/515 (29), cua:0ms 370 (140.5)/370 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7038 requests, 1573 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

