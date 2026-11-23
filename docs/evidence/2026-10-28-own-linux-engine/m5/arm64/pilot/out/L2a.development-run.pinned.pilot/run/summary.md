# linux-engine-diff summary

## m5-pinned-dev-L2a-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.4 | 125.9 | 7 | 415.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 182 (181.5)/182 (13.5), newest 53 (53)/53 (7), cua 197.5 (194)/197.5 (7.5), cua:0ms 64 (55)/64 (1) | cua PASS, cua:0ms PASS |
| Chrome | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 328.9 | 354.5 | 355.1 | 480 | **changed** | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (2), newest 6 (6)/6 (1), cua 2 (1)/2 (1), cua:0ms 11 (1)/13 (1) | cua speed unjudged (a pilot), cua:0ms speed unjudged (a pilot) |
| Chrome | canvas | 2/2 | 2/2 | 2/2 | 0/2 | 486.6 | 473.3 | 22 | 1046.5 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 767.5 (767.5)/767.5 (51.5), newest 195 (194.5)/195 (18), cua 761.5 (761)/761.5 (28), cua:0ms 419 (385.5)/419 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 2 speeds.

Unjudged in this pilot (no top-up; not passes): chrome dnd: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20; chrome canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 901 requests, 161 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

