# linux-engine-diff summary

## m4-gate-E1 (experiment events; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

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
| desktop | click | first | 60 | 87.15 | 86.98 | 78.85 | [-8.38, -7.5] | faster |
| desktop | click | first in a scenario | 3 | 89.05 | 88.03 | 78.54 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.41 | 30.14 | 12.86 | [-17.37, -17.12] | faster |
| desktop | click | later in a scenario | 1 | 158.84 | 91.97 | 25.35 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.78 | 37.43 | 33.67 | [-3.95, -3.625] | faster |
| desktop | drag_handle | first in a scenario | 2 | 39.3 | 39.79 | 34.29 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.21 | 30.2 | 0.62 | [-29.705, -29.54] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.32 | 30.34 | 0.88 | – | too few samples, not judged |
| desktop | drag | first | 40 | 324.45 | 106.32 | 43.9 | [-63.23, -61.96] | faster |
| desktop | drag | first in a scenario | 2 | 333.42 | 115.12 | 45.28 | – | too few samples, not judged |
| desktop | drag | later | 40 | 328.9 | 110.51 | 47.72 | [-63.5, -62.62] | faster |
| desktop | key_down | first | 80 | 51.49 | 1.42 | 0.76 | [-0.715, -0.61] | faster |
| desktop | key_down | first in a scenario | 4 | 52.06 | 2.75 | 0.89 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.1 | 0.63 | 0.29 | [-0.37, -0.28] | faster |
| desktop | key_down | later in a scenario | 1 | 34.01 | 0.7 | 0.39 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.52 | 0.16 | 0.21 | [0.035, 0.07] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.46 | 0.15 | 0.27 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.76 | 1.42 | 0.62 | [-0.24, -0.05] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.48 | 4.23 | 0.84 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.27 | 0.67 | 0.21 | [-0.125, -0.02] | faster |
| desktop | move_relative | later in a scenario | 2 | 33.71 | 17.54 | 0.27 | – | too few samples, not judged |
| desktop | move | first | 20 | 82.91 | 83.96 | 74.92 | [-8.545, -7.715] | faster |
| desktop | move | first in a scenario | 1 | 84.36 | 85.39 | 75.4 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.54 | 6.01 | 0.42 | [-5.68, -5.525] | faster |
| desktop | move | later in a scenario | 2 | 38.18 | 20.17 | 0.53 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.38 | 34.75 | 0.85 | [-33.945, -33.845] | faster |
| desktop | press_key | first in a scenario | 7 | 70.21 | 35.76 | 1.03 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.58 | 34.22 | 0.43 | [-33.835, -33.74] | faster |
| desktop | press_key | later in a scenario | 1 | 67.62 | 34.02 | 0.44 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.39 | 74.33 | 73.3 | [-0.255, 0.05] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 74.22 | 77.75 | 73.84 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.46 | 240.39 | 218.97 | [-21.51, -20.895] | faster |
| desktop | scroll | later in a scenario | 1 | 440.02 | 410.23 | 365.94 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.64 | 2.38 | 1.66 | – | too few samples, not judged |
| window | click | first | 7 | 216.01 | 217.75 | 15.37 | – | too few samples, not judged |
| window | click | later | 5 | 113.18 | 113.69 | 13.31 | – | too few samples, not judged |
| window | drag | first | 2 | 578.25 | 309.4 | 41.75 | – | too few samples, not judged |
| window | drag | later | 3 | 201.99 | 202.15 | 0.99 | – | too few samples, not judged |
| window | key_down | first | 12 | 236.98 | 203.39 | 2.5 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.19 | 50.54 | 0.59 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.43 | 1.41 | 0.65 | – | too few samples, not judged |
| window | key_up | later | 15 | 134.03 | 100.97 | 0.48 | – | too few samples, not judged |
| window | launch_app | first | 1 | 2.72 | 1.48 | 1.04 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.45 | 0.23 | 0.46 | – | too few samples, not judged |
| window | move | first | 2 | 203.59 | 204.61 | 3.12 | – | too few samples, not judged |
| window | move | later | 4 | 101.05 | 101.57 | 0.74 | – | too few samples, not judged |
| window | press_key | first | 33 | 337.74 | 238.48 | 3.08 | [-235.99, -234.45] | faster |
| window | press_key | later | 3 | 167.74 | 134.23 | 0.73 | – | too few samples, not judged |
| window | scroll | first | 3 | 240.09 | 242.54 | 38.93 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.67 | 202.62 | 0.67 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.97 | 3.75 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.3 | 1.8 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.21 | 0.16 | [0.035, 0.07] |

