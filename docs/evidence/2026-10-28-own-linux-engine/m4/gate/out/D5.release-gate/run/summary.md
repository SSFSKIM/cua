# linux-engine-diff summary

## m4-gate-D5 (experiment drag; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 305.9 | 18.3 | 18 | 376 | clean | – | cua PASS, cua:0ms PASS |
| xterm | select | 30/30 | 30/30 | 30/30 | 30/30 | 285.5 | 15.8 | 14.2 | 323.8 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 30/30 | 30/30 | 30/30 | 30/30 | 284.1 | 12.4 | 15 | 324.4 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/30 | 0/30 | 0/30 | 0/30 | 328 | – | – | 553.4 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 30/30 | 30/30 | 30/30 | 30/30 | 313.5 | 19 | 20.5 | 384.5 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gen, X11 only) | select | 30/30 | 30/30 | 30/30 | 30/30 | 306.3 | 15.9 | 16.6 | 374.3 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11929 requests, 2463 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

