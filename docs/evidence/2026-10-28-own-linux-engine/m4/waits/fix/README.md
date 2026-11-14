# M4, T9: the fix wave (task 64's review)

The review of T9 (reviewer-medium on 21cc0e73..684dd4cf) found three things; the design session ruled on two of them
(2026-11-07). This directory holds the fix wave's tests and sittings. The inventory and the capture rule's text are in
the parent README, updated in place.

| finding | what changed | commit |
|---|---|---|
| P2: the offscreen-capture predicate was unsafe | `cover.rs` `complete_offscreen`: containment and occlusion checked inside the retained ancestor, else the first damage | 2137aec3 |
| P2: Gecko's held moves lost their leading pause without evidence | restored for Gecko (`families.rs` `DragPacing.held_lead_pause`); "kept, T-drag owns it" | 2fb06a92 |
| P3: the inventory left out `drag_along`'s per-sample step | added to the inventory, with the click and wheel holds' ticket (#323) | this directory's commit |
| the design session's ruling on the idle readiness FAIL | the readiness check labels CONTROL NON-DISCRIMINATING and REFERENCE MISMATCH; no pass condition loosened | 958db275 |

Development runs on the #171 VM (8 vCPU), 2026-11-08 UTC, not a release gate. The engine is a musl build of 958db275
made the release workflow's way (`scripts/build-musl.sh`), static-pie, `cua-engine 0.3.0 (958db2755408)`, sha256
`306efe2e2da4227620ad350074515e0ce36aba7b113113b0bd45eb1ad59948b8`; the harness is 958db275's export. Every sitting
ran on a private Xvfb (`scripts/private-run.mjs` for the readiness check, the settle experiment's own for the cell),
with Openbox; nothing on `:0`. The hold file and `pgrep -x stress-ng` were checked before each sitting
(`scripts/fix-chain.sh`); no other session's load ran (00:49 to 01:53 UTC). "Twice the load" is the harness's 16
stress-ng workers on 8 cores (`--load-factor 2`).

## The capture predicate

A window inside an ARGB frame has its contents in the frame's pixmap only where they are drawn: a same-depth sibling
over it inside the frame is drawn there instead, and the window's new pixmap is copied from the frame's with its
inferiors (Xorg's `compNewPixmap`). T9's predicate (any depth change in the ancestry) took such a window as complete.

`cover.rs` `complete_offscreen` (from the same stacking read as the unobscured shortcut, each level now carrying its
parent's depth): find the nearest window of another depth than its parent. If it is the window itself, the window owns
its pixmap. Otherwise the window counts as complete only when it lies wholly inside every ancestor up to that window and
no sibling above it, or above an ancestor inside that window, overlaps it (outer rectangles; InputOnly and unmapped
siblings draw nothing). Every other case, a read error included, waits for the first damage.

The live test (`x11.rs` `a_window_kept_offscreen_is_captured_without_a_first_damage_only_where_nothing_covers_it_inside_its_frame`):
an ARGB frame on the 24-bit root holding a window under a same-depth red sibling, a window alone, and a window past the
frame's edge; an ARGB top-level; a 24-bit top-level; all under a cover on the screen. The test's application repaints an
exposed window green 40 ms after the exposure. Every capture must be all green; the lone window and the ARGB top-level
must be `offscreen` (under 40 ms); the others must not.

- RED on 684dd4cf (`tests/tdd-red-offscreen.txt`): the sheltered window captured at 10.0 ms as `offscreen`, 2,400 of
  2,400 pixels the sibling's red.
- GREEN on 958db275: in the full live run (`tests/live-all.txt`), and 20 of 20 repeated alone.

## Gecko's held moves

`DragPacing.held_lead_pause`: true for Gecko's row only. A held `drag_handle` move over Firefox pauses its 300 µs step
after the leading motion again, as before T9; Chromium's held moves, measured without it, and every other family keep
T9's behaviour. Test: `engine/pointer.rs`
`a_gecko_held_move_keeps_its_pause_after_the_leading_motion_and_a_chromium_one_does_not`, RED as a compile error on
684dd4cf (`tests/tdd-red-gecko.txt`), GREEN after. No Firefox held-move cell was run: the design session left that
measurement to the drag tasks.

## The readiness check's labels

`readinessOutcome`: FAIL for a wrong or unjudged first capture of cua's; otherwise REFERENCE MISMATCH when a pinned
capture is off its truth or unjudged, CONTROL NON-DISCRIMINATING when a control lane captured every first frame right,
and PASS only when neither holds. The pass condition is unchanged. RED: `waits.test.mjs` failed to import
`readinessOutcome` (`tests/tdd-red-harness.txt`); GREEN after.

## Sittings on the final engine

| sitting | result |
|---|---|
| `readiness-gtk4-idle` | PASS, 90 of 90 right; partial and covered 60 of 60 `offscreen`, wait median 10.0, max 10.1 ms |
| `readiness-gtk4-load2` | PASS, 90 of 90 right; partial and covered 60 of 60 `offscreen`, wait median 10.0, max 12.4 ms |
| `readiness-all-idle` | every family 396 of 396 right, only GTK 4 `offscreen`; **REFERENCE MISMATCH, CONTROL NON-DISCRIMINATING**: the pinned build's capture of the unobscured Chrome page 4,500 pixels off its truth (2 of 2, tech debt 1 of task 64), and the quiet control 0 of 396 wrong |
| `readiness-all-load2` | **PASS**, every family 396 of 396 right, only GTK 4 `offscreen`; the quiet control 2 of 396 wrong (a covered Chrome window, 16,461 pixels off, twice), the pinned build 66 of 66 on its truths |
| `activate-click-load2` | `activate_click` on `settle-gtk3`, both modes, `settle-0` (pipelined) and `shipped`: 4 series of 30 consecutive; replayed (`analysis.md`): 120 of 120 pressed on the target, **0 under another window**, 0 before the raise; the press 33.0 ms at least (median 46.2) after the activation request, the raise 1.1 ms median, 7.5 largest |

`move`'s settle cells were not rerun: nothing on the desktop path changed. `Desktop::move_path` sends the same motions
with the same pauses as 684dd4cf (it passes `lead_pause` false, the behaviour T9 measured); only a Gecko held move's
pacing changed, back to before T9.

## Tests

- Engine, `--release --locked --target x86_64-unknown-linux-musl --features live` under `xvfb-run` and
  `dbus-run-session` (`tests/live-all.txt`): unit 388 passed, 1 ignored; identity_boundary 2, launcher_shim 15, live 19,
  live_device 31, live_focus_ack 14, live_focus_out 20, live_minimized 6, no_text_mutators 3, press_boundary 2,
  send_boundary 5; all ok. `cargo fmt --check` clean, clippy clean (`--all-targets --features live`).
- `node --test test/services-engine-linux/*.test.mjs`: 44 of 44 (`tests/node-services.txt`).
- `npm run test:linux-engine-diff`: 786 of 786 (`tests/harness-suite.txt`).

## Scripts

`scripts/`: `env.sh`, `build-musl.sh`, `export-harness.sh`, `fix-chain.sh` (the sittings), `readiness.sh`,
`private.sh`, `private-run.mjs`, `norecord.mjs`, `sitting.sh`, `traced-sitting.sh`, `analyze-order.mjs`,
`press-gaps.mjs`, `offscreen-counts.py`, `lib-live.sh` and `repeat-live.sh` (the engine's unit tests live),
`live.sh`, `copy-evidence.py` (home paths labelled `<home>` and `<task64-fix>`). Most are task 64's, repointed.
