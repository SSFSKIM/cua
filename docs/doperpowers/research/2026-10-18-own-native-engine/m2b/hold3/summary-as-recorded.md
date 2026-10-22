# Native matrix summary

Verdict: **FAIL**

Full matrix runs: 1 vendor, 2 cua (3 per side are the rule).

## Blocking

- method: chrome/frontmost/selectText.notText is worse on cua
- finding elements: finder is lower on cua
- not interfering: finder/concurrent@textedit failed on cua
- not interfering: chrome/concurrent@textedit failed on cua
- not interfering: electron/background/launch@finder failed on cua
- not interfering: finder/concurrent@textedit failed on cua
- not interfering: chrome/concurrent@textedit failed on cua
- not interfering: electron/background/launch@finder failed on cua
- unicode: chrome/composing@textedit/paste.acceptance4 failed on cua
- unicode: chrome/composing@textedit/paste.combining failed on cua
- unicode: chrome/composing@textedit/paste.emoji failed on cua
- unicode: chrome/composing@textedit/paste.hangul failed on cua
- unicode: chrome/composing@textedit/paste.jamo failed on cua
- unicode: chrome/composing@textedit/paste.kanji failed on cua
- unicode: chrome/composing@textedit/paste.latin failed on cua
- unicode: chrome/composing@textedit/paste.lines failed on cua
- unicode: chrome/composing@textedit/paste.mixed failed on cua
- unicode: chrome/composing@textedit/typeText.acceptance4 failed on cua
- unicode: chrome/composing@textedit/typeText.combining failed on cua
- unicode: chrome/composing@textedit/typeText.emoji failed on cua
- unicode: chrome/composing@textedit/typeText.hangul failed on cua
- unicode: chrome/composing@textedit/typeText.jamo failed on cua
- unicode: chrome/composing@textedit/typeText.kanji failed on cua
- unicode: chrome/composing@textedit/typeText.latin failed on cua
- unicode: chrome/composing@textedit/typeText.lines failed on cua
- unicode: chrome/composing@textedit/typeText.mixed failed on cua
- unicode: chrome/korean/pressKey.rk failed on cua
- unicode: chrome/korean/typeText.lines failed on cua
- unicode: chrome/midSwitch/typeText.long failed on cua
- unicode: electron/korean/pressKey.rk failed on cua
- unicode: electron/midSwitch/typeText.long failed on cua
- unicode: textedit/korean/pressKey.rk failed on cua

## Missing proof (no verdict)

