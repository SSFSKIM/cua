# linux-engine-diff summary

## pinned-D5 (experiment drag; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 30/30 | 30/30 | 30/30 | 30/30 | 295.3 | 4.8 | 4.8 | 344.9 | clean | – | cua PASS, cua:0ms PASS |
| xterm | select | 30/30 | 30/30 | 30/30 | 30/30 | 276.2 | 4 | 4 | 307.5 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 30/30 | 30/30 | 30/30 | 30/30 | 276.1 | 3.9 | 3.9 | 308.1 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/30 | 0/30 | 0/30 | 0/30 | 312.2 | – | – | 496.8 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 30/30 | 30/30 | 30/30 | 30/30 | 301.4 | 6.1 | 6 | 359.8 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gen, X11 only) | select | 30/30 | 30/30 | 30/30 | 30/30 | 293.9 | 4.7 | 4.6 | 343.7 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 12046 requests, 2463 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

