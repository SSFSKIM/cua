# linux-engine-diff summary

## t64-c3-events-idle (experiment events)

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
| desktop | click | first | 60 | 87.27 | 86.83 | 78.92 | [-8.38, -7.42] | faster |
| desktop | click | first in a scenario | 3 | 88.59 | 88.07 | 78.55 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.36 | 30.11 | 12.89 | [-17.265, -17.14] | faster |
| desktop | click | later in a scenario | 1 | 158.2 | 91.99 | 25.65 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.88 | 37.58 | 33.55 | [-4.165, -3.85] | faster |
| desktop | drag_handle | first in a scenario | 2 | 39.71 | 38.66 | 33.78 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.05 | 30.23 | 0.52 | [-29.8, -29.65] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.26 | 30.26 | 0.65 | – | too few samples, not judged |
| desktop | drag | first | 40 | 325.91 | 105.66 | 43.53 | [-63.855, -61.265] | faster |
| desktop | drag | first in a scenario | 2 | 329.71 | 108.48 | 45.09 | – | too few samples, not judged |
| desktop | drag | later | 40 | 329.53 | 110.96 | 47.43 | [-64.25, -63.195] | faster |
| desktop | key_down | first | 80 | 51.51 | 1.46 | 0.78 | [-0.75, -0.615] | faster |
| desktop | key_down | first in a scenario | 4 | 52.21 | 2.31 | 0.9 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.17 | 0.68 | 0.3 | [-0.41, -0.34] | faster |
| desktop | key_down | later in a scenario | 1 | 34.39 | 0.59 | 0.23 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.53 | 0.18 | 0.23 | [0.025, 0.07] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.51 | 0.15 | 0.18 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.76 | 1.53 | 0.57 | [-0.28, -0.15] | faster |
| desktop | move_relative | first in a scenario | 1 | 2.05 | 4.49 | 0.6 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.26 | 0.7 | 0.21 | [-0.08, -0.01] | faster |
| desktop | move_relative | later in a scenario | 2 | 33.85 | 17.41 | 0.31 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.16 | 83.88 | 74.76 | [-8.67, -8.055] | faster |
| desktop | move | first in a scenario | 1 | 83.98 | 85.21 | 75.29 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.61 | 5.95 | 0.4 | [-5.64, -5.475] | faster |
| desktop | move | later in a scenario | 2 | 38.06 | 20.09 | 0.67 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.4 | 34.8 | 0.85 | [-34.04, -33.865] | faster |
| desktop | press_key | first in a scenario | 7 | 69.27 | 35.57 | 0.95 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.69 | 34.22 | 0.47 | [-33.825, -33.675] | faster |
| desktop | press_key | later in a scenario | 1 | 67.36 | 34.12 | 0.37 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.49 | 74.42 | 73.36 | [-0.32, 0.03] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 74.27 | 75.87 | 73.89 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.65 | 240.44 | 219.21 | [-21.44, -21.01] | faster |
| desktop | scroll | later in a scenario | 1 | 442.26 | 408.2 | 366.18 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.38 | 1.38 | 0.85 | – | too few samples, not judged |
| window | click | first | 7 | 216.04 | 216.73 | 14.9 | – | too few samples, not judged |
| window | click | later | 5 | 113.42 | 113.92 | 12.99 | – | too few samples, not judged |
| window | drag | first | 2 | 576.05 | 309.08 | 28.66 | – | too few samples, not judged |
| window | drag | later | 3 | 201.88 | 202.93 | 1.24 | – | too few samples, not judged |
| window | key_down | first | 12 | 238.24 | 203.52 | 2.63 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.01 | 50.58 | 0.43 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.25 | 1.15 | 0.65 | – | too few samples, not judged |
| window | key_up | later | 15 | 133.99 | 100.91 | 0.42 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.6 | 3.21 | 1.57 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.29 | 0.39 | 0.66 | – | too few samples, not judged |
| window | move | first | 2 | 204.13 | 205.87 | 4.05 | – | too few samples, not judged |
| window | move | later | 4 | 100.82 | 101.63 | 0.77 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.81 | 237.69 | 3.04 | [-235.23, -233.83] | faster |
| window | press_key | later | 3 | 167.7 | 134.45 | 0.65 | – | too few samples, not judged |
| window | scroll | first | 3 | 240.01 | 241.17 | 38.91 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.31 | 202.24 | 1 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.36 | 2.47 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 501.8 | 1.1 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.23 | 0.18 | [0.025, 0.07] |

