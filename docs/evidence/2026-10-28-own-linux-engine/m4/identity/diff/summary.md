# linux-engine-diff summary

## t5-fix-identity (development run, not a release gate)

commit 7fe5f226d0f68612dacc512f7d2cbfc55ff1a453; cua-engine 0.3.0 (7fe5f226d0f6); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 8ab6bb1ee2bec0c80687427524784691134cae1857f527ff7901146e093c4a4e, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7fe5f226d0f6); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| identity | identity_apart | cua | 113.9 | 97.9 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_stacked | cua | 25.5 | 19.2 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 20.5 | 22.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 24.7 | 21.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 140.2 | 128.8 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity | identity_click_element | cua | 36.8 | 18.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 20.4 | 27.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_type_text | cua | 49.9 | 23.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 24.3 | 24 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity | identity_key_up | cua | 100.7 | 100.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_apart | cua | 60.1 | 40.4 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 16.7 | 22.8 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 38.9 | 42 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_other_active | cua | 16.5 | 23.5 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_apart | cua | 32.9 | 23.3 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked | cua | 27.5 | 17.7 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_self_active | cua | 16.2 | 20.6 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk4 | identity_stacked_other_active | cua | 20.4 | 38.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-kate | identity_kate | cua | 157.9 | 163.4 | 6 | – | – | 0 | 9/9 | clean | – | – | PASS |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| identity | identity_type_text | cua | – | – | background | – | – |
| identity | identity_key_up | cua | – | – | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 225 samples, against the run's cap of 1% (2.25).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T19:32:45.577Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0220000e; the harness's own trace: 11838 requests, 3104 changes of a window, every one of its own; the run's record: 3390 requests of the harness's and the engines' clients, 3274 changes of a window, every one of its own

