# linux-engine-diff summary

## pinned-L2b (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 40/40 | 40/40 | 40/40 | 40/40 | 332.9 | 267.8 | 266 | 482.7 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 192.5 (184)/192.5 (18), newest 50 (46.5)/50 (8), cua 165 (101)/165 (14), cua:0ms 76.5 (41)/76.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 353.2 | 477.5 | 415.4 | 554 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 10.5 (9)/10.5 (2), newest 2 (2)/2 (1), cua 7 (5)/7 (1), cua:0ms 6 (4)/6 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 40/40 | 28/40 | 40/40 | 6/40 | 522.7 | 726.7 | 268.1 | 1160.5 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 6/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 746.5 (692)/746.5 (59.5), newest 189 (179)/189 (20), cua 517 (444)/517 (42.5), cua:0ms 307.5 (104)/307.5 (16.5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7008 requests, 1573 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

