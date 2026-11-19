# linux-engine-diff summary

## pinned-L1 (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 31/40 | 330.1 | 177.2 | 39.4 | 547.3 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 31/40 (mean 49, shortest 44, Fisher p 0.001); received, coalesced samples (events), raw/moves, median: pinned 224 (215)/224 (22), newest 56 (51)/56 (8), cua 145 (118.5)/145 (10), cua:0ms 63.5 (19.5)/63.5 (3) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 6/40 | 267.7 | 68.1 | 11.8 | 285.4 | clean | reach (pinned mean 130.2 px): cua 40/40 (shortest 146, mean 146.3), cua:0ms 1/40 (shortest 0, mean 36.9); load: pinned 40/40 (mean 130.2), cua 40/40 (mean 146.3, shortest 146), cua:0ms 6/40 (mean 36.9, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 57 (52)/0 (0), newest 17 (16)/0 (0), cua 33 (26.5)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 40/40 | 324.8 | 263.5 | 276.4 | 490.1 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 206 (202)/206 (20.5), newest 50 (50)/50 (8), cua 154.5 (102.5)/154.5 (15), cua:0ms 121.5 (32)/121.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 267 | 264.9 | 266.4 | 282.3 | clean | reach (pinned mean 130 px): cua 40/40 (shortest 143, mean 145.4), cua:0ms 40/40 (shortest 143, mean 145.5); load: pinned 40/40 (mean 130), cua 40/40 (mean 145.4, shortest 143), cua:0ms 40/40 (mean 145.5, shortest 143); received, coalesced samples (events), raw/moves, median: pinned 60 (53.5)/0 (0), newest 17 (17)/0 (0), cua 54 (38)/0 (0), cua:0ms 27.5 (22.5)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:0ms); chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 9417 requests, 2121 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

