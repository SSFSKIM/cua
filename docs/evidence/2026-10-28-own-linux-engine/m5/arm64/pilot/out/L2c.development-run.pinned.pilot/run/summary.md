# linux-engine-diff summary

## m5-pinned-dev-L2c-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.7 | 119.4 | 7 | 417 | clean | received, coalesced samples (events), raw/moves, median: pinned 188 (188)/188 (14), newest 43.5 (43.5)/43.5 (6.5), cua 135 (135)/135 (5), cua:0ms 3 (3)/3 (1) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 2/2 | 311.9 | 119.4 | 7.4 | 419.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 210 (210)/210 (17), newest 50.5 (50.5)/50.5 (7), cua 161.5 (161.5)/161.5 (6), cua:0ms 3 (3)/3 (1) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 257.8 | 79.8 | 2.4 | 270.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 45 (45)/0 (0), newest 9.5 (9.5)/0 (0), cua 4.5 (4.5)/0 (0), cua:0ms 1.5 (1.5)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 329.8 | 137.3 | 8.9 | 484.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 15.5 (15.5)/2.5 (2), newest 11 (11)/2.5 (2), cua 2 (2)/1 (1), cua:0ms 3 (3)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 2/2 | 0/2 | 2/2 | 0/2 | 488.7 | 351.9 | 22.7 | 1063.7 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 752 (752)/752 (51), newest 170 (170)/170 (17), cua 686 (686)/686 (19), cua:0ms 4.5 (4.5)/4.5 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 1 speed.

Unjudged in this pilot (no top-up; not passes): firefox canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1205 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

