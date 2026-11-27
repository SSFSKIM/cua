# linux-engine-diff summary

## m5-dev-E1 (experiment events; development run, not a release gate)

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
| desktop | click | first | 60 | 87.23 | 87.18 | 78.99 | [-8.58, -7.48] | faster |
| desktop | click | first in a scenario | 3 | 88.96 | 87.85 | 78.61 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.26 | 30.4 | 12.93 | [-17.54, -17.255] | faster |
| desktop | click | later in a scenario | 1 | 158.57 | 92.01 | 25.42 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.7 | 37.42 | 33.56 | [-3.95, -3.71] | faster |
| desktop | drag_handle | first in a scenario | 2 | 39.37 | 38.45 | 34.07 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 32.97 | 30.24 | 0.64 | [-29.685, -29.465] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.09 | 30.2 | 0.78 | – | too few samples, not judged |
| desktop | drag | first | 40 | 325.62 | 106.44 | 43.18 | [-64.235, -61.7] | faster |
| desktop | drag | first in a scenario | 2 | 338.4 | 111.19 | 52.8 | – | too few samples, not judged |
| desktop | drag | later | 40 | 329.86 | 111.04 | 48 | [-63.4, -62.53] | faster |
| desktop | key_down | first | 80 | 52.18 | 1.4 | 0.76 | [-0.795, -0.515] | faster |
| desktop | key_down | first in a scenario | 4 | 53.11 | 3.04 | 1.31 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.11 | 0.68 | 0.33 | [-0.415, -0.295] | faster |
| desktop | key_down | later in a scenario | 1 | 34.37 | 0.91 | 0.35 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.53 | 0.19 | 0.23 | [0.015, 0.08] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.51 | 0.22 | 0.25 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.82 | 1.69 | 0.63 | [-0.39, -0.105] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.41 | 2.36 | 0.76 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.3 | 0.85 | 0.23 | [-0.1, -0.015] | faster |
| desktop | move_relative | later in a scenario | 2 | 33.73 | 17.26 | 0.28 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.47 | 84.44 | 74.88 | [-9.025, -7.725] | faster |
| desktop | move | first in a scenario | 1 | 83.52 | 84.57 | 74.6 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.66 | 6.21 | 0.49 | [-5.825, -5.53] | faster |
| desktop | move | later in a scenario | 2 | 37.92 | 20.05 | 0.54 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.38 | 34.84 | 0.88 | [-34.01, -33.85] | faster |
| desktop | press_key | first in a scenario | 7 | 69.02 | 35.3 | 0.82 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.74 | 34.28 | 0.5 | [-33.825, -33.74] | faster |
| desktop | press_key | later in a scenario | 1 | 67.52 | 33.99 | 0.48 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.45 | 74.85 | 73.39 | [-0.29, 0.145] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 74.43 | 75.42 | 73.58 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.38 | 240.31 | 219.04 | [-21.565, -20.865] | faster |
| desktop | scroll | later in a scenario | 1 | 441.53 | 407.17 | 365.63 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.74 | 1.74 | 1.02 | – | too few samples, not judged |
| window | click | first | 7 | 215.88 | 217.45 | 14.96 | – | too few samples, not judged |
| window | click | later | 3 | 0.1 | 0.4 | 0.19 | – | too few samples, not judged |
| window | drag | first | 2 | 593.48 | 311.46 | 44.72 | – | too few samples, not judged |
| window | drag | later | 2 | 202.76 | 202.97 | 1.26 | – | too few samples, not judged |
| window | key_down | first | 10 | 237.1 | 203.24 | 2.55 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.11 | 50.58 | 0.43 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.19 | 1.16 | 0.81 | – | too few samples, not judged |
| window | key_up | later | 13 | 133.95 | 100.88 | 0.34 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.44 | 1.58 | 1.21 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.25 | 0.28 | 0.44 | – | too few samples, not judged |
| window | move | first | 2 | 204.33 | 206.24 | 4.65 | – | too few samples, not judged |
| window | move | later | 2 | 185.08 | 169.84 | 1.14 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.73 | 237.99 | 2.91 | [-235.83, -234.56] | faster |
| window | press_key | later | 3 | 167.51 | 134.32 | 1.13 | – | too few samples, not judged |
| window | scroll | first | 3 | 242.45 | 242.96 | 39.29 | – | too few samples, not judged |
| window | scroll | later | 6 | 203.21 | 202.78 | 1.21 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 203.72 | 3.31 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.15 | 1.34 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.23 | 0.19 | [0.015, 0.08] |

