# M4: T4c's full manifest on the person's display (task 50)

This is the run the design session ruled after `:0`'s recovery, with T4c's full scene manifest on `:0`. Task 40 began
it on 2026-11-02 under the whole-run RECORD, and it froze the display 2 h 2 min in (`../../xserver-record-hang/`). This
run has no RECORD. The harness refuses one on a display without the private mark, and the end row says `record:
{skipped: …}`.

The harness's own connections are judged whole-run through its xtrace trace, and the engines through the sampled
route audits. T4b's identity check runs before each act, and the watchdog runs throughout.

- **What ran:** a development run (`--dev`), not a release gate.
  - Harness: `~/.local/share/cua-171/live-43` at d778a092, unmodified.
  - Candidate: task 42's musl `cua-engine 0.3.0 (7ad6f03d2966)`, sha256 `5b7e38cf…`, static-pie.
  - Vendor builds: the pinned 26.928.40906 and the newest 26.1023.51421.
- **The manifest** (`../../person-display-live/scripts/t4c-full.sh`): M3's gate scenes, then M4's in the spec's frozen
  order. `--ops all --blocks 3`, every lane.

  ```
  desktop,gedit,chrome,chrome-input,over-budget,retention,chrome-textarea,chrome-address-bar,gnome-text-editor,
  paste-target,device-gtk4,device-firefox,device-xterm,device-qt,device-chrome,device-chrome-dnd,
  identity,identity-gtk3,identity-gtk4,identity-kate,minimized,minimized-xterm,minimized-recorder
  ```
- **How it was guarded:** `../../person-display-live/scripts/run50.sh` with `wrap50.py`, `owner-watch.sh` and
  `tmp-watch.sh`, as for the other `:0` steps. The guards are described in that directory's README.
- **`runs/t4c-full/`:** the run, 2026-11-03 14:01–16:51 UTC, 2 h 50 min, 6,781 result rows.
- **`runs/t4c-full-stopped/`:** the first attempt, started 13:54. It was stopped by the owner watch after about 4
  minutes, during gedit's samples (198 rows); see below.

## The person's side

- **The owner's Chrome:** pid 2546101, start time 51157914, its one client window `0x600002`, `google-chrome` /
  `Google-chrome`, Normal, 1050x780 at 0,0. All of it was unchanged before, after, and at each of 921 readings every
  10 s.
- **The session bus:** the person's bus names and pids and running user units were unchanged. Nothing was activated.
- **The whole `:0` read** (`owner-before.txt`, `owner-after.txt`): identical except the mtime of
  `~/.config/google-chrome`, which the owner's live Chrome writes. Its client list was one window before and after,
  its root children 15, and Xorg's client connections 8.
- **The run's processes:** 11,849 of them, sampled 66,867 times with 22,290 maps samples and 13,375 socket tables.
  - No fd, cwd or mapping was under `~/.config/google-chrome`, `~/.pki` or `~/.local/share/pki`. `~/.pki` never
    existed.
  - No connection to the person's session bus or a decoy.
  - The only outside peers: Xorg's `:0`, the person's accessibility bus (`bus_0`, by design), and the system bus
    (Chrome, Firefox).
- **The run's Chrome:** 27 spawns, every browser process with exactly the run's `--user-data-dir`, its NSS database
  in `<scratch>/home/.local/share/pki/nssdb`. The end row shows `terminated: []`, `killed: []` and `left: []`.
- **The watchdog:** `ended`, 5,107 round trips, no stall.
- **The start and end active windows** (meta and end row): `0x00600002` (6291458), `foreign`, at both ends, never
  acted on. The holder was `0x0160000e` (23068686).
- **After the run:** no harness window on `:0`; the client list was the owner's window alone. No run process, no
  scratch directory, no X socket but `X0` and no extra lock, no at-spi bus but `bus_0`. The step's TMPDIR was empty.
