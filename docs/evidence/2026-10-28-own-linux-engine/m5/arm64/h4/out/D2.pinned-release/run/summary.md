# linux-engine-diff summary

## pinned-D2 (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 30/30 | 311.6 | 253.3 | 253.2 | 416.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (14), newest 50 (50)/50 (7), cua 197 (197)/197 (13), cua:0ms 159.5 (149.5)/159.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 311.4 | 253.2 | 253.1 | 415.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (240.5)/241 (17), newest 50 (50)/50 (7), cua 242.5 (242)/242.5 (14), cua:0ms 183 (162)/183 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 257.7 | 253.2 | 253.1 | 268.7 | clean | reach (pinned mean 129.4 px): cua 30/30 (shortest 143, mean 145), cua:0ms 30/30 (shortest 143, mean 145.7); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 71 (71)/0 (0), cua:0ms 60 (58)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 328.2 | 400 | 365.8 | 480 | clean | received, coalesced samples (events), raw/moves, median: pinned 15 (15)/15 (1), newest 4.5 (4.5)/4.5 (1), cua 24.5 (24.5)/25 (1), cua:0ms 157.5 (151.5)/158.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 15/30 | 30/30 | 0/30 | 485.7 | 474.2 | 253.1 | 1044.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (51), newest 196 (196)/196 (17), cua 765 (765)/765 (28), cua:0ms 535 (450.5)/535 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 8763 requests, 1957 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

