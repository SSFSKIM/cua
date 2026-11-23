# #354: type_text's read-back, typeUnconfirmed, and the settle (hosted, final run 2026-11-17)

The final measurement for #354 is run [44031200818](https://github.com/SSFSKIM/cua/actions/runs/44031200818): kit
`probe/354-measure` 07570ad2, on the GitHub-hosted macos-latest image 20261102.0473.1 (macOS 26.7.2). It compares the
engine as merged, a7529ee0 (the read-back with the settle and the bounded walk), against 3141f170, the read-back before
the settle and the walk. App versions: Chrome for Testing 156.0.8078.80, Firefox 159.0, Safari 27.2. It produced
2,980 valid cells out of 2,980.

The rule, its limits and every decision behind it are in the native engine spec's Decision Log, the #354 entry
([`2026-10-18-own-native-engine-design.md`](../../doperpowers/specs/2026-10-18-own-native-engine-design.md)). The kit's
README (`scripts/probe-354/` on the kit branch) describes the cells and the oracle. Each cell is classed against the
page's own record of the field's final text, never against the engine's answer, and every cell goes through the kit's
privacy check. The scored outputs are the run's artifacts:

- `settle-rates.tsv`
- `settle-cost.tsv`
- `settle-diagnostic-cost.tsv`
- `no-key-confirmation.tsv`
- `large-page-summary.json`
- `settle-safety.tsv`

The runs before it:

