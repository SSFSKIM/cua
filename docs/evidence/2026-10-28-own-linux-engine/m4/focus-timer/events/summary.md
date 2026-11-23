# linux-engine-diff summary

## t56-events (experiment events)

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

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; the desktop route's `first` and `later` from 20 interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at 20 samples an engine is sampled to 40, where its outcome is final, and a group decided at 20 keeps that verdict):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | click | first | 60 | 87.01 | 86.59 | 86.82 | [-0.005, 0.64] | same (within noise) |
| desktop | click | first in a scenario | 3 | 87.52 | 87 | 86.53 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.39 | 30.14 | 12.8 | [-17.365, -17.05] | faster |
| desktop | click | later in a scenario | 1 | 158.18 | 91.99 | 25.18 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.53 | 37.35 | 37.48 | [-0.06, 0.38] | same (within noise) |
| desktop | drag_handle | first in a scenario | 2 | 38.53 | 38.28 | 37.64 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.03 | 30.32 | 0.52 | [-29.84, -29.64] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.06 | 30.08 | 0.41 | – | too few samples, not judged |
| desktop | drag | first | 40 | 325.7 | 106.76 | 47.42 | [-59.84, -59.09] | faster |
| desktop | drag | first in a scenario | 2 | 331.67 | 109.63 | 55.81 | – | too few samples, not judged |
| desktop | drag | later | 40 | 329.62 | 110.45 | 51.4 | [-59.22, -58.445] | faster |
| desktop | key_down | first | 80 | 51.61 | 1.38 | 0.67 | [-0.8, -0.625] | faster |
| desktop | key_down | first in a scenario | 4 | 51.95 | 1.98 | 0.72 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.13 | 0.65 | 0.28 | [-0.42, -0.33] | faster |
| desktop | key_down | later in a scenario | 1 | 34 | 0.55 | 0.24 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.49 | 0.18 | 0.19 | [0, 0.04] | same (within noise) |
| desktop | key_up | later in a scenario | 5 | 33.35 | 0.15 | 0.18 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.72 | 1.44 | 0.51 | [-0.295, -0.145] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.99 | 2.86 | 1.02 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.25 | 0.66 | 0.19 | [-0.11, -0.04] | faster |
| desktop | move_relative | later in a scenario | 2 | 33.78 | 17.52 | 0.4 | – | too few samples, not judged |
| desktop | move | first | 20 | 82.87 | 83.67 | 82.76 | [-0.29, 0.17] | same (within noise) |
| desktop | move | first in a scenario | 1 | 83.51 | 84.87 | 83.25 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.59 | 5.99 | 8.52 | [2.4, 2.665] | **declared gap** (M4) |
| desktop | move | later in a scenario | 2 | 37.82 | 20.09 | 4.71 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.1 | 34.69 | 0.79 | [-33.965, -33.855] | faster |
| desktop | press_key | first in a scenario | 7 | 68.75 | 35.36 | 0.81 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.52 | 34.17 | 0.41 | [-33.795, -33.69] | faster |
| desktop | press_key | later in a scenario | 1 | 67.37 | 33.86 | 0.3 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.35 | 74.32 | 73.15 | [-0.415, -0.12] | faster |
| desktop | scroll | first in a scenario | 1 | 75.28 | 75.17 | 73.6 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.44 | 240.01 | 222.98 | [-17.225, -16.925] | faster |
| desktop | scroll | later in a scenario | 1 | 441.17 | 407.75 | 373.96 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.46 | 1.46 | 0.57 | – | too few samples, not judged |
| window | click | first | 7 | 215.99 | 217.23 | 14.74 | – | too few samples, not judged |
| window | click | later | 5 | 113.22 | 114.89 | 13.03 | – | too few samples, not judged |
| window | drag | first | 2 | 594.41 | 313.29 | 24.47 | – | too few samples, not judged |
| window | drag | later | 3 | 202.04 | 201.74 | 0.81 | – | too few samples, not judged |
| window | key_down | first | 12 | 236.52 | 203.46 | 2.7 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.17 | 50.63 | 0.5 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.18 | 1.22 | 0.51 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.09 | 100.97 | 0.34 | – | too few samples, not judged |
| window | launch_app | first | 1 | 1.38 | 1.65 | 0.85 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.24 | 0.25 | 0.34 | – | too few samples, not judged |
| window | move | first | 2 | 203.78 | 204.72 | 2.39 | – | too few samples, not judged |
| window | move | later | 4 | 100.74 | 101.76 | 0.59 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.99 | 237.81 | 2.95 | [-235.55, -234.42] | faster |
| window | press_key | later | 3 | 167.81 | 134.72 | 0.69 | – | too few samples, not judged |
| window | scroll | first | 3 | 241.95 | 242.85 | 41.05 | – | too few samples, not judged |
| window | scroll | later | 6 | 203.68 | 202.97 | 0.96 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204 | 2.09 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.46 | 1.88 | – | too few samples, not judged |

Declared speed gaps (deviations.mjs; not a pass): desktop move later (8.52 against 5.99, M4: cua sends the pinned build's motions, the first at the pointer's own position, with the vendor's 8 ms path wait after each; the newest build leaves that first motion out, so a short move waits 8 ms less. M4 shortens the wait).

