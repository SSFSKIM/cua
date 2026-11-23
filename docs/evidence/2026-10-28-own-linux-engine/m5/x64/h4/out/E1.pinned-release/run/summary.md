# linux-engine-diff summary

## pinned-E1 (experiment events; acceptance on the pinned release)

candidate: sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.1 (7522dcb8fb8c); the pin's x64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

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
| desktop | click | first | 60 | 87.57 | 86.64 | 79.13 | [-8.005, -6.9] | faster |
| desktop | click | first in a scenario | 3 | 88.12 | 88.65 | 79.11 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.42 | 30.03 | 12.95 | [-17.225, -16.995] | faster |
| desktop | click | later in a scenario | 1 | 159.51 | 91.62 | 25.31 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.93 | 37.47 | 33.58 | [-3.945, -3.7] | faster |
| desktop | drag_handle | first in a scenario | 2 | 38.3 | 39.99 | 34.13 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.21 | 30.36 | 0.57 | [-29.875, -29.74] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.33 | 30.42 | 0.55 | – | too few samples, not judged |
| desktop | drag | first | 40 | 325.31 | 106.39 | 43.84 | [-63.42, -61.86] | faster |
| desktop | drag | first in a scenario | 2 | 334.57 | 113.23 | 52.1 | – | too few samples, not judged |
| desktop | drag | later | 40 | 331.06 | 110.06 | 47.92 | [-63.11, -61.43] | faster |
| desktop | key_down | first | 80 | 52.4 | 1.55 | 0.79 | [-0.87, -0.645] | faster |
| desktop | key_down | first in a scenario | 4 | 52.4 | 2.41 | 0.91 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.11 | 0.69 | 0.33 | [-0.41, -0.335] | faster |
| desktop | key_down | later in a scenario | 1 | 34.42 | 0.8 | 0.5 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.55 | 0.2 | 0.24 | [0.005, 0.08] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.41 | 0.17 | 0.32 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.78 | 1.55 | 0.59 | [-0.35, -0.08] | faster |
| desktop | move_relative | first in a scenario | 1 | 1.32 | 1.8 | 0.58 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.25 | 0.67 | 0.26 | [-0.07, 0.06] | same (within noise) |
| desktop | move_relative | later in a scenario | 2 | 33.63 | 17.2 | 0.24 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.29 | 83.98 | 74.72 | [-8.855, -7.96] | faster |
| desktop | move | first in a scenario | 1 | 83.28 | 84.38 | 74.6 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.64 | 6.04 | 0.46 | [-5.66, -5.44] | faster |
| desktop | move | later in a scenario | 2 | 37.93 | 20.04 | 0.42 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.48 | 34.82 | 0.86 | [-34.025, -33.875] | faster |
| desktop | press_key | first in a scenario | 7 | 68.89 | 36.09 | 0.91 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.69 | 34.26 | 0.47 | [-33.84, -33.745] | faster |
| desktop | press_key | later in a scenario | 1 | 67.1 | 33.95 | 0.54 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.51 | 74.44 | 73.46 | [-0.24, 0.115] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 73.93 | 78.56 | 73.36 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.42 | 240.13 | 219.24 | [-21.22, -20.69] | faster |
| desktop | scroll | later in a scenario | 1 | 441.23 | 408.45 | 365.07 | – | too few samples, not judged |
| window | activate_window | first | 1 | 1.79 | 1.53 | 0.92 | – | too few samples, not judged |
| window | click | first | 7 | 216.67 | 218.01 | 15.32 | – | too few samples, not judged |
| window | click | later | 3 | 0.12 | 0.57 | 0.33 | – | too few samples, not judged |
| window | drag | first | 2 | 606.66 | 308.89 | 37.9 | – | too few samples, not judged |
| window | drag | later | 2 | 202.21 | 202.54 | 1 | – | too few samples, not judged |
| window | key_down | first | 10 | 238.21 | 203.58 | 2.88 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.24 | 50.67 | 0.52 | – | too few samples, not judged |
| window | key_up | first | 1 | 1.02 | 1.33 | 0.8 | – | too few samples, not judged |
| window | key_up | later | 13 | 134.05 | 100.95 | 0.43 | – | too few samples, not judged |
| window | launch_app | first | 1 | 2.01 | 2.74 | 1.69 | – | too few samples, not judged |
| window | launch_app | later | 4 | 0.28 | 0.45 | 0.5 | – | too few samples, not judged |
| window | move | first | 2 | 204.38 | 204.65 | 2.89 | – | too few samples, not judged |
| window | move | later | 2 | 186.06 | 169.77 | 0.87 | – | too few samples, not judged |
| window | press_key | first | 33 | 336.77 | 238.21 | 3.11 | [-235.45, -234.47] | faster |
| window | press_key | later | 3 | 167.86 | 134.85 | 0.74 | – | too few samples, not judged |
| window | scroll | first | 3 | 240.57 | 242.56 | 39.92 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.8 | 202.6 | 1.07 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 204.79 | 3.09 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.31 | 1.08 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.24 | 0.2 | [0.005, 0.08] |

