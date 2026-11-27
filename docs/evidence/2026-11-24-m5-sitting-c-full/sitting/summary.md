# Native matrix summary

Verdict: **FAIL**

Full matrix runs: 3 vendor, 3 cua (3 per side are the rule).
Device mode: shared (the default), recorded by every full run; hosted: 6 of 6 full runs.

## Blocking

- method: chrome/background/drag.select@textedit is worse on cua
- method: finder/background/typeText.typeSelect@electron is worse on cua (known defect #587)
- method: finder/background/typeText.typeSelect@textedit is worse on cua (known defect #587)
- method: finder/frontmost/typeText.typeSelect is worse on cua (known defect #587)

## Missing proof (no verdict)

- method: savePanel/frontmost/typeText.name has no cua sample with a valid vendor sample of its run (ruling 1116)
- concurrent use: textedit/concurrent.sheet@electron has no valid cua sample
- 61 cell(s) do not qualify: fewer than 3 complete run pairs (NO VERDICT by cell)
- speed: textedit/method.panel.typeText.search has no measure on one engine
- speed: textedit/method.savePanel.typeText.name has no measure on one engine

## Owner options (not run; not part of the verdict)

- TextEdit launch under the engine: provable in a scratch macOS user if wanted (launch textedit/background/launch@finder): on the shared Mac its first observation's screenshot would capture the owner's restored TextEdit windows or, with none to restore, TextEdit's iCloud Open panel; isolating it would change the owner's TextEdit state

## For the owner

- speed: electron/method.paste.replace missed the 10% beat (cua 112.7 ms against 121.9 ms, p95 118.8 against 123.2)
- speed: textedit/method.paste.replace missed the 10% beat (cua 48.6 ms against 39 ms, p95 71.9 against 121.8)
- speed: textedit/method.typeText.replace missed the 10% beat (cua 289.3 ms against 300.8 ms, p95 304.6 against 319.5)
- finding elements: parity on the resolved sum (the owner decides)

## The three points

- **Speed**: 63 of 68 measured ops beat the vendor by at least 10% with p95 not worse; 3 missed (the owner's fork), 2 unmeasured or not qualified.
- **Finding elements**: parity; resolved targets vendor 29, cua 29 of 40.
- **Not interfering**: cua 99.2% (361/364), vendor 99.1% (325/328); cua route-4 actions outside accepted families: 0; declared for the owner: 0.
- **What changes for a user**: 0 declared departure(s) (R3).
- **Concurrent use and intervention**: 3 of 5 rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).
- **Korean and Unicode**: 117 of 171 rows pass on cua; 54 perContext rows are not judged (below).
- **NO VERDICT**: 33 cua and 68 vendor sample(s) without a verdict; of them `alert` (an alert in front or key, or the alert guard's refusal): cua 0, vendor 0; `venue` (a frame split, or an input source the runner's setup could not enable, ruling 1189): cua 2, vendor 2; 61 of 419 cells do not qualify.

## By the lane that ran first (ruling 1226)

Runs by the lane that ran first in their run number: vendor first 4, cua first 2. Failed samples: 148 in vendor-first runs, 72 in cua-first runs; samples without a verdict: 268 and 153. Recorded, never judged.

| cell | engine | failed, vendor first | failed, cua first | no verdict, vendor first | no verdict, cua first |
|---|---|---|---|---|---|
| concurrent textedit/concurrent.sheet@electron | cua | 0 | 0 | 2 | 1 |
| concurrent textedit/concurrent.sheet@electron | vendor | 0 | 0 | 2 | 1 |
| intervention textedit/intervention.fires | vendor | 2 | 1 | 0 | 0 |
| intervention textedit/intervention.preAction | cua | 0 | 0 | 0 | 1 |
| intervention textedit/intervention.preAction | vendor | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | cua | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | vendor | 2 | 1 | 0 | 0 |
| method chrome/background/drag.select@textedit | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | vendor | 2 | 1 | 0 | 0 |
| method finder/background/typeText.typeSelect@electron | cua | 2 | 1 | 0 | 0 |
| method finder/background/typeText.typeSelect@textedit | cua | 2 | 1 | 0 | 0 |
| method finder/frontmost/typeText.typeSelect | cua | 2 | 1 | 0 | 0 |
| method openPanel/frontmost/typeText.search | cua | 0 | 0 | 2 | 1 |
| method openPanel/frontmost/typeText.search | vendor | 0 | 0 | 2 | 1 |
| method savePanel/frontmost/typeText.name | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | cua | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.savePanel.typeText.name | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/composing@textedit/paste.acceptance4 | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.combining | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.emoji | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.hangul | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.jamo | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.kanji | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.latin | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.lines | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.mixed | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.acceptance4 | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.combining | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.emoji | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.hangul | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.jamo | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.kanji | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.latin | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.lines | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.mixed | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/perContext@textedit/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode electron/composing@textedit/paste.acceptance4 | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.combining | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.emoji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.hangul | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.jamo | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.kanji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.latin | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.lines | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.mixed | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.acceptance4 | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.combining | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.emoji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.hangul | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.jamo | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.kanji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.latin | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.lines | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.mixed | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | vendor | 1 | 0 | 0 | 0 |
| unicode electron/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode electron/perContext@textedit/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/composing@electron/paste.acceptance4 | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.combining | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.emoji | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.hangul | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.jamo | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.kanji | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.latin | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.lines | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.mixed | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.acceptance4 | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.combining | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.emoji | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.hangul | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.jamo | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.kanji | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.latin | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.lines | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.mixed | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | cua | 2 | 0 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | cua | 1 | 0 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/perContext@electron/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.mixed | vendor | 0 | 0 | 2 | 1 |

## Speed (in-cell ms)

### textedit

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 90.2 | 192.0 | 61.5 | 82.3 | -31.8% | yes |
| getScreenshot | 100.6 | 309.4 | 65.8 | 89.1 | -34.6% | yes |
| listApps | 17.6 | 29.6 | 8.2 | 11.6 | -53.5% | yes |
| method.click.control | 835.8 | 837.9 | 112.5 | 115.2 | -86.5% | yes |
| method.click.element | 707.8 | 726.4 | 32.4 | 36.3 | -95.4% | yes |
| method.click.invalidIndex | 15.2 | 23.5 | 2.6 | 4.3 | -82.9% | yes |
| method.drag.select | 46.6 | 65.0 | 9.0 | 16.7 | -80.7% | yes |
| method.getAXState.tree | 109.2 | 124.4 | 66.0 | 66.1 | -39.6% | yes |
| method.listApps.running | 15.7 | 35.3 | 8.8 | 10.3 | -44% | yes |
| method.panel.click.cancel | 1037.0 | 1039.4 | 168.0 | 179.4 | -83.8% | yes |
| method.panel.getAXState.panel | 6312.6 | 6676.6 | 2541.9 | 4103.6 | -59.7% | yes |
| method.panel.pressKey.escape | 15.4 | 18.8 | 7.3 | 15.6 | -52.7% | yes |
| method.panel.typeText.search | - | - | - | - | - | unmeasured |
| method.paste.replace | 39.0 | 121.8 | 48.6 | 71.9 | +24.5% | **no** |
| method.performSecondaryAction.down | 518.6 | 532.3 | 8.2 | 10.3 | -98.4% | yes |
| method.pressKey.selectAll | 15.7 | 45.7 | 8.7 | 9.0 | -44.7% | yes |
| method.savePanel.pressKey.escape | 8.7 | 12.9 | 6.4 | 6.7 | -26.4% | yes |
| method.savePanel.setValue.name | 467.1 | 470.5 | 9.0 | 15.3 | -98.1% | yes |
| method.savePanel.typeText.name | - | - | - | - | - | unmeasured |
| method.scroll.down | 713.1 | 744.1 | 33.2 | 37.8 | -95.3% | yes |
| method.selectText.line | 98.3 | 151.2 | 13.3 | 18.7 | -86.5% | yes |
| method.selectText.notText | 17.5 | 20.0 | 3.5 | 5.9 | -80.1% | yes |
| method.setValue.document | 718.6 | 790.3 | 20.9 | 50.3 | -97.1% | yes |
| method.setValue.notSettable | 429.4 | 495.5 | 4.9 | 5.3 | -98.9% | yes |
| method.typeText.replace | 300.8 | 319.5 | 289.3 | 304.6 | -3.8% | **no** |

### finder

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 743.4 | 971.7 | 186.6 | 295.9 | -74.9% | yes |
| getScreenshot | 812.5 | 1154.8 | 188.2 | 340.0 | -76.8% | yes |
| listApps | 18.6 | 29.6 | 6.3 | 11.4 | -66% | yes |
| method.click.row | 254.7 | 260.0 | 7.9 | 19.8 | -96.9% | yes |
| method.getAXState.tree | 1007.8 | 1171.4 | 160.3 | 214.1 | -84.1% | yes |
| method.listApps.running | 22.1 | 27.7 | 6.6 | 8.9 | -70% | yes |
| method.performSecondaryAction.down | 1053.1 | 1087.4 | 11.0 | 15.0 | -99% | yes |
| method.pressKey.down | 21.5 | 24.7 | 4.7 | 7.4 | -78.2% | yes |
| method.scroll.down | 7939.6 | 8389.5 | 626.5 | 631.0 | -92.1% | yes |
| method.selectText.notText | 18.5 | 20.4 | 3.7 | 6.5 | -80% | yes |
| method.typeText.typeSelect | 110.5 | 122.7 | 32.5 | 46.6 | -70.6% | yes |

### chrome

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 188.6 | 383.4 | 62.3 | 86.0 | -66.9% | yes |
| getScreenshot | 180.6 | 325.4 | 65.7 | 108.3 | -63.6% | yes |
| listApps | 17.0 | 26.6 | 6.4 | 12.1 | -62.4% | yes |
| method.click.apply | 302.1 | 329.2 | 8.8 | 18.1 | -97.1% | yes |
| method.click.checkbox | 523.9 | 584.4 | 14.0 | 16.0 | -97.3% | yes |
| method.click.pointerdown | 336.9 | 374.7 | 10.8 | 13.3 | -96.8% | yes |
| method.drag.select | 82.1 | 151.9 | 8.0 | 9.8 | -90.3% | yes |
| method.getAXState.tree | 205.1 | 256.6 | 53.9 | 78.2 | -73.7% | yes |
| method.listApps.running | 23.3 | 31.5 | 6.7 | 12.5 | -71.3% | yes |
| method.paste.replace | 135.1 | 290.7 | 100.8 | 105.0 | -25.4% | yes |
| method.pressKey.tab | 27.2 | 40.1 | 6.2 | 7.3 | -77.3% | yes |
| method.selectText.name | 240.4 | 337.2 | 7.7 | 12.6 | -96.8% | yes |
| method.selectText.notText | 14.9 | 18.0 | 5.6 | 6.4 | -62.8% | yes |
| method.setValue.name | 240.3 | 258.6 | 9.9 | 12.9 | -95.9% | yes |
| method.setValue.notSettable | 768.1 | 825.1 | 4.8 | 8.3 | -99.4% | yes |
| method.typeText.replace | 355.3 | 401.4 | 180.7 | 220.6 | -49.1% | yes |

### electron

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 79.6 | 123.6 | 30.1 | 60.5 | -62.2% | yes |
| getScreenshot | 98.7 | 180.1 | 35.4 | 57.9 | -64.1% | yes |
| listApps | 18.0 | 26.7 | 7.8 | 12.9 | -56.7% | yes |
| method.click.button | 452.9 | 486.1 | 13.2 | 21.4 | -97.1% | yes |
| method.click.point | 239.7 | 257.9 | 13.6 | 18.3 | -94.3% | yes |
| method.click.pointerdown | 733.4 | 847.7 | 13.8 | 14.2 | -98.1% | yes |
| method.click.selection | 256.5 | 260.2 | 15.4 | 20.4 | -94% | yes |
| method.drag.select | 41.8 | 43.2 | 9.8 | 11.5 | -76.5% | yes |
| method.getAXState.tree | 100.2 | 118.3 | 41.0 | 50.2 | -59.1% | yes |
| method.listApps.running | 24.9 | 26.7 | 6.8 | 11.8 | -72.6% | yes |
| method.paste.replace | 121.9 | 123.2 | 112.7 | 118.8 | -7.6% | **no** |
| method.pressKey.tab | 13.9 | 13.9 | 6.8 | 8.7 | -51.1% | yes |
| method.selectText.text | 239.6 | 258.9 | 8.7 | 9.7 | -96.4% | yes |
| method.setValue.notSettable | 667.9 | 668.1 | 7.5 | 10.4 | -98.9% | yes |
| method.setValue.text | 330.9 | 400.4 | 164.9 | 173.1 | -50.2% | yes |
| method.typeText.replace | 369.7 | 424.6 | 193.9 | 203.9 | -47.6% | yes |

## Finding elements

| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |
|---|---|---|---|---|---|---|
| textedit | 5/10 | 5/10 | 0.4561 | 0.4561 | 1 | 1 |
| finder | 4/10 | 4/10 | 0.3447 | 0.3465 | 2 | 2 |
| chrome | 10/10 | 10/10 | 0.7813 | 0.7813 | 0 | 0 |
| electron | 10/10 | 10/10 | 0.7857000000000001 | 0.7857000000000001 | 0 | 0 |

## Not interfering

The background, launch, concurrent-use and behind-a-user-window Unicode rows with a verdict, by the oracle (the front app, the top window, the focus, activations, the route).

- cua: 99.2% (361/364); failed: electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window)
- vendor: 99.1% (325/328); failed: electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window)

- User windows to the top (ruling 1221): chrome cua waited 45, raised 0, raise failed 0; chrome vendor waited 45, raised 0, raise failed 0; electron cua waited 0, raised 24, raise failed 0; electron vendor waited 0, raised 24, raise failed 0; finder cua waited 87, raised 0, raise failed 0; finder vendor waited 48, raised 39, raise failed 0; textedit cua waited 38, raised 28, raise failed 0; textedit vendor waited 39, raised 27, raise failed 0; not ok after a raise: vendor textedit/intervention.fires, vendor textedit/intervention.fires, vendor textedit/intervention.fires, cua finder/background/typeText.typeSelect@textedit, cua finder/background/typeText.typeSelect@electron, cua finder/background/typeText.typeSelect@textedit, cua finder/background/typeText.typeSelect@electron, cua textedit/intervention.preAction, cua finder/background/typeText.typeSelect@textedit, cua finder/background/typeText.typeSelect@electron.
- R3's witness (ruling 1225): the control seen in 6 of 6 runs; 0 row(s) NO VERDICT on it.
- electron/background/launch@finder: both engines failed; nothing of the person's moved (a target window above the user's): the venue's, not judged on its recorded evidence (below) (rulings 1219 and 1222)

