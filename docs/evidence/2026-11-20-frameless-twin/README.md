# #435: hosted macOS evidence for the frameless-twin search

Every run happened only on GitHub-hosted macOS, using kit `probe/435-qual` (workflow `424694563`, kit `9daa744e`). The kit is built from #431's `probe/431-qual`. Its README, `scripts/probe-435/README.md` at `d7052b79`, has every table. Engines were built unmodified from exact SHAs. The lanes were Chrome for Testing (156 and 157), Safari 27.2 and Electron 44.4.5, each running in the background behind an owned cover window. Main is `f8f34652`, which carries #431; the fix is `493c64ca`.

## Discovery: do the browsers record a link without a frame?

[Run 44688188130](https://github.com/SSFSKIM/cua/actions/runs/44688188130) ran on main only, 3 rows per layout per lane, with every row valid. In none of the 90 observations did the record hold a node with no frame, of any role.

| Layout of the twin at the observation | CfT | Electron | Safari |
|---|---|---|---|
| inside a collapsed `<details>` | not in the tree | not in the tree | not in the tree |
| `hidden="until-found"` | not in the tree | not in the tree | not in the tree |
| `content-visibility: auto`, off screen | framed | framed | not in the tree |
| a 0×0 box with `overflow: hidden` | framed | framed | framed |
| a clipped box with `overflow: hidden` | framed | framed | framed |

Links and their text read a frame whenever the browser lists them. **On these browsers, #435 is defence only**: no live layout produced a frameless twin to refuse, so no frameless-twin cell could be built.

## Regression: main `f8f34652` against fix `493c64ca`

Heads were interleaved, 10 rows per head per unit, and every row was valid:
- [Run 44689045231](https://github.com/SSFSKIM/cua/actions/runs/44689045231): the keep cells, `twin`, `twincap`, `capremount` and `wideremount`.
- [Run 44694519236](https://github.com/SSFSKIM/cua/actions/runs/44694519236): #340's cells and `wideoverlay`.

| Group | Main | Fix |
|---|---|---|
| `remount`, `retext`, `plain`, `like`, `btnremount`, `tableremount`, `tablecellremount` | kept and landed | kept and landed, every row |
| `twin`, `twincap`, `capremount`, `wideremount` (Safari) | refused `nodeGone` | refused `nodeGone` |
| #340's cells, `wideoverlay` | as #431's evidence | the same verdict and reason, every pair |

Across all pairs, verdicts and reasons differed 0 times. Neither head produced a wrong target.

| Lane | `stalePoint.ms` p50 / p95, main | fix |
|---|---|---|
| Chrome for Testing | 6.8 / 20.4 | 7.1 / 20.0 |
| Safari | 4.2 / 8.2 | 4.1 / 9.0 |
| Electron | 4.5 / 9.8 | 4.8 / 10.1 |

The fix's Safari maximum was 365 ms, a single `wideoverlay` row with the same verdict as main. #431's run had a similar 312 ms Safari outlier.

## Limits

- **A twin outside the tree at the observation is still clicked.** This applies inside a collapsed `<details>` or `hidden="until-found"` on all three browsers, and with `content-visibility` on Safari. When such a twin is revealed into a removed control's place, main and the fix both keep the re-created match and click it. #435 can't see it, because the record never held it. Tracked separately.
- **The frameless search is proven only offline.** The stub tests cover it: a frameless twin refuses `nodeGone`, and the twin search caches the target's words once per search. No live layout exercised it.
