# #360: arrow keys in background Firefox take route 3 (hosted, 2026-11-16 and 2026-11-17)

Two hosted runs back the fix (the native engine spec's Decision Log, "#360's arrow keys"; the design session's
rulings 764 and 767): in a Firefox that does not believe it has focus, `press_key` sends a sequence holding an arrow key
(Left, Right, Up or Down, with any modifiers, Shift included) through route 3's held activation, as it does a ⌘ chord.
Ruling 764 also named Home, End, Page Up and Page Down, and the qualification measured the fix f066023e that routed them
too; ruling 767 took them out, because they were measured to work without it (below, "The keys ruling 767 left
out"). Both ran from kit `probe/360-measure` (workflow 420915277) on GitHub-hosted macOS runners. The
kit's README (`scripts/probe-360/README.md` on the kit branch) describes the cells, the oracle and the watch. The
oracle is the fixture page's own DOM at 1 s after the key: its text, selection and scroll positions. Firefox's
AXSelectedTextRange is not an oracle, because it is stale (#394).

- **The spike,** [run 44024467862](https://github.com/SSFSKIM/cua/actions/runs/44024467862) (artifact
  `probe-360-full`). Kit 14311fa0 against main b99232de, Firefox 159.0, image 20261102.0473.1: 2,560 of 2,560 attempts
  scorable. An intervention study, which found the cause.
- **The qualification,** [run 44047809532](https://github.com/SSFSKIM/cua/actions/runs/44047809532) (artifact
  `probe-360-qualification-full`). Kit 8a0e1dca, the unmodified fix f066023e against main c7eee724 as the control,
  Firefox 160.0, image 20261112.0504.1: 1,600 of 1,600 attempts scorable. It measures the production path whole.

The scored outputs were read offline with the kit's readers (`read.mjs` for the spike, `qualification-read.mjs` for
the qualification). They are not copied here: rerun a reader on the run's artifact to reproduce them.

## The spike: the cause

In a background Firefox window, posted by route 2′ (forced, so that Cmd+Left was posted plainly too), caret-collapse
keys left a rich editor's caret where it was. Each cell had 20 repetitions; "rich" is the contenteditable and compose
fixtures, "plain" is textarea and input.

| motion | background, rich | background, plain | foreground, rich and plain |
|---|---|---|---|
| collapse (Left, Option+Left, Cmd+Left), 2′ | 0 of 120 | 120 of 120 | 240 of 240 |
| extend (Cmd+Shift+Left), 2′ | 40 of 40 | 40 of 40 | 80 of 80 |
| collapse after route 3's bare prelude | 120 of 120 | 120 of 120 | |
| extend after route 3's bare prelude | 40 of 40 | 40 of 40 | |

The key reached the page: DOM keydown arrived, and Gecko decoded the right command (`cmd_charPrevious`,
`cmd_wordPrevious`, `cmd_moveLeft3`) in 320 of 320 attempts. Firefox's collapse commands check whether the editor's
caret is enabled and scroll otherwise; the extension commands bypass that check. Focus enables the caret and blur
disables it. The prelude gave the page a focusin before keydown in 320 of 320 attempts (baseline 0 of 320), a median
4 ms ahead. That mechanism is read from Gecko's source, not instrumented. So the cause is the editor's logical focus,
not key delivery.

**Ruled out:** every other intervention left rich collapses at 0 of 80 (Left and Option+Left, each 0 of 20 per cell):
window fields 51, 91 and 92 on the events; AppKit's keyboard-event initializer with the target window; the numeric-pad
flag; the secondary-Fn flag; both flags; a private event source; a combined-session event source. A direct
AXSelectedTextRange write moved the DOM (80 of 80 rich, 80 of 80 plain) but is no generic replacement for a word
motion, and the AX range read back after it was stale in 158 of 158 readable rows.

The spike's prelude was route 3's bare core (subtype 1, the inert outside click, the key, subtype 2), not the held
activation with its guard. It cost p50/p95 4/8 ms against 4/6 ms for the plain post, and its watch, sampled at a
median 36 ms (p95 89 ms, max 411 ms), observed no activation or raise.

## The qualification: the production path

The fix's own `press_key`, called with only the pid and the key over a fresh connection per attempt, so every
background row pays the cold `holdKeyFocus` with its guard. No forced route, no probe argument, no patch. Each
background row is judged against the same repetition's foreground row on the same editor and key: the exact selection,
plus every scroll axis the foreground moved (2 px tolerance). Home, End and the page keys use long, scrollable text
with an interior caret. The main control ran the rich editors only.

| | judged | pass | fail | N/A |
|---|---|---|---|---|
| fix, foreground (the controls) | 560 | 560 | 0 | 80 |
| fix, background | 560 | 560 | 0 | 80 |
| main, background | 320 | 240 | 80 | 0 |

Every fix row was a safe pass: no error, no editor focus loss, no wrong text, no observed activation or raise, and
the release left all 1,600 documents unchanged. Main's 80 failures are the rich editors' Left and Option+Left (0 of 20
in each of the four cells), where the fix passes 80 of 80. On the rich collapse keys main passed 40 of 120 (Cmd+Left
alone, already route 3 as a ⌘ chord) and the fix 120 of 120.

**What covers the shipped rule.** The arrow rule is the arrows' cells: Left, Option+Left, Cmd+Left and Cmd+Shift+Left
in all four editors, 320 of 320 in the background and 320 of 320 in the foreground. Right, Up and Down were not run;
they are the same rule on the same route. The Home, End and page-key rows below measured route 3 for keys the shipped
rule no longer routes there.

| editor | key | fix, foreground | fix, background | main, background | fix, background ms p50/p95 |
|---|---|---|---|---|---|
| textarea | Left | 20/20 | 20/20 | not run | 113/149 |
| textarea | alt+Left | 20/20 | 20/20 | not run | 123/141 |
| textarea | cmd+Left | 20/20 | 20/20 | not run | 116/141 |
| textarea | cmd+shift+Left | 20/20 | 20/20 | not run | 109/144 |
| textarea | Home | 20/20 | 20/20 | not run | 107/144 |
| textarea | End | 20/20 | 20/20 | not run | 104/140 |
| textarea | PageUp | 20/20 | 20/20 | not run | 102/137 |
| textarea | PageDown | 20/20 | 20/20 | not run | 104/146 |
| input | Left | 20/20 | 20/20 | not run | 110/144 |
| input | alt+Left | 20/20 | 20/20 | not run | 106/140 |
| input | cmd+Left | 20/20 | 20/20 | not run | 99/128 |
| input | cmd+shift+Left | 20/20 | 20/20 | not run | 95/128 |
| input | Home | N/A | N/A | not run | 107/142 |
| input | End | N/A | N/A | not run | 107/148 |
| input | PageUp | N/A | N/A | not run | 113/149 |
| input | PageDown | N/A | N/A | not run | 97/144 |
| contenteditable | Left | 20/20 | 20/20 | 0/20 | 126/147 |
| contenteditable | alt+Left | 20/20 | 20/20 | 0/20 | 106/146 |
| contenteditable | cmd+Left | 20/20 | 20/20 | 20/20 | 105/140 |
| contenteditable | cmd+shift+Left | 20/20 | 20/20 | 20/20 | 117/134 |
| contenteditable | Home | 20/20 | 20/20 | 20/20 | 104/142 |
| contenteditable | End | 20/20 | 20/20 | 20/20 | 106/149 |
| contenteditable | PageUp | 20/20 | 20/20 | 20/20 | 119/143 |
| contenteditable | PageDown | 20/20 | 20/20 | 20/20 | 113/139 |
| compose | Left | 20/20 | 20/20 | 0/20 | 108/139 |
| compose | alt+Left | 20/20 | 20/20 | 0/20 | 104/148 |
| compose | cmd+Left | 20/20 | 20/20 | 20/20 | 107/145 |
| compose | cmd+shift+Left | 20/20 | 20/20 | 20/20 | 117/153 |
| compose | Home | 20/20 | 20/20 | 20/20 | 105/155 |
| compose | End | 20/20 | 20/20 | 20/20 | 107/139 |
| compose | PageUp | 20/20 | 20/20 | 20/20 | 92/134 |
| compose | PageDown | 20/20 | 20/20 | 20/20 | 115/153 |

**The N/A cells.** Home, End, Page Up and Page Down do nothing in a single-line input, even in the foreground: no
selection change and no scroll. Those 160 rows (80 foreground, 80 background) are not applicable, never counted as
passes; a background row that changed anything there would have been a failure, and none did.

**The keys ruling 767 left out.** In the other editors Home, End, Page Up and Page Down scroll and do not move the
caret, in the foreground as in the background, so their passes are scroll matches. In the rich editors main's plain
post already matched the foreground for them, 160 of 160, without route 3: route 3 changed nothing measurable there and
cost its activation (below), so ruling 767 left them on 2′. A background textarea's Home, End and page keys by 2′ were
not measured (main's control ran the rich editors only); the fix's route 3 matched the foreground there, 80 of 80.

## The watch

A passive watch sampled the frontmost app and the window order (ID-only `CGWindowListCreate`, requested every 5 ms)
from before each call until 500 ms after its connection closed, so the hold's release is inside the watched interval.
It observed **no activation or raise in 501,913 samples.** The actual gaps between samples were p50/p95/max
5.0/6.7/176 ms for the frontmost app; one window-order read spans up to 230 ms (p50 5.5 ms). This is sampled evidence,
not a guarantee that nothing flashed. The longest gap was 176 ms (p50 5.0 ms), so a flash shorter than that window
cannot be excluded where it fell, and one the system's cache had not yet caught up with can go unseen too. The spike's coarser watch (median 36 ms gaps) is the same kind of evidence.

## The price of route 3

Measured cold: a fresh connection per attempt, so every background call ran the hold's activation and its guard.

| route | rows | call ms p50/p95/max | guard ms p50/p95/max |
|---|---|---|---|
| fix, background, route 3 | 640 | 110/147/162 | 104/142/154 |
| main, background, route 3 (its ⌘ chords) | 80 | 109/146/158 | 105/141/153 |
| main, background, route 2′ | 240 | 3/6/28 | |
| fix, foreground, route 2′ | 640 | 4/6/107 | |

On the 240 comparable rows (the same editor and key, where main's call naturally took route 2′) the fix's call is
110/147 ms p50/p95 against main's 3/6 ms; the guard is about 104 of those 110 ms. Under the shipped rule only the
arrows pay it: their 16 background cells run 95 to 126 ms p50 (the table above). The price is the ⌘ chord's own
(main's route-3 rows cost the same). It is paid once per hold: the kit did not measure a call inside an already held
interaction, where the activation is not taken again, nor the hold's 120 s idle expiry.

## Environment

The spike ran Firefox 159.0 on image 20261102.0473.1; the qualification ran Firefox 160.0 on image 20261112.0504.1.
The failure reproduced on 160 (main's rich Left and Option+Left, 0 of 80), so the cause did not change between the two
versions, but neither run bounds later ones. Both ran on a hosted runner with no human at the console; the Mac mini
and the owner's GUI and profile were not used.
