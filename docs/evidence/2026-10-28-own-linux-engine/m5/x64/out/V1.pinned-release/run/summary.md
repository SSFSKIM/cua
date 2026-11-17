# linux-engine-diff summary

## pinned-V1 (acceptance on the pinned release)

commit fefe306c288956a48b6c086017f3cd1a58462a07; cua-engine 0.4.0 (c55c8e08d9cb); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| gedit | type_text | pinned | 10207.2 | 10204 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text | newest | 836 | 844.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text | cua | 69.5 | 60.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-778.945, -761.78]; warm faster [-795.645, -775.475]) |
| gedit | type_text | **bar** | 836 | 844.6 | | | | | | | | | |
| gedit | type_text_selection | pinned | 10207.4 | 10203.8 | 20 | – | – | – | 40/40 | clean | – | 0/40 |  |
| gedit | type_text_selection | newest | 847.8 | 843.7 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | type_text_selection | cua | 68.9 | 61.8 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-785.59, -771.9]; warm faster [-790.8, -773.24]) |
| gedit | type_text_selection | **bar** | 847.8 | 843.7 | | | | | | | | | |
| gedit | type_text_dedicated | cua | 78.8 | 70.2 | 15 | – | – | – | 18/18 | clean | 18/18 | – | PASS |
| gedit | type_text_dedicated | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_read | pinned | 519.1 | 478.4 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | newest | 506.4 | 499.2 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 |  |
| gedit | clipboard_read | cua | 37.1 | 29.6 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 | PASS (cold faster [-499.305, -447.765]; warm faster [-461.69, -437.375]) |
| gedit | clipboard_read | **bar** | 506.4 | 478.4 | | | | | | | | | |
| gedit | clipboard_write | pinned | 10202.8 | 10202.7 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | newest | 10202.8 | 10202.6 | 20 | – | – | – | 40/40 | clean | – | 40/40 |  |
| gedit | clipboard_write | cua | 68.1 | 60.5 | 20 | – | – | – | 40/40 | clean | 40/40 | 40/40 (40 declared) | PASS (declared: clipboard_write) |
| gedit | clipboard_write | **bar** | – | – | | | | | | | | | |
| gedit | clipboard_release | pinned | 3 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | newest | 3.1 | 0.1 | 30 | – | – | – | 50/50 | clean | – | 50/50 |  |
| gedit | clipboard_release | cua | 2.3 | 0.2 | 30 | – | – | – | 50/50 | clean | – | 50/50 | PASS (cold faster [-1.235, -0.35]; warm within the bound [0.07, 0.145]) |
| gedit | clipboard_release | **bar** | 3 | 0.1 | | | | | | | | | |

Within the bound (passes that are a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| scene | op | candidate | series | cua ms | bar ms | against | cua − bar, 95% interval | bound |
|---|---|---|---|---:|---:|---|---|---:|
| gedit | clipboard_release | cua | warm | 0.24 | 0.13 | newest | [0.07, 0.145] | 1 |

Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua's request must take and the routes it reported (a sample whose route differs fails its witness), the witness's allowance for the foreground route, and the text calls of each engine's bus pass:

| scene | op | engine | clipboard kept | expected route | routes | foreground allowed | PasteText / InsertText / SetTextContents |
|---|---|---|---|---|---|---|---|
| gedit | type_text | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_selection | pinned | 40/40 | – | – | – | 1 / 0 / 0 |
| gedit | type_text_selection | newest | 40/40 | – | – | – | 0 / 0 / 0 |
| gedit | type_text_selection | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | type_text_dedicated | cua | 18/18 | background | background | – | 0 / 0 / 0 |
| gedit | clipboard_write | pinned | 0/40 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | newest | 0/40 | – | – | – | 1 / 0 / 0 |
| gedit | clipboard_write | cua | 40/40 | background | background | – | 0 / 0 / 0 |
| gedit | clipboard_read | pinned | – | – | – | – | 0 / 1 / 0 |
| gedit | clipboard_read | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_read | cua | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | pinned | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | newest | – | – | – | – | 0 / 0 / 0 |
| gedit | clipboard_release | cua | – | – | – | – | 0 / 0 / 0 |

Paste safety cases (cua alone; safety.mjs):

| scene | case | trial | verdict | answer | ms | detail |
|---|---|---:|---|---|---:|---|
| gedit | caret_placed | 0 | PASS | success | 79 | route background |

The cases' bus trace (164 calls of 16 connections): PasteText 0, InsertText 0, SetTextContents 0.

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 648 samples, against the run's cap of 1% (6.48).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 43, newest 0, cua 0:

- gedit type_text_selection pinned 0/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 0/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 1/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 1/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/1 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/2 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/3 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/4 (warm): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned 2/5 (warm): found ' diffe', put back 'cua171'
- gedit clipboard_read pinned 2/0 (cold): found ' diffe', put back 'cua171'
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
- gedit clipboard_read pinned topup-0-0/0 (cold): found ' diffe', put back 'cua171'
- gedit type_text_selection pinned audit/1: found ' diffe', put back 'cua171'
- gedit clipboard_read pinned audit/0: found ' diffe', put back 'cua171'
- gedit clipboard_read pinned bus/0: found ' diffe', put back 'cua171'

Text windows a lane ended (a vendor's restarted before its next request, never scored; a candidate's stops the run): pinned 0, newest 0, cua 0.

run valid; acceptance on the pinned release: every verdict PASS; text restores (the first word put back before a sample): pinned 43, newest 0, cua 0; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0, finished 2026-11-17T00:30:13.603Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 14884 requests, 12301 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

