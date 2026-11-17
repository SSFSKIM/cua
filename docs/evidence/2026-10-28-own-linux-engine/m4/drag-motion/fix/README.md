# M4, T11's fix wave (task 66): the review's two findings and one correction

The review of T11 (reviewer-medium on 04732370..59c30d64) gave the verdict incorrect, with two findings and a
correction to the evidence. The design session's acceptance of T11 stands: held moves rest 30 ms at their end and
visit it again, in place of spacing their points. Commits: 619a0915 (finding 1), 6e9e5b20 (finding 2), db379829 (the
two-screen tests' Xvfb terminated, not killed). Every run here was on a private display, never `:0`.

## Finding 1: a point repeated in a drag's path hid its corner

`drag_plan` read each joint's turn from its two neighbours, so `[(0,0),(200,0),(200,0),(200,200)]` had a zero-length
side on both turns around the bend and rested only at its end. The turn is now read between the distinct positions
around a point, on its first arrival there (`pointer.rs` `corner_at`): the rest comes once, between the bend's first
two visits, as without the repeat. The samples are the path's own, unchanged.

- RED on 59c30d64's code (`tests/tdd-red-repeat.txt`): `left: [404] right: [201, 404]`, the bend's rest missing.
  GREEN (`tests/tdd-green-repeat.txt`). The test covers a point repeated once and twice inside the path, a repeat on a
  straight path (no corner) and a repeated end.
- **The harness's drag plans are unchanged** (`plan-compare/`, `scripts/plan-compare.sh`): the planning functions are
  cut from 59c30d64's `pointer.rs` and the fix's, compiled side by side and run, resting and not, on every distinct path
  the recorded drag sittings sent (`drag-motion/` and `drag-judges/`, ten results files: every family and kind of the
  drag experiment, both paths of each). **47 distinct paths, 0 with a different plan** (`plans.tsv`). The control,
  the reviewer's path, differs (`control.tsv`). No harness path names a point twice in a row, and on such a path the
  two readings are the same by construction.

## Finding 2: the handle's end revisit could cross screens

On an X server with several screens, each its own root, `QueryPointer` on the engine's root answers with the other
screen's root and the coordinates on it when the pointer is there, and the revisit's motion went out on the engine's own
root. `end_drag_handle` now sends no revisit when the reply is not on the engine's screen (`same_screen` false), so the
release lands where the pointer is, as before T11. `Engine::shutdown` ends a held handle through the same path.

- Live tests (`live_device.rs`), one per ending (`end`; the engine's exit with the handle held): a Gecko window on
  screen 0 of a two-screen display, a handle started and moved there, the pointer warped to screen 1 with button 1
  held (asserted: not the same screen, button 1 down), then the end. They assert that the window, which holds the
  implicit grab, is told of the release only, on screen 1's root at the pointer's place, with no motion before it, and
  that the pointer is then on screen 1, there, with no button down.
- On a two-screen Xvfb of the test's own (as the gate runs them), both fail on 59c30d64 (`tests/tdd-red-screens.txt`):
  a motion before the release. Xvfb puts both screens at one origin, so that motion stays on screen 1.
- On a private Xorg with the dummy driver whose layout puts the screens side by side (`CUA_LIVE_TWO_SCREENS` names
  it to the tests), both fail on 59c30d64 as the reviewer described: the motion carries the held pointer back to
  screen 0 and the release lands there, `Release { root: 1058 … }` against screen 1's 1060. This is the real proof of
  the finding.
- Both pass on the fix, on both servers.

**The side-by-side run, one command** (the follow-up's; the first runs, `tests/tdd-*-screens-xorg.txt`, used a host
copy of the same configuration):

```bash
cd native/linux-engine && tests/two-screens.sh
```

`native/linux-engine/tests/two-screens.sh` starts `/usr/lib/xorg/Xorg` from the committed
`tests/xorg-two-screens.conf` on a display it picks itself (`-displayfd`; it refuses `:0`), runs the two two-screen
live tests under `dbus-run-session` with `CUA_LIVE_TWO_SCREENS` set and the gate's `--release --locked --target
x86_64-unknown-linux-musl --features live` flags, terminates the server, and fails if its socket is still there. It
exits 0 only when both tests ran and passed. It sits with the engine's other live-test tooling (`tests/dbus-daemon-quiet`,
`tests/support/`) under the `engine-linux` gate's path filter, so a gate step can call it from the directory the gate
already works in.

- **What it needs from the host**: the packages `xserver-xorg-core` and `xserver-xorg-video-dummy`, and the engine's
  build (rustup's musl target, as the gate installs it) and `dbus` (`dbus-run-session`). No rights beyond an ordinary
  user's: it runs `/usr/lib/xorg/Xorg` itself, not the setuid `Xorg.wrap` (whose `allowed_users=console` would refuse a
  non-console user), on a seat of its own with the VT shared and no VT switch, and with no input devices it opens no
  `/dev/input` nor `/dev/dri` (the dummy driver draws to memory). Here it ran as a user in no group but its own. **A
  GitHub-hosted Ubuntu runner should run it** after `sudo apt-get install -y xserver-xorg-core xserver-xorg-video-dummy`:
  it needs no console, GPU or root. That is not yet verified on one; T18's gate run would be the first.
- **On the head** (`tests/two-screens-head.txt`, the follow-up's tree; its engine sources are 6e9e5b20's): `two-screens: Xorg on :1`, both tests `ok`,
  `test result: ok. 2 passed`, exit 0, no socket left.
- **On 59c30d64** (`tests/two-screens-59c30d64.txt`, its engine sources with the head's tests and tooling,
  `scripts/two-screens-red.sh`): both `FAILED`, each `left: [Motion { root: 1058, x: 200, y: 120 }, Motion { root:
  1058, … }, Release { root: 1058, … }]  right: [Release { root: 1060, x: 200, y: 120 }]`, exit 1, no socket left.
- A killed Xvfb left its socket behind, and the harness suite's private server then refused that display as another
  server's (`engine-a11y-bus.test.mjs`, one failure in the first suite run); db379829 terminates it instead.

## Correction: what a held move's points cost

The README's cost line said a held move's points "take under 3 ms". From the samples a held move actually sends
(`held-cost/`, a probe of the engine's live build of db379829 on a private Xvfb: a browser window of its own, 40 held
moves of 360 px each, the longest a held move gets): **twelve motions** (the vendor's eleven points, the pointer's own
included, then the end once more after the rest), with a step before nine of them, 2.7 ms of sleeps on Gecko and 4.5 ms
on Chromium. By the server's clock, the first motion to the end's first visit takes **5 to 6 ms on Gecko and 6 to 7 ms
on Chromium**; the request answers in 35.6 and 36.4 ms (medians). The line in `../README.md` now says so.

## The idle sitting (`sitting/`, the musl build of 6e9e5b20 made the release workflow's way; db379829's engine)

db379829 changed only a test, so 6e9e5b20's engine is the final head's. The harness is d92a56f6's export, which the
head's equals (no change under `scripts/`, `src/` or `test/` since). Idle, visible, against T11's `final-idle/`
(d92a56f6):

| family | kind | pinned | newest | cua | T11's cua | cua warm ms | T11's cua warm ms | newest warm ms | pinned warm ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Firefox | canvas | 40/40 | 28/40 | **40/40** | 30/30 | 354.6 | 354.3 | 525.0 | 1183.5 |
| Firefox | handle-canvas (held stroke) | 30/30 | 30/30 | **30/30** | 30/30 | 209.6 | 208.4 | 291.5 | 299.0 |
| Chrome | canvas | 30/30 | 21/30 | **30/30** | 40/40 | 476.4 | 476.7 | 515.3 | 1161.2 |
| Chrome | scroller (thumb) | 30/30 | 30/30 | **30/30** | 30/30 | 62.5 | 62.8 | 262.4 | 280.0 |

- Every cell lands every run, as in T11's sitting. Firefox's canvas was topped up to 40 a side (its speed interval);
  Chrome's settled at 30.
- Chrome's thumb: 30 of 30 at or past the pinned mean 129 px (shortest 146, mean 146.4; T11: shortest 146).
- Long paths on speed: Firefox's canvas faster, 354.6 ms against the newest build's 518.3 [−171.3, −162.1]; Chrome's
  canvas faster, 476.4 against 517.7 [−47.1, −37.1]. The held stroke's no-press control took 0 of 30.
- Both runs exit 0, the judges' verdict PASS, the watchdog clean.

## Tests

- Engine unit tests (`cargo test --release`): 337 passed (`tests/unit.txt`).
- The live suite as the gate runs it (`--release --locked --target x86_64-unknown-linux-musl --features live`, private
  Xvfb) on 6e9e5b20: every binary passed, `live_device` 34 (`tests/live-suite-6e9e5b20.txt`); db379829's test change
  rerun on its own (both two-screen tests pass, no socket left).
- `node --test test/services-engine-linux/*.test.mjs`: 44/44.
- `npm run test:linux-engine-diff`: 804/804 (`tests/suite-harness.txt`).
