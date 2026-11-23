# linux-engine-diff summary

## m5-pinned-dev-D5-pilot (experiment drag; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 2/2 | 2/2 | 2/2 | 2/2 | 295.4 | 4.7 | 4.7 | 345.1 | clean | – | cua PASS, cua:0ms PASS |
| xterm | select | 2/2 | 2/2 | 2/2 | 2/2 | 275.9 | 3.9 | 3.8 | 307.4 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 2/2 | 2/2 | 2/2 | 2/2 | 276.1 | 3.7 | 4 | 307.2 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/2 | 0/2 | 0/2 | 0/2 | 312 | – | – | 496 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 2/2 | 2/2 | 2/2 | 2/2 | 301.1 | 5.5 | 5.6 | 359 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gen, X11 only) | select | 2/2 | 2/2 | 2/2 | 2/2 | 293.3 | 5 | 4.6 | 342.6 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2780 requests, 351 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

