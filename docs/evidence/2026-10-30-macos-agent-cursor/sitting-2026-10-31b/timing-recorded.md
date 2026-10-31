# Acceptance 12 and 13: the recorded series (arms, the owner's input source), not judged

The same rule's numbers for each series, for the design session; no verdict on the acceptance item comes from them.

## Acceptance 12-control (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 540.40 | 535.23 | [-12.68, 19.15] | 26.76 | same within noise |
| press_key x30 | 20 / 20 | 408.99 | 356.04 | [5.49, 86.18] | 17.80 | slower |

Signposts (coverage-12-control.json): complete, every one of 40 samples has engine signposts.

## Acceptance 12-fps60 (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 528.78 | 530.60 | [-14.29, 14.63] | 26.53 | same within noise |
| press_key x30 | 20 / 20 | 271.05 | 253.79 | [-36.18, 59.48] | 12.69 | undetermined (take more samples) |

Signposts (coverage-12-fps60.json): complete, every one of 40 samples has engine signposts.

The fps60 cap, from the cursor probe's glides before the series: default 119.5 Hz (a frame every 8.3 ms), fps60 119.8 Hz (every 8.3 ms); rock 120 against 120 Hz: **not capped** (the capped glides composited a frame every 8.3 ms (119.8 Hz), under 14 ms apart).

## Acceptance 12-still (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 0 / 0 | – | – | – | – | too few samples |
| press_key x30 | 20 / 20 | 249.58 | 234.63 | [-1.18, 22.97] | 11.73 | undetermined (take more samples) |

Signposts (coverage-12-still.json): complete, every one of 40 samples has engine signposts.
