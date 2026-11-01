# #200: background actions, raises and delivery (scripts/cursor-sitting/raise.mjs)

Raises are what the 5 ms watcher saw of the window server's order (the guard's screen hold keeps them off the display); restores, capped and raise left are what route 3's delivery guard reported (`cua/delivery`); repaired after release counts the actions the engine repaired once the hold was released, by the guard past its cap and by the after-action watch (`cua/afterActionRepairs`, on a later reply), and a flash is a raise past the release that such a repair undid inside 1 s of the events, counted and not failed. A late raise was seen by a read more than 10 ms past the hold's release (begun after it, or outliving it) and not so repaired; an unguarded one came before the hold began or during a call with no guard; an undecided one sits in a gap of the watcher's reads that leaves either unknown, and makes the case incomplete, not failed. Pass, for cua's engine: every sample delivered, no late or unguarded raise, no raise left, nothing undecided, the full count, the case ended cleanly and the watcher's record whole through its tail. The vendor's rows are recorded, not judged.

| case | engine | samples | delivered | raises seen | restores | repaired after release: guard + watch (flashes) | late | unguarded | undecided | capped | raise left | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a: a coordinate click in TextEdit's text, under Chrome and clear of it in turn | cua | 40 / 40 | 40 | 39 | 74 | 0 + 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| f: a coordinate click on a plain push button that refuses the first mouse: the Electron fixture's button | cua | 20 / 20 | 20 | 19 | 39 | 0 + 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| f: a coordinate click on a plain push button that refuses the first mouse: the Electron fixture's button | vendor | 20 / 20 | 20 | 20 | 0 | 0 + 0 (0) | 0 | 20 | 0 | 0 | 0 | recorded (would be FAIL) |

| case | engine | post → first raise, ms (min / median / p95 / max, n) | post → hold released, ms | post → watch's first repair, ms | guarded actions | routes | activation clicks |
|---|---|---|---|---|---|---|---|
| a | cua | 8.7 / 17.7 / 29.3 / 39.0 (39) | 60.0 / 62.0 / 64.0 / 67.0 (40) | – | 40 of 40 | click 3 × 40 | click posted × 40 |
| f | cua | 8.6 / 13.3 / 33.6 / 33.6 (19) | 60.0 / 62.0 / 64.0 / 67.0 (20) | – | 20 of 20 | click 3 × 20 | click posted × 20 |
| f | vendor | – | – | – | 0 of 20 | none × 20 | none × 20 |

## a on cua

- watcher: 11035 reads, longest gap 34.2 ms, 59 late

## f on cua

- the fixture's counters, summed over the samples' clicks (recorded only): appDidBecomeActive × 20, appDidResignActive × 5, windowFocus × 20, windowBlur × 3, pageFocus × 20, pageBlur × 3, textFocus × 1, textBlur × 1; samples that changed each: appDidBecomeActive × 20, windowFocus × 20, pageFocus × 20, textFocus × 1, textBlur × 1, appDidResignActive × 5, windowBlur × 3, pageBlur × 3
- watcher: 6911 reads, longest gap 35.4 ms, 49 late

## f on vendor

- 1 unguarded raise(s) during "f#0 click on the fixture's button"
- 1 unguarded raise(s) during "f#1 click on the fixture's button"
- 1 unguarded raise(s) during "f#2 the fixture's count read"
- 1 unguarded raise(s) during "f#3 the fixture's count read"
- 1 unguarded raise(s) during "f#4 the fixture's count read"
- 1 unguarded raise(s) during "f#5 the fixture's count read"
- 1 unguarded raise(s) during "f#6 the fixture's count read"
- 1 unguarded raise(s) during "f#7 the fixture's count read"
- 1 unguarded raise(s) during "f#8 the fixture's count read"
- 1 unguarded raise(s) during "f#9 the fixture's count read"
- 1 unguarded raise(s) during "f#10 the fixture's count read"
- 1 unguarded raise(s) during "f#11 the fixture's count read"
- 1 unguarded raise(s) during "f#12 the fixture's count read"
- 1 unguarded raise(s) during "f#13 the fixture's count read"
- 1 unguarded raise(s) during "f#14 the fixture's count read"
- 1 unguarded raise(s) during "f#15 the fixture's count read"
- 1 unguarded raise(s) during "f#16 the fixture's count read"
- 1 unguarded raise(s) during "f#17 the fixture's count read"
- 1 unguarded raise(s) during "f#18 the fixture's count read"
- 1 unguarded raise(s) during "f#19 the fixture's count read"
- the fixture's counters, summed over the samples' clicks (recorded only): appDidBecomeActive × 1, appDidResignActive × 0, windowFocus × 1, windowBlur × 0, pageFocus × 1, pageBlur × 0, textFocus × 1, textBlur × 1; samples that changed each: appDidBecomeActive × 1, windowFocus × 1, pageFocus × 1, textFocus × 1, textBlur × 1
- verdict: 20 unguarded raise(s)
- watcher: 5873 reads, longest gap 22.7 ms, 58 late
