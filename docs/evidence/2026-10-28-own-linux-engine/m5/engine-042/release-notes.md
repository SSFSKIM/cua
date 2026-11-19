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
- **The rule (the design session's rulings 886-888).**
  - **The hold, from the press.** A drag whose source is a Chromium-family window (Chrome, Chromium, Electron) is not
    released before B after its press unless its source takes `XdndSelection` first; on a take it goes on at once as
    any take does. This holds on every route: a drag the engine lets drop (0.4.1's 250 ms hold, now B), a guarded
    background drag (a take then is cancelled before the drop: Escape, then the release, and the drag-and-drop
    sentence), and a `drag_handle`'s `end`. The hold sends no pointer motion past 0.4.1's refreshes. A drag whose path
    already lasts B pays nothing.
  - **The late-take watch.** After a release with no take, the watch runs at least 700 ms after the release, or 300 ms
    after the hold's end if that is later. It runs after the answer, so a plain drag does not wait for it. A take inside
    it is cancelled at once and reported as before: the next reply carries `Pending from your last drag, a late drag
    and drop: …`, and the next acting request is refused with it. The exit still runs the watch out at most 300 ms after
    the release, so it stays inside its 1 s backstop.
- **The bound.** B is 450 ms in this build (`dnd::TAKE_HOLD_AFTER_PRESS`), <B as the design session set it from task
  114's p450 and p600 runs>. A take later than B after the press still misses, and the drag answers as a plain one: at
  twice the gate's load on arm64, task 113 saw renderers start their drag up to about 580 ms after the press.
  `--drag-dnd-hold-ms` sets another bound (measurement only).
- **The ping predictor, measurement only.** While a hold waits with no take, the engine sends the source window
  `_NET_WM_PING`, one at a time, the next 25 ms after the last once it was answered, none after the hold. It never
  waits for an answer, and it changes no answer. `--stats` `hold.pings` records each round trip
  (`{asked, round_trips: [{sent_after_press_ms, rtt_ms}]}`, an unanswered one with `unanswered_ms`, or
  `{asked: false, why}`). A handle's record has its `hold` too.
- **Agent-facing text.** The Linux document says that a drag from a Chrome or Electron window can take up to B ms,
  since the button is held until the page has had time to start a drag and drop, and what a late drag and drop
  answers.

## Measured on the candidate (development runs, never counted; task 114, `m5/engine-042/`)

| | x64, idle | x64, twice the load | arm64, idle | arm64, twice the load |
|---|---:|---:|---:|---:|
| V5 cancel cell, the refused shape (0.4.1 / 0.4.2) | <n>/<n> / <n>/<n> | <n>/<n> / <n>/<n> | <n>/<n> / <n>/<n> | <n>/<n> / <n>/<n> |
| V5 in front, false oks (0.4.1 / 0.4.2) | <n> / <n> | <n> / <n> | <n> / <n> | <n> / <n> |
| takes inside the hold, prevented | <n> | <n> | <n> | <n> |
| late takes seen by the 700 ms watch, past 300 ms | <n> | <n> | <n> | <n> |
| hold pings, median / p95 / max round trip (ms) | <n> / <n> / <n> | <n> / <n> / <n> | <n> / <n> / <n> | <n> / <n> / <n> |

- **The cost, D1 (Chrome) and D2 (Electron), warm medians:** a 40 px Chrome selection <n> ms (0.4.1: about 254), a
  range <n>, a scroller <n>; Electron's selection, range and scroller <n>; drags whose path lasts B or more unchanged.
  Every D1 and D2 judge <passed / its result>.
- **A stated limit.** A renderer that starts its drag and drop later than B after the press is still refused by
  Chrome, and the drag answers as a plain one; <the residue at twice the load on arm64>.

No pin change and no `MIN_ENGINE_VERSION` bump come with this release; both follow the design session's check.
