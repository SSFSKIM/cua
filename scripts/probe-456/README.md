# Probe 456: an own-app popup opened during the element route's wait, main against the fix

Hosted qualification kit for #456 (`fix/456-recheck-overlay`), built on #337's kit (`scripts/probe-337/`, whose
`tool.swift` and `qualify.mjs` are reused unchanged). It is disposable and not a ci-kit gate. Workflow:
`.github/workflows/probe-456.yml`. Dispatch it with two exact SHAs; both engines are built unmodified in detached
worktrees.

## What a row does

Stable Google Chrome at (400, 30, 620×720) behind a TextEdit cover at (0, 40, 380×300), shared mode. A re-set (Escape
twice, the page reloaded, the web area focused, the cover frontmost), one observation with the omnibox popup closed,
then by cell:

- `race`: a coordinate click on the page's "Under popup" button, 18 pt below its top, where the popup's first row
  opens. The click takes #282's element route; Chrome does not believe it is focused, so the route's focus hold runs
  before the press, and the guard is run again after it (`rechecked`, `afterActivation`). The racer (`racer.swift`, a
  second process) posts ⌘L and `probe` straight to Chrome's process `delay` ms after the click is sent.
- `nokeys`: the same click, no keys.
- `field`: a posted pointer press first (a click on Chrome's disabled Back button, posted by route 3, which #359
  records), then about 150 ms later a coordinate click on the page's "Under field" text field, which takes #283's focus
  route and waits on the field's range (#359's pending click); the racer's keys go `delay` ms after that click is sent.
  `prehold`: a second connection's element click on Beta first, held open, so Chrome believes it is active throughout.
- `keysonly`: the racer's keys and no click, to time the popup after the keys.
- `plain`: an ordinary background element-route click on Beta, no keys.
- `parity` (kit=parity): #337's `qualify.mjs` on #452's click-through cells, status bubble and tab hover card, shared
  frontmost, inside and outside.

The racer reads the on-screen window list every ~2 ms from before the click to 1.3 s after it, and records the first
time a window of Chrome's other than the observed one holds the click's point with alpha above 0, with one
application hit-test at the point at that moment.

## Classes

All times are the runner's wall clock (ms). `receivedAt` is the engine's (the request in; the first check runs right
after it); the wait's end is the meta's `startedAt` (the press or focus write), else the answer's arrival when nothing
was posted.

- early: refused `appWindowOverPoint` at the first check (`rechecked` absent).
- in: the popup was first seen after `receivedAt` and by the wait's end.
- late: the popup was first seen after the wait's end.
- nopopup: no popup in the watch.

Reader: `node scripts/probe-456/summary.mjs <results.json>`.

## Results

Pending.
