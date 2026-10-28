# #171 M0.4: the application-family matrix

On the #171 VM (`dc-linux171-1e68`, x86-64, 8 vCPU, Ubuntu 24.04, X11 `:0`, Openbox, no compositor), 2026-10-28,
against the spec `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` (M0, Matrix; the Decision Log's
M0.3 entry, last bullet; Retention and the fixed waits). The harness is the differential contract test of M0.3
(`scripts/linux-engine-diff/`, its README), which sends the same well-formed requests to OpenAI's two Linux engine
builds and to cua-engine and compares what they do; M0.4 added the matrix, the families and the per-family runs of
M0.3's experiments.

**What was measured.**

| Run | Harness commit | What |
|---|---|---|
| `m04-matrix-covered` | e7eb40b2 | the matrix, every family, each window fully covered by the harness's front window |
| `m04-matrix-visible` | e7eb40b2 | the same, each window raised above the others, the front window in a corner |
| `m04-qt-bridge` | e7eb40b2 | Qt's AT-SPI bridge under each `org.a11y.Status` condition |
| `m04-capture-readiness` | e7eb40b2 | capture readiness after `RedirectWindow`, per family, idle |
| `m04-capture-readiness-loaded` | b84076a9 | the same with every core busy (`stress-ng --cpu 8`, load average 9.0 at the end) |
| `m04-capture-readiness-2` | b84076a9 | the idle run again, for repeatability |
| `m04-key-pace` | e7eb40b2 | key pacing and the teardown burst test, per family that takes background keys |
| `m04-element-click` | 855de4e9 | element clicks (`DoAction` 0) against coordinate clicks on a GTK 4 button and Firefox, covered and visible; the GTK 4 focused probe (review round 1) |
| `m04-partial-cover` | 855de4e9 | Firefox's clicks with the front window over parts of it (review round 1) |
| `m04-capture-readiness-loaded-2`, `-3` | 855de4e9 | the loaded readiness run twice more (review round 1) |
| `m04-capture-readiness-loaded-discarded` | e7eb40b2 | the first loaded run's surviving rows, marked discarded |

- Engines: the spike `cua-engine` from source 41c4e1bd (unchanged since), the binary built at f637fcfa (SHA-256
  `cbd185c7…`), run with M0.3's choice (`--window-calls 32 --settle-ms 40 --key-pace-ms 0`, session retention, 100 ms
  teardown) as `cua`, and with `--retention none --settle-ms 0` as `cua:none`; OpenAI's pinned `sky_linux_x64`
  26.928.40906 (`7ac3c2ae…`) and newest 26.1023.51421 (`88ce5e0a…`). Each run's `meta` row has the commit.
