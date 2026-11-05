# #187: the isolating judge replayed on the second re-slot's records (scripts/cursor-sitting/isolate-replay.mjs)

Section D of the next slot's plan: the isolating slot's judge (`item-187-isolate.mjs`, with the design session's RULINGS 2 on its readings) run over `item-187-reslot2/`, as recorded and under named mutations, so each predicate is shown coming out each way. C2's and C3's judges run over synthetic fixtures. A case whose outcome differs from its expected one fails the replay.

**64 cases, 64 as expected.**

**How the replay reads 11-05's records** (its adaptation, applied to every real case):

- **Attestation.** 11-05's results carry no `cua/nativeEngine`. Only where a result names none, a labelled stand-in attests each half by the slot's own recorded build: AFTER 1f73143d1fb0 (187-place's preflight reading), BEFORE dd7a09235885 (187-putback's reading of the restored save, dd7a). BEFORE is given the control's variant (`control-no-inert-click`) as a stand-in: dd7a is not the control build, but like it posts no inert click. A recorded identity is never replaced: one that conflicts with its half is judged not attested (the recorded-identity table).
- **BEFORE's click kind.** dd7a predates `activationClickKind`. Its background paste skipped the activation-point click (outsideFrame) and posted no inert click, so the replay reads it as `skipped controlBuild`.
- **Counts.** 11-05 ran 3 repetitions a half. A case marked "six a half" counts each real repetition twice. 11-05 ran composing on the shipping build only, so composing's BEFORE rows are its 9 paste rows edited to a read-stage timeout with the control's click kind.

## the premise per repetition (repPremise)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| 11-05 AFTER rep 1 | none (the adaptation only) | counted | counted | yes |
| 11-05 AFTER rep 2 | none (the adaptation only) | counted | counted | yes |
| 11-05 AFTER rep 3 | none (the adaptation only) | counted | counted | yes |
| 11-05 BEFORE rep 1 | none (the adaptation only) | counted | counted | yes |
| 11-05 BEFORE rep 2 | none (the adaptation only) | counted | counted | yes |
| 11-05 BEFORE rep 3 | none (the adaptation only) | counted | counted | yes |
| AFTER rep 1 as recorded | no adaptation: no cua/nativeEngine, as 11-05 kept it | not attested | not attested | yes |
| AFTER rep 1 answered by the control | its pastes' nativeEngine given the control's variant | not attested | not attested | yes |
| BEFORE rep 1 with no variant | its background paste's nativeEngine without the control's variant | not attested | not attested | yes |
| AFTER rep 1 with the control's click kind | its background paste's activationClickKind skipped controlBuild | premise not met | premise not met | yes |
| BEFORE rep 1 with an inert click | its background paste's activationClickKind inertOutside early | premise not met | premise not met | yes |
| AFTER rep 1 clicking at its activation point | its background paste's activationClick posted | premise not met | premise not met | yes |

## the recorded identity (adaptRep: the stand-in only where a result names none)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| 11-05 BEFORE rep 1 recorded with the shipping identity | the raw record's pastes carry AFTER's nativeEngine, then adapted | not attested (build was) | not attested (the background paste: the result's build was 1f73143d1fb0, not the half's saved dd7a09235885) | yes |
| 11-05 AFTER rep 1 recorded with the control's identity | the raw record's pastes carry the control's nativeEngine, then adapted | not attested (variant was control-no-inert-click) | not attested (the background paste: the result's variant was control-no-inert-click, not absent) | yes |
| 11-05 AFTER rep 1 recorded with its own identity | the raw record's pastes carry the slot's AFTER build, then adapted | counted | counted | yes |
| 11-05 composing row 1 recorded with the control's identity | the raw row carries the control's nativeEngine, then adapted | not attested (not the half) | not attested (the composing paste: the result's build was dd7a09235885, not the half's saved 1f73143d1fb0) | yes |

