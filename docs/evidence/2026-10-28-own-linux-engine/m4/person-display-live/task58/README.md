# Task 58: T7's idle sitting on the person's display (`:0`)

The question (the Decision Log, M4 T7, "Not seen again"): M0.4 saw a `FocusOut` sent at 0 ms cut Chromium's keys on
`:0`; on the private Xvfb a 0 ms `FocusOut` alone cut nothing (task 56), and only the per-request recipe (the window's
redirect dropped after each request) cut. Does the plain 0 ms control cut on `:0`?

**Answer: no.** The plain 0 ms control cut nothing on `:0`: 0 of 40 runs (Chrome and the Electron fixture, burst and
A-B-A, 10 each). By the design session's rule ("if the 0 ms control does not cut on :0 either, stop and tell me"), the
sitting stopped there. The design session then ruled that M0.4's `:0` cut was the exit's unredirect (the code reading
below), so `:0` is where the exit settle and T7b's production stop are proven, and the exit case ran as a second step
(**The exit case on `:0`**, below): **160 of 160 runs passed**, the drain on every production path for the hold, the
burst and the handle, and the control's bursts on the same paths.

Nothing touched the person in either step: the owner's Chrome kept its pid, start time and window, the person's bus
names, pids and units were identical before and after, no guard flag fired, no decoy was hit, the watchdog never
stalled, no key or button was left down after any run, and nothing of the run was left.

## What ran

- **Harness:** the detached worktree `<harness checkout>` at b0c9acad, unmodified; xprobe rebuilt there
  (`cargo build --release --offline`).
- **Engine:** a musl build of b0c9acad made the release workflow's way (`scripts/build-musl.sh`, task 56's):
  `cua-engine 0.3.0 (b0c9acad4fb3)`, static-pie, sha256 `95b1f750948b3d6aef6244b8d13a17d183d4b4c8f2062103d57c1662fc9a3c6a`.
- **When:** 2026-11-04, 23:38:19–23:45:14 UTC, idle (`pgrep -x stress-ng` empty before the step and checked again by
  `run58.sh`). The only display user.
- **Guards:** task 50's, unchanged and used by path from `../scripts/` (sha256 `wrap50.py` `01983a1e…`,
  `owner-check.sh` `524b16ad…`, `owner-watch.sh` `8efddf6b…`, `tmp-watch.sh` `98c294f7…`). `run58.sh` is `run50.sh`
  with one change: the guarded command is a task-58 driver, not the harness's CLI. The step was a declared live run
  (the driver declares it) under the run's watchdog, with no whole-run RECORD (refused on a display without the private
  mark).
- **Driver:** `scripts/focus58.mjs`. The focus-timer experiment runs only on a private server it starts itself and knows
  no plain control, so the driver uses the experiment's exported code (scenarios, clean start, settled read, exact-text
  judge, series verdict, raw count) and copies its unexported series, run, audit and window functions with the lanes
  as their one change:
  - `timer`: the engine as it ships (no flags);
  - `control-0ms`: `--teardown-ms 0` alone, each request's `FocusOut` as its input ends, the redirect kept (session
    retention). This is the flag M0.4's key-pace experiment set on 0.0.1 (f637fcfa, whose default retention was also
    `session`); it is not the experiment's own `control` lane (`--teardown-ms 0 --retention per-request`).
- **Scenarios:** burst and A-B-A on the run's own Chrome (a run-owned `--user-data-dir`) and its own Electron fixture,
  both on the keys page, covered by the run's front window; every run on an independent start (the held tail delivered,
  the field emptied) and a fresh engine; timer series to 30 consecutive in at most 60, control 10 runs; then an audit
  pass per family and lane through xtrace with the engine's `--stats` records. No stop runs (the exit case goes through the
  production stop).
