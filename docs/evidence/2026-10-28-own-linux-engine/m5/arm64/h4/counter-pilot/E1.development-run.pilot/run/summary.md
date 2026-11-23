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
| desktop | click | first | 6 | 85.13 | 84.24 | 76.99 | – | too few samples, not judged |
| desktop | click | first in a scenario | 3 | 85.65 | 84.79 | 77.18 | – | too few samples, not judged |
| desktop | click | later | 8 | 45.38 | 28.95 | 12.24 | – | too few samples, not judged |
| desktop | click | later in a scenario | 1 | 156.82 | 90.69 | 24.38 | – | too few samples, not judged |
| desktop | drag_handle | first | 4 | 36.68 | 36.17 | 32.59 | – | too few samples, not judged |
| desktop | drag_handle | first in a scenario | 2 | 37.17 | 36.77 | 32.74 | – | too few samples, not judged |
| desktop | drag_handle | later | 8 | 32.38 | 29.55 | 0.31 | – | too few samples, not judged |
| desktop | drag_handle | later in a scenario | 2 | 32.38 | 29.53 | 0.16 | – | too few samples, not judged |
| desktop | drag | first | 4 | 306.22 | 101.25 | 36.6 | – | too few samples, not judged |
| desktop | drag | first in a scenario | 2 | 307.39 | 101.52 | 37.01 | – | too few samples, not judged |
| desktop | drag | later | 4 | 310.25 | 105.35 | 40.61 | – | too few samples, not judged |
| desktop | key_down | first | 8 | 50.12 | 0.49 | 0.26 | – | too few samples, not judged |
| desktop | key_down | first in a scenario | 4 | 50.6 | 0.97 | 0.42 | – | too few samples, not judged |
| desktop | key_down | later | 10 | 33.29 | 0.2 | 0.22 | – | too few samples, not judged |
| desktop | key_down | later in a scenario | 1 | 33.35 | 0.21 | 0.12 | – | too few samples, not judged |
| desktop | key_up | later | 8 | 33.12 | 0.05 | 0.07 | – | too few samples, not judged |
| desktop | key_up | later in a scenario | 5 | 33.12 | 0.05 | 0.07 | – | too few samples, not judged |
| desktop | move_relative | first | 2 | 0.29 | 0.55 | 0.21 | – | too few samples, not judged |
| desktop | move_relative | first in a scenario | 1 | 0.84 | 1.11 | 0.36 | – | too few samples, not judged |
| desktop | move_relative | later | 6 | 0.08 | 0.19 | 0.16 | – | too few samples, not judged |
| desktop | move_relative | later in a scenario | 2 | 33.33 | 16.82 | 0.12 | – | too few samples, not judged |
| desktop | move | first | 2 | 81.11 | 81.46 | 72.99 | – | too few samples, not judged |
| desktop | move | first in a scenario | 1 | 81.7 | 82.05 | 73.09 | – | too few samples, not judged |
| desktop | move | later | 6 | 8.16 | 5.35 | 0.19 | – | too few samples, not judged |
| desktop | move | later in a scenario | 2 | 37.32 | 19.36 | 0.17 | – | too few samples, not judged |
| desktop | press_key | first | 14 | 66.72 | 33.59 | 0.29 | – | too few samples, not judged |
| desktop | press_key | first in a scenario | 7 | 67.24 | 34.07 | 0.45 | – | too few samples, not judged |
| desktop | press_key | later | 16 | 66.41 | 33.33 | 0.27 | – | too few samples, not judged |
| desktop | press_key | later in a scenario | 1 | 66.37 | 33.3 | 0.16 | – | too few samples, not judged |
| desktop | scroll | first | 2 | 72.58 | 72.84 | 72.43 | – | too few samples, not judged |
| desktop | scroll | first in a scenario | 1 | 72.98 | 73.46 | 72.63 | – | too few samples, not judged |
| desktop | scroll | later | 4 | 254.16 | 237.71 | 216.97 | – | too few samples, not judged |
| desktop | scroll | later in a scenario | 1 | 436.12 | 403.06 | 361.77 | – | too few samples, not judged |
| window | activate_window | first | 1 | 0.79 | 0.81 | 0.43 | – | too few samples, not judged |
| window | click | first | 7 | 213.68 | 214.23 | 13.12 | – | too few samples, not judged |
| window | click | later | 3 | 0.05 | 0.16 | 0.09 | – | too few samples, not judged |
| window | drag | first | 2 | 542.72 | 295.97 | 8.56 | – | too few samples, not judged |
| window | drag | later | 2 | 200.82 | 200.93 | 0.27 | – | too few samples, not judged |
| window | key_down | first | 10 | 234.45 | 201.4 | 1 | – | too few samples, not judged |
| window | key_down | later | 4 | 66.76 | 50.25 | 0.16 | – | too few samples, not judged |
| window | key_up | first | 1 | 0.65 | 0.58 | 0.28 | – | too few samples, not judged |
| window | key_up | later | 13 | 133.41 | 100.33 | 0.12 | – | too few samples, not judged |
| window | launch_app | first | 1 | 0.83 | 0.86 | 0.68 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.14 | 0.16 | 0.26 | – | too few samples, not judged |
| window | move | first | 2 | 201.4 | 201.72 | 1.01 | – | too few samples, not judged |
| window | move | later | 2 | 183.82 | 167.51 | 0.27 | – | too few samples, not judged |
| window | press_key | first | 33 | 333.94 | 234.76 | 1.04 | [-233.76, -233.69] | faster |
| window | press_key | later | 3 | 166.57 | 133.48 | 0.26 | – | too few samples, not judged |
| window | scroll | first | 3 | 237.61 | 238.11 | 37.17 | – | too few samples, not judged |
| window | scroll | later | 6 | 200.83 | 200.85 | 0.25 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 201.72 | 1 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 498.84 | 0.5 | – | too few samples, not judged |

Unjudged in this pilot (no top-up; not passes): desktop press_key first; desktop press_key later; desktop key_down first; desktop key_down later; desktop key_up later; desktop click first; desktop click later; desktop move first; desktop move later; desktop move_relative first; desktop move_relative later; desktop scroll first; desktop scroll later; desktop drag first; desktop drag later; desktop drag_handle first; desktop drag_handle later.

