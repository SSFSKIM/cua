# linux-engine-diff summary

## task50-step0-xtools (development run, not a release gate)

commit d778a092cafa3e9efa65978ff8768697c7d9768a; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | tree | pinned | 548.6 | 580 | 21 | 3089 / 3089 | 3089 / 3089 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | newest | 546.2 | 539.7 | 21 | 3089 / 3089 | 3089 / 3089 | – | 41/41 | clean | – | 41/41 |  |
| gedit | tree | cua | 89.4 | 81.4 | 21 | 3089 / 3088 | 77 / 88 | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-472.42, -428.04]; warm faster [-506.93, -429.87]) |
| gedit | tree | **bar** | 546.2 | 539.7 | | | | | | | | | |
| gedit | press_key | pinned | 273.4 | 269.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 240.3 | 236.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 106.6 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.54, -133.455]; warm faster [-135.345, -134.79]) |
| gedit | press_key | **bar** | 240.3 | 236.3 | | | | | | | | | |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 243 samples, against the run's cap of 1% (2.43).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-03T13:40:52.992Z

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x0140000c; the harness's own trace: 294 requests, 49 changes of a window, every one of its own; the run's record: 2033 requests of the harness's and the engines' clients, 1510 changes of a window, every one of its own

