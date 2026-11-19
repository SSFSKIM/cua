# linux-engine-diff summary

## pinned-L2a (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 40/40 | 40/40 | 40/40 | 31/40 | 326.6 | 147.9 | 34.5 | 483.3 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 31/40 (mean –, shortest –, Fisher p 0.001); received, coalesced samples (events), raw/moves, median: pinned 189.5 (180.5)/189.5 (17.5), newest 50 (49)/50 (8), cua 133.5 (100)/133.5 (8), cua:0ms 32 (8)/32 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 40/40 | 37/40 | 40/40 | 40/40 | 349.9 | 400.2 | 396.6 | 555.2 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9 (9)/9.5 (2), newest 4 (4)/4.5 (1), cua 5 (3.5)/6 (1), cua:0ms 8.5 (4)/8.5 (1) | cua PASS, cua:0ms PASS |
| Chrome | canvas | 40/40 | 29/40 | 39/40 | 6/40 | 527.3 | 1158.5 | 134.3 | 1184.3 | clean | load: pinned 40/40 (mean –), cua 39/40 (mean –, shortest –, Fisher p 0.500), cua:0ms 6/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 757 (737.5)/757 (60), newest 190 (185)/190 (19.5), cua 605 (561)/605 (67), cua:0ms 279.5 (124)/279.5 (8) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome canvas (cua, cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9134 requests, 1905 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

