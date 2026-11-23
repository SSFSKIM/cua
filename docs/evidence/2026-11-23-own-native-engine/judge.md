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

## Fix wave: ruling 1144 and the task review

This wave builds ruling 1144 (shared failures) into the judge and fixes the task review's six findings and its minor
point. It also adds the per-run counts the design session asked for.

**Ruling 1144: shared failures.** The rule lives in `cell-verdict.mjs` (`judgeCell`, in its `absolute` and `pressKey`
modes) and `answers.mjs`. It applies to Unicode rows, which are judged by an absolute expected string.

- A cua sample that passes needs no pair.
- A cua sample that fails, with no vendor sample from an eligible run, is `unpaired`: it has no verdict.
- If the vendor passed the paired sample, the row fails.
- If both failed the same way, the sample is `shared` (equal). Same way means the same answer and the same read-back
  hash.
- If the vendor answered ok with the wrong text and cua refused or answered unconfirmed, the sample is better. It is
  listed under "What changes for a user" as "better, no entry needed".
- Any other failure, including a cua false ok beside a vendor refusal, fails the row.

The pressKey row keeps ruling 1119's rule: a vendor sample that composed otherwise fails the row, unless cua's sample
from the same run failed the same way.

Shared samples appear in a new report section, "Shared limits (vendor has them too)", after "What changes for a user".
They are grouped by cause: the scene, the method, and the answer both engines gave. Each group carries its ticket
priority (P2 or higher for a shared false ok, P3 for an honest shared failure). The verdict line counts shared limits
beside the departures; they do not demote PASS.

**What counts as an answer.** `answers.mjs`'s `answerOf` gives a sample's answer one of four kinds: `ok`, `refused`,
`unconfirmed` or `error`. The kind comes from the recorded error name alone, checked against cua's engine names of each
kind (`REFUSAL_NAMES`, `UNCONFIRMED_NAMES`, taken from `native/engine` `EngineError` names). Two answers that are both
plain errors are the same answer only when their sentences are equal.

The read-back hash is now recorded:

- `probe-plan.mjs` `fieldCheck` keeps it as `outcome.hash`, so every typeText, paste and composing row has it.
- `unicode-run.mjs` keeps it for the midSwitch row too.
- Hold 3's records predate this, so none of their failures can be shown shared.

**The review findings.**

1. **Provenance.** `pairableRuns` reuses the per-run checks that `proofProblems` makes (`pairProblems`). A run number is
   eligible when it has exactly one vendor and one cua run, with one hold, one commit and one approved build. Only
   eligible runs' vendor samples answer for cua's samples or let a departure find its vendor ok. A cua failure against
   ground truth (`own` mode) still fails with no pair.
2. **Speed and finding.** Both compare the same eligible observations on both sides: only the runs where each side has
   samples with a verdict count. Each side's own counts stay in `account` as diagnostics.
3. **Method timings.** The per-method timings are now in the manifest: one `<scene>/method.<method>.<case>` row per
   frontmost case per run. The id comes from `plan.mjs` `methodTimingId`, which `steps.mjs` now uses too. A speed sample
   without a numeric `inCellMs` is `unmeasured`.
4. **Two failures in front.** A frontmost pair where both failed is `shared` only as the same failure: the same answer
   and the same boolean effect readings, or the same read-back. Otherwise it is worse, so a vendor refusal beside a cua
   wrong effect now fails.
5. **The departure check.** An entry must name `cua.errorName`, and that name must belong to the declared kind; the
   kind is no longer taken from the claim. `answeredAs` matches the row's recorded `outcome.errorName` and its sentence
   with the server prefix stripped. A sentence pattern is refused as too broad when it matches the empty string or has
   fewer than 10 literal characters in a row, so `.*`, `.+`, `x` and `(refused|ok)` are all refused.
6. **Acceptance rows.** Any row whose string id is `acceptance<N>` (`isAcceptanceRow`) is absolute: a departure entry
   naming one is a blocking problem, and neither a shared failure nor an honest refusal satisfies one.

**The minor point.** `frontKey.after: null` now records a skipped act, and the activation check runs before the
null-reading check. A failed activate step therefore stays `activation`, never `unread`.

**Per-run counts.** The "NO VERDICT by cell" table gains two columns, `vendor by run` and `cua by run`. Each shows, per
run, how many of the run's samples have a verdict (for example `r1 1/1, r2 0/1`). The `runs` column is the number of
runs in which every sample has one.

### What the old records judge as now

All three holds still judge FAIL. The blocking lists changed against T10a's first commit as follows:

