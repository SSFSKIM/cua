# M4 T5: identity (duplicate frames, kate's frame Name)

Development runs on the #171 VM's `:0`, not a release gate. The candidate is a musl build made as the release
workflow makes it (`cargo build --release --locked --target x86_64-unknown-linux-musl`, paths remapped, stripped):
`cua-engine 0.3.0 (45fb8f592c85)`, sha256 `c3461bf10bfda235393ee9ae17ae7b405189a8fcf03ed240179efde007b647c9`,
static-pie. Its engine sources are those of 0b953bbd (no engine change since). The harness is cbc86eba's. Every run
started with the owner's Chrome active, opened the harness holder, and ended with that window untouched; each run's
trace and whole-run record found no foreign change.

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

`scripts/linux-engine-diff.mjs --dev … --scene identity,identity-gtk3,identity-gtk4,identity-kate` with the eleven
identity operations; cua alone (`identity.mjs`), 3 blocks of a cold sample and 2 warm ones (12 samples a case, 9 for
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

## Every other family's reads equal M3's (`probes/family-reads-final.jsonl`)

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
`family-reads.{sh,mjs}`, `diff-run.sh`, `final-runs.sh`, with the stray and display checks before and after.
