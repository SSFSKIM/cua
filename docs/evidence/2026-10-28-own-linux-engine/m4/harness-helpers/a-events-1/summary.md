# linux-engine-diff summary

## t74w3-a-events-1 (experiment events; development run, not a release gate)

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
| desktop | click | first | 60 | 87.19 | 86.99 | 79.09 | [-8.41, -7.33] | faster |
| desktop | click | first in a scenario | 3 | 88.44 | 88.11 | 79.17 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.22 | 30.01 | 12.9 | [-17.25, -17.045] | faster |
| desktop | click | later in a scenario | 1 | 160.53 | 92.27 | 25.82 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 38.27 | 37.63 | 33.65 | [-4.09, -3.765] | faster |
| desktop | drag_handle | first in a scenario | 2 | 38.5 | 38.53 | 33.95 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.07 | 30.45 | 0.6 | [-29.905, -29.72] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.04 | 30.24 | 0.47 | – | too few samples, not judged |
| desktop | drag | first | 40 | 328.21 | 106.36 | 43.97 | [-63.775, -62.165] | faster |
| desktop | drag | first in a scenario | 2 | 337.09 | 114.77 | 48.84 | – | too few samples, not judged |
| desktop | drag | later | 40 | 328.96 | 110.76 | 47.87 | [-63.39, -61.45] | faster |
| desktop | key_down | first | 80 | 51.61 | 1.47 | 0.73 | [-0.88, -0.61] | faster |
| desktop | key_down | first in a scenario | 4 | 52.53 | 3.6 | 1 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.13 | 0.69 | 0.31 | [-0.45, -0.35] | faster |
| desktop | key_down | later in a scenario | 1 | 34.55 | 0.98 | 0.51 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.51 | 0.19 | 0.25 | [0.025, 0.09] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.46 | 0.27 | 0.34 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.7 | 1.63 | 0.56 | [-0.235, -0.035] | faster |
| desktop | move_relative | first in a scenario | 1 | 2.52 | 4.81 | 1.15 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.24 | 0.85 | 0.24 | [-0.045, 0.075] | same (within noise) |
| desktop | move_relative | later in a scenario | 2 | 34 | 17.51 | 0.34 | – | too few samples, not judged |
| desktop | move | first | 20 | 82.84 | 84.01 | 74.88 | [-8.335, -7.705] | faster |
| desktop | move | first in a scenario | 1 | 85.59 | 85.77 | 74.38 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.63 | 5.98 | 0.39 | [-5.695, -5.5] | faster |
| desktop | move | later in a scenario | 2 | 38.15 | 20.08 | 0.44 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.35 | 34.75 | 0.81 | [-34, -33.84] | faster |
| desktop | press_key | first in a scenario | 7 | 70.35 | 36.96 | 1.18 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.69 | 34.27 | 0.48 | [-33.83, -33.705] | faster |
| desktop | press_key | later in a scenario | 1 | 67.13 | 34.03 | 0.25 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.56 | 74.52 | 73.38 | [-0.31, 0] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 75.29 | 75.23 | 73.3 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.16 | 240.39 | 219.04 | [-21.56, -21.01] | faster |
| desktop | scroll | later in a scenario | 1 | 441.37 | 407.29 | 365.14 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.53 | 1.62 | 1.12 | – | too few samples, not judged |
| window | click | first | 7 | 216.02 | 218.68 | 16.64 | – | too few samples, not judged |
| window | click | later | 5 | 113.04 | 114.47 | 13.07 | – | too few samples, not judged |
| window | drag | first | 2 | 585.38 | 315.39 | 49.15 | – | too few samples, not judged |
| window | drag | later | 3 | 201.93 | 201.81 | 1.53 | – | too few samples, not judged |
| window | key_down | first | 12 | 237.68 | 204.24 | 2.61 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.04 | 50.63 | 0.54 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.11 | 1.24 | 0.98 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.04 | 100.9 | 0.47 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.46 | 1.41 | 0.95 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.25 | 0.21 | 0.37 | – | too few samples, not judged |
| window | move | first | 2 | 204.85 | 204.98 | 2.68 | – | too few samples, not judged |
| window | move | later | 4 | 100.86 | 102.41 | 0.76 | – | too few samples, not judged |
| window | press_key | first | 33 | 337.71 | 238.43 | 3.3 | [-235.98, -234.5] | faster |
| window | press_key | later | 3 | 167.67 | 134.84 | 1.06 | – | too few samples, not judged |
| window | scroll | first | 3 | 242.23 | 240.81 | 39.06 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.33 | 203.26 | 0.82 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.2 | 3.76 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 503.65 | 1.41 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.25 | 0.19 | [0.025, 0.09] |

