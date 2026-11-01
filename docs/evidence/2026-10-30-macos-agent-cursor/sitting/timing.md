# Acceptance 12 and 13: timing, cursor on against cursor off

Judged by #171's noise rule (scripts/cursor-sitting/stats.mjs): the bootstrap 95 % interval of median(on) − median(off) must include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians.

## Acceptance 12 (typing): FAIL

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 44.80 | 39.85 | [-3.10, 10.13] | 1.99 | undetermined (take more samples) |
| press_key x30 | 20 / 20 | 929.90 | 827.27 | [25.67, 286.93] | 41.36 | slower |

## Acceptance 13 (clicks): FAIL

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| coordinate click | 20 / 20 | 5.66 | 5.21 | [-2.09, 2.95] | 1.00 | undetermined (take more samples) |
| element click | 20 / 20 | 59.92 | 56.23 | [2.00, 7.39] | 2.81 | slower |
| drag | 20 / 20 | 7.72 | 8.15 | [-3.23, 3.52] | 1.00 | undetermined (take more samples) |

The element clicks' routes: route 3 × 40.
