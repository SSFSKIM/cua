# linux-engine-diff summary

## dev-p459-audit-a (development run, not a release gate)

commit 69bd7993e1f1cb252574939bd6e8e80674bab5b8; cua-engine 0.4.2 (3d3e20d1ab66); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 d2ad2a43c67fbb5614f8b8c58c28367367d666dc54a544ca4a75e0e039f7dddc, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.2 (3d3e20d1ab66); attestation not checked (a development run)

variants: `cua:keepalive` = `--drag-dnd-release-sync keepalive`; `cua:ping` = `--drag-dnd-release-sync ping`

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 406.7 | 403.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | FAIL: the hold canary is untested: 0 of 9 presses on a draggable source held for their take, fewer than 3 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua:keepalive | 418.4 | 415.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – |  |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua:ping | 409.8 | 407.3 | 6 | – | – | – | 9/9 | clean | 9/9 | – |  |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| **run** | | 9 | 9 | 9 | 0 | 0 |

The hold canary (device.mjs `holdCanary`): each cell's ping waits in ms. A draggable cell passes on a press that started a drag and read slow by the engine's own 20 ms (`absolute`), or waited 3x the plain control's warm largest and 5 ms at least (`relative`, x64's K1, K2 and V5):

| scene | op | kind | criterion | held | started | largest wait | median wait | plain largest | bar |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | draggable | absolute | 0 | 0 | – | – | – | 20 |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua:keepalive | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua:ping | – | background | background | stacking | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 27 samples, against the run's cap of 1% (0.27).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0, cua:keepalive 0, cua:ping 0.

run valid; development run, not a release gate: **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, cua:keepalive 0, cua:ping 0, finished 2026-11-21T07:10:41.667Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 4609 requests, 545 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

