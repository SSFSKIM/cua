# #361: hosted macOS evidence for type_text's paste-route read-back

Every run happened only on GitHub-hosted macOS, in kit `probe/361-qual` (workflow `423150923`). The engines under test were built unmodified from clean checkouts of exact SHAs. The kit's README, `scripts/probe-361/README.md` at `92a78f2d`, has every run with its scoring rules, per-source tables and service-time distributions. This file covers what the merge rests on.

## How the kit scores

- **Lanes.** Safari 27.2, Chrome for Testing 156/157, Firefox 160, Electron 44.4.5 and an owned AppKit fixture (`NSTextField` single line, `NSTextView` multi line). All ran in the background under the owned cover; the activation witness held on every attested row.
- **Input sources.** Korean 2-Set, Japanese Romaji and Kana, and Pinyin, each selected through TIS and read back by a fresh process before every trial. Every attested row took the paste route (`inputRoute: "paste"`).
- **Content is checked by the fixture, never through cua.** The page or app compares the field with the expected value by UTF-16 units; only booleans leave it.
- **Plain cells.** CJK and mixed text into an empty field, into a prefilled field, over a selected range; three lines into a multi-line field; two lines into a single-line field.
- **Negative controls.** `rewrite` (the first pasted character rewritten in place), `add` (one extra character at the caret), `stale` (the caret moved to the field's start at ⌘V).
- **Clipboard.** A synthetic pre-trial clipboard must come back exactly (string and types), and its content must appear in no field and no answer surface.
- **Privacy.** The native reply, sky's result and error, forwarded meta, emitted content, console and engine output are scanned for the clipboard's content, a setup canary and text beyond an excerpt's reach.

## Phase 1: main measured (517ab543)

[Run 44408854885](https://github.com/SSFSKIM/cua/actions/runs/44408854885), ten trials per cell, four sources, 2,000 rows, one invalid.

- **Main confirmed every realized control: 599/599 wrong successes.** A same-length rewrite, an added character and a moved caret all count as "some change seen" for #187's effect check.
- **AppKit's two lines into a single-line field: 40/40 wrong successes.** The Return selects the whole field, the second line replaces the first, and main answers success. The browsers kept only line 1 and answered `pasteUnconfirmed` after a 2.1–2.4 s Return settle.
- Every plain paste delivered exactly; the clipboard was restored on 2,000/2,000 rows; the input source played no part once the route was paste.
- **AX read-back probe** (an instrumented main, Korean, 100 trials a lane, never pooled):
  - The expected AXValue was readable within 232 ms of the last post everywhere but one Firefox trial (763 ms), and never under a realized control (0/150). Exact equality is sound, and the 1 s budget fits.
  - In background Safari (58/100) and Electron (100/100) the focused element is gone once the paste's activation ends, so the read-back must poll while it holds.
  - Firefox's focus first read the field focused before (100/100), moving to the target only 35 ms before to 58 ms after the first ⌘V (#419).

## The first candidate failed: 9bfb0b50

[Run 44429799569](https://github.com/SSFSKIM/cua/actions/runs/44429799569). That build replaced #187's per-line effect wait with the read-back and restored the clipboard once each line was read.

- **Chrome for Testing leaked the person's clipboard.** In 108 of 116 multi-line and two-line rows, the pre-trial clipboard's content was in the field and in the `valueMismatch` excerpt. A hand-over names no reader, so a read before the target's ⌘V let the restore run under a ⌘V Chrome had not handled yet.
- **Firefox confirmed nothing** (`rangeUnreadable` 632, `fieldChanged` 168), and its multi-line delivery fell to 59 and 71 of 80, because the Return checkpoint stopped at lines it could not read.
- Safari, Electron and AppKit passed every gate.

So #187's per-line pacing came back unchanged: each line's item stays on the pasteboard until that line's effect shows, and the read-back only decides success, after the restore and while the activation still holds.

## The qualified head: 7897cdeb

[Full run 44442976031](https://github.com/SSFSKIM/cua/actions/runs/44442976031) and a [Pinyin rerun of Chrome for Testing and Electron 44451662130](https://github.com/SSFSKIM/cua/actions/runs/44451662130) (their fixture pages stopped answering at Pinyin rep 13 in the full run; the rerun ran 400/400 per lane with no invalid row). Kit `e9a10e23`, main `645202db` (with #414), twenty per head per cell per source, heads interleaved.

| Lane | Rows (invalid) | Exact pastes confirmed | Controls `typeUnconfirmed` | Wrong successes fix (main) | Clipboard restored | Clipboard content fix/main | Delivery vs main | Privacy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Safari 27.2 | 1,600 (0) | 480/480 | 240/240 | **0** (240) | 800/800 | 0/0 | 720/720 | 0 |
| Chrome for Testing 156/157 | 1,600 (0) | 480/480 | 240/240 | **0** (240) | 800/800 | 0/0 | 720/720 | 0 |
| Electron 44.4.5 | 1,600 (0) | 480/480 | 240/240 | **0** (240) | 800/800 | 0/0 | 720/720 | 0 |
| AppKit | 1,600 (0) | 480/480 | 240/240 | **0** (320) | 800/800 | 0/0 | 720/720 | 0 |
| Firefox 160 | 1,600 (0) | **0/480** | 240/240 | **0** (240) | 800/800 | 0/0 | 720/720 | 0 |

- **Firefox** fails one gate, `exactConfirmed`: it delivered as main (multi-line 80/80) and never answered a false success, but every exact paste answered `typeUnconfirmed` (`rangeUnreadable` 291, `fieldChanged` 189).
- **AppKit's two-line single-line case** now answers `valueMismatch` on 80/80, where main answered success.
- **Cost:** a confirmed paste adds about 90–100 ms at p50 in Safari, Electron and AppKit and nothing in Chrome for Testing; a refused control runs the 1 s poll, about 1.2 s.

## The PR head: 0de1e5bf

It differs from 7897cdeb only in what the reply carries and in non-delivery fixes, from the whole-branch review of main..7897cdeb; the delivery is unchanged:
- a paste-route mismatch carries its reason alone, with no excerpt and no lengths (an effect or a read cannot prove the target took ⌘V before the restore);
- the expected text is taken from the request, so a leading U+FEFF is expected rather than dropped as a byte order mark;
- the cursor-sitting `item-187` judge requires a typed row's per-line delivery evidence and its `typeReadback.confirmed`;
- docs.

## Limits

- **Background Firefox confirms no paste (#427).** The snapshot reads before Firefox's focus settles at the first ⌘V. The docs tell the agent to observe the field.
- **A Tab or a single-line Return goes after text the read-back cannot read (#426),** on both routes.
- **The request's deadline** is checked too early in the paste loop and too late in the read-back poll, shared with main (`tech-debt-tracker.md`, 2026-11-18). Neither causes a false success.
- **Not measured live:** a contenteditable field, and a pasted password field. #414's kit covers the keyed route only.
