# linux-engine-diff summary

## m5-pinned-dev-D4-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GTK3 gedit | select | 2/2 | 2/2 | 2/2 | 2/2 | 302.5 | 5.1 | 5 | 361.9 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 307.4 | 4.9 | 4.8 | 368.4 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 2/2 | 2/2 | 2/2 | 2/2 | 312.4 | 8.5 | 9.1 | 494.6 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/2 | 0/2 | 0/2 | 0/2 | 309.5 | – | – | 385.2 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 2/2 | 2/2 | 2/2 | 2/2 | 291.6 | 6.5 | 6.6 | 340.1 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 304.6 | 7.2 | 7.1 | 366.7 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 2/2 | 2/2 | 2/2 | 2/2 | 287.4 | 10.2 | 10.3 | 330.8 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 305.5 | 12.9 | 13.9 | 368.9 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2069 requests, 391 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

