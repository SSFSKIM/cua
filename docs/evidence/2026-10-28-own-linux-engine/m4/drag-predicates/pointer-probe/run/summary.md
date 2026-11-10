# linux-engine-diff summary

## t70-probe1 (experiment predicates)

T15's adopted cases (predicates.mjs): each allowed case 30 runs of cua as it ships, every one taking effect with the witness unchanged; each still-refused counterexample 10, every one the Device mode sentence with the witness unchanged. Beside them the pinned build's counts and, on a refused move or drag, cua's own events with the cover left unjudged (`cua:any-cover`, `--drag-ignore-cover`). The occlusions: `visible` the window raised, nothing over it (the pointer probe); `partial` a managed window over the bottom half of the window; `partial-deep` a managed window over its bottom 70%; `partial-top` a managed window over its top 55%; `overlay` an override-redirect window over its bottom-right corner, clear of every case's points; `offscreen` its right fifth off the screen, nothing over it; `covered` a managed window over the whole screen.

| occlusion | kind | expected | cua | pinned took | cua:any-cover took | why | verdict |
|---|---|---|---:|---:|---:|---|---|
| visible, pointer out | move | probe | – | – | 0/10 | the real pointer outside it | PASS |
| visible, pointer out | select | probe | – | – | 0/10 | the real pointer outside it | PASS |
| visible, pointer out | canvas | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial-deep, pointer in | move | probe | – | – | 10/10 | the real pointer in the window | PASS |
| partial-deep, pointer in | range | probe | – | – | 0/10 | the real pointer in the window | PASS |
| partial-deep, pointer out | move | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial-deep, pointer out | range | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial-top, pointer in | move | probe | – | – | 10/10 | the real pointer in the window | PASS |
| partial-top, pointer in | range | probe | – | – | 0/10 | the real pointer in the window | PASS |
| partial-top, pointer in | canvas | probe | – | – | 10/10 | the real pointer in the window | PASS |
| partial-top, pointer out | move | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial-top, pointer out | range | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial-top, pointer out | canvas | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial, pointer in | move | probe | – | – | 10/10 | the real pointer in the window | PASS |
| partial, pointer in | select | probe | – | – | 0/10 | the real pointer in the window | PASS |
| partial, pointer in | canvas | probe | – | – | 10/10 | the real pointer in the window | PASS |
| partial, pointer out | move | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial, pointer out | select | probe | – | – | 0/10 | the real pointer outside it | PASS |
| partial, pointer out | canvas | probe | – | – | 0/10 | the real pointer outside it | PASS |

Every case holds.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 12076 requests, 1146 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

