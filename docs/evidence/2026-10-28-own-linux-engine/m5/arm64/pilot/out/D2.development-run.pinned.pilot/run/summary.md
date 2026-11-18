# linux-engine-diff summary

## m5-pinned-dev-D2-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.4 | 253.3 | 253.2 | 415.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 182.5 (182.5)/182.5 (14.5), newest 39 (39)/39 (6), cua 164 (163)/164 (13), cua:0ms 74.5 (72.5)/74.5 (15.5) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 2/2 | 2/2 | 2/2 | 2/2 | 311.3 | 252.8 | 252.7 | 413.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (241)/241 (17), newest 62 (62)/62 (7), cua 243 (243)/243 (14), cua:0ms 172 (147.5)/172 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 257.6 | 253 | 252.9 | 268.6 | clean | reach (pinned mean 136.5 px): cua 2/2 (shortest 144, mean 145), cua:0ms 2/2 (shortest 144, mean 145); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 71 (70.5)/0 (0), cua:0ms 53 (50.5)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 328.4 | 365.5 | 369.2 | 479.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 9.5 (9.5)/9.5 (1), newest 3.5 (3.5)/3.5 (1), cua 14 (13.5)/14 (1), cua:0ms 159.5 (150.5)/159.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 485.8 | 474.3 | 252.5 | 1047.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (52), newest 196 (196)/196 (17.5), cua 765 (764)/765 (28), cua:0ms 479 (423.5)/479 (15.5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1044 requests, 197 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

