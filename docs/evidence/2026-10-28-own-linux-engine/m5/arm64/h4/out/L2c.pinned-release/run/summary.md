# linux-engine-diff summary

## pinned-L2c (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 40/40 | 40/40 | 40/40 | 32/40 | 329.8 | 128.9 | 31.1 | 477.4 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 32/40 (mean –, shortest –, Fisher p 0.003); received, coalesced samples (events), raw/moves, median: pinned 57 (57)/57 (14), newest 12 (12)/12 (6), cua 8.5 (8.5)/8.5 (4), cua:0ms 2 (2)/2 (2) | cua PASS, cua:0ms **FAIL** |
| Firefox | range | 40/40 | 40/40 | 40/40 | 31/40 | 329.5 | 149.1 | 34.7 | 530.1 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 31/40 (mean 41.4, shortest 3, Fisher p 0.001); received, coalesced samples (events), raw/moves, median: pinned 83.5 (83.5)/83.5 (17.5), newest 15 (15)/15 (6), cua 16 (16)/16 (4.5), cua:0ms 2 (2)/2 (2) | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 268.6 | 85.9 | 11.8 | 284 | clean | load: pinned 40/40 (mean 108), cua 40/40 (mean 108, shortest 108), cua:0ms 40/40 (mean 108, shortest 108); received, coalesced samples (events), raw/moves, median: pinned 11 (11)/0 (0), newest 4 (4)/0 (0), cua 3 (3)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 40/40 | 37/40 | 38/40 | 11/40 | 363 | 144.3 | 40.4 | 588.4 | clean | load: pinned 40/40 (mean –), cua 38/40 (mean –, shortest –, Fisher p 0.247), cua:0ms 11/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 4 (4)/2 (1.5), newest 3 (3)/1 (1), cua 3 (3)/1 (1), cua:0ms 2 (2)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 26/40 | 40/40 | 3/40 | 571.4 | 817.3 | 117 | 1178.2 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 3/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 524.5 (524.5)/524.5 (57.5), newest 108.5 (108.5)/108.5 (20), cua 228.5 (228.5)/228.5 (44.5), cua:0ms 26.5 (26.5)/26.5 (7) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox select (cua:0ms); firefox range (cua:0ms); firefox dnd (cua, cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 14725 requests, 3397 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

