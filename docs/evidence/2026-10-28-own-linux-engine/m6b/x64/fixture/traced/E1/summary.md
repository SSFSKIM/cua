# linux-engine-diff summary

## pinned-E1 (experiment events; acceptance on the pinned release)

candidate: sha256 ef714179ac244114431275580f600d9dc340b3d62142a59d7563149a76cc119a, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.5 (77ed101d43ea); the pin's x64 asset of linux-engine-v0.4.5; native/linux-engine as at 77ed101d43ea9b071bd9783dd9bb3387733f9f6d, the checkout at 3722f2826ca8a8ff3c7a6e28e00ba765d10b077b; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/45335176072/attempts/1, built from 77ed101d43ea9b071bd9783dd9bb3387733f9f6d (refs/heads/engine-045) on a github-hosted runner

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
| desktop | click | first | 60 | 87.41 | 87.22 | 79.27 | [-8.85, -7.46] | faster |
| desktop | click | first in a scenario | 3 | 89.48 | 89 | 79.54 | – | too few samples, not judged |
| desktop | click | later | 80 | 46.48 | 30.68 | 13.17 | [-17.575, -17] | faster |
| desktop | click | later in a scenario | 1 | 158.27 | 92.72 | 25.6 | – | too few samples, not judged |
| desktop | drag_handle | first | 40 | 37.97 | 37.76 | 34.09 | [-3.86, -3.58] | faster |
| desktop | drag_handle | first in a scenario | 2 | 40.17 | 40.19 | 34.77 | – | too few samples, not judged |
| desktop | drag_handle | later | 80 | 33.01 | 30.33 | 0.86 | [-29.58, -29.335] | faster |
| desktop | drag_handle | later in a scenario | 2 | 33.43 | 30.17 | 0.87 | – | too few samples, not judged |
| desktop | drag | first | 40 | 328.08 | 107.49 | 45.32 | [-63.45, -61.75] | faster |
| desktop | drag | first in a scenario | 2 | 345.46 | 109.52 | 47.31 | – | too few samples, not judged |
| desktop | drag | later | 40 | 331.44 | 111.31 | 48.43 | [-63.15, -62.08] | faster |
| desktop | key_down | first | 80 | 51.82 | 1.61 | 0.96 | [-0.715, -0.595] | faster |
| desktop | key_down | first in a scenario | 4 | 54.85 | 3.97 | 2.03 | – | too few samples, not judged |
| desktop | key_down | later | 100 | 34.26 | 0.75 | 0.46 | [-0.34, -0.245] | faster |
| desktop | key_down | later in a scenario | 1 | 34.06 | 1.09 | 0.56 | – | too few samples, not judged |
| desktop | key_up | later | 80 | 33.53 | 0.18 | 0.36 | [0.16, 0.22] | **within the bound** |
| desktop | key_up | later in a scenario | 5 | 33.57 | 0.16 | 0.36 | – | too few samples, not judged |
| desktop | move_relative | first | 20 | 0.98 | 2.15 | 0.83 | [-0.24, 0] | same (within noise) |
| desktop | move_relative | first in a scenario | 1 | 3.37 | 4.13 | 2.01 | – | too few samples, not judged |
| desktop | move_relative | later | 60 | 0.3 | 0.84 | 0.4 | [0.055, 0.22] | **within the bound** |
| desktop | move_relative | later in a scenario | 2 | 33.85 | 17.35 | 0.47 | – | too few samples, not judged |
| desktop | move | first | 20 | 83.14 | 84.27 | 75.01 | [-8.42, -7.83] | faster |
| desktop | move | first in a scenario | 1 | 85.17 | 86.79 | 76.82 | – | too few samples, not judged |
| desktop | move | later | 60 | 8.57 | 6.18 | 0.62 | [-5.695, -5.505] | faster |
| desktop | move | later in a scenario | 2 | 38 | 20.12 | 0.6 | – | too few samples, not judged |
| desktop | press_key | first | 140 | 68.94 | 35.14 | 1.14 | [-34.105, -33.905] | faster |
| desktop | press_key | first in a scenario | 7 | 71.46 | 37.68 | 2.15 | – | too few samples, not judged |
| desktop | press_key | later | 160 | 67.83 | 34.38 | 0.63 | [-33.815, -33.72] | faster |
| desktop | press_key | later in a scenario | 1 | 68.02 | 34.41 | 0.56 | – | too few samples, not judged |
| desktop | scroll | first | 20 | 73.58 | 74.66 | 73.76 | [-0.09, 0.3] | same (within noise) |
| desktop | scroll | first in a scenario | 1 | 76.17 | 79.76 | 74.64 | – | too few samples, not judged |
| desktop | scroll | later | 40 | 256.62 | 240.66 | 219.51 | [-21.425, -20.92] | faster |
| desktop | scroll | later in a scenario | 1 | 440.33 | 409.74 | 366.16 | – | too few samples, not judged |
| window | activate_window | first | 1 | 3.03 | 3.07 | 1.8 | – | too few samples, not judged |
| window | click | first | 7 | 218.71 | 222.95 | 16.4 | – | too few samples, not judged |
| window | click | later | 3 | 0.51 | 0.71 | 0.34 | – | too few samples, not judged |
| window | drag | first | 2 | 595.17 | 311.19 | 35.13 | – | too few samples, not judged |
| window | drag | later | 2 | 202.53 | 203.57 | 1.08 | – | too few samples, not judged |
| window | key_down | first | 10 | 240.96 | 205.12 | 3.81 | – | too few samples, not judged |
| window | key_down | later | 4 | 67.29 | 51.04 | 0.76 | – | too few samples, not judged |
| window | key_up | first | 1 | 3.55 | 2.5 | 1.55 | – | too few samples, not judged |
| window | key_up | later | 13 | 134.1 | 100.91 | 0.6 | – | too few samples, not judged |
| window | launch_app | first | 1 | 4.25 | 3.89 | 2.57 | – | too few samples, not judged |
| window | launch_app | later | 4 | 1.33 | 0.93 | 1.06 | – | too few samples, not judged |
| window | move | first | 2 | 205.44 | 205.63 | 3.88 | – | too few samples, not judged |
| window | move | later | 2 | 185.22 | 170.06 | 0.98 | – | too few samples, not judged |
| window | press_key | first | 33 | 338.7 | 240.07 | 5.04 | [-236.42, -234.14] | faster |
| window | press_key | later | 3 | 167.47 | 134.42 | 0.76 | – | too few samples, not judged |
| window | scroll | first | 3 | 241.14 | 244.37 | 40.8 | – | too few samples, not judged |
| window | scroll | later | 6 | 202.45 | 202.27 | 0.78 | – | too few samples, not judged |
| window | type_characters | first | 0 | – | 206.82 | 4.23 | – | too few samples, not judged |
| window | type_characters | later | 0 | – | 502.29 | 1.24 | – | too few samples, not judged |

Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):

| route | command | series | cua | bar | cua − faster, 95% interval |
|---|---|---|---:|---:|---|
| desktop | key_up | later | 0.36 | 0.18 | [0.16, 0.22] |
| desktop | move_relative | later | 0.4 | 0.3 | [0.055, 0.22] |

