# linux-engine-diff summary

## pinned-D2 (experiment drag; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 30/30 | 323.4 | 256.3 | 256.4 | 456.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (16), newest 50 (50)/50 (7), cua 198 (193.5)/198 (13), cua:0ms 209.5 (191.5)/209.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 323.6 | 256.8 | 257.9 | 458.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 240.5 (240.5)/240.5 (19.5), newest 50 (50)/50 (8), cua 241.5 (235)/241.5 (14), cua:0ms 229.5 (217)/229.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 262.3 | 256.4 | 256.7 | 279.1 | clean | reach (pinned mean 129.6 px): cua 30/30 (shortest 144, mean 145.9), cua:0ms 30/30 (shortest 144, mean 145.4); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 69.5 (68)/0 (0), cua:0ms 75 (74)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 337.6 | 401.6 | 373.3 | 506.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 10 (10)/10.5 (1), newest 6 (6)/6 (1), cua 17 (17)/17 (1), cua:0ms 86 (81)/86.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 19/30 | 30/30 | 0/30 | 516.1 | 478.7 | 256.4 | 1159.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (59), newest 196 (196)/196 (19), cua 765 (760)/765 (28), cua:0ms 772 (694.5)/772 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 8746 requests, 1957 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

