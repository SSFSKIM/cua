cua's own Linux engine, cua-engine 0.4.2, built from <commit> for x86-64 and arm64 (static musl).

- Workflow run: <run url> (run id <run id>).
- Provenance: `gh attestation verify <asset> --repo SSFSKIM/cua --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml`.
- Pinned by `node scripts/linux-engine-pin.mjs linux-engine-v0.4.2` (runtime/engine/linux-engine.json).

```
<SHA256SUMS>
```

## What 0.4.2 fixes: a Chrome drag answered as a plain drag while Chrome refused its drag and drop

- **The fault, in both architectures' 0.4.1.** A drag from a Chrome or Electron window releases its button once its
  path has ended, or at 250 ms after the press when the page has not started a drag and drop by then. A page whose
  renderer lags starts its drag and drop later, and Chrome refuses a renderer's drag once its browser has seen the button
  go up. So the drag answered as a plain drag, and the drop it was for never happened. On arm64's V5 at H⁵ the
  renderer's dragstart came 47 to 108 ms after the release in 3 of 126 samples (task 112), and x64 met the same mode at
  M4's gate. At twice the gate's load on x64, 0.4.1 left this shape in 36 of 52 cold samples of V5's cancel cell (task
  113, `m5/hold-042/`). And after a release with no take the engine watched for a late drag and drop for only 300 ms,
  while Chrome took 335 to 973 ms after the release with its button-up delayed under load.
