# M4, T13: Chromium drop signals, measured only (task 68)

T13's row asked what the engine can observe of a Chromium drag and drop, measured against what landed. Its
recommendation goes to the design session, and T14 builds from the ruling. Nothing here is adopted: every engine flag
below is off by default, and the shipped engine is unchanged.

## The answers

These are counts of Chrome drags on the head's engine, at idle, at the gate's window load and at twice the load. The
tables are under `tables/`.

1. **Telling a drop from a leave after the release: Chrome's own activation request.** Chrome's drop calls
   `WebContents::Focus` (`WebContentsViewAura::CompleteDrop`), so Chrome sends `_NET_ACTIVE_WINDOW` for its own window
   (source 1). A leave never reaches that path. Any client can see the request with `SubstructureNotify` on the root,
   with no RECORD and no grab.

   | load | drops with the request | leaves without it | latency after the release, p50 / p95 / max |
   |---|---:|---:|---|
   | idle | 638 of 638 | 97 of 97 | 0.9 / 1.6 / 7.4 ms |
   | gate's windows | 641 of 641 | 98 of 98 | 1.2 / 2.2 / 52.9 ms |
   | twice the load | 582 of 582 | 112 of 112 | 1.4 / 4.9 / 34.7 ms |

   - The leaves include 37 drags that took and were then released before the accept: #269's thin-margin case, made with
     the floor at 0 (7, 8 and 22 at the three loads).
   - The 97, 98 and 112 leaves are drags whose source took by the release. The 47 real late takes (point 4) are further
     non-landings, counted apart: none of them sent the request either. In all, 307 leaves after an in-time take and 47
     late takes, 354 drags that did not land, none with an activation request (`tables/fix-wave.md`, the populations).
   - At twice the load, 20 requests read 0.1–2.7 ms before the engine's release stamp. The engine takes that stamp after
     it has sent the release, so the order is the stamp's, not the server's.
   - **Limits.** Chrome only: Electron sent no request on any of its 116 drops (`tables/electron.md`). The request needs
     a window manager that supports `_NET_ACTIVE_WINDOW` (Openbox here); no desktop without one was measured.
2. **The release at the accept cursor (F1), measured with `--drag-dnd-release-at-accept`.**
   - The rule: the accept is the second change to an unnamed cursor strictly after the take's server time. Chrome's
     drag loop shows its own cursor in the take's millisecond or before it (`tables/cursor-order.txt`). A first status
     in the take's own millisecond is not counted, and the 350 ms floor decides that drag.
   - Short drops, 300 a load:

     | load | false releases | released at the accept | answer median |
     |---|---:|---:|---:|
     | idle | 0 | 258 | 54.2 ms |
     | gate's windows | 0 | 272 | 55.1 ms |
     | twice the load | 0 | 295 | 66.0 ms |

     The shipped floor answers in 367–372 ms. There were 0 accepts on 90 drags bound to leave. The gate sequence's cold
     drags (30) also had 0 false releases, 25 released at the accept.
   - The same rule replayed passively over every drag that took read no accept on any leave (0 of 97, 98 and 112).
     **Superseded by the fix wave**: with the release ordered as the records allow, 6, 13 and 42 of those leaves are
     indeterminate, and they count as false accepts against the bar ("Fix wave", finding 2).
   - A first replay read 2 at twice the load, both drags of selected text. They were the release's own reset to the
     loop's cursor, read 1.8–3.1 ms before the engine's release stamp. The engine stamps its release after sending it.
     The replay now leaves out changes within 5 ms of the stamp (`RELEASE_STAMP_MARGIN_MS`). That also drops accepts
     shown in those last 5 ms, so the replay calls more landed drops lost (77 at twice the load). **Superseded by the
     fix wave**: leaving changes out could hide a real false accept; they are now ordered by the engine's own probe
     after the release and the server's clock, and a drag they could decide is indeterminate (finding 2).
   - The live lane, where the engine reads the cursor itself before it releases, needs no margin.
   - **Limits.** The early release was run live only on the plain short drop, and replayed on the other sources.
     The rule rests on Chrome's cursor sequence. A first status in the take's millisecond costs the gain but never
     releases early.
   - Electron: 30 drops, 0 false releases, 28 released at the accept.
