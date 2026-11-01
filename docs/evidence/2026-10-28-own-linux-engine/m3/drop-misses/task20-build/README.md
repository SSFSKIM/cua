# Task 20's build: the atomic press, the press watch, and the pointer-outside measurement

Task 20 (`../task20/`) found why a short Chrome drop failed the m3-gate: Blink resets its press on any mouse move that
carries no button, and Chrome turns real pointer events into such moves, its own capture grab's crossing included when
the real pointer is outside its window. The design session ruled on 2026-11-01. This directory holds what the build
measured, all on the #171 VM's `:0` with the harness Chrome (Chrome 156) in front, shared mode unless named.

## Ruling 4: the pointer parked outside, measured before building

`runs/park20-m3-engine.*`: the m3-gate engine (no watch), 20 trials. Each trial is a fresh engine with one 40 px drag of
each kind per park condition, the conditions taking turns. The real pointer was parked outside Chrome, on the front
window in its corner (1170,715), or inside Chrome away from every path (300,560) as the control. The page is
`pages/track.html`, read through the window's name.

| kind | pointer inside | pointer outside |
|---|---|---|
| mousedown/mousemove/mouseup drag, document listeners | 20/20 | 20/20 |
| pointerdown + setPointerCapture drag | 20/20 | 20/20 |
| range input | 20/20 | 0/20 |
| text selection (reference) | 20/20 | 0/20 |
| short HTML5 drag and drop (reference) | 20/20 | 0/20 |

No page saw a buttonless move during a press (`z` 0 on every drag). The page-tracked kinds land at the inside rate, so
**branch (ii)**: no refusal in shared mode. Task 20 had the range input landing 11/12 outside on `pages/drag.html`; here
it landed 0/20, and 1/24 on the build below.

## The build: 240 undisturbed drags, 240 with the pointer outside

`runs/park24-build.*`: the built engine, 24 trials. The binary is `cua-engine-b1`, built before the commit. 386d0877
changed only when the refusal's application name is read (only for a refusal). Two lanes,
shared (`cua`) and `--desktop dedicated` (`ded`), each with both park conditions and every kind: 480 drags in all.

- **0 false errors over 240 undisturbed drags** (pointer inside, both lanes, five kinds). The watch saw nothing on the
  non-drag-and-drop kinds. On the drag and drop it saw Chrome's own drag-loop grab (`leave_grab`, every drop). Every
  drop had a take, so none of them answered an error.
- **Shared, pointer outside:** every drag answered `Google-chrome may not have started the drag, …` (120/120), the
  watch having seen Chrome's capture grab crossing in (`enter_grab`, every drag). The selection and the drop landed
  0/24, the range input 1/24. **Declared false errors: the page-tracked drags landed 24/24 and 24/24 and still answered
  the error, and so did the one range drag that landed.**
- **Dedicated, pointer outside:** every drag took the foreground route and landed (120/120), with no error. The watch
  left the XTEST pointer's own motion out.
- **The atomic press's grab**, over all 480 drags (both routes): p50 0.742 ms, p99 1.688 ms, max 4.078 ms (bar: p99
  under 5 ms).

## Fix round 1: a grab that ends before the release counts

Task 20's review found the gap. The watch left out every crossing in mode `Ungrab`, so another client's grab, held
when the drag began and released during it, crossed into Chrome with no button: a 400 px selection was cut to one
word, and the drag still answered `ok`. The watch now reads, by a round trip just before the release, what arrived up
to then. An `Ungrab` crossing in that read counts as a stray; only one read after the release (the target's release of
its own capture) is left out. A live test covers it (a foreign root grab released as the press reaches the window).

`runs/fix1-inside24.*`: the fixed engine (6dc17da3), 240 undisturbed drags (pointer inside, shared and dedicated, 24 of
each of the five kinds). **Still 0 stray answers**, every drag landed, grab p50 0.694 ms, p99 1.597 ms, max 2.069 ms.
`tools/press-table.py` now reads the trimmed records as committed, which regenerate `runs/park24-build.txt` exactly.

## Ruling 5: the differential harness's new device cases

`runs/dev2/`: the harness's Chrome device scenes (`device-chrome`, `device-chrome-dnd`, every case), 2 blocks, on the
committed engine (386d0877). The run exits 0, with 16 of 16 device verdicts passing:

- `chrome_dnd_short_pointer_outside_shared` (stray): 6/6 answered the stray sentence. Nothing dropped, the witness
  was unchanged and the background audit clean.
- `chrome_select_nudged_shared` (stray): xdotool nudged the pointer a pixel and back every 2 ms all through a text
  selection, with the pointer parked inside. 6/6 answered the stray sentence, the watch seeing 64-75 raw motions. The
  witness allowed the pointer field alone, and the audit was clean.
- `chrome_dnd_short_pointer_outside_dedicated` (foreground): 6/6 took the foreground route and the drop landed.
- Every earlier Chrome device case still passes. Each case that takes the background route now parks the pointer in
  the window first.

## Tools

- `tools/track.mjs`, `track.sh`, `track-table.py`: the park measurement.
- `tools/press-table.py`, `trim.py`: the build's tables and these trimmed records.
- `tools/device-run.sh`, `device-table.py`: the device scenes and their verdicts.

The raw records stay on the VM under `~/.local/share/cua-171/task20b/runs/`.