- run 2 has no vendor full run: its samples cannot be compared with cua's
- runs: 0 complete, attested full matrix run(s) on vendor, 3 are the rule
- runs: 1 complete, attested full matrix run(s) on cua, 3 are the rule
- /Users/new/Developer/GitHub/cua-117-m2b/docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold3/matrix/cua/run-2: matrix is incomplete (the put-back did not hold)
- /Users/new/Developer/GitHub/cua-117-m2b/docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold3/matrix/vendor/run-1: matrix is incomplete (the put-back did not hold)
- method: chrome/background/click.apply@textedit has no valid cua sample
- method: chrome/background/click.checkbox@textedit has no valid cua sample
- method: chrome/background/drag.select@textedit has no valid cua sample
- method: chrome/background/getAXState.tree@textedit has no valid cua sample
- method: chrome/background/listApps.running@textedit has no valid cua sample
- method: chrome/background/paste.replace@textedit has no valid cua sample
- method: chrome/background/pressKey.tab@textedit has no valid cua sample
- method: chrome/background/selectText.name@textedit has no valid cua sample
- method: chrome/background/selectText.notText@textedit has no valid cua sample
- method: chrome/background/setValue.name@textedit has no valid cua sample
- method: chrome/background/setValue.notSettable@textedit has no valid cua sample
- method: chrome/background/typeText.replace@textedit has no valid cua sample
- method: chrome/frontmost/drag.select has no valid cua sample
- method: electron/background/paste.replace@finder has no valid cua sample
- method: electron/background/pressKey.tab@finder has no valid cua sample
- method: electron/background/typeText.replace@finder has no valid cua sample
- method: electron/frontmost/paste.replace has no valid cua sample
- method: finder/background/click.row@electron has no valid cua sample
- method: finder/background/click.row@textedit has no valid cua sample
- method: finder/background/getAXState.tree@electron has no valid cua sample
- method: finder/background/getAXState.tree@textedit has no valid cua sample
- method: finder/background/listApps.running@electron has no valid cua sample
- method: finder/background/listApps.running@textedit has no valid cua sample
- method: finder/background/performSecondaryAction.down@electron has no valid cua sample
- method: finder/background/performSecondaryAction.down@textedit has no valid cua sample
- method: finder/background/pressKey.down@electron has no valid cua sample
- method: finder/background/pressKey.down@textedit has no valid cua sample
- method: finder/background/scroll.down@electron has no valid cua sample
- method: finder/background/scroll.down@textedit has no valid cua sample
- method: finder/background/selectText.notText@electron has no valid cua sample
- method: finder/background/selectText.notText@textedit has no valid cua sample
- method: finder/background/typeText.typeSelect@electron has no valid cua sample
- method: finder/background/typeText.typeSelect@textedit has no valid cua sample
- concurrent use: textedit/concurrent.sheet@electron has no valid cua sample
- intervention: textedit/intervention.fires has no valid cua sample
- intervention: textedit/intervention.preAction has no valid cua sample
- unicode: chrome/perContext@textedit/paste.acceptance4 has no valid cua sample
- unicode: chrome/perContext@textedit/paste.combining has no valid cua sample
- unicode: chrome/perContext@textedit/paste.emoji has no valid cua sample
- unicode: chrome/perContext@textedit/paste.hangul has no valid cua sample
- unicode: chrome/perContext@textedit/paste.jamo has no valid cua sample
- unicode: chrome/perContext@textedit/paste.kanji has no valid cua sample
- unicode: chrome/perContext@textedit/paste.latin has no valid cua sample
- unicode: chrome/perContext@textedit/paste.lines has no valid cua sample
- unicode: chrome/perContext@textedit/paste.mixed has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.acceptance4 has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.combining has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.emoji has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.hangul has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.jamo has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.kanji has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.latin has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.lines has no valid cua sample
- unicode: chrome/perContext@textedit/typeText.mixed has no valid cua sample
- unicode: electron/perContext@textedit/paste.acceptance4 has no valid cua sample
- unicode: electron/perContext@textedit/paste.combining has no valid cua sample
- unicode: electron/perContext@textedit/paste.emoji has no valid cua sample
- unicode: electron/perContext@textedit/paste.hangul has no valid cua sample
- unicode: electron/perContext@textedit/paste.jamo has no valid cua sample
- unicode: electron/perContext@textedit/paste.kanji has no valid cua sample
- unicode: electron/perContext@textedit/paste.latin has no valid cua sample
- unicode: electron/perContext@textedit/paste.lines has no valid cua sample
- unicode: electron/perContext@textedit/paste.mixed has no valid cua sample
- unicode: electron/perContext@textedit/typeText.acceptance4 has no valid cua sample
- unicode: electron/perContext@textedit/typeText.combining has no valid cua sample
- unicode: electron/perContext@textedit/typeText.emoji has no valid cua sample
- unicode: electron/perContext@textedit/typeText.hangul has no valid cua sample
- unicode: electron/perContext@textedit/typeText.jamo has no valid cua sample
- unicode: electron/perContext@textedit/typeText.kanji has no valid cua sample
- unicode: electron/perContext@textedit/typeText.latin has no valid cua sample
- unicode: electron/perContext@textedit/typeText.lines has no valid cua sample
- unicode: electron/perContext@textedit/typeText.mixed has no valid cua sample
- unicode: textedit/perContext@electron/paste.acceptance4 has no valid cua sample
- unicode: textedit/perContext@electron/paste.combining has no valid cua sample
- unicode: textedit/perContext@electron/paste.emoji has no valid cua sample
- unicode: textedit/perContext@electron/paste.hangul has no valid cua sample
- unicode: textedit/perContext@electron/paste.jamo has no valid cua sample
- unicode: textedit/perContext@electron/paste.kanji has no valid cua sample
- unicode: textedit/perContext@electron/paste.latin has no valid cua sample
- unicode: textedit/perContext@electron/paste.lines has no valid cua sample
- unicode: textedit/perContext@electron/paste.mixed has no valid cua sample
- unicode: textedit/perContext@electron/typeText.acceptance4 has no valid cua sample
- unicode: textedit/perContext@electron/typeText.combining has no valid cua sample
- unicode: textedit/perContext@electron/typeText.emoji has no valid cua sample
- unicode: textedit/perContext@electron/typeText.hangul has no valid cua sample
- unicode: textedit/perContext@electron/typeText.jamo has no valid cua sample
- unicode: textedit/perContext@electron/typeText.kanji has no valid cua sample
- unicode: textedit/perContext@electron/typeText.latin has no valid cua sample
- unicode: textedit/perContext@electron/typeText.lines has no valid cua sample
- unicode: textedit/perContext@electron/typeText.mixed has no valid cua sample
- speed: electron/method.paste.replace has no measure on one engine

