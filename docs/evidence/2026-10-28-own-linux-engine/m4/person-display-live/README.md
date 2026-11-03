# M4: the harness on the person's display again (task 50)

The first harness runs on `:0` since the freeze of 2026-11-02 16:40. They are the person's-display items of tasks 47,
48 and 51's live lists. T4c's full manifest on `:0` follows them, with its evidence in
`../harness-windows/t4c-full/`.

All of it ran on 2026-11-03 between 13:30 and 16:52 UTC (VM time 05:30–08:52), and this session was the only display
user.

The harness came from `~/.local/share/cua-171/live-43` at d778a092, unmodified. xprobe was rebuilt there from the same
source. The cua lane ran task 42's musl `cua-engine 0.3.0 (7ad6f03d2966)`, sha256 `5b7e38cf…` (the engine is unchanged
since 7ad6f03d). The vendor lanes ran the pinned build 26.928.40906 and the newest build 26.1023.51421.

Every run on `:0` was a declared live run: the harness's own CLI declares it. There was no whole-run RECORD. The harness
refuses one on a display without the private mark, and every end row says `record: {skipped: …}`. The watchdog ran
throughout.

## How each step was guarded (`scripts/`)

- **`run50.sh`** runs one step on `:0`. It reads the person's side before and after (`owner-check.sh`), watches it
  during the step (`owner-watch.sh`), watches where temporary files land (`tmp-watch.sh`), and runs the harness's CLI
  under `wrap50.py` in `person` mode. Each step gets a TMPDIR of its own, which must be empty afterwards.
