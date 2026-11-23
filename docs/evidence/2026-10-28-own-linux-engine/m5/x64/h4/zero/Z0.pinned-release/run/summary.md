# linux-engine-diff summary

## pinned-Z0 (experiment drag; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 329.2 | 123.6 | 32.4 | 469.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 194 (194)/194 (20), newest 47 (47)/47 (8), cua 117 (117)/117 (6), cua:0ms 31 (31)/31 (3) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 28/30 | 30/30 | 30/30 | 2/30 | 363.4 | 213.6 | 95.8 | 629.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 9 (9)/3 (2), newest 6 (6)/2 (1), cua 30 (30)/8.5 (2), cua:0ms 2 (2)/1 (1) | cua PASS, cua:0ms **FAIL** |
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 308.6 | 19.6 | 18.5 | 376.7 | clean | – | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 6659 requests, 1453 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