## Owner options (not run; not part of the verdict)

- TextEdit launch under the engine: provable in a scratch macOS user if wanted (launch textedit/background/launch@finder): on the shared Mac its first observation's screenshot would capture the owner's restored TextEdit windows or, with none to restore, TextEdit's iCloud Open panel; isolating it would change the owner's TextEdit state

## For the owner

- speed: chrome/method.paste.replace missed the 10% beat (cua 152.7 ms against 121.1 ms, p95 204.5 against 121.1)
- speed: electron/getAXState missed the 10% beat (cua 49.1 ms against 51.1 ms, p95 59 against 68.5)
- speed: electron/getScreenshot missed the 10% beat (cua 57.4 ms against 51.2 ms, p95 68.6 against 71.7)
- speed: electron/method.pressKey.tab missed the 10% beat (cua 9.7 ms against 11.5 ms, p95 14.3 against 11.5)
- speed: textedit/getAXState missed the 10% beat (cua 53.9 ms against 57.2 ms, p95 77.3 against 87.1)
- speed: textedit/getScreenshot missed the 10% beat (cua 55 ms against 52.4 ms, p95 71.6 against 75.4)
- speed: textedit/method.paste.replace missed the 10% beat (cua 46.8 ms against 32.2 ms, p95 48.5 against 32.2)

## The three points

- **Speed**: 50 of 58 measured ops beat the vendor by at least 10% with p95 not worse; 7 missed (the owner's fork), 1 unmeasured.
- **Finding elements**: fail; resolved targets vendor 29, cua 29 of 40.
- **Not interfering**: cua 96.9% (188/194), vendor 98% (97/99); cua route-4 actions outside accepted families: 0; declared for the owner: 0.
- **Concurrent use and intervention**: 2 of 5 rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).
- **Korean and Unicode**: 147 of 225 rows pass on cua.

## Methods

| method | textedit | finder | chrome | electron | openPanel | windowless |
|---|---|---|---|---|---|---|
| get_app_state | F better / B better | F better / B no verdict | F better / B no verdict | F better / B better | F better / B better | B better |
| list_apps | F better / B better | F better / B no verdict | F better / B no verdict | F better / B better | n/a | n/a |
| click | F better / B better | F better / B no verdict | F better / B no verdict | F better / B better | F better / B better | n/a |
| drag | F better / B better | n/a | F no verdict / B no verdict | F better / B better | n/a | n/a |
| paste | F better / B better | n/a | F better / B no verdict | F no verdict / B no verdict | n/a | n/a |
| perform_secondary_action | F better / B better | F better / B no verdict | n/a | n/a | n/a | n/a |
| press_key | F better / B better | F better / B no verdict | F better / B no verdict | F better / B no verdict | n/a | n/a |
| scroll | F better / B better | F better / B no verdict | n/a | n/a | n/a | n/a |
| select_text | F better / B better | F better / B no verdict | F worse / B no verdict | F better / B better | n/a | n/a |
| set_value | F better / B better | n/a | F better / B no verdict | F better / B better | n/a | n/a |
| type_text | F better / B better | F better / B no verdict | F better / B no verdict | F better / B no verdict | n/a | n/a |

