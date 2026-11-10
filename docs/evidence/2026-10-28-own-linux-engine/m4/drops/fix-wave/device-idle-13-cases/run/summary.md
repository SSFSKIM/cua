# linux-engine-diff summary

## t69-device-idle (development run, not a release gate)

commit –; cua-engine 0.3.0 (bba041594132); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 d53aa03fd03e942e42c2572d9c243494e0945a8771f658216892b5ae9a2ac067, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (bba041594132); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 65.7 | 49.9 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 72.1 | 57.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6.4 | 3.1 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-66.47, -54.27]; warm faster [-52.98, -44.52]) |
| desktop | list_windows | **bar** | 65.7 | 49.9 | | | | | | | | | |
| desktop | list_apps | pinned | 72.2 | 53.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 66.8 | 58.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 7.4 | 5.3 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-67.925, -52.99]; warm faster [-53.06, -44.55]) |
| desktop | list_apps | **bar** | 66.8 | 53.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 38 | 29.2 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 39.3 | 30 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 38.6 | 27.9 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 38.63 against 38.03, within the pinned build's spread [31.76, 59.68]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm faster [-2.93, -0.6]) |
| desktop | get_screenshot | **bar** | 38 | 29.2 | | | | | | | | | |
| desktop | launch_app | pinned | 4.6 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.8 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.7 | 1.2 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.725, 0.585]; warm within the bound [0.14, 0.67]) |
| desktop | launch_app | **bar** | 3.8 | 0.8 | | | | | | | | | |
| desktop | capabilities | cua | 3.2 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 346.4 | 328 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 367.5 | 380.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 161.8 | 160.3 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 444.3 | 441.8 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 407.1 | 402.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 437.5 | 382.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 344.4 | 331.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 161.4 | 160.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 162.1 | 158.3 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 256.5 | 254.4 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 439.7 | 437.9 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 257.1 | 254.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | cua | 412.5 | 394.2 | 6 | – | – | – | 9/9 | clean | 0/9 | – | PASS |

Chrome's drops, confirmed or reported. A landed drop reported unconfirmed is honest, and a finding only above 5% of the run's landed drops. A false ok (answered ok with no drop and nothing pending) fails its case:

| scene | op | samples | landed | answered ok | false ok | landed, reported unconfirmed |
|---|---|---:|---:|---:|---:|---:|
| device-chrome-dnd | chrome_dnd_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | 9 | 9 | 9 | 0 | 0 |
| device-chrome-dnd | chrome_dnd_inzone_out_in_front_shared | 9 | 0 | 9 | 0 | 0 |
| **run** | | 54 | 45 | 54 | 0 | 0 |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.2 | 0.8 | newest | [0.14, 0.67] | 1 |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 693 samples, against the run's cap of 1% (6.93).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T16:15:23.998Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 20223 requests, 5324 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

