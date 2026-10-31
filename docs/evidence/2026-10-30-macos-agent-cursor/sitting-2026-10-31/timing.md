# Acceptance 12 and 13: timing, cursor on against cursor off

Judged by #171's noise rule (scripts/cursor-sitting/stats.mjs): the bootstrap 95 % interval of median(on) − median(off) must include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians.

## Acceptance 12 (typing): FAIL

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 547.47 | 544.38 | [-16.85, 18.66] | 27.22 | same within noise |
| press_key x30 | 20 / 20 | 301.23 | 269.09 | [16.32, 61.77] | 13.45 | slower |

## Acceptance 13 (clicks): FAIL

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| coordinate click | 40 / 40 | 5.79 | 3.92 | [-0.70, 3.20] | 1.00 | undetermined (take more samples) |
| element click | 39 / 39 | 53.45 | 56.62 | [-6.31, 2.56] | 2.83 | same within noise |
| drag | 40 / 40 | 5.79 | 4.80 | [-0.77, 3.25] | 1.00 | undetermined (take more samples) |

Each series is taken from the last run that covers it: coordinate click from the run started 2026-10-31T15:59:23.892Z; element click from the run started 2026-10-31T16:11:15.283Z; drag from the run started 2026-10-31T15:59:23.892Z.

2 timed call(s) failed and are not in the samples (item-13.jsonl has their errors).

The element clicks' routes: route 3 × 78, route none × 2.
