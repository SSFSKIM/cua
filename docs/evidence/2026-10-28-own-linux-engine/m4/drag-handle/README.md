# T17 (#250): `drag_handle`'s lifecycle

T17's row, under the lifecycle the design session ruled on 2026-11-10 (Decision Log, "T17 (#250): `drag_handle`'s
lifecycle, ruled before any code"). A handle's press and every motion are XTEST on the real pointer, so what loses a
press is another client's pointer grab. What was built (`engine/handle.rs`, `stray::HoldWatch`,
`dnd::Confirm::AtRelease`, `X11::managed_client_at`):

- `start` tries a pointer grab on the deepest window under the pointer, under a server grab, and gives it up in the
  same request batch. If another client's grab is there, `start` is refused with nothing pressed. Then the press, as
  the vendor's.
- The hold watch reads the target's crossings from just before the press to just before the release. A crossing in
  mode `Grab` or `Ungrab` makes `end` answer, after its release, that the drag may not have been received, unless the
  target's client took `XdndSelection`.
- A Chromium handle's `end` arms T14's after-release watch: the late take, Chrome's drop confirmation, the notice and
  the refusal. The confirmation is for the managed window under the release, past Chrome's drag image (below). No
  floor.
- `end` reports a real pointer the person moved from where the last request put it.
- While a handle is held, pointer input through XTEST (the desktop route, and the foreground route) is refused. Keys
  and the background route run.

Commits: 035b1c04 (the lifecycle), e8574df3 (the drop window past Chrome's drag image), c8319363 (the suites under the
lifecycle). The sittings ran on musl builds of 035b1c04 and e8574df3 made the release workflow's way (`build-musl.sh`).
c8319363 changes the engine only where the live build's test hook sits.

## The sittings

All of them ran on private Xvfb displays with Openbox (`private.sh`), never `:0`, under the host lock. They used the
drag experiment's held-move cells, Chrome 156 and cua's Electron fixture, on a harness export patched for the probe
(`scripts/patch-harness.mjs`, `scripts/disturb.mjs`). The patch adds the select and range held cells, alternates their
paths by run, and logs each handle's steps, answers and `--stats` record. After every handle it reads what the handle
left pending, 400 ms after the end, and clears it with `preflight`. The pinned build runs undisturbed beside cua in
every sitting. A disturbance goes in the `cua:d` lane, between `start`'s answer and the first move.

`scripts/table.mjs` makes the tables from each run's `results.jsonl` and `handles.jsonl`. A selection or range counts
as taken only when its value changed to the pinned build's. A false error is an error answer on a run that took, or
any error in an undisturbed lane.

The harness's own verdict line reads FAIL in several sittings. Its no-press control "took" 15 of 30 select and range
runs. That is an artefact of the patch's alternating paths, which the control's judge does not know about. The tables
judge instead.

Lock lines (`host-lock.log`, holder `task73`; usual idle load about 0.3 to 0.8):

| sittings | engine | acquire | release |
|---|---|---|---|
| `pilot-check` | 035b1c04 | 01:11:35Z, 0.33 | 01:12:22Z, 0.63 |
| `chrome-none`, `electron-none` | 035b1c04 | 01:33:38Z, 0.19 | 01:59:44Z, 0.48 |
| `chrome-{check,popup,nudge,gap,grab}` | 035b1c04 | 01:59:44Z, 0.48 | 02:18:39Z, 0.77 |
| `electron-{check,popup,nudge,grab}`, `chrome-leave`, `chrome-freeze-3` | 035b1c04 | 02:22:04Z, 0.80 | 02:39:47Z, 0.97 |
| `electron-load2` (twice the load), then `electron-leave` | 035b1c04 | 02:39:47Z, 0.97 | 02:46:33Z, 2.82 |
| `chrome-dnd-none`, `chrome-dnd-leave`, `chrome-freeze-0`, `chrome-freeze-8`, then `electron-load2-b` | e8574df3 | 04:19:22Z, 1.49 | 04:35:15Z, 17.04 |
| `events-idle` | e8574df3 | 05:03:24Z, 0.94 | 05:11:16Z, 0.53 |
| `chrome-dnd-none-2`, `chrome-dnd-leave-2`, `electron-leave-2` | e8574df3 | 05:11:16Z, 0.53 | 05:18:46Z, 0.53 |
| `events-vendor-js` | e8574df3 | 06:11:33Z, 0.53 | 06:11:35Z, 0.57 |

