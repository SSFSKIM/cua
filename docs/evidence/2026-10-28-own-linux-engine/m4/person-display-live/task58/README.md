# Task 58: T7's idle sitting on the person's display (`:0`)

The question (the Decision Log, M4 T7, "Not seen again"): M0.4 saw a `FocusOut` sent at 0 ms cut Chromium's keys on
`:0`; on the private Xvfb a 0 ms `FocusOut` alone cut nothing (task 56), and only the per-request recipe (the window's
redirect dropped after each request) cut. Does the plain 0 ms control cut on `:0`?

**Answer: no.** The plain 0 ms control cut nothing on `:0`: 0 of 40 runs (Chrome and the Electron fixture, burst and
A-B-A, 10 each). By the design session's rule ("if the 0 ms control does not cut on :0 either, stop and tell me"), the
sitting stopped there: the exit case through the production stop (`engine58.mjs`) was **not run on `:0`**.

Nothing touched the person: the owner's Chrome kept its pid, start time and window, the person's bus names, pids and
units were identical before and after, no guard flag fired, no decoy was hit, the watchdog never stalled, and nothing of
the run was left.

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
  pass per family and lane through xtrace with the engine's `--stats` records. No stop runs (the exit case was to go
  through the production stop).
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

## Why it may differ from M0.4 (for the design session; not measured further, by the rule)

M0.4's key-pace experiment (`experiments.mjs` `keyPace`, engine 0.0.1) closed each burst's engine **before** reading
the text, and 0.0.1 exited at once on its stdin's end: a 0 ms `FocusOut` there was followed within milliseconds by the
engine's exit, whose closed connection drops the window's redirect. That is the trigger task 56 found on the private
Xvfb (the redirect going away while Chromium still has keys queued). Today's engine reads the field while the engine
lives, and its exit waits the 300 ms settle before its redirects go. So M0.4's `:0` cut is consistent with the exit's
unredirect rather than the `FocusOut` alone, on Electron (a fresh fixture then and now) as well as on Chrome (M0.4's was
the person's running instance). This is an inference from the code of both experiments, not a measurement.

## The person's side

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
- `runs/driver-smoke/`: the two drivers on a private Xvfb.
- `scripts/`: `focus58.mjs`, `engine58.mjs` (written and smoked; not run on `:0`), `run58.sh`, `baseline.sh`,
  `watch-events.sh`, `copy58.py`, `title-hit.py`, `build-musl.sh`.
