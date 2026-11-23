# #316: a new window over the screenshot (W) and the hit in another page (G), measured on hosted macOS (2026-11-08)

All runs used GitHub-hosted macOS 26.7.2 runners:
- **Browsers:** Safari 27.2, Chrome for Testing, stable Chrome 156 and Firefox 159.
- **Native apps:** TextEdit and Finder.
- **Modes:** shared and dedicated mode for the browsers. Safari also ran behind a frontmost TextEdit.
- **One engine at a time:** only one engine process was alive at a time.
- **Ground truth:** the page's own event beacons, or the app's state.

The kit is `probe/316-measure`, at head af721d0f. Per-job results are under `~/.local/share/probe-316/` on the MacBook.

## The spike, on main 74fe29f8

Runs: https://github.com/SSFSKIM/cua/actions/runs/42496485583 and https://github.com/SSFSKIM/cua/actions/runs/42500093229.

**The ruling's first candidate:** once a chord, Escape or Enter had been sent to an app since its screenshot, clicks would need a re-observation. Measured:
- it refused 546 of the 898 clicks that landed (61%);
- it caught 96 of the 176 wrong clicks that answered success.

It was withdrawn.

**Safari's ⌘L panel:**
- **What it is:** a separate layer-0 Safari window, above the browser window.
- **When it is up:** present in all 48 ⌘L cells and absent in every other cell, ⌘L+Escape included.
- **What swallows the click:** the next page click anywhere, not only inside the panel.
- **What doesn't show it:** focus on the address field, the field's AXExpanded, or the window's own tree.

**Chrome and Firefox:**
- Chrome's omnibox popup is also a window, but clicks pass through it.
- Firefox's urlbar list sits in the window's tree.

**Found on the way:**
- **Chrome keeps the page a tab has left.** 48 of 48 clicks placed from the old screenshot were kept and landed on the new page.

## The still-page sweep on main 73b44561

Run: https://github.com/SSFSKIM/cua/actions/runs/42504762481.

- **Main refused 0 of 458 still clicks.**
- **G read as "the nearest web area must be equal"** would have falsely refused 36 Chrome frame clicks. Chromium's hit-test resolves into a frame only on a later read.
- **The ancestor reading refused 0.** In it, the recorded web area need only be among the hit's ancestors, and that is what was built.

## The A/B: main 73b44561 against the branch ca4652a7

Run: https://github.com/SSFSKIM/cua/actions/runs/42506462753. Both heads ran the spike's sequences, drag starts and the still-page sweep. The sweep covered frames (same-origin, cross-site and nested) and #305's toolbar cells.

| Cell | Main | Branch |
|---|---|---|
| Safari ⌘L, ⌘L+typing: clicks and drag starts | 32/32 wrong, success answered | **32/32 refused `newWindow`** |
| Safari ⌘L+Escape | 16/16 land | 16/16 land |
| Chrome after a link, ⌘L+URL, or suggestion+Return | 40/40 on the new page | **40/40 refused `otherWebArea`** |
| Firefox's urlbar list | 6 of 8 wrong | **8/8 refused** |
| Chrome ⌘L, then a page click (cost) | 48 land | 48 refused `newWindow` |
| Finder rename after Return (cost) | 4 land | 4 refused `newWindow` |
| Still pages: frames, 168 per head | 0 refused | 0 refused |
| Still pages: #305's toolbar cells, 44 per head | 0 refused | 0 refused |
| Still pages: local page, Wikipedia, TextEdit, Finder | 0 refused | 3 refused (below) |
| `stalePoint.ms`, p50 / p95 / max | 0.19 / 1.74 / 10.75 | 0.80 / 4.15 / 8.24 |

**The branch's 3 still-page refusals:**
- **Where:** Wikipedia links in Chrome for Testing. Each recorded frame was a 1 pt sliver at the web area's bottom edge.
- **Why G refuses:** Chrome's hit test answers its own view group there, outside the web area.
- **On main:** the 3 were kept as `nonInteractiveHit`, the page received no event, and success was answered.
- **Accepted as is:** the design session accepted them (ruling 17dd203e). The refusal is truthful where main reported a false success.

`windowsMs` was p50 0.52 and p95 1.20 ms. `webAreaReads` was at most 14.

## Residue: what W and G don't catch (unchanged on both heads)

- **Page-made suggestion lists:** 6 of 8 clicks wrong per browser. This is #330.
- **TextEdit reflow after Return or ⌘V:** 4 wrong. This is #331.
- **Safari clicks placed from the page's tree after a re-observation that showed the panel:** 6 of 12 are still lost; G refuses the other 6.
