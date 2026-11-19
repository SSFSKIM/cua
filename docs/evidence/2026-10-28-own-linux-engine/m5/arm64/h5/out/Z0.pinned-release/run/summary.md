# linux-engine-diff summary

## pinned-Z0 (experiment drag; acceptance on the pinned release)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 7d554dea958a9c9a0b7a6c254365945cf1f18cd4; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 313 | 119.7 | 8.7 | 419.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 176 (176)/176 (14.5), newest 41 (41)/41 (7), cua 124.5 (124.5)/124.5 (5), cua:0ms 4 (4)/4 (1) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 329.5 | 137.7 | 10.1 | 483.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 16 (16)/3 (2), newest 12 (12)/3 (2), cua 2 (2)/1 (1), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms **FAIL** |
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 294.8 | 5.1 | 5 | 345.2 | clean | – | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 6700 requests, 1453 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

