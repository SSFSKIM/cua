# linux-engine-diff summary

## m5-pinned-dev-L1-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 311.3 | 126 | 7 | 415.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (17), newest 62 (62)/62 (7), cua 233.5 (232)/233.5 (9.5), cua:0ms 86.5 (82.5)/86.5 (1) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 2/2 | 2/2 | 0/2 | 258 | 59.9 | 2.9 | 269 | clean | reach (pinned mean 136.5 px): cua 2/2 (shortest 146, mean 146), cua:0ms 0/2 (shortest 0, mean 0); received, coalesced samples (events), raw/moves, median: pinned 59.5 (59.5)/0 (0), newest 17 (17)/0 (0), cua 53.5 (53)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 2/2 | 2/2 | 2/2 | 2/2 | 310.7 | 253.1 | 253.1 | 415.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (241)/241 (17), newest 62 (62)/62 (7), cua 243 (242.5)/243 (13.5), cua:0ms 155.5 (122)/155.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 257.6 | 252.8 | 253 | 269 | clean | reach (pinned mean 136.5 px): cua 2/2 (shortest 144, mean 145), cua:0ms 2/2 (shortest 146, mean 146.5); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 71 (70.5)/0 (0), cua:0ms 56 (54)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1073 requests, 201 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

