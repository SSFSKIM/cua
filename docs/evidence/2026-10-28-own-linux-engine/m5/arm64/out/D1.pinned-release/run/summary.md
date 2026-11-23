# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 311.8 | 126.1 | 8.5 | 415.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (191)/192 (14), newest 50 (50)/50 (7), cua 186 (183)/186 (8), cua:0ms 81.5 (71.5)/81.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 29/30 | 311.5 | 126.2 | 8.2 | 415.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (16.5), newest 50 (50)/50 (7), cua 233.5 (230.5)/233.5 (9), cua:0ms 112 (96)/112 (1) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 7/30 | 257.9 | 60.1 | 3.7 | 269.1 | clean | reach (pinned mean 127.4 px): cua 30/30 (shortest 146, mean 146.2), cua:0ms 6/30 (shortest 0, mean 31.7); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 54 (53)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 328.1 | 354.7 | 355.2 | 480.3 | **changed** | speed (warm): cua **declared speed gap (#358)** [26.5, 26.8]: cua 354.7 ms against newest's 328.1 ms, the interval [26.5, 26.8] above 0; cua:0ms **declared speed gap (#358)** [26.9, 27.3]: cua:0ms 355.2 ms against newest's 328.1 ms, the interval [26.9, 27.3] above 0; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (2), newest 5 (5)/5 (1), cua 2 (1)/2 (1), cua:0ms 9 (1)/12 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 21/40 | 40/40 | 0/40 | 486 | 473.4 | 25.1 | 1047.3 | clean | speed (warm): cua faster [-574.6, -573], 473.4 ms against pinned's 1047.25 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; gave the bar up: newest 18 usable of 40; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (52), newest 196 (196)/196 (17), cua 762 (762)/762 (28), cua:0ms 462 (384.5)/462 (2) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome range (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 354.7 ms against newest's 328.1 ms, the interval [26.5, 26.8] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11159 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

