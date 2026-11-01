# #200: background actions, raises and delivery (scripts/cursor-sitting/raise.mjs)

Raises are what the 5 ms watcher saw of the window server's order (the guard's screen hold keeps them off the display); restores, capped and raise left are what route 3's delivery guard reported (`cua/delivery`). A late raise was seen by a read more than 10 ms past the hold's release (begun after it, or outliving it); an unguarded one came before the hold began or during a call with no guard; an undecided one sits in a gap of the watcher's reads that leaves either unknown, and makes the case incomplete, not failed. Pass, for cua's engine: every sample delivered, no late or unguarded raise, no raise left, nothing undecided, the full count, the case ended cleanly and the watcher's record whole through its tail. The vendor's rows are recorded, not judged.

| case | engine | samples | delivered | raises seen | restores | repaired after release (flashes) | late | unguarded | undecided | capped | raise left | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a: a coordinate click in TextEdit's text, under Chrome and clear of it in turn | cua | 40 / 40 | 40 | 39 | 75 | 0 (0) | 0 | 0 | 0 | 1 | 0 | **PASS** |
| a: a coordinate click in TextEdit's text, under Chrome and clear of it in turn | vendor | 40 / 40 | 1 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 | recorded (would be FAIL) |
| b: inside a standing activation: an element click on the alignment, then at once a coordinate click in the text under Chrome | cua | 20 / 20 | 20 (element 20, coordinate 20) | 21 | 36 | 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| b: inside a standing activation: an element click on the alignment, then at once a coordinate click in the text under Chrome | vendor | 20 / 20 | 0 (element 20, coordinate 0) | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 | recorded (would be FAIL) |
| c: a drag in TextEdit's text | cua | 20 / 20 | 20 | 19 | 44 | 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| c: a drag in TextEdit's text | vendor | 20 / 20 | 5 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 | recorded (would be FAIL) |
| d: a double click on a word in TextEdit's text | cua | 20 / 20 | 20 | 20 | 32 | 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| d: a double click on a word in TextEdit's text | vendor | 20 / 20 | 1 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 | recorded (would be FAIL) |
| e: a plain click on a row of the run's Finder window | cua | 20 / 20 | 20 | 20 | 38 | 0 (0) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| e: a plain click on a row of the run's Finder window | vendor | 20 / 20 | 20 | 20 | 0 | 0 (0) | 0 | 20 | 0 | 0 | 0 | recorded (would be FAIL) |
| f: a coordinate click on a plain push button that refuses the first mouse: the Electron fixture's button | cua | 0 / 20 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 | **INCOMPLETE** |
| f: a coordinate click on a plain push button that refuses the first mouse: the Electron fixture's button | vendor | 20 / 20 | 20 | 20 | 0 | 0 (0) | 0 | 20 | 0 | 0 | 0 | recorded (would be FAIL) |

| case | engine | post → first raise, ms (min / median / p95 / max, n) | post → hold released, ms | guarded actions | routes | activation clicks |
|---|---|---|---|---|---|---|
| a | cua | 6.7 / 15.0 / 36.6 / 43.6 (39) | 60.0 / 62.0 / 72.0 / 78.0 (40) | 40 of 40 | click 3 × 40 | click posted × 40 |
| a | vendor | – | – | 0 of 40 | none × 40 | none × 40 |
| b | cua | 8.6 / 11.3 / 20.4 / 20.4 (20) | 61.0 / 66.0 / 78.0 / 78.0 (20) | 20 of 40 | element 3 × 20, coordinate 3 × 20 | none × 40 |
| b | vendor | – | – | 0 of 40 | none × 40 | none × 40 |
| c | cua | 10.6 / 16.1 / 26.9 / 26.9 (19) | 60.0 / 62.0 / 67.0 / 72.0 (20) | 20 of 20 | drag 3 × 20 | drag posted × 20 |
| c | vendor | – | – | 0 of 20 | none × 20 | none × 20 |
| d | cua | 7.0 / 18.5 / 32.6 / 35.5 (20) | 60.0 / 63.0 / 67.0 / 67.0 (20) | 20 of 20 | double 3 × 20 | double posted × 20 |
| d | vendor | – | – | 0 of 20 | none × 20 | none × 20 |
| e | cua | 11.3 / 19.0 / 28.9 / 31.6 (20) | 60.0 / 63.0 / 65.0 / 69.0 (20) | 20 of 20 | row 3 × 20 | row posted × 20 |
| e | vendor | – | – | 0 of 20 | none × 20 | none × 20 |
| f | cua | – | – | 0 of 0 | – | – |
| f | vendor | – | – | 0 of 20 | none × 20 | none × 20 |

