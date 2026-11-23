# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 320.1 | 131 | 23.8 | 446.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (16), newest 50 (50)/50 (7), cua 188 (182.5)/188 (8), cua:0ms 170.5 (153)/170.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 323.4 | 129.6 | 26.5 | 461.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (238.5)/239.5 (19.5), newest 50 (50)/50 (8), cua 234 (228)/234 (9), cua:0ms 213 (183)/213 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 4/30 | 262.3 | 62.6 | 10.4 | 278.4 | clean | reach (pinned mean 134.5 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 2/30 (shortest 0, mean 47.7); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (54)/0 (0), cua:0ms 42.5 (39)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338.2 | 363.8 | 364.5 | 506.9 | **changed** | speed (warm): cua **declared speed gap (#358)** [21.9, 28.4]: cua 363.8 ms against newest's 338.2 ms, the interval [21.9, 28.4] above 0; cua:0ms **declared speed gap (#358)** [18.9, 32.6]: cua:0ms 364.5 ms against newest's 338.2 ms, the interval [18.9, 32.6] above 0; received, coalesced samples (events), raw/moves, median: pinned 12.5 (12)/12.5 (2), newest 5 (5)/5 (1), cua 11.5 (11)/11.5 (1), cua:0ms 47 (43)/47.5 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 30/30 | 22/30 | 30/30 | 1/30 | 510.4 | 476.4 | 75 | 1146.7 | clean | speed (warm): cua faster [-38, -33], 476.4 ms against newest's 510.9 ms; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 30, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (57), newest 196 (196)/196 (19), cua 763.5 (761)/763.5 (29), cua:0ms 744 (660)/744 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 363.8 ms against newest's 338.2 ms, the interval [21.9, 28.4] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 10582 requests, 2209 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

