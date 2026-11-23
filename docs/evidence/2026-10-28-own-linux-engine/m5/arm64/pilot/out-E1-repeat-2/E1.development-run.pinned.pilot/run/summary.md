# linux-engine-diff summary

## m5-pinned-dev-E1-pilot (experiment events; development run on the pinned release, not acceptance, never counted)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at da306cc6319e7e9da282812402308c074b872dee; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

Through the wire:

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| press_key a | same | same | – |
| press_key A | same | same | – |
| press_key z | same | same | – |
| press_key Z | same | same | – |
| press_key shift+z | same | same | – |
| press_key Shift+Z | same | same | – |
| press_key ctrl+z | same | same | – |
| press_key Ctrl+Z | same | same | – |
| press_key CTRL+z | same | same | – |
| press_key Ctrl+Shift+Z | same | same | – |
| press_key ctrl+shift+t | same | same | – |
| press_key Ctrl+Shift+T | same | same | – |
| press_key XK_Return | same | same | – |
| press_key Return | same | same | – |
| press_key alt+F5 | same | same | – |
| press_key Ctrl+Alt+Shift+A | same | same | – |
| press_key super+L | same | same | – |
| press_key ! | same | same | – |
| press_key @ | same | same | – |
| press_key shift+! | same | same | – |
| press_key !+@ | same | same | – |
| press_key ctrl++ | same | same | – |
| press_key + | same | same | – |
| press_key a+a | same | same | – |
| press_key < | same | same | – |
| press_key kp_enter | same | same | – |
| press_key f12 | same | same | – |
| press_key space | same | same | – |
| press_key Escape | same | same | – |
| press_key with duration | same | same | – |
| press_key bad key | same | same | – |
| press_key empty | same | same | – |
| held ctrl around press_key a | same | same | – |
| held Ctrl around press_key Shift+Z | same | same | – |
| two holds sharing ctrl | same | same | – |
| a repeated hold is one hold | same | same | – |
| key_up of nothing held | same | same | – |
| a hold is named by its normalized chord | same | same | – |
| order makes a different hold | same | same | – |
| held shift under a click chord | differs at step 1 (event) | same | – |
| bad keys in holds | same | same | – |
| holds left at exit are released with their state | same | same | – |
| held key across another window request | differs at step 1 (event) | same | – |
| type_characters mixed case, digits and shifted symbols | the reference | same | – |
| type_characters empty | the reference | same | – |
| type_characters refuses a character off the layout before typing anything | the reference | same but the declared answer (type_characters) | – |
| type_characters refuses a control character before typing anything | the reference | same but the declared answer (type_characters) | – |
| type_characters refuses a combining mark before typing anything | the reference | same but the declared answer (type_characters) | – |
| type_characters refuses a character beyond Latin-1 before typing anything | the reference | same but the declared answer (type_characters) | – |
| click | differs at step 0 (event) | same | – |
| click in the child | differs at step 0 (event) | same | – |
| right click | differs at step 0 (event) | same | – |
| middle double click held 0 | differs at step 0 (event) | same | – |
| click with a chord | differs at step 0 (event) | same | – |
| click outside the window | same | same | – |
| click validation | same | same | – |
| move | differs at step 0 (event) | same | – |
| scroll at the centre | differs at step 0 (event) | same | – |
| scroll at a point | differs at step 0 (event) | same | – |
| scroll validation | same | same | – |
| drag | differs at step 0 (event) | same | – |
| a bad chord on move, scroll and drag | differs at step 2 (event) | same | – |
| an interrupted drag under a held key, then a move | differs at step 1 (event) | differs at step 1 (answer) | – |
| an interrupted click under a held key, then a move | differs at step 1 (event) | same | – |
| a key hold whose window is destroyed | same but the declared answer (interrupted_hold) | same but the declared answer (interrupted_hold) | – |
| drag with a chord, and a short path | differs at step 0 (event) | same | – |
| desktop press_key a | same | same | – |
| desktop press_key Z | same | same | – |
| desktop press_key Ctrl+Z | same | same | – |
| desktop press_key ! | same | same | – |
| desktop press_key ctrl++ | same | same | – |
| desktop press_key a+a | same | same | – |
| desktop press_key bad key | same | same | – |
| desktop held ctrl around press_key a | same | same | – |
| desktop two holds sharing ctrl | same | same | – |
| desktop holds left at exit | same | same | – |
| desktop hold and a window hold are apart | same | same | – |
| desktop click | differs at step 0 (event) | same | – |
| desktop click in place | same | same | – |
| desktop click far | differs at step 0 (event) | same | – |
| desktop move | differs at step 0 (event) | same | – |
| desktop move_relative | same | same | – |
| desktop scroll | differs at step 1 (event) | same | – |
| desktop drag | differs at step 0 (event) | same | – |
| desktop drag short path | same | same | – |
| drag_handle | differs at step 0 (event) | same | – |
| drag_handle stray end | same | same | – |
| activate_window | same | same | – |
| launch_app | same | same | – |

