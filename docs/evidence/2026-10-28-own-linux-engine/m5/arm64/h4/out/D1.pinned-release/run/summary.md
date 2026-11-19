# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 311.8 | 126.2 | 8 | 415.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (191)/192 (14), newest 50 (50)/50 (7), cua 186 (183)/186 (8), cua:0ms 77.5 (70)/77.5 (1) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 311.8 | 126.1 | 8 | 415.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (17), newest 50 (50)/50 (7), cua 233 (231)/233 (9), cua:0ms 103 (83)/103 (1) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 3/30 | 257.9 | 60 | 3.4 | 269.3 | clean | reach (pinned mean 128.3 px): cua 30/30 (shortest 146, mean 146.4), cua:0ms 2/30 (shortest 0, mean 13.3); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 54 (53)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 328.1 | 354.6 | 355.1 | 480.2 | **changed** | speed (warm): cua **declared speed gap (#358)** [26.4, 26.6]: cua 354.6 ms against newest's 328.1 ms, the interval [26.4, 26.6] above 0; cua:0ms **declared speed gap (#358)** [26.8, 27.1]: cua:0ms 355.1 ms against newest's 328.1 ms, the interval [26.8, 27.1] above 0; received, coalesced samples (events), raw/moves, median: pinned 12.5 (12.5)/12.5 (2), newest 5.5 (5.5)/5.5 (1), cua 2 (1)/2 (1), cua:0ms 9 (1)/11 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 24/40 | 40/40 | 0/40 | 485.7 | 473.3 | 22.8 | 1046.4 | clean | speed (warm): cua faster [-12.4, -11.7], 473.3 ms against newest's 485.3 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (51.5), newest 196 (196)/196 (17), cua 762 (762)/762 (28), cua:0ms 412 (353)/412 (2) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 354.6 ms against newest's 328.1 ms, the interval [26.4, 26.6] within the declared 40 ms.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11159 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