## the cell repetition's outcome (cellOutcome)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| 11-05 AFTER rep 1 | none | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER rep 2 | none | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER rep 3 | none | AFTER-passing | AFTER-passing | yes |
| 11-05 BEFORE rep 1 | none: dd7a's legacy -10005, no stage meta | stage unknown | stage unknown | yes |
| 11-05 BEFORE rep 2 | none: dd7a's legacy -10005, no stage meta | stage unknown | stage unknown | yes |
| 11-05 BEFORE rep 3 | none: dd7a's legacy -10005, no stage meta | stage unknown | stage unknown | yes |
| BEFORE rep 1 with stage meta read | its background paste given stage read, readWait timeout | BEFORE met (read timeout) | BEFORE met (read timeout) | yes |
| BEFORE rep 1 delivered | its background paste delivered | delivered | delivered | yes |
| BEFORE rep 1 at the effect stage | its background paste given stage effect, effectWait timeout | failed at another stage | failed at another stage | yes |
| AFTER rep 1 with a read timeout | its frontmost paste given stage read, readWait timeout | read-stage timeout | read-stage timeout | yes |
| AFTER rep 1 missing otherwise | its frontmost paste given stage effect, effectWait timeout | missed | missed | yes |

## the cell's verdict (partVerdict, BAR.cell: at least 5 counted each way)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| 11-05 as recorded | none: AFTER 3, BEFORE 3 (stage unknown) | INCONCLUSIVE (fewer than 4 counted) | INCONCLUSIVE: fewer than 4 counted in a half (AFTER 3, BEFORE 3), and nothing decisive | yes |
| 11-05 with BEFORE's stage read | every BEFORE background paste given stage read | INCONCLUSIVE (fewer than 4 counted) | INCONCLUSIVE: fewer than 4 counted in a half (AFTER 3, BEFORE 3), and nothing decisive | yes |
| six a half, as predicted | each real repetition counted twice; BEFORE's stage read | LANDS | LANDS | yes |
| six a half, AFTER's one allowed miss | as above, AFTER rep 2's frontmost paste at the effect stage | LANDS | LANDS | yes |
| ruling 2: six a half, one AFTER read timeout | as above, AFTER rep 2's frontmost paste at a read timeout | DOES NOT LAND (read-stage timeout) | DOES NOT LAND: 1 read-stage timeout(s) on AFTER, counted | yes |
| ruling 2 at a low count: 11-05, one AFTER read timeout | AFTER rep 1's background paste at a read timeout; BEFORE as recorded | DOES NOT LAND (read-stage timeout) | DOES NOT LAND: 1 read-stage timeout(s) on AFTER, counted | yes |
| ruling 3 at a low count: 11-05, two BEFORE deliveries | BEFORE reps 1 and 2's background pastes delivered | DOES NOT LAND (BEFORE delivered in 2) | DOES NOT LAND: BEFORE delivered in 2 counted | yes |
| BEFORE's one allowed miss: one delivery | six a half; BEFORE rep 1's background paste delivered | LANDS | LANDS | yes |
| two BEFORE misses, neither decisive | six a half; BEFORE rep 1 delivered, rep 2 at the effect stage | INCONCLUSIVE (under 5) | INCONCLUSIVE: BEFORE failed as predicted in 4 counted, under 5 | yes |
| two BEFORE failures at another stage | six a half; BEFORE reps 1 and 4 at the effect stage | DOES NOT LAND (stage other than read in 2) | DOES NOT LAND: BEFORE failed at a stage other than read in 2 counted | yes |
| two AFTER misses | six a half; AFTER reps 1 and 4's frontmost pastes at the effect stage | DOES NOT LAND (AFTER missed its delivery in 2) | DOES NOT LAND: AFTER missed its delivery in 2 of 6 counted | yes |
| premise failures to 3 counted | six a half; AFTER reps 1, 2, 3 posting their activation click | INCONCLUSIVE (fewer than 4 counted) | INCONCLUSIVE: fewer than 4 counted in a half (AFTER 3, BEFORE 6), and nothing decisive | yes |
| ruling 1: premise failures to 4 counted | six a half; AFTER reps 1 and 2 posting their activation click (4 counted, all delivered) | INCONCLUSIVE (under 5) | INCONCLUSIVE: AFTER met its delivery in 4 counted, under 5 | yes |
| ruling 1: premise failures to 5 counted | six a half; BEFORE rep 6 answered with no variant | LANDS | LANDS | yes |
| the halves mismatched | six a half, the halves swapped: AFTER judged on BEFORE's records | INCONCLUSIVE (AFTER 0, BEFORE 0) | INCONCLUSIVE: fewer than 4 counted in a half (AFTER 0, BEFORE 0), and nothing decisive | yes |

