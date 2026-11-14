# linux-engine-diff summary

## repro-collision (development run, not a release gate)

commit 1773390c64af2e43c6dc3f65eef7c8da807a9842; cua-engine 0.3.0 (e6ed649f9d91); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 858f75ab4b1fa994bf4d58b87010ca466b2b2d95cf229c8a2d2f697d2a8b679c, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (e6ed649f9d91); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | press_key | pinned | 272 | 268.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | newest | 239.5 | 235.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | press_key | cua | 105.7 | 101.3 | 20 | – | – | – | 40/40 | clean | 0/40 | 40/40 | FAIL: cua: the effect was not verified on 40 samples (0/0, 0/1, 0/2, 0/3, 0/4) (cold faster [-134.255, -133.175]; warm faster [-134.41, -134.095]) |
| gedit | press_key | **bar** | 239.5 | 235.6 | | | | | | | | | |
| minimized | minimized_press_key | cua | 0.2 | 0.3 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 129 samples, against the run's cap of 1% (1.29).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: gedit press_key cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T12:50:34.513Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0140000e; the harness's own trace: 4065 requests, 110 changes of a window, every one of its own

