# #171 M3.1: the device mode's measurements and the verdict run

On the #171 VM (`dc-linux171-1e68`, Ubuntu 24.04.4, x86-64, 8 vCPU, X11 on `:0`, Openbox), 2026-10-30. The vendor
builds are the pinned 26.928.40906 and the newest 26.1023.51421. Every run is the differential harness
(`scripts/linux-engine-diff.mjs --vendor <pinned> --newest <newest> --cua <engine> …`). Its `--experiment` and
`--run` names are below; `results.jsonl` and `summary.md` in each directory hold every row.

- `kinds/`: the measurements behind the device mode's listings (Plan of Work, M3 pre-flight: scroll and drag measured
  in every family of M0's matrix, the move with them), and the Chrome drag-and-drop item.
- `diff/`: the verdict run. It covers Acceptance 8 on the engine, and Acceptance 2–5 for the commands M3.1 changes.
- `rejudge/`: recorded runs judged again offline under Acceptance 3 as revised at M3.1 (`rejudge.mjs`).
- `drop-misses/`: the open finding on Chrome drops in the full verdict run (below).

## The engines

The background measurements (`kinds`, `drag`, `m31-dnd-visible`, `m31-dnd-covered`) ran on a copy of the engine
built at c15441ec (`cua-engine 0.2.0 (c15441ecd0ba)`). That build has the device mode for clicks and keys only, so
its scroll, move and drag requests take the background route, which is what these runs measure. Its clicks to Gecko
under any cover and to GTK 4, and its keys to xterm, are already refused. In those cells the `cua` lane's 0/10 is the
refusal, and the pinned build's column shows the behaviour.

The drag-and-drop candidate runs used `cua-engine 0.3.0 (cdf5a4cd79d5)`, and the verdict run the release build of
790d8007, `cua-engine 0.3.0 (790d8007c9d0)`. Its engine sources are unchanged through 7713bcb7 and later carry only
measurement flags and `--stats` fields. m31-dnd-load used that same build. m31-drag-options-load and m31-dnd-edge-load4
used the build stamped `d9207a48dfd1`, whose working tree already held c6347ec7's measurement flag
`--drag-dnd-wait-ms`, committed right after.

The lanes:
- `pinned` and `newest`, the vendor builds;
- `cua`;
- `xtest`, the control: the window activated, then cua-engine's windowless request through XTEST at the same root
  point.

A cell where the control takes every run and no background lane takes any is a kind the family ignores (**ignored**).

The occlusions:
- `covered`: the front window over the whole screen;
- `visible`: the window raised, the front window in its corner;
- `partial`, `partial-deep` and `partial-top`: the front window over the window's bottom 50%, its bottom 70%, or its
  top 55% (where the targets are).

## What the listings rest on (families.rs)

| family | kind and condition | runs |
|---|---|---|
| GTK 4 | Scroll, Move, Drag (with Clicks, Keys, Paste from M0) `always` | m31-kinds-covered, m31-kinds-visible, m31-move-covered (scroll, move, click 0/0/10 covered and visible); m31-drag-covered (gnome-text-editor select 0/0/10), m31-drag-visible-new (scale 0/0/10) |
| Gecko | Scroll, Move, Drag (with Clicks from M0) `unless_unobscured` | m31-kinds-covered and m31-move-covered (scroll, move 0/0/10); m31-drag-covered (select, range, scroller, canvas 0/0/10, dnd 0/0/5); m31-kinds-partial-deep (scroll 0/0/10 with the bottom 70% covered) |
| Chromium | Drag `unless_path_unobscured` | m31-drag-covered (select, scroller, dnd 0/0/10); m31-drag-partial (every kind 10/10 with the path visible); m31-drag-partial-top (fails only with the path under the cover, below) |
| Qt, any version | Scroll `always` | m31-kinds-covered and m31-kinds-visible (kate, qtcreator 0/0/10); m31-qt-covered and m31-qt-visible (plain Qt 5.15 and Qt 6.4 widgets 0/0/10: the toolkit) |

