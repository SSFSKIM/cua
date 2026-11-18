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

## Results

Pending.
