# linux-engine-diff summary

## t74w3-b-control-1 (development run, not a release gate)

commit –; cua-engine 0.3.0 (83dd7e5bfedb); occlusion covered; 15 blocks; 7 warm tree reads and 2 warm inputs per block

candidate: sha256 0239447e9d53762d6699d8f39b6bf02e8ac717eb76834e33d62772fe76ae1f66, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (83dd7e5bfedb); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); no X request audit in this run

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome-address-bar | type_text | pinned | 1041.5 | 1038.5 | 30 | – | – | – | 52/52 | – | 52/52 | 52/52 |  |
| chrome-address-bar | type_text | newest | 1002.4 | 1031.9 | 30 | – | – | – | 52/52 | – | 52/52 | 52/52 |  |
| chrome-address-bar | type_text | cua | 89.9 | 82.3 | 30 | – | – | – | 52/52 | – | 50/50 | 50/52 | FAIL: cua: a request failed; cua: the output differs from the vendor's (cold faster [-938.025, -898.58]; warm faster [-974.13, -907.48]) |
| chrome-address-bar | type_text | **bar** | 1002.4 | 1031.9 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 423.8 | 415.8 | 30 | – | – | – | 50/50 | – | – | 50/50 |  |
| gnome-text-editor | type_text | newest | 833.8 | 833 | 30 | – | – | – | 50/50 | – | – | 0/50 |  |
| gnome-text-editor | type_text | cua | 86.6 | 62.9 | 30 | – | – | – | 50/50 | – | 50/50 | 50/50 (50 declared) | PASS (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| chrome-address-bar | type_text | pinned | 52/52 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | newest | 52/52 | – | – | – | 0 / 0 / 0 |
| chrome-address-bar | type_text | cua | 52/52 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 50/50 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 50/50 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 50/50 | foreground | foreground | stacking, focus, active | 0 / 0 / 0 |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 306 samples, against the run's cap of 1% (3.06).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: chrome-address-bar type_text cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-12T11:36:33.956Z

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 8924 requests, 6837 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

