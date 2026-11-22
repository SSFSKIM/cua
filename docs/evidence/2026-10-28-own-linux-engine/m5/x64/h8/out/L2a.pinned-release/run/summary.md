# linux-engine-diff summary

## pinned-L2a (experiment drag; acceptance on the pinned release)

candidate: sha256 f1513e79f4efdb3dd950e108fec05ce59b090926907a3071ee65ca3899d4921f, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.3 (ba5b043834ce); the pin's x64 asset of linux-engine-v0.4.3; native/linux-engine as at ba5b043834ce8239936743ec8de395deca15bd43, the checkout at 048140a2bde0f6398cc910c1aa14ecf2e7e51004; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44966356899/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44964231636/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 40/40 | 40/40 | 40/40 | 24/40 | 330.1 | 458.2 | 460.8 | 481.4 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 24/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 188 (174)/188 (17), newest 49 (47)/49 (8), cua 133 (92)/133 (8), cua:0ms 10 (4)/10 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 40/40 | 39/40 | 40/40 | 40/40 | 345.5 | 381 | 383.5 | 542.2 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 9 (8)/9 (2), newest 4 (4)/4 (1), cua 6.5 (4)/7 (1), cua:0ms 15 (6.5)/15 (1) | cua PASS, cua:0ms PASS |
| Chrome | canvas | 40/40 | 26/40 | 40/40 | 13/40 | 524.2 | 485.7 | 461.8 | 1176.8 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:0ms 13/40 (mean –, shortest –, Fisher p 0.000); received, coalesced samples (events), raw/moves, median: pinned 703 (662.5)/703 (59), newest 191.5 (184)/191.5 (19), cua 621 (472)/621 (29), cua:0ms 414 (221.5)/414 (14.5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 9328 requests, 1905 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

