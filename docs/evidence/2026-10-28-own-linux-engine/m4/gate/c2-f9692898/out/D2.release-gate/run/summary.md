# linux-engine-diff summary

## m4-gate-D2 (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 30/30 | 321.1 | 255.9 | 256.2 | 452.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (16), newest 50 (50)/50 (7), cua 198 (195.5)/198 (13), cua:0ms 204 (189)/204 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 323.1 | 255.9 | 256.2 | 447.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 240.5 (240.5)/240.5 (19), newest 50 (50)/50 (8), cua 242 (237)/242 (14), cua:0ms 245.5 (217)/245.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 262.3 | 256 | 255.9 | 277.4 | clean | reach (pinned mean 131.1 px): cua 30/30 (shortest 144, mean 145.7), cua:0ms 30/30 (shortest 143, mean 145.5); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 69 (68.5)/0 (0), cua:0ms 75 (73)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338 | 371 | 371.2 | 507.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 10 (10)/10 (1), newest 5.5 (5.5)/5.5 (1), cua 20.5 (20.5)/20.5 (1), cua:0ms 93 (90.5)/93.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 15/30 | 30/30 | 0/30 | 512.1 | 478.2 | 256 | 1140.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (57), newest 196 (196)/196 (19), cua 765 (761)/765 (29), cua:0ms 765.5 (681.5)/765.5 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 8751 requests, 1957 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

