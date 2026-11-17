# linux-engine-diff summary

## pinned-D3 (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 322.7 | 123.5 | 24.9 | 453.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 188.5 (188.5)/188.5 (15.5), newest 42.5 (42.5)/42.5 (7), cua 115 (115)/115 (5), cua:0ms 5 (5)/5 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 325 | 122.6 | 29.7 | 460.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 225 (225)/225 (18.5), newest 50 (50)/50 (7), cua 144.5 (144.5)/144.5 (6), cua:0ms 15 (15)/15 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 263.1 | 81.8 | 11.6 | 280.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 342 | 140.4 | 34 | 513.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 11 (11)/2 (2), cua 4 (4)/1 (1), cua:0ms 3.5 (3.5)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 30/30 | 27/30 | 30/30 | 0/30 | 515.4 | 354.6 | 77.2 | 1149.2 | clean | speed (warm): cua faster [-161.4, -159.4], 354.6 ms against newest's 515.2 ms; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 30, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 754 (754)/754 (56), newest 181 (181)/181 (18), cua 648 (648)/648 (19), cua:0ms 237.5 (237.5)/237.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11149 requests, 2557 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