- Applications: gedit 46.2 (GTK 3.24.41), gnome-text-editor 46.3 (GTK 4.14.5), kate 23.08.5 (Qt 5.15.13), qtcreator
  13.0.0 (Qt 6.4.2), Firefox 159.0 (Mozilla's deb repository), Google Chrome 156.0.8078.73 (the running browser),
  Electron 44.9.0 (the `electron` dev dependency's Linux build) on cua's fixture
  (`scripts/native-matrix/fixtures/electron/`), LibreOffice Writer 24.2.7 on its gtk3 plugin (`libreoffice-gtk3`,
  installed for this run; only the X11 `gen` plugin was installed before) and on `gen`, and xterm 390.
- `results.jsonl` has every request (answer, error, time, witness, effect), every family's identity, every capture
  trial and burst; `summary.md` is rewritten from it (`node scripts/linux-engine-diff.mjs --summarize --out
  docs/evidence/2026-10-28-own-linux-engine/m0/matrix`).
- A first loaded readiness run ended without its summary (exit 13: the harness had unref'd the stress-ng child,
  fixed in b84076a9). Its 400 trial rows were deleted from `results.jsonl` before this evidence was first committed
  and cannot be recovered; its margin row and its load rows survive, copied verbatim from the session's console, in
  `results.jsonl` as run `m04-capture-readiness-loaded-discarded` with a `discarded` reason in its `meta` row: the
  slowest trial was 94.9 ms (Chrome, covered), load average 8.42 at the end. The re-run and two repeats are below.
- The element-click run's GTK 4 scene (`pages/gtk4-button.py`) needs GTK 4's introspection data (`gir1.2-gtk-4.0`),
  installed for it in review round 1.

## The matrix

Every request kept the witness clean (no change of the active window, the stacking order, the focus or the
pointer, and no notify of either property, in any of the 968 requests), and the activating stub was failed by it
in both runs. Cells are effects seen / requests; "failed" counts error answers. Covered windows:

| family | ToolkitName | X11 class (instance / class) | tree | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | background route |
|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | takes |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | **ignores** |
| Qt 5 kate | Qt 5.15.13 | kate / kate | **x11** (association fails) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | takes |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | takes |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | **ignores clicks while covered** |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | takes |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | takes |
| Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | takes |
| Writer (gen, X11 only) | no AT-SPI provider | libreoffice / libreoffice-writer | x11 | unreadable | 5/5 / 5/5 / 5/5 (pixels) | 0/2 (2 failed) / unreadable | partial: takes keys; clicks unknown |
| xterm | no AT-SPI provider | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | **ignores keys** |
| xterm, `allowSendEvents: true` | no AT-SPI provider | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | ignores clicks |

Visible windows (`m04-matrix-visible`): the same, except that Firefox takes every click (5/5 on all three engines).

Without the redirect (`cua:none`) and covered, Chrome took 4/5 clicks and 0/5 keys, the Electron fixture 0/5 and
0/5; every other family took the same as with it. Visible, every family took the same as with it. So the
redirect before the first targeted input (M0.3) is what Chromium needs, and no family needs more.

**The families that ignore background input** (for M3's `families.rs`; recorded, not written):

- **GTK 4** (`ToolkitName` `GTK`, version 4.x; here gnome-text-editor): ignores the background route's clicks and
  keys, covered and visible, with and without the redirect (0/5 for every engine in both runs:
  `m04-matrix-covered`, `m04-matrix-visible`). A probe with the window focused and on top confirmed it: an XTEST key
  arrived, the synthetic one did not. The likely cause is that GTK 4's X11 backend reads input only as XInput 2
  events, which `SendEvent` cannot produce; the class is not the key, the toolkit is.
- **xterm** (class `XTerm`, no AT-SPI provider): ignores synthetic keys (`allowSendEvents` is false by default),
  takes synthetic clicks (mouse reports reached its program 5/5) (`m04-matrix-covered`, `m04-matrix-visible`). With
  `allowSendEvents: true` it took the keys and no mouse report arrived; that second half is unexplained.
- **Firefox** (`ToolkitName` `Gecko`, class `firefox`): ignores background coordinate clicks while the window is
  fully covered, redirected or not (0/5 every engine, `m04-matrix-covered`), and takes them visible
  (`m04-matrix-visible`); keys arrive either way. The condition is the share of the window left visible, not the
  click point (`m04-partial-cover`, below).
- **Element clicks are not affected** in either family: `DoAction` 0 pressed the GTK 4 button and the covered
  Firefox's button every time (`m04-element-click`, below). Only the synthetic-event kinds belong in the list.

## Element clicks (`m04-element-click`)

The GTK 4 focused probe, the raw record of the earlier finding (rows `gtk4-probe`): with the window focused and on
top, the real input path arrives and the synthetic one does not; the AT-SPI action does.

| window | input | route | arrived |
|---|---|---|---|
| gnome-text-editor (focused, on top) | key q | XTEST | yes |
| gnome-text-editor (focused, on top) | key x | SendEvent (background route) | no |
| GTK 4 button (focused, on top) | left click | XTEST | yes |
| GTK 4 button (focused, on top) | left click | SendEvent (background route) | no |
| GTK 4 button (focused, on top) | element click | `DoAction` 0 (AT-SPI) | yes |

Then, in the background, per engine on its own window, 5 element clicks (`click {window, element_id}`, a left click,
which every engine answers with `DoAction` 0) and 5 coordinate clicks on the same button. Effects seen / clicks;
every one of the 120 requests kept the witness clean:

| window | condition | pinned element / coordinate | newest element / coordinate | cua element / coordinate |
|---|---|---|---|---|
| GTK 4 button (`pages/gtk4-button.py`, GTK 4.14.5) | covered | 5/5 / 0/5 | 5/5 / 0/5 | 5/5 / 0/5 |
| GTK 4 button | visible | 5/5 / 0/5 | 5/5 / 0/5 | 5/5 / 0/5 |
| Firefox, the matrix page | covered | 5/5 / 0/5 | 5/5 / 0/5 | 5/5 / 0/5 |
| Firefox, the matrix page | visible | 5/5 / 5/5 | 5/5 / 5/5 | 5/5 / 5/5 |

**Verdict:** element actions take effect on GTK 4 and on a covered Firefox, so they stay allowed in `shared` mode;
the families' entries list only the synthetic-event kinds (coordinate clicks, keys, and what is built from them).

## Firefox under partial cover (`m04-partial-cover`)

One Firefox window per engine at the same place (1280×781 at 0,19), each raised in turn under the front window,
which is placed over part of it; 5 coordinate clicks at the button's centre (window-relative 640, 220, so 640, 239
on the screen). The front window's real geometry is recorded (the window manager offsets its frame), and what it
covers is computed from it. Effects seen / clicks; every request kept the witness clean:

| front window | real geometry | click point | window visible | pinned | newest | cua |
|---|---|---|---:|---|---|---|
| over everything | 2,40,1276,797 | covered | 3% | 0/5 | 0/5 | 0/5 |
| over the top half | 2,40,1276,420 | covered | 46% | 0/5 | 0/5 | 0/5 |
| over the top third | 2,40,1276,251 | covered | 68% | 5/5 | 5/5 | 5/5 |
| small, over the click point | 542,220,196,108 | covered | 98% | 5/5 | 5/5 | 5/5 |
| medium, over the click point | 342,160,598,251 | covered | 85% | 5/5 | 5/5 | 5/5 |
| large, over the click point | 142,100,1000,498 | covered | 50% | 0/5 | 0/5 | 0/5 |
| over the bottom fifth | 2,640,1276,199 | visible | 80% | 5/5 | 5/5 | 5/5 |
| over the bottom 45% | 2,490,1276,342 | visible | 60% | 5/5 | 5/5 | 5/5 |
| over the bottom 52% | 2,420,1276,420 | visible | 52% | 0/5 | 0/5 | 0/5 |
| over the bottom 57% | 2,380,1276,459 | visible | 46% | 0/5 | 0/5 | 0/5 |
| over the bottom 62% | 2,340,1276,498 | visible | 41% | 0/5 | 0/5 | 0/5 |
| over the bottom 67% | 2,300,1276,537 | visible | 36% | 0/5 | 0/5 | 0/5 |
| over the left 47% | 2,40,598,797 | visible | 55% | 5/5 | 5/5 | 5/5 |
| over the left 78% | 2,40,1000,797 | covered | 24% | 0/5 | 0/5 | 0/5 |
| in a corner | 1072,680,196,147 | visible | 98% | 5/5 | 5/5 | 5/5 |

**Verdict:** the condition is the whole window, not the click point. A click whose point is covered takes effect
while most of the window is visible (68%, 85%, 98%); a click whose point is visible is ignored once about half of
the window or more is covered (52%, 46%, 41%, 36% visible). Every case with 55% or more of the window visible took
the click and every case with 52% or less ignored it, on all three engines. The point under the window's centre is
not the rule either (covered at 85% visible: taken; visible at 52%: ignored). So `while_covered` reads "while about
half of the window's area or more is covered by other windows", measured on one window size (1280×781): the exact
threshold between 52% and 55% visible is not pinned down here, and whether Firefox computes it from area or from
its own occlusion tracking is not known.

## Qt's AT-SPI bridge (`m04-qt-bridge`)

As found on the VM, `IsEnabled` is true and `ScreenReaderEnabled` false.

| application | condition | registered | frame named for the document | cua-engine tree | pinned tree |
|---|---|---|---|---|---|
| kate (Qt 5) | as found | yes | yes | x11 | x11 |
| qtcreator (Qt 6) | as found | yes | yes | at_spi | at_spi |
| kate | `IsEnabled` false | yes | yes | x11 | x11 |
| qtcreator | `IsEnabled` false | **no** | no | x11 | x11 |
| kate | `IsEnabled` false, `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` | yes | yes | x11 | x11 |
| qtcreator | `IsEnabled` false, `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` | yes | yes | at_spi | at_spi |
| kate | `IsEnabled` false, `ScreenReaderEnabled` true | yes | yes | x11 | x11 |
| qtcreator | `IsEnabled` false, `ScreenReaderEnabled` true | yes | yes | at_spi | at_spi |

The properties were put back (true, false) and read back so.

- **Qt 6 needs `IsEnabled` (or `ScreenReaderEnabled`, or the variable) when it starts**: a device-setup step for
  provisioning and `cua doctor`, not engine work. On this VM it already holds.
- **kate's tree is missing for another reason**: the association, not the bridge. kate registers under every
  condition, but its frame's `Name` is `<file> ` (with a trailing space) while its X11 title is `<file>  — Kate` and
  its `WM_NAME` `<file> ` reads back trimmed, so the title match fails in both vendor builds and in the spike
  (behaviour §4: byte-equal length, no trimming of the frame Name). Earlier, `kate -n` without `-b` also forked
  away from the launching process; the harness runs `kate -b` as its desktop entry does. The M0.2 note "kate (Qt
  6)" is corrected: Ubuntu 24.04's kate is Qt 5.
- Input to kate works regardless (5/5 clicks and keys), and the pinned build's `type_text` succeeded there (2/2)
  although its observation falls back to X11: its paste looks for the focused element in the process's frames
  without the title match.

## Capture readiness per family

The time from `RedirectWindow` until the window's capture shows its real contents, 20 trials per window and
condition (`xprobe retention`). Maximum, ms (median in parentheses):

| family | idle, covered | idle, visible | idle again, covered | idle again, visible | loaded, covered | loaded, visible |
|---|---:|---:|---:|---:|---:|---:|
| gedit | 24.9 (14.9) | 10.3 (6.4) | 24.0 (12.1) | 11.1 (6.4) | 26.9 (22.4) | 14.1 (9.8) |
| gnome-text-editor | 9.2 (6.1) | 8.7 (6.1) | 11.6 (6.4) | 11.3 (6.3) | 13.0 (9.6) | 13.1 (9.3) |
| kate | 21.1 (12.2) | 10.1 (6.1) | 19.1 (12.0) | 7.5 (6.3) | 24.9 (21.0) | 15.6 (9.7) |
| qtcreator | 26.0 (15.5) | 26.8 (16.8) | 26.3 (15.9) | 29.1 (15.7) | 32.7 (28.2) | 40.9 (28.6) |
| Firefox | **33.3** (20.2) | **32.0** (20.4) | 20.8 (19.3) | **32.1** (20.5) | **40.9** (35.5) | **53.2** (36.4) |
| Chrome | 26.8 (15.6) | 13.0 (7.9) | 26.5 (16.1) | 8.5 (7.8) | **36.4** (31.9) | 19.8 (14.1) |
| Electron | 20.8 (12.1) | 11.7 (6.6) | 19.3 (12.1) | 8.3 (6.2) | **33.2** (20.6) | 12.9 (9.3) |
| Writer (gtk3) | **36.4** (21.1) | **35.0** (19.7) | **34.5** (20.3) | 22.5 (18.3) | **46.1** (37.4) | **42.3** (35.5) |
| Writer (gen) | **38.4** (21.7) | **32.7** (19.7) | **34.0** (21.0) | **30.6** (19.8) | **56.2** (44.3) | **39.9** (34.6) |
| xterm | 10.5 (5.1) | 4.8 (2.6) | 8.4 (5.0) | 4.7 (2.6) | 12.1 (7.4) | 7.3 (3.8) |

**The 40 ms wait is not enough and must be raised.** Idle, Firefox and Writer already need more than 30 ms (38.4 ms
at worst, a 1.6 ms margin); with every core busy six families need more than 30 ms and four more than 40 ms (56.2 ms
at worst, about 16 ms short; the discarded first loaded run saw 94.9 ms). The trials are 400 per run.

The loaded run repeated twice (review round 1; load average 9.1 and 9.0 at the end): the slowest real contents
were **67.9 ms** (Firefox, visible) and **53.6 ms** (Writer gen, covered). Per family, the maxima of the two repeats
(covered / visible, ms): gedit 28.3 / 14.4, gnome-text-editor 16.3 / 15.2, kate 27.7 / 13.4, qtcreator 38.2 / 43.3,
Firefox 44.2 / 67.9, Chrome 39.7 / 21.7, Electron 29.4 / 15.0, Writer 42.5 / 38.8, Writer gen 59.4 / 42.0, xterm
11.8 / 8.7. Across the four loaded runs the worst trials are 94.9, 56.2, 67.9 and 53.6 ms: a loaded VM's tail is
wide, and no fixed wait under about 100 ms covers every trial seen.

"Two consecutive equal captures" stays rejected: in these runs it stopped before the real contents in 160 of 200
covered trials at a 10 ms poll (idle, both runs; 172 loaded), and at 20 ms in 51 and 32 idle and 140 loaded
(summary.md, the poll columns).

## Key pacing and the teardown burst test (`m04-key-pace`)

Pipelined bursts of 20 letters and of 10 `c`/`shift+b`, three runs per configuration, read back in order, on every
family that takes background keys (gedit, kate, qtcreator, Firefox, Chrome, Electron, Writer, xterm with
`allowSendEvents`).

- **No family drops or reorders keys at 0 ms pacing** with the 100 ms teardown (every burst, every family). Key
  pacing stays removed; no family needs it back.
- **The teardown:** at 0 ms pacing, every burst arrived down to a 0 ms teardown in gedit, kate, qtcreator, Firefox,
  Writer and xterm; Chrome lost keys only at 0 ms (0/3 at 0, 3/3 from 10 ms), the Electron fixture at 10 ms and
  below (1/3 at 10, 3/3 from 20). The 100 ms keeps a margin of 80 ms over the worst. M0.3's Chrome page lost keys
  up to 50 ms; this run's field (a textarea) did not.
- **The keys Chromium "loses" at an early FocusOut are delayed, not dropped.** After a 0 ms-teardown letter burst,
  the next burst's read began with the previous burst's missing letters (`opqrstcBcBcBcBcB` in Chrome,
  `ijklmnopqrstcBcBcBcBcB` in Electron): they arrived with the next synthetic FocusIn. That is why the pinned
  build's own configuration (33 ms, 100 ms) shows 2/3 on the chords right after it; it is the previous burst's
  keys. For M4's candidate that moves the FocusOut off the request path, this means a FocusOut too early reorders
  keys across requests, not just loses them.

## Text (`type_text`, the vendor builds, the facade's `{window, text}` shape)

| family | pinned | newest |
|---|---|---|
| gedit | fails: `editable Paste did not insert text` (10.2 s) | succeeds |
| gnome-text-editor | fails: `window does not expose a Paste action` | fails: `cannot identify the focused text field …; no text was sent` |
| kate, qtcreator | succeeds | text arrives once, then the false error `text changed but could not confirm the requested edit` |
| Firefox | fails: `clipboard paste timed out` (10.2 s) | succeeds |
| Chrome, Writer (gtk3) | succeeds | succeeds |
| Electron | fails: `context menu did not expose a Paste action` | succeeds |
| Writer (gen), xterm | fails: no AT-SPI provider | xterm: `could not confirm a clipboard read`; Writer (gen): unreadable |

Firefox's `Text.GetText` returns a U+FEFF after each character beyond the BMP (`🙂` reads `🙂﻿`); the matrix
strips it before looking for the typed marker.