Kinds measured and not listed, taken on the background route:
- every kind in Chrome, except its covered drags, and every kind in Electron, likewise (Chrome's covered smooth
  scroll: the pinned build 1/10 here, cua 10/10, as M0.4's 30/30);
- gedit and the GTK 3 scale;
- Writer through gtk3 and through gen, scroll, move and select (m31-move-visible-writer, m31-drag-covered-2);
- xterm and gnome-terminal (VTE), scroll, move and select (m31-drag-covered-2: VTE select 10/10 covered);
- Qt's moves and clicks on plain widgets, and kate's and qtcreator's select and scroll bar drags.

Gecko under a partial cover:
- With its bottom half covered (m31-kinds-partial, m31-drag-partial), it takes scroll, move and every drag at points
  the cover leaves visible.
- With its bottom 70% covered (m31-kinds-partial-deep, m31-drag-partial-deep), it ignores the scroll and takes the
  move, select and range.
- So `unless_unobscured` refuses some requests that would land. The design session kept the window-level rule.

### Chromium's drags under a cover over the targets (m31-drag-partial-top, condition 1)

| family | kind | path (window y) against the cover (to y) | changed: pinned / cua / xtest |
|---|---|---|---|
| Chrome | select | 119, under (429) | 0/10 / 0/10 / 10/10 |
| Chrome | range | 169, under | 9/10 / 9/10 / 10/10 |
| Chrome | scroller | 247–307, under | 0/10 / 0/10 / 10/10 |
| Chrome | dnd | 242–257, under | 0/10 / 0/10 / 10/10 |
| Chrome | canvas | 457–617, visible | 10/10 / 10/10 / 10/10 |
| Electron | select | 32, under (385) | 10/10 / 10/10 / 10/10 |
| Electron | range | 82, under | 9/10 / 9/10 / 10/10 |
| Electron | scroller | 160–220, under | 0/10 / 0/10 / 10/10 |
| Electron | dnd | 155–170, under | 0/10 / 0/10 / 10/10 |
| Electron | canvas | 370–530, crossing | 10/10 / 10/10 / 10/10 |

Nothing fails with a visible path. A background failure (select, scroller, dnd) always has its whole path under the
cover. The path rule refuses the covered range drags (taken 9/10) and Electron's covered select (taken 10/10 here,
0/10 under full cover). Those are its loss, declared in `deviations.mjs`, and the evidence for two M4 candidates:
decide by the AT-SPI role at the path's start, and measure which part of the path decides.

## Qt's move and hover

- m31-qt-covered and m31-qt-visible: plain Qt 5 and Qt 6 widgets take background moves (9/9/9: run 0 moves to the
  pointer's own position) and clicks 10/10.
- m31-qt-style: an auto-raise tool button's hover highlight follows background moves under Fusion 10/10, and under
  Breeze 8/10. Breeze's two misses are the first enter and the leave that follows it. Its hover event still arrives,
  but the first highlight is not drawn; every later one is.
- m31-move-covered: both styles 8/10.
- So Breeze does not ignore background moves. kate's 0/10 hover (m31-kinds-visible) is not explained by its style,
  and the limit keeps the general wording: a hover effect that reads the real pointer position does not follow a
  background move.

## Chrome's HTML5 drag and drop (`--experiment dnd`)

m31-dnd-visible, 10 drags a lane, the windows visible, the focus on a front xterm:

| family | lane | drops | desktop changed at the answer and 1 s later |
|---|---|---:|---|
| Chrome | pinned | 9/10 | active, focus, stacking on every drop |
| Chrome | newest | 8/10 | the same |
| Chrome | cua (no candidate) | 10/10 | the same |
| Electron, Firefox | every lane | 10/10 | none |

In every browser, the source takes `XdndSelection` 15–53 ms into cua's drag, holds a pointer grab (none is left
after), maps override-redirect drag windows and cycles a keyboard grab. Under full cover (m31-dnd-covered) no drop
lands in any engine.

The candidate, Chrome visible, 10 drags a lane:
- `cua`, shared:
  - m31-dnd-candidate: 0/10 drops. All 10 answers are the declared refusal, the witness is clean, the desktop is
    unchanged, and the selection was taken 10/10.
  - m31-dnd-candidate-stats: the same; `--stats` shows `started`, no signature, and a settle of 301–304 ms.
