# The harness's isolation, live on a private display, with Chrome (#171 M4, task 49, part 1)

This is the live check of tasks 43, 45, 47 and 48 on a private display: the run's own Chrome on the run's profile and
home, Electron, and every family, through the harness itself. Task 46's check (`../README.md`) ran without any
Chromium; this one runs them. The person's-display items (Qt's control on `:0` among them) belong to task 50.

- **Harness:** the detached worktree `~/.local/share/cua-171/live-43` at 297f8c20, unmodified. node_modules is linked;
  xprobe was built there from the same source (`cargo build --release --offline`, already current).
- **Engines:** the pinned vendor build 26.928.40906, the newest 26.1023.51421, and cua-engine 0.3.0 musl (sha256
  `5b7e38cf…`, task 42's build; the engine is unchanged since 7ad6f03d).
- **When:** 2026-11-03, VM time 00:46–01:27 (08:46–09:27Z). No other live display user was on the VM.
- **No RECORD:** part 1 runs none. The harness's own command line runs through `scripts/norecord.mjs`, which gives every
  Desktop's `begin` the record hook its tests use (`startRecord: async () => null`) and changes nothing else. Each end
  row therefore says `record: {skipped: …}`.

## How it ran (`scripts/`)

- **`run-session.sh`** is one guarded session. It reads the person's side before and after (`owner-check.sh`) and
  watches it during the run from outside the guarded tree (`owner-watch.sh`). The session runs under `wrap.py`, with a
  TMPDIR of its own that must be empty afterwards. `stop-watch.sh` ended the whole session on any stop condition
  (none fired).
- **`wrap.py`** is task 46's guard with Chrome allowed and three additions.
  - It is a child subreaper, and the person's two bus variables point at decoys that log any connection.
  - Every ~110 ms it samples each run process's fd targets and cwd. Every third sample it also reads `/proc/<pid>/maps`,
    and every fifth `ss -xpn`.
  - **Stop conditions:**
    - any path under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`;
    - `~/.pki` coming into existence;
    - a Chrome or Electron process whose readable HOME is not the run's;
    - a Chrome browser process whose `--user-data-dir` is not exactly one directory under the run's TMPDIR;
    - a run process connected to `/run/user/501/bus`, `/run/user/501/at-spi/bus_0` or `:0`'s X socket.
  - It also records which NSS databases the run's browsers hold, and the NSS libraries they map.
- **`session.mjs`** sets up the display and runs each phase on it.
  - The display comes from the harness's `startPrivateServer`, under its watchdog and with the private mark.
    `XAUTHORITY` is unset, as task 45's item 8 asks.
  - Openbox runs, and an xterm `person` is active at the start.
  - A display sampler records every window that appears, at first sight and 2 s later: class, name, state,
    transient-for and type. Every window on this display is the run's or the session's own.
- **`owner-check.sh`** reads the person's side, and only reads it:
  - the owner's Chrome (found by its command line), its pid and start time;
  - `:0`'s `_NET_CLIENT_LIST` and each window's `WM_CLASS`, never a title;
  - the well-known names on the person's session bus with their pids (`busctl --user list`), and the running user
    services;
  - the mtimes of the person's files task 45's list names (metadata only).
- **`appbus.mjs` and `probe.mjs`** are drivers on the harness's own `Desktop`, described below.

## The person's side: untouched

Sessions `part1`, `appbus`, `probe` and `gte`, plus part 2's two sessions (`../../record-judge-acceptance/`), each
gave the following.

- **The owner's Chrome:** pid 2546101, start time 51157914 ticks, before and after every session. `owner-watch.sh`
  confirmed it every 10 s (182 checks in part 1).
- **`:0`:** one client, `"google-chrome", "Google-chrome"`, before, during and after.
- **The person's session bus:** the same well-known names with the same pids before and after. The same running user
  units. No new activation.
- **No run process reached the person:**
  - none held an fd, cwd or mapping under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`;
  - none connected to the person's session bus, the person's accessibility bus, or `:0`;
  - the decoys took no connection.

  Part 1 covered 2,391 processes: 14,456 fd/cwd samples (median gap 120 ms, max 229 ms), 4,820 maps samples and 2,892
  socket-table samples.
- **`~/.pki` never existed.** It was absent before and after, and at each of the 2,892 socket-table checks. The run's
  Chrome and Electron opened their NSS database in the run's home: `<run scratch>/home/.local/share/pki/nssdb`
  (`cert9.db`, `key4.db`). Chrome's and Electron's browser processes mapped `libsoftokn3.so` and `libnssckbi.so`, so
  NSS did initialise, on the run's database.
- **mtimes:** every path on the list is unchanged, `~/.config/dconf/user` included, except `~/.config/google-chrome`.
  That directory is the owner's live Chrome's own: it moved 30 minutes apart in session `smoke-1` too, where the run
  failed before any display or Chrome existed. Its contents were never listed.
- **Person's-home paths held by a run process:** only `~/.cache/openbox/openbox.log`, held by the session's own
  Openbox. The harness's applications held none.

## Chrome (task 43's list, carried by task 45's item 5)

| item | result |
|---|---|
| one window per open, no first-run, privacy, search-engine or keyring prompt | The display sampler saw 15 Chrome windows in `run-chrome` and 4 in `matrix`. Each is titled `<label> - Google Chrome` and carries the run's label and nonce (one read `Untitled - Google Chrome` at first sight, before its page loaded, and its label 2 s later). No other Chrome window ever appeared (`windows.jsonl`) |
| title | `cua171-diff-t49-…-<scene> - Google Chrome`, with no profile suffix |
| `--force-renderer-accessibility` trees | The chrome scene: 243 nodes for every engine, 2,234 a11y-bus calls (T5: 243 nodes, 2,229 and 2,220; the difference is all `Properties.Get`, the page's own state). The matrix page: 222, as T5 |
| not maximized | `_NET_WM_STATE` was empty at first sight and 2 s later on all 19 windows |
| handoff | One browser process per run with the run's profile (601 s and 995 s). Later opens were clients that lived under one sample (0 s) |
| `WM_CLASS` | `"google-chrome (<run scratch>/chrome-profile)", "Google-chrome"`. The class part is unchanged, as task 43 predicted |
| command line and HOME | Every Chrome browser process named exactly the run's `--user-data-dir`. Every Chrome or Electron process whose environment was readable had the run's HOME (9 processes; 114 had it hidden by Chrome's process-title rewrite) |
| the end | `desktop.chrome`: spawned 15 and 5, `terminated: []`, `killed: []`, `left: []`. The browser quit by itself as its last window closed. After each phase no process of the run was left, and the run's scratch (profile and home) was gone |
| timing noise | See finding 4: the first seconds of a fresh profile change the scene page's tree once |

## The private session bus and the families (tasks 43, 45, 47)

- **The bus.**
  - Each run started its own `dbus-daemon`, and the display's root `AT_SPI_BUS` named the run's launcher
    (`/run/user/501/at-spi/bus_1`).
  - `bus_0` stayed at inode 58, mtime 2026-10-28.
  - After each phase:
    - root `AT_SPI_BUS` was unset and `bus_1` was gone;
    - no `session.conf` daemon remained, and no launcher or registryd but the person's (9909, 10052);
    - each end row's session says `terminated: true, killed: false`.
- **The environments** (`analysis.jsonl`, `environments`):
  - every application had the run's HOME and the run's session bus, with `AT_SPI_BUS_ADDRESS` unset;
  - the harness's own tools (node, engines, xprobe, xtrace, dbus-monitor, xdotool, `sleep`) kept the harness's HOME,
    with the run's bus and the run's accessibility bus;
  - only the session's own processes carried the decoys.
- **The launcher** ran on the memory backend and the run's home. `qt-bridge`'s table reads `IsEnabled true` on the
  run's bus, and it set and restored the conditions there. Firefox got its tree (68 nodes).
- **qt6-input and qtcreator** registered with `AT_SPI_BUS_ADDRESS` unset (1 and 1,261 nodes, task 46's finding 1
  fixed).

Every family's tree, read by cua-engine through the run's accessibility bus (the matrix's `matrix-identity` rows),
against T5's `:0` reads (`m4/identity/probes/family-reads-final.jsonl`):

| family | here | T5 | | family | here | T5 |
|---|---|---|---|---|---|---|
| gedit | at_spi 486 | 498 | | firefox | at_spi 68 | 68 |
| gnome-text-editor | at_spi 64 | 64 | | chrome | at_spi 222 | 222 |
| gtk4-button | at_spi 3 | 3 | | electron | at_spi 28 | 28 |
| gtk4-input | at_spi 11 | 11 | | writer | at_spi 1964 | 1964 |
| qt5-input | at_spi 1 | 1 | | writer-gen | x11 | x11 |
| qt6-input | at_spi 1 | 1 | | gtk-table | at_spi 41 | 41 |
| qt5-breeze | at_spi 2 | 2 | | calc | at_spi 2431 | 2431 |
| qt5-fusion | at_spi 2 | 2 | | xterm | x11 | x11 |
| gtk-scale | at_spi 2 | 2 | | xterm-allow | x11 | x11 |
| kate | at_spi 893 (caption) | 892 | | gnome-terminal | at_spi 49 | 49 |
| qtcreator | at_spi 1261 | 1261 | | | | |

19 of 21 are equal. The two that differ:
- **gedit: 486 here, 480 in `appbus`, 498 in T5 and task 46.** Both earlier reads ran with the person's HOME. This is
  task 45's predicted baseline shift (item 12): gedit now runs on a fresh home with default preferences and no recent
  files. Its tree also varies between opens in one sitting.
- **kate: 893 against 892,** read by the caption rule as on `:0`. It is a fresh kate configuration in the run's home.

The matrix itself ends "incomplete", for reasons that have nothing to do with isolation (finding 6).

## The activate-nothing bus on a private display (`runs/appbus/`, task 47's items 1 and 2)

`appbus.mjs` builds, on the private display, what a person's display gives the run:
1. a session standing for the person's: the harness's own `startPrivateSession`, a launcher on a bus of its own, which
   marks the root's `AT_SPI_BUS`;
2. on top of it, the applications' session of a person's display: `startAppSession`, a bus that activates nothing,
   with the stand-in for `org.a11y.Bus`.

Every family then opens as the harness opens it. Then the stand-in is stopped (`stopStub`) and the Qt families open
again with the bridge check skipped, as qt-bridge's control does. Reads are by cua and pinned.

- **With the stand-in, every family read as above**, with two exceptions:
  - chrome read 221 (one node fewer);
  - gnome-text-editor read the X11 tree. That is finding 1, a GTK 4 timing defect: `probe` shows the same on the
    ordinary private bus, and the window's tree is there 15 s later.

  Qt 5 and Qt 6 both registered: qt6-input 1, qtcreator 1,261, kate 893.
- **The control, with the stand-in stopped:**

  | family | Qt | cua | pinned |
  |---|---|---|---|
  | qt6-input | 6.4 | x11 1 | x11 |
  | qtcreator | 6.4 | x11 1 | x11 |
  | qt5-input | 5.15 | at_spi 1 | at_spi |
  | kate | 5.15 | at_spi 893 | x11 (as always) |

  Qt 6 needs `org.a11y.Bus`, as task 47 read from the source. **Qt 5.15 does not** (finding 3).
- Nothing touched the person: 1,472 samples over 289 processes, with no stop condition and no decoy connection. The
  person's side was unchanged.

## Findings

1. **The first GTK 4 window of a run settles as an X11 tree.** The run's home starts with an empty Mesa shader cache.
   - GTK 4's GL renderer compiles its shaders first, and the window maps before its tree is on the bus.
   - `settle` takes the first two equal reads 500 ms apart, so the window settles as `x11`, with no field. The tree is
     on the bus 15 s later.
   - Shown three ways (`probe/`, `gte/`; one window each, on the run's real private bus):

     | shader cache | result |
     |---|---|
     | cold | x11 |
     | warmed by a run before, in the same session | at_spi 64 |
     | none needed: `GSK_RENDERER=cairo`, cold | at_spi 64 |
   - The matrix's first gnome-text-editor window (pinned lane) lost its field the same way.
   - It **stops the record-judge run**: run.mjs throws `…gnometexteditor-cua has no field to type into` (part 2,
     attempt 1).
   - It did not occur with the person's HOME (task 46), whose cache is warm.
   - Candidate fixes, for the harness:
     - `settle` waits for an AT-SPI tree for a family that always registers (GTK 4 does), within its bound;
     - or the run's scratch holds one shader cache (`MESA_SHADER_CACHE_DIR`) warmed by the run's own first GTK 4 window.

     `GSK_RENDERER=cairo` would change how GTK 4 draws.
2. **Applications and the vendor engines write the run's TMPDIR, which is not the run's scratch.** The harness's runs
   leave these in `/tmp`:

   | writer | what |
   |---|---|
   | Qt Creator | `QtCreator-*`, and its single-instance socket `qtsingleapplication-<hash>-1f5` with its lockfile and `qipc_*` files |
   | LibreOffice | `lu*.tmp` |
   | Firefox | `tmp-*.xpi`, `*.zip` |
   | Chrome | `.com.google.Chrome.*`, `chrome_url_fetcher_*` |
   | both vendor builds' `sky_linux_x64` | `<pid>_<ns>.jpg` screenshots |

   - This session's TMPDIR caught them, and they were removed. `/tmp` already holds 3,004 such jpgs, 175 `lu*.tmp`, 76
     `QtCreator-*`, 195 `tmp-*.xpi` and 4 `qtsingleapplication*` from earlier runs (names counted, nothing opened).
   - **The Qt Creator socket also matters for isolation on `:0`.** QtSingleApplication names its instance socket in
     TMPDIR from the application and the user, not from HOME. On `:0` the run's Qt Creator and a person's would share
     that socket and lock. Task 43 read that Qt Creator joins an instance only with `-client`, `-block` or `-pid`.
   - Candidate fix: `TMPDIR=<scratch>/tmp` in `launchEnvironment`, and for the engines. That is one more variable the
     run decides.
3. **Qt 5.15 registers without `org.a11y.Bus`, and with `IsEnabled` false.** On Ubuntu's Qt 5.15.13, kate and
   qt5-input reach the bus through the root's `AT_SPI_BUS`:
   - with the stand-in stopped (`appbus`);
   - in `qt-bridge`'s "IsEnabled false" row (kate registered, 893).

   Qt 6.4.2 (qtcreator, qt6-input) does need it. So task 48's live list expects too much of the control on `:0`: there,
   **kate is expected `registered true` without the stand-in, and qtcreator `false`.** The stand-in is still needed
   for Qt 6.
4. **A fresh profile changes the chrome scene's tree once, early.**
   - The first block's pinned reads differ at node 113 (a `description`, "You") from every later read by every engine.
   - The run's equality check compares the first samples, so `chrome tree cua` fails as "the output differs from the
     vendor's".
   - Every read after the first seconds is identical (digest `22b505c8…` across 13 blocks and top-ups).
   - For T10–T14: let the run's Chrome settle, or open a first window, before the first measured read.
   - Measured in the run's instance: Chrome tree warm medians of pinned 459 ms, newest 449 ms and cua 56 ms.
5. **The vendor builds' `SKY_CLIPBOARD_STOP` client messages are counted as foreign** (`run-chrome`, chrome-textarea
   `type_text`, pinned and newest only).
   - They go to the vendor's own clipboard windows on other connections (`0x02400000`, `0x02600000`). On this display
     there is no foreign window at all.
   - This is T5's known attribution edge (`m4/identity/README.md`, the paste run), now in the route audit too.
   - It is still open; cua's lane has none.
6. **The matrix judges by rules from before the device mode.**
   - cua's shared-mode refusals count as "audited requests failed": gnome-text-editor, GTK 4, Firefox's click, xterm.
   - Families whose fields are not in their tree count "effects could not be read": the Qt input scenes, gtk-scale,
     gtk-table, calc.
   - So `--experiment matrix` over every family ends incomplete whatever the display. Its trees and isolation evidence
     stand.
7. **kate asks "Close Document" when the run closes it** (4 dialogs in the matrix). The scene's group kill ends it.

## Files

- `runs/part1/`: the main session.
  - Phases `run-chrome` (`--scene chrome,chrome-textarea,identity --ops all --blocks 1`), `matrix` (every family,
    `--samples-input 1 --samples-text 1`) and `qt-bridge`.
  - Its `appbus` phase failed on a path bug of the driver's, before reading anything, and was rerun as `runs/appbus/`.
  - Each phase's `results.jsonl(.gz)` and `summary.md`.
  - The session's `session.jsonl`, `windows.jsonl`, `wrap-summary.json.gz`, `analysis.jsonl` (`scripts/analyze.py`),
    and `owner-*.txt`.
- `runs/appbus/`, `runs/probe/`, `runs/gte/`: the activate-nothing bus, and finding 1's probes.
- `runs/smoke-2/`: the first Chrome run (chrome tree only). `smoke-1` failed at the server's start (`DISPLAY` unset
  before the session declared its live run); only its reads of the person's side are kept, which show the owner's
  Chrome moving `~/.config/google-chrome` with nothing of the run's running.
- `scripts/`:
  - the tooling, and the phase files;
  - `run-session.sh` takes absolute paths. Part 1 ran an earlier copy that took the out directory relative, which put
    the phases' results in the worktree; they were moved out, and the worktree is clean.
  - `copy-part1.sh` and `evidence.py` copy these files here.
