# Task 23: the whole-branch review's fixes, measured

The whole-branch review of M3 found three issues. Task 23 fixed them: the facade's launch now gets the late
drag-and-drop notice (`preflight`), the atomic press's server grab is capped at 8 samples, and the in-front allowance
now requires its grabs and drag windows to be gone. This directory holds the live measurements of the cap, which the
design session asked for. Every run here used a private Xvfb display (1280x800, the same as the #171 VM's `:0`). Each
display had its own session bus, Openbox and AT-SPI bus, and a Chrome with its own profile (`tools/private.sh`,
`tools/bin/google-chrome`). The person's `:0` and its Chrome were never touched. The engine was the release build of
596ec1c5's sources, without the `live` feature.

## The undisturbed set with the cap

`runs/inside24.*` reruns task 20's undisturbed set (`../task20-build/tools/track.mjs` with `PARKS=inside`, through
`tools/undisturbed.sh`). That is 24 trials of a fresh engine per lane, shared and `--desktop dedicated`, and one 40 px
drag of each of the five kinds per trial, with the real pointer parked inside Chrome away from every path: 240 drags.

- **240 of 240 landed, with 0 stray answers.** The watch saw nothing on the non-drop kinds, and Chrome's own drag-loop
  grab (`leave_grab`) on every drop, as in task 20.
- **The grab:** p50 0.685 ms, p99 1.590 ms, max 1.985 ms. Every press sent 5 samples and crossed the threshold under
  the grab (`crossed` true on 240 of 240), so the cap never applied. Ordinary paths stay fully protected.

## The cap on a path that does not cross

`runs/jitter.*` is from `tools/jitter.mjs`: a text selection on the same page whose path first jitters 200 times within
2 px of the press, then goes 40 px right. The press therefore reaches Blink's threshold only at the path's end. Each
engine ran 10 trials, each with a fresh engine and the pointer parked inside.

| engine | drags | ok | landed | samples under the grab | grab p50 | grab max |
|---|---|---|---|---|---|---|
| before the fix (5e76a647, task 22's build) | 10 | 10 | 10 | 1004 | 88.4 ms | 99.7 ms |
| the fix (596ec1c5) | 10 | 10 | 10 | 8 (`crossed` false) | 1.12 ms | 1.61 ms |

Before the fix, this input held the server for about 90 ms, the window manager and every other client included. With
the cap, the grab is held for about a millisecond. The rest of the path goes out with the grab released, and the
selection still lands every time, with no stray answer.

## The Chrome device scenes under the stricter in-front judge

`runs/dev23/` is the harness's Chrome device scenes (`device-chrome`, `device-chrome-dnd`, every case, 2 blocks), run
through `tools/device.sh` on a private display. The run used the engine above and the harness of a206f38d. In that
harness, an in-front request's span must end with its client's drag windows unmapped and its keyboard grab released,
and the post-request check (a quiet 300 ms, no grab held) runs after it. This is not M3's gate, and it is not run on
`:0`.

- The run is valid and every verdict passes: 16 of 16 device verdicts, and the standing checks held (the activating
  stub, the foreground checks and the in-front checks).
- The four cases under the in-front allowance (`chrome_dnd_in_front_shared`, `chrome_dnd_short_in_front_shared`,
  `chrome_dnd_short_pointer_outside_shared` and `chrome_select_nudged_shared`) had 24 samples between them. Every one
  was recorded in front, and every one had a clean witness under the new rules and the post-request span. Real Chrome
  drops release their grab and unmap their drag windows within the request's span.

## Tools

- `tools/private.sh`, `private-inner.sh`, `bin/google-chrome`: the private display and the private Chrome.
- `tools/undisturbed.sh`, `undisturbed-inner.sh`: the undisturbed set (task 20's `track.mjs`).
- `tools/jitter.mjs`, `jitter-table.py`: the jitter probe and its table.
- `tools/device.sh`, `device-table.py`: the harness's Chrome device scenes on a private display, and their per-case
  table (`runs/dev23/device.txt`).

The tables come from `../task20-build/tools/press-table.py` (`inside24.txt`) and `tools/jitter-table.py`
(`jitter.txt`). The raw records stay on the VM under `~/.local/share/cua-171/task23/runs/`.
