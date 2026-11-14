# M4 T16: Writer's first drag, and LibreOffice's positions

> The review of task 72 corrected four things in what follows; the **Fix wave** section at the end has the corrected
> sittings (`fix/`). The Impress rows below are Writer's: Impress was not installed, and the empty .odp opened in
> Writer. The proof's "pointer outside" lane parked inside the maximized Writer. The engine trusted a stale point
> that named the root pane itself. Calc's landing is still only inferred.

Task 72, on `feat/171-m4-t16` (from `feat/171-m4` at 328a3bb5). All runs here are on private displays (Xvfb with
Openbox, `scripts/private-run.mjs`). None are on `:0`. The candidates are dev runs, not a release gate: musl builds
made the release workflow's way (`scripts/build-musl.sh`), `cua-engine 0.3.0 (328a3bb55f38)`, sha256 `916a7577…`,
for the pilots, `cua-engine 0.3.0 (eadbbc8a92a1)`, sha256 `abf8cc6c…`, for `first/`, `element/`,
`element-calc/` and `drag-writer/`, and `cua-engine 0.3.0 (accdc6c5601b)`, sha256 `373b6d0b…`, the final head's engine
(its refusal moved before any session), for `element-final/`.

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

**The final head** (`element-final/`, accdc6c5, which refuses an uncorrectable point before any session or
activation): the same table as `element/`, row for row. cua lands on the element 3/3 on fresh Writer, Impress and
GTK 3 windows and 3/3 after a pointer event; the pinned build lands 0/3 on fresh Writer and Impress windows (27 px
high) and 3/3 elsewhere.

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
| the engine's suites, the build of accdc6c5, `element-final/` | 23:29:50Z, 0.33 | 23:42:14Z, 0.34 |

`pilots/press` acquired at 1.62, about 1.1 above the others' idle; it is a pilot, measured and never judged, and its
result (nothing selected) is the same as every other pilot's on that aim. `element/` and `element-calc/` acquired at 1.59
and 1.18, straight after other holders; their readings are positions, not times. (`element/`'s release says status 1:
its Calc cell failed to resolve a cell, which `element-calc/` replaced.)

The pilot plans ran on intermediate, uncommitted versions of the probe at 328a3bb5's harness. They are kept as they
ran (`writer-drag.mjs` `PLANS`, with the aim `raw`). `first/`, `element/`, `drag-writer/` and `element-calc/` ran on
the committed code: eadbbc8a, 7ef4b280 for Calc's target, and accdc6c5 for `element-final/`.

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

## Fix wave (task 72's review and the design session, 2026-11-10)

Branch `feat/171-m4-t16-fix` (from `feat/171-m4-t16` at 770b924e). The evidence is in `fix/`, with its scripts in
`fix/scripts/`. Every run was on a private display, and nothing ran on `:0`. The candidate is a dev musl build of
7a965d12, made the release workflow's way (`scripts/build-musl.sh`): `cua-engine 0.3.0 (7a965d12eefb)`. The harness is
an export of each sitting's commit (`fix/scripts/sit.sh`). The engine's sources are the same at every later commit of
the wave, except for one test file, `tests/send_boundary.rs`.

### What changed

1. **The engine read the shape from the ancestors only** (finding 1). An element scroll or right click that named
   VCL's root pane itself saw the host panel, the client panel and the frame, with no root pane among them. So it
   trusted the root pane's stale extents. `vcl::shift` now reads the chain from the element up. The index it answers
   counts the ancestors that take the shift, and that count is none for the root pane.
   - Proof, live, on a GTK 3 staging of LibreOffice's shape (`native/linux-engine/tests/support/vcl-shape.py`,
     `WM_CLASS` libreoffice-writer; `src/engine/vcl_faults.rs`). `fix/engine/red.txt` runs the new tests on
     770b924e's `elements.rs` and `vcl.rs`:
     - the right click and the scroll on the stale root pane landed at y 150, for a host centred at 177;
     - an unknown shape was answered ok;
     - the control, a root pane that agrees with its host, passed.
   - `fix/engine/green.txt`: 11 of 11.
   - Live on Writer (`fix/element/`, family `writer-root`):
     - cua's fresh right click on the root pane landed at (640, 424), the host's centre, 3 of 3;
     - the pinned build landed at (640, 397), 27 px high, 0 of 3;
     - 770b924e's engine (task 72's accdc6c5 build, `fix/element-770b924e/`) landed at (640, 397) too, 0 of 3.
