# linux-engine-diff summary

## m5-pinned-dev-D3-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 312.3 | 119.6 | 7.3 | 418.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 184 (184)/184 (14), newest 43.5 (43.5)/43.5 (7), cua 133 (133)/133 (5), cua:0ms 3 (3)/3 (1) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 2/2 | 312.5 | 119.5 | 8.5 | 422.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 199.5 (199.5)/199.5 (16.5), newest 48.5 (48.5)/48.5 (7), cua 161 (161)/161 (5.5), cua:0ms 2.5 (2.5)/2.5 (1.5) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 258.1 | 79.9 | 2.5 | 270.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 45 (45)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 328.9 | 137.3 | 8.9 | 482.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 16 (16)/2.5 (2), newest 11 (11)/2.5 (2), cua 2.5 (2.5)/1 (1), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 2/2 | 0/2 | 2/2 | 0/2 | 488.9 | 351.8 | 24.4 | 1064.6 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 745.5 (745.5)/745.5 (51.5), newest 174.5 (174.5)/174.5 (17), cua 686 (686)/686 (19), cua:0ms 8 (8)/8 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 1 speed.

Unjudged in this pilot (no top-up; not passes): firefox canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1203 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

