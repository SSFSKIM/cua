# linux-engine-diff summary

## t49-chrome (development run, not a release gate)

commit 297f8c20736f2ec1ef53c2ac55b58fa7719fe4c0; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 1 blocks; 3 warm tree reads and 2 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 97.4 | 89 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | newest | 98.6 | 84.6 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_windows | cua | 8 | 5.9 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-93.415, -80.655]; warm faster [-88.04, -74.98]) |
| desktop | list_windows | **bar** | 97.4 | 84.6 | | | | | | | | | |
| desktop | list_apps | pinned | 101.5 | 84 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 100.3 | 83.5 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 9.6 | 7 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-96.08, -78.175]; warm faster [-80.24, -74.48]) |
| desktop | list_apps | **bar** | 100.3 | 83.5 | | | | | | | | | |
| desktop | get_screenshot | pinned | 35.5 | 27.5 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | newest | 37 | 27.9 | 21 | – | – | – | – | – | – | 61/61 |  |
| desktop | get_screenshot | cua | 32.2 | 24.3 | 21 | – | – | – | – | – | – | 61/61 | PASS (cold same (within noise) [-6.17, 0.495]; warm faster [-4.41, -2.02]) |
| desktop | get_screenshot | **bar** | 35.5 | 27.5 | | | | | | | | | |
| desktop | launch_app | pinned | 3.4 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | newest | 3.7 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 |  |
| desktop | launch_app | cua | 2.6 | 0.7 | 21 | – | – | – | – | – | 41/41 | 41/41 | PASS (cold faster [-1.165, -0.61]; warm same (within noise) [-0.06, 0.07]) |
| desktop | launch_app | **bar** | 3.4 | 0.7 | | | | | | | | | |
| desktop | capabilities | cua | 2.9 | 0.2 | 3 | – | – | – | – | – | – | – | PASS |
| chrome | tree | pinned | 479.8 | 459.3 | 21 | 2234 / 2234 | 2234 / 2234 | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree | newest | 462.9 | 448.8 | 21 | 2234 / 2234 | 2234 / 2234 | – | 41/41 | clean | – | 37/41 |  |
| chrome | tree | cua | 61.3 | 56.3 | 21 | 2234 / 2233 | 26 / 22 | 0 | 41/41 | clean | – | 37/41 | FAIL: cua: the output differs from the vendor's (cold faster [-449.27, -349.86]; warm faster [-446.83, -367.3]) |
| chrome | tree | **bar** | 462.9 | 448.8 | | | | | | | | | |
| chrome | tree_shot | pinned | 574.9 | 593.1 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | newest | 587.8 | 597.3 | 21 | – | – | – | 41/41 | clean | – | 41/41 |  |
| chrome | tree_shot | cua | 111.9 | 96.5 | 21 | – | – | 0 | 41/41 | clean | – | 41/41 | PASS (cold faster [-510.715, -429.795]; warm faster [-513.22, -487.76]) |
| chrome | tree_shot | **bar** | 574.9 | 593.1 | | | | | | | | | |
| chrome | press_key | pinned | 272.8 | 269 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | newest | 239.8 | 236 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | press_key | cua | 105.3 | 101.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-134.86, -134.135]; warm faster [-134.91, -134.35]) |
| chrome | press_key | **bar** | 239.8 | 236 | | | | | | | | | |
| chrome | click | pinned | 218.2 | 215 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | newest | 219.9 | 215.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| chrome | click | cua | 117.7 | 113.9 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-101.01, -100.22]; warm faster [-101.35, -100.845]) |
| chrome | click | **bar** | 218.2 | 215 | | | | | | | | | |
| chrome-textarea | type_text | pinned | 946.9 | 953.6 | 20 | – | – | – | 40/40 | **not traced** | 36/40 | 40/40 |  |
| chrome-textarea | type_text | newest | 992.2 | 2400.6 | 20 | – | – | – | 40/40 | **not traced** | 1/1 | 1/40 |  |
| chrome-textarea | type_text | cua | 167.1 | 162.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-826.79, -757.53]; warm faster [-810.17, -774.13]) |
| chrome-textarea | type_text | **bar** | 946.9 | 953.6 | | | | | | | | | |
| identity | identity_apart | cua | 65.3 | 63.5 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity | identity_stacked | cua | 11.2 | 10.7 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_stacked_self_active | cua | 11.2 | 11.3 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_stacked_other_active | cua | 17.2 | 16.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_apart_shot | cua | 107.5 | 97.2 | 3 | – | – | 0 | 4/4 | clean | – | – | PASS |
| identity | identity_click_element | cua | 16.2 | 10.7 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_secondary_action | cua | 13.9 | 10.5 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_type_text | cua | 12.8 | 13.2 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_clipboard_read | cua | 16.5 | 10.9 | 3 | – | – | – | 4/4 | clean | – | – | PASS |
| identity | identity_key_up | cua | 101.1 | 100.7 | 3 | – | – | – | 4/4 | clean | – | – | PASS |