## What changes for a user

The places where cua refuses or answers unconfirmed where the vendor answered ok (R3), each declared with its Decision Log entry; nothing else can be here.

- unicode textedit/latin/typeText.emoji: the vendor answered ok with other text (a false ok), cua answered unconfirmed (typeUnconfirmed) in 2 sample(s): better, no entry needed
- unicode textedit/latin/typeText.hangul: the vendor answered ok with other text (a false ok), cua answered unconfirmed (typeUnconfirmed) in 1 sample(s): better, no entry needed
- unicode electron/korean/pressKey.rk: judged against ruling 1119's oracle 가 on each engine (ruling 1219): cua read it in 1 sample(s), the vendor composed otherwise in 1; a declared departure where cua is right, the vendor's own failure and no cua block

## Not judged

What a ruling put out of the judged matrix: it runs and is reported, and counts as neither pass nor fail, nor as missing proof. Each entry names its reason and its ticket or the recorded evidence it rests on (ruling 1222); one with neither is missing proof instead. For rows, cua ok/valid, then the vendor's; "not recorded" where that lane has no sample of the row, which is distinct from an invalid sample.

### perContext

out of M5's judged matrix (ruling 1119, #185): a stored per-context preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference forbids

Ticket: #577.

Of the invalid samples, `venue` (an input source the runner's setup could not enable, ruling 1189, or the sources enabled and the per-context context not reading Korean after its reactivation, #577): cua 162, vendor 162.

| row | cua ok | vendor ok |
|---|---|---|
| chrome/perContext@textedit/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### openPanelSearch

out of M5's judged matrix (ruling 1222): typeText into the Open panel's search field is a known product defect, #588, run and reported until it is fixed

Ticket: #588.

| row | cua ok | vendor ok |
|---|---|---|
| openPanel/frontmost/typeText.search | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### Shared not-interfering failures

Cells where a cua sample failed not interfering with its own paired vendor sample (rulings 1219 and 1222): a product defect both engines share, with its ticket, or the venue's, on the evidence recorded.

| row | reason | ticket or evidence | samples |
|---|---|---|---|
| electron/background/launch@finder | cua failed not interfering with its paired vendor sample, and nothing of the person's moved (a target window above the user's): the venue's (rulings 1219 and 1222) | evidence: cua run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; vendor run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; cua run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; vendor run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; cua run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after; vendor run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after | 3 |

