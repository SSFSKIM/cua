# Probe 456: an own-app popup opened during the element route's wait, main against the fix

Hosted qualification kit for #456 (`fix/456-recheck-overlay`). It is built on #337's kit (`scripts/probe-337/`), and
reuses that kit's `tool.swift` and `qualify.mjs` unchanged. It is disposable and is not a ci-kit gate. Workflow:
`.github/workflows/probe-456.yml`. Dispatch it with two exact SHAs; both engines are built unmodified, each in its own
detached worktree.

Engines, in every table below:
- main `edbfbd233ad9b4496b4d78062e51c0f826f78631`
- fix `6f1224e7491d0924fc23258b086ea2fe39fb473f`

The two heads are interleaved: one unit of delays runs on one head, then on the other, and the order alternates.

## What a row does

Setup:
- Stable Google Chrome sits at (400, 30, 620×720), behind a TextEdit cover at (0, 40, 380×300), in shared mode.
- Each row starts with a re-set: Escape twice, the page reloaded, the web area focused, the cover frontmost.
- Then one observation, taken with the omnibox popup closed. A row with a popup up at the observation is dropped.

The cells:

- `race`, via `typed` (the route that worked; see "Routes that did not work"):
  - Before the observation, ⌘L goes to Chrome on an engine connection that is then closed. That leaves the omnibox
    focused, with its focus hold released, so Chrome no longer believes it is focused.
  - Then comes a coordinate click on the page's "Under popup" button, 18 pt below its top, where the popup's first row
    opens. It takes #282's element route. The route runs its focus hold (`activationGuardMs` 50-150 ms), then the
    recheck (`rechecked`, `afterActivation`), then the press.
  - A second engine connection types `probe` with `type_text`, `delay` ms after the click is sent. These are plain
    characters on route 2′. The popup opens once the hold has made Chrome believe it is active; typed earlier than
    about 30 ms ahead, no popup opens at all.
- `nokeys`: the same setup and click, with nothing typed.
- `field`:
  - First a posted pointer press: a click on Chrome's disabled Back button, posted by route 3, which #359 records.
  - About 150 ms later, a coordinate click on the page's "Under field" text field. It takes #283's focus route, which
    first waits on the field's range (#359's pending click), then rechecks on the fix, then reads the caret, then
    writes the focus.
  - A second connection sends ⌘L and types `probe` `delay` ms after that click is sent. That connection's focus hold
    does not touch the field route, which takes none.
  - `jitter`: the page moves its focus between the field and Alpha every 20 ms, so #359's sample never holds still and
    the wait runs to its 300 ms cap. These rows' landing is read from the meta (whether the focus write was posted).
- `plain`: an ordinary background element-route click on Beta, with no keys.
- parity (kit=parity): #337's `qualify.mjs` on #452's click-through cells (status bubble and tab hover card), with
  Chrome frontmost in shared mode, clicked inside and outside.

The racer (`racer.swift`, a second process) reads the on-screen window list every ~2 ms, from before the click to 1.3 s
after it. It records the first time a window of Chrome's other than the observed one holds the click's point:
- first listed (any alpha);
- first visible (alpha above 0), together with one application hit-test at that moment.

Its sampling gap reached 85 ms while Chrome was busy, so a first sight can be late by that much.

## Classes

Times are the runner's wall clock, in ms. The engine's `receivedAt` marks the request coming in; the first check runs
right after it. The wait's end depends on the route:
- `race`: the meta's `startedAt` (the press, which follows the recheck at once), else the answer's arrival when
  nothing was posted.
- `field`: `receivedAt` plus #359's `waitMs`, a lower bound on the recheck's start.

