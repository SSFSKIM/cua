# linux-engine-diff summary

## pinned-E1 (experiment events; acceptance on the pinned release)

candidate: sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42, aarch64-unknown-linux-musl static, cua-engine 0.4.0 (c55c8e08d9cb); the pin's arm64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at f6275fb600ae719f29cf32b206676e1a70a02e26; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

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
| an interrupted drag under a held key, then a move | differs at step 1 (event) | same | – |
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

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 20 interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at 20 samples an engine is sampled to 40, where its outcome is final, and a group decided at 20 keeps that verdict):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 60 | 85.18 | 84.25 | 76.99 | [-7.285, -7.215] | faster |
| desktop | click | first in a scenario | 3 | 85.61 | 84.85 | 77.12 | – | too few samples, not judged |
| desktop | click | later | 80 | 45.38 | 28.96 | 12.27 | [-16.695, -16.675] | faster |
| desktop | click | later in a scenario | 1 | 156.92 | 90.62 | 24.38 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 36.71 | 36.21 | 32.59 | [-3.625, -3.59] | faster |
| desktop | drag_handle | first in a scenario | 2 | 37.19 | 36.79 | 32.81 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 32.39 | 29.58 | 0.15 | [-29.43, -29.415] | faster |
| desktop | drag_handle | later in a scenario | 2 | 32.42 | 29.78 | 0.17 | – | too few samples, not judged |
| desktop | drag | first | 40 | 306.04 | 100.84 | 35.85 | [-65.025, -64.965] | faster |
| desktop | drag | first in a scenario | 2 | 307.65 | 101.54 | 36.39 | – | too few samples, not judged |
| desktop | drag | later | 40 | 309.81 | 105.35 | 39.77 | [-65.72, -65.555] | faster |
| desktop | key_down | first | 80 | 50.14 | 0.53 | 0.29 | [-0.25, -0.22] | faster |
| desktop | key_down | first in a scenario | 4 | 50.61 | 0.98 | 0.42 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 33.3 | 0.19 | 0.09 | [-0.1, -0.1] | faster |
| desktop | key_down | later in a scenario | 1 | 33.31 | 0.2 | 0.11 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.14 | 0.05 | 0.06 | [0.01, 0.01] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.12 | 0.05 | 0.07 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.33 | 0.58 | 0.23 | [-0.11, -0.07] | faster |
| desktop | move_relative | first in a scenario | 1 | 0.78 | 1.07 | 0.35 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.08 | 0.18 | 0.07 | [-0.02, 0] | same (within noise) |
| desktop | move_relative | later in a scenario | 2 | 33.27 | 16.78 | 0.11 | – | too few samples, not judged |
| desktop | move | first | 20 | 81.14 | 81.49 | 72.97 | [-8.21, -8.13] | faster |
| desktop | move | first in a scenario | 1 | 81.74 | 82.14 | 73.19 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.16 | 5.36 | 0.1 | [-5.275, -5.245] | faster |
| desktop | move | later in a scenario | 2 | 37.37 | 19.36 | 0.17 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 66.72 | 33.63 | 0.32 | [-33.32, -33.3] | faster |
| desktop | press_key | first in a scenario | 7 | 67.17 | 34.09 | 0.39 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 66.43 | 33.33 | 0.13 | [-33.21, -33.2] | faster |
| desktop | press_key | later in a scenario | 1 | 66.38 | 33.29 | 0.16 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 72.53 | 72.87 | 72.43 | [-0.135, -0.08] | faster |
| desktop | scroll | first in a scenario | 1 | 72.9 | 73.43 | 72.52 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 254.23 | 237.79 | 217.07 | [-20.79, -20.68] | faster |
| desktop | scroll | later in a scenario | 1 | 436.33 | 403.06 | 361.82 | – | too few samples, not judged |
| window | activate_window | first | 1 | 0.79 | 0.82 | 0.4 | – | too few samples, not judged |
| window | click | first | 7 | 213.69 | 214.24 | 13.09 | – | too few samples, not judged |
| window | click | later | 3 | 0.04 | 0.14 | 0.07 | – | too few samples, not judged |
| window | drag | first | 2 | 542.79 | 295.33 | 8.26 | – | too few samples, not judged |
| window | drag | later | 2 | 200.82 | 201 | 0.23 | – | too few samples, not judged |
| window | key_down | first | 10 | 234.46 | 201.42 | 0.97 | – | too few samples, not judged |
| window | key_down | later | 4 | 66.77 | 50.23 | 0.19 | – | too few samples, not judged |
| window | key_up | first | 1 | 0.67 | 0.61 | 0.39 | – | too few samples, not judged |
| window | key_up | later | 13 | 133.43 | 100.35 | 0.13 | – | too few samples, not judged |
| window | launch_app | first | 1 | 0.87 | 0.91 | 0.7 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.13 | 0.16 | 0.23 | – | too few samples, not judged |
| window | move | first | 2 | 201.4 | 201.74 | 0.96 | – | too few samples, not judged |
| window | move | later | 2 | 183.75 | 167.53 | 0.3 | – | too few samples, not judged |
| window | press_key | first | 33 | 333.96 | 234.79 | 1.01 | [-233.83, -233.75] | faster |
| window | press_key | later | 3 | 166.61 | 133.5 | 0.25 | – | too few samples, not judged |
| window | scroll | first | 3 | 237.7 | 238.19 | 37.14 | – | too few samples, not judged |
| window | scroll | later | 6 | 200.83 | 200.95 | 0.22 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 201.75 | 0.96 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 499.01 | 0.45 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.06 | 0.05 | [0.01, 0.01] |

