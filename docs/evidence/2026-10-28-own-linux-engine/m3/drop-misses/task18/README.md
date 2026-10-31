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
