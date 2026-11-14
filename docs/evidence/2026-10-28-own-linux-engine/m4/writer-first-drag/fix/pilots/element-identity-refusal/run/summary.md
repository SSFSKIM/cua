# linux-engine-diff summary

## t72-pilot-element (experiment writer-drag)

An engine's element right click on fresh windows and after that first pointer event (vcl-probe.mjs `elementProbe`): where it landed (VCL's context menu's corner, the press the GTK 3 point scene records, or for Calc the cell the click made active, against the cell at the true centre) against the element's true centre as the harness reads it from LibreOffice's host panel. Every scene's application was verified first (app-identity.mjs).

| engine | family | pass | on the element | reported centre | host shift | true centre | landed |
|---|---|---|---:|---|---|---|---|
| cua | calc | **failed: cua171-diff-t72-pilot-element-c1eaeb13-calc-elcuacalc0 is not calc's application: toolkit "gtk", not "VCL"** |
| cua | writer-root | **failed: spawnSync xdotool ETIMEDOUT** |
| pinned | calc | **failed: spawnSync xdotool ETIMEDOUT** |
| pinned | writer-root | **failed: spawnSync xdotool ETIMEDOUT** |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 195 requests, 14 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

