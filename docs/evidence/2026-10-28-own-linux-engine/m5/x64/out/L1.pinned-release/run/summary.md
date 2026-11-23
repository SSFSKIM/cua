# linux-engine-diff summary

## pinned-L1 (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 20/40 | 329.9 | 145.7 | 30.6 | 518.1 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 20/40 (mean 37.7, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 224.5 (201)/224.5 (21.5), newest 53 (48.5)/53 (8), cua 175 (117)/175 (9), cua:0ms 32 (8)/32 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 1/40 | 267.3 | 64.6 | 10.3 | 285.5 | clean | reach (pinned mean 131.1 px): cua 40/40 (shortest 146, mean 146.3), cua:0ms 0/40 (shortest 0, mean 9); load: pinned 40/40 (mean 131.1), cua 40/40 (mean 146.3, shortest 146), cua:0ms 1/40 (mean 9, shortest 0, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 54 (47.5)/0 (0), newest 16 (15)/0 (0), cua 30 (21)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 40/40 | 330 | 263.3 | 261.5 | 501.2 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:0ms 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 194 (174)/194 (21.5), newest 51 (49)/51 (8), cua 155.5 (98)/155.5 (14), cua:0ms 95 (46)/95 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 40/40 | 40/40 | 266.5 | 258.9 | 261.2 | 283.7 | clean | reach (pinned mean 133.5 px): cua 40/40 (shortest 144, mean 145.9), cua:0ms 40/40 (shortest 143, mean 145.4); load: pinned 40/40 (mean 133.5), cua 40/40 (mean 145.9, shortest 144), cua:0ms 40/40 (mean 145.4, shortest 143); received, coalesced samples (events), raw/moves, median: pinned 58 (49.5)/0 (0), newest 17 (16)/0 (0), cua 50.5 (35.5)/0 (0), cua:0ms 33 (22)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:0ms); chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 9455 requests, 2121 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