## a on cua

- watcher: 10902 reads, longest gap 20.9 ms, 53 late

## a on vendor

- sample 1 not delivered: the caret stayed at 98
- sample 2 not delivered: the caret stayed at 98
- sample 3 not delivered: the caret stayed at 98
- sample 4 not delivered: the caret stayed at 98
- sample 5 not delivered: the caret stayed at 98
- sample 6 not delivered: the caret stayed at 98
- sample 7 not delivered: the caret stayed at 98
- sample 8 not delivered: the caret stayed at 98
- sample 9 not delivered: the caret stayed at 98
- sample 10 not delivered: the caret stayed at 98
- sample 11 not delivered: the caret stayed at 98
- sample 12 not delivered: the caret stayed at 98
- sample 13 not delivered: the caret stayed at 98
- sample 14 not delivered: the caret stayed at 98
- sample 15 not delivered: the caret stayed at 98
- sample 16 not delivered: the caret stayed at 98
- sample 17 not delivered: the caret stayed at 98
- sample 18 not delivered: the caret stayed at 98
- sample 19 not delivered: the caret stayed at 98
- sample 20 not delivered: the caret stayed at 98
- sample 21 not delivered: the caret stayed at 98
- sample 22 not delivered: the caret stayed at 98
- sample 23 not delivered: the caret stayed at 98
- sample 24 not delivered: the caret stayed at 98
- sample 25 not delivered: the caret stayed at 98
- sample 26 not delivered: the caret stayed at 98
- sample 27 not delivered: the caret stayed at 98
- sample 28 not delivered: the caret stayed at 98
- sample 29 not delivered: the caret stayed at 98
- sample 30 not delivered: the caret stayed at 98
- sample 31 not delivered: the caret stayed at 98
- sample 32 not delivered: the caret stayed at 98
- sample 33 not delivered: the caret stayed at 98
- sample 34 not delivered: the caret stayed at 98
- sample 35 not delivered: the caret stayed at 98
- sample 36 not delivered: the caret stayed at 98
- sample 37 not delivered: the caret stayed at 98
- sample 38 not delivered: the caret stayed at 98
- sample 39 not delivered: the caret stayed at 98
- verdict: 39 half or sample(s) not delivered
- watcher: 10856 reads, longest gap 39.5 ms, 73 late

## b on cua

- watcher: 9889 reads, longest gap 18.6 ms, 89 late

## b on vendor

- sample 0 (coordinate) not delivered: the caret stayed at 91
- sample 1 (coordinate) not delivered: the caret stayed at 91
- sample 2 (coordinate) not delivered: the caret stayed at 91
- sample 3 (coordinate) not delivered: the caret stayed at 91
- sample 4 (coordinate) not delivered: the caret stayed at 91
- sample 5 (coordinate) not delivered: the caret stayed at 91
- sample 6 (coordinate) not delivered: the caret stayed at 91
- sample 7 (coordinate) not delivered: the caret stayed at 91
- sample 8 (coordinate) not delivered: the caret stayed at 91
- sample 9 (coordinate) not delivered: the caret stayed at 91
- sample 10 (coordinate) not delivered: the caret stayed at 91
- sample 11 (coordinate) not delivered: the caret stayed at 91
- sample 12 (coordinate) not delivered: the caret stayed at 91
- sample 13 (coordinate) not delivered: the caret stayed at 91
- sample 14 (coordinate) not delivered: the caret stayed at 91
- sample 15 (coordinate) not delivered: the caret stayed at 91
- sample 16 (coordinate) not delivered: the caret stayed at 91
- sample 17 (coordinate) not delivered: the caret stayed at 91
- sample 18 (coordinate) not delivered: the caret stayed at 91
- sample 19 (coordinate) not delivered: the caret stayed at 91
- verdict: 20 half or sample(s) not delivered
- watcher: 11104 reads, longest gap 53.8 ms, 105 late

## c on cua

- watcher: 5658 reads, longest gap 20.9 ms, 28 late

## c on vendor

