# #290: the caret's offset searched by line, then x (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2, Chrome for Testing 156.0.8078.80; two runners.
- **Engines:** origin/main at 364e017d against `fix/290-caret-search` at 93bc212e, debug builds.
- **Kit:** `probe/290-measure` at a21b1d77 (`scripts/probe-283/ab.mjs`, the `long/` cells; `scripts/probe-283/ax.swift`'s
  `boxes` mode).
  - Each cell makes a shared-mode coordinate click into a background Chrome for Testing textarea, with TextEdit
    frontmost. The click is at row 2.5 of the field's four shown lines, after the page has scrolled the field mid-way.
    A `type_text` of a marker follows the click.
  - There are two fields. `lta` holds 3,074 characters and is scrolled to line 32. `hta` holds 20,499 characters and
    is scrolled to line 230, or to line 250 for the far cell `hta-far`. The `hta-past-end` cell clicks past the end of
    a line.
  - Cells run fresh (the first observation turns Chromium's accessibility on) and late. There are 3 repeats per cell
    and per runner.
  - The dump cells record each field's character boxes through `AXBoundsForRange`, scrolled and unfocused, as the
    screenshot shows the field. They give the offline replay its input.
- **Results:** `~/.local/share/probe-290/run-42560301611/` on the MacBook; replay tool `~/.local/share/probe-290/replay/`.
- **Run:** https://github.com/SSFSKIM/cua/actions/runs/42560301611 (the first run, 42557663147, clicked outside the
  four-line fields and is superseded).

## Live clicks

The page's caret after the click (`selectionStart`), and the engine's claim. "Point" is the offset the unfocused box dump
puts under the click.

| field | engine | cells | claim | page caret | point | late click, median |
|---|---|---|---|---|---|---|
| 3,074 chars | main | 12 | placed | 96 | 1,408 | 188 ms |
| 3,074 chars | branch | 12 | placed | 96 | 1,408 | 122 ms |
| 20,499 chars (`hta`, `hta-far`, `hta-past-end`) | main | 24 | `pointOutsideText` | 0 | 9,526 / past 10,000 / 9,552 | 51–62 ms |
| 20,499 chars (`hta`, `hta-far`) | branch | 18 | placed | 96 | 9,526 / past 10,000 | 108–143 ms |
| 20,499 chars (`hta-past-end`) | branch | 6 | placed | 122 | 9,552 | 144 ms |

**Both engines place offset 96 on the 3,074-character field because of #341, not because of this change.** Focusing
Chromium's textarea scrolls it to its existing caret (offset 0) before `focusPlacingCaret` reads the offset. The boxes
read after that put the point on line 2 (offset 96 = line 2, column 14), not on line 34 (1,408). The column is right and
the line is the top-scrolled layout's. The screenshots in the run's artifacts show the fields scrolled to lines 32–35 and
230–233 when the click is made. So the live cells show three things:
- the branch answers as main where main answers;
- the branch places on a 20,499-character field, where main refuses every time;
- the typed marker lands at the claimed offset (`afterType` = claim + 2).

They do not show that the offset is the one under the point. That rests on the replay.

## Offline replay over the dumped boxes

`replay <boxes.json> 0.1`: the branch's `caretOffset` (extracted from the head, with the review's direction probe) against #283's linear scan alone. It runs
at the click point and at a grid of 24,400 points over each field and 20 pt past it on every side. Same on both runners.

| dump | value read | at the click: search | at the click: linear scan | grid agreement | search reads, mean / max |
|---|---|---|---|---|---|
| `lta` | 3,074 | 1,408 in 29 reads | 1,408 in 1,409 reads | 24,400 / 24,400 | 358 / 3,074 |
| `hta` | 10,000 (capped) | 9,526 in 29 reads | 9,526 in 9,527 reads | 24,400 / 24,400 | 559 / 5,003 |
| `hta-far` | 10,000 (capped) | `pointOutsideText` in 5,002 reads | `pointOutsideText` in 10,000 reads | 24,400 / 24,400 | 559 / 5,003 |

The grid's means are carried by its misses (2,650 and 2,592 of the points fall outside the text). Each miss reads the
whole field when it is 5,000 characters or shorter, otherwise the 5,000-character window.

## Limits

- **The 10,000-character `AXValue` cap.** Chromium serves at most 10,000 characters of a field's `AXValue`: the
  20,499-character field read 10,000. A point on the text past the cap is a miss (`hta-far` in the replay).
- **The cost of a miss.** A point outside the text, or past the cap, still costs the bounded linear scan: up to 5,000
  reads, about 500 ms at the runner's 0.1 ms per read.
- **Right-to-left text** over 5,000 characters is refused with nothing read, as on main. So is a text over 5,000
  characters whose boxes the search reads out of reading order, or whose first characters run vertically or leftward;
  within 5,000 characters such a text gets the linear scan.
- **A character set wholly below its line** (vertical-align) in a contenteditable region could be taken for a line's
  wrap. Characters of other sizes on one line overlap vertically and fall back to the linear scan.
- **#341.** In a scrolled textarea the offset is the one under the point in the field's top-scrolled layout, on main
  as on the branch.

## Tests

`CaretSearchTests` (11) and the engine's `swift test` pass. The hosted A/B ran on 93bc212e. The review's changes (66017fb1 and the direction
probe after it) change only text whose boxes do not run rightward on a line (vertical or out of order), which no cell
here has; the probe adds 2 reads at each click.
