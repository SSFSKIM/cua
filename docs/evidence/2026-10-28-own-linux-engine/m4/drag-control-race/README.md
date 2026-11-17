# The Gecko drag control's missing event: late, the release, and the probe's drain (#171 M4, task 75)

In T17's fix wave the live test `a_gecko_drag_the_real_pointer_leaves_while_it_runs_is_reported`
(`native/linux-engine/tests/live_device.rs`) failed once at its first drag, the control: "the pointer stayed in: a plain
drag", left 1, right 2. The drag had answered ok, so the question was whether cua had answered ok for a drag that
lost an event (a false success, which would reopen T19).

**Answer: no event was lost. The missing event was always the release, and it was always late, never lost.** The X
server queued both the press and the release to the window in every run. The release reached the window 2.5–6.0 ms
after the test's read. The test's read stopped early, and the engine did nothing wrong. No run lost an event and
answered ok.

## The mechanism

- The drag (12 points, a zigzag through the 400×300 window) goes out on the background route. The engine sends the
  window 1,796 synthetic `MotionNotify`, plus `FocusIn`, two `EnterNotify`, the press, the release and `FocusOut`, each
  `SendEvent` with an empty mask, so each goes to the window's creating client, the probe. Each is its own round trip
  (`.check()`), so the server flushes it as its own socket write.
- At the probe's read, 400 ms after the answer, its socket held **8,896 bytes, 278 events, in every one of the 998
  drag reads measured**. The kernel charges each write well over its 32 bytes against the socket's 212,992-byte send
  buffer (`net.core.wmem_default`), so the buffer fills after about 278 writes. The other 1,524 events wait in the
  server's output buffer for that client. The server buffers them; it does not drop them (as task 41 read in
  `os/io.c`, `m4/xserver-record-hang/`).
- `Probe::inputs` slept 400 ms, then drained with `poll_for_event` until it returned nothing. Once the probe empties
  the socket, the server refills it. If the probe polls before the server has run, it sees an empty socket and stops.
  The press came early in the stream, so it was always read. The release came last, so it was the event left behind.
- In every miss, the read held exactly the first socketful: the press and 277 other events. The remaining
  1,523 events, the release last among them, arrived at the next poll, 2.5–6.0 ms after the read.

So the 400 ms window was never the issue: until the probe reads, the release cannot leave the server however long it
waits. A longer sleep would not have helped.

## What was run

Every run used private Xvfb displays (`xvfb-run -a`) under the host lock (`locked.sh task75`), with the gate's command:
`dbus-run-session … cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1`.
The engine and tests are 2d76095c's, plus the instrumentation (`scripts/instrumentation.diff`, `scripts/race_diag.rs`):

- **Each probe read** logs one JSON line: the bytes waiting on the probe's socket at the read (`FIONREAD`), what the
  read got, and what came after it. For the drag control's test, it then reads for a further 2 s, polling every 2 ms;
  for every other test, 50 ms. Then it does a round trip on the probe's own connection: every event the server queued
  to the probe before it handled that request arrives first, so an event still missing after the round trip was never
  queued to the probe, which is lost. The log also records the server's button state (`QueryPointer` mask) and the
  window's own view: presses minus releases in what it read.
  - Why 2 s: it is five times the test's 400 ms settle, longer than the drag itself (about 905 ms), and long enough
    for any scheduling delay. The round trip settles the question for good: whatever is missing after it was never
    queued.
- **The X-level account**: an XRecord context over all clients, around each of the test's three drags. It records
  every core `SendEvent` and XTEST `FakeInput` request with the server time. Separately, it records every
  `ButtonPress`/`ButtonRelease` the server queued to a client (RECORD's delivered events, which hook the server's
  write to the client), with the receiving client's resource base. Recording ran on private displays only, with its
  data connection drained continuously, given task 41's RECORD spin.
- **`--stats`**: the test's engine ran with `--stats`; each drag's stats line (route `background`, `pointer_watch`
  `{leaves: 0, inside_at_end: true}` for the control, `elapsed_ms` about 905, `event_time`) is in each run's log.

The run sets (`runs/*/status.txt`, `runs/*/records.jsonl.gz`, the failing runs' logs; `runs/summary.txt` is
`scripts/analyze.py` over all of them):

| Set | What | Runs | Failed | Drags read short at 400 ms | Of them, the control | Event never queued to the window |
|---|---|---|---|---|---|---|
| `alone` | the test alone | 100 | 4 | 4 (the leave drags) | 0 | 0 |
| `suite` | the gate's command over the unit tests, `identity_boundary`, `launcher_shim`, `live` and `live_device` | 100 (94 reached the test) | 10 | 4 (the leave drags) | 0 | 0 |
| `pinned` | alone, with Xvfb, the engine and the test on CPU 0 beside two busy loops (`scripts/amp.sh`) | 30 | 30 | 30 | 30 | 0 |
| `pinned-fixed` | as `pinned`, with the fix | 30 | 0 | 0 of 90 | 0 of 30 | 0 |
| `fixed` | alone, with the fix | 100 | 0 | 0 of 300 | 0 of 100 | 0 |

- In every short read (38), XRecord shows two `SendEvent` button requests from the engine and two button events
  queued to the probe's client, the press and the release, both `sent`. The probe's read had only the press. The
  release came in the further read, 2.5–6.0 ms after the read, before the round trip. No event ever came only after
  the round trip, and none was missing after it. In those 38 reads the window's view was "button 1 down" (1 press,
  0 releases), and the server's button state was up (mask 0), since `SendEvent` never changes it. Once the late
  release was read, the window's view was up again.
- `pinned` reproduces the original failure exactly: the control drag answered `Ok(Null)` and its read had 1 of 2.
  Each of these misses was the release, late.
- Of all 6,485 probe reads in the suite runs, only this test's reads had a full socket. The next fullest were other
  background drags: `the_ignore_cover_flag_…` (7,424 bytes), `a_chromium_drag_takes_the_background_route_…` (6,880)
  and `gecko_pointer_input_…` (6,016). These are under the limit today but close to it, and the fix covers them too,
  since they share `Probe::inputs`.
- `suite` ran the binaries up to and including `live_device`, in the gate's order on one display. The binaries after
  it run after the test and cannot reach it. The first suite run was the whole command. Six suite runs stopped before
  `live_device` on an unrelated unit test, `engine::identity_faults::a_paste_whose_frame_is_no_longer_told_apart_…`
  ("no focused element to paste into"), now in `tech-debt-tracker.md`.
- After the coordinator's fairness request (2026-11-11), each locked block waited 2 minutes after the last ended
  before asking for the lock again (`scripts/queue.sh`). An earlier queued request was withdrawn before it acquired.

## The fix

`Probe::inputs` makes a round trip on the window's own connection (`self.conn.sync()`) after its settle and before
its drain, so it reads every event the server had queued to the window. The 400 ms settle stays, for events another
client sends later and for the "nothing arrives" checks. The fix landed in `live_device.rs` in 0a83de46 (swept into
T17's fix 2 from the shared checkout); task 75's commit only corrects its comment's count. Other probes already read
the same way (`reported`, and the held-drag listener's loop). `live_minimized.rs`'s `Probe::inputs` has the same
drain but is only ever sent a few events, so it was left alone.

The instrumentation is not merged: it stays here (`scripts/`), applied to a copy of the engine for the runs.