- `cua:active` (activated first), shared:
  - Both runs: 10/10 drops, with the desktop unchanged at the answer and 1 s later.
  - The strict witness flags `stacking` 10/10. Chrome's drop asks the window manager to activate its own window,
    already active, and Openbox rewrites `_NET_CLIENT_LIST_STACKING` with the same order (a notify; no value changed).
    The witness's in-front allowance judges this case (witness.mjs, below).
- `cua:dedicated`: 10/10 drops, and the desktop changes as in the vendor builds.
- `cua:late` (`--dnd-cancel-after-release`):
  - 10/10 drops, and 10/10 answers say the drop may have happened.
  - The signature showed at the engine's first read, 0.1–0.3 ms after the late Escape: the drop's activation follows
    the release within the few milliseconds before that read. The 300 ms settle is a margin, not a measured need.
- The pinned build, in the same run: 8/10 drops, each changing the desktop.

## The verdict run (`diff/`, run m31-verdict)

`m31-verdict`, run at 91b2746e, ran the scenes `desktop`, `gedit`, `chrome`, `chrome-input`, `chrome-textarea`,
`chrome-address-bar` and `gnome-text-editor`, and every device scene, with `--ops all` and 3 blocks. Every series was
topped up to 20 samples a side. **It exits 1**: run valid, and every verdict passes except two Chrome drop cases (the
open finding below); chrome-input's covered drag is a declared refusal.

