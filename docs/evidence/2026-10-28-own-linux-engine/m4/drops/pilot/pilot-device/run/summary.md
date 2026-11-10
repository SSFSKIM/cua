# linux-engine-diff summary

## t69-pilot-device (development run, not a release gate)

commit –; cua-engine 0.3.0 (3f9cab4e154e); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 763066d4e4c2cc8726739ae55d6356bd92079269da2120d9b207eeb891a792de, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (3f9cab4e154e); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 405.2 | 405.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_real_in_front_shared | cua | 405.4 | 59.9 | 6 | – | – | – | 0/9 | clean | – | – | FAIL: a drop under way at the release answered other than as it landed on 2 of 9 samples (0/2, 2/0); no late take came: nothing showed the notice; the witness changed on 9 of 9 samples (0/0, 0/1, 0/2) |
| device-chrome-dnd | chrome_dnd_late_take_real_covered_dedicated | cua | 297.2 | 349.5 | 6 | – | – | – | 9/9 | clean | – | – | FAIL: a drop under way at the release answered other than as it landed on 3 of 9 samples (0/1, 1/0, 1/2); no late take came: nothing showed the notice |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_take_real_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_real_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 27 samples, against the run's cap of 1% (0.27).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: device-chrome-dnd chrome_dnd_late_take_real_in_front_shared cua, device-chrome-dnd chrome_dnd_late_take_real_covered_dedicated cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T04:32:39.309Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 3960 requests, 453 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

