# Native matrix summary

Verdict: **FAIL**

Full matrix runs: 3 vendor, 3 cua (3 per side are the rule).
Device mode: shared (the default), recorded by every full run; hosted: 6 of 6 full runs.

## Blocking

- unicode: chrome/korean/pressKey.rk failed on cua
- unicode: electron/korean/pressKey.rk failed on cua

## Missing proof (no verdict)

- concurrent use: textedit/concurrent.sheet@electron has no valid cua sample
- 2 cell(s) do not qualify: fewer than 3 complete run pairs (NO VERDICT by cell)

## Owner options (not run; not part of the verdict)

- TextEdit launch under the engine: provable in a scratch macOS user if wanted (launch textedit/background/launch@finder): on the shared Mac its first observation's screenshot would capture the owner's restored TextEdit windows or, with none to restore, TextEdit's iCloud Open panel; isolating it would change the owner's TextEdit state

## For the owner

- speed: chrome/method.typeText.replace missed the 10% beat (cua 186.5 ms against 326.4 ms, p95 407.7 against 377.1)
- finding elements: parity on the resolved sum (the owner decides)

## Accepted misses (not blocking)

- speed: textedit/method.typeText.replace: accepted miss (#593, ruling 1240): cua 187.5 ms against 328.2 ms median, p95 376.8 against 335.6, n = 3 a side

## The three points

- **Speed**: 64 of 66 measured ops beat the vendor by at least 10% with p95 not worse; 1 accepted miss (not blocking); 1 missed (the owner's fork), 0 unmeasured or not qualified.
- **Finding elements**: parity; resolved targets vendor 29, cua 29 of 40.
- **Not interfering**: cua 99.2% (381/384), vendor 99.2% (381/384); cua route-4 actions outside accepted families: 0; declared for the owner: 0.
- **What changes for a user**: 1 declared departure(s) (R3).
- **Concurrent use and intervention**: 4 of 5 rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).
- **Korean and Unicode**: 168 of 171 rows pass on cua; 54 perContext rows are not judged (below).
- **NO VERDICT**: 4 cua and 3 vendor sample(s) without a verdict; of them `alert` (an alert in front or key, or the alert guard's refusal): cua 0, vendor 0; 2 of 417 cells do not qualify.

## By the lane that ran first (ruling 1226)

Run numbers by the lane that ran first: vendor first 2, cua first 1. Failed samples: 156 in vendor-first runs, 78 in cua-first runs; samples without a verdict: 229 and 114. Recorded, never judged.

| cell | engine | failed, vendor first | failed, cua first | no verdict, vendor first | no verdict, cua first |
|---|---|---|---|---|---|
| concurrent textedit/concurrent.sheet@electron | cua | 0 | 0 | 2 | 1 |
| concurrent textedit/concurrent.sheet@electron | vendor | 0 | 0 | 2 | 1 |
| intervention textedit/intervention.fires | vendor | 2 | 1 | 0 | 0 |
| intervention textedit/intervention.preAction | vendor | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | cua | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | vendor | 2 | 1 | 0 | 0 |
| method chrome/background/drag.select@textedit | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | vendor | 2 | 1 | 0 | 0 |
| method openPanel/frontmost/typeText.search | cua | 0 | 0 | 2 | 1 |
| method openPanel/frontmost/typeText.search | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | cua | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/pressKey.rk | cua | 0 | 1 | 0 | 0 |
| unicode chrome/korean/pressKey.rk | vendor | 2 | 0 | 0 | 0 |
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
| unicode electron/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | cua | 0 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | vendor | 2 | 0 | 0 | 0 |
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
| unicode textedit/composing@electron/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/midSwitch/typeText.long | cua | 0 | 0 | 1 | 0 |
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

## Composing retries (ruling 1229)

A composing group whose check did not read the jamo redid its setup and re-posted, up to three attempts. By lane: vendor 0 retries in 0 group(s), 0 never composed; cua 0 retries in 0 group(s), 0 never composed. Recorded, never judged.

Each attempt's field was emptied by the harness's own Accessibility write (ruling 1229(b)), or by the lane's engine where that write did not read back empty: vendor 9 by the harness, 0 by the engine, 0 by neither, the engine's own emptying tried on 0; cua 9 by the harness, 0 by the engine, 0 by neither, the engine's own emptying tried on 0.

| group | engine | runs | runs retried | retries | never composed | attempts emptied by the harness | by the engine | by neither | engine fallbacks tried |
|---|---|---|---|---|---|---|---|---|---|
| chrome@textedit | cua | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| chrome@textedit | vendor | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| electron@textedit | cua | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| electron@textedit | vendor | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| textedit@electron | cua | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| textedit@electron | vendor | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |

## Evidence by job (ruling 1228)

Each run's cells come from its full run's job, but those a filtered rerun replaced, both lanes together (./combine.mjs).

- run 1: job 46165236186 attempt 1
- run 2: job 46165236186 attempt 1
- run 3: job 46165236186 attempt 1

## Runners by run (sitting C split into jobs, ruling 1228)

Each run's pair stood on one runner; the runs did not need to.

- run 1: macos27 20261123.0387.2, run 46165236186 attempt 1, VM 63591d6e-e6df-4c77-a8d7-d672aecb4288; macOS 27.0.1 (26A434)
- run 2: macos27 20261123.0387.2, run 46165236186 attempt 1, VM b32ae11e-3ce1-4cdf-8a75-e932b6ed70fd; macOS 27.0.1 (26A434)
- run 3: macos27 20261123.0387.2, run 46165236186 attempt 1, VM a84699a0-bdc0-4a34-9c9b-09e9d80995a2; macOS 27.0.1 (26A434)

## Speed (in-cell ms)

### textedit

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 112.3 | 195.7 | 56.2 | 106.8 | -50% | yes |
| getScreenshot | 118.8 | 178.6 | 53.6 | 86.0 | -54.9% | yes |
| listApps | 17.6 | 39.0 | 7.7 | 9.7 | -56.3% | yes |
| method.click.control | 857.5 | 867.5 | 112.2 | 122.2 | -86.9% | yes |
| method.click.element | 793.0 | 838.9 | 13.9 | 22.1 | -98.2% | yes |
| method.click.invalidIndex | 14.5 | 19.5 | 1.3 | 2.8 | -91% | yes |
| method.drag.select | 52.9 | 113.4 | 6.6 | 19.1 | -87.4% | yes |
| method.getAXState.tree | 149.0 | 152.3 | 50.2 | 69.6 | -66.3% | yes |
| method.listApps.running | 23.5 | 26.1 | 11.2 | 12.6 | -52.1% | yes |
| method.panel.click.cancel | 1002.9 | 1110.4 | 242.2 | 335.7 | -75.8% | yes |
| method.panel.getAXState.panel | 6709.6 | 8104.4 | 2246.9 | 5141.5 | -66.5% | yes |
| method.panel.pressKey.escape | 22.7 | 33.7 | 10.4 | 19.2 | -54.3% | yes |
| method.paste.replace | 89.6 | 99.5 | 51.7 | 66.1 | -42.3% | yes |
| method.performSecondaryAction.down | 516.6 | 517.1 | 5.7 | 9.8 | -98.9% | yes |
| method.pressKey.selectAll | 17.7 | 31.0 | 6.7 | 16.5 | -62.1% | yes |
| method.savePanel.pressKey.escape | 11.4 | 13.4 | 7.5 | 12.9 | -34.4% | yes |
| method.savePanel.setValue.name | 464.1 | 478.7 | 12.9 | 15.0 | -97.2% | yes |
| method.scroll.down | 800.2 | 801.8 | 29.5 | 46.9 | -96.3% | yes |
| method.selectText.line | 120.4 | 126.2 | 8.8 | 29.4 | -92.7% | yes |
| method.selectText.notText | 13.9 | 16.0 | 3.6 | 7.2 | -74.3% | yes |
| method.setValue.document | 724.3 | 732.4 | 41.4 | 136.5 | -94.3% | yes |
| method.setValue.notSettable | 444.9 | 447.8 | 4.2 | 5.4 | -99.1% | yes |
| method.typeText.replace | 328.2 | 335.6 | 187.5 | 376.8 | -42.9% | accepted miss (#593, ruling 1240) |

### finder

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 730.2 | 1135.6 | 244.2 | 316.7 | -66.6% | yes |
| getScreenshot | 689.2 | 1171.6 | 226.9 | 333.1 | -67.1% | yes |
| listApps | 18.0 | 24.9 | 9.0 | 15.3 | -49.8% | yes |
| method.click.row | 259.4 | 285.4 | 18.7 | 41.2 | -92.8% | yes |
| method.getAXState.tree | 953.2 | 1155.8 | 202.9 | 482.6 | -78.7% | yes |
| method.listApps.running | 24.1 | 30.2 | 9.9 | 10.3 | -58.9% | yes |
| method.performSecondaryAction.down | 1067.9 | 1077.6 | 14.9 | 16.5 | -98.6% | yes |
| method.pressKey.down | 17.1 | 33.2 | 10.8 | 20.7 | -37.1% | yes |
| method.scroll.down | 10124.1 | 12008.6 | 656.2 | 670.7 | -93.5% | yes |
| method.selectText.notText | 19.1 | 23.2 | 5.1 | 6.9 | -73.5% | yes |
| method.typeText.typeSelect | 108.2 | 119.6 | 44.9 | 50.2 | -58.5% | yes |

### chrome

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 202.7 | 320.8 | 82.4 | 103.7 | -59.3% | yes |
| getScreenshot | 224.4 | 312.2 | 92.7 | 148.7 | -58.7% | yes |
| listApps | 20.4 | 29.3 | 8.5 | 14.8 | -58.6% | yes |
| method.click.apply | 319.4 | 320.5 | 9.7 | 10.9 | -97% | yes |
| method.click.checkbox | 536.1 | 547.0 | 20.2 | 31.5 | -96.2% | yes |
| method.click.pointerdown | 367.0 | 421.8 | 12.0 | 19.4 | -96.7% | yes |
| method.drag.select | 54.8 | 67.2 | 9.9 | 14.1 | -81.9% | yes |
| method.getAXState.tree | 251.7 | 259.5 | 68.4 | 88.7 | -72.8% | yes |
| method.listApps.running | 22.3 | 34.0 | 8.0 | 8.4 | -64.3% | yes |
| method.paste.replace | 204.5 | 230.3 | 104.8 | 121.2 | -48.8% | yes |
| method.pressKey.tab | 20.5 | 20.8 | 8.3 | 19.4 | -59.2% | yes |
| method.selectText.name | 243.5 | 281.7 | 11.5 | 12.4 | -95.3% | yes |
| method.selectText.notText | 13.0 | 19.0 | 4.7 | 6.7 | -63.9% | yes |
| method.setValue.name | 276.1 | 277.3 | 9.8 | 12.0 | -96.4% | yes |
| method.setValue.notSettable | 753.1 | 759.7 | 8.1 | 9.4 | -98.9% | yes |
| method.typeText.replace | 326.4 | 377.1 | 186.5 | 407.7 | -42.9% | **no** |

### electron

| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |
|---|---|---|---|---|---|---|
| getAXState | 99.6 | 159.6 | 34.2 | 57.2 | -65.7% | yes |
| getScreenshot | 110.1 | 156.7 | 40.5 | 69.1 | -63.2% | yes |
| listApps | 18.6 | 29.8 | 8.1 | 15.0 | -56.6% | yes |
| method.click.button | 512.3 | 557.1 | 15.0 | 22.6 | -97.1% | yes |
| method.click.point | 254.3 | 359.7 | 13.2 | 31.2 | -94.8% | yes |
| method.click.pointerdown | 764.9 | 775.1 | 13.3 | 29.1 | -98.3% | yes |
| method.click.selection | 305.4 | 350.0 | 18.9 | 28.5 | -93.8% | yes |
| method.drag.select | 44.2 | 50.5 | 19.0 | 19.2 | -57.1% | yes |
| method.getAXState.tree | 151.4 | 155.9 | 44.0 | 57.9 | -71% | yes |
| method.listApps.running | 30.9 | 32.8 | 8.8 | 18.5 | -71.3% | yes |
| method.paste.replace | 157.3 | 163.3 | 138.7 | 150.2 | -11.8% | yes |
| method.pressKey.tab | 14.7 | 20.8 | 11.9 | 12.7 | -19% | yes |
| method.selectText.text | 256.0 | 266.6 | 16.9 | 17.5 | -93.4% | yes |
| method.setValue.notSettable | 698.5 | 728.2 | 6.9 | 13.0 | -99% | yes |
| method.setValue.text | 326.5 | 364.7 | 171.9 | 200.0 | -47.4% | yes |
| method.typeText.replace | 360.8 | 377.4 | 198.3 | 205.3 | -45% | yes |

## Finding elements

| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |
|---|---|---|---|---|---|---|
| textedit | 5/10 | 5/10 | 0.4561 | 0.4561 | 1 | 1 |
| finder | 4/10 | 4/10 | 0.3465 | 0.3465 | 2 | 2 |
| chrome | 10/10 | 10/10 | 0.7813 | 0.7813 | 0 | 0 |
| electron | 10/10 | 10/10 | 0.7857000000000001 | 0.7857000000000001 | 0 | 0 |

## Not interfering

The background, launch, concurrent-use and behind-a-user-window Unicode rows with a verdict, by the oracle (the front app, the top window, the focus, activations, the route).

- cua: 99.2% (381/384); failed: electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window)
- vendor: 99.2% (381/384); failed: electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window); electron/background/launch@finder (top window changed, a target window left above the user window)

- User windows to the top (ruling 1221): chrome cua waited 45, raised 0, raise failed 0; chrome vendor waited 45, raised 0, raise failed 0; electron cua waited 0, raised 24, raise failed 0; electron vendor waited 0, raised 24, raise failed 0; finder cua waited 87, raised 0, raise failed 0; finder vendor waited 48, raised 39, raise failed 0; textedit cua waited 40, raised 26, raise failed 0; textedit vendor waited 39, raised 27, raise failed 0; not ok after a raise: vendor textedit/intervention.fires, vendor textedit/intervention.fires, vendor textedit/intervention.fires.
- R3's witness (ruling 1225): the control seen in 0 of 6 runs; NOT seen: cua run 1 (electron), cua run 2 (electron), cua run 3 (electron), vendor run 1 (electron), vendor run 2 (electron), vendor run 3 (electron); 0 row(s) NO VERDICT on it.
- electron/background/launch@finder: both engines failed; nothing of the person's moved (a target window above the user's): the venue's, not judged on its recorded evidence (below) (rulings 1219 and 1222)

