# #324: posted clicks and the screen hold, measured against the real frozen spans (hosted macOS, 2026-11-08)

All runs used GitHub-hosted macOS runners with Safari 27.2.
- **Builds and patches:** every head ran under a runner-only patch (`scripts/probe-324/patch-log.py`) that only logs: each SLSDisableUpdate, and each SLSReenableUpdate call and its return, with Unix ms stamps. Its single test hook is `P324_DELAY_MS`, which injects a slow activation.
- **One engine at a time:** only one engine process was alive at a time.
- **The setup:** every step ran behind a frontmost TextEdit, or behind Probe324.app for TextEdit's own cells, with the window order watched every 5 ms.
- **Visibility:** a raise counts as visible only outside the logged frozen spans, never against the record's own hold boundaries.

The kit is `probe/324-measure` (head b279af95), off main. Per-job results are under `~/.local/share/probe-324/` on the MacBook.

## The spike: main 74fe29f8

**Runs:** https://github.com/SSFSKIM/cua/actions/runs/42468407027, https://github.com/SSFSKIM/cua/actions/runs/42472740707 and https://github.com/SSFSKIM/cua/actions/runs/42476788546.

- **Nothing was visible after the hold on main.** This covered 458 steps in Safari, an AppKit probe app and TextEdit: set_value, select_text, coordinate click, type_text, press_key, scroll and drag. It also covered 150 natural Safari page clicks.
- **#315's "raised after the hold" was a misread.** It reported set_value raising after the hold in Safari 6 of 8 times, and in Firefox 4 of 5. In fact `focusingClick` drops the fallback click's `delivery` record, so #315's kit judged those raises against no hold at all. The fallback click joins set_value's held activation and gets #321's hold until the window order reads back: 112 of 112 did. 75 of the 112 reordered inside the hold, and 0 after it.
- **#321's residue is real but rare.** With a slow activation injected (the events 183–323 ms into the hold), 51 of 60 clicks were visible. Naturally, only about 2% of clicks have a gap over 100 ms; the largest was 193 ms.
- **Caret first on a WebKit field:** 32 of 32 delivered, 0 reorders, no pointer event on the page, and a freeze of about 120 ms against about 300 for the posted fallback.
- **Two findings registered separately:**
  - a posted scroll into a background AppKit window doesn't scroll: 0 of 24 (#328);
  - select_text on an unfocused NSTextField answers `selectionNotSettable` (fixed here).

## The build against main

**Runs:**
- https://github.com/SSFSKIM/cua/actions/runs/42480471918, on 2821788e;
- https://github.com/SSFSKIM/cua/actions/runs/42480982911, on e2e452c9;
- https://github.com/SSFSKIM/cua/actions/runs/42487558851, timer variants on 90596c43.

| Check | Main | Branch |
|---|---|---|
| Safari shared: set_value and select_text on unfocused fields, 80 cells | 80/80 delivered; reordered inside the hold 58 times; a pointer event on the page in every cell; freeze 262–301 ms | 80/80 delivered, `fieldFocus readBack`; **0 reorders, 0 page events**; freeze 108–125 ms |
| Safari dedicated, 24 cells | **0/24: it answered success while writing nothing** (the posted click focuses the field, then the value stays "") | **24/24 delivered** |
| Safari password field, 20 reps | 20/20 delivered, through the posted click | 20/20 delivered caret first; 0 reorders; freeze 124 ms |
| AppKit set_value | 12/12 | 12/12, the same |
| select_text, unfocused NSTextField | 0/6, `selectionNotSettable` | **6/6**, no raise |
| Chrome and Firefox | unchanged | unchanged |
| Natural Safari clicks, `screenHoldMs` | p50 190–198 ms | p50 196–201, p95 205–215, max 218 ms; 0 visible |
| Injected slow activation, 60 clicks | 47/60 visible | 3/60 visible with the strict timer (4/60 on 2821788e), each with its events 252–313 ms into the hold |

## The hold's timers

The hold's real freeze was measured from SLSDisableUpdate to the SLSReenableUpdate call, at the 300 ms ceiling, about 60 clicks per variant:

| Variant | To the call (p50 / p95 / max) | To the return |
|---|---|---|
| no change | 368.5 / 375.6 / 378.2 | 379.7 / 392.0 / 395.4 |
| **strict timer (kept)** | **300.7 / 302.8 / 303.6** | 308.5 / 321.6 / 326.3 |
| App Nap activity held | 360.5 / 375.8 / 377.9 | 372.3 / 392.5 / 394.4 |
| both | 300.5 / 305.6 / 311.4 | 309.1 / 320.1 / 324.5 |

- **Main's 100 ms activation hold, when its timer releases it:** 124.3 / 149.9 / 158.1 ms on main, and 100.8 / 103.2 / 103.2 ms with the strict timer.
- **Holds the guard ends itself** release on time, a median 0.1 ms after the guard.
- **`frozenMs`** matches the logged release call within 0.5 ms at p90.

## Limits

These reorders are invisible, not absent:
- **Pointer clicks and drags still reorder the target inside the hold,** 55–90% of the time.
- **About 2% of natural clicks have a slow activation.** A click whose events land 250 ms or more into the hold gets less than 50 ms of hold after them, and can flash: 3 of 60 under injection.
- **The worst-case freeze** is 300 ms to the release call. The display is back within about 26 ms after it.