- sample 1 not delivered: the selection {98, 32} is the one before
- sample 2 not delivered: the selection {98, 32} is the one before
- sample 4 not delivered: the selection {98, 16} is the one before
- sample 5 not delivered: the selection {98, 16} is the one before
- sample 6 not delivered: the selection {98, 16} is the one before
- sample 7 not delivered: the selection {98, 16} is the one before
- sample 8 not delivered: the selection {98, 16} is the one before
- sample 9 not delivered: the selection {98, 16} is the one before
- sample 11 not delivered: the selection {114, 16} is the one before
- sample 12 not delivered: the selection {114, 16} is the one before
- sample 14 not delivered: the selection {130, 16} is the one before
- sample 15 not delivered: the selection {130, 16} is the one before
- sample 17 not delivered: the selection {146, 32} is the one before
- sample 18 not delivered: the selection {146, 32} is the one before
- sample 19 not delivered: the range {0, 0} is empty
- verdict: 15 half or sample(s) not delivered
- watcher: 8461 reads, longest gap 20.8 ms, 42 late

## d on cua

- watcher: 5631 reads, longest gap 41.6 ms, 23 late

## d on vendor

- sample 1 not delivered: the selection {99, 4} is the one before
- sample 2 not delivered: the selection {99, 4} is the one before
- sample 3 not delivered: the selection {99, 4} is the one before
- sample 4 not delivered: the selection {99, 4} is the one before
- sample 5 not delivered: the selection {99, 4} is the one before
- sample 6 not delivered: the selection {99, 4} is the one before
- sample 7 not delivered: the selection {99, 4} is the one before
- sample 8 not delivered: the selection {99, 4} is the one before
- sample 9 not delivered: the selection {99, 4} is the one before
- sample 10 not delivered: the selection {101, 2} is part of a word
- sample 11 not delivered: the selection {101, 2} is the one before
- sample 12 not delivered: the selection {101, 2} is the one before
- sample 13 not delivered: the selection {101, 2} is the one before
- sample 14 not delivered: the selection {101, 2} is the one before
- sample 15 not delivered: the selection {101, 2} is the one before
- sample 16 not delivered: the selection {101, 2} is the one before
- sample 17 not delivered: the selection {101, 2} is the one before
- sample 18 not delivered: the selection {101, 2} is the one before
- sample 19 not delivered: the selection {101, 2} is the one before
- verdict: 19 half or sample(s) not delivered
- watcher: 7696 reads, longest gap 26.3 ms, 39 late

## e on cua

- watcher: 5980 reads, longest gap 17.1 ms, 35 late

## e on vendor

- 1 unguarded raise(s) during "e#0 Finder's selection read"
- 1 unguarded raise(s) during "e#1 Finder's selection read"
- 1 unguarded raise(s) during "e#2 Finder's selection read"
- 1 unguarded raise(s) during "e#3 Finder's selection read"
- 1 unguarded raise(s) during "e#4 Finder's selection read"
- 1 unguarded raise(s) during "e#5 Finder's selection read"
- 1 unguarded raise(s) during "e#6 Finder's selection read"
- 1 unguarded raise(s) during "e#7 Finder's selection read"
- 1 unguarded raise(s) during "e#8 Finder's selection read"
- 1 unguarded raise(s) during "e#9 Finder's selection read"
- 1 unguarded raise(s) during "e#10 Finder's selection read"
- 1 unguarded raise(s) during "e#11 Finder's selection read"
- 1 unguarded raise(s) during "e#12 Finder's selection read"
- 1 unguarded raise(s) during "e#13 Finder's selection read"
- 1 unguarded raise(s) during "e#14 Finder's selection read"
- 1 unguarded raise(s) during "e#15 Finder's selection read"
- 1 unguarded raise(s) during "e#16 Finder's selection read"
- 1 unguarded raise(s) during "e#17 Finder's selection read"
- 1 unguarded raise(s) during "e#18 Finder's selection read"
- 1 unguarded raise(s) during "e#19 Finder's selection read"
- verdict: 20 unguarded raise(s)
- watcher: 8981 reads, longest gap 27.2 ms, 62 late

## f on cua

- the fixture's counters, summed over the samples' clicks (recorded only): –; samples that changed each: –
- stopped: element-frame refused: the fixture's button was not found: no AXButton named Fixture button in the process's windows (13 elements read)
- verdict: 0 of 20 samples (element-frame refused: the fixture's button was not found: no AXButton named Fixture button in the process's windows (13 elements read))
- watcher: 829 reads, longest gap 11.7 ms, 2 late

## f on vendor

- 1 unguarded raise(s) during "f#0 the fixture's count read"
- 1 unguarded raise(s) during "f#1 the fixture's count read"
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
- watcher: 5187 reads, longest gap 26.6 ms, 44 late
