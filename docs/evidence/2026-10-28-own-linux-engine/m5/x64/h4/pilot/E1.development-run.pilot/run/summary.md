# linux-engine-diff summary

## m5-dev-E1-pilot (experiment events; development run, not a release gate)

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

Incomplete: Acceptance 3's desktop groups left unjudged (too few samples or none): press_key first, press_key later, key_down first, key_down later, key_up later, click first, click later, move first, move later, move_relative first, move_relative later, scroll first, scroll later, drag first, drag later, drag_handle first, drag_handle later.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 2 interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at 20 samples an engine is sampled to 40, where its outcome is final, and a group decided at 20 keeps that verdict):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 6 | 86.85 | 87.59 | 79.18 | – | too few samples, not judged |
| desktop | click | first in a scenario | 3 | 88.42 | 88.92 | 79.18 | – | too few samples, not judged |
| desktop | click | later | 8 | 46.55 | 30.09 | 13.05 | – | too few samples, not judged |
| desktop | click | later in a scenario | 1 | 159.15 | 92.66 | 26.43 | – | too few samples, not judged |
| desktop | drag_handle | first | 4 | 37.71 | 37.55 | 33.74 | – | too few samples, not judged |
| desktop | drag_handle | first in a scenario | 2 | 39.94 | 40.29 | 34.21 | – | too few samples, not judged |
| desktop | drag_handle | later | 8 | 33.1 | 30.24 | 0.6 | – | too few samples, not judged |
| desktop | drag_handle | later in a scenario | 2 | 33.65 | 30.58 | 0.88 | – | too few samples, not judged |
| desktop | drag | first | 4 | 342.75 | 107.54 | 48.36 | – | too few samples, not judged |
| desktop | drag | first in a scenario | 2 | 332.4 | 113.44 | 58.99 | – | too few samples, not judged |
| desktop | drag | later | 4 | 343.35 | 115.74 | 53.79 | – | too few samples, not judged |
| desktop | key_down | first | 8 | 51.49 | 1.53 | 0.79 | – | too few samples, not judged |
| desktop | key_down | first in a scenario | 4 | 53.28 | 2.24 | 0.98 | – | too few samples, not judged |
| desktop | key_down | later | 10 | 34.08 | 0.81 | 0.33 | – | too few samples, not judged |
| desktop | key_down | later in a scenario | 1 | 34.41 | 0.75 | 0.28 | – | too few samples, not judged |
| desktop | key_up | later | 8 | 33.51 | 0.22 | 0.22 | – | too few samples, not judged |
| desktop | key_up | later in a scenario | 5 | 33.39 | 0.16 | 0.21 | – | too few samples, not judged |
| desktop | move_relative | first | 2 | 0.8 | 1.67 | 0.62 | – | too few samples, not judged |
| desktop | move_relative | first in a scenario | 1 | 2.24 | 4.29 | 0.64 | – | too few samples, not judged |
| desktop | move_relative | later | 6 | 0.3 | 0.78 | 0.32 | – | too few samples, not judged |
| desktop | move_relative | later in a scenario | 2 | 33.89 | 17.46 | 0.34 | – | too few samples, not judged |
| desktop | move | first | 2 | 83.3 | 84 | 74.58 | – | too few samples, not judged |
| desktop | move | first in a scenario | 1 | 85.45 | 87.14 | 75.97 | – | too few samples, not judged |
| desktop | move | later | 6 | 8.61 | 6.02 | 0.32 | – | too few samples, not judged |
| desktop | move | later in a scenario | 2 | 37.99 | 20.1 | 0.56 | – | too few samples, not judged |
| desktop | press_key | first | 14 | 68.1 | 34.61 | 0.81 | – | too few samples, not judged |
| desktop | press_key | first in a scenario | 7 | 70.19 | 35.44 | 1.07 | – | too few samples, not judged |
| desktop | press_key | later | 16 | 67.5 | 34.2 | 0.44 | – | too few samples, not judged |
| desktop | press_key | later in a scenario | 1 | 68.01 | 34.08 | 0.46 | – | too few samples, not judged |
| desktop | scroll | first | 2 | 73.37 | 74.66 | 73.5 | – | too few samples, not judged |
| desktop | scroll | first in a scenario | 1 | 74.18 | 74.95 | 73.44 | – | too few samples, not judged |
| desktop | scroll | later | 4 | 256.78 | 240.66 | 219.03 | – | too few samples, not judged |
| desktop | scroll | later in a scenario | 1 | 439.88 | 407.95 | 365.43 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.76 | 2.92 | 1.64 | – | too few samples, not judged |
| window | click | first | 7 | 216.41 | 216.02 | 15.17 | – | too few samples, not judged |
| window | click | later | 3 | 0.08 | 0.79 | 0.29 | – | too few samples, not judged |
| window | drag | first | 2 | 593.63 | 312.21 | 35.32 | – | too few samples, not judged |
| window | drag | later | 2 | 202.49 | 202.27 | 1 | – | too few samples, not judged |
| window | key_down | first | 10 | 237.64 | 203.93 | 2.47 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.06 | 50.64 | 0.65 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.22 | 1.17 | 1.04 | – | too few samples, not judged |
| window | key_up | later | 13 | 134.11 | 100.96 | 0.5 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.59 | 1.62 | 1.18 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.31 | 0.25 | 0.39 | – | too few samples, not judged |
| window | move | first | 2 | 203.56 | 204.52 | 3.54 | – | too few samples, not judged |
| window | move | later | 2 | 185.43 | 169.76 | 0.98 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.86 | 237.67 | 2.82 | [-235.67, -234.34] | faster |
| window | press_key | later | 3 | 167.48 | 134.21 | 0.65 | – | too few samples, not judged |
| window | scroll | first | 3 | 241.57 | 241.7 | 38.44 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.95 | 202.64 | 0.71 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.34 | 2.59 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 501.79 | 2.25 | – | too few samples, not judged |

Unjudged in this pilot (no top-up; not passes): desktop press_key first; desktop press_key later; desktop key_down first; desktop key_down later; desktop key_up later; desktop click first; desktop click later; desktop move first; desktop move later; desktop move_relative first; desktop move_relative later; desktop scroll first; desktop scroll later; desktop drag first; desktop drag later; desktop drag_handle first; desktop drag_handle later.

