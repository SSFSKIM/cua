# linux-engine-diff summary

## t69-device-idle (development run, not a release gate)

commit –; cua-engine 0.3.0 (bba041594132); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 d53aa03fd03e942e42c2572d9c243494e0945a8771f658216892b5ae9a2ac067, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (bba041594132); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, focus, active); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 69.5 | 60 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 67.8 | 56.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 7.1 | 3.6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-72.135, -54.06]; warm faster [-59.15, -46.1]) |
| desktop | list_windows | **bar** | 67.8 | 56.9 | | | | | | | | | |
| desktop | list_apps | pinned | 64 | 62.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 64.9 | 62.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 7.5 | 6 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-64.855, -50.12]; warm faster [-80.93, -44.98]) |
| desktop | list_apps | **bar** | 64 | 62.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.5 | 28.8 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 40.3 | 30.8 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 41.4 | 27.6 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 41.43 against 39.45, within the pinned build's spread [32.34, 59.3]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm same (within noise) [-1.89, 0.6]) |
| desktop | get_screenshot | **bar** | 39.5 | 28.8 | | | | | | | | | |
| desktop | launch_app | pinned | 4.2 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 4.3 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.4 | 1.3 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-2.16, 0.065]; warm within the bound [0.44, 0.79]) |
| desktop | launch_app | **bar** | 4.2 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.8 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 344.1 | 328 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 371.1 | 377.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 164.6 | 160.5 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 453.8 | 442.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 406.4 | 402.6 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 435.8 | 382 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 341.8 | 322.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 161.6 | 159.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 161 | 158.9 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 257.7 | 254.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 444.5 | 441.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 257 | 254.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 379.1 | 393.5 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | 392 | 378.9 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| **run** | | 63 | 45 | 63 | 0 | 0 |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.3 | 0.72 | pinned | [0.44, 0.79] | 1 |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 152 | 0.0191 |  |
| desktop | cua | 61/61 | 152 | 0.0191 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| device-chrome-dnd | chrome_dnd_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | – | background | background | stacking | – |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | – | foreground | foreground | stacking, active, focus, pointer | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | – | – | background | – | – |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | – | foreground | foreground | stacking, pointer | – |
| device-chrome-dnd | chrome_select_nudged_shared | cua | – | – | background | pointer | – |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | – | background | background | – | – |
| device-chrome-dnd | chrome_dnd_long_left_in_front_shared | cua | – | background | background | – | – |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 702 samples, against the run's cap of 1% (7.02).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T17:04:31.722Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 21629 requests, 5491 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