The motion listener (`xprobe motion-watch`; each engine through xtrace): XTEST motions sent / motions the listener received, and of them those at the pointer's own position (sent / received):

| listener | engine | step | sent / received | at the pointer's own position |
|---|---|---|---|---|
| core | pinned | a move to the pointer | 1 / 1 | 1 / 1 |
| core | pinned | a 1 px move (the control) | 2 / 2 | 1 / 1 |
| core | pinned | a path | 11 / 11 | 1 / 1 |
| core | pinned | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| core | pinned | held, a 1 px move (the control) | 2 / 2 | 1 / 1 |
| core | pinned | held, a move to the pointer | 1 / 1 | 1 / 1 |
| core | pinned | released | 0 / 0 | 0 / 0 |
| core | newest | a move to the pointer | 1 / 1 | 1 / 1 |
| core | newest | a 1 px move (the control) | 1 / 1 | 0 / 0 |
| core | newest | a path | 10 / 10 | 0 / 0 |
| core | newest | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| core | newest | held, a 1 px move (the control) | 1 / 1 | 0 / 0 |
| core | newest | held, a move to the pointer | 1 / 1 | 1 / 1 |
| core | newest | released | 0 / 0 | 0 / 0 |
| core | cua | a move to the pointer | 1 / 1 | 1 / 1 |
| core | cua | a 1 px move (the control) | 2 / 2 | 1 / 1 |
| core | cua | a path | 11 / 11 | 1 / 1 |
| core | cua | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| core | cua | held, a 1 px move (the control) | 2 / 2 | 1 / 1 |
| core | cua | held, a move to the pointer | 1 / 1 | 1 / 1 |
| core | cua | released | 0 / 0 | 0 / 0 |
| xi2 | pinned | a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | pinned | a 1 px move (the control) | 2 / 2 | 1 / 1 |
| xi2 | pinned | a path | 11 / 11 | 1 / 1 |
| xi2 | pinned | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| xi2 | pinned | held, a 1 px move (the control) | 2 / 2 | 1 / 1 |
| xi2 | pinned | held, a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | pinned | released | 0 / 0 | 0 / 0 |
| xi2 | newest | a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | newest | a 1 px move (the control) | 1 / 1 | 0 / 0 |
| xi2 | newest | a path | 10 / 10 | 0 / 0 |
| xi2 | newest | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| xi2 | newest | held, a 1 px move (the control) | 1 / 1 | 0 / 0 |
| xi2 | newest | held, a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | newest | released | 0 / 0 | 0 / 0 |
| xi2 | cua | a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | cua | a 1 px move (the control) | 2 / 2 | 1 / 1 |
| xi2 | cua | a path | 11 / 11 | 1 / 1 |
| xi2 | cua | a handle pressed at the pointer | 2 / 2 | 2 / 2 |
| xi2 | cua | held, a 1 px move (the control) | 2 / 2 | 1 / 1 |
| xi2 | cua | held, a move to the pointer | 1 / 1 | 1 / 1 |
| xi2 | cua | released | 0 / 0 | 0 / 0 |

The listener received every control's 1 px move. Motions at the pointer's own position: 36 of 36 received.

cua differs from the pinned build; results.jsonl has each first difference.

