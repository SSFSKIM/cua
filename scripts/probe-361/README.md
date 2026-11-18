# #361 hosted measurement and qualification: type_text's paste route

A disposable hosted macOS kit, not product code. It measures how type_text's paste route answers on GitHub-hosted macOS today, and then qualifies the #361 fix (the keyed route's exact read-back, #354, extended to the paste route) against that baseline. It was built from `probe/414-qual`, and reuses that kit's long-poll fixture server, owned cover and activation witness, and its one-engine-connection-per-trial harness shape.

```sh
gh workflow run probe-361-qual.yml --ref probe/361-qual -f main="$MAIN_SHA" -f mode=measure            # Phase 1: main alone
gh workflow run probe-361-qual.yml --ref probe/361-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f ax=omit
```

## What runs

- **Heads.** Unmodified release builds of exact SHAs (`git worktree add --detach`, clean before and after the build). Each head's own production sky wrapper, native service and protocol (`src/services/sky.mjs`, `src/services/engine/service.mjs`) carry the literal `type_text` call. Only the head under trial holds an engine connection.
- **Lanes.** Safari, Chrome for Testing, Firefox, Electron (`../probe-390/fixture`, default window) and an owned AppKit fixture (`fixture.swift`: `NSTextField` single line, `NSTextView` multi line, a real Edit menu). Each lane tries the background first, under the owned cover with #395's activation witness, and falls back to frontmost only when the background could not be set up before any cua call. The paste route activates the target itself (route 3's fake activation); whether anything other than the cover became active during the action is recorded per trial (`presentationHeld`), not used to invalidate it.
- **Input sources.** `host.swift` enables (with its parent method when needed) and selects each source through TIS in the runner's own session; a fresh process must read it back, as a layout-free source with the per-context preference off. A source that fails this is recorded and skipped, never faked. The source is re-read before every trial (`source-drift` is invalid), and the engine's own `inputRoute` must be `paste` (`route-not-paste` is invalid).
- **Cells**, ten per cell per head to measure, twenty to qualify, interleaved (`cells.mjs`). Text is synthetic CJK in the source's script (Hangul, kana and kanji, hanzi), with or without ASCII:
  - plain: CJK and mixed text into an empty field, the same into a prefilled field, mixed text over a page- or app-selected range, three lines into the multi-line field, two lines into the single-line field (whose expected content has no newline, as #354 expects of a Return there);
  - negative controls: `rewrite` (the first paste input rewrites the first pasted character in place, same length, in a 300-unit prefilled field), `add` (the first paste input adds one `z` at the caret), `stale` (⌘V's key-down, or the paste event before insertion, moves the caret to the field's start).
- **Per trial**: the route taken, the outcome (success or the native error name) and its reason (main: the last line's paste stage and wait; fix: `typeReadback`), whether the field's final content equals the expected value (the fixture's own boolean), whether a control's perturbation was realized exactly, whether the pre-trial synthetic clipboard came back exactly (string and types, checked by the helper), the engine's own `paste.restore`, sky's `cua/serviceMs`, and the witness.
- **Privacy** (`check.mjs` `scan`), over the native reply, sky's result and error, the forwarded meta, emitted content, captured console and the engine's output: the setup field's canary and the clipboard's content never appear; the field's content appears only on a `valueMismatch`, and only in an error message; the 300-unit control's first and last 30 units (beyond #354's 100-unit excerpt radius) never appear.
- **AX read-back probe** (`ax.swift`, `patch-ax.mjs`; `phase=ax`): an instrumented copy of main, never pooled with stock, polls the app's focused element every 5 ms from the paste route's start until 1.5 s after it answered: whether its AXValue equals the expected value and when it first did, and whether the focused element is the fixture's target field (by its label), the setup field, or something else.

A setup failure (before the action) is an invalid row with its step, never a product miss; so are a route other than paste and an unrealized control. The witness is read once more after the seed and the source re-read (by the helper and a fresh process) after every setup transition, both just before the call, so a loss there is setup, not the paste's. Content is read at the answer (`exactAtAnswer`), polled for up to 2.5 s, and read once more 300 ms later; the last read is the settled content every verdict uses. Fixture and AX comparisons are by UTF-16 units, as #354's. Six invalid rows in a row stop that source.

**Gates** (`check.mjs` `gates`, qualify only): full coverage of every usable source, cell and head; every plain fix row that delivered exactly, or whose paired main row did, is an exact delivery confirmed by the read-back (a delivery main makes and the fix loses fails); every realized control answers `typeUnconfirmed`; zero wrong successes on the paste route; the clipboard restored on every attested fix row; the route unchanged from main's per cell; no privacy flag on a fix row. A measurement passes when every usable source ran all its rows without an abort; an unusable source is reported, not faked.

`report.mjs <dir>` prints the tables below from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-361-qual.yml`, id `423150923`, [registration](https://github.com/SSFSKIM/cua/actions/runs/44406041558) (Ubuntu only). Baseline `517ab5430a3a81718910b030488ba8d855087b21` throughout. Hosted macOS 26.7.2, images `20261102.0473.1` and `20261112.0504.1` (the runner pool rotates; Chrome for Testing was 156.0.8078.80 on one and 157.0.8103.78 on the other), Safari 27.2, Firefox 160.0, Electron 44.4.5 / Chromium 152.0.7977.130.

| Run | Kit | Mode | What it established |
|---|---|---|---|
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44406085398) | `4c65c8c2` | one trial per cell | Every lane reached its fixture under the cover, zero invalid rows. Korean 2-Set and Pinyin enabled and selected; both Japanese modes read enabled but `TISSelectInputSource` answered `-50` (paramErr), because their Kotoeri method was not enabled. Fixed in `604eb156` (the nearest installed ancestor method is enabled first). |
| [Phase 1 measurement](https://github.com/SSFSKIM/cua/actions/runs/44408854885) | `604eb156` | ten per cell, main only, plus the AX probe | Below. |

## Phase 1: main measured

**Input sources.** All four sources were enabled, selected through TIS and read back by a fresh process (layout-free, per-context off) on every stock lane, on both images: Korean 2-Set (`com.apple.inputmethod.Korean.2SetKorean`, enabled by the kit), Japanese Romaji and Kana (`com.apple.inputmethod.Kotoeri.{Romaji,Kana}Typing.Japanese`, their method enabled by the kit) and Pinyin (`com.apple.inputmethod.SCIM.ITABC`). No source drifted at any action boundary and every attested row took the paste route. Nothing about the sources was faked or skipped.

**Presentation.** Every lane, AppKit included, ran in the **background** under the owned cover; no lane fell back to frontmost. The witness held through all 2,000 stock actions: the paste route's activation is route 3's fake activation and never made the target the active app.

**Coverage.** 400/400 rows per lane (ten per cell × four sources). One invalid row in 2,000: a Chrome for Testing `stale` control (Japanese Romaji) whose caret move fired but whose content was not the planned one; it also answered success, so it is a wrong success too, counted apart. Zero privacy flags.

### Main's wrong successes (success while the field's content differs from the expected value)

Valid rows, all four sources pooled (forty per cell per lane). Plain cells with no wrong success are pooled into one column.

| Lane | Six plain cells (empty, prefilled, selection, multi-line) | newline-single | rewrite | add | stale | Total |
|---|---|---|---|---|---|---|
| Safari | 0/240 | 0/40 | **40/40** | **40/40** | **40/40** | **120/400** |
| Chrome for Testing | 0/240 | 0/40 | **40/40** | **40/40** | **39/39** | **119/399** |
| Firefox | 0/240 | 0/40 | **40/40** | **40/40** | **40/40** | **120/400** |
| Electron | 0/240 | 0/40 | **40/40** | **40/40** | **40/40** | **120/400** |
| AppKit | 0/240 | **40/40** | **40/40** | **40/40** | **40/40** | **160/400** |

The split is the same for every source (per lane and source: 30 control wrong successes of 30, plus AppKit's 10 newline-single), so the input source plays no part once the route is paste. **Main confirmed every realized negative control (599/599)** by its effect check: a same-length rewrite, an added character and a moved caret all count as "some change seen". The plain pastes all delivered exactly and were confirmed, except the two-line text into a single-line field:

- Browsers (160/160): the Return between the lines changes nothing in an `<input>`, its settle times out after 2 s and main answers `pasteUnconfirmed` (`returnEffect`), with only the first line in the field. No wrong success, but a 2.1–2.4 s refusal (the p95 service times below).
- AppKit (40/40): `NSTextField`'s Return ends editing and selects the whole field, which the settle sees as an effect; the second line is then pasted over the first and main answers **success with only the second line in the field**. This is a plain wrong success with no perturbation at all.

### Outcomes, clipboard and service time

| Cell (all lanes and sources) | Main's outcomes |
|---|---|
| empty, prefilled, selection (1,000) | success, effect seen by notification 994, by reading 6; all exact |
| multiline (200) | success, by notification 123, by reading 77; all exact |
| newline-single (200) | `pasteUnconfirmed` at `returnEffect` (Return settle timeout) 160 (browsers); success by reading 40 (AppKit, wrong) |
| rewrite, add (400) | success by notification 400; all wrong |
| stale (199) | success by notification 194, by reading 5; all wrong |

The pre-trial synthetic clipboard came back exactly (string and types) on **2,000/2,000** rows, and the engine's own `paste.restore` agreed. Service time (sky's `cua/serviceMs`, valid rows) p50 was 123–214 ms on every lane and source; p95 was 2.14–2.24 s in the browsers (the newline-single Return settle) and 0.41–0.54 s in AppKit.

### AX read-back probe (instrumented main, Korean 2-Set, 100 trials per lane, never pooled)

| Lane | AX value ever equal to the expected value (exact plain rows) | First equal, from the last posted event, p50/p95/max ms | Equal at the first sample after the route answered | Focused element at that sample | Realized controls ever equal |
|---|---|---|---|---|---|
| Safari | 59/60 | 29/47/232 | 27/60 | target 42, **none 58** | 0/30 |
| Chrome for Testing | 60/60 | 34/50/174 | 60/60 | target 100 | 0/30 |
| Firefox | 60/60 | 47/85/763 | 59/60 | target 99, none 1 | 0/30 |
| Electron | 59/60 | 33/58/60 | **0/60** | **none 100** | 0/30 |
| AppKit | 60/60 | 23/78/132 | 60/60 | target 100 | 0/30 |

What this means for the read-back's design:

- **The expected value is readable in time in every lane.** The focused field's AXValue reached the exact expected value within 232 ms of the last ⌘V or Return everywhere except one Firefox trial (763 ms), well inside #354's one-second budget. It never equalled the expected value under a realized control (0/150), so exact equality rejects all three controls.
- **In background Safari and Electron the focused element disappears once the paste's activation ends.** After the route answered, `AXFocusedUIElement` read no element in 58% (Safari) and 100% (Electron) of the samples, and the equality "flipped back" in 59 of 100 trials in each. A read-back that polls after the activation's hold is released will find no field there. It has to poll while the paste still holds its activation, or reach the field by another route (Safari's #395 text marker; the snapshot's own element).
- **Firefox's AX focus is stale at the start (#419).** In 100/100 Firefox trials the focused element first read as the **setup field** (the one focused before the fixture moved focus to the target) and turned to the target field only between 35 ms before and 58 ms after the first ⌘V. A before-snapshot taken before the paste's activation would read, and later excerpt, the wrong field. Chrome for Testing and AppKit had the target focused 17–75 ms before the first post; Safari and Electron between 51 ms before and 35 ms after it, with no element focused before that.
- The two trials that never matched (Safari multi-line, Electron empty) lost the focused element before a match was read; the fixtures report both fields exact.

### Limits

- AX focus is classified by the field's label only (AXDescription or AXTitle); roles are recorded. Safari's text-marker route (#395) and the engine's own snapshot element are not probed.
- Answer-time content is the first sample after the reply (`exactFirstPostReply`), not an edit-timestamped one; the verdicts use the settled read 300 ms after the poll.
- The AppKit lane is the owned fixture, not TextEdit.
- `Probe.swift` documents a case where the selected IME's id changes but the focused client keeps the previous layout. The paste route posts only ⌘V and Return, and the engine routes by the same TIS reading the kit verifies, so it is recorded as a limit, not checked.
- Two runner images were in rotation, so Chrome for Testing's version differed between jobs.

Phase 2 (the fix, interleaved with main at twenty per head per cell) is pending its SHA.
