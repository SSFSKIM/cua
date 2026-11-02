# M4 T5: identity (duplicate frames, kate's frame Name)

Development runs on the #171 VM's `:0`, not a release gate. The candidate is a musl build made as the release
workflow makes it (`cargo build --release --locked --target x86_64-unknown-linux-musl`, paths remapped, stripped):
`cua-engine 0.3.0 (7fe5f226d0f6)`, sha256 `8ab6bb1ee2bec0c80687427524784691134cae1857f527ff7901146e093c4a4e`,
static-pie, the engine of the review's fix round (7fe5f226; below). The harness is cbc86eba's, unchanged. The summaries
say "checkout not clean" because the evidence directories were being rewritten; the engine sources were the
committed ones. Every run started with the owner's Chrome active, opened the harness holder, and ended with that
window untouched; each run's trace and whole-run record found no foreign change. The stray check before and after
found no harness process and no new scratch entry (154 both times), and the client windows on `:0` were the same.
T5's first runs (on 45fb8f592c85, sha256 `c3461bf1…47c9`) gave the same verdicts; these replace them.

## The fix round (7fe5f226)

The task review found three ways a wrong association or the X11 tree could still come out of a duplicates case. Each
is fixed, and its proof is a failing-first test on the engine itself (`native/linux-engine/src/engine/identity_faults.rs`,
`tests/identity_boundary.rs`, unit tests in `identity.rs`, `atspi.rs`, `engine.rs`):

- **The association is confirmed just before each effect.** A frame found by one of cua's own routes (position, the
  active state, the caption) is carried with the request, and the whole association is run again, and must name the
  same frame, just before DoAction, the right click, the element scroll, the Copy, each focusing click, the selection
  restore and the paste chord, and after a state read. A change refuses with `window identity changed during the request
  for X11 window <id>; nothing was sent, so it is safe to retry` (a read: the retry sentence). The live tests build the
  stale state a toolkit passes through after an activation (`_NET_ACTIVE_WINDOW` naming window B while GTK still marks
  A's frame active, on a display with no window manager, the test playing its part) and let GTK catch up at one exact
  step through a hook: the read, the Copy, the action and the focusing click each refuse, with no key or button sent,
  no button pressed, no field focused and the clipboard as it was; a window moved back onto its twin just before the
  chord refuses likewise. With the confirmation disabled (and the old fallback on a failed re-verification), six of
  the eight fail (`probes/fix-round/red-live-2.log`; with them, `green-live-2.log`, and the gate's whole engine
  suite under a private Xvfb, `engine-tests-1.log`; `red-identity.log` is the unit RED for the screen-extents rule):
  the read returns A's tree under B's id, the action presses A's button, and the chord pastes. What remains is the gap
  between the last confirmation and the effect itself, and a toolkit still stale when the effect is sent: the control
  test shows B's association taking A's frame for as long as nothing corrects GTK.
- **Extents are evidence only from a provider known to report screen coordinates** (Chromium, GTK 3, Qt 5 and 6, as
  measured below). The caption rule now requires it, so a GTK 4 frame reporting (0, 0, w, h) for a displaced window no
  longer matches a window at the origin (the unit counterexample), and the tie-break uses the same rule in place of
  its GTK 4 check, so an unmeasured toolkit's duplicates answer the sentence.
- **A duplicates case never ends in the X11 tree.** `X11::fallback_tree` takes a leave that only the vendor's own
  failures make; cua's routes answer duplicates, a changed identity or an error as their own answer, never as an error
  or a leave the read could fall back on; and the source assertion pins the one public constructor to the state read's
  arm for a bus error, with negative controls. A focus change between choosing a frame and verifying it, which T5
  answered with the X11 tree, now answers the retry sentence (live test, and RED without the fix).

The confirmation after a read costs a second association on the identity routes: warm reads of apart Chrome windows
rose from 69.9 to 97.9 ms, GTK 3 apart from 23.0 to 40.4 ms and GTK 3 stacked-self from 22.5 to 42.0 ms. The vendor
answers these windows with the X11 tree, so no bar applies; the vendor's own match (one frame of the title) is not
confirmed and costs nothing more.

## What the toolkits expose (`probes/`)

Measured before the rule was built, on this task's own windows (titles carry a fresh nonce; only frames carrying it
are printed, and no Name is printed at all):

| Toolkit | Frame extents in screen coordinates | `active` state on the active window's frame |
|---|---|---|
| Chrome 1xx (Chromium) | the client's rectangle | **never**: no frame, and no node of an active window's subtree, differs from an inactive one's (`active-probe-1.log`, `walk-2.log`: every frame `enabled sensitive showing visible`, every `document web` `focused`) |
| GTK 3.24 | the window manager frame's rectangle (`_NET_FRAME_EXTENTS` 1,1,20,5 under Openbox: client 1,20 600×380, frame 0,0 602×405) | yes |
| GTK 4.14 | (0, 0) wherever the window is (window-relative) | yes |
| Qt 5.15, Qt 6.4 | the client's rectangle | yes |
| kate (Qt 5) | the client's rectangle; frame Name `<file> `, `_NET_WM_NAME` `<file>  — Kate`, `WM_NAME` `<file> ` (which the vendor's text read trims) | – |

So the active-state tie-break can tell stacked duplicates apart on GTK 3 and Qt, never on Chrome; and GTK 4 cannot be
told apart by position at all.

## The vendor builds, for the same windows (`probes/vendor-compare.log`)

Three Chrome windows and three GTK 3 fixture windows of one title and size, and two kate windows, each read by every
engine:

