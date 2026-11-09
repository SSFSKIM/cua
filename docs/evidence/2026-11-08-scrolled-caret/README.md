# #341: a click into a scrolled Chromium textarea, its caret written first (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2, Chrome for Testing 156.0.8078.80 and Safari 27.2; two runners per group.
- **Engines:** origin/main at 4cb51b3b (#290's caret search merged) against `fix/341-scrolled-caret` at de3973ef, release
  builds, each a pinned commit in the workflow.
- **Kit:** `probe/341-ab` at e91c1e6c, branched from the measurement kit `probe/341-measure` (506ddda8):
  `scripts/probe-341/run.mjs` with `--kinds engine` (and `token` on Safari), and `scripts/probe-341/ax.swift`, which
  now also lists the on-screen windows front to back (`windows`). Workflow `.github/workflows/probe-341-ab.yml`.
  - Each cell makes a shared-mode click into a textarea of a background browser page, with TextEdit frontmost, then a
    `type_text` of a marker (`QZ`). `engine` is the coordinate click at the screenshot pixel of the target point;
    `token` (Safari) is the element click by the field's token, which aims at the field's frame centre.
  - The page has six three-line textareas of 40-character lines. `top` is not scrolled; `mid` is scrolled by script to
    line 32 with overflow hidden, `mida` the same with overflow auto; `end` is scrolled to its bottom; `huge` holds
    20,499 characters scrolled to line 230 (inside Chromium's 10,000-character `AXValue`); `wheel` is scrolled by a real
    scroll-wheel event to 650 or 690 pt (or not at all where the wheel did not take: late, 1 cell of 6 on main and 2 on
    the branch; fresh, 1 on the branch). The target point is the third fully shown line at column 14.3.
  - Chrome for Testing runs late (3 s after the observation, all six fields in one browser) and fresh (0.1 s after the
    first observation, one field per browser); Safari runs late. 3 repeats per cell and per runner; main first on
    runner 1, the branch first on runner 2; one engine process at a time.
- **Ground truth:** the expected offset is the point's line start + 14 from the page's layout, and agrees with the offset
  the unfocused box scan (`AXBoundsForRange`, read before the click) puts under the point in every late cell; for a
  token click it is that scan's offset at the frame centre. The page's beacons give the field's `selectionStart/End`
  0.8 s after the click, where the marker landed after typing, and the field's `scrollTop` before, after the click and
  after typing. Window order (CGWindowList, layer 0, front to back) and the frontmost app are read just before, just
  after and 0.8 s after each click.
- **Results:** `~/.local/share/probe-341/ab-run-42578081142/` on the MacBook (`table.txt`, `cells.json`; analysis
  `~/.local/share/probe-341/ab-analyse.py`). The measurement this fix rests on is `~/.local/share/probe-341/run-42568677106/`.
- **Run:** https://github.com/SSFSKIM/cua/actions/runs/42578081142 (6 jobs, all green).

## Chrome for Testing

Per cell: the claim, how many cells have the field's caret and the typed marker at the expected offset, how many claim
"placed" with either elsewhere, the field's `scrollTop` before the click → after it → after typing, and the click's time.

| timing | field (expected) | engine | cells | claim | caret right | marker right | false "placed" | scrollTop | ms, median (range) |
|---|---|---|---|---|---|---|---|---|---|
| late | top (96) | main | 6 | placed | 6 | 6 | 0 | 0→0→0 | 118 (82–189) |
| late | top (96) | branch | 6 | placed | 6 | 6 | 0 | 0→0→0 | 70 (44–111) |
| late | mid (1,408) | main | 6 | placed | 0 | 0 | 6 | 640→0→0 | 168 (133–424) |
| late | mid (1,408) | branch | 6 | placed | 6 | 6 | 0 | 640→640→640 | 83 (45–111) |
| late | mida (1,408) | main | 6 | placed | 0 | 0 | 6 | 640→0→0 | 148 (88–197) |
| late | mida (1,408) | branch | 6 | placed | 6 | 6 | 0 | 640→640→640 | 58 (35–106) |
| late | end (3,048) | main | 6 | placed | 0 | 0 | 6 | 1440→0→0 | 156 (69–192) |
| late | end (3,048) | branch | 6 | placed | 6 | 6 | 0 | 1440→1440→1440 | 78 (56–110) |
| late | huge (9,526) | main | 6 | placed | 0 | 0 | 6 | 4600→0→0 | 167 (98–196) |
| late | huge (9,526) | branch | 6 | placed | 6 | 6 | 0 | 4600→4600→4600 | 81 (41–115) |
| late | wheel (1,449 / 1,531; 96 unscrolled) | main | 6 | placed | 1 (unscrolled) | 1 | 5 | 650 or 690→0→15; 0→0→0 | 162 (131–203) |
| late | wheel (1,449 / 1,531; 96 unscrolled) | branch | 6 | 4 `layoutMoved`, 2 placed | 6 | 6 | 0 | 650 or 690→+5→+5; 0→0→0 | 57 (34–101) |
| fresh | top (96) | main | 6 | placed | 6 | 6 | 0 | 0→0→0 | 1798 (1156–2054) |
| fresh | top (96) | branch | 6 | placed | 6 | 6 | 0 | 0→0→0 | 1970 (1557–2039) |
| fresh | mid (1,408) | main | 6 | placed | 0 | 0 | 6 | 640→0→0 | 1802 (1702–1918) |
| fresh | mid (1,408) | branch | 6 | placed | 6 | 6 | 0 | 640→640→640 | 1684 (1532–1875) |
| fresh | mida (1,408) | main | 6 | placed | 0 | 0 | 6 | 640→0→0 | 1940 (1709–2007) |
| fresh | mida (1,408) | branch | 6 | placed | 6 | 6 | 0 | 640→640→640 | 1754 (1469–2001) |
| fresh | end (3,048) | main | 6 | placed | 0 | 0 | 6 | 1440→0→0 | 1864 (1718–2039) |
| fresh | end (3,048) | branch | 6 | placed | 6 | 6 | 0 | 1440→1440→1440 | 1746 (1681–1805) |
| fresh | huge (9,526) | main | 6 | placed | 0 | 0 | 6 | 4600→0→0 | 1895 (1705–1937) |
| fresh | huge (9,526) | branch | 6 | placed | 6 | 6 | 0 | 4600→4600→4600 | 1788 (1595–1836) |
| fresh | wheel (1,449) | main | 6 | placed | 0 | 0 | 6 | 650→0→15 | 1775 (1692–1816) |
| fresh | wheel (1,449; 96 unscrolled) | branch | 6 | 5 `layoutMoved`, 1 placed | 6 | 6 | 0 | 650→655→655; 0→0→0 | 1871 (1507–1952) |

Totals over the 72 Chrome cells per engine:
- **main:** 72 placed claims, 59 false; the marker lands at the point in 13 (the unscrolled cells). Focus scrolls the
  field to its top (the wheel field to 0, then 15 as typing shows the caret) and the caret goes to the point's column
  on the top-scrolled layout's line (96, or 137 on the wheel field).
- **branch:** 63 placed claims, none false; the caret and the marker are at the point in all 72. Every branch cell was
  focused by the caret's write (`focusStep selection`, `action AXSelectedTextRange`); the AXFocused fallback was never
  taken. The reference box's shift (`caretMarkShift`) read 0 in every placed cell.
- **The 9 `layoutMoved` cells** are all the wheel field scrolled to 650 or 690 pt. There the target, the third fully
  shown line, is clipped by the field's bottom edge (the screenshots show line 35 cut through). The caret's write
  scrolls that line into view by 5 pt (`scrollTop` 650→655), so the reference box moves 5 pt and the engine answers
  "focused, caret written, place not confirmed" with a note asking for a new screenshot. The caret and the marker were
  at the point in all 9: the answer is conservative, never wrong.
- **Time:** late clicks take 57–83 ms at the median against main's 118–168 ms (no AXFocused settle). Fresh clicks are
  dominated by the wait for boxes, which now runs before any write, under the same deadline: 1.47–2.04 s against main's
  1.16–2.05 s.
- **Nothing raised:** TextEdit stayed frontmost and the order of the windows (the engine's own cursor overlay aside) was
  unchanged just after and 0.8 s after every click, on both engines (144 of 144).

## Safari (the path #341 leaves alone)

| kind | engine | cells | claim | caret and marker at the point | scrollTop | ms, median |
|---|---|---|---|---|---|---|
| engine | main | 36 | success (no `elementClick`) | 36 | unchanged (wheel 650→650→655 after typing) | 227–279 |
| engine | branch | 36 | success (no `elementClick`) | 36 | the same | 238–270 |
| token | main | 36 | success, `descendant` | 36 (at the frame centre's offset) | unchanged | 202–223 |
| token | branch | 36 | success, `descendant` | 36 | unchanged | 208–236 |

Both engines answer alike in every Safari cell. TextEdit stayed frontmost in all 144. In 2 cells (one per engine, the
first click of a session) Safari's window moved above a second, background TextEdit window, still under the frontmost
one; that is Safari's existing path and is the same on main.

## Limits

- **A false negative, shipped as it is** (the design session's ruling 1ea561bc:550). On a wheel-scrolled field whose
  clicked line is cut by the field's edge, the caret's write scrolls that line into view by a few points (5 pt here),
  so 9 of the 12 branch wheel cells answered `layoutMoved` with the caret right (the other 3, where the wheel did not
  scroll, were placed). The answer is never wrong, only conservative. The finer proof, re-running the box search at
  the point after the writes (about 30 reads) and placing where it still gives the written offset, is #348.
- **#296 amended** (approved, ruling 1ea561bc:550): a page found changed after the wait for boxes, which now precedes
  every write, is refused `screenChangedSinceScreenshot` with nothing written; no A/B cell changed its page.
- **The wait before focus.** A fresh Chromium's boxes are empty until its complete accessibility mode; the wait for
  them now precedes every write and keeps #292's deadline (2 s, up to 3 s just after an enablement write). A field
  whose boxes do not come by then is focused by AXFocused, its caret not placed, as before.
- **Not measured live:** the AXFocused fallback after a caret's write that does not focus the field (no Chromium cell
  needed it), a contenteditable region (its reference box is the hit's own text's), and an empty field. The unit tests
  cover each.

## Tests

`WebAreaFocusTests` (48: 9 new for #341, and the focusing click's existing tests rewritten to the new order) and the engine's `swift test` (1,088 with main at e31bb1f5 merged, 0 failures, 1 skipped) pass.