## composing (rowPremise, rowOutcome, partVerdict, BAR.composing: at least 8 counted each way)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| 11-05 AFTER chrome/composing@textedit/paste.latin | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.hangul | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.jamo | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.mixed | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.emoji | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.combining | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.kanji | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.lines | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| 11-05 AFTER chrome/composing@textedit/paste.acceptance4 | none (the adaptation only) | AFTER-passing | AFTER-passing | yes |
| the base | BEFORE: the 9 rows given stage read, readWait timeout and the control's click kind (11-05 ran composing on the shipping build only) | LANDS | LANDS | yes |
| AFTER's one allowed miss | AFTER row 1 at the effect stage | LANDS | LANDS | yes |
| ruling 2: one AFTER read timeout | AFTER row 9 at a read timeout | DOES NOT LAND (read-stage timeout) | DOES NOT LAND: 1 read-stage timeout(s) on AFTER, counted | yes |
| ruling 3: two BEFORE deliveries | BEFORE rows 1 and 2 delivered | DOES NOT LAND (BEFORE delivered in 2) | DOES NOT LAND: BEFORE delivered in 2 counted | yes |
| ruling 3 at a low count: two BEFORE deliveries of 3 counted | BEFORE rows 4 to 9 with an inert click (not counted), rows 1 and 2 delivered | DOES NOT LAND (BEFORE delivered in 2) | DOES NOT LAND: BEFORE delivered in 2 counted | yes |
| two BEFORE failures at another stage | BEFORE rows 1 and 2 at the effect stage | DOES NOT LAND (stage other than read in 2) | DOES NOT LAND: BEFORE failed at a stage other than read in 2 counted | yes |
| premise failures to 3 counted | BEFORE rows 4 to 9 answered with no variant | INCONCLUSIVE (fewer than 4 counted) | INCONCLUSIVE: fewer than 4 counted in a half (AFTER 9, BEFORE 3), and nothing decisive | yes |
| ruling 1: premise failures to 7 counted | AFTER rows 1 and 2 posting their activation click | INCONCLUSIVE (under 8) | INCONCLUSIVE: AFTER met its delivery in 7 counted, under 8 | yes |
| ruling 1: premise failures to 8 counted | AFTER row 1 posting its activation click | LANDS | LANDS | yes |

## C2, the keys-then-click row (judgeJoin raise; synthetic fixtures, 11-05 ran none)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| the passing case | synthetic: 3 repetitions, every condition holding | PASS | PASS | yes |
| a raise sample | synthetic: repetition 2's order watcher sees Chrome above TextEdit 10 ms after the click | FAIL (not noRaise) | FAIL: 187-iso-raise-1: not noRaise | yes |

## C3, the dialog variant (judgeJoin dialog; synthetic fixtures, 11-05 ran none)

| case | edit | expected | outcome | as expected |
|---|---|---|---|---|
| the passing case | synthetic: 3 repetitions, every condition holding | PASS | PASS | yes |
| hasFocus still true after the release | synthetic: repetition 2's page focused after the release, no blur | FAIL (not pageReleased) | FAIL: 187-iso-dialog-1: not pageReleased | yes |
