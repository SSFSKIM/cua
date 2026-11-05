# linux-engine-diff summary

## t22-base1

commit –; cua-engine 0.3.0 (unknown); occlusion covered; 10 blocks; 7 warm tree reads and 5 warm inputs per block

negative check: the witness failed the activating stub (stacking, active, focus); no X request audit in this run

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 659.9 | 661.3 | 20 | – | – | – | 30/30 | – | 30/30 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 469.1 | 470.9 | 20 | – | – | – | 30/30 | – | 28/30 | – | FAIL: the effect was not verified on 2 of 30 samples (2/2, 8/0) |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |

run valid; **FAIL**: device-chrome-dnd chrome_dnd_short_in_front_shared cua, finished 2026-11-01T13:21:26.782Z

