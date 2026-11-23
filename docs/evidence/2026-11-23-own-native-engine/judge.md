# T10a: the native matrix's judge (#506)

This note covers Task 6a of the M5 wave-1 record (`docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`), T10a.
The judge (`scripts/native-matrix/summary.mjs`) now does five things it did not do before:

- It applies R3's declared departures, and only R3's one kind of departure.
- It gives no verdict to a row that has no valid vendor pair (ruling 1116).
- It gives no verdict to a sample taken with an alert frontmost or after a failed activate step (rulings 1136 and 1141).
- It counts the samples without a verdict per cell, and says whether each cell qualifies.
- It writes the report in the order of the three-point report.

The judge is built and unit-tested here. It has not yet judged a hosted run: the harness that fills its new fields is
T10b′'s job.

## The field contract (for T10b′)

The contract lives in one place, [`scripts/native-matrix/front-key.mjs`](../../../scripts/native-matrix/front-key.mjs). It
is cross-referenced from the Row and CellResult documentation in `cell-result.mjs`, and `rowProblems` checks the shape of
every row against it.

`Row.frontKey` belongs on every judged row of a full matrix run. It is required when the run's `meta.hosted` is true and
optional otherwise, so older records still judge.

```
frontKey: {
  apps:     [bundleId]        // the apps the cell itself puts on screen: the driven scene, the user window's scene
                              // (background, concurrent use, Unicode behind a user window), an out-of-process panel it opens
  activate: {app, front, key} // the activate step's own check, before the first act: did `app` become front and key
  before:   {front, key}      // after the activate step, before the act: the front app and the keyboard-focus app
                              // (bundle id, or null when it could not be read)
  after:    {front, key}      // the same, after the act and its check
}
```

The readings hold bundle ids only. They never hold a pid or a title, or anything else from a window the run does not own.

The full run's `meta` gains two fields:

- `meta.hosted: true` on a GitHub-hosted runner.
- `meta.desktopMode`: `'shared'`, the default. The matrix is judged only in shared mode (R3).

A row that a departure may cover needs two more readings from its case's own check. These are the harness's to record
when the first departure is declared:

- `outcome.unchanged`: the case's watched state read unchanged afterwards.
- `outcome.effect`: when the act threw, whether the case's check still read the intended effect.

## The rules

**Samples with no verdict.** A sample has no verdict (NO VERDICT) when the first of these causes applies, checked in this
order:

| Cause | When it applies |
|---|---|
| `unread` | A hosted run's sample has no readings, or any sample has a null reading. |
| `activation` | The activate step did not take front and key. This is NO VERDICT, not FAIL (ruling 1141). |
| `alert` | An app outside `apps` was front or key, before or after the act (ruling 1136). In a background cell the driven app is listed in `apps`, so a driven app that takes front stays the oracle's interference failure; it cannot turn into NO VERDICT. |
| `invalid` | The harness's own invalid reason. |
| `unmeasured` | A speed or finding sample with `ok` false. Before this change, an unmeasured finding target counted as unresolved. |
| `unpaired` | A cua sample whose verdict rests on the vendor's answer has no vendor sample with a verdict from the same run (ruling 1116). Verdicts that rest on the vendor's answer: frontmost method rows, the pressKey row, speed, finding, and any declared departure. |

A sample without a verdict is never counted as a pass or as a fail. It is also left out of interference, speed and
finding.

**No valid pair, no verdict.** A frontmost cua sample with no vendor pair has no verdict, whether it passed or failed.
Before this change it read `equal` if it passed and had to pass on its own if it failed. A sample with a pair that is
proven worse still fails its row.

**Qualification.** A cell qualifies when each side has at least three runs (`RUNS_PER_SIDE`) in which every sample of the
cell has a verdict. Every cell of the manifest that does not qualify is missing proof. This is how the manifest check now
tests validity as well as presence.

A cell that does not qualify reads `no-verdict` unless one of its samples was proven worse. Finding counts as proven
worse when it is lower on the paired samples. Speed rows that do not qualify still show what was sampled
(`not qualified (yes as sampled)`), but that result is never counted.