- **Driver smoke:** both drivers first ran on a private Xvfb (`runs/driver-smoke/`, `--trials 2`): the focus driver
  reproduces task 56's private result (the plain control cut 0 of 40), and the engine-stop driver passed 2 of 2 eof
  bursts there (engine gone 287–290 ms after the stream's end: the exit settle ran).

## Results (`runs/focus/`)

| family | lane | scenario | runs | misses (independent) | raw misses | tails met at the start | verdict | median burst ms |
|---|---|---|---:|---:|---:|---:|---|---:|
| chrome | timer | burst | 30 | 0 | 0 | 0 | 30 consecutive | 13.3 |
| chrome | timer | aba | 30 | 0 | 0 | 0 | 30 consecutive | 221.1 |
| chrome | control-0ms | burst | 10 | 0 | 0 | 0 | cuts nothing | 26.9 |
| chrome | control-0ms | aba | 10 | 0 | 0 | 0 | cuts nothing | 39.5 |
| electron | timer | burst | 30 | 0 | 0 | 0 | 30 consecutive | 13.9 |
| electron | timer | aba | 30 | 0 | 0 | 0 | 30 consecutive | 221.4 |
| electron | control-0ms | burst | 10 | 0 | 0 | 0 | cuts nothing | 35.3 |
| electron | control-0ms | aba | 10 | 0 | 0 | 0 | cuts nothing | 44.2 |

Raw consecutive counts equal the independent ones: no run met a tail at its start.

| family | lane | audit | FocusOuts attributed (deferred) | `after_input_ms` | sessions as expected |
|---|---|---|---:|---|---|
| chrome | timer | clean | 4 (4) | 100.09–100.23 | yes |
| chrome | control-0ms | clean | 44 (0) | 0.001–0.012 | yes, one per request |
| electron | timer | clean | 4 (4) | 100.10–100.20 | yes |
| electron | control-0ms | clean | 44 (0) | 0.001–0.011 | yes, one per request |

The control did what it stands for: every request's `FocusOut` reached the X server within 12 µs of its input, one
synthetic-focus session per request, and the text still arrived exact and in order (the audit runs' texts too).

## Why it differs from M0.4 (the code reading the design session ruled on)

M0.4's key-pace experiment (`experiments.mjs` `keyPace`, engine 0.0.1) closed each burst's engine **before** reading
the text, and 0.0.1 exited at once on its stdin's end: a 0 ms `FocusOut` there was followed within milliseconds by the
engine's exit, whose closed connection drops the window's redirect. That is the trigger task 56 found on the private
Xvfb (the redirect going away while Chromium still has keys queued). Today's engine reads the field while the engine
lives, and its exit waits the 300 ms settle before its redirects go. So M0.4's `:0` cut is consistent with the exit's
unredirect rather than the `FocusOut` alone, on Electron (a fresh fixture then and now) as well as on Chrome (M0.4's was
the person's running instance). This is an inference from the code of both experiments, not a measurement.

## The exit case on `:0` (`runs/engine-stop/`)

2026-11-05, 00:41:05–00:53:06 UTC, idle (`pgrep -x stress-ng` empty), the same engine, the same guards through
`run58.sh`, a declared live run with no RECORD. Driver `scripts/engine58.mjs`: the engine-stop experiment's exported
judges (`runPasses`, `enginesUnder`, `stoppedProcesses`, `engineStopVerdict`) and its session, run and scene functions
copied, with `serveEnv` unchanged (cua's engine as `CUA_LINUX_ENGINE_BIN`, `dedicated`, the computer surface alone, no
secrets, the scoped sandbox). Each run a fresh `cua serve` (on `remote`, cua's own Streamable HTTP handler in
`remote-serve.mjs` on a loopback listener with a run-only bearer), the run's own xterm and Chrome (keys page, covered).

- **The plan, as the coordinator's correction set it for `:0`:** the drain lane (b0c9acad's REPL host) on `hold`,
  `burst` and `handle`; the control lane (`control-f59575fb`, the REPL host before T7b, which SIGKILLs the tree at once)
  on `burst` only. No held-input control on `:0`: it would leave Shift or button 1 down on the person's display, and
  Xvfb already proved it (key 50/50, button 40/40).
- **Paths:** end_task's idle stop, the stream's end, SIGTERM to the REPL host's supervisor, a remote session's end
  (end_task, then DELETE). 10 runs each.
- **Additions to the copied run:** after every run the X server's keymap and buttons are read, and anything down would
  be released at once and stop the sitting; a handle starts only when the top window at its start, middle and end
  points is the run's (`Desktop.pointerSafeAt`). The release check was proven on a private Xvfb first
  (`runs/driver-smoke/release-negative/`: the control's hold left keycode 50 down, the driver released it, read the
  keymap empty and stopped the sitting after that run).

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 135.3 | 145.9 |
| drain | idle | burst | 10 | 10 | 364.2 | 372.6 |
| drain | idle | handle | 10 | 10 | 131.1 | 142.3 |
| drain | eof | hold | 10 | 10 | 68.7 | 81.9 |
| drain | eof | burst | 10 | 10 | 291.3 | 299.6 |
| drain | eof | handle | 10 | 10 | 97.9 | 117.4 |
| drain | signal | hold | 10 | 10 | 72.6 | 82.9 |
| drain | signal | burst | 10 | 10 | 290.6 | 298.8 |
| drain | signal | handle | 10 | 10 | 69.0 | 81.6 |
| drain | remote | hold | 10 | 10 | 163.9 | 178.5 |
| drain | remote | burst | 10 | 10 | 363.9 | 371.6 |
| drain | remote | handle | 10 | 10 | 152.2 | 166.1 |
| kill | idle | burst | 10 | 10 | 131.4 | 139.0 |
| kill | eof | burst | 10 | 10 | 66.0 | 74.2 |
| kill | signal | burst | 10 | 10 | 66.6 | 74.3 |
| kill | remote | burst | 10 | 10 | 145.8 | 154.0 |

- **Hold:** Shift was down before the stop in 40 of 40 and the keymap empty after it in 40 of 40.
- **Burst:** every key in order at the caret, 40 of 40 on the drain and 40 of 40 on the control (the control cannot cut
  through these paths, as ruled; it shows the paths ran). The drain's engine lived 281.7–394.0 ms after the stop (the
  300 ms exit settle), the control's 57.9–168.0 ms.
- **Handle:** button 1 down before the stop in 40 of 40, no button down after it in 40 of 40, and the pointer at the
  model's last point in 40 of 40; every handle's path was over the run's windows.
- **After every run** the keymap and buttons were empty (160 of 160): the driver never had to release anything.
- Every run found its session's one engine before the stop, left no process stopped, and on `remote` DELETE answered
  200 (40 of 40). Approvals were accepted only for the scene's own app (`Google-chrome`, `XTerm`, and `(desktop)` for
  the handle).