## NO VERDICT by cell

Each judged cell with a sample without a verdict, or with fewer than 3 complete run pairs (the triple's requirement: runs whose pair is one proof, both sides holding the planned samples, every one with a verdict), which does not qualify and is missing proof. A sample without a verdict is never a pass and never a fail. Its causes: unread, front/key readings missing (hosted) or unread, or the alert guard could not read the alert windows' bounds; activation, the activate step did not take front and key; alert, an app other than the cell's front or key (an alert), or the alert guard refused the cell unsent (an alert over the run's window, or holding the front or key); venue, the run's vendor and cua runs did not stand on one frame (ruling 1169): no sample of that run, on either side, is judged; or an input source the row selects that the runner's setup could not enable (ruling 1189), or a hosted runner's per-context preference read malformed, a baseline no restore could put back, so nothing was written; keyWindow, a click or key cell refused unsent because its scene's app did not hold the window the cell acts in as its own key window (ruling 1169's addition); ownerInput, off a GitHub-hosted runner, the owner's input source or per-context preference was not the row's, and the harness never changes them there (ruling 1188); ownerSitting, a pointer cell on the Open panel a hosted runner left unsent, the panel's x clamped short of the strip left of the capture alerts: the owner's sitting judges it (ruling 1203); invalid, the harness's own invalid reason; unmeasured, a speed or finding sample not measured (no numeric duration); unpaired, no vendor sample with a verdict from the same eligible run (ruling 1116); for speed and finding, outside the complete run pairs; vendorStopped, a cua sample judged against the vendor's whose vendor sample was never run, the vendor's run having stopped part-way before it (ruling 1214): the missing proof is the vendor's, never cua's failure; reference, the vendor's sample of the run could not be the reference (ruling 1168's pointerdown cell: the vendor's click did not raise the count by exactly one). Vendor and cua runs are each side's runs every sample of which has a verdict (diagnostics); by run, the samples with a verdict of the samples the run holds.

| cell | verdict | complete pairs | vendor runs | cua runs | vendor by run | cua by run | vendor no verdict | cua no verdict | qualifies |
|---|---|---|---|---|---|---|---|---|---|
| method savePanel/frontmost/typeText.name | **no verdict** | 0 of 3 | 0 | 0 | r1 0/1, r2 0/1, r3 0/1 | r1 0/1, r2 0/1, r3 0/1 | invalid 3 | unpaired 3 | no |
| method openPanel/background/getAXState.panel@finder | **no verdict** | 2 of 3 | 2 | 2 | r1 1/1, r2 0/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | venue 1 | venue 1 | no |
| method openPanel/background/click.cancel@finder | **no verdict** | 2 of 3 | 2 | 2 | r1 1/1, r2 0/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | venue 1 | venue 1 | no |
| speed textedit/method.panel.typeText.search | **no verdict** | 0 of 3 | 0 | 0 | r1 0/1, r2 0/1, r3 0/1 | r1 0/1, r2 0/1, r3 0/1 | invalid 3 | invalid 3 | no |
| speed textedit/method.savePanel.typeText.name | **no verdict** | 0 of 3 | 0 | 0 | r1 0/1, r2 0/1, r3 0/1 | r1 0/1, r2 0/1, r3 0/1 | invalid 3 | unpaired 3 | no |
| concurrent textedit/concurrent.sheet@electron | **no verdict** | 0 of 3 | 0 | 0 | r1 0/1, r2 0/1, r3 0/1 | r1 0/1, r2 0/1, r3 0/1 | invalid 3 | invalid 3 | no |
| intervention textedit/intervention.preAction | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode textedit/composing@electron/typeText.latin | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.latin | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.hangul | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.hangul | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.jamo | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.jamo | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.mixed | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.mixed | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.emoji | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.emoji | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.combining | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.combining | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.kanji | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.kanji | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.lines | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.lines | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/typeText.acceptance4 | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode textedit/composing@electron/paste.acceptance4 | **no verdict** | 1 of 3 | 1 | 3 | r1 1/1, r2 0/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 2 | - | no |
| unicode chrome/composing@textedit/typeText.latin | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.latin | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.hangul | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.hangul | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.jamo | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.jamo | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.mixed | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.mixed | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.emoji | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.emoji | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.combining | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.combining | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.kanji | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.kanji | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.lines | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.lines | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/typeText.acceptance4 | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode chrome/composing@textedit/paste.acceptance4 | **no verdict** | 2 of 3 | 2 | 3 | r1 1/1, r2 1/1, r3 0/1 | r1 1/1, r2 1/1, r3 1/1 | invalid 1 | - | no |
| unicode electron/composing@textedit/typeText.latin | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.latin | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.hangul | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.hangul | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.jamo | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.jamo | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.mixed | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.mixed | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.emoji | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.emoji | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.combining | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.combining | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.kanji | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.kanji | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.lines | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.lines | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/typeText.acceptance4 | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |
| unicode electron/composing@textedit/paste.acceptance4 | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | - | invalid 1 | no |

## Methods

| method | textedit | finder | chrome | electron | openPanel | savePanel | windowless |
|---|---|---|---|---|---|---|---|
| get_app_state | F better / B better | F better / B better | F better / B better | F better / B better | F better / B no verdict | n/a | B better |
| list_apps | F better / B better | F better / B better | F better / B better | F better / B better | n/a | n/a | n/a |
| click | F better / B better | F better / B better | F better / B better | F better / B better | F better / B no verdict | n/a | n/a |
| drag | F better / B better | n/a | F better / B worse | F better / B better | n/a | n/a | n/a |
| paste | F better / B better | n/a | F better / B better | F better / B better | n/a | n/a | n/a |
| perform_secondary_action | F better / B better | F better / B better | n/a | n/a | n/a | n/a | n/a |
| press_key | F better / B better | F better / B better | F better / B better | F better / B better | F better | F better | n/a |
| scroll | F better / B better | F better / B better | n/a | n/a | n/a | n/a | n/a |
| select_text | F better / B better | F better / B better | F better / B better | F better / B better | n/a | n/a | n/a |
| set_value | F better / B better | n/a | F better / B better | F better / B better | n/a | F better | n/a |
| type_text | F better / B better | F worse / B worse | F better / B better | F better / B better | not run | F no verdict | n/a |

F: frontmost regime (the vendor's outcome is the reference, sample for sample); B: background regime (the fixture's ground truth). n/a: no meaningful target on that scene, on both engines:

- finder set_value: a value written into a file's name field renames a run file, and the scene's other cases and targets read those names
- finder drag: a drag in Finder's list moves run files or starts a rubber band whose outcome follows the pointer's path
- finder paste: Finder pastes files, not text, into a folder
- chrome scroll: the scene page fits its window: nothing to scroll
- chrome perform_secondary_action: no control on the scene page advertises a secondary action (the window's Raise would reorder it over the user's)
- electron scroll: the fixture's list of six fits its box: nothing to scroll
- electron perform_secondary_action: no control in the fixture advertises a secondary action
- openPanel list_apps: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel drag: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel paste: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel perform_secondary_action: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel scroll: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel select_text: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- openPanel set_value: the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner's files, so nothing in its listing is selected, scrolled or written
- savePanel get_app_state: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel list_apps: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel click: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel drag: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel paste: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel perform_secondary_action: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel scroll: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- savePanel select_text: the Save sheet's cells are its Escape, its name field's typing (ruling 1196) and its name field's setValue (ruling 1204); it is never saved
- windowless list_apps: an app with no window refuses its observation, so no element exists for any other method
- windowless click: an app with no window refuses its observation, so no element exists for any other method
- windowless drag: an app with no window refuses its observation, so no element exists for any other method
- windowless paste: an app with no window refuses its observation, so no element exists for any other method
- windowless perform_secondary_action: an app with no window refuses its observation, so no element exists for any other method
- windowless press_key: an app with no window refuses its observation, so no element exists for any other method
- windowless scroll: an app with no window refuses its observation, so no element exists for any other method
- windowless select_text: an app with no window refuses its observation, so no element exists for any other method
- windowless set_value: an app with no window refuses its observation, so no element exists for any other method
- windowless type_text: an app with no window refuses its observation, so no element exists for any other method

| row | verdict | vendor ok | cua ok | vendor route | cua route |
|---|---|---|---|---|---|
| chrome/background/click.apply@textedit | equal | 3/3 | 3/3 | - | 3 |
| chrome/background/click.checkbox@textedit | equal | 3/3 | 3/3 | - | 3 |
| chrome/background/drag.select@textedit | **worse** | 3/3 | 0/3 | - | 3 |
| chrome/background/getAXState.tree@textedit | equal | 3/3 | 3/3 | - | - |
| chrome/background/listApps.running@textedit | equal | 3/3 | 3/3 | - | - |
| chrome/background/paste.replace@textedit | equal | 3/3 | 3/3 | - | paste |
| chrome/background/pressKey.tab@textedit | equal | 3/3 | 3/3 | - | 2' |
| chrome/background/selectText.name@textedit | equal | 3/3 | 3/3 | - | 3 |
| chrome/background/selectText.notText@textedit | equal | 3/3 | 3/3 | - | 1 |
| chrome/background/setValue.name@textedit | equal | 3/3 | 3/3 | - | 3 |
| chrome/background/setValue.notSettable@textedit | equal | 3/3 | 3/3 | - | 1 |
| chrome/background/typeText.replace@textedit | equal | 3/3 | 3/3 | - | 2' |
| chrome/frontmost/click.apply | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/click.checkbox | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/click.pointerdown | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/drag.select | equal | 3/3 | 3/3 | - | 3 |
| chrome/frontmost/getAXState.tree | equal | 3/3 | 3/3 | - | - |
| chrome/frontmost/listApps.running | equal | 3/3 | 3/3 | - | - |
| chrome/frontmost/paste.replace | equal | 3/3 | 3/3 | - | paste |
| chrome/frontmost/pressKey.tab | equal | 3/3 | 3/3 | - | 2' |
| chrome/frontmost/selectText.name | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/selectText.notText | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/setValue.name | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/setValue.notSettable | equal | 3/3 | 3/3 | - | 1 |
| chrome/frontmost/typeText.replace | equal | 3/3 | 3/3 | - | 2' |
| electron/background/click.button@finder | equal | 3/3 | 3/3 | - | 3 |
| electron/background/drag.select@finder | equal | 3/3 | 3/3 | - | 3 |
| electron/background/getAXState.tree@finder | equal | 3/3 | 3/3 | - | - |
| electron/background/listApps.running@finder | equal | 3/3 | 3/3 | - | - |
| electron/background/paste.replace@finder | equal | 3/3 | 3/3 | - | paste |
| electron/background/pressKey.tab@finder | equal | 3/3 | 3/3 | - | 2' |
| electron/background/selectText.text@finder | equal | 3/3 | 3/3 | - | 3 |
| electron/background/setValue.notSettable@finder | equal | 3/3 | 3/3 | - | 1 |
| electron/background/setValue.text@finder | equal | 3/3 | 3/3 | - | 1 |
| electron/background/typeText.replace@finder | equal | 3/3 | 3/3 | - | 2' |
| electron/frontmost/click.button | equal | 3/3 | 3/3 | - | 1 |
| electron/frontmost/click.point | equal | 0/3 | 0/3 | - | 3 |
| electron/frontmost/click.pointerdown | equal | 3/3 | 3/3 | - | 1 |
| electron/frontmost/click.selection | equal | 3/3 | 3/3 | - | 2' |
| electron/frontmost/drag.select | equal | 3/3 | 3/3 | - | 3 |
| electron/frontmost/getAXState.tree | equal | 3/3 | 3/3 | - | - |
| electron/frontmost/listApps.running | equal | 3/3 | 3/3 | - | - |
| electron/frontmost/paste.replace | equal | 3/3 | 3/3 | - | paste |
| electron/frontmost/pressKey.tab | equal | 3/3 | 3/3 | - | 2' |
| electron/frontmost/selectText.text | equal | 3/3 | 3/3 | - | 1 |
| electron/frontmost/setValue.notSettable | equal | 3/3 | 3/3 | - | 1 |
| electron/frontmost/setValue.text | equal | 3/3 | 3/3 | - | 1 |
| electron/frontmost/typeText.replace | equal | 3/3 | 3/3 | - | 2' |
| finder/background/click.row@electron | equal | 3/3 | 3/3 | - | 3 |
| finder/background/click.row@textedit | equal | 3/3 | 3/3 | - | 3 |
| finder/background/getAXState.tree@electron | equal | 3/3 | 3/3 | - | - |
| finder/background/getAXState.tree@textedit | equal | 3/3 | 3/3 | - | - |
| finder/background/listApps.running@electron | equal | 3/3 | 3/3 | - | - |
| finder/background/listApps.running@textedit | equal | 3/3 | 3/3 | - | - |
| finder/background/performSecondaryAction.down@electron | equal | 3/3 | 3/3 | - | 3 |
| finder/background/performSecondaryAction.down@textedit | equal | 3/3 | 3/3 | - | 3 |
| finder/background/pressKey.down@electron | equal | 3/3 | 3/3 | - | 2' |
| finder/background/pressKey.down@textedit | equal | 3/3 | 3/3 | - | 2' |
| finder/background/scroll.down@electron | equal | 3/3 | 3/3 | - | 2' |
| finder/background/scroll.down@textedit | equal | 3/3 | 3/3 | - | 2' |
| finder/background/selectText.notText@electron | equal | 3/3 | 3/3 | - | 1 |
| finder/background/selectText.notText@textedit | equal | 3/3 | 3/3 | - | 1 |
| finder/background/typeText.typeSelect@electron | **worse** | 3/3 | 0/3 | - | 2' |
| finder/background/typeText.typeSelect@textedit | **worse** | 3/3 | 0/3 | - | 2' |
| finder/frontmost/click.row | equal | 3/3 | 3/3 | - | 3 |
| finder/frontmost/getAXState.tree | equal | 3/3 | 3/3 | - | - |
| finder/frontmost/listApps.running | equal | 3/3 | 3/3 | - | - |
| finder/frontmost/performSecondaryAction.down | equal | 3/3 | 3/3 | - | 1 |
| finder/frontmost/pressKey.down | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/scroll.down | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/selectText.notText | equal | 3/3 | 3/3 | - | 1 |
| finder/frontmost/typeText.typeSelect | **worse** | 3/3 | 0/3 | - | 2' |
| openPanel/background/click.cancel@finder | **no verdict** | 2/2 (+1 no verdict) | 2/2 (+1 no verdict) | - | 3 |
| openPanel/background/getAXState.panel@finder | **no verdict** | 2/2 (+1 no verdict) | 2/2 (+1 no verdict) | - | - |
| openPanel/frontmost/click.cancel | equal | 3/3 | 3/3 | - | 1 |
| openPanel/frontmost/getAXState.panel | equal | 3/3 | 3/3 | - | - |
| openPanel/frontmost/pressKey.escape | equal | 3/3 | 3/3 | - | 2' |
| savePanel/frontmost/pressKey.escape | equal | 3/3 | 3/3 | - | 2' |
| savePanel/frontmost/setValue.name | equal | 3/3 | 3/3 | - | 1 |
| savePanel/frontmost/typeText.name | **no verdict** | 0/0 (+3 no verdict) | 0/0 (+3 no verdict) |  | 2' |
| textedit/background/click.control@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/click.control@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/click.element@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/click.element@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/click.invalidIndex@chrome | equal | 3/3 | 3/3 | - | - |
| textedit/background/click.invalidIndex@finder | equal | 3/3 | 3/3 | - | - |
| textedit/background/drag.select@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/drag.select@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/getAXState.tree@chrome | equal | 3/3 | 3/3 | - | - |
| textedit/background/getAXState.tree@finder | equal | 3/3 | 3/3 | - | - |
| textedit/background/listApps.running@chrome | equal | 3/3 | 3/3 | - | - |
| textedit/background/listApps.running@finder | equal | 3/3 | 3/3 | - | - |
| textedit/background/paste.replace@chrome | equal | 3/3 | 3/3 | - | paste |
| textedit/background/paste.replace@finder | equal | 3/3 | 3/3 | - | paste |
| textedit/background/performSecondaryAction.down@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/performSecondaryAction.down@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/pressKey.selectAll@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/pressKey.selectAll@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/scroll.down@chrome | equal | 3/3 | 3/3 | - | 2' |
| textedit/background/scroll.down@finder | equal | 3/3 | 3/3 | - | 2' |
| textedit/background/selectText.line@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/selectText.line@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/selectText.notText@chrome | equal | 3/3 | 3/3 | - | 1 |
| textedit/background/selectText.notText@finder | equal | 3/3 | 3/3 | - | 1 |
| textedit/background/setValue.document@chrome | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/setValue.document@finder | equal | 3/3 | 3/3 | - | 3 |
| textedit/background/setValue.notSettable@chrome | equal | 3/3 | 3/3 | - | 1 |
| textedit/background/setValue.notSettable@finder | equal | 3/3 | 3/3 | - | 1 |
| textedit/background/typeText.replace@chrome | equal | 3/3 | 3/3 | - | 2' |
| textedit/background/typeText.replace@finder | equal | 3/3 | 3/3 | - | 2' |
| textedit/frontmost/click.control | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/click.element | equal | 3/3 | 3/3 | - | 3 |
| textedit/frontmost/click.invalidIndex | equal | 3/3 | 3/3 | - | - |
| textedit/frontmost/drag.select | equal | 3/3 | 3/3 | - | 3 |
| textedit/frontmost/getAXState.tree | equal | 3/3 | 3/3 | - | - |
| textedit/frontmost/listApps.running | equal | 3/3 | 3/3 | - | - |
| textedit/frontmost/paste.replace | equal | 3/3 | 3/3 | - | paste |
| textedit/frontmost/performSecondaryAction.down | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/pressKey.selectAll | equal | 3/3 | 3/3 | - | 2' |
| textedit/frontmost/scroll.down | equal | 3/3 | 3/3 | - | 2' |
| textedit/frontmost/selectText.line | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/selectText.notText | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/setValue.document | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/setValue.notSettable | equal | 3/3 | 3/3 | - | 1 |
| textedit/frontmost/typeText.replace | equal | 3/3 | 3/3 | - | 2' |
| windowless/background/getAXState.noWindow@finder | equal | 3/3 | 3/3 | - | - |

## Launch path

| row | verdict | vendor ok | cua ok |
|---|---|---|---|
| electron/background/launch@finder | equal | 3/3 | 3/3 |

## Concurrent use and intervention

Each row against its own outcome (the user's keystroke kept, userIntervened, the refusal); the vendor's recorded beside it.

| row | verdict | vendor ok | cua ok |
|---|---|---|---|
| chrome/concurrent@textedit | equal | 3/3 | 3/3 |
| finder/concurrent@textedit | equal | 3/3 | 3/3 |
| textedit/concurrent.sheet@electron | **no verdict** | 0/0 (+3 no verdict) | 0/0 (+3 no verdict) |
| textedit/intervention.fires | better | 0/3 | 3/3 |
| textedit/intervention.preAction | **no verdict** | 0/3 | 2/2 (+1 no verdict) |

## Korean and Unicode

Each field's cell: cua ok/valid, then the vendor's; a cua row that failed is marked. Read back by SHA-256 against the text expected: the string sent, and for pressKey r k, rk under Latin and 가 under Korean 2-Set (ruling 1119).

### latin

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.combining | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.emoji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.hangul | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.jamo | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.kanji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.lines | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.mixed | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| pressKey.rk | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.acceptance4 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.combining | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.emoji | 1/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.hangul | 2/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.jamo | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.kanji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.lines | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.mixed | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

### midSwitch

| row | textedit | chrome | electron |
|---|---|---|---|
| typeText.long | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

### korean

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.combining | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.emoji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.hangul | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.jamo | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.kanji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.lines | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.mixed | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| pressKey.rk | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 2/3 |
| typeText.acceptance4 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.combining | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.emoji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.hangul | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.jamo | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.kanji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.lines | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.mixed | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

### composing (user window: chrome@textedit, electron@textedit, textedit@electron)

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.combining | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.emoji | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.hangul | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.jamo | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.kanji | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.latin | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.lines | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| paste.mixed | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| typeText.acceptance4 | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.combining | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.emoji | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.hangul | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.jamo | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| typeText.kanji | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.latin | 3/3 · 1/1 | 3/3 · 2/2 | 2/2 · 3/3 |
| typeText.lines | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |
| typeText.mixed | 3/3 · 0/1 | 3/3 · 0/2 | 2/2 · 0/3 |

