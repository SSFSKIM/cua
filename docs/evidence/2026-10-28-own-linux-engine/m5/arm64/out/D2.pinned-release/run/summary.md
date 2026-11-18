# linux-engine-diff summary

## pinned-D2 (experiment drag; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 30/30 | 311.4 | 252.9 | 252.8 | 415.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (14), newest 50 (50)/50 (7), cua 197 (196)/197 (13), cua:0ms 143 (134.5)/143 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 311.2 | 253 | 252.9 | 414.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (241)/241 (16.5), newest 50 (50)/50 (7), cua 242.5 (242)/242.5 (14), cua:0ms 162 (149.5)/162 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 257.6 | 252.9 | 253 | 268.7 | clean | reach (pinned mean 126.8 px): cua 30/30 (shortest 143, mean 145.4), cua:0ms 30/30 (shortest 144, mean 145.6); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 71 (71)/0 (0), cua:0ms 56 (54.5)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 328.1 | 367.6 | 367.3 | 479.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (1), newest 4.5 (4.5)/4.5 (1), cua 25 (25)/25 (1), cua:0ms 155 (147.5)/155 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 20/30 | 30/30 | 0/30 | 485 | 474.3 | 253 | 1044.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (51.5), newest 196 (196)/196 (18), cua 765 (765)/765 (28), cua:0ms 480 (424.5)/480 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 8764 requests, 1957 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

