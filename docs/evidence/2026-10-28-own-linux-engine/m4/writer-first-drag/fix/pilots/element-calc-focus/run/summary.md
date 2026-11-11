# linux-engine-diff summary

## t72-pilot-calc (experiment writer-drag)

An engine's element right click on fresh windows and after that first pointer event (vcl-probe.mjs `elementProbe`): where it landed (VCL's context menu's corner, the press the GTK 3 point scene records, or for Calc the cell the click made active, against the cell at the true centre) against the element's true centre as the harness reads it from LibreOffice's host panel. Every scene's application was verified first (app-identity.mjs).

| engine | family | pass | on the element | reported centre | host shift | true centre | landed |
|---|---|---|---:|---|---|---|---|
| cua | calc | fresh | 0/1 | 620, 436 | 0, 27 | 620, 463 | active cell – (the true centre's J17; menu corner 620, 125) |
| cua | calc | after a pointer event | 0/1 | 620, 463 | 0, 0 | 620, 463 | active cell – (the true centre's J17; menu corner 620, 125) |
| pinned | calc | fresh | 0/1 | 620, 436 | 0, 27 | 620, 463 | active cell – (the true centre's J17; menu corner 620, 436) |
| pinned | calc | after a pointer event | 0/1 | 620, 463 | 0, 0 | 620, 463 | active cell – (the true centre's J17; menu corner 620, 125) |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 421 requests, 36 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