| Class | Meaning |
|---|---|
| early | refused at the first check (`rechecked` absent) |
| in | the popup was first seen visible after `receivedAt` and by the wait's end |
| hitFirst | refused by the recheck's hit over the popup's own window (`overWindow` = the popup's number), which the window list showed visible only just after the answer, within the racer's sampling gap |
| afterWait | `field` only: the popup was seen after the wait's end and before the focus write |
| late | the popup was seen after all of that |
| nopopup | no popup appeared in the watch |

Reader: `node scripts/probe-456/summary.mjs <results.json>`.

## Runs

Everything ran on GitHub-hosted macOS 26.7.2, image 20261117.0516.1, with Google Chrome 157.0.8103.79. Smoke 2 is the
exception: image 20261102.0473.1, Chrome 156.0.8078.80. Each run's artifacts (`results.json`, `summary.txt`, the
engine's screenshots, full-screen captures after each click) are in `~/.local/share/probe-456/run-<id>/` on the
MacBook.

| Run | Kit | What it ran |
|---|---|---|
| [44882947657](https://github.com/SSFSKIM/cua/actions/runs/44882947657) | c9b02e0d | smoke 1: racer keys, 46 rows |
| [44887358549](https://github.com/SSFSKIM/cua/actions/runs/44887358549) | 96f2fa88 | smoke 2: stamped racer keys, a second connection's ⌘L, 40 rows |
| [44898160974](https://github.com/SSFSKIM/cua/actions/runs/44898160974) | 887c4a44 | smoke 3: `typed`, 30 rows |
| [44917004422](https://github.com/SSFSKIM/cua/actions/runs/44917004422) | c03aaa37 | full: 256 race-kit rows plus 40 parity rows |
| [44921009991](https://github.com/SSFSKIM/cua/actions/runs/44921009991) | 41ec47a6 | race top-up: 72 rows, delays -15, -10, -5 |

## Results, main edbfbd23 against fix 6f1224e7

### Cell 1, race: the popup opened during the focus hold (full run plus top-up, delays -30 to -5 ms)

| Head | Rows | in-window (in + hitFirst) | early | late | nopopup | In-window outcome |
|---|---|---|---|---|---|---|
| main | 84 | 18 (18 + 0) | 0 | 54 | 12 | **pressed under the popup 18/18**: kept/noHit rechecked, the page's `click` on the button, the popup still up after |
| fix | 84 | 38 (29 + 9) | 0 | 32 | 14 | **refused 37/38**: `appWindowOverPoint`, `rechecked: true`, `afterActivation: true`, `by: axHit`, `overWindow` = the popup's window number, nothing pressed; **kept and pressed 1/38** (see Findings) |

Notes:
- Late rows press on both heads, as the screenshot showed. The popup came after the press there.
- Smoke 3 adds 1 in-window row per head, with the same outcomes: main pressed under the popup, the fix refused by
  axHit over it.
- The popup's window (49, layer 0, (499, 56, 458×178) when shown) is first listed at alpha 0, 50-150 ms before it
  shows. When that listing comes before the first check, #316's rule W refuses at the first check (smoke 2, both
  heads). No full-run row was early.

### Cell 2, nokeys and plain: ordinary background element-route clicks

| Cell | main | fix |
|---|---|---|
| nokeys (full run) | kept/sameElement rechecked, pressed 8/8 | the same 8/8 |
| plain, Beta (full run) | kept/nonInteractiveHit rechecked, pressed 8/8 | the same 8/8 |
| nokeys (smokes 1 and 3) | pressed 2/2 | pressed 2/2 |

### Cell 3, field: the popup opened during #359's pending-click wait (full run, delays -20 to 10 ms)

| Variant | Head | Rows | in | hitFirst | afterWait | late | Outcome |
|---|---|---|---|---|---|---|---|
| no jitter | main | 32 | 0 | 0 | 0 | 32 | focus written 32/32 |
| no jitter | fix | 32 | 0 | 1 | 0 | 31 | hitFirst refused `appWindowOverPoint` rechecked by axHit over the popup, field not focused; late focus written 31/31 |
| jitter | main | 32 | 0 | 0 | 1 | 31 | focus written 32/32 (2 answered `clickUnconfirmed`) |
| jitter | fix | 32 | 0 | 4 | 3 | 25 | hitFirst refused 4/4 (rechecked, axHit, over the popup, nothing written); **afterWait kept and focus written 3/3** (see Findings); late focus written 25/25 |

Smoke 3 adds 1 fix row refused over the popup (waitMs 154) and 4 late main rows.

**The cell is not reliable on hosted.** The wait lasts 50-250 ms. The popup shows 150-450 ms after the ⌘L, and the
second connection's ⌘L itself takes 70-150 ms to answer. Over 128 full-run rows plus 16 in smokes 1 and 3, the counts
were:
- fix: 6 rows in the window, all refused with `rechecked: true` and the field not focused;
- main: no row in the window, so main's behaviour inside this wait was not observed.

The cell was dropped there rather than burning more runs.

### Cell 4, parity: #452's click-through cells (full run, `qualify.mjs`, Chrome frontmost, shared mode)

| Cell | Side | main | fix |
|---|---|---|---|
| status bubble | inside / outside | posted, kept/nonInteractiveHit, landed 5/5 and 5/5 | the same 5/5 and 5/5 |
| tab hover card | inside / outside | posted, kept/nonInteractiveHit, landed 5/5 and 5/5 | the same 5/5 and 5/5 |

**Nothing that main kept was refused by the fix**, in any cell. Every fix refusal was over the popup's own window.

## The refusal sentences (fix)

After the focus hold (the race cell, 37 rows):

> Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. The app was activated in the background, but nothing was pressed. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getAXState() and click an element it lists.

After #359's wait (the field cell, 6 rows):

> Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getAXState() and click an element it lists.

## Findings

- **The fix pressed under the popup once in the race cell (1 of 38 in-window rows).** The row is
  `race--10-free-typed-1-fix` in the top-up run.
  - The recheck's hit-test took 267 ms (`hitMs` 267.1), under the 500 ms deadline, while Chrome built the popup.
  - The verdict was kept/noHit and the window list was read (`windowsMs` 1.9). The likeliest reading: the hit answered
    in the popup's window while that window was still listed at alpha 0, fading in. It was listed at alpha 0 from 219
    ms and shown at 380 ms. #452's `hitWindowCovers` needs alpha above 0, so the tree's verdict stood.
  - The press went out at 408 ms, after the popup had shown.
  - The window between that list read and the press is the residual: a popup still at alpha 0 at the recheck's list
    read.
- **The fix wrote the field's focus under the popup in 3 field rows (jitter variant).** In each, the popup showed
  after #359's wait and its recheck, but 2, 11 and 28 ms before the focus write.
  - The field route reads the caret's offset between the recheck and the write. Here that took 100-200 ms (e.g.
    waitMs 134, write at 285 ms), and no check runs after it.
  - Main wrote the focus under the popup in 1 such row.
- **Main presses under a popup that opened during the wait, as #456 says**: 18/18 in-window race rows. The page's own
  `click` reached the "Under popup" button beneath the popup, and the popup was still up afterwards.

## Routes that did not work

- **Racer keys posted to Chrome's process trip the intervention tap** (smoke 1): `userIntervened` in 27 of 30 keyed
  rows, on both heads; the other 3 were refused at the first check by rule W.
  - Stamping the events' source pid (field 41) with the engine's pid does not get past the tap (smoke 2: 22 of 22).
  - The posted keys do open the popup, 140-500 ms after them, even with Chrome inactive (`keysonly`).
- **A second connection's ⌘L during the click** takes a focus hold of its own. The click's route then has no hold to
  wait through (`activationGuardMs` absent), so no row landed in the window (smoke 2: early 5, late 9).
- **Jittering the field's value** did not move #359's range read; the wait stayed at 50-130 ms (smoke 3). Jittering
  the page's focus did reach the cap in some rows (waitMs up to 246).
