# linux-engine-diff summary

## pinned-E1 (experiment events; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

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
| desktop | click | first | 60 | 87.28 | 86.85 | 79.08 | [-8.535, -7.19] | faster |
| desktop | click | first in a scenario | 3 | 87.67 | 88.02 | 79.22 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.28 | 30.15 | 13.01 | [-17.265, -16.95] | faster |
| desktop | click | later in a scenario | 1 | 158.35 | 92.29 | 25.23 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.78 | 37.59 | 34.1 | [-3.86, -3.405] | faster |
| desktop | drag_handle | first in a scenario | 2 | 38.25 | 38.21 | 33.82 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.23 | 30.29 | 0.57 | [-29.755, -29.635] | faster |
| desktop | drag_handle | later in a scenario | 2 | 32.98 | 30.03 | 0.53 | – | too few samples, not judged |
| desktop | drag | first | 40 | 327.7 | 107.16 | 43.7 | [-63.8, -62.32] | faster |
| desktop | drag | first in a scenario | 2 | 330.73 | 108.98 | 45.78 | – | too few samples, not judged |
| desktop | drag | later | 40 | 330.38 | 111.68 | 47.85 | [-64.395, -63.125] | faster |
| desktop | key_down | first | 80 | 51.82 | 1.5 | 0.79 | [-0.875, -0.595] | faster |
| desktop | key_down | first in a scenario | 4 | 51.77 | 2.03 | 0.83 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.11 | 0.66 | 0.32 | [-0.38, -0.29] | faster |
| desktop | key_down | later in a scenario | 1 | 34.08 | 0.75 | 0.27 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.55 | 0.19 | 0.24 | [0.025, 0.08] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.41 | 0.14 | 0.18 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.86 | 1.62 | 0.67 | [-0.37, -0.075] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.7 | 2.27 | 0.72 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.31 | 0.75 | 0.29 | [-0.095, 0.03] | same (within noise) |
| desktop | move_relative | later in a scenario | 2 | 33.95 | 17.52 | 0.42 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.03 | 84.06 | 74.92 | [-8.49, -7.62] | faster |
| desktop | move | first in a scenario | 1 | 84.44 | 85.69 | 76.46 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.61 | 6.13 | 0.47 | [-5.805, -5.505] | faster |
| desktop | move | later in a scenario | 2 | 38.48 | 20.11 | 0.68 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.42 | 34.79 | 0.83 | [-34.035, -33.87] | faster |
| desktop | press_key | first in a scenario | 7 | 68.63 | 35.37 | 0.85 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.76 | 34.25 | 0.49 | [-33.815, -33.71] | faster |
| desktop | press_key | later in a scenario | 1 | 67.11 | 33.81 | 0.31 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.54 | 74.52 | 73.46 | [-0.29, 0.095] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 74.43 | 77.13 | 73.52 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.47 | 240.25 | 219.16 | [-21.395, -20.92] | faster |
| desktop | scroll | later in a scenario | 1 | 440.41 | 409.34 | 367.22 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.55 | 1.98 | 0.87 | – | too few samples, not judged |
| window | click | first | 7 | 216.07 | 217.39 | 14.62 | – | too few samples, not judged |
| window | click | later | 5 | 113.33 | 113.64 | 13.02 | – | too few samples, not judged |
| window | drag | first | 2 | 614.07 | 313.24 | 44.66 | – | too few samples, not judged |
| window | drag | later | 3 | 201.98 | 202.12 | 1.05 | – | too few samples, not judged |
| window | key_down | first | 12 | 237.61 | 203.34 | 2.5 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.3 | 50.57 | 0.45 | – | too few samples, not judged |
| window | key_up | first | 1 | 2.08 | 1.76 | 1.17 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.08 | 100.88 | 0.48 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.82 | 1.5 | 1.11 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.27 | 0.26 | 0.42 | – | too few samples, not judged |
| window | move | first | 2 | 204.01 | 204.56 | 3.21 | – | too few samples, not judged |
| window | move | later | 4 | 100.84 | 101.99 | 0.77 | – | too few samples, not judged |
| window | press_key | first | 33 | 337.11 | 238.13 | 3.71 | [-235.88, -233.79] | faster |
| window | press_key | later | 3 | 167.67 | 134.29 | 0.61 | – | too few samples, not judged |
| window | scroll | first | 3 | 240.9 | 244.93 | 38.86 | – | too few samples, not judged |
| window | scroll | later | 6 | 203.31 | 202.9 | 0.82 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.28 | 2.68 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 501.9 | 1.37 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.24 | 0.19 | [0.025, 0.08] |

