# #314: an element of more than 499 children with no visible subset (hosted macOS, 2026-11-07)

All runs used GitHub-hosted macOS runners: Firefox 159, Safari 27.2 and Chrome for Testing 156. Each head ran in its own engine process, and the head order alternated by rep. A is main 3de863bb, and B is the fix, 4737987b.

The kit is `probe/314-ab` (measured at e92144f0 and bb0e8187), cut from `probe/287-hosted`. It stays off main. Per-job results are under `~/.local/share/probe-314/` on the MacBook. The per-page table for every browser is in `pages.md`.

## Method

- **The cells:** each cell is a page at one scroll position: 0, 25, 50 or 90 %.
- **The truth:** a side tool reads every element with more than 499 children, and which of its children show inside the element's clipping ancestors.
- **The observations:** each head observes the page twice plain (in the order A B B A) and twice with `settle: true`.
- **Clicks by token:** on the local pages in Firefox and Safari, each head clicks a printed row and the fixed bar's button, in shared and in dedicated mode.
- **Firefox scrolling:** Firefox exposes no vertical scroll bar, so the tool scrolls with `AXScrollToVisible`. It landed within 0.01 of every target.

## Runs

- the confirmation, 2 reps: https://github.com/SSFSKIM/cua/actions/runs/42444041899;
- the full run, 3 reps: https://github.com/SSFSKIM/cua/actions/runs/42444787545;
- smoke runs on 937f49c9, the pre-review head: https://github.com/SSFSKIM/cua/actions/runs/42442898846 and https://github.com/SSFSKIM/cua/actions/runs/42443438470. On the cells both heads ran, they matched 4737987b.

## Firefox

| Page | Nodes, A → B | B prints of the wide element (truth) | B missed / extra | Settle ms, A → B |
|---|---|---|---|---|
| `/fixedtail` (2,501 children) | 36–55 → 205–229 | 33–34 (33–34) | 0 / 0 | 337 → 383 |
| local table (3,007) | 53–56 → 310–356 | 24–27 (18–21) | 0 / 6 | 325 → 481 |
| local table, 6,007 rows | 50–53 → 321–353 | 25–27 (19–21) | 0 / 6 | 360 → 509 |
| hn-thread (1,219) | 152 → 223–304 | 2–5 (2–5) | 0 / 0 | 504 → 528 |
| iana-media (1,827) | 3,331 → 3,331–3,578 | 27–29 (24–26) | 0 / 3 | 1,104 → 1,158 |

- **On `/fixedtail`, B prints exactly the rows on screen,** in order, with the fixed tail last, in all 48 observations. A printed the web area as omitted, 0 of 2,501. B's marker reads `(showing lo-hi, 2500-2501 of 2501 items)`, with subset `"shown"`. Chrome prints 3,989 nodes, the node cap, on the same page.
- **The extra rows are the tables' frameless AXColumn children,** which #304's rule keeps as an end sample. The truth counts frameless children as not shown.
- **A click by token always found its printed row.** On the tables, and on `/fixedtail` in dedicated mode (12 of 12), the click went through.
  - In shared mode on `/fixedtail`, 9 of 12 row clicks below the top came back unconfirmed. There the hit test lands on a descendant, so the click is posted as a pointer click, which Firefox in the background doesn't deliver. That is #315's route problem, not this change.
  - The fixed bar's buttons went through on both heads, in both modes.

## Safari

| Page | Nodes, A → B | B prints (truth) | B missed / extra | Settle ms, A → B |
|---|---|---|---|---|
| `/fixedtail` | 30 → 194–199 | 32–33 (32–33) | 0 / 0 | 370 → 406 |
| docs.python.org (body, 667 children) | 453 → 583–1,033 | 1–11 (1–11) | 0 / 0 | 411 → 497 |
| hn-thread (web area, 10,681) | 30 → 91–131 | 21–31 (22–32) | 0–1 / 0 | 399 → 416 |

- **Rows match.** On `/fixedtail` the printed rows are identical to the truth and in order, 80 of 80.
- **On hn-thread, B sometimes misses one child** that shows 20 positions away from the bisected run. Above 512 children that is the bisected rule's stated limit.
- **Pages with no omitted wide element are unchanged.**

## Chrome for Testing: #304's 21 pages

- **Unchanged.** Node counts are identical on every page, because Chrome answers a visible subset.
- **Printed text is identical on 18 pages.**
  - `/fixedtail` and iana-media each differ in one pair, through Chrome's "High memory usage" window title.
  - w3s-float differs within one head as well, which is ad churn.
- **Timing is within noise.** The median difference per page runs from −114 to +115 ms, on observations of 1.5–2.6 s.

## Cost

The busy walk now reads frames on these elements, and that is the one cost that clearly shows:
- **Firefox's 3,000- and 6,000-row tables:** the busy walk goes from about 37 ms to 170–195 ms, adding about 140 ms per settle.
- **`/fixedtail`:** about +40 ms on both browsers.
- **Safari's docs.python.org:** about +74 ms.

No settle was capped, and nothing timed out.
