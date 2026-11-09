# #303: Chromium's re-created table columns keep their tokens (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2, Chrome for Testing 156; two runners per run.
- **Kit:** `probe/303-measure` (`scripts/probe-303/tokens.mjs`; the handle tool is #299's `tool.swift`).
  - Each (page, engine) ran on a fresh Chrome, one engine alive at a time, with 3 or 4 observations on one connection.
  - After the first observation the tool keeps each table's column and child handles, and after every observation it
    checks whether they still read. -25202 means Chromium re-created them.
  - The engine order alternates by runner.
- **Runs:**
  - The rerun, on the rule as it stands: https://github.com/SSFSKIM/cua/actions/runs/42562287610. It runs
    origin/main at 364e017d against 5b544a10, with kit e0cd9c4b, which also records the walk time and the node cap.
    The results are in `~/.local/share/probe-303/run-42562287610/` on the MacBook.
  - The first A/B, on fd51d41b, before the review's conditions: https://github.com/SSFSKIM/cua/actions/runs/42558781067.
    The results are in `~/.local/share/probe-303/run-42558781067/`.
- The head adds b1b065ee after the rerun. It only narrows lists of more than 100 children, and here those are the cut
  tables, which already fall under the limit below.

## The rerun: tokens across observations

Columns are listed as their tokens, then `|` and the header group's token. "Re-created" means the kept handles read
-25202 at that observation's check. "Cut" means the walk hit the 4,000-node cap. On a cut table the header group lies
beyond the cap and is not printed.

| page | cut | engine | obs 1 | obs 2 | obs 3 | re-created before |
|---|---|---|---|---|---|---|
| 20×5 table (both runners) | no | main | t286–t290 \| t291 | **none printed** (6 read failures) | **t327–t331 \| t332** | during obs 2 |
| 20×5 table (both runners) | no | branch | t286–t290 \| t291 | same, 0 failures | **same** | obs 3 |
| 3,000 rows (both) | yes | main | t3959–t3964 | **t4000–t4005** | t4000–t4005 | obs 2 |
| 3,000 rows (both) | yes | branch | t3959–t3964 | **t4000–t4005** | t4000–t4005 | obs 2 |
| 6,000 rows (both) | yes | main | t3959–t3964 | same | **t4000–t4005** | obs 2 |
| 6,000 rows (both) | yes | branch | t3959–t3964 | same | **t4000–t4005** | obs 2 |
| HN thread (both) | yes | main | t3963 | **t4000** | t4000 | obs 2 (rep 2) |
| HN thread (both) | yes | branch | t3963 | **t4000** | t4000 | obs 2 (rep 2) |

- **Uncut tables keep their tokens.** On the 20×5 table the branch kept t286–t290 | t291 through each re-creation, on
  both runners. Main re-issued them. At observation 2 on both runners main also failed 6 reads (the columns and group
  re-created mid-walk) and printed none of them. The branch had 0 read failures in every observation of the rerun.
- **Cut tables re-issue their tokens, as main does.** On the 3,000- and 6,000-row tables and the HN thread both engines
  went from t3959–t3964 to t4000–t4005 (t3963 to t4000), at the same observations. This is the stated limit: a walk
  that cut the table did not read all of its children, so a column's siblings are not all known.

## A real replacement still takes a new token

The replacement page is the 20×5 table with a Save button. Before observation 3 the page replaces the button with an
identical clone (a new DOM node). Before observation 4 it inserts a first column: a header cell and a cell in every row.
The rerun's results were the same on both runners.

| step | main | branch |
|---|---|---|
| obs 1 → 2 (nothing changed) | button t35, columns t288–t292 \| t293 | the same |
| obs 3, the button cloned | button **t329** (new); columns t330–t334 \| t335 (re-issued) | button **t329** (new); columns **t288–t292 \| t293** (kept) |
| obs 4, a column inserted | six columns **t378–t383** \| t384, all new | six columns **t372–t377** \| t378, all new |

## The first A/B, before the review's conditions

On fd51d41b the rule had no completeness condition, so the branch also kept the cut tables' tokens: t3959–t3964 on
3,000 and 6,000 rows, and t3963 on the HN thread, where main re-issued t4000–t4005 and t4000. Its 20×5 and
replacement results match the rerun's. The review then found three cases where a column could take the wrong token:
a header cell spanning several columns, a walk cut after an inserted column, and the width rule's visible subset.
Since then a cut table keeps the vendor's rule.

## Cost

Nothing is read unless the vendor's rule leaves both a new sibling and an old synthesized one unmatched under a parent
whose children are all known. Then the cost is one AXRole read per candidate that matched in everything else. Here that
was 5 or 6 reads per re-creation. The completeness and anchor checks read nothing.

## Limits

- **A cut table.** On a table the walk cut, column and header-group tokens are re-issued, as main does them. With #310's
  columns read last, a cut table prints no columns, so only its header group's token churns there.
- An AppKit table that re-creates an identical column (the same identity, frame and first cell) also keeps its token.
  To the model that is the same element.
- A column re-created during the walk itself can still fail its read. Main did on both runners here, and the branch
  never did.
- A frameless or childless synthesized element takes a new token, as under the vendor's rule. So does:
  - a column whose first child heads another column too (a header cell spanning several columns);
  - any column whose old handle would have to be checked past the observation's deadline.

## Tests

`RecreatedTokenTests` (12) and the engine's `swift test` (1,068) pass.