3. **Never-take signals: none is clean.** Every role rule has false negatives: `role:text` and `role:range` at every
   load, `role:canvas` at idle (the fix wave's draggable canvas, 30 of 30; finding 4). A false negative here is a drag
   the rule said would never take, which took.

   | rule | false negatives at each load | the drags |
   |---|---|---|
   | `role:text` | 50 | a draggable span inline in a paragraph (`static` at the point), 30 of 30; a link's text, 20 of 20 |
   | `role:range` | 30 | a draggable child of an ARIA slider, 30 of 30 |
   | `role:canvas` | idle only: 30 | a draggable canvas, 30 of 30 (fix wave, `idle-canvas-2`) |
   | any of them, with or without the link/image check on the hit-test chain | 80 at each load, and the canvas's 30 at idle | the union of the above |

   - The link/image check (`role:any-chain`, now `role:any-hit-chain`) is measured on hit-test results only: the
     probe's chain is `GetAccessibleAtPoint`'s steps, and Chrome answered the deepest from the frame in one step, so a
     link's text read as a single `static` node and the check never saw the link. Its count is no measurement of an
     ancestor check ("Fix wave", finding 3).
   - `role:canvas` had no taking control in the main runs; the fix wave's draggable canvas is it ("Fix wave", finding 4).
   - `nested-late` is the nested span with its dragstart handler busy for 150 ms. It ran at idle only (`idle-extra`):
     30 of 30 took after the path's end, under a role every text rule predicts never takes. That is the drag a skipped
     hold loses.
   - At the gate's window load, 2 link drags took after the path's end with no delay added.
   - `XdndAware` is on every Chrome window, so it predicts nothing.
   - The probe costs 52–58 ms (p50) through busctl idle and 70–98 ms at twice the load.
4. **#264 reproduced with no fault hook: 47 real late takes, 1.1–8.6 ms after the release.**
   - All 47 answered ok and none landed. The drag loop ended by itself; the harness never needed an Escape.
   - Only a browser behind the X stream makes one. Chrome refuses a renderer's mouse drag once the browser has seen the
     left button go up (`WebContentsViewAura::StartDragging`, `IsLeftMouseButtonDown`).
   - A busy renderer (`dragstart-400`, `press-400`) gave 0 takes in 180 drags: dragstart fires, and the drag is
     refused.
   - The freeze cells stop the run's own browser from 60 ms after the request to a set end:
     - the late takes came when the browser restarted at 240–250 ms;
     - at 230 ms the hold caught every take;
     - from 255 ms on, Chrome refused the drag.
   - No late take came in any other cell, at any load.
5. **Which part of a covered path decides: none, on this display.** On the background route
   (`--drag-ignore-cover`), selections, ranges, scrollbar thumbs and canvas strokes all took effect, 20 of 20 each,
   with the start, the middle, the end, the whole path or nothing covered. Drop sources took every time. This held
   under an override-redirect cover and under the managed front window (1,000 drags). M3.1's covered-path failures did
   not reproduce. So the start role predicts nothing about survival here: everything survived.
   - **Not measured:** whether a covered drop lands. In shared mode the engine cancels a drag into a Chrome window that
     is not in front.
6. **The gate's window load, as built here, did not bring back task 22's take tail.** The run's own Chrome had the
   gate's other windows open, and the gate-sequence cells ran a cold engine after the dedicated drop.
   - Takes at 53 ms or later came in 2 of 480 short drops; task 22 had 27 of 90.
   - The hold caught 5 natural takes after the path's end (2 plain, 2 link, 1 selected text).
   - Task 22 measured the person's long-lived Chrome, before task 43. The difference is stated, not explained.

## What the engine can observe, and what it would let it decide

| signal | what it would decide | false negatives | false releases or false "landed" | at a load where it is noise |
|---|---|---|---|---|
| Chrome's activation request after the take | after the release: the drop landed, or (none within 300 ms) it did not | 0 of 1,861 drops | 0 of 307 leaves after an in-time take, and 0 of 47 late takes | none seen; Electron gives nothing to read |
| accept cursor (second unnamed change after the take, while still shown) | when to release a Chromium drop (early release) | not a release: 42 / 28 / 5 of 300 went to the floor | 0 false releases in 900 drops live; replayed on the 307 leaves: 0 false accepts read, 61 indeterminate, counted as false accepts (fix wave) | none seen |
| accept cursor shown by the release (passive replay; the fix wave's figures, `tables/fix-wave.md`) | before the release: whether the drop will land | 62 / 64 / 15 drops called lost, and 13 / 33 / 218 drops indeterminate | 0 / 0 / 0 clean; 6 / 13 / 42 leaves indeterminate, counted against the bar as false "landed" | none seen, but it misses a drop pending a status at the release |
| start role (any rule) | skip the hold for drags that never take | 80 a load; at idle also 30 of 30 after the path (`nested-late`) and 30 of 30 from a draggable canvas | – | at every load: the role does not see draggability |
| `XdndAware` | nothing (every Chrome window has it) | – | – | – |

## The sittings

These were private displays only: Xvfb with Openbox and a stand-in person's xterm (`scripts/private-run.mjs`), and
no whole-run RECORD. The display watchdog ended clean in every run. No two loads overlapped. Every load check showed no
other stress-ng running and no `hold-sittings` file.

| run | plan | load | start, end (UTC, 2026-11-09) | load average at start / end (1 min) | drags |
|---|---|---|---|---|---:|
| `idle-main` | main | idle | 02:55:24, 03:24:06 | 0.81 / 0.42 | 900 |
| `idle-freeze` | freeze | idle | 03:24:06, 03:26:46 | 0.42 / 0.43 | 70 |
| `idle-cover` | cover | idle | 03:26:46, 03:44:16 | 0.43 / 0.18 | 500 |
| `gate-main` | main, gate cells | the gate's windows | 03:44:43, 04:25:01 | 0.43 / 0.90 | 960 |
| `load2-main` | main | 16 stress-ng workers on 8 cores | 04:25:29, 04:58:00 | 0.63 / 16.49 | 900 |
| `load2-freeze` | freeze | the same | 04:58:00, 05:01:05 | 16.49 / 16.56 | 70 |
| `idle-extra` | extra | idle | 05:04:11, 05:05:34 | 0.91 (5 min 8.98, falling after the load) / 0.48 | 30 |
| `idle-cover-managed` | cover-managed | idle | 05:05:34, 06:05:13 | 0.48 / 0.21 | 500 |
| `idle-electron` | electron | idle | 06:05:13, 06:09:56 | 0.21 / 0.35 | 150 |

- **Candidate.** A musl build of 405aa773, made the release workflow's way (`scripts/build-musl-tar.sh`):
  `cua-engine 0.3.0 (405aa7730d02)`, sha256 `2437da52…5d1`, static-pie. This is a development run, not a release gate.
- **Harness.** The runs to `load2-freeze` used the harness of 405aa773, exported from the checkout. The last three used
  638add49's: the same engine sources, with the managed cover, `nested-late` and the Electron plan added.
- `pilot/` holds the pilots that shaped the instruments: the first accept rule counted the loop's cursor and never
  fired, and the freeze sweep found the window. Those runs are exploration, not counts.

## Instruments

- **Engine** (measurement flags, off by default):
  - `--drag-dnd-release-at-accept` (`accept.rs`);
  - `--drag-ignore-cover`;
  - `--stats` `wall` (each drag's press and release wall clock) and `accept`.
- **`xprobe drop-watch`**: what a client with no RECORD and no grab sees:
  - `XdndSelection` takes;
  - cursor changes, with image hashes;
  - `_NET_ACTIVE_WINDOW` requests;
  - root children's maps and ends;
  - the window's crossings.
- **`pages/drop-signals.html`**: the start points, with an origin found as on the drag scene.
- **`role-probe.mjs`**: `GetAccessibleAtPoint` down to the deepest accessible.
- **`drop-signals.mjs` and `drop-signals-judge.mjs`**: the experiment and its tables. A row keeps its watch lines, so
  `scripts/combine.mjs` judges them again with the reporting commit's judge.
- **Reproduce.** Run `scripts/sitting-*.sh` (`env.sh` names the vendor paths), then copy with `scripts/evidence.sh`.
  Then run `scripts/combine.mjs <harness> <runs…>`, `leaves.mjs`, `late.mjs`, `cursor-order.mjs` and `fp.mjs`.
- **Files.** Each run's `run/results.jsonl` is gzipped where it is over 512 KiB. The whole-run `xprobe order-watch`
  record (14–24 MB a run) is left out. Paths are labelled `<task68>` and `<home>`.

## Fix wave (the review of task 68)

The review (reviewer-medium on 4501a3f5..2917848d) had six findings, all P2. The fix wave reran nothing live except
finding 4's control. Its commits are da70d909 (the engine's rule), 0dfaab84 (the judge and the canvas control),
2c3a73d2 (the hit-test label) and the evidence commit. Its tables are in `tables/fix-wave.md`, recounted from the
committed records by `scripts/fix-wave.mjs`.

1. **A stale accept.** `accept_index` kept the second eligible cursor change even after a later change said no drop.
   A path that entered an accepting zone and left it read as accepted.
   - The rule now: the accept counts only while it is still the cursor shown. A later change to another unnamed cursor
     withdraws it, and if the accept is shown again it counts again, at its last showing (`accept.rs`). The judge's
     passive replay uses the same rule.
   - The test `an_accept_a_later_change_withdrew_does_not_count` (none, accept, none) fails on the old rule and passes
     on the new one.
   - **The live counts stand.** The engine's own record of each live accept lane drag (`accept.changes`) was replayed
     with the new rule, over the changes up to Chrome's return to its loop's cursor at the release. All 850 releases at
     the accept, and Electron's 28, were still on the accept when they released: 258, 272 and 295 at the three loads,
     and 25 cold gate drags. After the take, every one of them shows the first status, then the accept, and then only
     the release's changes. So 0 false releases in 300 at each load is unchanged.
   - **Still a limit.** A target whose answer is still pending has not changed the cursor yet, so its last answer
     stands. The rule cannot see that. T14's accepted-then-left control runs it live, and Chrome's activation request
     reports such a drop after the release.
2. **The judge's release boundary.** Leaving out every change in the 5 ms before the release stamp could hide a real
   false accept. The records do carry one boundary that the X server orders: the engine reads the server's time after
   every drag by creating a 1×1 window (`input.rs` `server_time`, called after the release in `pointer.rs`). Its
   CreateNotify follows the release in the watch's lines, and every drag has it (`releaseProbeIndex`).
   - **Placement.** Each cursor change is placed on the server's clock, mapped by the run's least offset
     (`serverOffset`). The read time is no longer used: the watch's reads lagged up to 8.7 ms (p99) and 16.7 ms at twice
     the load.
   - **After the release:** a change that follows the probe. The server's clock never places a change after the
     release (the re-review fixes, below).
   - **Before the release:** a change more than 10 ms before the stamp (`RELEASE_STAMP_MARGIN_MS`). On the server's clock,
     Chrome's return to its loop's cursor came up to 4.8 ms before the stamp, and the release event's own time (carried
     by Chrome's activation request) up to 6.5 ms before it, both at twice the load.
   - **Indeterminate:** a change between those bounds that could change the drag's reading (`acceptAtRelease`).
   - **The passive replay's count (Chrome).** Every indeterminate leave counts as a false accept, the design session's
     rule.

     | load | leaves | false accepts, clean | indeterminate | false accepts, indeterminates counted | clean leaves |
     |---|---:|---:|---:|---:|---:|
     | idle | 97 | 0 | 6 | 6 | 91 |
     | gate's windows | 98 | 0 | 13 | 13 | 85 |
     | twice the load | 112 | 0 | 42 | 42 | 70 |

     Electron: 2 of 34 leaves indeterminate, 0 clean false accepts. Of the drops, 13, 33 and 218 are indeterminate.
   - **Why they are indeterminate.** In all but one indeterminate leave, the first change the records cannot order is
     Chrome's return to its drag loop's cursor: the serial it showed at the take, shown again, before the engine's probe.
     The exception is at twice the load (`cua nozone` i=13): its first unordered change is serial 81, 0.16 ms before the
     stamp on the server's clock, followed by the default cursor.
   - **A second reading, resting on Chrome's behaviour rather than the server's order.** That return is taken as
     Chrome's handling of the release; in no drag that took was it read more than 10 ms before the stamp. On this
     reading there are 0 false accepts at every load, in Chrome and in Electron. Every leave is determinate except the
     one at twice the load above.
   - **What the claim now says.** The passive replay found no clean false accept. Counted against a bar, it stands at 6,
     13 and 42 possible false accepts, or 0, 0 and 1 if Chrome's return to its loop's cursor is accepted as the
     release's. The
     live lane needs no margin: the engine reads the cursor itself before it releases.
3. **The ancestor rule was measured on hit-test results only.** `GetAccessibleAtPoint` answered the deepest accessible
   from the frame in one step. In every drag the probe's chain is a single node, a link's text one `static`, so the
   link/image check never saw the link.
   - The rule is renamed `role:any-hit-chain` in the judge. Its comment, the probe's header, the tables' notes and point
     3 above say what it measured. The committed run summaries keep the old name, `role:any-chain`; read it the same
     way.
   - The real parent chain was not walked. Reading it would need a `GetParent` walk in the probe and a pass over the
     start points, and no count of drags could come from it without new drags.
   - The conclusion that no never-take signal exists rests on the controls that do measure. They are judged on the
     deepest role, which is what any rule reads: the nested span (30 of 30 under `static`), the slider's child (30 of 30
     under `slider`) and the draggable canvas (30 of 30 under `canvas`).
4. **The canvas rule's taking control.** The draggable canvas (`canvas-drag`, `pages/drop-signals.html`) is a 50 × 36
   `<canvas draggable="true">` in the sources' column. The zone was extended to reach its drop, and no other path
   changed. It ran 30 drags at idle, plan `canvas-drag`, on 0dfaab84's harness and the musl build of 405aa773.
   - The probe read `canvas` at the start point on 30 of 30. The states, interfaces and attributes are the same as the
     plain canvas's, except the name, id and class.
   - `role:canvas` predicted never on 30 of 30, and all 30 took: 30 false negatives, all before the path's end, and 30
     landed, each with Chrome's activation request.
   - One false negative disproves a never-take rule, so idle is enough: `role:canvas` is not a candidate.
5. **`nested-late` ran at idle only** (`idle-extra`, 30 of 30 taking after the path's end). At the gate's window load and
   at twice the load, the claim rests on the main runs' controls: the nested span (30 of 30, `role:text`), the link's
   text (20 of 20, `role:text`) and the slider's child (30 of 30, `role:range`). At the gate's window load, 2 link drags
   also took after the path's end with no delay added.
6. **The populations, apart.** The 307 leaves (97, 98 and 112) are drags whose source took by the release and did not
   land. The 47 late takes (21, 20 and 6) are further non-landings. That is 354 drags that did not land after a take,
   none with an activation request (`tables/fix-wave.md`).

### Re-review fixes

The re-review (reviewer-medium) closed findings 1 and 3–6, and left two small items in the passive replay.
- **The clock no longer places a change after the release.** The run's least offset still holds an unknown least read
  lag and the clock's whole milliseconds. That makes it a bound on the before side, where it can only read late, but an
  estimate on the after side. At twice the load, two leaves read clean only because their deciding change mapped 0.027
  and 0.005 ms after the stamp.
  - A change is now after the release only when it follows the engine's probe. A change before the probe that is not
    surely before the stamp is open, and so is every such change when there is no probe.
  - A display-free test covers the boundary: a deciding change 0.03 ms after the stamp, before the probe, reads
    indeterminate.
  - The recount moves twice the load from 37 to 42 indeterminate leaves (70 clean). Its drops move from 174 to 218
    indeterminate. Idle, the gate's windows and Electron are unchanged.
  - On the second reading, 1 leave at twice the load stays indeterminate.
  - `scripts/fix-wave.mjs`'s second reading now drops only the cursor changes from Chrome's return on, and keeps the
    probe.
- **The overview row "accept cursor shown by the release"** now carries the fix wave's figures in place of the old
  judge's `64 / 68 / 77` and `0 / 0 / 0`.
- The design session ruled (2026-11-10) that the passive replay no longer decides ruling (2); the live counts alone do.
  These fixes state the replay exactly, and they change no bar.

### The fix wave's sitting

| run | plan | load | start, end (UTC, 2026-11-10) | load average at start / end (1 min) | drags |
|---|---|---|---|---|---:|
| `fix-wave/idle-canvas-2` (counted) | canvas-drag | idle | 01:12:32, 01:13:50 | 0.50 / 0.55 | 30 |
| `fix-wave/idle-canvas` (rerun, not counted) | canvas-drag | idle | 00:47:17, 00:48:35 | 0.92 / 0.45 | 30 |

- **The lock** (`host-lock.log`). The counted sitting:
  `2026-11-10T01:12:32Z acquire task68fix load=0.50 0.52 0.65 :: docs/evidence/2026-10-28-own-linux-engine/m4/drop-signals/scripts/sitting-canvas.sh idle-canvas-2`
  and `2026-11-10T01:13:50Z release task68fix status=0 load=0.55 0.58 0.66 :: …/sitting-canvas.sh idle-canvas-2`.
- **The rerun's reason.** The first sitting took the lock at load 1.81 (`2026-11-10T00:46:27Z acquire task68fix load=1.81 1.48 0.80`),
  more than 1.0 above this host's idle, right after another holder's build. It waited in itself for the 1-minute load
  to fall under 1.0 before it began, and its release reads `status=2`. That status is a syntax error raised after the run:
  the script was edited while bash still read it. The run itself ended `exit 0` with its watchdog clean. Its drags match
  the counted sitting's exactly: 30 of 30 under `canvas`, 30 took and landed. The rerun waited outside the lock for a
  quiet host before it took it.
- Both used Xvfb with Openbox and the stand-in person's xterm (`scripts/private-run.mjs`), on a private display, with no
  whole-run RECORD; the display watchdog ended clean in both. There was no `hold-sittings` file and no stress-ng at
  either start. Reproduce with `scripts/export-harness.sh 0dfaab84`, then `scripts/sitting-canvas.sh <name>`.
