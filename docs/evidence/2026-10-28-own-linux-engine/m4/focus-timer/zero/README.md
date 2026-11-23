# Task 59: T7's `FocusOut` timer shortened to 0, the redirect retained

The question (the design session's ruling, 2026-11-04): with the 100 ms `FocusOut` shortened to 0 and the window's
redirect retained (the plain control, as an engine setting), does every family that takes background keys pass T7's
scenarios by the wait rule, idle and at twice the load? The pre-registered outcome: if every family passes, the timer
goes; if any family misses at 0, the timer stays, with that family's measured miss as its grounds.

**Answer: four families miss at 0, every miss in the key-then-paste scenario, and no key is ever cut.**

- Chrome, Electron and Firefox miss the paste scenario idle and at twice the load. gnome-terminal misses it idle only.
- In bursts and A-B-A, every family reached 30 consecutive at 0 ms, idle and at twice the load. No key was lost or
  reordered in any run at 0. Firefox's one A-B-A miss idle reads as the caret read one short (below).
- A miss is the paste's observation racing the keys sent just before it. It is not a `FocusOut` cutting keys. On the
  timer lane, the paste's flush (`engine/paste.rs`, `flush_all`) waits out the 100 ms since the window's last key
  before the paste observes its field, so those keys have landed. At 0 the flush returns at once, and the paste
  observes a field still missing some of the keys (in Chromium usually none of the 8; table below). Then one of two
  things happens:
  - `refused`: the revalidation just before the chord sees the field change and refuses with nothing sent. The keys
    are exact and in order; the paste is missing; the answer is a false error.
  - `unconfirmed`: the field holds still at the revalidation, the chord goes, and the paste lands exactly. But it
    lands at the caret after the keys, not at the observed caret, so the confirmation cannot find it. The answer is
    "could not be confirmed", and the engine's retry guard is raised.
- The redirect and the focus at the moment of a miss, from the kept trace (`traced-idle/`, Electron, trial 9): one
  `RedirectWindow` and no unredirect anywhere, so the redirect was held throughout. Each of the 8 key requests was its
  own synthetic-focus session (`FocusIn`, the key events, `FocusOut`), all closed. The paste's own session opened and
  closed with no input. The paste observed 7 of the 8 keys, the 8th landed after, and the revalidation refused.

By the pre-registered rule the timer stays. Its measured grounds are the misses below. But they are not the grounds
T7 gave the timer: no measurement here shows a `FocusOut` at 0 cutting keys, on any family, idle or at twice the load.
What fails at 0 is the wait the flush gives the paste before it observes. The design session decides what follows
(task 59's report).

## What ran

- **Harness:** exports of 58accbfa (`idle/`, `idle-firefox/`) and 858a8e74 (`traced-idle/`, `load2/`; it only adds
  `--trace`, which `load2/` does not use). Each was exported with `git archive`, its `node_modules` linked to the shared
  checkout's, and xprobe built there. The export has no `.git`, so the `meta` rows say `commit: null`.
- **Engine:** a musl build of the branch head 40b1e163, made the release workflow's way (`scripts/build-musl.sh`,
  task 58's with its build root renamed). It reports `cua-engine 0.3.0 (40b1e16329d6)`, static-pie, sha256
  `ff10321a279e89135efe62aa0efff98ba7f4ed6a10cea2d9cbc32373ce68c163`. 58accbfa and 858a8e74 change no engine source.
  These are dev runs, not a release gate.
- **Displays:** each sitting ran on a private Xvfb the harness starts itself, with Openbox and the run's own
  applications, homes and session bus. Nothing ran on `:0`. `pgrep -x stress-ng` was empty before every sitting. "Twice
  the load" is the harness's own 16 `stress-ng` CPU workers on 8 cores (`--load-factor 2`); the load average at the
  sitting's end was 16.45.
- **When:** 2026-11-05 UTC. `idle/` 01:50–02:36, `idle-firefox/` 02:44–02:52, `traced-idle/` 02:55–02:58, `load2/`
  03:06–04:05.
- **The lanes** (the engine flags today's `main.rs` parses, stated in each sitting's `focus-timer-display` row):
  - `timer`: no flags, the engine as it ships: a 100 ms `FocusOut` timer, session retention, the 300 ms exit settle.
  - `control-0ms`: `--teardown-ms 0` alone. Each request's `FocusOut` goes as its input ends (`route.rs` `defer`
    fires the timer at once), and the redirect is kept as the engine ships (`Retention::Session`; no
    `--retention`). Every flush then has nothing to wait for. The exit settle and the `TARGETS` wait are unchanged.
    This is task 58's `control-0ms`, and M0.4's key-pace flag. It is not the experiment's own `control`
    (`--teardown-ms 0 --retention per-request`), which this task does not run.
  - Both lanes ran in the same sitting for each family (`--lanes timer,control-0ms`): the timer lane's three
    scenarios, its audit pass, then the zero lane's, then its audit pass. There were no stop runs.
- **T7's measurement rules, unchanged:**
  - Every Chromium run starts clean: any held tail is delivered by a fresh engine's Shift, and the field is emptied.
  - A run after an unconfirmed paste waits out the retry guard (11 s).
  - The verdict counts independent runs, 30 consecutive in at most 60. Each series also reports its raw count.
  - A run passes when every answer is a success and the text at the caret is exactly the scenario's. Qt's
    unconfirmed paste is excused; its text is still judged.
- **Families:** the 8 of T7's matrix whose background keys cua sends and whose text the harness reads: Chrome,
  Electron, gedit (GTK 3), kate (Qt 5), qtcreator (Qt 6), Firefox (Gecko), Writer on gtk3, gnome-terminal (VTE).
  Left out, by `families.rs` and the matrix:
  - gnome-text-editor (GTK 4): it reads only XInput 2 input, and shared mode refuses its keys.
  - xterm and xterm with `allowSendEvents`: the `XTerm` class ignores synthetic keys, and the engine refuses them.
  - Writer on gen: it exposes no text, so no exact text can be read.
  - Calc, the GTK scale and table, and the AT-SPI probe scenes: none has a text field the experiment types into.
    Calc is Writer's GTK 3 VCL.

## Results

### Verdict per family, by the wait rule (30 consecutive independent runs in every scenario)

| family | timer, idle | control-0ms, idle | timer, 2x | control-0ms, 2x |
|---|---|---|---|---|
| chrome | passes | **misses** (paste) | passes | **misses** (paste) |
| electron | passes | **misses** (paste) | passes | **misses** (paste) |
| firefox | passes | **misses** (paste) | passes | **misses** (paste) |
| gnome-terminal | passes | **misses** (paste) | passes | passes |
| gedit | passes | passes | passes | passes |
| kate | passes | passes | passes | passes |
| qtcreator | passes | passes | passes | passes |
| writer | passes | passes (2 text misses in 35) | passes | passes (2 text misses in 35) |

Burst and A-B-A passed on every family and lane, idle and at 2x. Firefox's idle row is from `idle-firefox/` (below).

### The series that missed

| sitting | family | lane | scenario | runs | misses, by cause | raw misses | raw streak at the end |
|---|---|---|---|---:|---|---:|---:|
| idle | chrome | control-0ms | paste | 60 | 21 (refused 17, unconfirmed 4) | 24 | 4 |
| idle | electron | control-0ms | paste | 60 | 60 (unconfirmed 59, refused 1) | 60 | 0 |
| idle | firefox | control-0ms | paste | 60 | 40 (refused 25, unconfirmed 15) | 44 | 0 |
| idle | gnome-terminal | control-0ms | paste | 60 | 11 (refused 11) | 11 | 3 |
| 2x | chrome | control-0ms | paste | 60 | 28 (unconfirmed 17, refused 11) | 36 | 0 |
| 2x | electron | control-0ms | paste | 60 | 60 (unconfirmed 55, refused 5) | 60 | 0 |
| 2x | firefox | control-0ms | paste | 60 | 31 (unconfirmed 19, refused 12) | 41 | 0 |

The timer lane had no miss in any series, idle or at 2x.

### What each paste miss left (`scripts/paste-misses.py`)

| sitting | family | cause | runs | keys exact and in order | paste landed | text exact | keys the observation had seen (of 8; Chromium) |
|---|---|---|---:|---:|---:|---:|---|
| idle | chrome | refused | 17 | 17 | 0 | 0 | 0 in all 17 |
| idle | chrome | unconfirmed | 4 | 4 | 4 | 4 | 0: 2, 3: 1, 6: 1 |
| idle | electron | refused | 1 | 1 | 0 | 0 | 0 |
| idle | electron | unconfirmed | 59 | 59 | 59 | 59 | 0: 56, 1: 3 |
| idle | firefox | refused | 25 | 25 | 0 | 0 | – |
| idle | firefox | unconfirmed | 15 | 15 | 15 | 15 | – |
| idle | gnome-terminal | refused | 11 | 11 | 0 | 0 | – |
| 2x | chrome | refused | 11 | 11 | 0 | 0 | 0: 6, 2: 1, 3: 1, 4: 2, 5: 1 |
| 2x | chrome | unconfirmed | 17 | 17 | 17 | 17 | 0: 9, 1: 2, 2: 3, 3: 1, 4: 1, 7: 1 |
| 2x | electron | refused | 5 | 5 | 0 | 0 | 0 in all 5 |
| 2x | electron | unconfirmed | 55 | 55 | 55 | 55 | 0: 46, 1: 7, 2: 1, 5: 1 |
| 2x | firefox | refused | 12 | 12 | 0 | 0 | – |
| 2x | firefox | unconfirmed | 19 | 19 | 19 | 19 | – |

In every paste miss the 8 keys arrived exact and in order. Chromium's field is emptied before each run, so its observed
count is the number of keys seen. For the other families the row does not hold the count before the run, so the
column is not computed. Each missed run's row carries the engine's `FocusOut` records (`focus_outs`). Every record has
`after_input_ms` at most 0.041, and every one is reported on its own request's line (`scripts/check-claims.py`).

### The traced sitting (`traced-idle/`)

The four families that missed, paste only, both lanes, every run through xtrace (`--trace`), in development series of
10. The proxy delays every engine request, which narrows the race: the zero lane missed once in 60 runs (Electron,
refused), against 132 of 240 untraced. The traced sitting is not part of the verdict. Its one kept trace is
`traces/electron-control-0ms-paste-9.xtrace.gz`, read in the summary at the top.

### Audits

Every audit pass is clean, with one exception: `load2/` Electron `control-0ms`, where the paste run inside the audit
missed again. Its trace found no forbidden request and no attribution problem. The timer lane has 6 `FocusOut`s per
family, all deferred. The zero lane has 53 per family, none deferred, one synthetic-focus session per request, as
expected.

### Two misses that are not the paste race

- **Writer, paste, trials 3 and 4, in both sittings.** At the same document offsets in both (observed counts 2804 and
  2821), the harness read the text short in trial 3 and long in trial 4. In both trials the engine's own observation
  confirmed the paste where it should be. The misses repeat at the same offsets in two sittings, so they follow the
  document, not the load. The cause is not found; it reads as a harness read of Writer's paragraphs. Both series still
  reached 30 consecutive.
- **Firefox, A-B-A, idle, trial 21.** It read `XabcDefgHqrsTuvw` where `abcDefgHqrsTuvwX` was expected. Every A-B-A
  run ends window A with `X`, so this is what the text gives when the caret read before the run is one short. It is
  not verified from the row, which keeps no whole text. The series reached 30 consecutive (52 runs).

## Firefox on this VM (`idle/`'s skip, `idle-firefox/`)

Firefox was not measured in `idle/`. At 06:26 PST on 2026-11-04, `unattended-upgrade` replaced the Mozilla deb
`firefox 159.0~build1` with Ubuntu's transitional `1:1snap1-0ubuntu5` (`/var/log/apt/history.log`), and installed the
snap. The snap cannot start on the run's own session bus ("cannot create transient scope … org.freedesktop.systemd1
was not provided", `idle/apps/…-firefox-focus-a.stderr`). Nothing on the system was changed for this task. The same
Mozilla deb T7 ran on (`firefox_159.0~build1_amd64.deb`, sha256 `6c29655b…`) was fetched with `apt-get download`,
unpacked under the task's own directory, and put first on the harness's `PATH` as `firefox` (`Mozilla Firefox
159.0`). `idle-firefox/` is Firefox's idle sitting on it, both lanes. `traced-idle/` and `load2/` used it too.

## Files

- `idle/`, `idle-firefox/`, `traced-idle/` (with `traces/`), `load2/`: each sitting's `results.jsonl` (every run,
  series, audit and verdict), `summary.md`, `watchdog.jsonl` and the applications' stderr.
- `scripts/`: `build-musl.sh`, `verdicts.py` (the tables per series and per family), `paste-misses.py` (the paste
  misses' table), `misses.py` (each missed zero-lane run with its trace summary), `check-claims.py` (the `FocusOut` records of the misses and the not-clean audit).
