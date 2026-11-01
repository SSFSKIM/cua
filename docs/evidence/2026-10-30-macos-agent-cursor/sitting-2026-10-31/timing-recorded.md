# Acceptance 12 and 13: the recorded series (arms, the owner's input source), not judged

The same rule's numbers for each series, for the design session; no verdict on the acceptance item comes from them.

## Acceptance 12-legacyLayers (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 537.16 | 522.32 | [-2.18, 40.27] | 26.12 | undetermined (take more samples) |
| press_key x30 | 20 / 20 | 429.02 | 359.63 | [40.56, 97.77] | 17.98 | slower |

## Acceptance 12-noBackdrop (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 549.51 | 525.27 | [-14.15, 40.85] | 26.26 | undetermined (take more samples) |
| press_key x30 | 20 / 20 | 572.46 | 519.57 | [16.14, 120.59] | 25.98 | slower |

## Acceptance 12-panelOut (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 562.94 | 594.16 | [-53.94, 0.14] | 29.71 | same within noise |
| press_key x30 | 20 / 20 | 520.43 | 519.55 | [-69.70, 61.88] | 25.98 | undetermined (take more samples) |

## Acceptance 12-source-2SetKorean (typing): recorded (the rule would say fail)

Input source: 2-Set Korean (com.apple.inputmethod.Korean.2SetKorean; keys translated with com.apple.keylayout.2SetHangul).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 61.62 | 55.97 | [-1.61, 12.40] | 2.80 | undetermined (take more samples) |
| press_key x30 | 20 / 20 | 1089.97 | 969.30 | [9.65, 197.28] | 48.46 | slower |

## Acceptance 13-legacyLayers (clicks): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| coordinate click | 20 / 20 | 79.21 | 78.71 | [-14.11, 10.50] | 3.94 | undetermined (take more samples) |
| element click | 20 / 20 | 53.44 | 52.57 | [-1.63, 4.78] | 2.63 | undetermined (take more samples) |
| drag | 20 / 20 | 87.90 | 87.90 | [-14.05, 5.94] | 4.39 | undetermined (take more samples) |

The element clicks' routes: route 3 × 40.