- **`wrap50.py`** is task 49's `wrap.py`, adapted for `:0`. It is a subreaper, so every process the run starts stays
  in its tree. It points both of the person's bus variables at decoys. It samples every run process's fds and cwd about
  every 110 ms, `/proc/<pid>/maps` every third sample, and the socket table every fifth.

  It stops the step on any of these:
  - a path under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`;
  - a run Chrome without exactly one run `--user-data-dir`, or whose HOME is not the run's;
  - a connection to a decoy;
  - a connection to any socket served outside the run other than Xorg's `:0` and the person's accessibility bus
    (`bus_0`, which the engines, the oracle and the run's applications reach through `:0`'s root `AT_SPI_BUS` by
    design) and the system's own sockets (the system bus, journald). The person's session bus, systemd, the owner's
    Chrome and gpg-agent are all outside that list.

  In `private` mode (step 0), `~/.Xauthority` is a forbidden path too, and the guard records each process's
  `XAUTHORITY`.
- **`owner-watch.sh`** runs every 10 s, outside the guarded tree. It reads the owner's Chrome pid and start time, the
  windows carrying its pid, and each of its client windows' class, map state, `_NET_WM_STATE` and geometry. Every 30 s
  it also reads the person's bus names and running user units. Any change stops the step. Nothing it reads is a
  title.
- **`owner-check.sh`** reads the person's side, before and after:
  - the owner's Chrome, found by its command line with no `--user-data-dir`: pid 2546101, start time 51157914;
  - `:0`'s client list, by ids, `WM_CLASS`, `_NET_WM_PID`, states and geometry, never a title;
  - the owner's windows: 2 of any state, 1 viewable;
  - `:0`'s root children (15) and Xorg's accepted client connections (8);
  - the person's session bus names with their pids, and their running user units;
  - `org.a11y.Status`, read only while `org.a11y.Bus` is owned, so the read activates nothing: `IsEnabled true`,
    `ScreenReaderEnabled false`;
  - task 45's list of mtimes, the person's runtime directory's names, and the X sockets.

## Step 0: a private display of this session's own

- **`engine-a11y-bus.test.mjs` with the real HOME** (`runs/step0-test/`): 9/9, all eight engine lanes, with none
  skipped. Those are cua, pinned and newest over the wire and through OpenAI's JavaScript client, and cua behind the
  vendor service and behind cua's service. The six vendor-dependent lanes ran; task 51's fixer had to skip them. The
  test sets XAUTHORITY to the run's no-authority path itself.
- **The harness's X tools against a display it created, with the nonexistent authority path**
  (`runs/step0-xtools/`, `scripts/step0-xtools.mjs`):
  - **What ran:** one process ran the harness's `startPrivateServer`, then Openbox and an xterm "person" through the
    harness's spawner, then the harness's own verdict run in-process: `runDiff`, `--scene gedit --ops tree,press_key
    --blocks 1 --dev`. The session's XAUTHORITY was unset, the case in which a client that escaped the spawner would
    read `~/.Xauthority`.
  - **The tools:** the run's watchdog, private session bus with its launcher, whole-run record (allowed on a private
    display), xtrace trace, audit proxies, three engine lanes, the activating stub and the run's Chrome all worked.
    The run was valid and every verdict passed. The trace was clean (294 requests). The record was clean (2,033
    requests, none unplaced, none unattributed).
  - **The authority each process had:**
    - Every X client of the private display carried `cua171-no-xauthority-*` (Openbox, xterm, gedit, Chrome,
      at-spi, the engines, xprobe, xtrace) or a trace proxy's own file (xdotool, the engines in their audit passes).
    - The processes with XAUTHORITY unset are not X clients there: Xvfb, busctl, dbus-monitor, sleep, and Chrome
      children whose environment Chrome rewrites.
    - No fd of any of 280 processes named `~/.Xauthority`.
  - **Three attempts:** the first two were stopped by this guard's own false positives, a stdio socketpair with a
    just-spawned child and gedit's system-bus connection. The guard was fixed and they are not kept.
- **Found:** this session's own Openbox writes the person's `~/.cache/openbox/openbox.log`, as task 49's sessions'
  did. That is the only person's-home path any run process held, and it is a session WM's, not the harness's.

## Step 1: the baseline (`runs/baseline/`)

`owner-1.txt` and `owner-2.txt` were taken a minute apart before anything ran on `:0`. They are identical except the
first one's X client count, which was mis-parsed and then fixed. `owner-final.txt` was taken after everything. It is
identical to `owner-2.txt` except the mtime of `~/.config/google-chrome`, which the owner's live Chrome writes about
every 30 minutes (task 49). No run process ever held a path under it.

## Step 2: the Qt control on `:0` (`runs/qt-bridge/`, `--experiment qt-bridge`)

| application | condition | registered | frame named | cua tree | nodes | pinned tree |
|---|---|---|---|---|---|---|
| kate | the run's stand-in for org.a11y.Bus | true | true | at_spi | 894 | x11 |
| qtcreator | the run's stand-in for org.a11y.Bus | true | true | at_spi | 1261 | at_spi |
| kate | no stand-in (the control) | true | true | at_spi | 895 | x11 |
| qtcreator | no stand-in (the control) | false | false | x11 | 1 | x11 |

- **Task 49's prediction holds on Ubuntu's builds on `:0`:**
  - Qt 5 (kate) registers without the stand-in, through the root `AT_SPI_BUS`.
  - Qt 6 (qtcreator) does not.
  - With the stand-in, both register.
- **The experiment's order:** the stand-in first, then the control. Stopping the stand-in is its last condition (task
  48). The stand-in ended `{terminated: true, killed: false}`.
- **qtcreator** read 1,261 nodes, T5's count.
- **kate** read 894 and then 895 in the same sitting, against the fresh-home baseline of 893 (task 49) and T5's 892.
  kate's tree is not stable to the node between two windows of one run. This is the same kind of variation as
  qtcreator's A/A, which T5 judges by source and size.
- **pinned:** kate reads x11 there because the vendor has no caption rule. That is cua's identity route (T5), as
  before.
- **Isolation:** no guard flag fired. The person's bus names, pids and units were unchanged, and no KDE service was
  activated. The Qt Creator socket, lockfiles and `qipc_*` were all in the run's tmp (`tmp-watch.log`).

## Step 3: the run bus on `:0` (`runs/run-bus/`, `--experiment matrix`)

The families were gnome-text-editor, Firefox, gedit and gnome-terminal.

- **Trees on the person's accessibility bus:** gnome-text-editor at_spi 64, Firefox 68, gedit 486 (the fresh-home
  baseline), gnome-terminal 49.
- **gnome-terminal:** each lane's window had its own `gnome-terminal-server`
  (`--app-id org.cua171.Terminal.<label>`) on the run's bus.
- **The GTK 4 warm-up** ran before the first GTK 4 scene. Its window lived from 8.5 s to 10.9 s, and the first scene's
  window opened at 12.2 s. The first GTK 4 window then read its AT-SPI tree, where a cold cache read x11 in task 49.
- **The person's session bus:** `busctl --user list` and the running units were identical before and after, and no
  activation appeared.
- **The matrix ends "incomplete":** shared-mode device refusals count as failed audited requests. That is task 49's
  finding 6, a judgment that predates device mode. Its trees and background-route rows stand.
- **Temporary files** (`tmp-watch.log`, every 30 s): Chrome's singleton, Firefox's `tmp-*.xpi` and `*.zip`, and the
  engines' files were all in `<scratch>/tmp`. In `/tmp` itself the only new entries were:
  - the xtrace proxies' sockets in `.X11-unix`, each removed with its proxy;
  - one `systemd-private-…-systemd-timedated.service-*` directory. That is root's PrivateTmp for the system's
    timedated, activated on the system bus, not the person's.
- **`runs/run-bus-stopped/`** is the first attempt. This guard stopped it 94 s in on a false positive (the harness's
  stdio socketpair with a child that had just ended). It is kept because it shows the harness's stop on `:0`: nothing
  was left, the owner's side was unchanged, and the TMPDIR was empty.

## Privacy

`scripts/privacy-check.py` searched every file here and in `../harness-windows/t4c-full/`, gzipped ones included:

- **Paths under the person's home:** the run's own tooling, plus two others.
  - `~/.Xauthority` is the value of XAUTHORITY in the guard's process records. It is a path, not content: the file
    was never read by this session, only named for `:0`'s X clients, as task 49's evidence does.
  - `~/.cache/openbox/openbox.log` is the step-0 session Openbox's log path.
- **The owner's window titles:** they were read into memory only, never printed or written. The viewable window's
  title occurs nowhere. The other match is the owner's unmapped leader window's name, `google-chrome-stable`, a
  program name that the guard's own lists and process names carry.
- **Images:** none. `list_windows` rows carry counts and digests, and the active windows carry ids and owners.
