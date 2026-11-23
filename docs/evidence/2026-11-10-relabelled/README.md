# #298: a control relabelled in place (hosted macOS, 2026-11-06 to 2026-11-10)

The stale-point guard's rule `relabelled` refuses a coordinate click as `screenChangedSinceScreenshot` with the reason `relabelled` when the node the screenshot showed at the point is found by its own handle, its frame still holds the point, and its label's words have changed. Numbers, and the words after each number up to the next punctuation mark, are set aside before the comparison. The rule is specified in the native engine spec's #298 Decision Log entry.

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2.
- **Browsers:** Chrome for Testing 156, Safari 27.2 and Firefox.
- **Native apps:** an AppKit probe app, Finder and TextEdit.
- **Kit:** the `probe/298-measure` branch, `scripts/probe-298/`.
  - `measure.mjs`, `tool.swift` and `app.swift`: the spike's cells and its standalone AX tool.
  - `analyze.mjs`: the candidate rules, including the word rule the build ports (`besideNumbers`, mode `run`).
  - `replay-296.mjs`: replays #296's false-positive spike under the word rule.

## The spike (no engine and no click)

Runs: https://github.com/SSFSKIM/cua/actions/runs/42557315991, https://github.com/SSFSKIM/cua/actions/runs/42558915827 and https://github.com/SSFSKIM/cua/actions/runs/42559900886. The findings are in https://github.com/SSFSKIM/cua/issues/298#issuecomment-6732058816, and the design session's ruling (31a62775) is in https://github.com/SSFSKIM/cua/issues/298#issuecomment-6732086920.

**The cells:** 82 cells (35 Chrome, 34 Safari, 13 AppKit), with 12 to 18 repetitions each on 6 runners. The tool held each cell's handle and read every candidate attribute at the observation, 1 s later with nothing changed, and 5 s after the observation, 3 s after the page or app changed every cell at once.

**A relabelled control kept its AX handle in every cell measured.** No structural attribute moved with the label unless the page moved that attribute itself.

| Candidate | False positives (live cells) | Misses (live cells) |
|---|---|---|
| any label change | every content cell, #296's ticking labels included | 0 |
| digits masked | 23 content or same-meaning cells | 0 |
| words kept (additions never refuse) | "Save" -> "Guardar" | "Delete" -> "Delete all" |
| **words, with each number and the words after it set aside (built)** | **"Save" -> "Guardar" only** | **0** |
| AXDOMIdentifier, class list, AXIdentifier, role and actions, AXHelp | 0 | every relabel without that deliberate change |
| AXValue | 0 | every relabel |

- **The built rule** refused all 33 meaning cells, including a dialog container and the text inside links and clickable divs, and every flip that changes the label.
- **It passed every content change measured:** #296's ticking labels, counts, plurals, relative times, "Inbox (3)", "Notifications, 3 new", and tab, window, web-area and group titles gaining "(3)".
- **Replayed over #296's own spike,** it refused 0 of the 132 cells #296 had passed on a kept handle.
- **The deepest node:** a link's or a clickable div's text is its own `AXStaticText`, whose words are only in `AXValue`. The build records that value and compares it on both the handle path and the re-created path.

## The refusals gate (main 3c669314 against 56227475)

Run: https://github.com/SSFSKIM/cua/actions/runs/42732128619. The branch's real engine clicked live.

**36 `relabelled` refusals, every one an expected cell:**

| Relabel | Refusals |
|---|---|
| Save -> Delete | 21 |
| Delete -> Delete all | 4 |
| Follow -> Following | 4 |
| Play -> Pause | 4 |
| "Save changes?" -> "Delete file?" | 3 |
| **Total** | **36** |

**0 `relabelled` refusals on the kept and shared cells** of the full sweep, the fixed live clock included.

- linkmono (Save -> Send, same width, re-created by a `textContent` replacement) refuses as `nodeGone` on the branch, where main keeps it: the extended re-created match rejects the new text's words. That is the safe side.

## The editor gate (main 3c669314 against f8a35001)

Run: https://github.com/SSFSKIM/cua/actions/runs/42749519072. This gates the edited-text exemption (the design session's ruling 1ea561bc:553).

- **A Save -> Delete link inside the edited region refuses in 3 of 3 browsers.** The chain is AXLink -> AXTextArea -> AXWebArea, so the link stays on the exemption's checked path.
- **0 `relabelled` refusals on the 9 typed-editor cells:** clicks into a contenteditable's text after typing into it, with no new screenshot.
- **Every editor read as AXTextArea in all three browsers,** the plain contenteditable included, so the record's role-derived region covers them all.
- **Firefox's Gmail-like cell** refuses `nodeGone` on both heads, before this rule runs (#340's family).

## The cost (paired, main 3c669314 against f8a35001)

Run: https://github.com/SSFSKIM/cua/actions/runs/42749562318. The run was warmed, with fixed windows, and the order of the two heads rotated.

The earlier mixed sweep had measured walk p50 rising from 174 to 385 ms in Firefox and from 177 to 313 ms in Finder with AXEditableAncestor in the batched read. The design session then took that attribute out of the batch (1ea561bc:565). The paired run, on the build without it:

| App | Walk p50, control (ms) | Walk p50, candidate (ms) | Change |
|---|---|---|---|
| Firefox | 56.8 | 55.3 | −2.6% |
| Finder | 245.4 | 244.6 | −0.3% |
| TextEdit | 17.4 | 17.6 | +1.2% |

The mixed sweep's earlier rise didn't reproduce here.

## Limits

1. **A label that differs only by a number passes:** a recycled list row ("Order #1234" -> "Order #1235"), or a count of what the action applies to ("Delete 1 file" -> "Delete 3 files").
2. **Words that roll without a number refuse:** "just now" -> "1 minute ago", "Today" -> "Yesterday".
3. **A translation in place refuses:** "Save" -> "Guardar".
4. **Document titles are not compared:** the window's, the web area's, and Chrome's tab button's (subrole AXTabButton).
5. **A toggle whose label stays the same passes.** AppKit's alternateTitle isn't exposed, and Chrome's aria-pressed has no AXValue.
6. **A contenteditable editor exposed as a plain AXGroup** rather than an AXTextArea gets no exemption. Its typed text stays judged, so a click there can refuse. That is the safe direction. No browser measured exposes one; the case is covered by unit tests only.
