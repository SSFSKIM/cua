# M4, T12 (#265): thumb and range drags under load (task 67)

T12's row: Chrome's and Electron's scrollbar-thumb and range-input drags at two stress-ng workers per core, 40 a side
against the pinned build; the mechanism of any miss, then its fix. The proof: cua lands at least as many as the pinned
build (40 of 40 where it lands 40), or a mechanism record and a stated limit.

**The answer: no miss, so no fix.** On the head (7d464cb2, T11's motion model as shipped), cua landed every drag of
every cell, 40 of 40, where the pinned build also landed 40 of 40. No engine or harness code changed in this task.

## The sitting (`head-load2/`)

- Candidate: a musl build of 7d464cb2 made the release workflow's way (`scripts/build-musl.sh`; `cua-engine 0.3.0
  (7d464cb25f63)`, sha256 `d8cc6430…4ee9613`), a development run, not a release gate. The harness is the same commit's,
  exported apart from the shared checkout (`scripts/export-harness.sh`; its `meta.commit` is null because the export has
  no `.git`, so the engine's `--version` row names the commit).
- A private Xvfb with Openbox and a stand-in person's window (`scripts/private-run.mjs`), never `:0`; no whole-run
  RECORD (`scripts/norecord.mjs`). The display watchdog ended clean.
- Load: the harness's `--load-factor 2`, 16 stress-ng workers on the VM's 8 cores, started by the harness and stopped
  at the end (load average 17.1 at the end). No other stress-ng ran.
- 40 drags a side, in the harness's rotating blocks of 10 on fresh engines. Lanes: `pinned` (26.928.40906), `cua`
  (the head as it ships), `cua:before` (the head with Chromium's pacing before T11: 500 µs a sample and no rest, the
  control). The witness was clean in every run of every lane, and the activating stub failed it (the negative check).
- Command: `scripts/sitting.sh <harness> load2-head` (21:36–21:57Z, 2026-11-08). Exit 0, judges' verdict for `cua`: PASS.

| family | kind | pinned landed | `cua` landed | `cua:before` landed | distance px, pinned (min, median, max) | `cua` | `cua:before` |
|---|---|---:|---:|---:|---|---|---|
| Chrome | scroller | 40/40 | **40/40** | 35/40 | 110, 129, 147 | 146, 146, 147 | 90, 119.5, 144 |
| Chrome | range | 40/40 | **40/40** | 40/40 | (value 50.6 mean) | (50.6; shortest 50) | (50.6; shortest 50) |
| Electron | scroller | 40/40 | **40/40** | 34/40 | 115, 131.5, 147 | 146, 146, 147 | 83, 119, 147 |
| Electron | range | 40/40 | **40/40** | 40/40 | (value 50.5 mean) | (50.6; shortest 50) | (50.4; shortest 49) |

Reported, not judged under load:

- **Reach**: cua's thumbs reached the pinned build's mean in the same sitting on 40 of 40 runs in both browsers (Chrome
  mean 129.9 px, Electron 130.1; cua's shortest 146). The control reached it on 15 of 40 in each.
- **Speed** (warm medians): Chrome thumb 64.2 ms against the pinned build's 283.3, Electron thumb 253.8 against 284.6;
  ranges 140.1 and 254.4 against 548.9 and 488.0.
- **Motions received** (coalesced `pointerrawupdate` samples, median per thumb drag): Chrome pinned 55, cua 33,
  control 40; Electron 58, 46, 49. cua lands farther with fewer received samples, as T11 found idle.

## The mechanism, briefly

The released 0.3.0 had landed thumbs 34 and 35 of 40 and Chrome's range 39 of 40 at this load (T10,
`m4/drag-judges/fix/load2-released/`). T11 found why (`m4/drag-motion/`): Chromium's compositor scrollbar takes at most
one drag move a frame and its pointer-up carries no position, so a thumb stops where the last frame's first move left
it. Under load frames come late, so the motions after the last processed one were lost more often and thumbs fell
short (0.3.0's shortest 68–85 px). T11's 30 ms rest at the drag's end, followed by a second visit of the end point,
gives the compositor a frame in which the final position is the first move, and so the thumb ends at the path's end
(146–147 px) on every run, idle and loaded.

This sitting confirms it as a same-sitting comparison: the control lane, the same binary with the rest taken away,
reproduces 0.3.0's misses at this load (35 and 34 of 40, shortest 90 and 83 px), so the load discriminates and the rest
is what closes the gap. The range inputs were 40 of 40 in every lane here; 0.3.0's one Chrome range miss in T10 was
within the run-to-run spread (T10's first load sitting had it the other way, 40 against the pinned build's 39).

T11's own loaded sitting (`m4/drag-motion/load2/`, ae04d620 with the 30 ms rest that shipped) had the same result, 40
of 40 for both thumbs and both ranges, so this is the second independent loaded sitting at 40 of 40.

## Limits

- One sitting of 40 a side, as the rule asks; it shows cua at the pinned build's count, not a rate below 1 in 40.
- A development build of the head, not the gate's attested artifact; T18's gate repeats the cells at twice the load on
  the attested artifact.
- The `:0` display is not measured here (private displays only, by rule).
