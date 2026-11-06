# #305: the stale-point guard refused ordinary clicks on still pages (hosted macOS, 2026-11-06/07)

All runs used GitHub-hosted macOS runners, 2 reps each, with real coordinate clicks and nothing changed since the screenshot unless a cell says otherwise. The kits live on branches that stay off main:
- `probe/305-hosted` holds the live check, `scripts/probe-305/live.mjs`;
- `probe/305-ab` holds the A/B, which adds the still-page sweep, #296's stale suite and the popover cell.

On the runner, `instrument.py` makes each observation return the guard's record. On the fix's build only, `instrument-hit.py` adds the matching route to the meta.

## The live check: main refuses (`run-42251639474`, `run-42256453844`, `run-42262640885`)

Main was tested at c4057c3a and at 4525925e, and refused on both heads. Every refusal was `interactiveHit` with `identity: handle`:

| Spot | Refused |
|---|---|
| Safari's address field and toolbar | 12 / 12 |
| Finder's list names | 12 / 12 |
| GitHub's code view | 6 / 6 |
| Wikipedia hatnote links | 4 / 8 |

All control clicks were kept.

The mechanisms:
- **The deepest-node choice ignores stacking order.**
  - GitHub's overlay AXTextArea is a same-depth sibling of the code-lines group.
  - Safari's full-window page view lies under the toolbar on macOS 26.
- **A wrapped inline text's bounding box covers the link before it.**
- **Hit regions extend past AX frames.** Finder answers 1 pt past the name field; Safari answers 8 pt into the address field's toolbar padding.

## The fix's A/B: main 4525925e against the branch

**62e9f026, the first rule** (`run-42269993080`, `run-42294564231`, `run-42299375682`):
- The still-page sweep refused 0 on the branch, against main's 20. It covered about 20 ordinary controls per app at the centre and 2 pt inside an edge, in Chrome on GitHub and Wikipedia, Safari, Finder and TextEdit: 374 points per head.
- #296's stale suite refused every stale cell on both heads.
- Safari's address field still refused at its padding point, 2 of 12 clicks.

**The popover cell** (both heads alike):

| How the popover is hidden | Verdict | Where the click lands |
|---|---|---|
| `visibility:hidden` | `nodeGone`, refused | – |
| `opacity:0` | `nonInteractiveHit`, kept | the hidden popover |
| `opacity:0` + `pointer-events:none` | `nonInteractiveHit`, kept | the button under it |

**700bcf99, the amended rule** (`run-42304011277`, `run-42308758585`). The amendment adds the nearest recorded, unmoved, bounded ancestor.
- The Safari and Finder spots refused 0 on the branch, against main's 24.
- The Safari address-field padding point was kept as `recordedHit` with `recordedHitBy: ancestor`, in both reps. Safari's focus moved to the address field afterwards.
- `ancestor` carried those 2 passes and `hit` carried the other 47.
- The Safari sweep refused 0 on the branch, against main's 16 and 16.
- #296's stale suite refused every stale cell with the same reason on both heads: `frameMoved` or `nodeGone`.
- `stalePoint.ms` on `recordedHit` clicks: p50 1.1 ms, p95 3.4 ms, max 5.8 ms.
- Every `recordedHit` matched by CFEqual, and every hit was unclipped.

The 10 `shared-reread/swap*` cells end in #282's `backgroundClickRefused` on both heads before the stale check is reached. Three cells carry outdated expectations (`static` and the two `shared-back` cells) and behave identically on both heads.

The kits' per-job results are under `~/.local/share/probe-305/run-<id>/` on the MacBook.