F: frontmost regime (the vendor's outcome is the reference, sample for sample); B: background regime (the fixture's ground truth). n/a: no meaningful target on that scene, on both engines:

- finder set_value: a value written into a file's name field renames a run file, and the scene's other cases and targets read those names
- finder drag: a drag in Finder's list moves run files or starts a rubber band whose outcome follows the pointer's path
- finder paste: Finder pastes files, not text, into a folder
- chrome scroll: the scene page fits its window: nothing to scroll
- chrome perform_secondary_action: no control on the scene page advertises a secondary action (the window's Raise would reorder it over the user's)
- electron scroll: the fixture's list of six fits its box: nothing to scroll
- electron perform_secondary_action: no control in the fixture advertises a secondary action
- openPanel list_apps: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel drag: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel paste: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel perform_secondary_action: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel press_key: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel scroll: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel select_text: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel set_value: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
- openPanel type_text: the Open panel is observed and its Cancel clicked; it lists the owner's files, so nothing is typed, selected or scrolled in it
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
| chrome/background/click.apply@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/click.checkbox@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/drag.select@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/getAXState.tree@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/listApps.running@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/paste.replace@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/pressKey.tab@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/selectText.name@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/selectText.notText@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/setValue.name@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/setValue.notSettable@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/background/typeText.replace@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/frontmost/click.apply | equal | 1/1 | 2/2 | - | 1 |
| chrome/frontmost/click.checkbox | equal | 1/1 | 2/2 | - | 1 |
| chrome/frontmost/drag.select | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| chrome/frontmost/getAXState.tree | equal | 1/1 | 2/2 | - | - |
| chrome/frontmost/listApps.running | equal | 1/1 | 2/2 | - | - |
| chrome/frontmost/paste.replace | equal | 1/1 | 2/2 | - | paste |
| chrome/frontmost/pressKey.tab | equal | 1/1 | 2/2 | - | 2' |
| chrome/frontmost/selectText.name | equal | 1/1 | 2/2 | - | 1 |
| chrome/frontmost/selectText.notText | **worse** | 0/1 | 0/2 | - | 1 |
| chrome/frontmost/setValue.name | equal | 1/1 | 2/2 | - | 1 |
| chrome/frontmost/setValue.notSettable | equal | 1/1 | 2/2 | - | 1 |
| chrome/frontmost/typeText.replace | equal | 1/1 | 2/2 | - | 2' |
| electron/background/click.button@finder | equal | 1/1 | 2/2 | - | 3 |
| electron/background/drag.select@finder | equal | 1/1 | 2/2 | - | 3 |
| electron/background/getAXState.tree@finder | equal | 1/1 | 2/2 | - | - |
| electron/background/listApps.running@finder | equal | 1/1 | 2/2 | - | - |
| electron/background/paste.replace@finder | **no verdict** | 1/1 | 0/0 (+2 invalid) | - |  |
| electron/background/pressKey.tab@finder | **no verdict** | 1/1 | 0/0 (+2 invalid) | - |  |
| electron/background/selectText.text@finder | equal | 1/1 | 2/2 | - | 3 |
| electron/background/setValue.notSettable@finder | equal | 1/1 | 2/2 | - | 1 |
| electron/background/setValue.text@finder | equal | 1/1 | 2/2 | - | 3 |
| electron/background/typeText.replace@finder | **no verdict** | 1/1 | 0/0 (+2 invalid) | - |  |
| electron/frontmost/click.button | equal | 1/1 | 2/2 | - | 1 |
| electron/frontmost/drag.select | equal | 1/1 | 2/2 | - | 3 |
| electron/frontmost/getAXState.tree | equal | 1/1 | 2/2 | - | - |
| electron/frontmost/listApps.running | equal | 1/1 | 2/2 | - | - |
| electron/frontmost/paste.replace | **no verdict** | 1/1 | 0/0 (+2 invalid) | - |  |
| electron/frontmost/pressKey.tab | equal | 1/1 | 2/2 | - | 2' |
| electron/frontmost/selectText.text | equal | 1/1 | 2/2 | - | 1 |
| electron/frontmost/setValue.notSettable | equal | 1/1 | 2/2 | - | 1 |
| electron/frontmost/setValue.text | equal | 1/1 | 2/2 | - | 1 |
| electron/frontmost/typeText.replace | equal | 1/1 | 2/2 | - | 2' |
| finder/background/click.row@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/click.row@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/getAXState.tree@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/getAXState.tree@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/listApps.running@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/listApps.running@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/performSecondaryAction.down@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/performSecondaryAction.down@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/pressKey.down@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/pressKey.down@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/scroll.down@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/scroll.down@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/selectText.notText@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/selectText.notText@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/typeText.typeSelect@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/background/typeText.typeSelect@textedit | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |  |  |
| finder/frontmost/click.row | equal | 1/1 | 2/2 | - | 3 |
| finder/frontmost/getAXState.tree | equal | 1/1 | 2/2 | - | - |
| finder/frontmost/listApps.running | equal | 1/1 | 2/2 | - | - |
| finder/frontmost/performSecondaryAction.down | equal | 1/1 | 2/2 | - | 1 |
| finder/frontmost/pressKey.down | equal | 1/1 | 2/2 | - | 2' |
| finder/frontmost/scroll.down | equal | 1/1 | 2/2 | - | 2' |
| finder/frontmost/selectText.notText | equal | 1/1 | 2/2 | - | 1 |
| finder/frontmost/typeText.typeSelect | equal | 1/1 | 2/2 | - | 2' |
| openPanel/background/click.cancel@finder | equal | 1/1 | 2/2 | - | 3 |
| openPanel/background/getAXState.panel@finder | equal | 1/1 | 2/2 | - | - |
| openPanel/frontmost/click.cancel | equal | 1/1 | 2/2 | - | 1 |
| openPanel/frontmost/getAXState.panel | equal | 1/1 | 2/2 | - | - |
| textedit/background/click.control@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/click.control@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/click.element@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/click.element@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/click.invalidIndex@chrome | equal | 1/1 | 2/2 | - | - |
| textedit/background/click.invalidIndex@finder | equal | 1/1 | 2/2 | - | - |
| textedit/background/drag.select@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/drag.select@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/getAXState.tree@chrome | equal | 1/1 | 2/2 | - | - |
| textedit/background/getAXState.tree@finder | equal | 1/1 | 2/2 | - | - |
| textedit/background/listApps.running@chrome | equal | 1/1 | 2/2 | - | - |
| textedit/background/listApps.running@finder | equal | 1/1 | 2/2 | - | - |
| textedit/background/paste.replace@chrome | equal | 1/1 | 2/2 | - | paste |
| textedit/background/paste.replace@finder | equal | 1/1 | 2/2 | - | paste |
| textedit/background/performSecondaryAction.down@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/performSecondaryAction.down@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/pressKey.selectAll@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/pressKey.selectAll@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/scroll.down@chrome | equal | 1/1 | 2/2 | - | 2' |
| textedit/background/scroll.down@finder | equal | 1/1 | 2/2 | - | 2' |
| textedit/background/selectText.line@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/selectText.line@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/selectText.notText@chrome | equal | 1/1 | 2/2 | - | 1 |
| textedit/background/selectText.notText@finder | equal | 1/1 | 2/2 | - | 1 |
| textedit/background/setValue.document@chrome | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/setValue.document@finder | equal | 1/1 | 2/2 | - | 3 |
| textedit/background/setValue.notSettable@chrome | equal | 1/1 | 2/2 | - | 1 |
| textedit/background/setValue.notSettable@finder | equal | 1/1 | 2/2 | - | 1 |
| textedit/background/typeText.replace@chrome | equal | 1/1 | 2/2 | - | 2' |
| textedit/background/typeText.replace@finder | equal | 1/1 | 2/2 | - | 2' |
| textedit/frontmost/click.control | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/click.element | equal | 1/1 | 2/2 | - | 3 |
| textedit/frontmost/click.invalidIndex | equal | 1/1 | 2/2 | - | - |
| textedit/frontmost/drag.select | equal | 1/1 | 2/2 | - | 3 |
| textedit/frontmost/getAXState.tree | equal | 1/1 | 2/2 | - | - |
| textedit/frontmost/listApps.running | equal | 1/1 | 2/2 | - | - |
| textedit/frontmost/paste.replace | equal | 1/1 | 2/2 | - | paste |
| textedit/frontmost/performSecondaryAction.down | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/pressKey.selectAll | equal | 1/1 | 2/2 | - | 2' |
| textedit/frontmost/scroll.down | equal | 1/1 | 2/2 | - | 2' |
| textedit/frontmost/selectText.line | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/selectText.notText | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/setValue.document | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/setValue.notSettable | equal | 1/1 | 2/2 | - | 1 |
| textedit/frontmost/typeText.replace | equal | 1/1 | 2/2 | - | 2' |
| windowless/background/getAXState.noWindow@finder | equal | 1/1 | 2/2 | - | - |