- The harness's trace: clean, 6,097 requests, no foreign change; the watchdog ended with 359 round trips; the run's
  Chrome `left: []`.

The person's side for this step: the owner watch read 71 times, none unread, `changed=0`; the guard sampled 5,805 times
over 4,413 run processes, `flags: []`, `decoy_connections: []`, `leftovers: []`, and its only outside peers were Xorg
`:0`, `bus_0` and the system bus. `owner-check.sh` after equals before except the mtime of `~/.config/google-chrome`,
which the owner's live Chrome writes (task 49); no run process held a path under it. The paths the run held under the
home were cua's own home (its run directory, its Node, its sandbox helper: the service's isolation, as on a private
display) and, from cua serve's cursor-identity lookup, `sminos who --session` of the agent session that ran the
sitting (the agent's tooling under `~/.claude`, not the person's).

## The person's side (the focus step)

- **Before:** two baseline readings a minute apart were identical (`runs/baseline/`), and equal to task 54's: the
  owner's Chrome pid 2546101, start 51157914, its client `0x600002` `google-chrome`/`Google-chrome`, Normal, 1050x780
  at 0,0, 2 windows, 1 viewable; 15 root children, 8 X connections; root `AT_SPI_BUS` `bus_0`; `org.a11y.Status`
  `true`/`false`.
- **During:** the owner watch read 41 times, none unread, `changed=0`. The guard: 3,334 samples (1,112 maps, 668
  socket tables) over 805 run processes and 48 browser processes; `flags: []`, `decoy_connections: []`,
  `leftovers: []`, `home paths {}`. The only outside peers were Xorg `:0`, the person's accessibility bus `bus_0` (by
  design) and the system bus. The run's Chrome and Electron had their NSS files only in the run's scratch home.
- **After:** `owner-check.sh` equal to before, with no difference at all (this time not even the owner's profile mtime).
  The run's Chrome `left: []`, the run's session bus and stand-in terminated, the TMPDIR empty and removed, no
  `/tmp/cua171-run-*`. The only `/tmp` writes outside the scratch were the trace proxies' sockets in `.X11-unix`, removed
  with each proxy. The active window at the end was the owner's `0x600002`, as at the start, never acted on; the holder
  was the run's xterm.
- **Witness rows:** no row of this sitting carries `witness_allowed` (it has no verdict samples), so no `focus after the
  request` sample was recorded.

## Privacy

`copy58.py` replaced every path of the home with a label (`<harness checkout>`, `<shared checkout>`, `<task58>`,
`<cua home>`, `<home>`), and the copied files contain no path of the home. `../scripts/privacy-check.py 2546101` scanned
31 files: its only hit is the generic `google-chrome-stable` name of the owner's unmapped leader window, which every
Chrome instance carries in its arguments (`scripts/title-hit.py` says which title matched without printing any title),
as in tasks 50 and 54. No image is kept. The app stderr files hold Chromium's zygote errors only.

## Files

- `runs/baseline/`: the two readings and their diff.
- `runs/focus/`: the guarded step (owner checks, owner and tmp watch logs, `wrap-summary.json.gz`, `guard-summary.txt`),
  `run/results.jsonl` (every run, series, audit and the summary), `runner.out`.
- `runs/engine-stop/`: the exit case's guarded step, laid out as `runs/focus/` (`guard-summary.txt.gz`).
- `runs/driver-smoke/`: the drivers on a private Xvfb (`focus/`; `engine-stop/`, the first driver's eof bursts;
  `engine-stop-all/`, every path, lane and case once; `release-negative/`, the after-run release's negative check).
- `scripts/`: `focus58.mjs`, `engine58.mjs`, `run58.sh`, `baseline.sh`, `cmp-baseline.sh`, `watch-events.sh`,
  `copy58.py`, `title-hit.py`, `build-musl.sh`.
