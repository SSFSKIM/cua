# linux-engine-diff summary

## m5-pinned-dev-D1-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.7 | 126 | 7.3 | 416 | clean | received, coalesced samples (events), raw/moves, median: pinned 181.5 (181)/181.5 (14), newest 53 (53)/53 (7), cua 197.5 (192.5)/197.5 (8), cua:0ms 81 (70.5)/81 (1) | cua PASS, cua:0ms PASS |
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 311.7 | 126 | 7 | 414 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (16.5), newest 62 (62)/62 (7), cua 233.5 (229.5)/233.5 (9.5), cua:0ms 101.5 (79)/101.5 (1.5) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 2/2 | 2/2 | 1/2 | 258.6 | 60 | 3.7 | 269 | clean | reach (pinned mean 134.5 px): cua 2/2 (shortest 146, mean 146), cua:0ms 0/2 (shortest 0, mean 67); received, coalesced samples (events), raw/moves, median: pinned 59.5 (59.5)/0 (0), newest 17 (17)/0 (0), cua 53.5 (52.5)/0 (0), cua:0ms 3 (2)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 327.6 | 354.8 | 354.7 | 479.5 | **changed** | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 11 (10.5)/11 (2), newest 5 (5)/5 (1), cua 1.5 (1)/2.5 (1), cua:0ms 14.5 (1.5)/16 (1) | cua speed unjudged (a pilot), cua:0ms speed unjudged (a pilot) |
| Chrome | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 485.9 | 473.4 | 20.9 | 1042.7 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 763.5 (763.5)/763.5 (51), newest 196 (195.5)/196 (17.5), cua 761 (760.5)/761 (28.5), cua:0ms 392 (317)/392 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 2 speeds.

Unjudged in this pilot (no top-up; not passes): chrome dnd: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20; chrome canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1195 requests, 225 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