2. **The outside lane parked inside Writer** (finding 2). The counted windows are maximized (0, 21, 1280x779), so the
   park at (1275, 300) was inside Writer. A park on the bare root is no fix: the harness's own audit (`foreign.mjs`)
   counts a pointer that ends on the root as a change to a window the run did not open. A pilot shows it
   (`fix/pilots/observe-root-park/`: "WarpPointer on 0x000001ff").
   - The ruling (the design session): the lane parks on another window of the run's, off Writer. The point is the
     front window's middle, verified through `QueryPointer`'s child chain (`park.mjs`, `xprobe pointer-chain`). T19's
     sitting parked the same way.
   - While a fresh window opens, the pointer waits on the front window, so no motion of the harness's reaches Writer
     before a case's own park. Every run records the chain it was verified over (`park_chain`).
3. **Impress was Writer** (finding 3). Impress was not installed on the VM, and any presentation opened "as a Writer
   document", LibreOffice's own templates included. The controller installed `libreoffice-impress` 4:24.2.7, the
   version Writer and Calc run.
   - The fixture is now a one-slide flat-ODF presentation with its master page (`families.mjs` `IMPRESS_DOC`).
   - Every scene's application is verified before it counts (`app-identity.mjs`). On this VM LibreOffice is
     `soffice`, toolkit `gtk`, in every module, so the role of the frame's document is what tells them apart
     (`fix/pilots/identity/`).
   - Before the install, the Impress scene was refused with `document "document text", not "document presentation"`
     (`fix/pilots/element-identity-refusal/`).
4. **The drag cell's aim kept a stale shift** (finding 4). `locate` read VCL's offset once, while each `cell()` read
   the extents as they were then. `vclDrawn` now reads the extents between two readings of the offset that agree.
   The recorded cell computed its paths straight after `locate`, so its numbers do not move: `select` aimed at y 234
   and selected the path's text in every lane, before and after (`fix/scripts/select-aims.py` over `drag-writer/` and
   `fix/drag-writer/`).
5. **T8's settle aimed Writer the old way.** `action-settle.mjs` `linesOf` now aims the same way. Writer's drag, which
   T8 left out because it "selected nothing at all", is a cell again.
6. **Calc's landing stays inferred.** No direct read of the cell a background right click makes active was found:
   - the sheet's Selection names no child for a lone cell cursor (`fix/pilots/element-calc-selection/`);
   - no node named `Name Box` is on the bus (a pilot's field dump read only the status bar's labels; the next pilot
     overwrote its run);
   - no cell is focused or selected while the window is in the background (`fix/pilots/element-calc-focus/`).
   The probe now records the cells at the true centre and at the stale one, J17 and J15, two rows apart. The landing
   is left unjudged ("inferred") and read from where the menu opens, as before.
7. **The refusal of an unrecognized structure is unit-tested only, as far as LibreOffice goes.** No live LibreOffice
   window shows another shape. `vcl.rs`'s refusal has unit tests and the GTK 3 staging's live test (`odd`), and no
   LibreOffice window was refused in any sitting.

### The sittings

| sitting | what | sitting start (load) | acquire / release (`host-lock.log`) |
|---|---|---|---|
| `fix/element/`, `fix/element-770b924e/`, `fix/hierarchy-impress/` | the engine's points; 770b924e's engine; Impress's levels | 04:41:48Z (0.99) | 04:40:35Z, 1.37 / 04:53:21Z, 0.92 |
| `fix/first/` | the proof | 05:24:37Z (0.98) | 05:21:42Z, 16.65 / 05:46:44Z, 0.65 |
| `fix/drag-writer/` | the drag experiment's Writer cell | 05:57:04Z (0.45) | 05:57:04Z, 0.45 / 06:11:33Z, 0.53 |
| `fix/settle/search-idle/` | T8's Writer cells, searched from 0 | 03:02:07Z (1.26) | 03:02:07Z, 1.26 / 03:11:24Z, 0.73 |
| `fix/settle/search-load2/` | the same, at twice the load | 03:45:04Z | 03:45:04Z, 1.47 / 04:02:39Z, 17.15 |
| `fix/settle/confirm-idle/` | `drag` at 25, the shipped lane | 04:39:00Z (0.93) | 04:35:16Z, 17.04 / 04:40:35Z, 1.37 |
| `fix/settle/confirm-load2/` | the same, at twice the load | 05:18:46Z | 05:18:46Z, 1.31 / 05:21:42Z, 16.65 |

When an acquire found the previous holder's load (another task's load sitting, or this wave's own), the sitting
waited inside the lock: an idle sitting starts once the 1-minute load is under 1.0 (`fix/scripts/sit.sh`), and its
`starts` line is its own start. The first `element`, `first` and `drag-writer` sittings started straight after a loaded
holder (acquire loads 2.82, 2.00 and 5.73). They are kept in `fix/superseded/` and were rerun. Their positions and
selections are the reruns', row for row; their Calc rows were judged by a read that was later dropped (item 6).

