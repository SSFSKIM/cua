# #304 and #309: a wide list starved the guard's record (hosted macOS, 2026-11-06/07)

All runs used GitHub-hosted macOS runners: Chrome for Testing and Safari, a 1024×768 screen, 2 reps unless a section says otherwise. The engines are instrumented on the runner only, so each observation returns the guard's record. The kits live on branches that stay off main:
- `probe/304-hosted`, the spike;
- `probe/304-ab`, the A/B, which ports #305's still-page sweep, #296's stale suite and the popover cell;
- `probe/304-full`, the wide trees with whole child lists.

Per-job results are under `~/.local/share/probe-304/` on the MacBook.

## The spike: how often each hole occurs on main f20a25ee

Runs: https://github.com/SSFSKIM/cua/actions/runs/42313992098, https://github.com/SSFSKIM/cua/actions/runs/42315529833, https://github.com/SSFSKIM/cua/actions/runs/42317669249 and https://github.com/SSFSKIM/cua/actions/runs/42319757707.

The spike made 234 observations of 20 Chrome pages and 7 Safari pages, at top, 25, 50 and 90%, covering 57,836 clickable points on a 20-pt grid. Its findings are in https://github.com/SSFSKIM/cua/issues/304#issuecomment-6700524473.

| hole | observations | container-only points |
|---|---|---|
| 1: a collapsed-frame container | 0 | 0 |
| 2: a wide list starving later siblings (iana-media and the local tables) | 37 | 1,684 (2.9%) |
| #309: the record's bisection returning nothing (Safari docs.python.org) | 8 | 804 (1.4%) |

## The A/B: main f20a25ee against the branch

**The noise floor** (A = B = main): https://github.com/SSFSKIM/cua/actions/runs/42326533862 and https://github.com/SSFSKIM/cua/actions/runs/42328384133. Cut walks, B − A: p50 −16 ms, paired median +5 ms, paired absolute p95 368 ms.

**566e3612, the first rule B** (https://github.com/SSFSKIM/cua/actions/runs/42338126530):
- Hole 2 and #309 closed.
- Two regressions against main:
  - **two-column reference lists:** wiki-article at 90% fell from 100% to 70.9%, and wiki-table from 100% to 63%;
  - **`/fixedtail`** (a position:fixed toolbar after 2,500 paragraphs): 11–13 toolbar points refused as `interactiveHit`.

**bc4d395f, the amended rule B** (https://github.com/SSFSKIM/cua/actions/runs/42348997723): both regressions gone.

**aab236fb, the final A/B** (https://github.com/SSFSKIM/cua/actions/runs/42360213243). Every page and position not listed is 100% on both heads:

| page | A, checked % | B, checked % |
|---|---|---|
| Chrome local-table, top–90 | 92.1–94.1 | 100 |
| Chrome local-table-bar, top–90 | 88.3–90.9 | 100 |
| Chrome local-table-6k, top–90 | 38–90.9 | 100 |
| Chrome iana-media, 25–90 | 48.7–60.1 | 100 |
| Safari py-docs, top–90 | 36.6–84.7 | 100 |

The other results on aab236fb:
- **Still-page refusals:** on `/fixedtail`, none on either head. On the barred and 6,000-row tables, A refuses 20–22 toolbar points and B none.
- **Uncut equality:** on every static uncut page, the printed tree, the guard record and the raw nodes (descriptions included) are identical on all 40 pairs. Safari py-docs differs only in the guard record, which is #309's intended change.
- **Safety suites:** #305's sweep refuses 0 on both heads, and all 90 stale cells of #296's suite are refused on both heads. `chrome/shared-reread/swap/0.1s` answers `nodeGone` or `sameElement`-then-`backgroundClickRefused` on both heads (A 3/18, B 1/18). That depends on how late after Chrome's launch the cell is observed, not on the head.
- **Cut flags:** none differs; every cut is `nodeCap`.
- **Walk ms, B − A paired:** all cut walks +38 ms. local-table-6k +323 ms, local-table-bar +174 ms, local-table +110 ms, Safari py-docs +56 ms (#309's record).
  - Rule B's own frame reads cost 8–10 ms per big table: about 117 reads at 0.06–0.09 ms each.
  - The rest comes from reading the tables' AXColumn elements themselves. Their frames span the table, so they count as shown. Each lists 6,001 cells, so the width rule takes a 6,001-element child list at about 28 ms per column.

2e5d63e6, the head, only narrows a column shortcut on top of aab236fb. The replays below cover that difference.

## The invariant check, run offline over the recorded trees

The check: rule B never leaves unread a shown child that main would have read before the cut. `WideListInvariantTests` walks each tree with the real `TreeWalk` twice, once with the wide-list rules off and once with them on.
- **The full child-list dumps** (https://github.com/SSFSKIM/cua/actions/runs/42352124120, the table pages): 52 trees, all 52 verified, 0 losses.
  - Command: `CUA_304_TREES=$HOME/.local/share/probe-304/full-42352124120 swift test --filter WideListInvariantTests`.
- **The spike's trees:** 282, of which 154 are verified and 128 alias-incomplete (their dumps hold each shared table cell under one parent only). 0 losses.
  - With the first rule B, the same check finds at least 1,141 losses.
