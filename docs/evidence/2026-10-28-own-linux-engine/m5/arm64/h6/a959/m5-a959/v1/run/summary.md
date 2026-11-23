# linux-engine-diff summary

## dev-a959v-v1 (development run, not a release gate)

commit da2deeb2fda47733e53eca9918646e15775f1d57; cua-engine 0.4.2 (9371d2348cf8); occlusion covered; 12 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f, aarch64-unknown-linux-musl static, cua-engine 0.4.2 (9371d2348cf8); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | pinned | 1880.5 | 1250.1 | 24 | – | – | – | 36/36 | clean | 0/36 | 0/36 |  |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | newest | 565.4 | 560.2 | 24 | – | – | – | 36/36 | clean | 0/36 | 0/36 |  |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 740.4 | 1008.4 | 24 | – | – | – | 36/36 | clean | 0/36 | 0/36 | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 36 | 0 | 36 | 0 | 0 |
| **run** | | 36 | 0 | 36 | 0 | 0 |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | – | background | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 108 samples, against the run's cap of 1% (1.08).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-21T06:33:59.569Z

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13042 requests, 1760 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

