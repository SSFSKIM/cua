# linux-engine-diff summary

## pinned-L2b (experiment drag; acceptance on the pinned release)

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); the pin's arm64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 40/40 | 39/40 | 40/40 | 39/40 | 331.4 | 464.4 | 469.5 | 477.2 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 39/40 (mean –, shortest –, Fisher p 0.500); received, coalesced samples (events), raw/moves, median: pinned 191 (186)/191 (18), newest 50 (48.5)/50 (8), cua 155 (103.5)/155 (14), cua:0ms 55 (30.5)/55 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 352.6 | 450.7 | 417.5 | 577.3 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9 (8)/9.5 (2), newest 3 (3)/3 (1), cua 5.5 (4)/5.5 (1), cua:0ms 7 (4)/7 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 40/40 | 25/40 | 40/40 | 9/40 | 506.8 | 491 | 553.9 | 1144.6 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 9/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 746.5 (688.5)/746.5 (58), newest 182.5 (167)/182.5 (19), cua 500.5 (397.5)/500.5 (29), cua:0ms 400.5 (262.5)/400.5 (42.5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron select (cua:0ms); electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7012 requests, 1573 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