## Speed (in-cell ms)

### textedit

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 57.2 | 87.1 | 53.9 | 77.3 | -5.8% | **no** |
| getScreenshot | 52.4 | 75.4 | 55.0 | 71.6 | +4.9% | **no** |
| listApps | 23.0 | 39.8 | 3.9 | 14.3 | -82.8% | yes |
| method.click.control | 813.1 | 813.1 | 111.9 | 114.8 | -86.2% | yes |
| method.click.element | 722.2 | 722.2 | 18.9 | 27.1 | -97.4% | yes |
| method.click.invalidIndex | 6.7 | 6.7 | 3.8 | 6.0 | -43.5% | yes |
| method.drag.select | 54.5 | 54.5 | 5.7 | 7.5 | -89.5% | yes |
| method.getAXState.tree | 91.7 | 91.7 | 76.6 | 84.6 | -16.5% | yes |
| method.listApps.running | 41.6 | 41.6 | 13.4 | 15.4 | -67.9% | yes |
| method.panel.click.cancel | 1038.0 | 1038.0 | 140.3 | 143.4 | -86.5% | yes |
| method.panel.getAXState.panel | 153.9 | 153.9 | 137.2 | 144.5 | -10.8% | yes |
| method.paste.replace | 32.2 | 32.2 | 46.8 | 48.5 | +45% | **no** |
| method.performSecondaryAction.down | 518.4 | 518.4 | 3.8 | 4.1 | -99.3% | yes |
| method.pressKey.selectAll | 14.3 | 14.3 | 9.5 | 13.2 | -33.8% | yes |
| method.scroll.down | 866.1 | 866.1 | 6.4 | 7.9 | -99.3% | yes |
| method.selectText.line | 50.2 | 50.2 | 13.4 | 13.4 | -73.4% | yes |
| method.selectText.notText | 5.5 | 5.5 | 3.0 | 3.6 | -45.4% | yes |
| method.setValue.document | 704.9 | 704.9 | 28.2 | 33.4 | -96% | yes |
| method.setValue.notSettable | 437.4 | 437.4 | 5.3 | 6.2 | -98.8% | yes |
| method.typeText.replace | 243.2 | 243.2 | 97.2 | 103.3 | -60% | yes |