| Windows | pinned | newest | cua 0.3.0 | candidate |
|---|---|---|---|---|
| Chrome, apart | X11 tree | X11 tree | X11 tree | its own tree (224 nodes, its own marker) |
| Chrome, stacked, the holder active | X11 tree | X11 tree | X11 tree | the duplicates sentence |
| Chrome, stacked, window 2 active | X11 tree | X11 tree | X11 tree | the duplicates sentence (Chrome marks no frame active) |
| GTK 3, apart | X11 tree | X11 tree | X11 tree | its own tree |
| GTK 3, stacked, the holder active | X11 tree | X11 tree | X11 tree | the duplicates sentence |
| GTK 3, stacked, window 2 active | X11 tree | X11 tree | X11 tree | window 2 its own tree; 1 and 3 the sentence |
| kate, two windows | X11 tree | X11 tree | X11 tree | each its own document (890 nodes), by the caption rule |

## The identity run (`diff/`, `t5-identity-final`, exit 0)

`scripts/linux-engine-diff.mjs --dev … --scene identity,identity-gtk3,identity-gtk4,identity-kate` (run
`t5-fix-identity`) with the eleven identity operations; cua alone (`identity.mjs`), 3 blocks of a cold sample and 2 warm ones (12 samples a case, 9 for
kate), each sample on the next window of its scene. Verdict line: "run valid; development run, not a release gate:
every verdict PASS". The activating stub failed both the witness and the audit.

| Scene | Case | Answer, every sample | Told by |
|---|---|---|---|
| identity (Chrome) | apart, read; apart, read with screenshot | its own tree and marker, no other's | position |
| identity | stacked, the front window active | the duplicates sentence | – |
| identity | stacked, the read window active | the duplicates sentence (Chrome marks no frame active) | – |
| identity | stacked, another duplicate active | the duplicates sentence | – |
| identity | stacked: element click, secondary action, `type_text`, `clipboard_read` | the duplicates sentence; the `nothing-sent` audit clean | – |
| identity | Shift held apart, released stacked | success; the page showed Shift held, then up again (ups +1) | – |
| identity-gtk3 | apart | its own tree | position (the frame rectangle) |
| identity-gtk3 | stacked, the front window active; another duplicate active | the duplicates sentence | – |
| identity-gtk3 | stacked, the read window active | its own tree | active |
| identity-gtk4 | all four arrangements | the duplicates sentence | – |
| identity-kate | each of two kate windows | its own document | caption |

Every sample's witness was clean, every audit clean over requests that answered as the case expects, and every read
answered as `deviations.mjs` declares for its scene.

## The controls

- **No active-state tie-break** (`control-noactive/`, exit 1): the candidate's sources with the tie-break's branch
  disabled (`identity.rs`, `if target_active && false`), built the same way. On identity-gtk3 it passes apart,
  stacked and stacked-other, and fails "stacked, the read window active" on 12 of 12 samples (the sentence where its
  own tree is required).
- **The released 0.3.0** (`control-030/`, exit 1): every read case fails on every sample (the X11 tree), every
  refused request fails (the vendor's `ambiguous AT-SPI window identity …` sentence instead of cua's), and kate fails;
  only the release passes, as it should: no release associates.

## The applications' stderr (`diff/apps/`, `control-030/apps/`)

The harness keeps every scene application's stderr. Two scenes print diagnostics, the same in every run and every
engine, the released 0.3.0 included, and neither is from the engine:

- GTK 4 (`identity-gtk4`): `libEGL warning: DRI3 error: Could not get DRI3 device` and `Ensure your X server supports
  DRI3`. The VM's X server runs the dummy video driver, which offers no DRI3, so GTK 4 renders in software; the windows
  map and their frames are on the bus as usual.
- kate (`identity-kate`): `Hspell: can't open /usr/share/hspell/hebrew.wgz.sizes` and `HSpellDict::HSpellDict: Init
  failed`. KDE's spell-check library loads its Hebrew plugin, whose dictionary file is missing; kate runs without
  that plugin, and nothing the cases read depends on spell-checking.

## Every other family's reads equal M3's (`probes/family-reads-final.jsonl`)

Measured on T5's first candidate and not rerun: the fix round changes only cua's own routes (duplicates and the
caption), and every family below except kate associates by the vendor's own match, which is neither confirmed nor
otherwise changed; kate's caption read is rerun above.

Each family of the harness's matrix opened as the harness opens it, its window read by the candidate, then the
released 0.3.0, then the candidate again (`~/.local/share/cua-171/task37/family-reads.mjs`). 19 of 21 are equal:
gedit, gnome-text-editor, gtk4-button, gtk4-input, qt5-input, qt6-input, qt5-breeze, qt5-fusion, gtk-scale, firefox,
chrome, electron, writer, writer-gen, gtk-table, calc, xterm, xterm-allow and gnome-terminal. kate differs as built
(the candidate reads its 892-node tree by the caption rule, 0.3.0 its X11 tree). qtcreator reads its 1,261-node tree
by its title in both, the same size and source; its tree changes between two reads by the same engine, so the
comparison cannot be equal. The run's trace and record were clean.

## Scripts

The probes and the runs are `~/.local/share/cua-171/task37/` on the VM: `open-three.sh`, `open-fixture.sh`,
`open-app.sh`, `frames-state.sh`, `active-probe.sh`, `walk-states.sh`, `probe-toolkit.sh`, `vendor-compare.sh`,
`family-reads.{sh,mjs}`, `diff-run.sh`, `final-runs.sh`, with the stray and display checks before and after. The fix
round's are `~/.local/share/cua-171/task38/`: `musl-build.sh` (the candidate, and the no-active control from a copy
of its sources with `if target_active && false`), `final-runs.sh` (these three runs, through task37's `diff-run.sh`
and checks) and `engine-tests.sh` (the gate's engine command).