- **The rule (the design session's rulings 886-888, 892, 893 and 897-900).**
  - **The hold, from the press.** A drag whose source is a Chromium-family window (Chrome, Chromium, Electron) is not
    released before B after its press unless its source takes `XdndSelection` first; on a take it goes on at once as
    any take does. This holds on every route: a drag the engine lets drop (0.4.1's 250 ms hold, now B), a guarded
    background drag (a take then is cancelled before the drop: Escape, then the release, and the drag-and-drop
    sentence), and a `drag_handle`'s `end`, whose rest before the release the hold's motionless wait serves. The
    source is the window the press reaches: on the foreground and desktop routes, the client under the path's start.
    The hold sends no pointer motion past 0.4.1's refreshes. A drag whose path already lasts B pays nothing.
  - **The extended hold, for a Chrome or Chromium browser.** A source positively identified as one (its `WM_CLASS`,
    its `WM_WINDOW_ROLE` `browser` or `pop-up`, this host's `WM_CLIENT_MACHINE`, and its process's accessible
    application named `Google Chrome` or `Chromium`; its executable too, where the engine can see it) is pinged
    `_NET_WM_PING` while its hold waits. At B, every ping answered under 20 ms releases; a slower, unanswered or
    failed ping, or none answered, extends the hold to 650 ms after the press, waiting for the take. With no take by
    then, the drag answers ok with `the page may have started a drag that did not complete`, which the service and
    the facade carry to the model. Chrome's browser answers in a few milliseconds while nothing drags and slowly while
    it starts a drag its renderer began. Electron's stays fast while its drag starts, so Electron and every
    unidentified source keep the fixed B, with no extension and no notice. There is no release before B (ruling
    900): an early release on fast pings lost 24 of 24 drags whose page started them late from a busy handler.
  - **The late-take watch.** After a release with no take, the watch runs at least 700 ms after the release, or 300 ms
    after the hold's end if that is later. It runs after the answer, so a plain drag does not wait for it. A take inside
    it is cancelled at once and reported as before: the next reply carries `Pending from your last drag, a late drag
    and drop: …`, and the next acting request is refused with it. At an orderly exit after a stop signal only, the
    watch ends 650 ms after the signal (ruling 893), so a take it cancels keeps its whole 300 ms settle inside the 1 s
    backstop; a take after that, at such an exit, goes unseen.
- **The bound.** B is 450 ms (`dnd::TAKE_HOLD_AFTER_PRESS`, ruling 892): p350 left arm64 at twice the load at 3/210 on
  the cancel cell's shape (1.4%), above the 1% cap, and p600 would push Chrome's canvas past the newest vendor build's
  speed. The extension is 650 ms (`adaptive_hold::EXTENDED_HOLD_AFTER_PRESS`), past the latest renderer drag start
  measured at arm64 twice the load (+521 ms). `--drag-dnd-hold-ms` sets another B (measurement only).
- **The pings.** One at a time, the next 25 ms after the last once it was answered, none in the hold's last 25 ms, from
  a thread and an X connection of their own, so the drag never waits for them. `--stats` `hold.pings` records each
  round trip, `hold.adaptive` which way the hold went (`fixed`, `extended`, `noticed`), why, and how the source was or
  was not identified, and `browser_identity` the identification's cost. `--drag-dnd-hold-ping off` (measurement only)
  turns the pings off, and with them the extension.
- **Agent-facing text.** The Linux document says that a short drag from a Chrome or Electron window takes about 450 ms,
  that a busy Chrome or Chromium keeps the button down up to 650 ms and what the notice means, that a page whose own
  code takes longer than about 450 ms to start its drag can still lose it with no notice, and that a drag and drop the
  engine sees start within 700 ms after the release is reported at the next reply.

## Measured (development runs, never counted; tasks 114, 116 and 117, `m5/engine-042/`)

V5's two cells under the gate's Chrome ballast, the fixed hold, the default lane (wave 2, fdaff715 and 313167a9; task 116;
idle: arm64's on `:0` and a private display):

| | x64, idle | x64, twice the load | arm64, idle | arm64, twice the load |
|---|---:|---:|---:|---:|
| V5 cancel cell, the refused shape (0.4.1 / 0.4.2) | 0/156 / 0/135 | 69/156 / 0/312 | 16/240 / 0/180 | 98/210 / 0/222 |
| V5 in front, false oks (0.4.2, the fixed hold) | 0/135 | 0/312 | 0/180 | 7/222: 4 tail, 3 no dragstart |
| takes inside the hold, prevented | 118/118 | 237/237 cancelled, 295/295 dropped | 120/120 | 139/139 cancelled, 186/194 dropped (8 unconfirmed) |
| late takes seen by the 700 ms watch, past 300 ms | 0 | 0 | 0 | 0 |
| plain drags' first ping, p50 / p99 / max (ms) | 1.1 / 1.2 / 1.2 | 1.1 / 6.4 / 7.6 | 1.1 / 1.1 / 1.1 | 1.1 / 5.5 / 14.9 |
| draggable presses with no take, largest ping wait (ms) | – | ≥ 91 | – | ≥ 204 |

- **What the extension takes.** At arm64 twice the load the in-front tails' renderers started their drag at +458 to
  +521 ms, inside 650; all four on the default lane read slow by +85 ms. The presses where Chrome began no drag read
  slow too: they pay about 200 ms and get the notice, which is honest there.
- **The cost, D1 (Chrome) and D2 (Electron), warm medians at idle:** a 40 px Chrome selection 454.3 ms on x64 and 451.8
  on arm64 (0.4.1: about 129 on x64), a range 454.4 and 451.8, a scroller 454.2 and 451.8; Electron's selection, range
  and scroller 456.5 to 457.5 on x64 and 452.7 to 453.0 on arm64; drags whose path lasts B or more unchanged (Chrome's
  canvas 476.5 and 473.3, against the newest build's 514.0 and 486.1). Every D1 and D2 judge passed. A drag the
  extension holds pays about 200 ms more.
- **A stated limit.** A page whose own code takes longer than about 450 ms to start its drag can lose it while the drag
  answers ok with no notice, since its browser stays idle and answers fast. On Chrome 156 at idle on x64, dragstart
  handlers busy 150 and 400 ms and press handlers busy 150 and 400 ms landed 24 of 24 (takes at 154 to 423 ms after
  the press), and dragstart handlers busy 500 and 600 ms lost 6 of 6 each, every one a plain ok (task 117). This
  replaces 0.4.1's 250 ms limit.
- <wave 3's own measurements: the smoke check's V5 and D1 rows, and arm64 twice the load's ≥ 200 in-front samples
  (ruling 898.3)>

No pin change and no `MIN_ENGINE_VERSION` bump come with this release; both follow the design session's check.