Output differences (first sample against the pinned build's):
- chrome tree cua: nodes 243 vs 243, first difference {"position":113,"field":"description","a":"\"You\""}

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 61/61 | 0 | 0 |  |
| desktop | newest | 61/61 | 28 | 0.0079 |  |
| desktop | cua | 61/61 | 28 | 0.0079 |  |
| chrome | pinned | 41/41 | 0 | 0 |  |
| chrome | newest | 41/41 | 0 | 0 |  |
| chrome | cua | 41/41 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| chrome | press_key | cua | – | – | background | – | – |
| chrome | click | cua | – | – | background | – | – |
| chrome-textarea | type_text | pinned | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| chrome-textarea | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| identity | identity_type_text | cua | – | – | background | – | – |
| identity | identity_key_up | cua | – | – | background | – | – |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| chrome-textarea | focus_change | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 158.06503397226334 |  |
| chrome-textarea | focus_change | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 152.1928589940071 |  |
| chrome-textarea | focus_change | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 148.61349999904633 |  |
| chrome-textarea | focus_change_takeover | 0 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 148.9404640197754 | retake after 0 ms |
| chrome-textarea | focus_change_takeover | 1 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 147.2703310251236 | retake after 20 ms |
| chrome-textarea | focus_change_takeover | 2 | PASS | `requested field or selection changed before dispatch; nothing was sent` | 148.22477799654007 | retake after 50 ms |
| chrome-textarea | silent_owner | 0 | PASS | `clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; not` | 651 | next request 171 ms |
| chrome-textarea | concurrent | 0 | PASS | success, success | 230,195 |  |
| chrome-textarea | concurrent | 1 | PASS | success, success | 200,168 |  |
| chrome-textarea | concurrent | 2 | PASS | success, success | 169,202 |  |
| chrome-textarea | contention | 0 | PASS | 40 pastes | 166 | max 190 ms |
| chrome-textarea | late_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2152 | next request 7 ms |
| chrome-textarea | ignored_page | 0 | PASS | `Paste was sent once and could not be confirmed; read the field before retrying` | 2160 | next request 8 ms |

The cases' bus trace (22531 calls of 142 connections): PasteText 0, InsertText 0, SetTextContents 0.

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- chrome cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 1202 samples, against the run's cap of 1% (12.02).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: chrome tree cua, a window the harness did not open was changed: pinned on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02400000, a window the harness did not open was changed: pinned on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02600000, a window the harness did not open was changed: pinned on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02400000, a window the harness did not open was changed: newest on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02400000, a window the harness did not open was changed: newest on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02600000, a window the harness did not open was changed: newest on chrome-textarea type_text: SKY_CLIPBOARD_STOP ClientMessage on 0x02400000; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-03T08:59:52.622Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 5987 requests, 3202 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

