# linux-engine-diff summary

## t72-element-final (experiment writer-drag)

An engine's element right click on fresh windows and after that first pointer event (vcl-probe.mjs `elementProbe`): where it landed (VCL's context menu's corner, or the press the GTK 3 point scene records) against the element's true centre as the harness reads it from LibreOffice's host panel.

| engine | family | pass | on the element | reported centre | host shift | true centre | landed |
|---|---|---|---:|---|---|---|---|
| cua | writer | fresh | 3/3 | 603, 227 | 0, 27 | 603, 254 | 603, 254 |
| cua | writer | after a pointer event | 3/3 | 603, 254 | 0, 0 | 603, 254 | 603, 254 |
| cua | impress | fresh | 3/3 | 603, 229 | 0, 27 | 603, 256 | 603, 256 |
| cua | impress | after a pointer event | 3/3 | 603, 256 | 0, 0 | 603, 256 | 603, 256 |
| cua | gtk3-frame | fresh | 3/3 | 301, 182 | 0, 0 | 301, 182 | 301, 182 |
| cua | gtk3-frame | after a pointer event | 3/3 | 301, 182 | 0, 0 | 301, 182 | 301, 182 |
| pinned | writer | fresh | 0/3 | 603, 227 | 0, 27 | 603, 254 | 603, 227 |
| pinned | writer | after a pointer event | 3/3 | 603, 254 | 0, 0 | 603, 254 | 603, 254 |
| pinned | impress | fresh | 0/3 | 603, 229 | 0, 27 | 603, 256 | 603, 229 |
| pinned | impress | after a pointer event | 3/3 | 603, 256 | 0, 0 | 603, 256 | 603, 256 |
| pinned | gtk3-frame | fresh | 3/3 | 301, 182 | 0, 0 | 301, 182 | 301, 182 |
| pinned | gtk3-frame | after a pointer event | 3/3 | 301, 182 | 0, 0 | 301, 182 | 301, 182 |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2326 requests, 218 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

