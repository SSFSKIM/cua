# linux-engine-diff summary

## pinned-K2 (acceptance on the pinned release)

commit 4fffcdd314f892f5cbffe9df893cb65b09de0b09; cua-engine 0.4.2 (9371d2348cf8); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (9371d2348cf8); the pin's x64 asset of linux-engine-v0.4.2; native/linux-engine as at 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da, the checkout at 4fffcdd314f892f5cbffe9df893cb65b09de0b09; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44796908527/attempts/1, built from 9371d2348cf84eab35ed4fa8f99cf3bacc40c6da (refs/heads/release/linux-engine-v0.4.2) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 420.6 | 414.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 460 | 456.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| **run** | | 9 | 9 | 9 | 0 | 0 |

The hold canary (device.mjs `holdCanary`): each cell's ping waits in ms. A draggable cell passes on a press that started a drag and read slow by the engine's own 20 ms (`absolute`), or waited 3x the plain control's warm largest and 5 ms at least (`relative`, x64's K1 and K2):

| scene | op | kind | criterion | held | started | largest wait | median wait | plain largest | bar |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | draggable | relative | 9 | 9 | 16.3 | 9.7 | 1.2 | 5 |
| device-chrome-dnd | chrome_select_nudged_shared | plain | – | 9 | – | 1.2 | – | – | – |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 18 samples, against the run's cap of 1% (0.18).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-20T20:16:56.437Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 6590 requests, 3724 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

