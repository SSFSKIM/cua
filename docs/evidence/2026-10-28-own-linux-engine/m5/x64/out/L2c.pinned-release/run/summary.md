# linux-engine-diff summary

## pinned-L2c (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 40/40 | 40/40 | 40/40 | 32/40 | 327.4 | 132.9 | 27.4 | 473.4 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 32/40 (mean –, shortest –, Fisher p 0.003); received, coalesced samples (events), raw/moves, median: pinned 62 (62)/62 (14.5), newest 17 (17)/17 (6), cua 12.5 (12.5)/12.5 (4), cua:0ms 3 (3)/3 (2) | cua PASS, cua:0ms **FAIL** |
| Firefox | range | 40/40 | 40/40 | 40/40 | 33/40 | 330.9 | 142.6 | 25.1 | 483 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 33/40 (mean 45.6, shortest 0, Fisher p 0.006); received, coalesced samples (events), raw/moves, median: pinned 85.5 (85.5)/85.5 (17.5), newest 18 (18)/18 (7), cua 14 (14)/14 (5), cua:0ms 2 (2)/2 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 268 | 83.9 | 9.8 | 284.8 | clean | load: pinned 40/40 (mean 108), cua 40/40 (mean 108, shortest 108), cua:0ms 40/40 (mean 108, shortest 108); received, coalesced samples (events), raw/moves, median: pinned 12 (12)/0 (0), newest 5.5 (5.5)/0 (0), cua 3 (3)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 40/40 | 40/40 | 40/40 | 5/40 | 357.1 | 144.1 | 28.7 | 575.4 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 5/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 5 (5)/3 (2), newest 3 (3)/1 (1), cua 2.5 (2.5)/1 (1), cua:0ms 2 (2)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 23/40 | 40/40 | 9/40 | 540 | 392 | 139.6 | 1213.5 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 9/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 483 (483)/483 (59), newest 112 (112)/112 (19), cua 139 (139)/139 (19), cua:0ms 25.5 (25.5)/25.5 (8) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox select (cua:0ms); firefox range (cua:0ms); firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 14746 requests, 3397 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

