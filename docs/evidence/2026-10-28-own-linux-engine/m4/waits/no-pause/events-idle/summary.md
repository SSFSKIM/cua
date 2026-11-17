# linux-engine-diff summary

## t64-c2-events-idle (experiment events)

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

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 20 interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at 20 samples an engine is sampled to 40, where its outcome is final, and a group decided at 20 keeps that verdict):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 60 | 87.34 | 87.25 | 13.43 | [-74.655, -72.995] | faster |
| desktop | click | first in a scenario | 3 | 87.48 | 87.85 | 13.62 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.35 | 30.64 | 12.92 | [-17.83, -17.18] | faster |
| desktop | click | later in a scenario | 1 | 158.3 | 91.89 | 25.29 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.77 | 37.45 | 0.94 | [-36.615, -36.345] | faster |
| desktop | drag_handle | first in a scenario | 2 | 39.99 | 40.61 | 1.94 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.06 | 30.35 | 0.52 | [-29.91, -29.7] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.49 | 30.49 | 0.66 | – | too few samples, not judged |
| desktop | drag | first | 40 | 327.99 | 106.67 | 10.13 | [-97.165, -95.165] | faster |
| desktop | drag | first in a scenario | 2 | 346.1 | 112.65 | 23.09 | – | too few samples, not judged |
| desktop | drag | later | 40 | 328.97 | 110.78 | 10.29 | [-101.66, -99.915] | faster |
| desktop | key_down | first | 80 | 51.55 | 1.42 | 0.82 | [-0.73, -0.53] | faster |
| desktop | key_down | first in a scenario | 4 | 52.25 | 2.34 | 0.86 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.23 | 0.69 | 0.34 | [-0.38, -0.315] | faster |
| desktop | key_down | later in a scenario | 1 | 34.06 | 0.57 | 0.31 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.53 | 0.18 | 0.24 | [0.04, 0.09] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.43 | 0.13 | 0.22 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.75 | 1.58 | 0.58 | [-0.265, -0.1] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.68 | 2.65 | 0.75 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.28 | 0.66 | 0.22 | [-0.1, -0.025] | faster |
| desktop | move_relative | later in a scenario | 2 | 33.79 | 17.25 | 0.26 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.17 | 84.23 | 1.22 | [-82.29, -81.68] | faster |
| desktop | move | first in a scenario | 1 | 84.07 | 85.89 | 1.08 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.63 | 6.03 | 0.41 | [-5.875, -5.54] | faster |
| desktop | move | later in a scenario | 2 | 37.94 | 20.01 | 0.32 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.53 | 34.82 | 0.86 | [-34.02, -33.89] | faster |
| desktop | press_key | first in a scenario | 7 | 70.23 | 35.82 | 1.09 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.66 | 34.29 | 0.48 | [-33.85, -33.745] | faster |
| desktop | press_key | later in a scenario | 1 | 67.29 | 34.56 | 0.36 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.54 | 74.36 | 73.37 | [-0.3, 0] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 74.15 | 76.08 | 73.57 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.83 | 240.19 | 182.51 | [-58.015, -57.495] | faster |
| desktop | scroll | later in a scenario | 1 | 440.81 | 407.99 | 292.46 | – | too few samples, not judged |
| window | activate_window | first | 1 | 2.83 | 2.9 | 1.34 | – | too few samples, not judged |
| window | click | first | 7 | 216.29 | 218.56 | 15.48 | – | too few samples, not judged |
| window | click | later | 5 | 113.17 | 113.55 | 13.18 | – | too few samples, not judged |
| window | drag | first | 2 | 592.41 | 312.26 | 25.17 | – | too few samples, not judged |
| window | drag | later | 3 | 202.83 | 202.93 | 1.79 | – | too few samples, not judged |
| window | key_down | first | 12 | 238.13 | 203.34 | 2.63 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.32 | 50.64 | 0.5 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.1 | 1.02 | 0.71 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.07 | 100.97 | 0.47 | – | too few samples, not judged |
| window | launch_app | first | 1 | 2.55 | 2.27 | 1.71 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.47 | 0.5 | 0.73 | – | too few samples, not judged |
| window | move | first | 2 | 204.17 | 204.92 | 3.65 | – | too few samples, not judged |
| window | move | later | 4 | 100.89 | 101.69 | 0.9 | – | too few samples, not judged |
| window | press_key | first | 33 | 337.18 | 237.88 | 3.52 | [-235.08, -233.76] | faster |
| window | press_key | later | 3 | 167.8 | 134.72 | 0.83 | – | too few samples, not judged |
| window | scroll | first | 3 | 241.12 | 241.79 | 39.4 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.99 | 202.75 | 0.88 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 205.24 | 3.76 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.98 | 1.15 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.24 | 0.18 | [0.04, 0.09] |

