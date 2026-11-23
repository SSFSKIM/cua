# linux-engine-diff summary

## pinned-D3 (experiment drag; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 312.3 | 119.4 | 7.4 | 418.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 177 (177)/177 (14), newest 41 (41)/41 (7), cua 128 (128)/128 (5), cua:0ms 4 (4)/4 (1) | cua PASS, cua:0ms PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 29/30 | 312.3 | 119.4 | 7.1 | 417.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 224.5 (224.5)/224.5 (16.5), newest 48.5 (48.5)/48.5 (7), cua 169 (169)/169 (6), cua:0ms 4 (4)/4 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 258 | 79.7 | 3.1 | 270 | clean | received, coalesced samples (events), raw/moves, median: pinned 45 (45)/0 (0), newest 9 (9)/0 (0), cua 5 (5)/0 (0), cua:0ms 2 (2)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 329.3 | 137.2 | 8.8 | 482.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 16 (16)/3 (2), newest 12 (12)/2 (2), cua 2 (2)/1 (1), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 1/40 | 40/40 | 0/40 | 489.5 | 351.9 | 22.7 | 1063.6 | clean | speed (warm): cua faster [-712.6, -711.3], 351.9 ms against pinned's 1063.55 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; gave the bar up: newest 0 usable of 40; received, coalesced samples (events), raw/moves, median: pinned 753 (753)/753 (51), newest 178 (178)/178 (17), cua 681.5 (681.5)/681.5 (19), cua:0ms 6.5 (6.5)/6.5 (2) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox range (cua:0ms); firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11888 requests, 2725 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

