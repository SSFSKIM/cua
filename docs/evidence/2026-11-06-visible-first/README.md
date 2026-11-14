# #301: a walk the node budget cuts keeps what the window shows (hosted macOS, 2026-11-06)

All runs used GitHub-hosted macOS runners, with 2 reps and no clicks posted. The kit is on branch `probe/299-hosted` (`scripts/probe-299/`) and stays off main. Both engines were built from source on the runner. `instrument.py`, a patch applied on the runner only, makes each observation also return the stale-point guard's own record, so the guard's reading can be computed from it.

## Why: spike #299 (main c4057c3a)

Run https://github.com/SSFSKIM/cua/actions/runs/42202647390 (kit 7c92f7bf). Tables: [spike-299-42202647390.md](spike-299-42202647390.md) and [spike-299-simulate.txt](spike-299-simulate.txt).

**The cut.** The only limit that cut the record was cua's 4,000-node budget. The walk spent it depth-first from the top of the document.

**What the guard checked.** On a long page scrolled 25% or more, it checked only 15–50% of clickable points. The rest read `unrecordedDescendant`, which checks only the container.

**Raising the budget priced poorly.**
- It costs about 0.4 ms of walk and 758 bytes per node.
- At 16k nodes, Wikipedia at 90% is still only 44% checked.

**Visible-first priced well.** Spending the same budget visible first reached 100% in an offline simulation.

## The A/B with hit-test seeding: main c4057c3a against ab0e019a

Run https://github.com/SSFSKIM/cua/actions/runs/42231389508 (kit 8b740b92). Table: [ab-42231389508.md](ab-42231389508.md).

**Coverage.** The guard's checked share went to 100% on every page and position where the budget cut, in Chrome and Safari.

**Seeding did no work.**
- `seedPromoted` was 0 in all 56 Chromium rows. The frame-ordered walk had already read the visible content when the trigger fired.
- `seedMs` was p50 68, p95 250 and max 390 ms. `seedCapped` fired 0 times.

The design session therefore dropped seeding (ruling 66f90453).

**Safari's wide lists.** The record-only rows (the width rule's omitted branch, more than 499 children with no visible subset) took Safari's HN thread from 45–74% to 100%, and the 1,500-link list from 4% to 100%. That cost p50 +17 ms of walk.

## The re-run without seeding: main c4057c3a against b2685041

Run https://github.com/SSFSKIM/cua/actions/runs/42246731024 (kit 59e14c72), the Chrome pages the budget cuts. Table: [ab-noseed-42246731024.md](ab-noseed-42246731024.md).

The guard's share of clickable points checked, main → branch:

| Page | top | 25% | 50% | 90% |
|---|---|---|---|---|
| Wikipedia article | 96.9 → 100 | 18.3 → 100 | 30 → 100 | 14.6 → 100 |
| Wikipedia population table | 94.1 → 100 | 89.7 → 100 | 23.5 → 100 | 15.4 → 100 |
| HN "Who is hiring" thread | 90.4 → 100 | 39.2 → 100 | 52.2 → 100 | 40.4 → 100 |
| Local 3,000-row table | 92.1 → 92.1 | 34.3 → 93.6 | 31.6 → 94.1 | 31.4 → 94.1 |

- **The local table's remaining 6–8%** is Chrome's toolbar and infobar. Reading the frames of all 3,008 rows of the shown table spends the budget before preorder returns to the toolbar.
- **Walk time:** p50 2,524 ms against main's 2,546, and p95 3,382 against 4,594.
- **The marker:** `below the visible area` at the top of every page, and `above and below the visible area` deeper.
- **Token stability:** 0 tokens changed out of 68,310 matched between consecutive observations at the same position. Chromium's re-created AXColumn and table-header AXGroup are excluded; see below.

## Re-created Chromium table columns (main shows the same)

Run https://github.com/SSFSKIM/cua/actions/runs/42243553112 (kit 32a1d585): a local 20 × 5 table, observed 3 times on one connection.
- **Main's column tokens change:** t286–t290 become t327–t331.
- **The cause:** the kept handles return kAXErrorInvalidUIElement, because Chromium re-creates its synthesized columns and header group. The vendor's CFEqual identity rule then gives them new tokens.
- **Why #301 shows it more:** the visible-first walk reaches these nodes on long tables, where main's cut never did.

This is #303.

The kit's results for each job are under `~/.local/share/probe-299/run-<id>/` on the MacBook. The runs keep their artifacts for GitHub's retention period.
