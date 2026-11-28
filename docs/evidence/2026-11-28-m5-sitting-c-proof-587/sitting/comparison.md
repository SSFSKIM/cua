# Native matrix summary (proof run: 7 cells, no base)

Verdict: **PASS**

Proof runs (filtered, judged alone, ruling 1248): 3 vendor, 3 cua (3 per side are the rule); the verdict is about these 7 cells alone.
Device mode: shared (the default), recorded by every full run; hosted: 6 of 6 full runs.

## The three points

- **Speed**: 0 of 0 measured ops beat the vendor by at least 10% with p95 not worse; 0 missed (the owner's fork), 0 unmeasured or not qualified.
- **Finding elements**: not in the proof; resolved targets vendor 0, cua 0 of 0.
- **Not interfering**: cua 100% (15/15), vendor 100% (15/15); cua route-4 actions outside accepted families: 0; declared for the owner: 0.
- **What changes for a user**: 0 declared departure(s) (R3).
- **Concurrent use and intervention**: 1 of 1 rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).
- **Korean and Unicode**: 1 of 1 rows pass on cua.
- **NO VERDICT**: 0 cua and 0 vendor sample(s) without a verdict; of them `alert` (an alert in front or key, or the alert guard's refusal): cua 0, vendor 0; 0 of 7 cells do not qualify.

## By the lane that ran first (ruling 1226)

Run numbers by the lane that ran first: vendor first 2, cua first 1. Failed samples: 0 in vendor-first runs, 0 in cua-first runs; samples without a verdict: 0 and 0. Recorded, never judged.

## Composing retries (ruling 1229)

A composing group whose check did not read the jamo redid its setup and re-posted, up to three attempts. By lane: vendor 0 retries in 0 group(s), 0 never composed; cua 0 retries in 0 group(s), 0 never composed. Recorded, never judged.

Each attempt's field was emptied by the harness's own Accessibility write (ruling 1229(b)), or by the lane's engine where that write did not read back empty: vendor 3 by the harness, 0 by the engine, 0 by neither, the engine's own emptying tried on 0; cua 3 by the harness, 0 by the engine, 0 by neither, the engine's own emptying tried on 0.

| group | engine | runs | runs retried | retries | never composed | attempts emptied by the harness | by the engine | by neither | engine fallbacks tried |
|---|---|---|---|---|---|---|---|---|---|
| textedit@electron | cua | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| textedit@electron | vendor | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |

## Evidence by job (ruling 1228)

Each run's cells come from its full run's job, but those a filtered rerun replaced, both lanes together (./combine.mjs).

- run 1: job 46095539139 attempt 1
- run 2: job 46095539139 attempt 2
- run 3: job 46095539139 attempt 1

## Runners by run (sitting C split into jobs, ruling 1228)

Each run's pair stood on one runner; the runs did not need to.

- run 1: macos27 20261123.0387.2, run 46095539139 attempt 1, VM 7689eda3-e656-4565-89c4-05b9ea79125d; macOS 27.0.1 (26A434)
- run 2: macos27 20261123.0387.2, run 46095539139 attempt 2, VM a443c934-403d-4255-abf1-dc4f51ad33cf; macOS 27.0.1 (26A434)
- run 3: macos27 20261123.0387.2, run 46095539139 attempt 1, VM 0be28e93-0ebd-4664-84db-d8b36b09231b; macOS 27.0.1 (26A434)

## Speed (in-cell ms)

## Finding elements

| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |
|---|---|---|---|---|---|---|

## Not interfering

The background, launch, concurrent-use and behind-a-user-window Unicode rows with a verdict, by the oracle (the front app, the top window, the focus, activations, the route).

- cua: 100% (15/15)
- vendor: 100% (15/15)

- User windows to the top (ruling 1221): electron cua waited 3, raised 0, raise failed 0; electron vendor waited 3, raised 0, raise failed 0; finder cua waited 6, raised 0, raise failed 0; finder vendor waited 0, raised 6, raise failed 0; textedit cua waited 3, raised 0, raise failed 0; textedit vendor waited 3, raised 0, raise failed 0.
- R3's witness (ruling 1225): the control seen in 6 of 6 runs; 0 row(s) NO VERDICT on it.
## What changes for a user

The places where cua refuses or answers unconfirmed where the vendor answered ok (R3), each declared with its Decision Log entry; nothing else can be here.

No declared departure was observed in these runs.

Known capability differences no matrix cell exercises (report text, never judged):

- type_text with no focused element: cua answers typeUnconfirmed (noFocusedElement) where the vendor answers ok: cua does not vouch for typing it cannot place (#597, P3, deferred; ruling 1247). No matrix cell exercises it: report text, never judged.

## NO VERDICT by cell

No cell has a NO VERDICT sample, and every cell qualifies (3 complete run pairs).

## Methods

| method | textedit | finder | chrome | electron | openPanel | savePanel | windowless |
|---|---|---|---|---|---|---|---|
| get_app_state | not run | not run | not run | not run | B better | n/a | not run |
| list_apps | not run | not run | not run | not run | n/a | n/a | n/a |
| click | not run | not run | not run | not run | B better | n/a | n/a |
| drag | not run | n/a | not run | not run | n/a | n/a | n/a |
| paste | not run | n/a | not run | not run | n/a | n/a | n/a |
| perform_secondary_action | not run | not run | n/a | n/a | n/a | n/a | n/a |
| press_key | not run | not run | not run | not run | not run | not run | n/a |
| scroll | not run | not run | n/a | n/a | n/a | n/a | n/a |
| select_text | not run | not run | not run | not run | n/a | n/a | n/a |
| set_value | not run | n/a | not run | not run | n/a | not run | n/a |
| type_text | not run | F better / B better | not run | not run | not run | not run | n/a |

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
| finder/background/typeText.typeSelect@electron | equal | 3/3 | 3/3 | - | 2' |
| finder/background/typeText.typeSelect@textedit | equal | 3/3 | 3/3 | - | 2' |
| finder/frontmost/typeText.typeSelect | equal | 3/3 | 3/3 | - | 2' |
| openPanel/background/click.cancel@finder | equal | 3/3 | 3/3 | - | 3 |
| openPanel/background/getAXState.panel@finder | equal | 3/3 | 3/3 | - | - |

## Concurrent use and intervention

Each row against its own outcome (the user's keystroke kept, userIntervened, the refusal); the vendor's recorded beside it.

| row | verdict | vendor ok | cua ok |
|---|---|---|---|
| textedit/concurrent.sheet@electron | equal | 3/3 | 3/3 |

## Korean and Unicode

Each field's cell: cua ok/valid, then the vendor's; a cua row that failed is marked. Read back by SHA-256 against the text expected: the string sent, and for pressKey r k, rk under Latin and 가 under Korean 2-Set (ruling 1119).

### latin

| row | textedit | chrome | electron |
|---|---|---|---|
| typeText.latin | 3/3 · 3/3 | - | - |

