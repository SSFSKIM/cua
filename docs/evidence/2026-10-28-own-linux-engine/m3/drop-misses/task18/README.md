# The Chrome drop misses: the mechanism (task 18)

M3.1 left Chrome HTML5 drops missing 1–3 of 9 in full verdict runs (`../README` in `m3/`, "The open finding"). This
directory holds the full run that caught a miss in the act, with the X record around it, and the sweep that measured
the candidate fixes. The raw records (every motion, crossings, the sweep's request records) stay on the #171 VM under
`~/.local/share/cua-171/task18/`.

## The miss, recorded

`t18-verdict` is a full differential verdict run as `m31-verdict` was run: every scene, `--ops all`, 3 blocks, on the
head engine 0d7fee58, `cua-engine 0.3.0`. The drop-miss instruments ran beside it, none started by the harness:
- `xprobe request-watch`: core and XInput 2 grabs with their replies, `SetSelectionOwner`, and synthetic or XTEST
  buttons, motions counted, then each listed from block 1 on;
- `xprobe selection-watch XdndSelection`;
- `xprobe cursor-watch` from block 2 on;
- the drag page's dragend and timing fields.

Block 0 missed in-front i2 again (`t18-verdict.md`):
- Chrome's drag session did start. `SetSelectionOwner(XdndSelection)` was taken 21 ms after the press, with the
  server's own time, and every XIGrabDevice answered success. Chrome 156 grabs with XInput 2; the core `GrabPointer`
  of the M3.1 hypothesis is not used.
- The page's dragend came with dropEffect none.
- The drag differed only in time: 252 motions and the release in 187 ms, against 421–428 ms in the landed drops.

Two hypotheses are ruled out by this record: an ignored `SetSelectionOwner` and a refused grab.

## The mechanism (Chrome 156.0.8078.73's source, `ui/base/x/x11_drag_drop_client.cc`)

**The decisive status.**
- When Chrome is both the drag source and the drop target, `XDragDropClient::SendXClientEvent` short-circuits
  XdndPosition and XdndStatus inside the process. No XDND message crosses the wire.
- `XDragDropClient::HandleMouseReleased` sends XdndDrop only when `negotiated_operation_` is not none, or, with a
  status still outstanding, after `OnXdndStatus` brings an accepting one. Otherwise it sends XdndLeave: no drop, and
  dropEffect none on the page.
- The target's status carries the renderer's last dragover answer. An accept therefore needs three steps in order:
  Chrome processes a position over the drop zone, the renderer replies, and a later position is processed.

**The accept is visible.** `UpdateCursor` follows every status with a change of the grab cursor, an XIGrabDevice on
the drag window (`X11WholeScreenMoveLoop::UpdateCursor`, `ChangeActivePointerGrabCursor`). Grab 1 after the take is
the drag loop's; grab 2 is the first status ("none"); grab 3 is the accept, at the zone's edge plus one renderer round
trip.

**Two shapes of drag** (`t18-verdict.md`, "Stalls"):
- **Kept up.** Grab 2 comes within 1–3 ms of the take. Chrome's per-motion drag work loads the server, and the
  engine's two synchronous round trips per step queue behind it (`Session::move_to`'s TranslateCoordinates,
  `Session::motion`'s checked SendEvent), so a step takes 1.6–1.8 ms and the drag about 420 ms. Accept→release is
  140–160 ms.
- **Stalled.** 16 of the run's ~45 drop-capable drags. Chrome's first status comes 84–112 ms after the take. The idle
  server answers the engine at once, about 0.75 ms a step, and the drag ends 166–207 ms after the take. Chrome then
  coalesces the motion backlog (`X11WholeScreenMoveLoop::DispatchEvent`, `CoalescePendingMotionEvents`) and jumps into
  the zone. The accept came 169–204 ms after the take when it came before the release. The five stalled drags with no
  accept by the release had the shortest drags, 166–177 ms. One of them is block 0's miss; the late cases recovered
  through the outstanding status.

Nothing in the engine changes between samples; the pacing is fixed. The pinned build misses the same way, on its
fastest drags (`m31-dnd-*`).

## The sweep (`sweep.md`)

The dnd experiment, Chrome, `--no-grabs`, 20 drags a lane:
- in front (visible, activated, with the pinned lane) and dedicated (covered: the foreground route);
- idle and at the M3.1 load (2 stress-ng workers per core);
- for headroom, the harness's own Chrome instance (its own profile; the person's Chrome untouched) with all its
  processes pinned to one core running 2 stress workers (`front-pin-all`; `ded-pin-browser` likewise).

The lanes ran on a scratch prototype engine, `cua-engine 0.3.0 (task18proto[2])`, which was not committed. It is the
head engine plus measurement flags that are off by default:
- `--drag-step-us N`: the step sweep;
- `--drag-dnd-pace-floor-us F`, (a): after the take, each step lasts at least F;
- with `--drag-dnd-pace-budget`, (a) as a schedule: step n after the take ends no sooner than n×F after it;
- `--drag-dnd-accept-wait-ms N`, (c): after the take, hold the release until the second new unnamed displayed cursor,
  nudging once.

