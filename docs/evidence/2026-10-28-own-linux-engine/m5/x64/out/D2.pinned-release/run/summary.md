# linux-engine-diff summary

## pinned-D2 (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 30/30 | 322.5 | 255.7 | 255.7 | 458 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (16), newest 50 (50)/50 (8), cua 197.5 (193)/197.5 (13), cua:0ms 204 (189.5)/204 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 323.6 | 256.1 | 256 | 453.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (240)/241 (18.5), newest 50 (50)/50 (7.5), cua 241 (234.5)/241 (14), cua:0ms 243 (216)/243 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 263 | 256.8 | 256.4 | 279.5 | clean | reach (pinned mean 130.7 px): cua 30/30 (shortest 144, mean 145.9), cua:0ms 30/30 (shortest 143, mean 145.4); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 69 (68)/0 (0), cua:0ms 75 (71.5)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338.2 | 369.8 | 371.1 | 506.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11.5 (1), newest 5 (5)/5 (1), cua 18 (17)/18 (1), cua:0ms 88 (87.5)/88.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 18/30 | 30/30 | 0/30 | 508.8 | 478.1 | 256.1 | 1137.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (57), newest 196 (196)/196 (19), cua 765 (762)/765 (28), cua:0ms 765 (686.5)/765 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 8749 requests, 1957 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

