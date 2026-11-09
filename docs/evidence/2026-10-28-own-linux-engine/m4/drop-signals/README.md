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
   - They also include all 47 real late takes (point 4).
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
   - A first replay read 2 at twice the load, both drags of selected text. They were the release's own reset to the
     loop's cursor, read 1.8–3.1 ms before the engine's release stamp. The engine stamps its release after sending it.
     The replay now leaves out changes within 5 ms of the stamp (`RELEASE_STAMP_MARGIN_MS`). That also drops accepts
     shown in those last 5 ms, so the replay calls more landed drops lost (77 at twice the load).
   - The live lane, where the engine reads the cursor itself before it releases, needs no margin.
   - **Limits.** The early release was run live only on the plain short drop, and replayed on the other sources.
     The rule rests on Chrome's cursor sequence. A first status in the take's millisecond costs the gain but never
     releases early.
   - Electron: 30 drops, 0 false releases, 28 released at the accept.
3. **Never-take signals: none is clean.** Every role rule has false negatives at every load. A false negative here is a
   drag the rule said would never take, which took.

   | rule | false negatives at each load | the drags |
   |---|---|---|
   | `role:text` | 50 | a draggable span inline in a paragraph (`static` at the point), 30 of 30; a link's text, 20 of 20 |
   | `role:range` | 30 | a draggable child of an ARIA slider, 30 of 30 |
   | any of them, with or without the link/image ancestor check | 80 | the union of the above |

   - `nested-late` is the nested span with its dragstart handler busy for 150 ms: 30 of 30 took after the path's end,
     under a role every text rule predicts never takes. That is the drag a skipped hold loses.
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
| Chrome's activation request after the take | after the release: the drop landed, or (none within 300 ms) it did not | 0 of 1,861 drops | 0 of 307 leaves | none seen; Electron gives nothing to read |
| accept cursor (second unnamed change after the take) | when to release a Chromium drop (early release) | not a release: 42 / 28 / 5 of 300 went to the floor | 0 false releases in 900 drops live; 0 accepts read on 307 leaves replayed | none seen |
| accept cursor shown by the release | before the release: whether the drop will land | 64 / 68 / 77 drops called lost | 0 / 0 / 0 | none seen, but it misses a drop pending a status at the release |
| start role (any rule) | skip the hold for drags that never take | 80 a load, plus 30 of 30 after the path (`nested-late`) | – | at every load: the role does not see draggability |
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
