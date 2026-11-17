# linux-engine-diff summary

## m4-gate-Z0 (experiment drag; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 328.8 | 122.2 | 32.7 | 459.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 194.5 (194.5)/194.5 (20), newest 45 (45)/45 (8), cua 114.5 (114.5)/114.5 (6), cua:0ms 29 (29)/29 (3) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 29/30 | 30/30 | 30/30 | 0/30 | 361.8 | 205.5 | 92.1 | 627.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 9 (9)/3 (2), newest 6 (6)/2 (1), cua 26 (26)/5.5 (2), cua:0ms 3 (3)/1 (1) | cua PASS, cua:0ms **FAIL** |
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 307.2 | 18.2 | 17.4 | 368.5 | clean | – | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 6664 requests, 1453 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