- **Temporary files** (`runs/t4c-full/tmp-watch.log`, every 30 s): every application's and engine's temporary files
  were in `<scratch>/tmp`. That covers Chrome's singleton, Firefox's xpi and zip files, the vendor engines'
  `<pid>_<ns>.jpg` (308 at most, task 51's item 2 live) and cua-engine's private directory. Outside it in `/tmp`, the
  only new entries were the trace proxies' `.X11-unix` sockets, each removed with its proxy, and the system
  timedated's PrivateTmp.

## The foreign-window invariant

- **The harness's own trace:** clean, 121,477 requests, 57,277 mutating, no foreign change. 3,301 XTEST inputs and
  warps were unplaced: the parked pointer and the nudges, as in T4b's runs.
- **The route audits:** 189 of them. 187 had no foreign finding. Their non-clean verdicts are the ones every run has:
  - `activate_window`, the one request that changes the desktop by design;
  - the pinned build's `type_characters`, which it does not implement.

  The other two carry three foreign findings, listed with window id and owner only:

  | audit | finding | the window's owner |
  |---|---|---|
  | cua, device-gtk4, `gtk4_key_dedicated` | XTEST KeyRelease on `0x03a00005` (twice) | the run's own GTK 4 scene application: the same client as the scene window `0x03a00004` (60817412), base `0x03a00000`; gone after the run |
  | cua, device-gtk4, `gtk4_move_dedicated` | XTEST MotionNotify on `0x005a6d2f` | Openbox: the frame of the run's GTK 4 scene window. The witness's restack and focus records in the scene's dedicated samples name `0x005a6d2f` (5926191) as the frame the window manager raised and focused when it activated `0x03a00004`. It is not the owner's frame (`0x600002`'s parent is `0x5a384f`), and it was gone after the run |

  **All three are false reds.** XTEST input on the foreground route lands where the focus or the pointer is, and the
  route audit's trace places it on a window the audit cannot tie to the harness window:
  - GTK 4's X11 backend gives each toplevel a focus window of its own inside it, `0x03a00005`, which the window
    manager's focus lands on;
  - the pointer can land on the window's WM frame.

  The trace shows neither one's parentage. That is T4b's limit 5: xtrace's audits place XTEST input only by what the
  trace shows, and a reply cannot tell a window created inside a harness window from one another client reparented
  in. No request named a window of the person's.

  It shows now because device-gtk4's dedicated cases had never run under the foreign audit on `:0`. T4b's `:0` runs
  had no device-gtk4 scene. A fix is a rule for the harness: a window inside a registered harness window (GTK 4's
  focus window), or its WM frame, counts as that window. Both are learnable from the harness's own QueryTree reads or
  the witness's frame records. That is the controller's call, not made here.

## The verdict table (`runs/t4c-full/run/summary.md`)

- **The run is valid.** The activating stub was failed by both the witness and the audit, and the foreground and
  in-front checks held.
- **The counts:** 124 PASS, 1 declared refusal (`chrome-input drag cua`, M3.1's) and 5 FAIL. Every paste safety case
  passed, and the text restores were pinned 43, newest 0, cua 0. Per scene:
  - desktop 5, gedit 11, chrome 4, chrome-input 10, over-budget 1, retention 3, chrome-textarea 1, chrome-address-bar
    1, gnome-text-editor 2, device-gtk4 10 (3 FAIL), device-firefox 12, device-xterm 3, device-qt 2, device-chrome 3,
    device-chrome-dnd 10 (2 FAIL), identity 10, identity-gtk3 4, identity-gtk4 4, identity-kate 1, minimized 23,
    minimized-xterm 3, minimized-recorder 1.

| verdict | what failed | kind |
|---|---|---|
| device-gtk4 `gtk4_key_dedicated` cua | the foreground audit's XTEST KeyRelease on `0x03a00005` (above) | false red, the audit's placement |
| device-gtk4 `gtk4_move_dedicated` cua | the foreground audit's XTEST MotionNotify on `0x005a6d2f` (above) | false red, the audit's placement |
| device-gtk4 `gtk4_click_dedicated` cua | the witness's "focus after the request" on 1 of 9, block 0's cold sample: the focus ended on a window the foreground allowance does not take for the target. The effect was verified, the window was activated, and the other 8 were clean | the same GTK 4 focus window, most likely (a late focus move to the toplevel's focus window); a judge gap, not a change to anyone else's window |
| device-chrome-dnd `chrome_dnd_shared` cua | not cancelled with the drag-and-drop sentence on 1 of 9, block 1's cold sample. The page counted a `dragstart`, the engine saw no take within its hold (`outcome: no_start`), and nothing was dropped | #264's late take on a cold engine, the M3 cost that T14 closes; 0.3.0's engine |
| device-chrome-dnd `chrome_dnd_short_in_front_shared` cua | the effect was not verified on 2 of 9, the cold samples of blocks 1 and 2. The hold expired with no take (`taken: false`, `waited_ms` about 224), and the desktop was the same | M3's gate failure on this op (1 of 9 cold), #264/#269; 0.3.0's engine |

None of the five is a change to a window of the person's. The two Chrome drop verdicts are the shipped 0.3.0 engine's
known costs, which M4's T13 and T14 address. The three device-gtk4 verdicts are the harness's judgment of GTK 4's
focus window and WM frame on the foreground route.

## The stopped first attempt (`runs/t4c-full-stopped/`)

At 13:58:54, four minutes in, the owner watch read the owner's window count as 0. In the same reading the owner's
client window was listed unchanged: the same id, class, state and geometry. The watch sent the harness its stop,
which closed everything. The owner's side then read exactly as before, and nothing of the run was left.

The cause was the watch, not the desktop. `xdotool search --pid` walks every window on `:0`. With a full run's
hundred windows coming and going, it often ends on an X error (BadWindow) with Xlib's exit code 1, which is also its
"nothing found" code. The run's watch now tells those apart and logs an unread count instead: 101 unread readings in
the full run, every other reading equal to the baseline. The attempt has no end row, because the harness's stop
writes none.
