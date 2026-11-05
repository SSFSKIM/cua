# linux-engine-diff summary

## t60-speed (development run, not a release gate)

commit –; cua-engine 0.3.0 (5570d064e6f6); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 fe9ccb35e8d61a31289be1849d2724ddd744d5311e845d17ab1eeac3805eed4f, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (5570d064e6f6); attestation not checked (a development run)

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

foreground checks: the allowance failed another window raised and the top one raised back; failed the same two raises under one server grab (2 restack events, 0 property changes read); passed the target raised; failed the focus and the active window switched to another window and back under one server grab (2 FocusIn events); passed the target activated

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | type_text | pinned | 10207.5 | 10204.5 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 847.8 | 855.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 77.2 | 68 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-783.81, -748.845]; warm faster [-812.185, -771.685]) |
| gedit | type_text | **bar** | 847.8 | 855.4 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10207.9 | 10204.6 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 858.4 | 855.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 75.4 | 70 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-814.87, -767.995]; warm faster [-825.81, -768.25]) |
| gedit | type_text_selection | **bar** | 858.4 | 855.9 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10202.7 | 10202.9 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | newest | 10202.8 | 10203.3 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | cua | 74.1 | 75.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| chrome-textarea | type_text | pinned | 931.8 | 927.6 | 20 | – | – | – | 40/40 | clean | 38/40 | 40/40 |  |
| chrome-textarea | type_text | newest | 992 | 2373.2 | 20 | – | – | – | 40/40 | clean | 1/1 | 1/40 |  |
| chrome-textarea | type_text | cua | 78.1 | 67.3 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-877.245, -831.84]; warm faster [-871.665, -841.5]) |
| chrome-textarea | type_text | **bar** | 931.8 | 927.6 | | | | | | | | | |
| gnome-text-editor | type_text | pinned | 399 | 372.8 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gnome-text-editor | type_text | newest | 819.4 | 809.2 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gnome-text-editor | type_text | cua | 85.2 | 78.7 | 20 | – | – | – | 39/40 | clean | 40/40 | 40/40 (40 declared) | FAIL: cua: the witness changed (declared: type_text) |
| gnome-text-editor | type_text | **bar** | – | – | | | | | | | | | |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | type_text | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_selection | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text_selection | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text_selection | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | clipboard_write | pinned | 0/40 | – | – | – | 1 / 1 / 0 |
| gedit | clipboard_write | newest | 0/40 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| chrome-textarea | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gnome-text-editor | type_text | cua | 40/40 | foreground | foreground | stacking, active, focus | 0 / 0 / 0 |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 600 samples, against the run's cap of 1% (6).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 43, newest 0, cua 0:

- gedit type_text_selection pinned 0/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_write pinned 0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_write pinned 1/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_write pinned 2/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-0/5 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-1/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-2/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-3/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-4/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-5/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-6/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-7/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-8/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-9/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-10/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-11/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-12/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-13/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-14/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-15/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned topup-0-16/0 (cold): found ' diffe', put back 'cua171'
- gedit clipboard_write pinned topup-0-0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned audit/1: found ' diffe', put back 'cua171'
- gedit clipboard_write pinned audit/0: found ' diffe', put back 'cua171'
- gedit clipboard_write pinned bus/0: found ' diffe', put back 'cua171'

run valid; development run, not a release gate: **FAIL**: gnome-text-editor type_text cua; text restores (the first word put back before a sample): pinned 43, newest 0, cua 0, finished 2026-11-05T10:16:21.589Z

desktop: started with no window active, ended with 0x01a00002 active (harness), neither acted on; holder none; the harness's own trace: 19605 requests, 17239 changes of a window, every one of its own; the run's record: 64179 requests of the harness's and the engines' clients, 55903 changes of a window, every one of its own

