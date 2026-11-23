T17 (#250) drag_handle lifecycle: the proposal for the design session (task 73)

TL;DR. The atomic press and the press watch were built against a failure that needs a synthetic press. drag_handle never makes one: its press and every motion go through XTEST on the real pointer, in both modes. On that route, the disturbances behind #250 (a popup crossing under the pointer, a nudge of the pointer, a 2 s wait before the first move) lost 0 of 240 cua handle presses, and 0 of 240 for the newest vendor build. The one disturbance that loses an XTEST press is another client's active pointer grab held over the press: 60 of 60 lost for cua and 60 of 60 for the newest build, every one answered ok. So I propose:
- keep the press at `start`, as the vendor does;
- a check just before the press that refuses with nothing pressed when another client holds the pointer;
- a watch from the press to the release for a grab taken during the hold, answered at `end`;
- T14's after-release watch at a Chromium handle's `end`.
There is no deferral, no atomic press for handles, and no event deviation.

THE MEASUREMENT
A private Xvfb with Openbox. Chrome 156 on the harness's drag page. The drag experiment's held-move cells: `start` at the path's first point, a held `move_to` to each later point, then `end`, 10 ms apart (the service's settle). It ran on a patched copy of the harness at 328a3bb5, outside the repository. The patch added select and range held cells and alternated their paths by run. A selection or range run counts only when its value changed to the pinned build's.

Engines: a musl build of 328a3bb5 made the release workflow's way, the pinned 26.928 and the newest 26.1023. Each disturbance went between `start`'s answer and the first `move_to`, in the `newest` and `cua:d` lanes. `pinned` and `cua` ran undisturbed beside them in every sitting.

Kinds: text selection, range input and HTML5 drop, the three kinds task 20 showed losing presses. 20 runs per lane, kind and sitting, five sittings. All ran under the host lock (task73 in host-lock.log, 19:43–20:14Z and 20:19–20:42Z).

Took, per disturbance (select + range + drop, of 60):

