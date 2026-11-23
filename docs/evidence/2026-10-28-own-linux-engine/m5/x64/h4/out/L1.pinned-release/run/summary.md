# linux-engine-diff summary

## pinned-L1 (experiment drag; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 28/40 | 329.5 | 146 | 35.2 | 478.7 | clean | load: pinned 40/40 (mean 50.5), cua 40/40 (mean 50.6, shortest 50), cua:0ms 28/40 (mean 37.1, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 219.5 (193.5)/219.5 (21.5), newest 50 (48.5)/50 (8), cua 163 (120.5)/163 (9.5), cua:0ms 45 (25.5)/45 (3) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 8/40 | 265.4 | 65.5 | 10.6 | 286.4 | clean | reach (pinned mean 130 px): cua 40/40 (shortest 146, mean 146.3), cua:0ms 3/40 (shortest 0, mean 38.5); load: pinned 40/40 (mean 130), cua 40/40 (mean 146.3, shortest 146), cua:0ms 8/40 (mean 38.5, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 55 (47.5)/0 (0), newest 16 (14)/0 (0), cua 30.5 (21)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 40/40 | 326.7 | 263.6 | 261.1 | 481.9 | clean | load: pinned 40/40 (mean 50.4), cua 40/40 (mean 50.6, shortest 50), cua:0ms 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 199 (182.5)/199 (20), newest 50 (48)/50 (8), cua 164 (114.5)/164 (14), cua:0ms 113 (53)/113 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 266 | 256.7 | 260.2 | 282.3 | clean | reach (pinned mean 132.2 px): cua 40/40 (shortest 144, mean 145.7), cua:0ms 40/40 (shortest 144, mean 145.3); load: pinned 40/40 (mean 132.2), cua 40/40 (mean 145.7, shortest 144), cua:0ms 40/40 (mean 145.3, shortest 144); received, coalesced samples (events), raw/moves, median: pinned 59 (54)/0 (0), newest 17 (15.5)/0 (0), cua 59.5 (44)/0 (0), cua:0ms 28 (21)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:0ms); chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9455 requests, 2121 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

