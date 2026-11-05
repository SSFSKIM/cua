# linux-engine-diff summary

## t60fix-device-dnd (development run, not a release gate)

commit –; cua-engine 0.3.0 (397b21913d20); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 a941fc3258620382f13c212d3064c7b46fca60519d1561f1b42a6b01e510de91, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (397b21913d20); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 29.5 | 26.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 28.1 | 26.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 7.4 | 5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-22.21, -19.255]; warm faster [-23.46, -18.25]) |
| desktop | list_windows | **bar** | 28.1 | 26.6 | | | | | | | | | |
| desktop | list_apps | pinned | 30.6 | 24.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 31.4 | 23.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 9.8 | 7.4 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-23.89, -19.48]; warm faster [-18.46, -14.83]) |
| desktop | list_apps | **bar** | 30.6 | 23.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 36.8 | 30.3 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 35.6 | 29.1 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 36.6 | 26.9 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 36.62 against 35.57, within the newest build's spread [32.42, 54.81]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm same (within noise) [-4.1, 1.15]) |
| desktop | get_screenshot | **bar** | 35.6 | 29.1 | | | | | | | | | |
| desktop | launch_app | pinned | 3.6 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.8 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.7 | 1 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.585, 0.405]; warm within the bound [0.28, 0.49]) |
| desktop | launch_app | **bar** | 3.6 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.3 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 330.6 | 323.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 364.7 | 368 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 183.4 | 191 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 449.8 | 451.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 379.2 | 366.7 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 443.7 | 395 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 329.5 | 329.6 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 185.9 | 188.7 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 188.7 | 187.4 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 255.6 | 254 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 453 | 450 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 256.3 | 253.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1 | 0.65 | pinned | [0.28, 0.49] | 1 |

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

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 684 samples, against the run's cap of 1% (6.84).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-05T13:20:04.146Z

desktop: started with no window active, ended with 0x01200002 active (harness), neither acted on; holder none; the harness's own trace: 18846 requests, 5153 changes of a window, every one of its own; the run's record: 41002 requests of the harness's and the engines' clients, 26311 changes of a window, every one of its own

