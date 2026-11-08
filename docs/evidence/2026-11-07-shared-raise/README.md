# #321: a shared-mode click raising the target's window (hosted macOS, 2026-11-07)

All runs used GitHub-hosted macOS runners, with one engine process per head and the head order alternating by rep. A watcher sampled the frontmost app, the key window and the window order through each click, about every 21 ms. The kit is `probe/321-ab` (01130b96), built from `probe/313-ab`. It stays off main. Per-job results are under `~/.local/share/probe-321/` on the MacBook. The reader's full output is in this folder: `ab-full.txt` for the full A/B, and `ab-confirm.txt` for the confirmation on the final head.

## The repro and the candidates (main b27ceb36, runner-only patches)

**Runs:**
- the repro: https://github.com/SSFSKIM/cua/actions/runs/42413691234, https://github.com/SSFSKIM/cua/actions/runs/42415334525 and https://github.com/SSFSKIM/cua/actions/runs/42416500144;
- the candidates: https://github.com/SSFSKIM/cua/actions/runs/42417785329, https://github.com/SSFSKIM/cua/actions/runs/42419751182 and https://github.com/SSFSKIM/cua/actions/runs/42427423176.

Results, on 220 Safari shared clicks per variant:

| Variant | Delivered | Visible raises after the hold |
|---|---|---|
| main | all | 102 |
| (a) skip the in-window activation-point click | **0** (`clickUnconfirmed`) | 0 |
| (b) an inert click outside the frame | 219/220 | 110 |
| hold until the window order reads back, cap 200 ms | all | **2 of 240** |

- **TextEdit, as the target behind another app,** raises too, so this isn't WebKit-only.
- **Chrome for Testing never raises:** its activation point lies outside the window.

## The fix: main 602b7093 (A) against 6c96be25 (B)

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42433936787 (kit 33779278).

### Safari, shared mode

100 page clicks plus 120 of #282's shared cells per head. A's first textarea cell found no textarea, because Safari wasn't ready yet.

| Measure | A | B |
|---|---|---|
| Delivered | 219/219 | 220/220 |
| Visible raise after the hold's release | **109** | **3** |
| Guard repaired a reorder | 219 | 220 |
| `transientRaise.seen` / `outlivedHold` | – | 220 / **3, exactly the visible 3** |
| `screenHoldMs` p50 (min) | 100 (92) | 200 (185) |
| `capped` | 190 | 15 |
| Guard ms p50 / p95 / max | 121 / 193 / 474 | 164 / 199 / 456 |
| Answer latency p50 / p95, page cells | 182 / 333 ms | 246 / 313 ms |
| Front app and key window held | all | all |

### TextEdit as the target, behind another app (10 shared clicks)

| Measure | A | B |
|---|---|---|
| Delivered | 10/10 | 10/10 |
| Visible after release | 0 (7 seen inside the hold) | 0 |
| `transientRaise.seen` / `outlivedHold` | – | 10 / 0 |
| `screenHoldMs` p50 | 100 | 200 |
| Answer latency p50 | 118 ms | 210 ms |

### Chrome for Testing, the control

- **Identical between the heads, with no raise.**
- Its clicks go through AXPress or AXFocused, so no delivery record is written. The activation, where one runs, is `inertOutside`.
- The kit's text-field check expects pointer events, so those cells read 0/10 on both heads, as in the patch run.

### Dedicated mode

Unchanged. The target rises and stays, on both heads. No hold runs.

## Confirmation on the final head: 602b7093 against 3436cfaa

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42435717658 (kit ea6ac788). Shared cells only, 6 reps per cell.

| | A | B |
|---|---|---|
| Safari: delivered | 30/30 | 30/30 |
| Safari: visible after release | 14 | **0** |
| Safari: `capped` | 23 | 3 |
| Safari: guard ms p50 / max | 110 / 1,173 | 164 / 197 |
| TextEdit: visible after release | 1 of 6 | 0 of 6 |
| Chrome | no raise | no raise |

## Reading `transientRaise`

- **No raise was missed.** The watcher saw a reorder inside the guard that the record didn't mark 0 times.
- **`outlivedHold` matched the visible raises exactly,** 3 of 3, in the full run.
- **It flags more reorders than the watcher sees.** A reorder lasts about 15 ms (p50), and the watcher samples about every 21 ms. Main's guard repaired a reorder on every click, so B's 220 of 220 is the real rate.
- **One `outlivedHold` in the confirmation run had no watcher sighting** (a 64 ms reorder).

## What remains, for #324

- **Every visible raise left on B came after a slow activation,** 133 to 201 ms before the click's events. The 200 ms cap counts from the activation's hold start, so those clicks had 65 ms or less of hold after their events. None of the 202 clicks with a gap of 100 ms or less raised visibly.
- **The hold is in practice a flat ~200 ms.** The activation's ~60 ms plus the guard's 150 ms least wait reach the cap.
- **Guards over 250 ms come on the first click of a fresh Safari and engine,** on both heads (B 456 ms, A up to 1,173 ms). The original 1,816 ms outlier was one too.
