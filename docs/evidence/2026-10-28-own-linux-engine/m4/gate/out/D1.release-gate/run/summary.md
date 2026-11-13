# linux-engine-diff summary

## m4-gate-D1 (experiment drag; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 323.6 | 129.8 | 23.4 | 461.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (16), newest 50 (50)/50 (8), cua 188 (182)/188 (8), cua:0ms 168.5 (151)/168.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 324.7 | 129.5 | 27.6 | 457.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (238.5)/239 (19), newest 50 (50)/50 (8), cua 234.5 (226)/234.5 (9), cua:0ms 202 (182.5)/202 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 4/30 | 262.9 | 62.4 | 9.8 | 279.6 | clean | reach (pinned mean 129.2 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 2/30 (shortest 0, mean 44.7); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (53.5)/0 (0), cua:0ms 44 (41)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 338 | 365.7 | 361.7 | 509.3 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.9, 30.1]: cua 365.7 ms against newest's 338 ms, the interval [24.9, 30.1] above 0; cua:0ms **declared speed gap (#358)** [19.9, 29.3]: cua:0ms 361.7 ms against newest's 338 ms, the interval [19.9, 29.3] above 0; received, coalesced samples (events), raw/moves, median: pinned 13.5 (12.5)/14 (2), newest 4.5 (4.5)/4.5 (1), cua 16.5 (16)/16.5 (1.5), cua:0ms 43.5 (38.5)/44 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 26/40 | 40/40 | 0/40 | 520.2 | 476.7 | 71.9 | 1156.7 | clean | speed (warm): cua faster [-48.4, -36.4], 476.65 ms against newest's 517.5 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (759.5)/764 (28), cua:0ms 747 (661.5)/747 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 365.7 ms against newest's 338 ms, the interval [24.9, 30.1] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11146 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

