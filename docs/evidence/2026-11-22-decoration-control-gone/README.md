# #443: hosted macOS evidence for a kept decoration whose recorded control is gone

Every run in this document happened on GitHub-hosted macOS, with the engines built unmodified from exact SHAs, on three lanes: Chrome for Testing, Safari and Electron. The kit is `probe/443-qual`, built from #433's `probe/433-qual` (`scripts/probe-433/`, workflow `.github/workflows/probe-443-qual.yml`). Every table is in `scripts/probe-433/README.md` on that branch, in the section "#443 qual" at `a314e4f0`, each labelled with its engine SHAs.

## The bug on main

Here is the case. The observation records an inert decoration (an icon, a badge or a wrapper) inside link A. The page then replaces A with link B and moves the decoration into B. The decoration's handle is still alive and in place, so the stale-point guard keeps the click (`sameElement`), and the click lands on B.

- In #433's qualification (cell `decomove`, run 44715767925), main 870dd117 landed on B 40/40 on CfT and on Electron.
- Here, main dfe6f443 landed on B 20/20 on each of those lanes.
- Safari refuses with `nodeGone` on both heads.

## The fix

When the recorded node's recorded control (`ScreenshotNode.control`) is confirmed gone, the engine reads the control the decoration lies in now. Confirmed gone means the control's handle answers `kAXErrorInvalidUIElement`. The control the decoration lies in now is its nearest live ancestor with an interactive role or AXPress.

The guard refuses with `screenChangedSinceScreenshot` (`stalePoint.reason: controlGone`) only when all of these hold:
- the recorded node was found by its own handle;
- it is inert, and it is not #305's `recordedHit`;
- the live control exists, and differs from the recorded one by label or by place (more than 2 pt).

In every other case it keeps main's verdict:
- no live acting ancestor;
- an ancestor that can't be classified;
- an unread label or frame;
- a live control matching the recorded control's label and place, whatever its role;
- a recorded control (by handle, actionable in the record, in place) that the hit or the decoration lies in;
- recorded content of such a control, hit exactly and in place.

## Results

Fix `df383120` against main `dfe6f443`, mode qualify, 10 rows per head per unit, heads interleaved, kit `d4bd4b93`. The run had 3,720 rows; every row was valid and no lane aborted. Batch A: [45003171589](https://github.com/SSFSKIM/cua/actions/runs/45003171589). Batch B: [45035915969](https://github.com/SSFSKIM/cua/actions/runs/45035915969). Batch C: [45040636364](https://github.com/SSFSKIM/cua/actions/runs/45040636364).

| Line | CfT | Safari | Electron |
|---|---|---|---|
| `decomove`: fix refused `controlGone` | **20/20** | (both heads `nodeGone` 20/20) | **20/20** |
| `decomove`: landed on B, fix (main) | 0/20 (20/20) | 0/20 (0/20) | 0/20 (20/20) |
| Keep, link-text, #340 and #433 rows that differ from main (verdict or reason) | 0/600 | 0/600 | 0/600 |
| False refusals: the fix refused where main kept and landed | 0 | 0 | 0 |
| `controlGone` outside `decomove` | 0 | 0 | 0 |
| `stalePoint.ms` p50 / max, main | 6.0 / 39.8 | 4.2 / 17.7 | 3.8 / 14.4 |
| `stalePoint.ms` p50 / max, fix | 6.2 / 36.4 | 4.0 / 17.1 | 4.1 / 18.7 |

Ruling 1061 required three fixed rows:
- `overlaprow/link`, a click on the front link's padding on Electron, kept and landed on both heads, 10/10.
- `rolechange`, a link whose element becomes `role="button"` on Safari, kept and landed on both heads (`hitAboveNode`), 20/20.
- `decomove` refused on CfT and Electron, 20/20 each.

`overlapinto` (the decoration moved into the unchanged front link) answers as main does on every lane.

The cells:
- Batch A: `twincover`, `overcontrol`, `scrim`, `rolechange`, `overlapinto`, `overlaprow`, `stickyscroll`, `tipremount`, `twinunder`.
- Batch B: `remount`, `retext`, `plain`, `like`, `textbehind`, `btnremount`, `tableremount`, `tablecellremount`, `twin`, `twincap`, `nounder`, `rebuildunder`, `bgbutton`.
- Batch C: #340's cells and `wideoverlay`.

## Previews on superseded heads (not counted)

A smoke on `2a3c7e53` ([44997131965](https://github.com/SSFSKIM/cua/actions/runs/44997131965)) found two false refusals: `overlaprow/link` on Electron (main landed 2/2, the fix refused 2/2) and `rolechange` on Safari (main 4/4, the fix 4/4). The narrowing in `f394677e` and the last review wave in `df383120` fixed both. Batch A was started on `1d3b0963` (44996489260) and again on `2a3c7e53` (44997804442); both runs were cancelled unfinished when a newer head arrived.

## Limits

- **A re-created control with the same label and place keeps main's verdict.** That includes a replacement link that reads like the one it replaced. The rule can't tell such a replacement from the same control re-created (Safari's role change re-creates the control's AX object). That narrowing is deliberate (ruling 1061), and it is what keeps `rolechange` landing.
- **Main's baseline on some overlay cells:**
  - On CfT, `overcontrol`, `overlaprow/link`, `rebuildunder` and `bgbutton` never land on either head; the click answers `backgroundClickRefused` on both.
  - On Safari, both heads refuse the overlap cells and `rebuildunder/text`.
  - The fix differs from main in none of these rows.
- **Not separated by a test:** the own-handle condition. A node re-created together with its control already keeps through the same-control comparison, so it is a cheap guard, not a load-bearing one.
