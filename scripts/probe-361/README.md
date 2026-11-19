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

## Phase 2: the fix qualified against main

[Qualification run](https://github.com/SSFSKIM/cua/actions/runs/44429799569): kit `0a1b9aa2`, main `517ab5430a3a81718910b030488ba8d855087b21`, fix `9bfb0b502c858aff8e1468a4c78fbc4ed39cc9d8` (`fix/361-paste-readback`, which also carries the unmerged #414). Twenty per head per cell per source, the heads interleaved, all four sources, all five lanes in the background under the cover (the witness held on every attested row). Images `20261102.0473.1` and `20261112.0504.1`; Chrome for Testing 157.0.8103.78.

**Verdict: Safari, Electron and AppKit pass every gate. Chrome for Testing and Firefox fail.**

| Lane | Coverage | Exact pastes confirmed | Controls `typeUnconfirmed` | Wrong successes fix (main) | Clipboard restored | Route | Privacy (fix) |
|---|---|---|---|---|---|---|---|
| Safari | pass, 1,600/1,600 | pass, 560/560 | pass, 240/240 `valueMismatch` | **0** (240) | 800/800 | pass | 0 |
| Electron | pass, 1,600/1,600 | pass, 560/560 | pass, 240/240 `valueMismatch` | **0** (240) | 800/800 | pass | 0 |
| AppKit | pass, 1,600/1,600 | pass, 480/480 | pass, 240/240 `valueMismatch` | **0** (320) | 800/800 | pass | 0 |
| Chrome for Testing | **fail**: 1,168/1,600 ran; the fixture was lost in Kana and Pinyin was never reached | **fail**: 288/348, 60 deliveries lost | pass, 172/172 `valueMismatch` | **0** (172) | 578/578 | pass | **fail: 108 rows show the pre-trial clipboard** |
| Firefox | pass, 1,600/1,600 | **fail**: 0/551 confirmed; 21 deliveries lost | pass, 240/240 (`rangeUnreadable` 182, `fieldChanged` 58) | **0** (240) | 800/800 | pass | 0 |

Zero wrong successes on the fix in its 3,784 rows, against 1,212 on main in the same run. Main's figures reproduce Phase 1: every realized control was a wrong success on every lane, and so were AppKit's 80 newline-single rows. The fix refuses those 80 with `valueMismatch` (the field holds only the second line), which is correct.

### Chrome for Testing: multi-line pastes lose the text and paste the person's clipboard

- **Multi-line field:** every fix row failed (58/58: `valueMismatch` 51, `fieldUnreadable` 7). Main delivered all of them exactly in the same run.
- **Two lines into a single-line field:** the fix answered `valueMismatch` on all 58.
- **Clipboard content in the field and in the answer:** 108 of these 116 rows (every source; ko 36, ja-romaji 37, ja-kana 35) carried the **pre-trial clipboard's synthetic content** in the fix's answer. The excerpt is the only part of a `valueMismatch` answer that carries field text, so the field held what had been on the clipboard before the call. The likely mechanism: a later line's ⌘V is read by Chrome only after the engine has restored the clipboard, so the person's own clipboard is pasted into the field and then quoted back to the model. This is a privacy defect as well as a delivery one.
- **Single-line cells:** two more lost deliveries (one `selection`, one `prefilled-mixed`, both `valueMismatch`), against none on main.
- **The clipboard itself was restored on every row.** What leaked is that its content went into the field.
- **Setup failure, not counted as a product miss:** the fixture page stopped answering at the delivery read right after a fix `add` control (Kana, rep 17). Its next 11 prepares failed, which stopped Kana there and Pinyin at its start. That is the 432 missing rows. Main's rows up to that point match Phase 1.

### Firefox: never confirms

All 800 fix rows answered `typeUnconfirmed`: `rangeUnreadable` on 632, `fieldChanged` on 168. There was no `valueMismatch`, so no excerpt and no privacy flag, and never a false success.

- **Exact pastes go unconfirmed:** of the 551 plain fix rows the gate owed, 530 were exact in the field but answered unconfirmed; the other 21 lost delivery. The builder expected `fieldChanged` (#419); in this run `rangeUnreadable` dominated.
- **Delivery lost on multi-line text:** the fix delivered 59/80 multi-line and 71/80 newline-single rows exactly, against all of main's. The fix presses a Return only once the text before it reads back, so a read-back that cannot confirm in Firefox stops the paste at the first newline.

### Service time

Sky's `cua/serviceMs`, valid rows, p50/p95 in ms, main → fix:

| Lane | Plain (6 cells) | newline-single | Controls |
|---|---|---|---|
| Safari | 129/499 → 240/343 | 2166/2218 → 261/304 | 117/162 → 1237/1288 |
| Chrome for Testing | 157/661 → 156/1315 | 2176/2225 → 1244/1309 | 155/178 → 1166/1192 |
| Firefox | 160/665 → 166/1152 | 2178/2231 → 263/1143 | 158/210 → 161/1165 |
| Electron | 151/645 → 238/450 | 2168/2217 → 331/391 | 148/170 → 1248/1298 |
| AppKit | 115/469 → 223/449 | 251/314 → 1297/1359 | 113/162 → 1226/1299 |

A confirmed paste costs the fix about 90–110 ms more at p50 in Safari, Electron and AppKit. That is the poll inside the activation and the paste lock, so this is also roughly how much longer the lock and lease are held. A refused control runs the full one-second poll, about 1.2–1.3 s. The browsers' newline-single drops from main's 2.2 s Return timeout to 0.26–0.33 s, except in Chrome for Testing.

### What the builder asked to have measured

- **Firefox (#419):** never a false success and never an excerpt. The reason was mostly `rangeUnreadable` (632) rather than `fieldChanged` (168). Service p50/p95 was 166/1152 ms on plain cells and 161/1165 ms on controls.
- **Background Safari and Electron:** the identity check passed with the poll inside the activation, 560/560 exact pastes confirmed on each. The lock-and-lease cost is in the service-time table.
- **Multi-line in Chrome and Firefox:** yes, multi-line fails in both, but not as a false unconfirmed over exact content. The content differs in Chrome for Testing, with the clipboard leak above. In Firefox the paste stops at the first unconfirmed line. The kit cannot say whether a Return landed before its line's text; it sees only the final content and the reason.
- **Contenteditable normalisation:** not measured, because the kit has no contenteditable field. Every plain-cell row the fix left unconfirmed is listed by `report.mjs`, and none of them came from Safari, Electron or AppKit except AppKit newline-single, whose content really differs.
- **Pasted password field:** not measured; the kit has no password field. #414's kit covers the keyed route only.

Invalid-setup tally for Phase 2: 432 rows not run, plus 12 invalid (11 `prepare`, 1 delivery read), all in the Chrome for Testing job. No other lane had an invalid row.
