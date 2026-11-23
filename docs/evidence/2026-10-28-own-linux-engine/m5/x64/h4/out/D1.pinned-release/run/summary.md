# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 28/30 | 320.5 | 130 | 25.4 | 449.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (16), newest 50 (50)/50 (7), cua 188 (181.5)/188 (8), cua:0ms 170.5 (150.5)/170.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 324.3 | 129.5 | 26.5 | 457.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (238.5)/239 (19), newest 52.5 (52.5)/52.5 (8), cua 235 (227.5)/235 (9), cua:0ms 218 (185.5)/218 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 5/30 | 262.4 | 62.7 | 10.4 | 278.4 | clean | reach (pinned mean 130.6 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 2/30 (shortest 0, mean 52.9); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (54)/0 (0), cua:0ms 43 (39)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338.4 | 369 | 369.2 | 510.9 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.6, 33.2]: cua 369 ms against newest's 338.4 ms, the interval [24.6, 33.2] above 0; cua:0ms **declared speed gap (#358)** [18.7, 34.1]: cua:0ms 369.2 ms against newest's 338.4 ms, the interval [18.7, 34.1] above 0; received, coalesced samples (events), raw/moves, median: pinned 13 (12.5)/13 (2), newest 4.5 (4.5)/4.5 (1), cua 18 (17.5)/18 (1), cua:0ms 65.5 (59)/66 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 30/30 | 23/30 | 30/30 | 1/30 | 514.8 | 476.7 | 73.9 | 1159.3 | clean | speed (warm): cua faster [-46, -35.45], 476.7 ms against newest's 515.5 ms; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 30, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (767.5)/768 (58), newest 196 (196)/196 (19), cua 764 (758)/764 (28), cua:0ms 747.5 (671.5)/747.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 369 ms against newest's 338.4 ms, the interval [24.6, 33.2] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 10578 requests, 2209 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