Incomplete: Acceptance 3's desktop groups left unjudged (too few samples or none): press_key first, press_key later, key_down first, key_down later, key_up later, click first, click later, move first, move later, move_relative first, move_relative later, scroll first, scroll later, drag first, drag later, drag_handle first, drag_handle later.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 2 interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at 20 samples an engine is sampled to 40, where its outcome is final, and a group decided at 20 keeps that verdict):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 6 | 85.13 | 84.1 | 76.96 | – | too few samples, not judged |
| desktop | click | first in a scenario | 3 | 85.6 | 84.82 | 77.11 | – | too few samples, not judged |
| desktop | click | later | 8 | 45.35 | 28.9 | 12.23 | – | too few samples, not judged |
| desktop | click | later in a scenario | 1 | 156.78 | 90.61 | 24.37 | – | too few samples, not judged |
| desktop | drag_handle | first | 4 | 36.64 | 36.18 | 32.55 | – | too few samples, not judged |
| desktop | drag_handle | first in a scenario | 2 | 37.13 | 36.81 | 32.73 | – | too few samples, not judged |
| desktop | drag_handle | later | 8 | 32.35 | 29.55 | 0.16 | – | too few samples, not judged |
| desktop | drag_handle | later in a scenario | 2 | 32.38 | 29.53 | 0.22 | – | too few samples, not judged |
| desktop | drag | first | 4 | 306.53 | 100.84 | 36.4 | – | too few samples, not judged |
| desktop | drag | first in a scenario | 2 | 307.47 | 101.71 | 36.95 | – | too few samples, not judged |
| desktop | drag | later | 4 | 310.01 | 105.38 | 40.36 | – | too few samples, not judged |
| desktop | key_down | first | 8 | 50.08 | 0.46 | 0.27 | – | too few samples, not judged |
| desktop | key_down | first in a scenario | 4 | 50.55 | 0.96 | 0.41 | – | too few samples, not judged |
| desktop | key_down | later | 10 | 33.26 | 0.18 | 0.09 | – | too few samples, not judged |
| desktop | key_down | later in a scenario | 1 | 33.33 | 0.19 | 0.11 | – | too few samples, not judged |
| desktop | key_up | later | 8 | 33.11 | 0.05 | 0.06 | – | too few samples, not judged |
| desktop | key_up | later in a scenario | 5 | 33.11 | 0.05 | 0.09 | – | too few samples, not judged |
| desktop | move_relative | first | 2 | 0.28 | 0.54 | 0.19 | – | too few samples, not judged |
| desktop | move_relative | first in a scenario | 1 | 0.79 | 1.09 | 0.39 | – | too few samples, not judged |
| desktop | move_relative | later | 6 | 0.08 | 0.19 | 0.06 | – | too few samples, not judged |
| desktop | move_relative | later in a scenario | 2 | 33.27 | 16.74 | 0.11 | – | too few samples, not judged |
| desktop | move | first | 2 | 81.1 | 81.37 | 72.91 | – | too few samples, not judged |
| desktop | move | first in a scenario | 1 | 81.64 | 82.05 | 73.19 | – | too few samples, not judged |
| desktop | move | later | 6 | 8.15 | 5.33 | 0.12 | – | too few samples, not judged |
| desktop | move | later in a scenario | 2 | 37.32 | 19.35 | 0.19 | – | too few samples, not judged |
| desktop | press_key | first | 14 | 66.69 | 33.58 | 0.3 | – | too few samples, not judged |
| desktop | press_key | first in a scenario | 7 | 67.14 | 34.05 | 0.42 | – | too few samples, not judged |
| desktop | press_key | later | 16 | 66.37 | 33.3 | 0.12 | – | too few samples, not judged |
| desktop | press_key | later in a scenario | 1 | 66.36 | 33.29 | 0.17 | – | too few samples, not judged |
| desktop | scroll | first | 2 | 72.44 | 72.79 | 72.41 | – | too few samples, not judged |
| desktop | scroll | first in a scenario | 1 | 73 | 73.48 | 72.59 | – | too few samples, not judged |
| desktop | scroll | later | 4 | 254.14 | 237.67 | 216.95 | – | too few samples, not judged |
| desktop | scroll | later in a scenario | 1 | 436.19 | 403.02 | 361.96 | – | too few samples, not judged |
| window | activate_window | first | 1 | 0.75 | 0.86 | 0.42 | – | too few samples, not judged |
| window | click | first | 7 | 213.66 | 214.14 | 13.17 | – | too few samples, not judged |
| window | click | later | 5 | 112.45 | 112.57 | 12.31 | – | too few samples, not judged |
| window | drag | first | 2 | 542.59 | 295.83 | 8.1 | – | too few samples, not judged |
| window | drag | later | 3 | 200.66 | 200.73 | 0.29 | – | too few samples, not judged |
| window | key_down | first | 12 | 234.42 | 201.38 | 0.97 | – | too few samples, not judged |
| window | key_down | later | 4 | 66.75 | 50.21 | 0.14 | – | too few samples, not judged |
| window | key_up | first | 1 | 0.67 | 0.63 | 0.3 | – | too few samples, not judged |
| window | key_up | later | 15 | 133.4 | 100.35 | 0.1 | – | too few samples, not judged |
| window | launch_app | first | 1 | 0.82 | 0.79 | 0.66 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.16 | 0.13 | 0.26 | – | too few samples, not judged |
| window | move | first | 2 | 201.48 | 201.7 | 0.99 | – | too few samples, not judged |
| window | move | later | 4 | 100.29 | 100.66 | 0.2 | – | too few samples, not judged |
| window | press_key | first | 33 | 333.86 | 234.71 | 1.01 | [-233.76, -233.66] | faster |
| window | press_key | later | 3 | 166.51 | 133.49 | 0.21 | – | too few samples, not judged |
| window | scroll | first | 3 | 237.66 | 238.17 | 37.18 | – | too few samples, not judged |
| window | scroll | later | 6 | 200.82 | 200.79 | 0.21 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 201.61 | 1 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 498.78 | 0.53 | – | too few samples, not judged |

Unjudged in this pilot (no top-up; not passes): desktop press_key first; desktop press_key later; desktop key_down first; desktop key_down later; desktop key_up later; desktop click first; desktop click later; desktop move first; desktop move later; desktop move_relative first; desktop move_relative later; desktop scroll first; desktop scroll later; desktop drag first; desktop drag later; desktop drag_handle first; desktop drag_handle later.

