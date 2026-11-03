# The harness's isolation, live on a private display (#171 M4, task 46)

This is the live check of task 43 and of task 44's watchdog. Task 43 gave the harness instances of its own and a
private session bus on private displays; task 44 added the watchdog. The harness ran at 619f3c2c, from a detached
worktree. The engines were the pinned vendor build 26.928.40906, the newest 26.1023.51421, and cua-engine 0.3.0 musl
(sha256 `5b7e38cf…`, task 42's build). Date: 2026-11-02, VM time 21:18–21:26 (2026-11-03 05:18–05:26Z).

**Scope as narrowed by the design session.** No Chrome of the run started. With the owner's Chrome running again, a run
Chrome would open the person's `~/.pki` NSS database, which the rule forbids until task 45 gives applications their
own HOME. For the same reason Electron was not run either: it is Chromium, and Chromium's NSS layer opens the same
database. These checks are left for task 45's live check: the Chrome items of task 43's list, the `~/.pki` check,
Electron, and T4c's record-judge acceptance (whose activating stub is a Chrome window). No whole-run RECORD ran:
`begin`'s record hook answered none.

## How it ran (`scripts/`)

- **`wrap.py`** is the outer guard. It is a child subreaper, so every process of the run stays in its tree. It also
  provides two decoy buses that answer nothing and log each connection (with the peer's pid): one stands for the
  person's session bus (`DBUS_SESSION_BUS_ADDRESS`), one for the person's accessibility bus (`AT_SPI_BUS_ADDRESS`).
  Every 110 ms (median; 148 ms at most) it samples each descendant's fd link targets and cwd. Every fifth sample it
  also reads `ss -xpn`.
- **Stop conditions in `wrap.py`.** Any of these sends SIGTERM to the harness driver, which is the harness's own stop:
  - a path under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`;
  - a Chrome process of the run;
  - a run process connected to `/run/user/501/bus` or `/run/user/501/at-spi/bus_0`.

  None of them fired.
- **`session.mjs`** sets up the display and runs each phase on it:
  - the display comes from the harness's `startPrivateServer` (Xvfb `-displayfd`, the watchdog from its first
    client, then the private mark);
  - an authority file of its own; Openbox; an xterm `person`, active at the start;
  - each phase runs as a driver, and after each one the session looks for anything of the run's left behind.
- **`driver.mjs`** runs the harness's own `Desktop`: its watchdog, its private session bus, its xtrace trace, its stop
  and its end. Its phases:
  - `families`: every non-Chromium family, opened by `families.mjs` `openFamily`. Each window's tree is read by the
    three engines (each a fresh process, `get_window_state` without a screenshot), each read inside its own
    `dbus-monitor` pass on the run's accessibility bus (`busmon.mjs`). The oracle's toolkit read gets a pass of its own.
  - `qt6`: the Qt 6 diagnosis below.
  - `sigterm`: `begin` only. `session.mjs` sends SIGTERM the moment `at-spi-bus-launcher` is a descendant of the
    driver, which is while `GetAddress` is in flight.
- **`owner-check.sh`** makes the read-only checks of the owner's Chrome and of `:0`: the main process's pid and start
  time, `_NET_CLIENT_LIST`, and each window's `WM_CLASS`, never a title.

## Results

### The owner's Chrome and `:0` (`runs/owner-*.txt`)

- Before, after the families run, and after the Qt 6 run, the owner's Chrome was unchanged: pid 2546101, start time
  51157914 ticks, `/opt/google/chrome/chrome`.
- `:0`'s client list held one window, `"google-chrome", "Google-chrome"`, at every check.
- Twelve `chrome` processes ran at every check, all of them the owner's. The run started no Chromium-like process
  (`guard-summary.jsonl`, `chromium_like: []`).

### The run's processes (`runs/guard-summary.jsonl`, `runs/*/wrap-summary.json`)

In 1,354 samples over 318 processes in the families run, and 427 samples over 57 processes in the Qt 6 run:

- no fd or cwd named a path under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`;
- no run process held a connection to the person's session or accessibility bus;
- the decoys took no connection;
- nothing of the run was left.

These are samples, so an fd opened and closed between two of them is not seen.

Paths under the person's home that a run process held:

| Process | Path |
|---|---|
| Firefox's `crashhelper` | `~/.config/mozilla/firefox/Crash Reports/crash_helper_server.log` |
| kate | `~/.cache/ksycoca5_*` |
| the session's own Openbox, not the harness | `~/.cache/openbox/openbox.log` |

### The private session bus (task 43's list, "The private session bus", and the fix's three items)

1. **`begin` on a marked Xvfb with Openbox.** The bus started and `GetAddress` answered.
   - The display's root `AT_SPI_BUS` equalled the answer: `unix:path=/run/user/501/at-spi/bus_1`.
   - `bus_0` (inode 58, mtime 2026-10-28) was untouched throughout.
   - `bus_1` was gone after the run, and the root property was unset.
2. **Each family registered on the run's accessibility bus,** with one exception: the Qt 6 families (see the table
   and the Qt 6 finding).
   - Every family process, engine and reader named the run's session bus and the run's accessibility bus (301
     processes).
   - The engines' reads made one `GetConnectionUnixProcessID` call where the same gedit read on `:0` made 17 (M3's
     gate). They walked the run's registry, which holds only the run's applications.
3. **No application stalled for want of a service.**
   - The open times are in the table (gnome-text-editor 1.8 s).
   - kate's 21 s is the settle's 20 s limit on its ever-changing tree, as on `:0`.
   - No application's stderr names a missing service.
4. **gnome-terminal.** The scene's own server came up on the run's bus (`gdbus wait` passed) and the window appeared
   with its title. Nothing of its group was left after its close.
   - The private bus cannot activate `org.gnome.Terminal`, so the standalone server served without any activation.
5. **After the run, nothing of the run's bus remained:**
   - no `dbus-daemon` on the run's `session.conf`;
   - no launcher or registryd but the person's (pids 9909 and 10052);
   - `DBUS_SESSION_BUS_ADDRESS` and `AT_SPI_BUS_ADDRESS` were back as found (the decoys').
6. **The `AT_SPI_BUS` write against the record:** not checked. No record ran (part 2).
7. **The activated services stay in the daemon's process group.** `at-spi-bus-launcher`, its `dbus-daemon` and
   `at-spi2-registryd` all carried the run daemon's pgid, so the group kill reaches them.
   - They are reparented, though: here to the guard's subreaper, and without one to the nearest subreaper or init.
     So the group, not the parentage, is what the stop relies on.

The fix's three items:

- **(1) A foreign `AT_SPI_BUS_ADDRESS` at start.** The decoy was inherited. Every application's environment named the
  run's `bus_1` instead, and the decoy took no connection. The harness's variable was restored afterwards.
- **(2) SIGTERM during `GetAddress`** (`runs/sigterm-2/`, and again in `runs/families-1/`):
  - the driver exited nonzero (1);
  - no session daemon, launcher or registryd of the run remained;
  - no record ran.

  But the stop was seen only after `startTrace`, at `scenes.mjs:259`. The xtrace proxy had started, and was then
  stopped by the start's own unwind (the finding below).
- **(3) The engines on the real launcher's bus.** Each engine's calls and the oracle's appear in a `dbus-monitor`
  pass on the run's accessibility bus (`bus` in each row of `driver-families.jsonl`). For example, gedit took 3,181
  calls from each of pinned, newest and cua, and 4 from the oracle.

| family | open ms | WM_CLASS | toolkit | pinned / newest / cua: source, nodes, a11y-bus calls | registry apps |
|---|---|---|---|---|---|
| gedit | 1631 | gedit / Gedit | gtk | at_spi 498 3181 (all three) | 1 |
| gnome-text-editor | 1754 | gnome-text-editor | GTK | at_spi 64 535 | 1 |
| gtk4-button | 1319 | | GTK | at_spi 3 40 | 1 |
| gtk4-input | 1343 | | GTK | at_spi 11 112 | 1 |
| gtk-scale | 792 | gtk-scale.py | gtk | at_spi 2 18 | 1 |
| gtk-table | 2103 | gtk-table.py | gtk | at_spi 41 931 / 931 / 929 | 1 |
| qt5-input | 794 | qt-input.py | Qt 5.15.13 | at_spi 1 13 | 1 |
| **qt6-input** | 803 | qt-input.py | — | **x11 1 2** (`:0`: at_spi 1) | **0** |
| qt5-breeze | 820 | qt-input.py | Qt | at_spi 2 22 | 1 |
| qt5-fusion | 799 | qt-input.py | Qt | at_spi 2 22 | 1 |
| kate | 20964 | kate | Qt | x11 1 / x11 1 / at_spi 892 (as on `:0`: the caption rule) | 1 |
| **qtcreator** | 1548 | QtCreator | — | **x11 1 2** (`:0`: at_spi 1261) | **0** |
| firefox | 5457 | Navigator / firefox | Gecko | at_spi 68 550 | 1 |
| writer | 6169 | libreoffice-writer | gtk | at_spi 1964 14960 | 1 |
| writer-gen | 4614 | libreoffice-writer | — | x11 1 2 (as on `:0`) | 0 |
| calc | 6963 | libreoffice-calc | gtk | at_spi 2431 19847 / 19847 / 19845 | 1 |
| xterm, xterm-allow | 3797, 3811 | XTerm | — | x11 2 2 (as on `:0`) | 0 |
| gnome-terminal | 3846 | gnome-terminal-server | gtk | at_spi 49 369 | 2 |

Node counts equal M0.4's and T5's reads on `:0` for every family but the two Qt 6 ones.

### Findings

- **Qt 6.4.2 does not register when `AT_SPI_BUS_ADDRESS` is set** (`runs/qt6-1/`).
  - With the run's variable as the harness sets it (task 43's fix 1), qt6-input and qtcreator fall back to the X11
    tree, and the run's registry holds no application of theirs.
  - With the variable empty (Qt reads an empty value as none), both register on the run's accessibility bus through
    `org.a11y.Bus` on the run's session bus: qt6-input at_spi 1 node, qtcreator at_spi 1261 nodes, as on `:0`.
  - The control in the same run, opened the harness's way, is x11 again.
  - The launcher on the run's bus answers `IsEnabled true` and `ScreenReaderEnabled false`.
  - Qt 5.15 registers either way.
  - Fix for the harness: on a private display, empty `AT_SPI_BUS_ADDRESS` for Qt 6 applications, or for all of them,
    since the run's session bus already names the run's accessibility bus.
- **A stop during the session's start is seen one step late.**
  - The part of the start that the signal lands in is synchronous: `startSessionBus`'s `busctl` and
    `wireAccessibility`'s `GetAddress` (`execFileSync`), then an `xprop` read that equals at once. So node's SIGTERM
    handler, which runs only on an event-loop turn, has not run when the start checks for a stop after the session.
  - The start goes on into the record (on a real private-display run, `startRunRecord` spawns `xprobe record-run`)
    and the trace before the stop is seen.
  - Here, with no record, the xtrace proxy started and was then ended by the unwind.
  - Fix: yield one event-loop turn (`await new Promise(setImmediate)`) inside `unlessStopped`, before the check.
- **The harness's trace on a `startPrivateServer` display has no authority of its own.**
  - With `XAUTHORITY` unset, `startProxy` copies the person's `~/.Xauthority` into its scratch directory.
  - xtrace then failed to parse the copy for the private display (`Error parsing xauth list data`, `runs/sigterm-1/`).
  - The failed start left the copy behind, in `/tmp/cua171-audit-AgRQmD`; it was removed by hand.
  - The runs after it used a session authority file with an entry for the display.
  - Fixes:
    - `startPrivateServer` makes an authority file of its own and the runs on it use it, or `startProxy` refuses to
      copy the person's;
    - `startProxy`'s failure path removes its directory.
- **`sigterm-1` ran with relative decoy paths** (fixed for every later run). It and `sigterm-2` were runs of the
  tooling; `families-1` and `qt6-1` are the evidence.