## What changes for a user

The places where cua refuses or answers unconfirmed where the vendor answered ok (R3), each declared with its Decision Log entry; nothing else can be here.

- method chrome/background/drag.select@textedit: the vendor answered ok, cua refused ("Google Chrome for Testing's web page does not accept a background click") in 3 sample(s); known capability difference: the vendor made the selection cleanly in 3 of 3 runs, TextEdit front and key throughout; Decision Log, 2026-11-05, #282 (shared mode, item 6): a drag into a background Chromium web area is never posted, refused as backgroundClickRefused; the background-drag study, #591 (ruling 1228)
- unicode chrome/korean/pressKey.rk: judged against ruling 1119's oracle 가 on each engine (ruling 1219): cua read it in 2 sample(s), the vendor composed otherwise in 2; a declared departure where cua is right, the vendor's own failure and no cua block
- unicode electron/korean/pressKey.rk: judged against ruling 1119's oracle 가 on each engine (ruling 1219): cua read it in 2 sample(s), the vendor composed otherwise in 2; a declared departure where cua is right, the vendor's own failure and no cua block

Known capability differences no matrix cell exercises (report text, never judged):

- type_text with no focused element: cua answers typeUnconfirmed (noFocusedElement) where the vendor answers ok: cua does not vouch for typing it cannot place (#597, P3, deferred; ruling 1247). No matrix cell exercises it: report text, never judged.

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

### openPanelSearchTiming

out of M5's judged matrix (ruling 1235): typeText into the Open panel's search field is #588's known defect; neither engine does the op, so its timing has nothing to compare

Ticket: #588.

| row | cua ok | vendor ok |
|---|---|---|
| textedit/method.panel.typeText.search | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### savePanelNameTiming

out of M5's judged matrix (ruling 1231): the Save sheet name case's timing stays unmeasured: filtered reruns record no timing; the vendor's prepare failed in the base

Ticket: #592.

| row | cua ok | vendor ok |
|---|---|---|
| textedit/method.savePanel.typeText.name | 3/3 | 3/3 |

### Shared not-interfering failures

Cells where a cua sample failed not interfering with its own paired vendor sample (rulings 1219 and 1222): a product defect both engines share, with its ticket, or the venue's, on the evidence recorded.

| row | reason | ticket or evidence | samples |
|---|---|---|---|
| electron/background/launch@finder | cua failed not interfering with its paired vendor sample, and nothing of the person's moved (a target window above the user's): the venue's (rulings 1219 and 1222) | evidence: cua run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; vendor run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; cua run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; vendor run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; cua run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after; vendor run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after | 3 |

