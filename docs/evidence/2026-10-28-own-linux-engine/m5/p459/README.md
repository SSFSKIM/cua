# #459's prototype: the step before a Chrome drop's release (task 126; rulings 957, 958, 962, 967, 968, 970, 974)

This is a development engine build, never released. Every run here is a development run and none is counted. The build
is branch `m5-p459`: 3d3e20d1 (the forms), c91d6a9b (the gate as a function), de3bc094 (the gate judging only the
path's last step). Its flags are measurement-only and off by default (`release_sync.rs`):

- `--drag-dnd-release-sync keepalive` is form (a): one motion at the path's last point, then `dnd::KEEPALIVE` (12 ms).
- `--drag-dnd-release-sync ping` is form (b'). The engine sends `_NET_WM_PING` to the source and waits for the answer,
  sends the motion, sends a second ping and waits for its answer, then releases. One 100 ms bound covers both waits. If
  it expires, the engine releases at once and reports the drop unconfirmed.
- `--drag-dnd-release-sync-dwell-ms 30` is form (b''): a dwell after the second answer. It was dropped by 974.
- `--drag-dnd-release-sync-when outlasted` is the gate (967). The step runs only when the floor sent no keepalive and
  did not space out the path's last step, which is #459's shape.

The motion is synthetic on the background route (one motion) and an XTEST pair on the desktop and foreground routes.
The step is for Chrome sources only (962.1). It runs only on a drop the engine lets drop, after a take seen by the
release. It never runs on a guarded drag. On a Chromium handle's end it runs at the pointer's place.

## Why form (b) as ruled cannot be built: Chrome's own source

Chrome is both the drag's source and its target here, and its XDND messages never cross the X server. The file and line
references are Chromium `main`, read 2026-11-21. Task 18 read the same for 156.

- **`ui/base/x/x11_drag_drop_client.cc` L691-697, `XDragDropClient::SendXClientEvent`.** The comment reads "Don't send
  messages to the X11 message queue if we can help it". `GetForWindow(window)` short-circuits `XdndPosition` and
  `XdndStatus` to the in-process client, so no other process can read the target's status.
- **The same file, L589-636, `HandleMouseReleased`.** With a status outstanding (`waiting_on_status_`), it sets
  `source_state_ = kPendingDrop` and waits.
- **L396-448, `OnXdndStatus`.** It checks `kPendingDrop` before `next_position_message_`, and returns early. So the
  pending drop is decided on the older position's status (`SendXdndDrop` if that status accepted), and the position
  queued meanwhile is never sent.
- **L274-310, `ProcessMouseMove`.** While a status is outstanding, a new position goes into `next_position_message_`
  instead of being sent.
- **`ui/base/x/x11_whole_screen_move_loop.cc` L108-124, `DispatchEvent`.** It runs `CoalescePendingMotionEvents` on a
  core `MotionNotify`. That is V5's counting bug: the first queued motion is dispatched and the rest are lost.
- **The same file, L125-139.** The release case dispatches no motion before `OnMouseReleased`.
- **L229-233, `UpdateCursor`.** It re-sets the grab cursor on every status. A third client sees only an image change
  (XFixes), not a status that repeats.

## Results

### arm64 at twice the load, `t14-long` (long-left), gated, alternating (de3bc094; `arm64/long-all/tables.md`)

| lane | drags | stale-position drops | false oks | honest unconfirmed notices | gate fired | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 0.4.2 (pinned) | 100 | 7 | 10 | 83 | – | – | – | 0.1 / 4.6 |
| (a) keepalive | 100 | 8 | 11 | 81 | 100 | – | 12.1 / 15.1 / 17.0 | 13.3 / 21.2 |
| (b') ping | 150 | **0** | **10** | 140 | 150 | 0 / 150 | 5.3 / 8.5 / 14.9 | 6.4 / 15.0 |

- **No form passes criterion 1** (0 false oks and 0 stale drops).
- **(a) changes nothing** measurable.
- **(b') removes the stale drops but not the false oks.** In every one of (b')'s 10 false oks, both pings were answered
  (0.6-5.4 ms), and the release came 0.1-3.5 ms after the second answer, as on the honest rows (p50 0.1, max 5.7). The
  browser had read the last motion, and Chrome still dropped on its older accept: `OnXdndStatus`'s `kPendingDrop`
  order, above.
- **The geometry.** The zone is page (560, 100) to (960, 620). Long-left ends at page (500, 500), 60 px left of the
  zone's left border and inside its vertical span. `left` also ends 60 px left of it. `inzone-out` ends 12 px below
  its bottom border.

The first gate counted any spaced step, and it skipped 11 of 95 long-left drags. One of those skipped drags was a false
ok. That set was stopped and set aside (`arm64/long-1-gate1-stopped/`). In it, (b'') had 5 false oks in 40.

### x64, D1's Chrome dnd cell, idle, interleaved lanes (`x64/d1-*/summary.md`, `step-cost.md`)

The interval is cua against the newest build, with #358's bound at 40 ms.

| lane | d1-a (3d3e20d1) | d1-b (3d3e20d1) | d1-c (de3bc094) | step added ms p50 / max |
|---|---|---|---|---|
| off | [24.1, 33.7] | [24.4, 31.2] | [24.9, 32.4] | – |
| (a) | **[39.4, 45.3] fail** | **[40.6, 46.7] fail** | **[40.1, 45.4] fail** | 12.2 / 12.6 |
| (b') | [30.6, 35.9] | [27.8, 34.2] | [31.0, 36.1] | 2.0 / 3.3 |
| (b'') | **[59.5, 67] fail** | **[57.8, 64.4] fail** | **[58.9, 65.8] fail** | 32.2 / 33.2 |
| (a) gated | [24.8, 33] | [25, 33.1] | [26, 33.7] | skipped 30/30 |
| (b') gated | [29.6, 36.3] | [26.8, 34.8] | [25.6, 33] | skipped 30/30 |
| (b'') gated | [26.7, 32.7] | [26.8, 34.1] | [28.4, 33.6] | skipped 30/30 |

- Every gated form passes D1, because the gate skips every D1 drag.
- The ping forms make their connection before the press, and that costs about 1-3 ms of the request on every Chrome
  drop the engine lets drop. It is inside the noise between lanes here.

### The route audit (x64, `x64/audit-a/`)

V5's in-front short drop ran with the request audit on, and the ungated forms ran the step on every drop. The audit was
clean 9/9 for (a) and 9/9 for (b'): no XTEST on the background route. The run's one FAIL is the cua lane's hold canary,
which needs `--hold-canary`, and is not the step's.

### The Chromium repro without cua (`repro/`)

The repro is xdotool's XTEST through the zone and out of it, with the release at once. It was **not reproduced**: 0 of 20
idle and 0 of 30 at twice the load on x64. XTEST reaches Chrome as XI2, so mechanism (4) cannot occur here, and
mechanism (3) did not show at this load.

## Tests

- RED: `tdd/red-unit.txt` (7 of 9 failing on the stub) and `tdd/red-live.txt` (3 of 3 failing with the step disabled).
- GREEN at de3bc094: release_sync's 11 unit tests, the 3 live tests, the whole engine suite (544 unit, live 77 + 14 + 20
  + ...), and clippy clean.
