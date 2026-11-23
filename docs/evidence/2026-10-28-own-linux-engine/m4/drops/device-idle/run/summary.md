# linux-engine-diff summary

## t69-device-idle (development run, not a release gate)

commit –; cua-engine 0.3.0 (3fcf2a88ad0d); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 4748c8500e9f0d065814bdce010322c8f96696f04a2200b72c626c692c0275d3, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (3fcf2a88ad0d); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 61.8 | 60.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 65.9 | 58.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 6 | 3.8 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-59.19, -51.22]; warm faster [-60.19, -48.24]) |
| desktop | list_windows | **bar** | 61.8 | 58.5 | | | | | | | | | |
| desktop | list_apps | pinned | 66.1 | 72.3 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 67.5 | 60.8 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 8.2 | 5.2 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-64.705, -54.165]; warm faster [-58.56, -49.3]) |
| desktop | list_apps | **bar** | 66.1 | 60.8 | | | | | | | | | |
| desktop | get_screenshot | pinned | 39.8 | 29.7 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 40.8 | 29.6 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 39.2 | 27 | 21 | – | – | – | – | – | – | 61/61 | **parity**, not a pass (cold 39.25 against 39.81, within the pinned build's spread [32.58, 61.03]; Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)) (warm faster [-4.44, -1.95]) |
| desktop | get_screenshot | **bar** | 39.8 | 29.6 | | | | | | | | | |
| desktop | launch_app | pinned | 3.6 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.7 | 0.8 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 3.2 | 1.2 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold same (within noise) [-0.785, 0.28]; warm within the bound [0.31, 0.75]) |
| desktop | launch_app | **bar** | 3.6 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.9 | 0.2 | 21 | – | – | – | – | – | – | – | PASS |
| device-chrome-dnd | chrome_dnd_shared | cua | 335.1 | 330 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_in_front_shared | cua | 373.2 | 374.5 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_late_shared | cua | 161.7 | 160.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_covered_dedicated | cua | 444.7 | 439 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_in_front_shared | cua | 405.3 | 389 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_short_covered_dedicated | cua | 435 | 388.2 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_shared | cua | 335.3 | 332.9 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_obscured_in_front_late_shared | cua | 165.9 | 160.5 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_late_take_shared | cua | 162.7 | 158.6 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_shared | cua | 256.8 | 254.5 | 6 | – | – | – | 9/9 | clean | – | – | PASS |
| device-chrome-dnd | chrome_dnd_short_pointer_outside_dedicated | cua | 435.9 | 441.4 | 6 | – | – | – | 9/9 | clean | 9/9 | – | PASS |
| device-chrome-dnd | chrome_select_nudged_shared | cua | 259 | 255.8 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| desktop | launch_app | cua | warm | 1.18 | 0.7 | pinned | [0.31, 0.75] | 1 |

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

run valid; development run, not a release gate: no verdict FAIL; **parity** (declared, not a pass): desktop get_screenshot cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-10T09:17:16.361Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 18784 requests, 5157 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

