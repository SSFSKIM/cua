# Acceptance 12 and 13: the recorded series (arms, the owner's input source), not judged

The same rule's numbers for each series, for the design session; no verdict on the acceptance item comes from them.

## Acceptance 12-fps60 (typing): recorded (the rule would say fail)

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 571.31 | 566.52 | [-24.84, 21.63] | 28.33 | same within noise |
| press_key x30 | 20 / 20 | 302.57 | 296.52 | [-29.76, 44.20] | 14.83 | undetermined (take more samples) |

Signposts (coverage-12-fps60.json): complete, every one of 40 samples has engine signposts.

The fps60 cap, from the cursor probe's glides before the series: default 119.8 Hz (a frame every 8.3 ms), fps60 118.9 Hz (every 8.3 ms); rock 120 against 120 Hz: **not capped** (the capped glides composited a frame every 8.3 ms (118.9 Hz), under 14 ms apart).