- **Acceptance 8:** every case passes except `chrome_dnd_in_front_shared` (3 of 9 drops missed) and
  `chrome_dnd_covered_dedicated` (1 of 9). The cases that pass:
  - refusals with nothing sent;
  - foreground cases with their route, the window left active and the foreground audit;
  - background cases;
  - the drag-and-drop cancel (`chrome_dnd_shared`: 0 drops, witness clean, no XTEST);
  - the honest late answer (`chrome_dnd_late_shared`);
  - `capabilities`.

  The standing controls held: the stub, the foreground checks (another client's popup included), and the in-front
  checks.
- **Acceptance 2–5** for the commands M3.1 changes pass under the revised speed rule. The run predates the labels, so
  `rejudge/m31-verdict.json` labels them offline: 53 series are faster and 7 are the same (within noise); none is within
  the bound, and none is undetermined at 20. The 7:

  | scene | op | series | cua | bar | cua − bar, 95% interval |
  |---|---|---|---:|---:|---|
  | desktop | get_screenshot | cold | 32.74 | 38.38 | [-8.185, 1.755] |
  | desktop | launch_app | cold | 3.58 | 3.96 | [-1.335, 0.365] |
  | desktop | launch_app | warm | 0.72 | 0.64 | [-0.03, 0.2] |
  | gedit | clipboard_release | cold | 2.73 | 2.76 | [-0.36, 0.195] |
  | gedit | clipboard_release | warm | 0.13 | 0.12 | [-0.01, 0.02] |
  | chrome-input | key_up | cold | 100.69 | 100.74 | [-0.1, 0.015] |
  | chrome-input | activate_window | cold | 3.83 | 4.61 | [-1.98, 0.45] |

- **The re-judge of m2-final** under the revised rule (`rejudge/m2-final.json`):
  - 19 verdicts move from pass to undetermined, on sample count alone: 1 to 15 samples a side, the medians 1.4 to 7
    times faster than the bar.
  - The desktop's cold screenshot moves from pass to parity. Its 20 samples a side have an interval past the bound,
    and it lies within the declared spread.
  - m2-final's exit 0 depended on the old rule. `rejudge/m31-verdict-first-sitting.json` shows the same for this
    milestone's first sitting.

## The open finding: Chrome drops missed in the full verdict run (`drop-misses/`)

**Three full sittings missed drops in Chrome:**
- The first sitting (`verdict-first-sitting.jsonl`): in-front 2 of 9, dedicated 1 of 9.
- `m31-verdict` (above): in-front 3 of 9, always the third sample of a block; dedicated 1 of 9.
- The third sitting, with the drag page instrumented and stopped after two blocks (`verdict-third-sitting.jsonl`):
  dedicated missed the third sample in both blocks; in-front lost none.

**The signature of every miss:**
- The page's `dragstart` fires and the press is counted with `event.detail` 1, the gap from the previous press 5.4 to
  6.3 s.
- No drop arrives, and Chrome makes none of its drop activation.
- The request answers in 290 to 310 ms, where a landed drop takes 500 to 900 ms (Chrome's drag loop holds it).
- In the dnd experiment, every miss also leaves `XdndSelection` untaken. Chrome's X11 drag session never starts.

**What does not reproduce it:**

| setting | drops |
|---|---|
| device-chrome-dnd alone, 3 blocks (`alone-dnd-scene.jsonl`) | 36/36 |
| with chrome, chrome-input and device-chrome, 3 blocks (`with-chrome-scenes.jsonl`) | 36/36 |
| every device scene and gnome-text-editor, no vendor scenes, 3 blocks (`device-only.jsonl`) | 36/36 |
| the drag experiment under stress-ng at 16 and 32 workers on 8 cores, every option including the shipping pacing | no drop missed |

The trigger lies in the full run's vendor scenes or their state (gedit, Chrome's scene windows for all three engines,
the text and clipboard operations), or in the run's length. It is not CPU load alone.

**Not multi-click.** Every press, the misses included, has `event.detail` 1, and no selection began.

**Not ignored time fields, in isolation.** `instrumented.jsonl` records the engine's `--stats` `event_time`;
`instrumented-request-watch.jsonl` and `instrumented-selection-watch.jsonl` come from `xprobe request-watch` (RECORD)
and `xprobe selection-watch`:
- The background route's event times run 0 to 3 ms behind the server's, never ahead.
- Chrome's `SetSelectionOwner(XdndSelection)` carries the triggering event's time, 0 to 3 ms behind the server's.
- Each of its `GrabPointer` replies is a success.

Whether a miss in the full run is such an ignored request is still untested: the instruments are built, and the full
run is where to use them.

**The options, measured on the same data** (`options-m31-drag-options-load.md`, every Chromium kind in Chrome and
Electron, 20 runs; `options-m31-dnd-edge-load4.md`, Chrome drops, 40 runs; `scripts/linux-engine-diff/drag-options.mjs`):
- No option misses a Chrome or Electron drop at either load: the shipping pacing (`d0`), a press dwell of 10, 20, 30 or
  40 ms, or the event-driven wait (`ev50`, `--drag-dnd-wait-ms 50`). So no dwell edge was found.
- Every option is faster than the pinned build on every kind.
- The cost against `d0`: about the dwell itself, and 44 to 49 ms on every non-drop drag for `ev50`.
- The first sitting ran at 16 workers rather than the intended 8: an interrupted run had left its stress-ng running.
  The harness now ends its load when interrupted.

**Load parity beside it.** Under 16 workers, cua's thumb drags missed where the pinned build missed none:

| family | kind | cua option | taken | pinned |
|---|---|---|---:|---:|
| Electron | scroller | `d0` | 19/20 | 20/20 |
| Electron | scroller | `pd10` | 18/20 | 20/20 |
| Electron | scroller | `pd30` | 17/20 | 20/20 |
| Chrome | range | `pd20` | 19/20 | 20/20 |

An interrupted sitting (not kept) saw Chrome's scroller at 17/20 for `d0` and 18/20 for `pd30`, against the pinned
build's 20/20. At idle (M1a.4) the thumbs land as the pinned build's.

**A likely artifact.** The dnd experiment's grab sampler (`xprobe grabs`, every 100 ms) takes the pointer for a moment
itself, so it can make Chrome's drag-start pointer grab fail. That fits its misses in every lane, the pinned build's
included: 1 to 2 of 10 idle, 3 of 20 under load. The drag experiment, which has no sampler, saw none. No sampler runs
during the verdict run's drop cases, so it does not explain the finding.