| disturbance between start and the first move | cua | newest | answered ok |
|---|---|---|---|
| none | 60 | 60 | all |
| another client's 5x5 override-redirect window under the pointer for 5 ms (task 20's popup, which lost 18 of 18 background drags) | 60 | 60 | all |
| an XTEST nudge of 1 px and back | 60 | 60 | all |
| 2 s before the first move (an agent's round trip) | 60 | 60 | all |
| another client's active pointer grab over the press, released after `start` answered | 0 | 0 | all 120: lost presses answered ok |

The undisturbed `pinned` and `cua` lanes took 300 of 300 each across the sittings.

The popup did reach the page. Chrome turned its crossing into a pointer move at the press point, and every one of those moves carried button 1: 40 of 40 disturbed drops logged a (0,0) move with buttons 1, against 0 of 40 undisturbed. No drop's log in any sitting showed a buttonless move. Under the grab, the page never saw the press (`downs` unchanged, 40 of 40).

Why, from the code: Xorg delivers every master-device event with the master's own button state (Xi/exevents.c ProcessDeviceEvent: for a pointer `mouse = device`, then `event_set_state(mouse, kbd, event)`). A master's button stays down while any of its slaves holds it (UpdateDeviceState, ButtonRelease on a master: "Leave the button down if any slave has the button still down"). So once XTEST holds button 1, every crossing and motion reaching Chrome carries it, the person's mouse on the same master included. Blink's reset needs a move with no button. Task 20's README says why the background route meets it: "None of the drag's own synthetic events carries the real state".

1. THE TARGET WINDOW
- It is the top-level under the start point at `start` (`client_at`, as the handle's pacing already resolves it and as a desktop `drag` resolves its start), kept for the whole handle.
- It decides the pacing (unchanged), whether the handle is a Chromium one (item 4) and the window the watch names.
- Alternatives:
  - Per move: rejected, since T11's rule is that the start's window decides the handle.
  - The window under the pointer at the press: the same window, since the press follows the placement.
- The vendor has no window; its handle is desktop-only.
- "The pointer outside" against this window cannot arise at the press, because `start` puts the real pointer at the start point just before pressing. If an override-redirect window covers the start point, `client_at` finds no client, and the handle is the plain desktop route, as today.
- T19: a handle never takes the background route, and its pointer is the real one, so Gecko's rule (background pointer input only while the real pointer is in the window) holds by construction. T19's QueryPointer check and leave watch do not apply. A handle that leaves its window is its own path (a drag between windows), not a stray.

2. WHEN THE PRESS HAPPENS
- Recommended: at `start`, as today and as the vendor does (move_path, a motion, button 1 down).
- The alternative is deferring the press to the first `move_to` under an atomic press. It protects nothing on this route: the popup, the nudge and the wait lost nothing, and a server grab does not end another client's pointer grab. It also costs three things:
  - it creates the case it must then guard: the pointer moved away during the round trip before the press;
  - it changes `start`'s effect, which needs an `events.mjs` deviation;
  - `start` then `end` becomes a click delayed until `end`.
- What does protect is a check just before the press. Under a server grab the engine tries a pointer grab on the deepest window under the pointer and gives it up at once.
  - AlreadyGrabbed means another client holds the pointer. `start` then refuses with nothing pressed, for example: `another application holds the pointer (an open menu, or a drag in progress); nothing was pressed. Close it or wait, then start the handle again`.
  - Otherwise the press goes out under the same server grab.
- Probed on a scratch private Xvfb (Openbox, an xterm under the pointer):
  - free: 5 of 5 `success`, with 0 crossings of any window in the pointer's chain;
  - with another client's grab held: 3 of 3 `already_grabbed`.
- It applies to every handle, whatever the family, since a grab steals any XTEST press. It needs measuring on Chrome and Electron before adoption.

3. START THEN END WITH NO MOVE; THE CLEANUP BEFORE A FIRST MOVE
- A press at the start, then the release in place, as the vendor does: a click held across the round trip, which is what the calls ask for. A family with a held rest keeps its rest and revisit at `end` (T11).
- Before a first move, the cleanup is T7b's: an exit releases where the pointer is, which is still the start point.
- #250's leads, rejected:
  - Escape, then release: an XTEST Escape goes to the focused window, on a shared desktop possibly the person's.
  - Move back, then release: there is no move to undo.
- Open, and yours to call: other acting requests between `start` and `end`. They stay allowed, as the vendor allows them, but a windowless click among them presses and releases button 1 on the same XTEST device and ends the hold. I'd refuse windowless pointer input while a handle is held (`a drag handle is held; end it before sending desktop pointer input`). It changes no vendor-JavaScript case, but it is a product call.

4. HOW THE STRAY WATCH SPANS THE ROUND TRIPS
- What it catches. On this route the only thing found to cut a handle is another client's pointer grab: either held at the press (the check in item 2) or taken during the hold, which shows as a crossing of the target in mode Grab or Ungrab before the release.
- The person's mouse moving changes the path but keeps the press. Counting it would bring #249's false error to every shared-desktop handle, so I'd keep it in `--stats` only.
- How it reads. Only the target's crossings are selected, so nothing floods, from just before the press to just after the release. They are read on the watch's own connection by a thread off the request path that keeps the first such crossing, as `dnd::LateWatch` does. The watch ends at `end` or at exit.
- What it answers.
  - At `end`, a release that always runs, so the error comes with the button already up: `<app> may not have received your drag: another application took the pointer while the handle was held. Read the window to see what happened before dragging again`.
  - Never at `move_to`: an error there would throw before the agent's `end` and leave button 1 held at the server.
  - A take before the release (the target took XdndSelection) silences it, as `stray::answer` does for `drag`.
- A Chromium target's `end` arms T14's after-release watch, as `drag` does on the desktop route over Chromium. Today a handle's end arms none, so this is the change that gives a handle's drop answer T14's shape. It covers:
  - the late take, with Escape through XTEST;
  - for Chrome, where the window manager lists `_NET_ACTIVE_WINDOW`, the drop confirmation within `DROP_CONFIRM` for the top-level under the end point;
  - the notice on the next reply of any kind, and the next acting request refused once, with T14's sentences unchanged.
- Not proposed unless you want it: T14's floor and hold at a handle's release. T11's residue (Electron's held drop at twice the load, 37 of 40 against the pinned build's 38) stays a residue. The take watch the stray answer needs would carry the floor, at no cost when the take came more than 350 ms before `end`.

5. events.mjs's EVENT PROOFS
- None change. `start` still presses at its point, so the desktop `drag_handle` scenario, the vendor-JavaScript case (`pressedAt` after `start`) and `MOTION_STEPS`' handle stand as they are.
- The grab check sent no crossing in the probe. The recorder logs crossings, so an unchanged comparison against the pinned build is its proof on the shipped bytes.
- Deviations to declare:
  - a handle started while another client holds the pointer is refused, where the vendor presses and answers ok;
  - `end` answers the grab error;
  - a Chromium handle's drop notices.

THE PROOF UNDER THIS LIFECYCLE (the row's, restated)
- Undisturbed handle sequences in Chrome and Electron (select, range, drop, canvas): 0 false errors over 100 or more.
- A foreign grab over the press: refused with nothing pressed, in both modes.
- A grab taken during the hold: `end` answers the error.
- The row's "pointer outside the target" cannot occur at the press, so it becomes a popup and a nudge during the hold, which stay ok and land.
- A handle drop's T14 cases: a late take, an unconfirmed drop, and a normal drop with no notice.
- The vendor-JavaScript `drag_handle` cases unchanged.
- The bar holds: a lost press never answers success.

TO RULE
1. The lifecycle above, or deferral instead.
2. Whether the person's mouse moving during a hold is reported.
3. Whether windowless pointer input is refused while a handle is held.
4. Whether T14's floor comes to handles.

Files: tables in <task73>/probe-tables.md; runs under <task73>/runs/probe-*; the probe tools in <task73>/probes/. They go to docs/evidence/…/m4/drag-handle/ with the build.
