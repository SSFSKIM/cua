# linux-engine-diff summary

## t70-pilot-kinds-partial (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (partial); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Firefox | scroll (page status) | 10/10 | 0/10 | 10/10 | clean | undecided |
| Firefox | move (page status) | 10/10 | 0/10 | 10/10 | clean | undecided |
| Firefox | click (page status) | 10/10 | 0/10 | 10/10 | clean | undecided |

No kind was shown ignored.
Undecided (the control missed, or the background lanes took some runs): firefox scroll; firefox move; firefox click.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7060 requests, 593 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

