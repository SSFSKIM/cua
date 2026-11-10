# linux-engine-diff summary

## t69-pilot-device3 (development run, not a release gate)

commit –; cua-engine 0.3.0 (c1859f5a34ca); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8cec622aba5b9f521688f805caba4be0101af67404bac4cfb2daac91d0b29261, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (c1859f5a34ca); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 163.9 | 159.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 407.7 | 82.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_real_in_front_shared | cua | 256.6 | 255.4 | 6 | – | – | – | 9/9 | clean | – | – | FAIL: no late take came: nothing showed the notice |
| device-chrome-dnd | chrome_dnd_late_take_real_covered_dedicated | cua | 272.4 | 271.9 | 6 | – | – | – | 9/9 | clean | – | – | FAIL: no late take came: nothing showed the notice |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_take_real_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_real_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 36 samples, against the run's cap of 1% (0.36).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: device-chrome-dnd chrome_dnd_late_take_real_in_front_shared cua, device-chrome-dnd chrome_dnd_late_take_real_covered_dedicated cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T06:21:30.045Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 5402 requests, 620 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

