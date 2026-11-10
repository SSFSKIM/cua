# M4 T14: Chromium drops, built (task 69)

The engine's drag-and-drop answers for Chrome, as the design session ruled on task 68's measurements (2026-11-09 and
2026-11-10). What ships, and what the live counts here decided:

1. **#264, the late take on a drag the engine lets drop, is reported.** Every Chromium drag the engine lets drop (Chrome
   in front, a dedicated desktop, the desktop route) now has M3's after-release watch. A take after the release gets
   the Escape at once, on the drag's own route: synthetic to the window on the background route, XTEST on the
   foreground and desktop routes. Every reply then carries the notice, and the first acting request is refused with it.
   - Task 68's reproduction, the run's own browser stopped from 60 ms to 250 ms after the request on the busy-press
     source (`freeze-250`, ruling 4), made real late takes on both engines.
   - The engine before T14 (405aa773, the failing first) answered 25 of 25 ok, carried no notice, and ran the next
     acting request.
   - The engines after it reported every one: 9 of 9 on the final engine (3fcf2a88) and 5 of 5 on f9bdb5c2. Each
     Escape was sent within 3.2 ms of the release, and the harness never needed its own (`tables/late-takes.md`). No
     other drag left a late notice.
   - The gate's Chrome drag-and-drop device scene passed 12 of 12 cases on the final engine, 9 samples each, cold
     samples included. Its five drops that land each read their notice after the drop's window, and none had one.
2. **A Chrome drop under way at its release is confirmed by Chrome's own `_NET_ACTIVE_WINDOW` request, or reported
   unconfirmed** (ruling 1).
   - Only a request from an application (source 1) for the drop's own top-level window counts. It counts only where the
     window manager lists `_NET_ACTIVE_WINDOW` in `_NET_SUPPORTED`, read at each drag, and only inside 150 ms of the
     release (`dnd.rs` `DROP_CONFIRM`). That is about three times task 68's largest latency, 52.9 ms at twice the load.
     The latency here was at most 2.3 ms at idle.
   - With no request inside the window the drop is unconfirmed, never ok. The notice rides every reply, and the first
     acting request is refused with it. An acting request that comes inside the window waits for the rest of it.
   - Electron, and every window the signal does not cover, keep the floor with nothing to confirm.
   - At idle, all 119 control drags that fell to the floor (`left` and `inzone-out`, two sittings) never landed. None of
     them sent the request, and all were reported unconfirmed. Of the 600 long drops that landed, 599 were confirmed.
   - That one drop was left unconfirmed because the watch read Chrome's request 1.1 ms before the engine's release
     stamp, which was taken after the release's round trip. The stamp now comes before the release goes out (f9bdb5c2).
     The sitting after that fix had none.
3. **The early release at the accept cursor (ruling 2) does not ship.** It is a measurement flag again,
   `--drag-dnd-release-at-accept`.
   - On the long drop it met its bar: 300 of 300 released at the accept, 0 false releases, all landed, answer median
     240 ms. The accepted-then-left control (`left`) never read an accept (0 of 60).
   - The press-inside control (`inzone-out`) had one false release in 30 at idle, the second idle sitting's drag 20.
   - In that drag the accept for an in-zone position was shown at 32.7 ms after the press. The path then left the zone,
     and the engine released at its end, 56 ms after the press, before Chrome had answered the last position: no
     no-drop image had come.
   - Chrome dropped, sent its activation request 0.8 ms after the release, and the page's zone took nothing. So the drag
     answered ok with nothing pending: the one outcome every bar forbids.
   - Ruling 2's own condition: "A single false release reverts (2), not (1)." This false release went unreported
     because Chrome's request confirms what the browser dropped, not where the page took it. Behind the floor no such
     drag was seen (task 68: 0 of 354 drags that did not land sent the request; here 119 of 119 floor-fallback
     controls sent none).
4. **The hold stays** (press + 250 ms, ruling 3). #263 stays a declared gap. Its cost against the vendor builds, on
   the 40 px Chrome selection with every lane's window in front, is none:
   - cua's median is 254.4 ms, against the newest build's 251.9 and the pinned build's 254.1 (39 usable of 40 each);
   - the speed rule passes within its bound (`tables/speed.md`).
   
   Against cua without the hold (about 134 ms, M3), the selection pays about 120 ms.