### The results

- **The engine's points** (`fix/element/`, 3 fresh windows a family; the truth is the harness's own reading of the
  host panel):

  | engine | Writer paragraph | Writer root pane | Impress | Calc's sheet (inferred) | GTK 3, WM-framed |
  |---|---:|---:|---:|---|---:|
  | cua, fresh | 3/3 | 3/3 | 3/3 (312, 339) | menu at y 125: the press at the truth | 3/3 |
  | cua, after a pointer event | 3/3 | 3/3 | 3/3 | menu at y 125 | 3/3 |
  | pinned, fresh | 0/3, 27 px high | 0/3, 27 px high | 0/3 (312, 312) | menu at y 436: the stale press | 3/3 |
  | pinned, after a pointer event | 3/3 | 3/3 | 3/3 | menu at y 125 | 3/3 |

  Every Impress scene was verified to be Impress: `soffice`, `gtk`, `document presentation`. Its levels by state
  (`fix/hierarchy-impress/`) are Writer's and Calc's. The root pane is at y 21 after the arrangement, at 48 (with the
  host) after a background move, and at 21 again after the next arrangement.
- **The proof** (`fix/first/`): PASS.

  | case | runs | selected (AT-SPI / PRIMARY) | where the pointer was verified |
  |---|---:|---|---|
  | cua, the pointer on another window of the run's (the front window), off Writer | 30 | 30 / 30 | the front xterm |
  | cua, the pointer on the text | 10 | 10 / 10 | Writer |
  | cua, the pointer in the window off the text | 10 | 10 / 10 | Writer |
  | pinned | 10 | 10 / 10 | the front xterm |
  | newest | 10 | 10 / 10 | the front xterm |
  | cua through xtrace | 3 | 3 / 3, audit clean (1,683 requests) | the front xterm |
  | control: the pre-T16 aim | 5 | 0 / 0 | the front xterm |

  Every witness was clean. The harness's trace records every change of a window as its own.
- **The drag experiment's Writer cell** (`fix/drag-writer/`): `select` 10 of 10 and `select-unprimed` 10 of 10 in
  every lane. The unprimed judge took 20 of 20 of the select cell's even runs. PASS.
- **T8's Writer settle cells, on the corrected aim** (`fix/settle/`; the held step idle / at twice the load, searched
  from the 0 ms control; T8's numbers are from `../settle/`, T9's from `../waits/final/`):

  | cell | T8 / T9 | now |
  |---|---|---|
  | click, background | 0 / 0 | 0 / 0 |
  | click, desktop (T9) | 0 / 0 (shipped) | 0 / 0 |
  | press_key | 25 / 25 | 25 / 25 |
  | key_down | 25 / 25 | 25 / 25 |
  | activate_window | 10 / 10 | 10 / 10 |
  | type_text | 0 / 0 | 0 / 0 |
  | drag, background (new) | not measured | 0 / **25** |

  - No number T8 recorded moved.
  - Writer's drag needs 25 ms at twice the load: 0 ms missed 10 of 31 and 10 ms missed 3 of 32, all late. With the
    design session's approval (2026-11-10), `settle.mjs`'s `drag` went from 10 to 25.
  - The shipped lane confirmed it: 30 of 30 idle and 30 of 30 at twice the load. Each audit was clean (1,823 and
    1,829 requests, 5 of 5 runs ran their input).
  - The settle does not enter Acceptance 3's drag times. The drag experiment drives each engine directly over its
    wire (`engine.mjs` `request`, timed from the request's send to its answer), outside cua's service, where the
    settle lives. Only its held-move cells space their `drag_handle` requests, by `SETTLE_MS.drag_handle`, which did
    not change.

### Rerunning it

From this directory, with `T` the work directory and `WT` the checkout (`fix/scripts/sit.sh` sets both):

```bash
c=$(T=<work> WT=<checkout> scripts/build-musl.sh 7a965d12)
fix/scripts/sit.sh <commit> "$c" 'element|probe|--plan element --trials 3' "first|probe|--plan first --newest $NEWEST"
fix/scripts/sit.sh <commit> "$c" 'drag-writer|drag|--family writer --ops select,select-unprimed --trials 10'
fix/scripts/sit.sh <commit> "$c" 'settle|settle|--family writer' 'settle-load2|settle|--family writer --load --load-factor 2'
fix/scripts/engine-red-green.sh <out>    # finding 1's RED (770b924e's elements.rs and vcl.rs) and GREEN
```