### finder

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 453.3 | 463.8 | 173.8 | 203.8 | -61.7% | yes |
| getScreenshot | 460.8 | 468.6 | 177.1 | 197.4 | -61.6% | yes |
| listApps | 18.5 | 24.1 | 2.8 | 6.0 | -84.7% | yes |
| method.click.row | 229.0 | 229.0 | 9.3 | 14.7 | -96% | yes |
| method.getAXState.tree | 421.3 | 421.3 | 188.0 | 194.5 | -55.4% | yes |
| method.listApps.running | 30.0 | 30.0 | 21.1 | 22.3 | -29.5% | yes |
| method.performSecondaryAction.down | 1015.7 | 1015.7 | 19.8 | 28.5 | -98% | yes |
| method.pressKey.down | 6.9 | 6.9 | 4.5 | 4.9 | -35.6% | yes |
| method.scroll.down | 2809.8 | 2809.8 | 561.9 | 571.3 | -80% | yes |
| method.selectText.notText | 4.0 | 4.0 | 2.3 | 2.6 | -42.2% | yes |
| method.typeText.typeSelect | 87.4 | 87.4 | 40.0 | 40.1 | -54.3% | yes |

### chrome

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 98.4 | 120.3 | 48.3 | 82.6 | -50.9% | yes |
| getScreenshot | 100.2 | 120.8 | 50.1 | 96.0 | -50% | yes |
| listApps | 26.0 | 36.6 | 3.8 | 8.1 | -85.5% | yes |
| method.click.apply | 271.0 | 271.0 | 13.8 | 13.8 | -94.9% | yes |
| method.click.checkbox | 504.2 | 504.2 | 68.6 | 123.8 | -86.4% | yes |
| method.getAXState.tree | 143.5 | 143.5 | 69.2 | 69.8 | -51.8% | yes |
| method.listApps.running | 35.7 | 35.7 | 19.2 | 20.2 | -46.1% | yes |
| method.paste.replace | 121.1 | 121.1 | 152.7 | 204.5 | +26.1% | **no** |
| method.pressKey.tab | 14.7 | 14.7 | 6.1 | 7.2 | -58.2% | yes |
| method.selectText.name | 228.8 | 228.8 | 5.3 | 6.1 | -97.7% | yes |
| method.selectText.notText | 4.5 | 4.5 | 3.7 | 4.0 | -17.6% | yes |
| method.setValue.name | 218.0 | 218.0 | 7.9 | 8.5 | -96.4% | yes |
| method.setValue.notSettable | 708.0 | 708.0 | 5.9 | 6.2 | -99.2% | yes |
| method.typeText.replace | 255.2 | 255.2 | 104.4 | 107.2 | -59.1% | yes |

