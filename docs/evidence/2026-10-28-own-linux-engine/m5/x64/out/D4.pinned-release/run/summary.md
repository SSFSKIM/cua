# linux-engine-diff summary

## pinned-D4 (experiment drag; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GTK3 gedit | select | 30/30 | 30/30 | 30/30 | 30/30 | 312.2 | 18.6 | 19.6 | 391.8 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 316.2 | 19 | 18.8 | 402.1 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 30/30 | 30/30 | 30/30 | 30/30 | 326.7 | 34.4 | 38.5 | 539.7 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/30 | 0/30 | 0/30 | 0/30 | 318.5 | – | – | 403.8 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 30/30 | 30/30 | 30/30 | 30/30 | 302.2 | 19.7 | 21 | 368.3 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 313.1 | 25.9 | 25.7 | 394.6 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 30/30 | 30/30 | 30/30 | 30/30 | 299.4 | 25.3 | 27.2 | 364.6 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 312.1 | 42.6 | 41.1 | 397.8 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 14389 requests, 3207 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

