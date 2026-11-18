# linux-engine-diff summary

## pdev-V2 (development run on the pinned release, not acceptance, never counted)

commit da306cc6319e7e9da282812402308c074b872dee; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_windows | pinned | 37.7 | 35.2 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | list_windows | newest | 37.2 | 33.7 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | list_windows | cua | 7.4 | 5 | 7 | – | – | – | – | – | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 7.35 ms against the bar 37.15 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 5.04 ms against the bar 33.72 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| desktop | list_windows | **bar** | 37.2 | 33.7 | | | | | | | | | |
| desktop | list_apps | pinned | 38.8 | 35.1 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | list_apps | newest | 36.7 | 33.4 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | list_apps | cua | 8.3 | 5.9 | 7 | – | – | – | – | – | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 8.3 ms against the bar 36.7 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 5.9 ms against the bar 33.44 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| desktop | list_apps | **bar** | 36.7 | 33.4 | | | | | | | | | |
| desktop | get_screenshot | pinned | 16.1 | 12.5 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | get_screenshot | newest | 15.5 | 12.4 | 7 | – | – | – | – | – | – | 8/8 |  |
| desktop | get_screenshot | cua | 13.8 | 9.1 | 7 | – | – | – | – | – | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 13.77 ms against the bar 15.51 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 9.1 ms against the bar 12.39 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| desktop | get_screenshot | **bar** | 15.5 | 12.4 | | | | | | | | | |
| desktop | launch_app | pinned | 2.5 | 0.4 | 7 | – | – | – | – | – | 8/8 | 8/8 |  |
| desktop | launch_app | newest | 2.6 | 0.4 | 7 | – | – | – | – | – | 8/8 | 8/8 |  |
| desktop | launch_app | cua | 2.4 | 0.7 | 7 | – | – | – | – | – | 8/8 | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 2.44 ms against the bar 2.45 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.65 ms against the bar 0.4 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| desktop | launch_app | **bar** | 2.5 | 0.4 | | | | | | | | | |
| desktop | capabilities | cua | 2 | 0.1 | 7 | – | – | – | – | – | – | – | PASS |
| gedit | tree | pinned | 192 | 188.5 | 7 | 3141 / 3141 | 3141 / 3141 | – | 8/8 | clean | – | 8/8 |  |
| gedit | tree | newest | 186.9 | 182.7 | 7 | 3141 / 3141 | 3141 / 3141 | – | 8/8 | clean | – | 8/8 |  |
| gedit | tree | cua | 50.8 | 48.3 | 7 | 3141 / 3140 | 64 / 71 | 0 | 8/8 | clean | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 50.79 ms against the bar 186.88 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 48.31 ms against the bar 182.66 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| gedit | tree | **bar** | 186.9 | 182.7 | | | | | | | | | |
| gedit | tree_shot | pinned | 300.7 | 297 | 7 | – | – | – | 8/8 | clean | – | 8/8 |  |
| gedit | tree_shot | newest | 298.3 | 297.4 | 7 | – | – | – | 8/8 | clean | – | 8/8 |  |
| gedit | tree_shot | cua | 72.2 | 56.6 | 7 | – | – | 0 | 8/8 | clean | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 72.24 ms against the bar 298.34 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 56.56 ms against the bar 297.03 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| gedit | tree_shot | **bar** | 298.3 | 297 | | | | | | | | | |
| gedit | press_key | pinned | 269.8 | 267.1 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| gedit | press_key | newest | 237 | 234 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| gedit | press_key | cua | 3.7 | 0.4 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 3.69 ms against the bar 236.95 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.44 ms against the bar 234.02 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| gedit | press_key | **bar** | 237 | 234 | | | | | | | | | |
| gedit | click | pinned | 215.8 | 213.1 | 5 | – | – | – | 6/6 | clean | – | 6/6 |  |
| gedit | click | newest | 216.4 | 213.3 | 5 | – | – | – | 6/6 | clean | – | 6/6 |  |
| gedit | click | cua | 16.2 | 12.6 | 5 | – | – | – | 6/6 | clean | – | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 16.17 ms against the bar 215.78 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 12.59 ms against the bar 213.05 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| gedit | click | **bar** | 215.8 | 213.1 | | | | | | | | | |
| gedit | type_characters | pinned | 2 | 0.1 | 5 | – | – | – | 6/6 | clean | – | 0/6 |  |
| gedit | type_characters | newest | 567.1 | 565 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| gedit | type_characters | cua | 3.4 | 0.7 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 3.36 ms against the bar 567.1 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.7 ms against the bar 565.02 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| gedit | type_characters | **bar** | 567.1 | 565 | | | | | | | | | |
| chrome | tree | pinned | 183.7 | 177.9 | 7 | 2226 / 2226 | 2226 / 2226 | – | 8/8 | clean | – | 8/8 |  |
| chrome | tree | newest | 179.7 | 176.4 | 7 | 2226 / 2226 | 2226 / 2226 | – | 8/8 | clean | – | 8/8 |  |
| chrome | tree | cua | 65.3 | 62.6 | 7 | 2226 / 2225 | 16 / 15 | 0 | 8/8 | clean | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 65.34 ms against the bar 179.67 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 62.58 ms against the bar 176.44 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| chrome | tree | **bar** | 179.7 | 176.4 | | | | | | | | | |
| chrome | tree_shot | pinned | 295.6 | 292 | 7 | – | – | – | 8/8 | clean | – | 8/8 |  |
| chrome | tree_shot | newest | 296.6 | 289.5 | 7 | – | – | – | 8/8 | clean | – | 8/8 |  |
| chrome | tree_shot | cua | 90.4 | 72.4 | 7 | – | – | 0 | 8/8 | clean | – | 8/8 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 90.44 ms against the bar 295.57 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 72.41 ms against the bar 289.49 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians |
| chrome | tree_shot | **bar** | 295.6 | 289.5 | | | | | | | | | |
| chrome | press_key | pinned | 270.9 | 267.3 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome | press_key | newest | 237 | 234.3 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome | press_key | cua | 3.2 | 0.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 3.16 ms against the bar 236.97 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 0.45 ms against the bar 234.3 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome | press_key | **bar** | 237 | 234.3 | | | | | | | | | |
| chrome | click | pinned | 216.1 | 213.2 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome | click | newest | 216.6 | 213.5 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 |  |
| chrome | click | cua | 15.3 | 12.7 | 5 | – | – | – | 6/6 | clean | 6/6 | 6/6 | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 15.31 ms against the bar 216.08 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 12.68 ms against the bar 213.16 ms, undetermined: 5 samples a side, fewer than 20; not judged on medians |
| chrome | click | **bar** | 216.1 | 213.2 | | | | | | | | | |
| over-budget | tree | pinned | 2941.1 | 2965.4 | 7 | 45038 / 45038 | 45038 / 45038 | – | 8/8 | clean | – | 8/8 |  |
| over-budget | tree | newest | 2960 | 2959.7 | 7 | 45038 / 45038 | 45038 / 45038 | – | 8/8 | clean | – | 8/8 |  |
| over-budget | tree | cua | 1222.7 | 1217.9 | 7 | 45209 / 45208 | 17 / 16 | 182 | 8/8 | clean | – | 8/8 (8 declared) | **unjudged** (a pilot takes no top-up), not a pass: cua: cold 1222.72 ms against the bar 2941.08 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians; cua: warm 1217.94 ms against the bar 2959.65 ms, undetermined: 7 samples a side, fewer than 20; not judged on medians (declared: tree) |
| over-budget | tree | **bar** | 2941.1 | 2959.7 | | | | | | | | | |

Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):

| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |
|---|---|---|---:|---:|---|
| desktop | pinned | 8/8 | 0 | 0 |  |
| desktop | newest | 8/8 | 28 | 0.0073 |  |
| desktop | cua | 8/8 | 28 | 0.0073 |  |
| gedit | pinned | 8/8 | 0 | 0 |  |
| gedit | newest | 8/8 | 0 | 0 |  |
| gedit | cua | 8/8 | 0 | 0 |  |
| chrome | pinned | 8/8 | 0 | 0 |  |
| chrome | newest | 8/8 | 0 | 0 |  |
| chrome | cua | 8/8 | 0 | 0 |  |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | press_key | cua | – | – | background | – | – |
| gedit | click | cua | – | – | background | – | – |
| gedit | type_characters | cua | – | background | background | – | 0 / 0 / 0 |
| chrome | press_key | cua | – | – | background | – | – |
| chrome | click | cua | – | – | background | – | – |
| gedit | type_characters | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | type_characters | newest | – | – | – | – | 0 / 0 / 0 |

Over-budget retained native ids:
- cua: equal to the pinned build's

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- gedit cua: within
- chrome cua: within
- over-budget cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 314 samples, against the run's cap of 1% (3.14).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

Text windows a lane ended (a vendor's restarted before its next request, never scored; a candidate's stops the run): pinned 0, newest 0, cua 0.

run valid; development run on the pinned release, not acceptance, never counted: no verdict FAIL; **unjudged** (a pilot takes no top-up; not a pass): desktop list_windows cua, desktop list_apps cua, desktop get_screenshot cua, desktop launch_app cua, gedit tree cua, gedit tree_shot cua, gedit press_key cua, gedit click cua, gedit type_characters cua, chrome tree cua, chrome tree_shot cua, chrome press_key cua, chrome click cua, over-budget tree cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-18T04:49:29.087Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 768 requests, 151 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

