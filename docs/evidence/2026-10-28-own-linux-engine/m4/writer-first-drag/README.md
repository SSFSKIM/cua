# M4 T16: Writer's first drag, and LibreOffice's positions

Task 72, on `feat/171-m4-t16` (from `feat/171-m4` at 328a3bb5). All runs here are on private displays (Xvfb with
Openbox, `scripts/private-run.mjs`). None are on `:0`. The candidates are dev runs, not a release gate: musl builds
made the release workflow's way (`scripts/build-musl.sh`), `cua-engine 0.3.0 (328a3bb55f38)`, sha256 `916a7577…`,
for the pilots, and `cua-engine 0.3.0 (eadbbc8a92a1)`, sha256 `abf8cc6c…`, for `first/`, `element/`,
`element-calc/` and `drag-writer/`.

## What was found

**The harness could not see a drag's selection because it aimed above the text.** Writer's selection *can* be seen
on a private display. An AT-SPI selection (`Text.AddSelection`) and a background click followed by Shift+Right were
each read 3 of 3, by AT-SPI's selections and by PRIMARY (`pilots/observe`). But no drag selected anything:

- cua's, fresh or primed, and the pinned build's, primed (`pilots/observe`);
- real XTEST drags with the window active, fresh or primed;
- a real drag at a person's pace (300 ms held, 12 moves 40 ms apart), and plain real and background clicks
  (`pilots/press`);
- every pacing variant: a rest at the end, a 300 ms press dwell, 3 ms a sample (`pilots/pacing`).

The capture shows why. The first line is drawn at y 226 to 241 of the client, and the "Header (Default Page Style)"
control shows where the presses landed: in the page's header margin above it (`pilots/press/shots/pixels-4.jpg`). The
drag cell aimed at y 207.

**The mechanism: LibreOffice reports what VCL draws 27 px too high after a configure.** This is LibreOffice 24.2.7,
on its gtk3 VCL plugin, with a native GTK menu bar 27 px tall (`pilots/hierarchy`, Writer, Calc and Impress alike):