| Hold | Line that left the blocking list | Why |
|---|---|---|
| 3 | `unicode: chrome/midSwitch/typeText.long failed on cua` | cua passed run 1; its failed run 2 has no vendor run, so it is unpaired. |
| 2a, 2b | `finding elements: finder is lower on cua` | Only eligible observations are compared now; no pair there is eligible. |
| 2a | the cua lines for `chrome/korean/typeText.lines`, `chrome/midSwitch/typeText.long`, `electron/midSwitch/typeText.long` and the two non-TextEdit pressKey rows | No run pair there is eligible, so those cua samples are unpaired. The two pressKey rows still fail, now as "composes otherwise on the vendor" (ruling 1119). |

Hold 3's `chrome/korean/typeText.lines` stays FAIL: its records carry no read-back hash, so its shared failure cannot be
shown. Hold 3's `chrome/frontmost/selectText.notText` run 1 pair now appears as an honest shared failure ("Could not
find the requested text to select in the element"), which agrees with #190's finding.

### Tests

**RED,** before implementing:
`node --test test/native-matrix/answers.test.mjs test/native-matrix/front-key.test.mjs test/native-matrix/departures.test.mjs test/native-matrix/summary.test.mjs`
gave 17 failing tests. They covered every new rule: the kind checked against the error name, the broad sentences, the
acceptance-row entry, the skipped act, the provenance pairs, the eligible speed observations, the method timings, a
different frontmost failure, the four 1144 cases, the acceptance rows, and the new table columns. The read-back hash
test in `probe-plan.test.mjs` failed the same way until `fieldCheck` kept the hash.

**GREEN:**

- `node --test test/native-matrix/*.test.mjs`: `# pass 413`, `# fail 0`.
- `node --test test/cursor-sitting/item-188.test.mjs test/cursor-sitting/item-187.test.mjs test/repl-parity/native-mac-run.test.mjs`:
  `# pass 77`, `# fail 0`.

### Concerns

- **No cua answer can yet be shown to be a refusal.** The facade hands the cell a plain `Error`: hold 3's cua rows
  record `errorName: 'Error'`, never the engine's name. Until the harness records the engine's own name (T10b′), no
  departure applies and no honest-refusal better holds; those rows read as plain errors instead.
- **Two frontmost failures need comparable effect readings.** A pair is equal only when both rows record the same
  boolean effect readings or a read-back. A case whose outcome records neither will fail whenever both engines fail.
- **Shared-limit grouping is mechanical.** A group is a scene, a method and the answer both engines gave. Naming each
  cause for its ticket is the design session's job.

## Round 2: the re-review's five fixes and its minor point

This round answers the second review of T10a. Two rules from the first fix wave are narrowed: the same-failure rule for
frontmost rows (finding 4) and the acceptance-row test (finding 6).

1. **The timing triple.** A cell now qualifies on complete run pairs, not on each side's own count. A complete run pair
   is a run where:
   - the pair is eligible;
   - both sides hold the same samples, as many as planned;
   - every sample on both sides has a verdict.

   A cell qualifies with three complete run pairs. The plan is one sample per run for every row except a scene's speed
   ops, which plan the run's `meta.samples` (0 when the vendor's and cua's plans differ, so such a run never completes).

   Official speed statistics and the beat come from the complete run pairs only. A partial run's readings feed
   `partial` and the `provisional` beat, which the report shows and never counts. Finding uses the same complete runs.

   Before this, three complete pairs plus a partial run reported a beat. A probe cell also qualified with three complete
   runs a side but none in common. Both cases are now tests. The NO VERDICT table has a "complete pairs" column, and its
   vendor and cua run counts are diagnostics.
2. **Pair eligibility.** `pairProblems` now requires one device (`result.device`) and one OS (`meta.os`, the record's
   `{name, version, build}`) on each run's vendor and cua results, beside the hold, the commit and the approved build. A
   cross-device or cross-OS pair is not compared, and no departure finds its vendor ok there. Hold 3, 2a and 2b each
   record one OS, so their pairs are unchanged.
3. **The user's value, and conservative answers.**
   - `answers.mjs` `sameReadBack` needs the same `outcome.hash`, and `outcome.userKept` not false on either side. A
     changed user value on one side, or on both, is never a shared failure.
   - The better case for a conservative answer now needs recorded evidence in cua's sample: refused needs
     `outcome.unchanged` with no `effect`; unconfirmed needs `unchanged` or `effect`. It also needs the user's value
     kept and the oracle holding. `conservativeEffect` is the one helper for this; the departures' `answeredAs` now
     uses it too.
   - Before this, an unconfirmed answer with another wrong read-back and `unchanged: false, effect: false` was better.
     It now fails.