The idle sittings that shared a locked call with a sitting at twice the load (`electron-leave`; `chrome-dnd-none` and
`chrome-dnd-leave`) were rerun in a call of their own (`-2`), which agree. The freeze sittings were not rerun: they
produced nothing to judge (below).

## Results

**1. Undisturbed handle sequences, 0 false errors over 240** (`chrome-none`, `electron-none`, 30 a lane and kind):

| family | kind | pinned took | cua took | cua answered ok | false errors | pending |
|---|---|---:|---:|---:|---:|---|
| Chrome | select | 30 | 30 | 30 | 0 | none |
| Chrome | range | 30 | 30 | 30 | 0 | none |
| Chrome | drop | 30 | 30 | 30 | 0 | none |
| Chrome | canvas | 30 | 30 | 30 | 0 | none |
| Electron | select | 30 | 30 | 30 | 0 | none |
| Electron | range | 30 | 30 | 30 | 0 | none |
| Electron | drop | 30 | 30 | 30 | 0 | none |
| Electron | canvas | 30 | 30 | 30 | 0 | none |

On e8574df3, Chrome's drops again (`chrome-dnd-none-2`, idle in a call of its own): 30 of 30 landed. Every one was
confirmed by Chrome's activation request (`confirming` true on 30 of 30 ends), and none left anything pending.

**2. The pre-press try, on Chrome and Electron** (`*-check`). `xgrab check` makes the engine's own try (a pointer grab
on the deepest window under the pointer, under a server grab, given up in the same batch) before each start, with a
listener on the pointer's whole window chain. It answered `success` 30 of 30 on Chrome and 30 of 30 on Electron, with 0
crossings, and the handles after it took 30 of 30 in each. The engine's own try runs before every start in every other
sitting: 0 of its 240 undisturbed handles was cut or refused.

**3. Disturbances in the hold** (10 a kind, select + range + drop, of 30; the pinned build, undisturbed beside each,
took 30 of 30 in every sitting):

| disturbance | Chrome: cua:d took / answered ok | Electron: cua:d took / answered ok | the drop page saw the press, in each family |
|---|---|---|---|
| task 20's popup under the pointer for 5 ms | 30 / 30 | 30 / 30 | 10 of 10 |
| an XTEST nudge, 1 px and back | 30 / 30 | 30 / 30 | 10 of 10 |
| 2 s before the first move | 30 / 30 | – | 10 of 10 |
| another client's grab over the press | 0 / 0: refused at start, 30 of 30 | 0 / 0: refused at start, 30 of 30 | 0 of 10: nothing pressed |

The popup and the nudge stay ok and land. A grab over the press is refused with nothing pressed: the page counted no
press, and no selection or range changed. The live tests also prove both device modes, a grab taken during the hold
(answered at `end`), and a person's click sent during the try, which lands.

**4. A handle drop's T14 cases on Chrome** (on e8574df3):

- A normal drop: 30 of 30 landed and were confirmed, with no notice (`chrome-dnd-none`, `-2`).
- An unconfirmed drop: the path goes back to its source before `end`, so the drag and drop that took ends off the zone.
  15 of 15 did not land, and each answered at `end` with the unconfirmed notice pending; `preflight` was refused with
  it (`chrome-dnd-leave`, `-2`).
- A late take: freezing the run's browser across the end (T13's reproduction, `disturb.mjs` `freeze`) gave no late
  take at three stop timings: 60 of 60 took before the release and landed. The late take is proven in the live tests,
  with a source that takes `XdndSelection` after the release: the Escape goes through XTEST within 50 ms, then the
  notice and the refusal.

**5. Found and fixed: Chrome's drag image hid the drop window** (`chrome-leave`, on 035b1c04). At a handle's release
Chrome's drag image, an override-redirect window of its own, is under the pointer. `client_at` found no client there,
so no handle drop had a window to confirm: `confirming` was false on all 30 drop ends of `chrome-none` and 20 of
`chrome-freeze-3`. A drop that left the zone answered ok with nothing pending, 15 of 15, a false success. e8574df3
looks up the topmost viewable managed top-level instead. The same cell then answered the unconfirmed notice 15 of 15
(result 4). A live case with an override-redirect window over the release fails on 035b1c04 and passes on e8574df3.

**6. #363: Electron's held drop at twice the load** (16 stress-ng workers on 8 cores, the harness's `--load-factor 2`;
two sittings of 40 a side, `electron-load2` and `electron-load2-b`):

| sitting | pinned landed | cua landed | cua misses and their answers |
|---|---:|---:|---|
| `electron-load2` | 40 of 40 | 40 of 40 | none |
| `electron-load2-b` | 39 of 40 | 40 of 40 | none |

