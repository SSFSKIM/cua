# #330: a page's suggestion list over the click point (hosted macOS, 2026-11-08 and 2026-11-09)

The stale-point guard's rule dL refuses a coordinate click as `screenChangedSinceScreenshot` with the reason `newElementOverPoint` when the hit lies in an element the page added over the point since the screenshot. The rule is specified in the native engine spec's #330 Decision Log entry.

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2.
- **Browsers:** Safari 27.2, Chrome for Testing 156 and Firefox.
- **Native apps:** Finder, TextEdit, and an AppKit mail-like table whose rows update.
- **Kit:** the `probe/330-measure` branch.
  - Shadow and spike mode: `scripts/probe-330/shadow.patch`.
  - The reusable gate groups: `scripts/probe-330/gate.mjs`.
  - The readers: `scripts/probe-330/offline/table.mjs` and `ab-table.mjs`.
- **Results:** kept per run under `~/.local/share/probe-330/run-<id>/` on the MacBook.

## The spike (main 6baaa12a with the shadow patch, which computes every candidate and never refuses)

Runs: https://github.com/SSFSKIM/cua/actions/runs/42556940112 and https://github.com/SSFSKIM/cua/actions/runs/42560125050. The findings are in https://github.com/SSFSKIM/cua/issues/330#issuecomment-6732655713.

**The cells:** six list kinds with 6 covered clicks each per browser, 60 landed clicks on the same pages, 72 near-point changes in nine scenes, and about 149 still-sweep clicks per browser.

| Candidate | Safari | Firefox | Chrome | False refusals |
|---|---|---|---|---|
| **dL: a new element in the hit's chain, listed by its fully recorded parent** | 30 | 30 | 24 | **0** |
| dL without the "listed" check | 30 | 30 | 24 | Chrome: 24 of 60, 9 of 72, 8 of 146 |
| a point-pruned descent | 24 | 24 | 24 | 8 of 72 per browser (an image inserted behind the controls) |
| a full walk | 30 | 30 | 30 | 8 of 72; p95 118–183 ms |
| a popup role at the point | 12 | 12 | 12 | 0 |
| the field's AXExpanded | 8 | 8 | 8 | 6 of 60 per browser |
| AX creation notifications | 0 | 0 | 0 | 0 |

The design session approved dL as scoped (11bec0ed), without the pruned descent: AX can't tell z-order, so the descent's false refusals would be permanent.

## The gate (main e31bb1f5 against 7f6eb3dc)

Run: https://github.com/SSFSKIM/cua/actions/runs/42585577476 (kit c0d0644b). All 10 jobs succeeded, in 2 h 44 min including queue waits.

**0 `newElementOverPoint` refusals on 967 branch gate-click attempts.** The gate's pages and apps:
- **Real pages:** Hacker News, a public GitHub pull request, Wikipedia, MDN, and #305's still sweep with its nine near-change scenes.
- **Pages that add content by themselves near the point:**
  - a lazy feed after one real scroll;
  - an SPA that replaces its list;
  - a late cookie banner;
  - #296-style re-created controls.

  Each was kept and landed 6 of 6 across the three browsers.
- **Replaced link text, same width:** kept 6 of 6, with the record holding the link and the text inside it. With a width change, #296 refuses it `nodeGone` on both heads (#340).
- **The byte-budget page:** kept 3 of 3 as `unrecordedDescendant` (about 6.3 MB trees, `budgetHit`). dL stays silent where the parent's children were cut.
- **Native apps:** all kept. Finder 25, TextEdit 16, and the mail-like table 14, while it updated 119 times.

**The catches:**

| Kind | Safari | Firefox | Chrome |
|---|---|---|---|
| listbox | 6/6 | 6/6 | 2/6 |
| plain div | 6/6 | 6/6 | 6/6 |
| combobox | 6/6 | 6/6 | 4/6 |
| end-of-body list | 6/6 | 6/6 | 6/6 |
| filled list | 6/6 | 6/6 | 6/6 |
| **Total** | **30/30** | **30/30** | **24/30** |
| opacity (the stated limit) | 0/6 | 0/6 | 0/6 |

- **Main** kept every covered click.
- **Wikipedia's suggestions:** every click main kept wrong was caught, and the branch refused all 24 of 24.
- **Every dL refusal was one of these catches,** 98 in all.

**The cost:** the whole guard's `stalePoint.ms`, p50 / p95 / max, in ms. Most clicks read nothing more.

| Browser | Main | Branch |
|---|---|---|
| Chrome | 1.3 / 3.5 / 12.1 | 1.1 / 2.9 / 7.3 |
| Firefox | 0.9 / 2.6 / 20.5 | 1.1 / 2.9 / 24.1 |
| Safari | 1.0 / 2.7 / 7.9 | 0.9 / 2.3 / 5.1 |

**Caveats:**
- **The live clock:** the clock fixture's paragraph filled on its first tick, which moved the target. Both heads refused those clicks through #296 (`nodeGone`, `frameMoved`), so this run doesn't price dL on a ticking text. The design session asked for that run before the merge (1ea561bc:554); its result follows below.
- **Chrome's screenshot-time side tool** reports AXWebArea for the four link cells and the budget cell, while the engine records the intended AXLink or AXStaticText. The kit's strict validator flags them on both heads. Safari and Firefox validate all five.

## Limits

- A list the page shows without adding elements (by opacity, or moved into place) still takes a click aimed under it.
- In Chrome, a list that overflows its field's container is missed, because Chrome's hit-test answers the covered control.
- Chrome's own `<datalist>` popup lets a click pass through to the page.
- The rule runs only in web areas.
