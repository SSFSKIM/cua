# linux-engine-diff summary

## pinned-L1 (experiment drag; acceptance on the pinned release)

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); the pin's arm64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 69bd7993e1f1cb252574939bd6e8e80674bab5b8; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 25/40 | 327.3 | 465.8 | 468.7 | 498 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 25/40 (mean 46.2, shortest 34, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 232.5 (214)/232.5 (21), newest 57 (50)/57 (8), cua 166.5 (126)/166.5 (10), cua:0ms 58 (16)/58 (2.5) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 12/40 | 267.7 | 464.2 | 467.5 | 286.4 | clean | reach (pinned mean 132.2 px): cua 40/40 (shortest 146, mean 146.5), cua:0ms 6/40 (shortest 0, mean 55.4); load: pinned 40/40 (mean 132.2), cua 40/40 (mean 146.5, shortest 146), cua:0ms 12/40 (mean 55.4, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 55 (52.5)/0 (0), newest 17 (16)/0 (0), cua 36 (21.5)/0 (0), cua:0ms 2 (1.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 38/40 | 330 | 461.4 | 467.3 | 470.6 | clean | load: pinned 40/40 (mean 50.5), cua 40/40 (mean 50.6, shortest 50), cua:0ms 38/40 (mean 49.3, shortest 36, Fisher p 0.247); received, coalesced samples (events), raw/moves, median: pinned 225 (190)/225 (21), newest 50 (49.5)/50 (8), cua 175 (128)/175 (14), cua:0ms 103 (37)/103 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 266.2 | 468.1 | 464.9 | 282.2 | clean | reach (pinned mean 134.6 px): cua 40/40 (shortest 143, mean 145.7), cua:0ms 40/40 (shortest 144, mean 145.4); load: pinned 40/40 (mean 134.6), cua 40/40 (mean 145.7, shortest 143), cua:0ms 40/40 (mean 145.4, shortest 144); received, coalesced samples (events), raw/moves, median: pinned 59.5 (53)/0 (0), newest 17 (16.5)/0 (0), cua 56 (38)/0 (0), cua:0ms 32.5 (23)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:0ms); chrome scroller (cua:0ms); electron range (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9419 requests, 2121 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

