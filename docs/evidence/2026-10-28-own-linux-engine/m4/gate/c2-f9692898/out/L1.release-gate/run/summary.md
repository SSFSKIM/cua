# linux-engine-diff summary

## m4-gate-L1 (experiment drag; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 21/40 | 327.8 | 142.8 | 30.4 | 500.5 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 21/40 (mean 43.3, shortest 21, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 232 (206)/232 (20.5), newest 56.5 (48.5)/56.5 (8), cua 167 (127)/167 (9.5), cua:0ms 28 (13)/28 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 5/40 | 265.6 | 65 | 11.2 | 285.1 | clean | reach (pinned mean 131.7 px): cua 40/40 (shortest 146, mean 146.5), cua:0ms 2/40 (shortest 0, mean 21.2); load: pinned 40/40 (mean 131.7), cua 40/40 (mean 146.5, shortest 146), cua:0ms 5/40 (mean 21.2, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 54 (48)/0 (0), newest 16 (15)/0 (0), cua 31.5 (21)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 40/40 | 326.6 | 260.1 | 261.3 | 499.8 | clean | load: pinned 40/40 (mean 50.4), cua 40/40 (mean 50.6, shortest 50), cua:0ms 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 199 (182.5)/199 (22), newest 52 (49.5)/52 (8), cua 162.5 (99.5)/162.5 (14), cua:0ms 85.5 (40.5)/85.5 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 266.3 | 259.5 | 260.2 | 283 | clean | reach (pinned mean 130.1 px): cua 40/40 (shortest 143, mean 145.7), cua:0ms 40/40 (shortest 143, mean 145.4); load: pinned 40/40 (mean 130.1), cua 40/40 (mean 145.7, shortest 143), cua:0ms 40/40 (mean 145.4, shortest 143); received, coalesced samples (events), raw/moves, median: pinned 58 (53)/0 (0), newest 17 (17)/0 (0), cua 58.5 (34.5)/0 (0), cua:0ms 31 (23)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:0ms); chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9463 requests, 2121 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

