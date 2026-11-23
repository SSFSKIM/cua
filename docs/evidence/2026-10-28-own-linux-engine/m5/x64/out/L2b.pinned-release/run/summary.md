# linux-engine-diff summary

## pinned-L2b (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 40/40 | 40/40 | 40/40 | 40/40 | 333.1 | 261.3 | 262.5 | 487.5 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 188 (170.5)/188 (18), newest 50 (46)/50 (8), cua 158 (92)/158 (13), cua:0ms 56 (34.5)/56 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 346.5 | 385.9 | 386.4 | 572.2 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 10 (6)/10 (1), newest 4 (3)/4 (1), cua 14 (6.5)/14 (1), cua:0ms 22 (7.5)/22 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 40/40 | 15/40 | 40/40 | 7/40 | 517.2 | 491.9 | 265.6 | 1142.2 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 7/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 679.5 (590.5)/679.5 (57), newest 174.5 (157.5)/174.5 (19), cua 519.5 (405)/519.5 (29), cua:0ms 395 (174.5)/395 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7032 requests, 1573 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

