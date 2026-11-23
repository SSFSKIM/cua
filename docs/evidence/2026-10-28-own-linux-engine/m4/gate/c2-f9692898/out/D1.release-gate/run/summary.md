# linux-engine-diff summary

## m4-gate-D1 (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 320.7 | 130.1 | 24.9 | 447.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (16), newest 50 (50)/50 (7), cua 188 (182.5)/188 (8), cua:0ms 169.5 (151)/169.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 323 | 129.4 | 27.3 | 446.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (238.5)/239 (18.5), newest 50 (50)/50 (8), cua 233.5 (228.5)/233.5 (9), cua:0ms 211.5 (189.5)/211.5 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 0/30 | 262.8 | 62.7 | 10.9 | 278.4 | clean | reach (pinned mean 132.5 px): cua 30/30 (shortest 146, mean 146.4), cua:0ms 0/30 (shortest 0, mean 31.8); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (54)/0 (0), cua:0ms 42 (40.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338.2 | 365.9 | 360.1 | 504.8 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.8, 31.7]: cua 365.9 ms against newest's 338.2 ms, the interval [24.8, 31.7] above 0; cua:0ms **declared speed gap (#358)** [19.4, 28]: cua:0ms 360.1 ms against newest's 338.2 ms, the interval [19.4, 28] above 0; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (2), newest 4 (4)/4 (1), cua 16.5 (16)/16.5 (1), cua:0ms 25.5 (20)/26.5 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 17/40 | 40/40 | 0/40 | 511.2 | 476.4 | 74.9 | 1157.2 | clean | speed (warm): cua faster [-689.05, -671.05], 476.4 ms against pinned's 1157.2 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; gave the bar up: newest 15 usable of 40; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (760.5)/764 (28), cua:0ms 743 (660.5)/743 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 365.9 ms against newest's 338.2 ms, the interval [24.8, 31.7] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11144 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