Results:
- **No misses.** 1,368 drags missed 0 in every lane, shipping included, and the pinned build landed 62 of 62.
  Pinning Chrome to a loaded core slows it uniformly and keeps accept→release at 83 ms or more. The stall is not CPU
  starvation and reproduces only in the full run, so the edge rests on the full run's stalled drags.
- **(a) as a schedule at F = 1500 µs.** take→release is at least about 350 ms on this path, which leaves at least
  146 ms over the latest stalled accept (204 ms).
  - In front: same as shipping within noise at the M3.1 load, [−29, +18] ms. Faster than the pinned build everywhere:
    idle 517 vs 621, load 533 vs 755.
  - Dedicated: +63 ms idle [46, 89], and undetermined at load [−8, 56].
  - The per-step floor costs more, because it also pads fast steps when the average is already slow. In front at load
    it loses [+51, +87].
- **(c)** cost nothing in every condition, but its signal is weak:
  - The second new unnamed cursor coincided with Chrome's accept grab in 180/180 to 200/200 drags, and in only 85/100
    with the pinned harness Chrome.
  - A target that accepts at the first position shows a single status cursor, so every such drag would wait the full
    bound.
  - The rule depends on Chrome's cursor sequence.
  - The replay counts coincidences only. It does not say whether the misidentified drags would have released early or
    waited.

## The fix (a769edcd) and its runs (`fix.md`, `t18-verdict-fix/`, `vendor-short/`)

The design session chose (a) and stated it as time. Where the engine lets the drop happen (Chrome in front, a dedicated
desktop, Chromium windows), once the source's take is seen, the remaining steps are spaced so that the release comes
no sooner than 350 ms after the take. No step is shorter than before (`dnd.rs` `RELEASE_AFTER_TAKE`).

- **The short drop reproduces the miss in isolation.** It runs 40 px, from the page's `near` source to just inside the
  zone; `fix.md` has the full sweep. A release within 25 ms of the take lands 13–15 of 24, at 50 ms 22 of 24, and at
  75 ms or more 24 of 24 in every cell. With the fix: 12/12 in front (472 ms against 160 before) and 12/12 dedicated
  (399 against 84). The long in-front drop is unchanged within its spread (511 against 498).
- **The vendor builds on the same short drop, in front.** pinned 11/12 at 280 ms, missing on its fastest drag (262);
  newest 12/12 at 258 ms; cua 12/12 at 469 ms. This is a speed gap against the newest build, declared for M4 in the
  engine README.
- **The full verdict run on the fix (`t18-verdict-fix`, every scene, 3 blocks).**
  - Every drop case passes: in front 9/9, dedicated 9/9, short in front 9/9, short dedicated 9/9; the cancel, late,
    late-take and obscured cases too.
  - 21 real-path drags stalled. Their accepts came 148–275 ms after the take, a new maximum. Every scheduled release
    came after its accept.
  - The run exits 1 on two gedit clipboard series, not on any drop. The pinned build's Copy in its own gedit
    succeeded 1 time in 117 (clipboard_read cold) and 5 in 105 (warm), and clipboard_release warm has 80 of 90
    `prepare_error`. Those few fast successes made the pinned build the bar, and it can never reach 20 usable samples.
  - *Correction, 2026-11-01 (task 24):* those Copy failures were the harness's, not the pinned build's.
    - Each lane's gedit text window is opened once per run. The pinned build's failed `type_text_selection` deletes the
      selected first word and pastes nothing, so its 54-character buffer was empty after 9 samples. Every later Copy
      found no selection.
    - Across five runs, the pinned build's Copy succeeded on 30 of 30 samples while its buffer held the first word, and
      on 0 of 342 once the buffer was emptied. This run's 6 successes are its block 0 samples.
    - The record above is left as it was. See [`m3/README.md`](../../README.md), "M3's gate, third run".
- **The bar rule** (the design session, test-first in `test/linux-engine-diff/bar-rule.test.mjs`). A vendor build
  sampled to the top-ups' end (40) with fewer than 20 usable samples has failed the operation and sets no bar in that
  series. The rule binds the vendor builds only.
  - The offline re-judge of `t18-verdict-fix` (`t18-verdict-fix/rejudge-bar-rule.json`) moves exactly those two
    verdicts from fail to pass: clipboard_read faster against the newest build ([−637, −604] cold, [−623, −607] warm),
    and clipboard_release warm the same within noise ([−0.01, 0.01]).
  - m31-verdict's re-judge changes nothing (`rejudge-m31-verdict-bar-rule.json`).
  - The gate is a fresh full run on the reviewed final engine.
