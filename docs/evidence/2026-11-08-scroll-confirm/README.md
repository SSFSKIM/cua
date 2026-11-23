# #328: pointer actions outside the screenshot, and scrolls that moved nothing (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2.
- **Apps:** Safari 27.2, Chrome for Testing 156, Firefox, TextEdit, Finder, System Settings, Notes, plus the kit's own apps: Probe328 (AppKit), SwiftUI328 and Catalyst328.
- **Background:** the targets sat behind a frontmost TextEdit.
- **Ground truth:** each app's own scroll position. For the web pages, every scroller's offset was reported by the page itself.
- **Kit:** `probe/328-measure`, with the readers `scripts/probe-328/offline/table.mjs` and `ab.mjs`.
- **Results:** stored per run under `~/.local/share/probe-328/run-<id>/` on the MacBook.

## The spike (main 81a43091)

Runs: https://github.com/SSFSKIM/cua/actions/runs/42526444701, https://github.com/SSFSKIM/cua/actions/runs/42529832136 and https://github.com/SSFSKIM/cua/actions/runs/42532340875.

- **Why #324's 0 of 24 failed:** the points were aimed below their windows. The centre of a long text area's frame lies past the window's bottom. `screenshotPoint` accepted the point, and main answered `success`. This reproduced 10 of 10.
- **Main's posted wheel is the vendor's route.** It scrolled exactly 120 of 120 pt in background AppKit, SwiftUI, Catalyst, Safari, Chrome and Firefox, across 1,977 trials. It caused 0 raises and 0 changes of key window.
- **What the wheel needs:** the window fields (51, 91 and 92) and the window-local point. It works wherever the pointer is.
- **The one real non-delivery:** System Settings' content pane, 0 of 16. Writing its scroll bar's AXValue moves it.
- **Every one of main's 102 answered scroll cells said `success`,** including every one that moved nothing.

## Early read of gate (b): main's engine with the confirm emulated

Run: https://github.com/SSFSKIM/cua/actions/runs/42535468711.

- **Chrome's accessibility tree trails its page** by about 150–200 ms.
- **Scrollers driven by a script** (one that waits 150 ms, and rAF animations) confirm later still.
- **The confirm window:** with the hit element measured, 300 ms leaves false `scrollUnconfirmed` answers on the scripted cells, and 800 ms leaves none. The window was set to 800 ms (design session 08d673c3).

## The A/B (main f859ce68 against the branch)

| Run | Head |
|---|---|
| https://github.com/SSFSKIM/cua/actions/runs/42537713415 | e0c24b81, full |
| https://github.com/SSFSKIM/cua/actions/runs/42540817002 | 8b5d314f, web |
| https://github.com/SSFSKIM/cua/actions/runs/42545254661 | ca835ff4 |
| https://github.com/SSFSKIM/cua/actions/runs/42546633581 | b1d51686, final pass |
| https://github.com/SSFSKIM/cua/actions/runs/42551661607 | 8c93f347, short pass: Settings, the ends, web sanity |

**Gate (a): no new refusals at in-bounds points.**
- 360 cells per head on e0c24b81, and 208 on b1d51686, across six apps: clicks and drags at points inside, and 0, 1 and 2 px in from each edge and corner. 0 `pointOutsideScreenshot`.
- Points past an edge: 96 of 96 refused, and no page saw a pointer event.
- #324's own cells: main answered `success` 4 of 4 with nothing moved. The branch refuses them.

**Gate (b): no false `scrollUnconfirmed`.**
- 0 on b1d51686 across Safari, Chrome and Firefox, for every kind of scroller:
  - a nested overflow div, scrolled from inside it and from 3 pt below its top edge;
  - an iframe;
  - a horizontal scroller;
  - a rAF animation, a script that waits 150 ms, a script that waits 350 ms;
  - `scroll-behavior: smooth`.
- The first move's p95 was at most 472 ms.
- Catalyst: 4 of 4. The first fix head, e0c24b81, scored 0 of 3, which was fixed.

**Gate (c): the fallback writes only the scroller under the point, and never at its end.**
- **divEnd** (a nested div at its end): the page took the wheel by chaining, 12 of 12. No bar was written.
- **No bar was written in web content.**
- **Settings' pane:** moves by the bar write and answers success, 4 of 4. Main answered success with nothing moved.
- **Settings' sidebar at its real bottom (8c93f347):**
  - 6 of 8 answered `atEnd` with no write.
  - 2 of 8 wrote 1.0: its bar reads 0.952–1.0 there, because its AXContentSize flickers between 1118 and 1178 pt. Nothing moved (offset 0), and the answer was an honest `scrollUnconfirmed` after about 1.7 s.
  - The design session accepted this as a stated limit (8d00d2ba).
- **End cells (Probe328, TextEdit, Finder, Safari pageEnd):** `endBefore` with no write, 20 of 20.
- **Main** answered success with nothing moved in every end, pane and #324 cell.

**Cost on b1d51686:**

| Case | Time |
|---|---|
| Moved scroll, native apps | 31–92 ms |
| Moved scroll, Safari | 38–84 ms |
| Moved scroll, Firefox | 54–80 ms |
| Moved scroll, Chrome | 188–247 ms |
| Scripted scrollers in the browsers | about 200–410 ms |
| At the end with a readable bar | 3–35 ms |
| Unconfirmed, or no readable end | about 885 ms |
| Settings' pane bar write | about 900 ms |

- **Chrome's walk before the wheel:** 8–133 nodes and 5–41 ms. With an 800-node walk it was 96–202 ms.
- **Main** answers in 2–25 ms.

## Limits

- **Chrome animated scrollers:** Chrome holds its accessibility frames until an animated scripted scroll settles, which can outlast the 800 ms window. On e0c24b81, one late cell missed and one first move came at 813 ms.
- **Chrome and Firefox at a page's end:** neither gives a readable end, so at a page's end they answer `scrollUnconfirmed` after the window.
- **Settings' pane by element:** the window scan runs only for a coordinate. A scroll at that pane's element answers an honest `scrollUnconfirmed`.
- **A bar that misreports its own end** (Settings' sidebar) can take a no-op bar write and answer `scrollUnconfirmed` after about 1.7 s.
- **Dragging out of the window** is refused (#334).