**R3, the declared departures.** The file is
[`scripts/native-matrix/expected/departures.json`](../../../scripts/native-matrix/expected/departures.json); the code is
`scripts/native-matrix/departures.mjs`. Each entry has the form
`{section, id, vendor: {answer: 'ok'}, cua: {answer: 'refused'|'unconfirmed', sentence}, decision}`.

These entries are failures in their own right: the judge lists them as blocking (`departures: …`), and they apply to
nothing:

- an entry of any other kind;
- an entry naming the pressKey row (ruling 1119);
- an entry naming a speed, finding or not-judged row, or a row outside the manifest;
- an entry naming a method case that expects a refusal (there the vendor's `ok` is its refusal);
- an entry with no sentence, or with no `decision`;
- an entry that duplicates another.

A departure covers a cua sample only when all of these hold:

- the vendor's sample from the same run has a verdict and answered ok (its check passed and its act threw nothing);
- cua's act threw the declared sentence;
- a refusal read its state unchanged, and an unconfirmed answer read unchanged or the intended effect;
- the oracle held on both sides wherever the row is one the oracle judges.

If cua answered as declared but no vendor pair exists, the sample has no verdict (`unpaired`): a declaration never
supplies an answer nobody observed. A row with a covered sample reads `declared` and is listed under "What changes for a
user" with its Decision Log entry. Any other difference fails.

What counts as "differs" is judged on the row's own check. When cua's effect is verified where the vendor failed, the row
stays `better`, as S L225 ("equal or better") allows. When cua answers ok where the reference is a refusal, the row fails
its own check.

A departure does not demote PASS to OWNER. The verdict line reads `PASS (N declared departures: What changes for a
user)`. An entry that no sample needed is an owner line: "remove it".

**One declaration mechanism.** The Unicode expected file (`expected/unicode.json`, which was empty) is retired, together
with its reader and the run's `applyDeclarations`. Any `declared` carried on a full-run row is named as missing proof and
the row is judged as it read. T8b's pressKey message keeps its own wording.

Three other mechanisms stay, because they are not the matrix's departures:

- the oracle's owner-accepted families, `interference.declared`;
- the settle cell's declarations, which come from the native-mac suite's expected file;
- the residue cells' vendor defects.

**Device mode.** The report states the mode the full runs recorded. A full run that records a mode other than `shared`
is missing proof.

**The report's order.** Header (verdict, runs, device mode and hosted count), then Blocking, Missing proof, Owner
options, For the owner, then the three points as bullets, then:

1. Speed (in-cell ms)
2. Finding elements
3. Not interfering
4. What changes for a user
5. Not judged
6. NO VERDICT by cell, one row per cell with a sample without a verdict or that does not qualify: verdict, vendor runs
   and cua runs out of 3, the causes on each side, and whether it qualifies

The detail sections follow (Methods, Launch, Concurrent use and intervention, Korean and Unicode, Narrowed, Other cells).
No owner page was written; that is T14's.

## What the old records judge as now

All three committed holds still load through `readResults` and the CLI.

| Hold | Before | After |
|---|---|---|
| 3 (`m2b/hold3`) | FAIL, 32 blocking | FAIL, 31 blocking |
| 2a (`m2b/hold2a`) | FAIL | FAIL, blocking list unchanged (137 lines) |
| 2b (`m2b/hold2b`) | FAIL | FAIL, blocking list unchanged (16 lines) |

**Hold 3.** The one line that dropped is `method: chrome/frontmost/selectText.notText is worse on cua`. Run 1's pair
refused alike, so it is equal. cua's run 2 has no vendor run, so that sample is `unpaired` and no longer fails on its
own; #190 later found the expected file wrong there. The remaining blocking lines are the concurrent-use and launch
interference, the Chrome composing rows, `chrome/korean/typeText.lines`, both midSwitch rows, the three pressKey rows
recorded before ruling 1119, and finder's finding share (0.3324 against 0.3333).

No method row of hold 3 is `worse` any more. Its 118 method rows all read no-verdict, with 216 `unpaired` and 72
`invalid` cua samples, and 33 `invalid` vendor samples. 0 of 355 cells qualify, because hold 3 has one vendor run and two
cua runs.

**Holds 2a and 2b.** No cell qualifies (0 of 355). The 2a records carry 222 `invalid` cua samples and 381 `invalid`
vendor samples; the 2b records carry 13 cua and 69 vendor.

**Hold 10.** Its records are not in the repository (T7 commits them), so they were not run. By the rules above, its 88
invalid vendor rows now leave the cua samples of those runs `unpaired`. Those rows read no-verdict, where they read
`equal` before.

## Tests

Commands run:

- `node --test test/native-matrix/*.test.mjs`: 402/402 pass, output clean.
- The sibling suites that import these modules, `test/cursor-sitting/item-187.test.mjs`, `item-188.test.mjs` and
  `test/repl-parity/native-mac-run.test.mjs`: 77/77 pass.

**RED,** before any implementation. The command was
`node --test test/native-matrix/{front-key,departures,summary,unicode-plan}.test.mjs`, and 17 tests failed. Two failed
because `front-key.mjs` and `departures.mjs` did not exist yet (`ERR_MODULE_NOT_FOUND`). The other 15 failed on the old
judge, for these reasons:

- an unpaired sample read `equal`;
- row-level `declared` still excused a row;
- there were no `departures`, `cells` or `account` fields;
- the report had no "What changes for a user" or "NO VERDICT by cell" section;
- the Unicode plan still exported `readDeclarations`.

The same thing happened with `cell-result.test.mjs`: the frontKey shape test failed until `rowProblems` checked it.

**GREEN.** The same commands give the totals above.

## Files

New:

- `scripts/native-matrix/front-key.mjs`
- `scripts/native-matrix/departures.mjs`
- `scripts/native-matrix/expected/departures.json`
- `scripts/native-matrix/cell-verdict.mjs`: the per-cell rules, split out of `summary.mjs`
- `scripts/native-matrix/manifest.mjs`: `manifestOf` and `cellsOf`, split out so that `departures.mjs` can check rows
  without an import cycle; `summary.mjs` re-exports `manifestOf`, `SPEED_OPS`, `judgeMethod`, `judgeSpeed` and
  `judgePressKey`
- `test/native-matrix/front-key.test.mjs`
- `test/native-matrix/departures.test.mjs`

Changed:

- `scripts/native-matrix/summary.mjs`
- `scripts/native-matrix/cell-result.mjs`
- `scripts/native-matrix/unicode-plan.mjs`
- `scripts/native-matrix/unicode-run.mjs`
- `scripts/native-matrix.mjs` (header text only)
- tests: `summary`, `cell-result`, `unicode-plan`, `unicode-run`

Removed: `scripts/native-matrix/expected/unicode.json`.

## For the design session

1. **The Unicode named-cause declarations are gone.** Spec part 6 still says a failed Unicode row with a named cause
   (autocorrection, an app ignoring Unicode events) "is declared in the expected file". Under R3's one kind, that can no
   longer be done. A failure that both engines share now fails on cua, because Unicode rows are judged on their own
   outcome.

   Hold 3 has such rows: `chrome/korean/typeText.lines`, and several Chrome composing typeText rows, fail on both
   engines. §6's #420 line ("if the vendor drops it too the row is equal") suggests these should read `equal`. Making
   that so would change the Unicode reference rule, so I did not. Acceptance 4's TextEdit rows would still have to land
   on cua whatever the vendor did. This needs a ruling, and the spec's part 6 sentence needs amending either way.
2. **The triple is strict.** With three runs a side, a single sample without a verdict in a cell means that cell does not
   qualify. On a hosted runner with the alert up, that will be common. The count per cell is in the report, ready for the
   owner's numbers (ruling 1141).
3. **Departure readings are not recorded yet.** No case records `outcome.effect` today, and `outcome.unchanged` is
   recorded only by some method cases. A departure on any other row cannot be proven until the harness records these
   readings. The departures file is empty, and #420's R3 declaration still waits on the vendor pair.