- [43752829833](https://github.com/SSFSKIM/cua/actions/runs/43752829833), the primary A/B: the read-back against
  main without it.
- [44001080688](https://github.com/SSFSKIM/cua/actions/runs/44001080688), the follow-up on 3141f170. It found the
  false unconfirmed answers that the settle answers (Decision Log item 10.15).
- [44022876278](https://github.com/SSFSKIM/cua/actions/runs/44022876278), Firefox's caret diagnostic.
- [44022892172](https://github.com/SSFSKIM/cua/actions/runs/44022892172), Safari's accessibility diagnostic, which
  led to the bounded walk (item 10.16).

## Safety

- **0 wrong successes and 0 privacy failures, in every run.** No call answered success over a field that did not
  hold the text, and no secret's bytes reached a reply, a meta or a log.
  - Final run: 2,980 valid cells, both arms.
  - Primary A/B: 1,363 cells on the branch.
  - Follow-up: 1,269 cells on the branch.
- **Main without the read-back answered success over wrong text** 284 times in the primary A/B and 111 times in the
  follow-up. That is what #354 fixes.
- **The settle's safety argument (item 10.15).** Typing still follows the snapshot, so a later snapshot cannot make a
  success false. Every success still needs the field to read the expected value after the typing.

## The race cells: false unconfirmed, before → after

A race cell sends super+a, super+z or super+v with `pressKey`, then types at once. A false unconfirmed is a
`typeUnconfirmed` over a field whose final text is right.

| browser | race cells, false unconfirmed | race cells, wrong final text | clean cells, false unconfirmed | clean cells confirmed |
|---|---|---|---|---|
| Safari | 30 → 3 of 240 | 179 → 0 of 240 | 0 → 0 | 240 of 240 |
| Chrome for Testing | 95 → 7 of 240 | 81 → 0 of 240 | 0 → 0 | 240 of 240 |
| Firefox | 162 → 6 of 240 | 0 → 0 of 240 | 0 → 0 | 240 of 240 |

The clean cells are 720 of 720 confirmed on both arms.

Before the settle, the read-back answered every wrong final text as `typeUnconfirmed`: it was honest, but the race
still left wrong text in the field. After the settle, `type_text` waits for the key's effect before it takes its
snapshot and starts typing, so the race no longer leaves wrong text.

## The settle's cost

These are the settle's own reads, the snapshot's time, and the whole call's time, after the settle (a7529ee0). The
before arm's (3141f170) call time is in the last column; its snapshot was 0.4–0.8 ms p50. The before arm's race calls
took the read-back's whole second, because most of them answered unconfirmed.

| browser | cells | n | settle reads (p50) | cut by the cap | snapshot ms p50/p95 | call ms p50/p95 | before: call ms p50/p95 |
|---|---|---|---|---|---|---|---|
| Chrome for Testing | clean, super+a, 30 chars | 80 | 1 | 0 | 45.6/76.8 | 296/363 | 252/312 |
| Chrome for Testing | clean, super+a, 120 chars | 80 | 1 | 0 | 50.4/76.6 | 948/1045 | 876/1072 |
| Chrome for Testing | clean, super+a, 500 chars | 80 | 1 | 0 | 48.9/75.6 | 3668/4259 | 3638/4226 |
| Chrome for Testing | race, super+a, 30 chars | 80 | 2 | 0 | 81.7/146.8 | 354/451 | 1212/1260 |
| Chrome for Testing | race, super+v, 30 chars | 80 | 2 | 0 | 96.5/147.6 | 355/625 | 1233/1271 |
| Chrome for Testing | race, super+z, 30 chars | 80 | 2 | 0 | 81.5/143.8 | 339/399 | 1216/1261 |
| Firefox | clean, super+a, 30 chars | 80 | 1 | 0 | 60/79 | 306/350 | 248/283 |
| Firefox | clean, super+a, 120 chars | 80 | 1 | 0 | 47.1/77.1 | 911/1005 | 856/1022 |
| Firefox | clean, super+a, 500 chars | 80 | 1 | 0 | 52.4/76.9 | 3495/4033 | 3471/3993 |
| Firefox | race, super+a, 30 chars | 80 | 2 | 0 | 82.6/140.4 | 333/391 | 1212/1261 |
| Firefox | race, super+v, 30 chars | 80 | 2 | 0 | 78.7/138.7 | 331/411 | 1213/1246 |
| Firefox | race, super+z, 30 chars | 80 | 2 | 0 | 99.5/149.3 | 339/400 | 1210/1247 |
| Safari | clean, super+a, 30 chars | 80 | 1 | 0 | 57.3/76.1 | 337/424 | 267/361 |
| Safari | clean, super+a, 120 chars | 80 | 1 | 0 | 65.8/77.9 | 1090/1413 | 960/1242 |
| Safari | clean, super+a, 500 chars | 80 | 1 | 0 | 60.3/76.7 | 4290/6053 | 3929/5046 |
| Safari | race, super+a, 30 chars | 80 | 2 | 0 | 108.7/145.1 | 386/483 | 1248/1368 |
| Safari | race, super+v, 30 chars | 80 | 2 | 0 | 107.6/145.1 | 392/684 | 1244/1336 |
| Safari | race, super+z, 30 chars | 80 | 2 | 0 | 106/150 | 383/504 | 1240/1338 |

**The settle's scope.**

- **Every clean cell settles, by design.** Each one types after a super+a to the same app, which is within the settle's
  1 s key window. So each clean cell settles once (reads 1, a snapshot of about 50–60 ms p50). These rows are the
  settle's cost when the key is just before the typing, not the cost of typing on its own.
- **Calls with no key before them took no settle reads.** In the Safari no-key cells (below) the snapshot was 5.5/8.4
  ms p50/p95, and that time is the bounded walk, not the settle.
- **The unit tests show no settle without a recent key to that app's pid**
  ([`TypeReadbackTests.swift`](../../../native/engine/Tests/EngineTests/TypeReadbackTests.swift)):
  - `testAKeyPostedWithinTheWindowSettlesTheSnapshot`: no key, another pid's key, or a key past the window does not
    settle.
  - `testTheSettleRunsOnlyWhenAsked`: without a recent key, the snapshot's reads are the same as before the settle,
    with no sleep.

## Safari with no key first: the bounded walk

Background Safari names no focused element at the application when no key has just activated it (item 10.16).

| cells (Safari, an input, 20 each) | before (3141f170) | after (a7529ee0) |
|---|---|---|
| plain text, no key first | 0 of 20 confirmed (20 `noFocusedElement`) | 20 of 20 confirmed |
| a `{{secret:…}}` (equality) | 0 of 20 confirmed (20 `noFocusedElement`) | 20 of 20 confirmed |

The final text was right in all 80 cells.

## Limits measured

- **A large page in background Safari** (limit 11, ruling 1ea561bc:765, #395):
  - The page had 1,600 accessibility children.
  - In 20 of 20 calls the walk was cut at its 200-element bound (depth 8, 24.4/29.0 ms p50/p95) and claimed nothing.
    `type_text` answered `typeUnconfirmed` (`noFocusedElement`): no confirmation, never a wrong one.
  - The final text was right in 20 of 20.
  - The same calls' text-marker trace found the field in all 20 (the web area's selected marker range, whose leaf is
    an AXStaticText under the AXTextField). #395 is that route.
- **A secret in background Firefox** (limit 10, ruling 1ea561bc:761, #394):
  - Background Firefox does not move AXSelectedTextRange after typing: 0 of 2,425 reads matched the caret past the
    text (run 44022876278).
  - Every concealed confirmation requires that caret, so a secret typed there answers `typeUnconfirmed` (`unchanged`)
    even though it went in.
  - The documents tell the model to observe the field.
- **The remaining false unconfirmed answers** (3, 7 and 6 of 240 in the race cells) are limit 9 (#386): a key effect
  that lands after the settle's reads agree.
