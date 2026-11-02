# M4 T4: minimized windows

These are development runs on the #171 VM's `:0`, not a release gate. The candidate is a musl build made as the
release workflow makes it (`cargo build --release --locked --target x86_64-unknown-linux-musl`):
`cua-engine 0.3.0 (81a1ba773b0a)`, sha256 `02787b64a1dac1056e127544a5fe8b0fb63bffda809d8291a6f151f58f124c42`,
static-pie. Its engine sources are those of commit 7ea7cd8c, which is also the head's engine (no engine change since).
The vendor builds are the pinned build (`7ac3c2ae…`) and the newest build (`88ce5e0a…`).

## C22, checked first (`c22/`)

`c22-probe.sh` opens a gedit of its own and minimizes it with `xprobe minimize`. It then sends `list_windows` and
`activate_window` over the wire and reads the window's state afterwards. It prints window ids only.

| Engine | `list_windows` | `activate_window` | After 50 ms |
|---|---|---|---|
| cua 0.3.0 (`c22-030.txt`) | not listed | `failed to focus X11 window …: … Match … SetInputFocus` | viewable, Normal, active |
| pinned (`c22-pinned.txt`) | not listed | the same BadMatch | viewable, Normal, active |
| newest (`c22-newest.txt`) | not listed | the same BadMatch | viewable, Normal, active |

All three engines answered an error for an activation that happened. The cause: the focus request is pipelined
behind the activation request, and arrives while the window is still unmapped. Openbox maps and activates the window
within 50 ms. cua's engine now waits for the window to be viewable after a BadMatch, at most 1 s, and sets the focus
again.

`xdotool-minimize.txt`: `xdotool windowminimize` without `--sync` returned in 5 ms. When a harness window was the
previous focus, the window manager's fallback went to it. When the minimized window was the only harness window, the
fallback went to the owner's Chrome (the first C22 probe, before the guard below). Nothing was ever sent to Chrome.

## The wire run (`diff/`, `t4-minimized`, exit 0)

The scenes are `minimized` (gedit) and `minimized-xterm`. cua runs alone (`minimized.mjs`), 9 samples per case: 3
blocks, each with a cold sample and 2 warm ones. The run also has the `desktop` scene's operations, as `--ops all`
plans them. Its verdict line: "run valid; development run, not a release gate: no verdict FAIL; parity (declared, not
a pass): desktop get_screenshot cua". The negative check failed the activating stub on both the witness and the audit.

| Case | Expectation | Samples | Witness clean | Audit |
|---|---|---|---|---|
| press_key, key_down, click, right click, element click, secondary action, move, scroll, drag, type_text, type_characters, clipboard_read, clipboard_write | refused as minimized, shared | 9 each | 9 each | nothing sent, clean |
| press_key, click, type_text | refused as minimized, dedicated | 9 each | 9 each | nothing sent, clean |
| xterm press_key, shared and dedicated | refused as minimized, before the device refusal | 9 each | 9 each | nothing sent, clean |
| list_windows | the window `minimized: true`, no other window with the field | 9 | 9 | background, clean |
| get_window_state without and with a screenshot | an AT-SPI tree, `screenshots: []`, the field in `window` | 9 each | 9 each | background, clean |
| the same window restored: get_window_state with a screenshot, list_windows (controls) | one screenshot, no field anywhere | 9 each | 9 each | background, clean |
| key_up of a Shift held through the background route, then minimized | success, window still minimized, no key down at the server | 9 | 9 | background, clean |
| key_up of a Shift held through xterm's foreground route (dedicated), then minimized | success, window still minimized, no key down at the server | 9 | 9 | held-release, clean: the hold's activation once a sample, nothing more |
| activate_window | success, restored and active | 9 | not judged (it activates) | foreground (target only), clean |
| activate_window on a withdrawn window | the first focus error at the bound, still unmapped | 9 | 9 | foreground (target only), clean |

How each sample was set up:
- Every refusal sample checked that the window's contents (gedit's text, or the bytes xterm received) were unchanged
  and the window still minimized, 400 ms after the answer.
- Each minimize took 0.4–6.2 ms (`minimized_by.ms`, 234 minimizes).
- After every minimize, the active window was the harness's front window, `33554446` (`minimized_by.active_after`).
- The harness's guard would have stopped the run had it been a window the harness did not open.

## The activation's wait (`diff-activation/`, `t4-minimized-activation`, exit 0)

This run repeats the two activation cases with the row's `activation` record, which the first run's harness did not
copy yet.
- All 9 activations of a minimized gedit went through the wait and the second focus. Openbox mapped the window within
  `map_wait_ms` 7.9–12.7, and the request answered in 8.4–13.5 ms.
- The withdrawn window answered the first BadMatch at 1003.5–1006.0 ms, every time.

## Through the real facade (`parity/`)

repl-parity's native suite ran on both engine lanes. The cua lane used `--engine-bin` on this build, copied as
`cua-engine`, the name the lane's engine check requires. The getAXState case now runs on the `minimized` fixture.
serve-native first opens a second gedit of its own, which takes the focus fallback. Once the bind has answered, it
minimizes the bound gedit.

Then, through the facade:
- the window is listed with `minimized: true`, alone, and the focus is on the fixture's window;
- getAXState returns the full tree twice;
- the screenshot answers `Screenshot unavailable for window <id>.`;
- pressKey answers `Window <id> is minimized; activate it first`;
- activate_window succeeds, the field goes, and the screenshot returns.

The pinned vendor engine's lane answers `Window <id> is unavailable.` to every request and leaves the window
minimized. That is declared (`test/repl-parity/vendor-defects.json`, `linux-x64-vendor-engine-minimized-window-unavailable`).

The sitting at f41653f6 (prepared from that commit, `parity-run.sh`):
- vendor lane: `RECORDED_VENDOR_DEFECT`, 30 cases covered, 3 declared defects (M2's two text cases and this one);
- cua lane: `PASS`, 33 of 33 covered;
- `diff.json`: the engine-lane diff against `scripts/repl-parity/expected/native-linux.json`, `ok` with no
  difference and the three declarations applied.

An earlier sitting at 2f79b760 recorded the same two results. Its cua lane was refused by the engine check, because
the engine's file name was not `cua-engine`, and it was not kept.

## Limits

- A button held across requests is released on a minimized window only in the engine's live test on Xvfb
  (`tests/live_minimized.rs`, a `drag_handle` over a window that is then minimized). The only cross-request button
  hold is `drag_handle`'s, and it is desktop-route XTEST, which the harness does not send on the person's display.
- The background release's "only the release" rests on the background audit (no XTEST, no focus, no activation) and
  the witness. xtrace prints SendEvent's event type, but the audit does not count KeyRelease events.