## NO VERDICT by cell

Each judged cell with a sample without a verdict, or with fewer than 3 complete run pairs (the triple's requirement: runs whose pair is one proof, both sides holding the planned samples, every one with a verdict), which does not qualify and is missing proof. A sample without a verdict is never a pass and never a fail. Its causes: unread, front/key readings missing (hosted) or unread, or the alert guard could not read the alert windows' bounds; activation, the activate step did not take front and key; alert, an app other than the cell's front or key (an alert), or the alert guard refused the cell unsent (an alert over the run's window, or holding the front or key); venue, the run's vendor and cua runs did not stand on one frame (ruling 1169): no sample of that run, on either side, is judged; or an input source the row selects that the runner's setup could not enable (ruling 1189), or a hosted runner's per-context preference read malformed, a baseline no restore could put back, so nothing was written; keyWindow, a click or key cell refused unsent because its scene's app did not hold the window the cell acts in as its own key window (ruling 1169's addition); ownerInput, off a GitHub-hosted runner, the owner's input source or per-context preference was not the row's, and the harness never changes them there (ruling 1188); ownerSitting, a pointer cell on the Open panel a hosted runner left unsent, the panel's x clamped short of the strip left of the capture alerts: the owner's sitting judges it (ruling 1203); invalid, the harness's own invalid reason; unmeasured, a speed or finding sample not measured (no numeric duration); unpaired, no vendor sample with a verdict from the same eligible run (ruling 1116); for speed and finding, outside the complete run pairs; vendorStopped, a cua sample judged against the vendor's whose vendor sample was never run, the vendor's run having stopped part-way before it (ruling 1214): the missing proof is the vendor's, never cua's failure; reference, the vendor's sample of the run could not be the reference (ruling 1168's pointerdown cell: the vendor's click did not raise the count by exactly one). Vendor and cua runs are each side's runs every sample of which has a verdict (diagnostics); by run, the samples with a verdict of the samples the run holds.

| cell | verdict | complete pairs | vendor runs | cua runs | vendor by run | cua by run | vendor no verdict | cua no verdict | qualifies |
|---|---|---|---|---|---|---|---|---|---|
| concurrent textedit/concurrent.sheet@electron | **no verdict** | 0 of 3 | 0 | 0 | r1 0/1, r2 0/1, r3 0/1 | r1 0/1, r2 0/1, r3 0/1 | invalid 3 | invalid 3 | no |
| unicode textedit/midSwitch/typeText.long | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 1/1, r2 1/1, r3 0/1 | - | invalid 1 | no |

## Methods

| method | textedit | finder | chrome | electron | openPanel | savePanel | windowless |
|---|---|---|---|---|---|---|---|
| get_app_state | F better / B better | F better / B better | F better / B better | F better / B better | F better / B better | n/a | B better |
| list_apps | F better / B better | F better / B better | F better / B better | F better / B better | n/a | n/a | n/a |
| click | F better / B better | F better / B better | F better / B better | F better / B better | F better / B better | n/a | n/a |
| drag | F better / B better | n/a | F better / B declared | F better / B better | n/a | n/a | n/a |
| paste | F better / B better | n/a | F better / B better | F better / B better | n/a | n/a | n/a |
| perform_secondary_action | F better / B better | F better / B better | n/a | n/a | n/a | n/a | n/a |
| press_key | F better / B better | F better / B better | F better / B better | F better / B better | F better | F better | n/a |
| scroll | F better / B better | F better / B better | n/a | n/a | n/a | n/a | n/a |
| select_text | F better / B better | F better / B better | F better / B better | F better / B better | n/a | n/a | n/a |
| set_value | F better / B better | n/a | F better / B better | F better / B better | n/a | F better | n/a |
| type_text | F better / B better | F better / B better | F better / B better | F better / B better | not run | F better | n/a |

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
| chrome/background/drag.select@textedit | declared | 3/3 | 0/3 | - | 3 |
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
| finder/background/typeText.typeSelect@electron | equal | 3/3 | 3/3 | - | 2' |
| finder/background/typeText.typeSelect@textedit | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/click.row | equal | 3/3 | 3/3 | - | 3 |
| finder/frontmost/getAXState.tree | equal | 3/3 | 3/3 | - | - |
| finder/frontmost/listApps.running | equal | 3/3 | 3/3 | - | - |
| finder/frontmost/performSecondaryAction.down | equal | 3/3 | 3/3 | - | 1 |
| finder/frontmost/pressKey.down | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/scroll.down | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/selectText.notText | equal | 3/3 | 3/3 | - | 1 |
| finder/frontmost/typeText.typeSelect | equal | 3/3 | 3/3 | - | 2' |
| openPanel/background/click.cancel@finder | equal | 3/3 | 3/3 | - | 3 |
| openPanel/background/getAXState.panel@finder | equal | 3/3 | 3/3 | - | - |
| openPanel/frontmost/click.cancel | equal | 3/3 | 3/3 | - | 1 |
| openPanel/frontmost/getAXState.panel | equal | 3/3 | 3/3 | - | - |
| openPanel/frontmost/pressKey.escape | equal | 3/3 | 3/3 | - | 2' |
| savePanel/frontmost/pressKey.escape | equal | 3/3 | 3/3 | - | 2' |
| savePanel/frontmost/setValue.name | equal | 3/3 | 3/3 | - | 1 |
| savePanel/frontmost/typeText.name | equal | 3/3 | 3/3 | - | 2' |
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
| textedit/intervention.preAction | better | 0/3 | 3/3 |

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
| typeText.emoji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.hangul | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.jamo | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.kanji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.lines | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.mixed | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

### midSwitch

| row | textedit | chrome | electron |
|---|---|---|---|
| typeText.long | 2/2 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

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
| pressKey.rk | 3/3 · 3/3 | **2/3** · 1/3 | **2/3** · 1/3 |
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
| paste.acceptance4 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.combining | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.emoji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.hangul | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.jamo | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.kanji | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.lines | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| paste.mixed | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.acceptance4 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.combining | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.emoji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.hangul | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.jamo | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.kanji | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.latin | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| typeText.lines | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| typeText.mixed | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |

