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
| desktop | click | first | 6 | 85.07 | 84.16 | 76.93 | – | too few samples, not judged |
| desktop | click | first in a scenario | 3 | 85.62 | 84.8 | 77.15 | – | too few samples, not judged |
| desktop | click | later | 8 | 45.39 | 28.94 | 12.26 | – | too few samples, not judged |
| desktop | click | later in a scenario | 1 | 156.78 | 90.62 | 24.38 | – | too few samples, not judged |
| desktop | drag_handle | first | 4 | 36.65 | 36.12 | 32.57 | – | too few samples, not judged |
| desktop | drag_handle | first in a scenario | 2 | 37.15 | 36.73 | 32.75 | – | too few samples, not judged |
| desktop | drag_handle | later | 8 | 32.37 | 29.55 | 0.21 | – | too few samples, not judged |
| desktop | drag_handle | later in a scenario | 2 | 32.39 | 29.51 | 0.17 | – | too few samples, not judged |
| desktop | drag | first | 4 | 306.04 | 100.84 | 36.33 | – | too few samples, not judged |
| desktop | drag | first in a scenario | 2 | 307.09 | 101.58 | 37.17 | – | too few samples, not judged |
| desktop | drag | later | 4 | 309.89 | 105.39 | 40.24 | – | too few samples, not judged |
| desktop | key_down | first | 8 | 50.11 | 0.48 | 0.26 | – | too few samples, not judged |
| desktop | key_down | first in a scenario | 4 | 50.53 | 0.96 | 0.43 | – | too few samples, not judged |
| desktop | key_down | later | 10 | 33.28 | 0.19 | 0.1 | – | too few samples, not judged |
| desktop | key_down | later in a scenario | 1 | 33.27 | 0.19 | 0.11 | – | too few samples, not judged |
| desktop | key_up | later | 8 | 33.12 | 0.05 | 0.07 | – | too few samples, not judged |
| desktop | key_up | later in a scenario | 5 | 33.12 | 0.05 | 0.08 | – | too few samples, not judged |
| desktop | move_relative | first | 2 | 0.27 | 0.51 | 0.21 | – | too few samples, not judged |
| desktop | move_relative | first in a scenario | 1 | 0.79 | 1.11 | 0.38 | – | too few samples, not judged |
| desktop | move_relative | later | 6 | 0.07 | 0.26 | 0.06 | – | too few samples, not judged |
| desktop | move_relative | later in a scenario | 2 | 33.25 | 16.77 | 0.1 | – | too few samples, not judged |
| desktop | move | first | 2 | 81.05 | 81.39 | 72.91 | – | too few samples, not judged |
| desktop | move | first in a scenario | 1 | 81.58 | 82.09 | 72.98 | – | too few samples, not judged |
| desktop | move | later | 6 | 8.16 | 5.34 | 0.11 | – | too few samples, not judged |
| desktop | move | later in a scenario | 2 | 37.31 | 19.36 | 0.15 | – | too few samples, not judged |
| desktop | press_key | first | 14 | 66.67 | 33.6 | 0.29 | – | too few samples, not judged |
| desktop | press_key | first in a scenario | 7 | 67.19 | 34.02 | 0.43 | – | too few samples, not judged |
| desktop | press_key | later | 16 | 66.39 | 33.32 | 0.14 | – | too few samples, not judged |
| desktop | press_key | later in a scenario | 1 | 66.39 | 33.29 | 0.13 | – | too few samples, not judged |
| desktop | scroll | first | 2 | 72.49 | 72.75 | 72.35 | – | too few samples, not judged |
| desktop | scroll | first in a scenario | 1 | 72.91 | 73.42 | 72.55 | – | too few samples, not judged |
| desktop | scroll | later | 4 | 254.12 | 237.64 | 216.93 | – | too few samples, not judged |
| desktop | scroll | later in a scenario | 1 | 436.04 | 403.15 | 361.74 | – | too few samples, not judged |
| window | activate_window | first | 1 | 0.76 | 0.79 | 0.4 | – | too few samples, not judged |
| window | click | first | 7 | 213.6 | 214.13 | 13.15 | – | too few samples, not judged |
| window | click | later | 5 | 112.37 | 112.52 | 12.38 | – | too few samples, not judged |
| window | drag | first | 2 | 543.31 | 295.52 | 8.24 | – | too few samples, not judged |
| window | drag | later | 3 | 200.77 | 200.7 | 0.3 | – | too few samples, not judged |
| window | key_down | first | 12 | 234.44 | 201.39 | 0.97 | – | too few samples, not judged |
| window | key_down | later | 4 | 66.74 | 50.21 | 0.14 | – | too few samples, not judged |
| window | key_up | first | 1 | 0.66 | 0.61 | 0.36 | – | too few samples, not judged |
| window | key_up | later | 15 | 133.4 | 100.34 | 0.13 | – | too few samples, not judged |
| window | launch_app | first | 1 | 0.76 | 0.8 | 0.63 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.13 | 0.12 | 0.21 | – | too few samples, not judged |
| window | move | first | 2 | 201.43 | 201.67 | 1 | – | too few samples, not judged |
| window | move | later | 4 | 100.28 | 100.63 | 0.21 | – | too few samples, not judged |
| window | press_key | first | 33 | 333.86 | 234.73 | 1.01 | [-233.79, -233.66] | faster |
| window | press_key | later | 3 | 166.54 | 133.47 | 0.21 | – | too few samples, not judged |
| window | scroll | first | 3 | 237.51 | 238.12 | 37.1 | – | too few samples, not judged |
| window | scroll | later | 6 | 200.84 | 200.81 | 0.3 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 201.62 | 0.95 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 498.7 | 0.48 | – | too few samples, not judged |

Unjudged in this pilot (no top-up; not passes): desktop press_key first; desktop press_key later; desktop key_down first; desktop key_down later; desktop key_up later; desktop click first; desktop click later; desktop move first; desktop move later; desktop move_relative first; desktop move_relative later; desktop scroll first; desktop scroll later; desktop drag first; desktop drag later; desktop drag_handle first; desktop drag_handle later.

