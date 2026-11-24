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
| desktop | click | first | 60 | 103.93 | 109.28 | 91.29 | [-15.79, -7.915] | faster |
| desktop | click | first in a scenario | 3 | 114.4 | 126.79 | 101.67 | – | too few samples, not judged |
| desktop | click | later | 80 | 53.34 | 41.26 | 18.28 | [-23.8, -21.905] | faster |
| desktop | click | later in a scenario | 1 | 171.39 | 107.33 | 37.82 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 47.1 | 49.89 | 40.88 | [-6.985, -5.09] | faster |
| desktop | drag_handle | first in a scenario | 2 | 59.7 | 70.65 | 49.79 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 36.69 | 36.13 | 5.79 | [-30.855, -29.94] | faster |
| desktop | drag_handle | later in a scenario | 2 | 38.42 | 34.95 | 7.7 | – | too few samples, not judged |
| desktop | drag | first | 40 | 503.89 | 153.98 | 171.4 | [10.795, 28.02] | **fail** |
| desktop | drag | first in a scenario | 2 | 553.18 | 185.22 | 218.43 | – | too few samples, not judged |
| desktop | drag | later | 40 | 489.45 | 157.49 | 187.22 | [22.965, 32.75] | **fail** |
| desktop | key_down | first | 80 | 62.73 | 10.58 | 3.97 | [-7.515, -5.965] | faster |
| desktop | key_down | first in a scenario | 4 | 69.78 | 18.58 | 9.5 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 39.85 | 5.98 | 2.32 | [-4.01, -3.38] | faster |
| desktop | key_down | later in a scenario | 1 | 39.25 | 5.84 | 2.16 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 34.53 | 1.37 | 1.75 | [0.035, 0.67] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 34.61 | 0.96 | 1.69 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 4.92 | 12.44 | 2.48 | [-3.225, -1.695] | faster |
| desktop | move_relative | first in a scenario | 1 | 24.89 | 44.53 | 8.47 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 1.09 | 5.38 | 1.63 | [0.13, 0.855] | **within the bound** |
| desktop | move_relative | later in a scenario | 2 | 40.3 | 28.55 | 4.51 | – | too few samples, not judged |
| desktop | move | first | 20 | 95.93 | 107.59 | 86.13 | [-11.99, -6.69] | faster |
| desktop | move | first in a scenario | 1 | 99.87 | 122.91 | 96.56 | – | too few samples, not judged |
| desktop | move | later | 60 | 10.93 | 12.65 | 2.94 | [-8.74, -7.305] | faster |
| desktop | move | later in a scenario | 2 | 42.73 | 27.27 | 4.22 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 82.57 | 45.08 | 4.79 | [-40.81, -39.675] | faster |
| desktop | press_key | first in a scenario | 7 | 95.08 | 59.01 | 14.56 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 76.02 | 41.17 | 3.87 | [-37.96, -36.97] | faster |
| desktop | press_key | later in a scenario | 1 | 74.82 | 38.64 | 2.45 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 80.35 | 89.89 | 77.82 | [-3.57, -1.165] | faster |
| desktop | scroll | first in a scenario | 1 | 100.22 | 129.88 | 83.79 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 271.85 | 259.25 | 231.8 | [-28.905, -25.475] | faster |
| desktop | scroll | later in a scenario | 1 | 483.34 | 437.7 | 390.22 | – | too few samples, not judged |
| window | activate_window | first | 1 | 17.72 | 19.99 | 12.77 | – | too few samples, not judged |
| window | click | first | 7 | 252.04 | 258.38 | 47.18 | – | too few samples, not judged |
| window | click | later | 3 | 0.4 | 4.24 | 2.2 | – | too few samples, not judged |
| window | drag | first | 2 | 1038.58 | 506.35 | 328.14 | – | too few samples, not judged |
| window | drag | later | 2 | 213.01 | 222.97 | 10.78 | – | too few samples, not judged |
| window | key_down | first | 10 | 271.49 | 230.02 | 27.85 | – | too few samples, not judged |
| window | key_down | later | 4 | 69.56 | 53.57 | 2.67 | – | too few samples, not judged |
| window | key_up | first | 1 | 15.9 | 12.64 | 13.11 | – | too few samples, not judged |
| window | key_up | later | 13 | 138.12 | 104.16 | 2.58 | – | too few samples, not judged |
| window | launch_app | first | 1 | 15.47 | 14.94 | 12.94 | – | too few samples, not judged |
| window | launch_app | later | 4 | 2.66 | 2.15 | 2.83 | – | too few samples, not judged |
| window | move | first | 2 | 237.51 | 240.99 | 38.09 | – | too few samples, not judged |
| window | move | later | 2 | 196.89 | 196.67 | 10.56 | – | too few samples, not judged |
| window | press_key | first | 33 | 364.39 | 274.39 | 40.1 | [-242.28, -226.05] | faster |
| window | press_key | later | 3 | 175.43 | 142.39 | 4.74 | – | too few samples, not judged |
| window | scroll | first | 3 | 271.53 | 283.49 | 69.37 | – | too few samples, not judged |
| window | scroll | later | 6 | 221.08 | 221.01 | 9.62 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 231.05 | 29.53 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 523.49 | 18.97 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 1.75 | 1.37 | [0.035, 0.67] |
| desktop | move_relative | later | 1.63 | 1.09 | [0.13, 0.855] |

cua is slower than the faster vendor build over the wire: desktop drag first (171.4 against 153.98, [10.795, 28.02]); desktop drag later (187.22 against 157.49, [22.965, 32.75]).