5. **The short drop's speed gap stays with the floor.** On the 40 px Chrome drop in front, cua landed 40 of 40, at a
   median of 365.9 ms. The newest build landed 25 of 40 at 251.5, and the pinned build 22 of 40 at 252.9. The speed
   rule fails against the newest build by 114 ms (`tables/speed.md`).

The facade's part of the notice is the design session's exception, recorded in the report: `get_window_state` hands
the notice to the window state, and the observation shows it as its first line.

## Stated limits

- **The notice reaches the model only through the window state.** `getScreenshot`, `listWindows`/`listApps` and the
  releases do not show it. The model cannot act again without meeting it, because the refused request's text names
  what is pending: a late drag and drop, an unconfirmed drop or a failed watch, and the request that was not run.
- **The gate's window load did not reproduce task 22's take tail** (task 68's finding 6, ruling 5). Nothing here
  changes that.
- **#263's hold cost and the 40 px selection's numbers go to the owner** (point 4). The selection matches the vendor
  builds, and it pays about 120 ms against cua without the hold.
- **The floor's speed gaps stay.** Against the newest vendor build:
  - the short drop: 365.9 ms against 251.5;
  - the long drop (the drag experiment's Chrome cell): 368.8 ms against 339, which fails the speed rule by about
    30 ms. The pinned build takes 514.1. All three lanes landed 30 of 30.
- **A lagging browser can make an honest "unconfirmed" on a drop that landed.** The request then comes after the
  150 ms. Task 69's first device pilot froze the run's own browser across the release and saw this. The gate's
  device cases judge a landed drop with a notice as a failure (`device.mjs` `confirm`), so a stall past 150 ms
  there would fail a case that answered honestly.
- **The real late takes are fewer on the final engines than on the old one** (5 of 40 against 25 of 40). The thaw is
  fixed at 250 ms after the request. The new engine's press comes a few ms later after the request, because it first
  reads `_NET_SUPPORTED` and subscribes the watch's own connection. So more thaws fall before the hold's release, and
  their takes come in time. Every late take that came was reported.
- **The device cases do not carry a real late take.** The first version froze the browser inside the gate's device
  scene (`chrome_dnd_late_take_real_*`). It never made one, because the drag page's source takes within about 50 ms:
  - stopped from 3 ms, the browser read the release before its renderer's drag start;
  - stopped from 60 ms, it had already taken.
  
  Those cases were removed (b472e43f), and the reproduction runs in the drop-signals experiment, on task 68's
  busy-press source.

## The sittings

All ran on private displays only: Xvfb with Openbox and a stand-in person's xterm (`scripts/private-run.mjs`), with
no whole-run RECORD. The display watchdog ended clean in every run. Each sitting held the host lock (`host-lock.log`,
lines below). Every start showed no `hold-sittings` file and no stress-ng running. This host's idle load average sits
at about 0.5.

| run | engine | plan or scene | load | lock acquire, release (UTC, 2026-11-10) | load average at acquire / release (1 min) | drags |
|---|---|---|---|---|---|---:|
| `counts-idle` (counted) | f9bdb5c2 | t14 | idle | 07:17:31, 07:29:23 | 1.43 / 0.73 | 360 |
| `superseded/counts-idle-c1859f5a` | c1859f5a | t14 | idle | 06:23:52, 06:35:42 | 1.19 / 0.65 | 360 |
| `red-late` (counted) | 405aa773 | t14-late | idle | 07:13:42, 07:15:20 | 0.54 / 0.39 | 40 |
| `superseded/late-idle-f9bdb5c2` | f9bdb5c2 | t14-late | idle | 07:12:06, 07:13:42 | 0.56 / 0.54 | 40 |
| `pilot/pilot-device3` | c1859f5a | device-chrome-dnd, 4 cases | idle | 06:16:52, 06:21:31 | 0.84 / 0.90 | 36 |
| `pilot/pilot-device` | 3f9cab4e | device-chrome-dnd, 3 cases | idle | 04:29:05, 04:32:40 | 0.93 / 0.30 | 27 |

The final engine's sittings, on 3fcf2a88's engine and harness:

| run | engine | plan or scene | load | lock acquire, release (UTC, 2026-11-10) | load average at acquire / release (1 min) | drags |
|---|---|---|---|---|---|---:|
| `late-idle` | 3fcf2a88 | t14-late | idle | 09:01:12, 09:02:57 | 0.46 / 0.18 | 40 |
| `device-idle` | 3fcf2a88 | device-chrome-dnd, 12 cases, 3 blocks | idle | 09:02:57, 09:17:17 | 0.18 / 0.79 | 108 |
| `short-drop` | 3fcf2a88, pinned, newest | dnd `--dnd-short`, 40 a lane | idle | 09:17:46, 09:30:00 | 1.30 / 0.35 | 120 |
| `select-40` | 3fcf2a88, pinned, newest | dnd `--dnd-select`, 40 a lane | idle | 09:37:06, 09:49:15 | 0.29 / 0.58 | 120 |
| `long-drop` | 3fcf2a88, pinned, newest | drag, Chrome `dnd` | idle | 10:42:42, 10:51:12 | 0.14 / 0.62 | 90 |
| `floor-idle` | 3fcf2a88 | t14-floor | idle | 11:07:11, 11:19:43 | 0.46 / 0.95 | 360 |

- `floor-idle`, the engine as it ships, on `t14`'s drags:
  - `plain-long`: 300 of 300 landed and were confirmed, with nothing pending (median 368.4 ms);
  - `left` and `inzone-out`: 60 of 60 did not land, and all were reported unconfirmed.
- `long-drop` and `short-drop` exit 1 on the speed verdict alone.
- `short-drop` took the lock at 1.30, about 0.9 above idle, right after another holder's build. That is within the
  rule, and its verdict is 114 ms from its bar.
- **The lock lines**, in the same form (`<engine>` is `<task69>/build/3fcf2a88/…/cua-engine`, `<harness>`
  `<task69>/harness-3fcf2a88`):
  - `2026-11-10T09:01:12Z acquire task69 load=0.46 0.35 0.46 :: …/sitting.sh <harness> <engine> late-idle late idle`,
    and `2026-11-10T09:02:57Z release task69 status=0 load=0.18 0.31 0.43`;
  - `2026-11-10T09:02:57Z acquire task69 load=0.18 0.31 0.43 :: … device-idle device idle`, and
    `2026-11-10T09:17:17Z release task69 status=0 load=0.79 0.54 0.44`;
  - `2026-11-10T09:17:46Z acquire task69 load=1.30 0.70 0.50 :: … short-drop short-drop`, and
    `2026-11-10T09:30:00Z release task69 status=0 load=0.35 0.41 0.41`;
  - `2026-11-10T09:37:06Z acquire task69 load=0.29 0.29 0.36 :: … select-40 select`, and
    `2026-11-10T09:49:15Z release task69 status=0 load=0.58 0.33 0.32`;
  - `2026-11-10T10:42:42Z acquire task69 load=0.14 0.35 0.41 :: … long-drop long-drop`, and
    `2026-11-10T10:51:12Z release task69 status=1 load=0.62 0.58 0.53`;
  - `2026-11-10T11:07:11Z acquire task69 load=0.46 0.42 0.47 :: … floor-idle floor idle`, and
    `2026-11-10T11:19:43Z release task69 status=0 load=0.95 0.74 0.64`.
- The final build: `cua-engine 0.3.0 (3fcf2a88ad0d)`, sha256 `4748c850…75d3`.

- **The lock lines**, verbatim except for the labels (`<task69>` is the task's work directory). The script is
  `docs/evidence/2026-10-28-own-linux-engine/m4/drops/scripts/sitting.sh`, and its arguments follow it:
  - `counts-idle`: `2026-11-10T07:17:31Z acquire task69 load=1.43 0.95 0.70 :: …/sitting.sh <task69>/harness-b472e43f <task69>/build/f9bdb5c2/…/cua-engine counts-idle counts idle`
    and `2026-11-10T07:29:23Z release task69 status=0 load=0.73 0.70 0.65`.
  - `red-late`: `2026-11-10T07:13:42Z acquire task69 load=0.54 0.58 0.56 :: …/sitting.sh <task69>/harness-b472e43f <home>/.local/share/cua-171/task68/build/405aa773/…/cua-engine red-late late idle`
    and `2026-11-10T07:15:20Z release task69 status=0 load=0.39 0.54 0.55`.
  - `late-idle` (f9bdb5c2): `2026-11-10T07:12:06Z acquire task69 load=0.56 0.57 0.56` and
    `2026-11-10T07:13:42Z release task69 status=0 load=0.54 0.58 0.56`.
  - `counts-idle-c1859f5a`: `2026-11-10T06:23:52Z acquire task69 load=1.19 0.92 0.78` and
    `2026-11-10T06:35:42Z release task69 status=0 load=0.65 0.70 0.72`.
- **The counted idle sitting's load.** It took the lock at 1.43, about 0.9 above this host's idle, right after
  `red-late`'s browser closed. That is within the rule, and it released at 0.73. Its deciding event is a single false
  release, which a quieter host cannot undo.
- **An overlap.** `counts-idle-c1859f5a` overlapped another holder's `cargo check`. It ran outside the lock for a few
  seconds at about 06:24:00Z (`2026-11-10T06:24:00Z lapse task71`). Its loads at acquire and release were 1.19 and
  0.65, inside the rule. Its numbers sit at no bar: 300 of 300 released at the accept, 0 false releases, 60 of 60
  controls unconfirmed. Its engine was superseded by the stamp's fix, so it is kept as a superseded sitting, not a
  count.
- **The pilots.** They shaped the instruments, and they are not counts.
  - `pilot-device`: the device cases' first freeze, from 60 ms; the takes came first.
  - `pilot-device3`: from 3 ms; no take came at all. It also showed the early release on the short drop: 6 of 9 at a
    warm median of 83 ms.
  - `pilot-device2` was stopped by hand at 04:42:56Z inside another sitting's window, and is not kept.
- **Candidate builds**, each a musl build made the release workflow's way (`scripts/build.sh`, static-pie):
  - f9bdb5c2: `cua-engine 0.3.0 (f9bdb5c20613)`, sha256 `eba8ce8f…a299`;
  - c1859f5a: `cua-engine 0.3.0 (c1859f5a34ca)`, sha256 `8cec622a…9261`;
  - the old engine, task 68's 405aa773: `2437da52…5d1`.

  None of these is a release gate.
- **Harnesses** (`scripts/export-harness.sh`): c1859f5a's for the superseded counts and the pilots, b472e43f's for
  the counted sittings above. In b472e43f the plan `t14` ran the lane `cua`, which on f9bdb5c2 was the shipped early
  release. At 3fcf2a88 the plan `t14` runs `cua:accept`, the measurement flag, and `t14-floor` runs the engine as it
  ships.

## Instruments

- **Plans** (`scripts/linux-engine-diff/drop-signals.mjs`):
  - `t14`: `plain-long` 300, `left` 30 and `inzone-out` 30;
  - `t14-floor`: the same on the shipped engine;
  - `t14-late`: `freeze-250` 40.
  
  Every drag reads `list_windows` on the same engine after its watch's lifetime (the reply's `notice`), then sends
  `preflight` and keeps its answer (`next`). `pages/drop-signals.html` has an in-zone source for `inzone-out`.
- **`scripts/counts.mjs`**: the bars for the accept's counts, and the late takes' table. It writes `tables/`.
- **`scripts/speed.mjs`**: Acceptance 3's speed rule (`drag-judge.mjs` `dragSpeed`) on the dnd experiment's short
  drop and 40 px selection (`--dnd-select`, the path `select-short`).
- **Reproduce.** Run `scripts/build.sh <commit>` and `scripts/export-harness.sh <commit>`, then
  `scripts/chain.sh <harness> <engine> <old engine> <steps…>`. Each step takes the lock by itself. Copy the runs with
  `scripts/evidence.sh <sitting>=<name>…`.
- **Files.** Each run's `run/results.jsonl` is gzipped where it is over 512 KiB. The whole-run `xprobe order-watch`
  record is left out.