### electron

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 51.1 | 68.5 | 49.1 | 59.0 | -3.9% | **no** |
| getScreenshot | 51.2 | 71.7 | 57.4 | 68.6 | +12.1% | **no** |
| listApps | 22.3 | 27.9 | 3.3 | 19.8 | -85% | yes |
| method.click.button | 458.3 | 458.3 | 14.0 | 16.2 | -96.9% | yes |
| method.drag.select | 41.7 | 41.7 | 5.0 | 5.7 | -88% | yes |
| method.getAXState.tree | 116.7 | 116.7 | 64.6 | 68.1 | -44.6% | yes |
| method.listApps.running | 42.3 | 42.3 | 18.8 | 22.0 | -55.6% | yes |
| method.paste.replace | 89.1 | 89.1 | - | - | - | unmeasured |
| method.pressKey.tab | 11.5 | 11.5 | 9.7 | 14.3 | -15.7% | **no** |
| method.selectText.text | 234.4 | 234.4 | 5.5 | 6.2 | -97.7% | yes |
| method.setValue.notSettable | 660.4 | 660.4 | 6.7 | 7.4 | -99% | yes |
| method.setValue.text | 265.1 | 265.1 | 19.6 | 20.0 | -92.6% | yes |
| method.typeText.replace | 244.7 | 244.7 | 105.1 | 111.6 | -57% | yes |