No cua miss came up, so no miss answered ok. T11's residue (37 of 40) did not recur in 80. The pinned build's one
miss answered ok.

**7. Whether an Electron drop can be confirmed** (the design session's second question):

- *Across windows (`XdndFinished`'s accept bit).* Not readable by another client. Chromium sends XDND messages to a
  window of its own process directly (`XDragDropClient::SendXClientEvent` short-circuits through `GetForWindow`), and to
  another process with `SendEvent` and an empty event mask. The X server then delivers the message to the client that
  created the window and nobody else. The accept bit (`OnXdndDrop`: 1 when `PerformDrop` returns an operation) reaches
  only the source. Reading it would take RECORD, which the engine does not use.
- *Inside one window (the drag loop's final cursor status).* Readable, through XFixes, as `accept.rs` already does.
  `xgrab cursors` logged every displayed-cursor change beside the Electron and Chrome sittings, and `scripts/cursors.mjs`
  takes the cursor last shown before each handle's release (`--stats` `release_wall_ms`):

  | sittings | the accept cursor at the release: landed / missed | another cursor (the drag loop's) at the release: landed / missed |
  |---|---|---|
  | Electron idle (`electron-none`) | 29 / 0 | 1 / 0 |
  | Electron at twice the load (both sittings) | 74 / 0 | 6 / 0 |
  | Electron leaving the zone (`electron-leave`, `-2`) | 0 / 0 | 0 / 30 |
  | Chrome idle (`chrome-none`, `chrome-dnd-none-2`) | 59 / 0 | 1 / 0 |

  No miss showed the accept cursor at its release. 7 of 110 landed Electron drops did not show it (6%; 7.5% at twice
  the load), against T14's 5% finding threshold for an unconfirmed-but-landed answer. T13's floor-timed Electron drags
  had 24 of 116 (`m4/drop-signals/tables/electron.md`). The watch's times are wall times read after each change's
  image, so a change just before the release can be placed after it. Some of the 7 may be the watch's own lag.
- *Plain Electron drops behind the floor* answer the same way today. They have no activation request
  (`m4/drop-signals/`: 0 of 116) and no readable `XdndFinished`, and a drop that does not land answers ok with nothing
  pending. Handles do the same: 30 of 30 of `electron-leave`'s misses answered ok.

The recommendation, the ruling's to make for handles and plain drops alike, is in the task report.

**8. The event proofs and the vendor JavaScript** (`events-idle`, `events-vendor-js`). Through the wire, every cua
scenario's events equal the pinned build's, `drag_handle`'s and `drag_handle stray end` included, so no `events.mjs`
proof changes. Its speed groups: first 33.74 ms against the faster build's 37.49 (40 a side, faster), later 0.59 against
30.19 (80, faster). Through OpenAI's JavaScript client (`--via vendor-js`), the `drag_handle` and `desktop move_relative` scenarios sent the pinned build's events and answers, their effects 3 of 3 and 2 of 2: the vendor-JavaScript cases are unchanged.

## The proposal's probe

`proposal-probe/` holds task 73's first executor's probe as it ran on 328a3bb5, before the ruling: the proposal, its
tables, the six sittings' records (labelled), the scripts (`proposal-probe/scripts/`) and the xterm-only check of the
pre-press try (`check-grab-xterm.log`). Its lock lines: 19:28:05Z–19:29:42Z (the grab pilot), 19:43:28Z–20:14:30Z
(none, grab, popup), 20:19:11Z–20:42:01Z (nudge, gap), 2026-11-10. `scripts/` carries the probe's tools forward:
`xgrab` (now with `cursors`, and a `check` that batches its grab and ungrab as the engine does), `patch-harness.mjs` and
`disturb.mjs` (Electron's cells, the window passed on, `--stats` for cua's lanes, the pending read, and the `check`,
`leave` and `freeze` disturbances), `table.mjs` and `cursors.mjs`.

## Scripts

`prepare.sh <commit>` builds the musl engine, exports and patches the harness, and builds `xgrab` outside the
repository. `sitting.sh` runs one sitting, `batch.sh` several, and `experiment.sh` the events experiment.
`red-live.sh <commit> <tests>` runs this checkout's live device tests against an older commit's engine. `engine-suites.sh`,
`engine-tests.sh` and `node-suites.sh` are the suites with the gate's flags. `sittings/` holds the calls as run.
`copy-evidence.py` copied the runs here with every home path labelled (`<task73b>`, `<task73>`, `<home>`).
