# linux-engine-diff summary

## t72-pilot-element2 (experiment writer-drag)

The engine's element right click (writer-drag.mjs `elementProbe`), located by the context menu it opens (Writer: VCL puts it at the press; gedit: GTK puts it at the real pointer, so gedit's row does not locate the press) or by the press the scene records (`gtk3-frame`).

| family | run | pass | X11 window (x, y) | WM frame (l, r, t, b) | AT-SPI frame | element extents | engine point | landed | landed less point |
|---|---:|---|---|---|---|---|---|---|---|
| writer | 0 | fresh | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 220, 793x15 | 603, 227 | menu at 603, 228 | 0, 1 |
| writer | 0 | after a pointer event | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 247, 793x15 | 603, 254 | menu at 603, 255 | 0, 1 |
| writer | 1 | fresh | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 220, 793x15 | 603, 227 | menu at 603, 228 | 0, 1 |
| writer | 1 | after a pointer event | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 247, 793x15 | 603, 254 | menu at 603, 255 | 0, 1 |
| writer | 2 | fresh | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 220, 793x15 | 603, 227 | menu at 603, 228 | 0, 1 |
| writer | 2 | after a pointer event | 0, 21 | 0, 0, 21, 0 | 0, 0, 1280x800 | 207, 247, 793x15 | 603, 254 | menu at 603, 255 | 0, 1 |
| gedit | 0 | fresh | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gedit | 0 | after a pointer event | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gedit | 1 | fresh | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gedit | 1 | after a pointer event | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gedit | 2 | fresh | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gedit | 2 | after a pointer event | 0, 0 | 0, 0, 0, 0 | 0, 0, 900x700 | 5, 51, 890x617 | 450, 359 | menu at 641, 401 | 191, 42 |
| gtk3-frame | 0 | fresh | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |
| gtk3-frame | 0 | after a pointer event | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |
| gtk3-frame | 1 | fresh | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |
| gtk3-frame | 1 | after a pointer event | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |
| gtk3-frame | 2 | fresh | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |
| gtk3-frame | 2 | after a pointer event | 1, 22 | 1, 1, 22, 5 | 0, 0, 602x427 | 151, 142, 300x80 | 301, 182 | pressed at 301, 182 | 0, 0 |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1076 requests, 113 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

