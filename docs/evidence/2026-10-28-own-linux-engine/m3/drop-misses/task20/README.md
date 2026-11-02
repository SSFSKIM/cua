# Task 20: the m3-gate's no-dragstart miss (press and mouseup, no dragstart, no take, 133 ms)

The m3-gate failed on one sample: `chrome_dnd_short_in_front_shared`, block 2, cold. The page counted the press and the
mouseup, and no `dragstart` fired. No take came, so the release went out at the raw pace.

## The mechanism (in vitro, every build)

Blink resets its press state on any mouse move that carries no button (`event_handler.cc`, "Mouse states need to be
reset when mouse move with no button down", crbug 527582). After the reset, the later drag motions start nothing and
the release is a click. Two kinds of event reach Chrome as such a move:
- a core crossing event, which Chrome turns into a move with the real pointer's button state (`events_x_utils.cc`);
- an XInput 2 motion of the real pointer.

None of the drag's own synthetic events carries the real state, so either has to come from outside the drag. It
kills the drag if Chrome receives it after the synthetic press and before the first motion past Blink's 4 px drag
threshold. That window is about 3 ms for cua, 5 ms for the pinned build and 2 ms for the newest.

| what reached Chrome during the press (cold short drop in front, after the gate's prelude) | cua | pinned | newest |
|---|---|---|---|
| nothing (R1 cover, R2 prelude, R3 the gate's own cases: 100 cold each, R3 200 warm) | 0 A / 500 | 0 A / 200 | 0 A / 200 |
| a real pointer nudge (XTEST, 1 px and back) before the first motion past 4 px | 11 A / 12 | 9 A / 9 | 3 A / 5 |
| the same nudge after it | 0 / 48 | 0 / 13 | 0 / 17 |
| another client's 5x5 window mapped under the real pointer for 5 ms (popup), 0-2 ms after the request | 18 A / 18 | | |
| the real pointer parked outside Chrome's window, no stray event at all (Chrome's own capture grab sends it `EnterNotify` mode Grab) | 8 A / 8 | 8 A / 8 | 8 A / 8 |
| the real pointer parked inside Chrome's window, away from the path | 0 A / 8 | 0 A / 8 | 0 A / 8 |

The A rows match the gate's record field for field:
- the page counts the press and the mouseup;
- the pointer log shows moves past the threshold with the button held, and moves with no button;
- there is no dragstart and no take;
- the release comes about 30 ms after the press.

With the pointer outside the window, the 250 px drop and the 40 px text selection also fail (0/6 each). The 40 px
range drag still lands (11/12).

Momentary grabs by another client after Chrome's capture grab (`xprobe grabs` at 10-70 ms) change nothing (40/40
landed), because Chrome's active grab makes them fail.

## Why the gate saw it once

In the gate-shaped runs nothing reached Chrome in the press window: R3, with crossing-watch running, recorded 0
crossings to Chrome between a press and its take over 302 presses. The prelude (the dedicated case's XTEST drop) leaves
the real pointer on the drop zone, inside Chrome's window. So the gate's miss needs a pointer event from outside the
drag at the wrong 3 ms. Two kinds of event could have supplied one:
- a window mapped or moved under the pointer;
- the pointer's window changing just before the press, so that Chrome's own grab crossing follows it.

The gate ran no crossing record, so which one it was is not recoverable. Not cold-specific: cold and warm
distributions are the same (R3).

## Healthy timing (cold, no stray)

| | press to the first motion past 4 px | press to the take | renderer dragstart (handler, after the press) |
|---|---|---|---|
| cua (R1+R2+R3, 300) | 2-4 ms | p50 14, p99 22, max 24 ms | max 16.5 ms (one frame) |
| pinned (R1+R2, 200) | 4-7 ms | max 25 ms | max 18 ms |
| newest (R1+R2, 200) | 2-3 ms | max 22 ms | max 16 ms |

A side finding, the vendor builds' own short-drop misses (release before Chrome's accept, mode B): pinned 0/100 and
newest 9/100 landed with the real pointer away from the drop zone (R1). Both landed 100/100 with it on the drop zone
(R2). Chrome's drag loop starts from the real pointer's position, so the pointer on the zone gets an early accept.
cua's 350 ms floor lands 100/100 either way. The pinned build's one short miss on record (task 18's vendor-short, its
fastest drag) was this mode B: the take came 48 ms before the drag ended. It was not the gate's mode.

## The candidates (scratch engine, `tools/proto-edit*.py`; never in the branch)

Against a nudge in the press window (10 drags a lane, `cand-stray-nudge1-raw`) and a popup (`cand-stray-popup1`):

| lane | nudge: A | popup: A | sees the stray |
|---|---|---|---|
| today | 10/10 | 10/10 | – |
| (a)/(b) first step to 4 px, then up to 50 ms for the take | 5/10 | 10/10 | – |
| first step to 4 px alone | 5/10 | 9/9 | – |
| atomic press: press and every sample through 4 px under one server grab | 1/10 | 10/10 (the popup came before the press: Chrome's grab crossing) | – |
| watch: XInput 2 raw motion on the root plus core crossing on the window, own connection | 7/10 | 10/10 | 10/10 and 10/10, every A included |

What each adds (`cost2.jsonl`, median of 12, against today):

| lane | Chrome 40 px select | Chrome 40 px range | Chrome 40 px drop | Chrome 250 px drop | gedit 40 px select |
|---|---|---|---|---|---|
| atomic | -3.1 | -3.0 | -3.8 | -3.7 | 0.0 |
| atomic + watch | -3.0 | -2.8 | -6.6 | -2.1 | +1.1 |
| (b) 50 ms wait, Chromium only | +47.8 | +48.2 | -9.1 | +13.2 | +0.9 |
| (a) 50 ms wait, every family | +48.1 | +47.7 | -8.6 | +3.1 | +51.1 |
| minimum 150 ms press-to-release, Chromium | +119.3 | +120.5 | +14.7 | -5.1 | +0.6 |

A bounded wait for the take cannot fix this: after the reset no take ever comes.

## Files

- `runs/<run>/summary.txt` and `drags.jsonl`: each drag joined to the request record and the page's pointer log
  (`tools/analyze.mjs`); `stray-crossings.txt`: crossings to Chrome inside the press window (`tools/stray-check.py`).
- `runs/cost*.jsonl`: the cost runs (`tools/cost.mjs`, `tools/cost-table.py`). `cost1-select-contaminated` pressed
  inside the last selection, so its select column measured a text drag. It is kept for the record, and `cost2` replaces
  it.
- The raw records (results, request, cursor and crossing watches) stay on the VM under
  `~/.local/share/cua-171/task20/runs/`.
