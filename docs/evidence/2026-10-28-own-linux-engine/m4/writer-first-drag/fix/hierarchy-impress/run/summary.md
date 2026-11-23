# linux-engine-diff summary

## t72-fix2-hierarchy (experiment writer-drag)

LibreOffice's AT-SPI levels by state (vcl-probe.mjs `runHierarchyPlan`): Writer's path from frame to first paragraph, Calc's and Impress's levels in results.jsonl.

- impress run 0, after the arrangement: (levels in results.jsonl)
- impress run 0, after a background move: (levels in results.jsonl)
- impress run 0, after the arrangement again: (levels in results.jsonl)
- impress run 1, after the arrangement: (levels in results.jsonl)
- impress run 1, after a background move: (levels in results.jsonl)
- impress run 1, after the arrangement again: (levels in results.jsonl)

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 429 requests, 32 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

