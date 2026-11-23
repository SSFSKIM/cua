# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (9371d2348cf8); the pin's x64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 320.9 | 455.4 | 455.2 | 452.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (16), newest 50 (50)/50 (7), cua 188 (183.5)/188 (8), cua:0ms 169.5 (151)/169.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 322.9 | 454.9 | 455 | 457.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (238.5)/239 (19), newest 50 (50)/50 (8), cua 236 (229)/236 (9), cua:0ms 214.5 (169.5)/214.5 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 4/30 | 262.4 | 455.1 | 455.2 | 279.4 | clean | reach (pinned mean 131.5 px): cua 30/30 (shortest 146, mean 146.2), cua:0ms 3/30 (shortest 0, mean 49); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (54)/0 (0), cua:0ms 44 (40.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338.7 | 371.4 | 365.7 | 510.4 | **changed** | speed (warm): cua **declared speed gap (#358)** [29.2, 36.9]: cua 371.4 ms against newest's 338.7 ms, the interval [29.2, 36.9] above 0; cua:0ms **declared speed gap (#358)** [20.6, 31.6]: cua:0ms 365.7 ms against newest's 338.7 ms, the interval [20.6, 31.6] above 0; received, coalesced samples (events), raw/moves, median: pinned 13 (12.5)/13 (2), newest 5 (5)/5 (1), cua 27 (27)/27 (1), cua:0ms 49.5 (41.5)/50 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 19/40 | 40/40 | 1/40 | 519.8 | 477.6 | 455.6 | 1164.7 | clean | speed (warm): cua faster [-694.85, -671.5], 477.6 ms against pinned's 1164.65 ms; cua:0ms **fail**: cua:0ms: 1 usable samples of 40, fewer than 20; gave the bar up: newest 16 usable of 40; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (759)/764 (29), cua:0ms 744.5 (663)/744.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 371.4 ms against newest's 338.7 ms, the interval [29.2, 36.9] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11144 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

