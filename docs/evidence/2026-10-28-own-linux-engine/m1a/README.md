# #171 M1a: the engine core against both vendor builds, and the harness's proof

On the #171 VM (`dc-linux171-1e68`, x86-64, Ubuntu 24.04, X11 `:0`, Openbox, no compositor), 2026-10-28, against the
spec `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` (M1a; Acceptance 2–5 for every command but text
and clipboard; the M1a pre-flight entry's M1a.3).

**What was measured.** `cua-engine` from the engine source of 6de1cfbb, unchanged through f4524409 (each run's `meta`
row names the commit its build was stamped with, and every binary's SHA-256), against OpenAI's pinned `sky_linux_x64`
26.928.40906 (SHA-256 `7ac3c2ae…f1cd`) and newest 26.1023.51421 (`88ce5e0a…2991`). The readiness runs used the build
of 48da51a7, whose capture rule is the same (6de1cfbb only opens its connection later). The harness is
`scripts/linux-engine-diff.mjs`; its README describes the method.

| Run | Commit | What |
|---|---|---|
| `m1a3-wire-5` | f4524409 | **the verdict run**: every scene and operation over the wire, five blocks |
| `m1a3-vendor-js` | f4524409 | the same through OpenAI's own JavaScript client (`--via vendor-js`), three blocks: the facade-level proof |
| `m1a3-wire` | 34ce9a2c | the same over the wire, three blocks, before the input page's scroll reset (its numbers agree) |
| `m1a3-events` | 34ce9a2c | the input events on a private Xvfb: answers and X events against the pinned build, both routes, request times |
| `m1a3-cover-800x600` | 34ce9a2c | Firefox's cover threshold at a second window size |
| `m1a3-drag-step` | 6de1cfbb | drags with the vendor's 1 ms per sample and without it (`--drag-step-ms 0`, a measurement variant) |
| `readiness-idle`, `readiness-idle-sized`, `readiness-loaded` | 48da51a7 (harness of 08f75e06) | the capture readiness rule judged by content on every family, idle and with every core busy |
| `m1a2-events-fix3` | 48da51a7 | M1a.2's events experiment, kept as evidence (82 scenarios, cua equal to the pinned build in all) |

The scenes are the harness's own windows: gedit on a scratch file; Chrome on the reference page (`scene.html`), the
pointer and key page (`input.html`), the over-budget and big-text pages; a GTK 3 tree view over 10,000 rows; LibreOffice
Calc on a scratch CSV; and Chrome windows for the retention cases. Each engine has its own window wherever retention
or input is measured; an xterm holds the focus and covers the screen.

`results.jsonl` holds every sample, count, audit, image comparison, check and verdict of these runs; `summary.md` is
rewritten from it by `node scripts/linux-engine-diff.mjs --summarize --out docs/evidence/2026-10-28-own-linux-engine/m1a`.

## Acceptance (x86-64, every command but text and clipboard)

**2. The same answers: pass.** Every operation of the verdict run answers as the pinned build does (every sample of
every engine's own window, screenshots by content): the 20 commands' window and desktop forms on the scenes,
element clicks, the right click's button-3 path and its `showContextMenu` fallback, `perform_secondary_action`,
`move`, `drag`, `scroll` (the effects read back: the page's pointer, drag, scroll and context-menu counters), the
holds, `activate_window`, `launch_app`, the large tables and the three retention cases (90/90 screenshots within
tolerance, 0 differing pixels). The text and clipboard commands answer the declared refusal (`deviations.mjs`). On
the private Xvfb, the events experiment finds cua's answers and X events equal to the pinned build's in every
scenario of both routes (`drag_handle`, `move_relative` and the window-less forms included), except the one declared
deviation it shows: a key hold whose window is destroyed answers the X error where the pinned build answers success
(the newest build answers the error too). Through OpenAI's own JavaScript (`m1a3-vendor-js`) every verdict passes:
answers, rendered trees, witness, audit and effects.

**3. At or below the bar: fails on drag; otherwise pass.**

| operation (verdict run) | cua cold / warm ms | bar cold / warm ms | |
|---|---:|---:|---|
| gedit tree read (498 nodes) | 90.8 / 78.0 | 590.7 / 591.2 | pass |
| Chrome tree read (243 nodes) | 68.8 / 61.2 | 472.3 / 474.6 | pass |
| window screenshot, gedit / Chrome | 126.9 / 100.4, 108.9 / 87.3 | 724.0 / 720.5, 605.6 / 619.2 | pass |
| `press_key`, gedit / Chrome | 106.9 / 101.2, 106.8 / 101.2 | 240.6 / 235.6, 241.9 / 235.9 | pass |
| `click`, gedit / Chrome | 119.9 / 113.8, 118.9 / 113.8 | 220.0 / 215.2, 218.6 / 214.8 | pass |
| `scroll` | 215.9 / 210.1 | 315.2 / 311.1 | pass |
| `drag` | 628.5 / 603.4 | 424.1 / 413.9 (newest) | **fail** |
| `get_screenshot` (desktop) | 37.4 / 28.5 | 39.7 / 27.8 | **fail (warm, a tie)** |

The three medians of each engine and series are in `summary.md`. Every other operation passes, most by a factor of
two to seven. The two failures:

- **`drag`**: cua sends the pinned build's events exactly (M1a.2), a motion per pixel with the pinned build's 1 ms
  after each; the newest build interpolates about four times more coarsely (146 motions against 560 in the events
  experiment), so it is faster on both routes (the window drag here, the desktop drag and `drag_handle`'s moves in
  `m1a3-events`). Without the 1 ms per sample (`m1a3-drag-step`, `cua:step0`) cua's drag takes 141 / 139 ms with its
  effect read back 18/18; the choice is the design session's.
- **`get_screenshot`**: the same `GetImage` of the root and the same JPEG encoder at the same settings as the vendor's;
  the warm medians are within 1 ms and change order between sittings (cua 27.2 against 27.8 in `m1a3-wire`, 28.5
  against 27.8 here, 28.6 against 28.1 in a separate 80-sample comparison). Cold, cua is ahead (37.4 against 39.7).

**4. Same elements: pass** (the truncation line through the facade is M4's). The gedit and Chrome reads return
exactly the vendor's nodes with the same native ids (on the harness's scenes 498 and 243 nodes; the research's
reference scenes had 480 and 222), through the windowed read: 3,190 and 2,257 accessibility-bus calls like the
vendor's, of which cua awaited 93 and 31 alone (the vendor all of them). On the over-budget page the retained native
ids equal the pinned build's; cua made 45,240 calls against the vendor's 45,069 (+171, within M0's +256). The large
tables: the GTK tree view's 41 nodes and Calc's 2,431 equal the vendor's, with two calls fewer each (the vendor
re-reads a table's interfaces and states before sampling it); Calc's cell ids are new objects on every read in every
engine, so its reads compare by position.

**5. Background left alone: pass.** Every window-targeted operation in every block kept the witness unchanged for
its whole span, and its X requests (through `xtrace`, two samples per engine and operation) held no forbidden
request, wherever the vendor's did; `activate_window` changes the desktop on purpose in all three engines (its
witness and audit name `_NET_ACTIVE_WINDOW`, the raise and `SetInputFocus`). The activate-and-restore stub failed both
(witness: stacking, active window, focus; audit: the `_NET_ACTIVE_WINDOW` ClientMessage and XTEST `FakeInput`).

## Capture readiness, judged by content

The engine's rule (DAMAGE: first damage then 10 ms quiet, capped at 150 ms; a window fully unobscured at the
redirect needs no first damage) on every family of M0.4's matrix, a fresh engine per trial, its first capture
against the same engine's capture 400 ms later: **900 trials, every first capture right, none with a pixel off by
more than 32**, idle and with every core busy; 264 of them took the unobscured shortcut (Firefox and Writer, which
open maximized, ran unobscured at 1000×700). The pinned build's captures agreed with the same truth in all 150 of its
trials. DAMAGE is reliable, so the 100 ms fallback is not adopted. What it costs: a window that sends no damage after
the redirect waits the full 150 ms (GTK 4's gnome-text-editor whenever it is partly or fully covered, every trial;
under load 31 more trials across nine families, most of them xterm's), and its capture is still right.

## Firefox's cover threshold at a second size: the boundary moved

At 800×600 (M0 measured the maximized 1280×781 window), coordinate clicks were ignored with the bottom covered up to
67% of the window visible and taken at 71%, and taken with the left side covered down to 42% visible (the click
point itself covered at 52% and less), the same in all three engines. The ignored clicks do not follow the window's
visible fraction: a 60% rule would send clicks to a 63–67%-visible window that ignores them. This goes to the design
session before M3 writes the `while_covered` entry.