4. **Where ruling 1144 applies.** Ruling 1144 now covers only the fixed-string rows: the Unicode rows judged by an
   absolute expected string, plus the pressKey row.
   - The mid-switch row (`isMidSwitchRow`) is judged in `own` mode, on its measured prefix: a cua failure fails, paired
     or not.
   - Frontmost method rows no longer produce shared limits. When both engines fail, the row is `equal` only with the
     same answer and every effect field the case recorded equal (`sameEffect`: numbers and names as well as booleans,
     the answer's keys apart). Finder selecting no rows against two is worse.
   - cua refusing or answering unconfirmed where the vendor answered ok needs an R3 entry on a frontmost row, as before.
     The undeclared better case exists only on fixed-string rows.
5. **Shared-limit grouping.** Each shared observation is grouped by its own cause and priority, and its row's sample
   count is aggregated within that group. One timeout plus two shared false oks on one row now report a P3 group with
   one sample and a P2 group with two. The Unicode line of the three points no longer counts a shared row as a pass; it
   reads "N of M rows pass on cua, K a shared limit".

**The minor point.** `ACCEPTANCE_ROWS` names Acceptance 4's two rows explicitly: TextEdit typeText of its string under
the Latin and the Korean source (`textedit/latin/typeText.acceptance4`, `textedit/korean/typeText.acceptance4`). The
string's other rows (Chrome, Electron, paste, the composing and per-context conditions) are ordinary fixed-string rows.

### What the old records judge as now (round 2)

All three holds still judge FAIL. Against the first fix wave (28122c80b):

| Hold | Change | Why |
|---|---|---|
| 3 | `unicode: chrome/midSwitch/typeText.long failed on cua` is back | The mid-switch row is judged on its own measured prefix: cua's run 2 failure fails it, unpaired or not. |
| 3 | The notText shared limit is gone | `chrome/frontmost/selectText.notText` run 1: both refused alike, so the sample is `equal`. A frontmost row lists no shared limit. The row stays no verdict (cua's run 2 is unpaired). |
| 2a | `unicode: chrome/midSwitch/typeText.long` and `electron/midSwitch/typeText.long failed on cua` are back | The mid-switch rule, as for hold 3. |
| 2b | none | |

### Tests (round 2)

**RED,** before implementing:
`node --test test/native-matrix/summary.test.mjs test/native-matrix/unicode-plan.test.mjs` gave `# pass 34`, `# fail 14`.

- Six failures were the new tests:
  - the partial run's readings and the planned samples;
  - a probe with no common complete run;
  - the cross-device and cross-OS pairs;
  - the user's value and the conservative-answer evidence;
  - the mid-switch and frontmost scope;
  - the per-observation grouping and the Unicode count.
- One was the explicit acceptance rows and `isMidSwitchRow`.
- Seven were existing tests changed to the new rules: frontmost both-fail now reads `equal`, and the NO VERDICT table
  has a complete-pairs column.
- `answers.test.mjs` gained the `sameEffect`, `sameReadBack` and `conservativeEffect` cases.

**GREEN:**

- `node --test test/native-matrix/*.test.mjs`: `# tests 420`, `# pass 420`, `# fail 0`.
- `node --test test/cursor-sitting/item-188.test.mjs test/cursor-sitting/item-187.test.mjs test/repl-parity/native-mac-run.test.mjs`:
  `# tests 77`, `# pass 77`, `# fail 0`.

### Decisions (round 2)

- The pressKey row counts as a fixed-string row: its expected text is absolute per source (`rk`, `가`). It keeps ruling
  1144's same failure, combined with 1119's rule that a vendor composing otherwise fails the row.
- "Complete" is applied to every judged cell's qualification, not only speed's, because the review's probe case is a
  qualification case. For one-sample rows, a complete pair is simply an eligible run with a verdict on both sides.
- A frontmost row's effect equivalence compares every effect field the case's check recorded. Per-case equivalence
  tables were not built: the recorded fields are already the case's own. The comparison errs strict: a count that
  differs, such as Open-panel `elements`, makes the pair worse.
- The conservative-answer evidence is the recorded `unchanged` or `effect` only. It is not inferred from the read-back
  (an empty field), which keeps it the same contract the departures use.
- If both sides changed the user's value, the failure is not shared either: cua changing it fails on its own.

### Concerns (round 2)

- The better case for a conservative answer on a fixed-string row needs `outcome.unchanged` or `outcome.effect` on
  Unicode rows, beside the engine's error name. Neither is recorded today; both are T10b′'s to add.
- A frontmost pair whose case records a volatile count, such as `elements`, will read worse whenever both engines fail.