## Finding elements

| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |
|---|---|---|---|---|---|---|
| textedit | 5/10 | 5/10 | 0.4746 | 0.4746 | 1 | 1 |
| finder | 4/10 | 4/10 | 0.3333 | 0.32980000000000004 | 2 | 2 |
| chrome | 10/10 | 10/10 | 0.7705 | 0.7705 | 0 | 0 |
| electron | 10/10 | 10/10 | 0.76 | 0.76 | 0 | 0 |

## Launch path

| row | verdict | vendor ok | cua ok |
|---|---|---|---|
| electron/background/launch@finder | equal | 0/0 (+1 invalid) | 2/2 |

## Concurrent use and intervention

Each row against its own outcome (the user's keystroke kept, userIntervened, the refusal); the vendor's recorded beside it.

| row | verdict | vendor ok | cua ok |
|---|---|---|---|
| chrome/concurrent@textedit | equal | 1/1 | 2/2 |
| finder/concurrent@textedit | equal | 1/1 | 2/2 |
| textedit/concurrent.sheet@electron | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |
| textedit/intervention.fires | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |
| textedit/intervention.preAction | **no verdict** | 0/0 (+1 invalid) | 0/0 (+2 invalid) |

## Korean and Unicode

Each field's cell: cua ok/valid, then the vendor's; a cua row that failed is marked. Read back by SHA-256 against the string sent.

### latin

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.combining | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.emoji | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.hangul | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.jamo | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.kanji | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.latin | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.lines | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.mixed | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| pressKey.rk | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| typeText.acceptance4 | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.combining | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.emoji | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.hangul | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.jamo | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.kanji | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.latin | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| typeText.lines | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.mixed | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |

### midSwitch

| row | textedit | chrome | electron |
|---|---|---|---|
| typeText.long | 2/2 · 0/1 | **1/2** · 0/1 | **0/2** · 0/1 |

### korean

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.combining | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.emoji | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.hangul | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.jamo | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.kanji | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.latin | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.lines | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| paste.mixed | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| pressKey.rk | **0/2** · 0/1 | **0/2** · 0/1 | **0/2** · 0/1 |
| typeText.acceptance4 | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.combining | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.emoji | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.hangul | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.jamo | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| typeText.kanji | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |
| typeText.latin | 2/2 · 1/1 | 2/2 · 1/1 | 2/2 · 1/1 |
| typeText.lines | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.mixed | 2/2 · 0/1 | 2/2 · 0/1 | 2/2 · 0/1 |

### composing (user window: chrome@textedit, electron@textedit, textedit@electron)

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.combining | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.emoji | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.hangul | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.jamo | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.kanji | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.latin | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.lines | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| paste.mixed | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| typeText.acceptance4 | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.combining | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.emoji | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.hangul | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.jamo | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| typeText.kanji | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.latin | 2/2 · 1/1 | **0/2** · 1/1 | 2/2 · 1/1 |
| typeText.lines | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |
| typeText.mixed | 2/2 · 0/1 | **0/2** · 0/1 | 2/2 · 0/1 |

### perContext (user window: chrome@textedit, electron@textedit, textedit@electron)

| row | textedit | chrome | electron |
|---|---|---|---|
| paste.acceptance4 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.combining | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.emoji | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.hangul | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.jamo | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.kanji | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.latin | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.lines | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| paste.mixed | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.acceptance4 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.combining | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.emoji | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.hangul | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.jamo | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.kanji | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.latin | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.lines | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |
| typeText.mixed | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 |

## Not interfering

- cua: 96.9% (188/194); failed: finder/concurrent@textedit (top window changed); chrome/concurrent@textedit (top window changed); electron/background/launch@finder (top window changed); finder/concurrent@textedit (top window changed); chrome/concurrent@textedit (top window changed); electron/background/launch@finder (top window changed)
- vendor: 98% (97/99); failed: finder/concurrent@textedit (top window changed); chrome/concurrent@textedit (top window changed)