- The GTK side reports true rectangles in every state: the frame (0, 0, 1280x800, the WM frame's rectangle), the
  client panel (0, 21, 1280x779), the menu bar's panel (0, 21, 1280x27), and the panel hosting VCL (0, 48, 1280x752).
- VCL's root pane, under that host, is at (0, 21) after the harness's arrangement (a raise: the window manager's
  ConfigureNotify). It is at (0, 48), agreeing with the host, after one background move, and back at (0, 21) after the
  next arrangement. Everything below it moves with it: a Writer paragraph reports y 220, then 247.
- In `vcl/unx/gtk3/gtkframe.cxx` (24.2), a configure sets the frame's `maGeometry` to the client's origin, and every
  pointer event's `UpdateGeometryFromEvent` sets it to `x_root - x` of VCL's drawing widget, below the menu bar. VCL
  places its accessible content from `maGeometry`.

So from a configure until the next pointer event, every VCL extent is too high by the menu bar's height. The drag
cell's `locate` subtracted the X11 client's origin from those extents and aimed 27 px high. It located once per
window, after the raise and before any input, so every run aimed high, primed or not.

**With the aim fixed, a fresh window's first drag selects in every engine, wherever the real pointer is.** Aimed from
the window's AT-SPI frame instead (`pilots/geometry`, 5 runs a case), every lane selected 5 of 5:

- cua, the pinned build and XTEST on fresh windows;
- cua drag after drag in one window;
- with the old aim, 0 of 5.

That frame aim is right only by coincidence, 6 px off, so it was not built. The aim that was built reads the host
panel's offset (below).

**The real pointer does not matter to Writer.** In the proof (`first/`), cua's first drags selected 10 of 10 with the
pointer outside the window, 10 of 10 with it on the text, and 10 of 10 with it in the window off the text. Writer
is GTK 3, which takes background drags whatever the real pointer does. T19's Gecko dependence does not apply, and
#356's hover leftover is a different input kind (a move off a hovered widget).

**GDK's motion hints, recorded and not acted on.** LibreOffice's gtk3 frame selects `GDK_POINTER_MOTION_HINT_MASK`
and asks for the pointer after every motion ("ask for the next hint"). GDK 3 emulates motion hints on the client side
and drops a motion whose serial predates the last re-arm (`gdkwindow.c` `proxy_pointer_event`). In a GTK 3 window
with the same mask (`scripts/hint-window.py`, `scripts/hint-probe.mjs`), a burst of background motions loses some of
its motions: between 4 and 158 received of about 200 sent, by drag. The last one received was at the path's end or
within 3 px of it in every drag (`hint-probe.txt`). Writer's selections in the proof all reached their ends. This
explains no miss here, so nothing was built on it.

**M1a.4's `:0` pattern is not reproduced.** On `:0`, M1a.4 saw the first drag miss and the later ones take. On a
private display, every drag missed on the old aim and every first drag takes on the new one. Whether `:0` adds
something (the order of the window manager's configures and the pointer events there) was not measured, since this
task ran nothing on `:0`. For T18's rehearsal on `:0`: run the Writer cell unprimed.

## The engine had the same miss, and is fixed (the design session's ruling B, 2026-11-10)

The engine takes an element's right-click point, a paste's focusing click and an element scroll's point from
`Component.GetExtents(0)`. For a fresh LibreOffice window those landed 27 px above the element and answered ok
(`pilots/element`: a dev musl build of 328a3bb5, Writer, 3 of 3 windows). VCL opened its context menu at (603, 228)
for a paragraph whose true centre is (603, 254). The pinned build does the same (`element/`, `pinned`). A plain GTK 3
window framed by the window manager (`pages/point-gtk3.py`) was right in every state: the press landed on the
button's exact centre, 3 of 3. gedit has a header bar and no WM frame (`_NET_FRAME_EXTENTS` 0, 0, 0, 0). The tree
cua reports carries no element frames (`AxNode`), so a model cannot read the wrong position from cua.

`native/linux-engine/src/vcl.rs` moves a LibreOffice element's VCL extents, and those of its VCL ancestors, by the
host panel's offset from the root pane wherever the two disagree in the menu bar's shape: the root pane at the
client's origin, with the host's size. It refuses the point-based action, with nothing sent, wherever the structure is
another one: `LibreOffice's reported position for this element can't be trusted until the pointer has moved over its
window; nothing was sent`. Left element clicks are `DoAction` and are unchanged. The difference is declared in
`deviations.mjs`, with its version dependence.

`element/` (the candidate built from eadbbc8a), 3 fresh windows a family. The truth is read by the harness itself,
from the host panel (`vcl-aim.mjs`), never from the engine:

| engine | family | fresh window: on the element | after a pointer event |
|---|---|---:|---:|
| cua | Writer | 3/3 (menu at the true centre, 603, 254) | 3/3 |
| cua | Impress | 3/3 (603, 256) | 3/3 |
| cua | GTK 3, WM-framed | 3/3 | 3/3 |
| pinned | Writer | 0/3 (603, 227: 27 px high) | 3/3 |
| pinned | Impress | 0/3 (603, 229) | 3/3 |
| pinned | GTK 3, WM-framed | 3/3 | 3/3 |

**Calc** (`element-calc/`). Its cells' objects are made on demand, so an engine cannot resolve a cell's id again; the
probe right-clicks the sheet itself, whose centre is (620, 463) and which reports (620, 436) when stale. Calc's context
menu does not locate the press directly: it is about 338 px tall and, where it does not fit below the press, opens
above it, ending at the press. So the probe's own judge reads 0/3 in every cell, and the menu's corner is read instead:

- every press at the true centre (cua fresh, cua and the pinned build after a pointer event) opened the menu at y 125,
  ending at the press;
- the pinned build's fresh press opened it at y 437, below a press at 436, 27 px high.

cua's fresh press is therefore at the truth. The same offset is in Calc's levels (`pilots/hierarchy`).

## The harness's aim, and the Writer cell without priming

`scripts/linux-engine-diff/vcl-aim.mjs` reads VCL's offset as the host panel's origin less the root pane's, and
throws on any other shape. `drag.mjs`'s `locate` moves LibreOffice's character extents by it. The priming drag
(`DRAG_PRIMING`) hid only the old aim, so it is gone, and T18's gate inherits the changed Writer cell.

- **The proof** (`first/`, `--plan first`, candidate eadbbc8a, every run a fresh, unprimed window's first drag):

  | case | runs | selected (AT-SPI / PRIMARY) | witness | audit |
  |---|---:|---|---|---|
  | cua, the pointer outside | 30 | 30 / 30 | clean | – |
  | cua, the pointer on the text | 10 | 10 / 10 | clean | – |
  | cua, the pointer in the window off the text | 10 | 10 / 10 | clean | – |
  | pinned | 10 | 10 / 10 | clean | – |
  | newest | 10 | 10 / 10 | clean | – |
  | cua through xtrace | 3 | 3 / 3 | clean | clean (1,683 requests) |
  | control: the pre-T16 aim | 5 | 0 / 0 | clean | – |

  The verdict line: PASS.
- **The drag experiment's Writer cell** (`drag-writer/`, `--family writer --ops select,select-unprimed --trials 10`,
  no priming): `select` 10 of 10 in every lane (pinned, newest, cua, `cua:0ms`), and `select-unprimed`, a fresh window
  per run, 10 of 10 in every lane. The unprimed judge took 20 of 20 of the select cell's even runs. Verdict PASS.

## Sittings and the host lock

Each line pair is from `host-lock.log` (holder task72, load at acquire and at release):

| sitting | acquire | release |
|---|---|---|
| `pilots/observe` | 19:07:06Z, 0.29 | 19:12:04Z, 0.70 |
| `pilots/pacing` | 19:29:42Z, 0.97 | 19:34:23Z, 0.47 |
| `pilots/press` | 20:14:31Z, 1.62 | 20:18:36Z, 0.76 |
| `pilots/geometry` | 21:14:18Z, 0.29 | 21:20:42Z, 0.54 |
| `pilots/element` (the old engine) | 21:30:27Z, 0.65 | 21:32:13Z, 0.26 |
| `pilots/hierarchy` (and the pinned build's right click) | 21:36:38Z, 0.24 | 21:38:52Z, 0.71 |
| `first/` (the build, then the proof) | 21:59:43Z, 0.11 | 22:21:46Z, 0.63 |
| `element/`, `drag-writer/`, `hint-probe.txt` | 22:22:35Z, 1.59 | 22:39:06Z, 0.43 |
| `element-calc/` | 22:39:36Z, 1.18 | 22:41:22Z, 0.90 |

`pilots/press` acquired at 1.62, about 1.1 above the others' idle; it is a pilot, measured and never judged, and its
result (nothing selected) is the same as every other pilot's on that aim. `element/` and `element-calc/` acquired at 1.59
and 1.18, straight after other holders; their readings are positions, not times. (`element/`'s release says status 1:
its Calc cell failed to resolve a cell, which `element-calc/` replaced.)

The pilot plans ran on intermediate, uncommitted versions of the probe at 328a3bb5's harness. They are kept as they
ran (`writer-drag.mjs` `PLANS`, with the aim `raw`). `first/`, `element/`, `drag-writer/` and `element-calc/` ran on
the committed code: eadbbc8a, and 7ef4b280 for Calc's target.

## Rerunning it

From this directory, on the #171 VM (`scripts/env.sh` names the vendor builds; `T`, default
`~/.local/share/cua-171/task72`, is where builds and sittings go; `WT` is the checkout):

```bash
c=$(WT=<checkout> scripts/build-musl.sh eadbbc8a)              # the candidate, the release workflow's way
scripts/probe.sh <checkout> first "$c" --plan first --newest "$NEWEST"   # the proof
scripts/probe.sh <checkout> element "$c" --plan element --trials 3        # the engine's points
scripts/probe.sh <checkout> hierarchy "$c" --plan hierarchy --trials 2    # LibreOffice's levels by state
node scripts/hint-probe.mjs "$c"                                           # GDK's motion hints (its own Xvfb)
python3 scripts/copy-evidence.py "$T/runs" . <sitting>=<name>...           # the copy here, home paths labelled
```
