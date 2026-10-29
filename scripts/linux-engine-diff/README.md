# linux-engine-diff

The differential harness of #171 (`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, Verification
system): a contract test that sends the same well-formed requests to OpenAI's two Linux engine builds and to
`cua-engine`, over the engine wire, and compares their answers. Per operation and scene it records each engine's cold
and warm timings, its output (normalized), its accessibility-bus calls, the effect read back through the tree, and the
desktop state a separate X client watches for the whole of each window-targeted request, and an audit of each input
operation's X requests. M0 cut it; M1a.3 gave it the full operation set, the audit, the retention cases, the
large-table scenes, `--via vendor-js` and the declared deviations.

Run it on an X11 desktop with AT-SPI on (the #171 VM), in the X session's environment. The scenes are windows it
opens, owns and closes: gedit on scratch files it writes, Chrome windows (in the running Chrome) on its pages under
`pages/` with unique titles, and an xterm that holds the focus so every scene window is a background window. Nothing
is logged of windows it did not open, beyond `list_windows` digests and counts.

```bash
cargo build --release --offline --manifest-path scripts/linux-engine-diff/xprobe/Cargo.toml   # the witness and probes
node scripts/linux-engine-diff.mjs --check-wire --vendor-js "$SKY"
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$BUILT" \
  --scene gedit,chrome,chrome-input,over-budget,big-text,gtk-table,calc,retention --ops all --out "$OUT"
```

## What a run does

- **Blocks.** A block is one engine, its process started fresh, then the cold sample (the first request, timed from
  the spawn) and the warm series (`--samples-tree 7`, `--samples-input 5`). Blocks rotate the engine order
  (`--blocks 3`), so engines interleave without sharing a process. The engine is spawned inside the first sample's
  witness span, after the harness has read the before-state, so the cold time holds only the engine's start and its
  first request.
- **Windows.** Tree reads of a scene serve every engine (one shared window). Screenshots and input go to each
  engine's own equivalent window (same page or file content, same size and place), so one engine's retained window is
  never another's.
- **Ops.** `list_windows` (scene `desktop`), `tree` (`get_window_state` without the screenshot), `tree_shot` (with
  it), `press_key` and `click`. Scenes: `gedit` and `chrome` (every op), `over-budget` (a page far over the 5,000-node
  admission limit, deep and wide) and `big-text` (one entry over 4 MiB: a single reply larger than the frontier's
  byte budget), both `tree` only.
- **Comparison.** Outputs are normalized (`normalize.mjs`): native ids kept for reads of one window and mapped by
  position across equivalent windows, screenshot paths dropped, the run's window labels replaced, and Chrome's
  tab-memory text (which changes between reads of an unchanged window) replaced. Each sample is compared with the
  pinned build's answer in the same block; the first sample's first difference is recorded.
- **Screenshots** (`images.mjs`): every sample's window screenshot is compared with the pinned build's last of the
  same block: the same size, and at most 0.1% of the pixels below the top 40 rows (where an equivalent window draws
  its own label: gedit's title, Chrome's tab strip) differing in a channel by more than 32. A screenshot outside the
  tolerance makes the sample's output unequal, so it fails the verdict.
- **The witness** (`xprobe witness`): root `PropertyNotify` for `_NET_ACTIVE_WINDOW` and
  `_NET_CLIENT_LIST_STACKING`, and the input focus and pointer every 5 ms, from before each request until 20 ms after
  its answer. Any change fails the sample, and so does any notify of either property, even when the value reads back
  unchanged (a change and its restore leave the same value). Every run with input first drives
  `stub-activating.mjs` (activate, act through XTEST, restore) and is invalid unless the witness fails it.
- **Effects.** gedit: the document's text one longer (`x`, sent while it is at its original length) or shorter
  (`BackSpace`, otherwise). Chrome: the page's key or click counter one higher. A gedit coordinate click moves only
  the caret, which the tree does not show: no effect is recorded for it, and its clicks alternate between two points
  so that gtk never reads a series as a double or triple click.
- **Bus calls**, in a separate untimed pass: `dbus-monitor` on the accessibility bus, counting the method calls of
  connections that said Hello during the pass (applications' and the registry's own calls are not counted), with the
  most in flight and the calls issued with nothing else outstanding.
- **Verdict** per candidate (`cua` and each `--variant`): its cold and warm medians at or below the faster vendor
  build's (the bar), every request answered, output equal, witness clean wherever a vendor build's is, effect verified
  on every sample, whatever the vendor builds did on it (their misses are findings, not the bar), and for a `tree`
  read over the wire the bus-call bound (below). Effects are read on the settled state: the before-state once it holds
  still, the effect once it shows and holds still (two equal reads 120 ms apart, at most 2.5 s).

`results.jsonl` gets one line per sample, image comparison, count, check and verdict; `summary.md` is rewritten from
all of it (`--summarize` rewrites it alone). Several runs append to one directory under their `--run` names.

The exit status is 0 only when the run is valid (the witness failed the stub) and every verdict passes, exploratory
variants included; their evidence is written either way. The run's `end` row keeps `valid` and `pass` apart.

## M0's additions

- `--variant <label>=<flags>`: one more engine, `cua-engine` with those flags (for example
  `--variant W16='--window-calls 16'`), measured and judged like `cua`.
- `--occlusion covered|visible`: the front window covers the whole screen (default), or sits in a corner while each
  block's window is raised above the other scene windows.
- `--experiment capture-readiness`: `xprobe retention` redirects a scene window and captures it as fast as it can,
  covered and visible, recording when the contents became real and what a poll for two consecutive equal captures
  would have seen.
- `--experiment key-pace`: bursts of pipelined `press_key` requests to gedit and Chrome at lower key pacing and
  teardown waits, read back in order.
- `--record-wire`: records the spike's wire fixtures.

## M0.4's additions: the application-family matrix

- `--experiment matrix --family <list>` (`matrix.mjs`, `families.mjs`): per family, the background route's `click`,
  `press_key` and `type_text`, each request inside a witness span, its effect read back. The pinned and newest
  vendor builds and `cua` (M0.3's choice) get the clicks and keys, the vendor builds `type_text` (the facade's shape,
  `{window, text}`), and `cua:none` (no RedirectWindow) the clicks and keys again, to show whether the family needs
  the redirect. Every engine has its own window of the family and its own process; `--occlusion covered|visible` as
  for the differential run. It records each family's `Application.ToolkitName` and version, its X11 class, and the
  tree source both cua-engine and the pinned build answer.
- **Families** (`families.mjs`): `gedit`, `gnome-text-editor`, `kate`, `qtcreator`, `firefox`, `chrome` (a window of
  the running Chrome), `electron` (cua's fixture, `scripts/native-matrix/fixtures/electron/`, run by the `electron`
  dev dependency's Linux build with `--force-renderer-accessibility`), `writer` (gtk3), `writer-gen` (X11 only),
  `xterm` and `xterm-allow` (`allowSendEvents` on). Each is started as its own process group with scratch settings
  (a scratch Firefox profile and Writer profile, gnome-text-editor's session directories, qtcreator's settings), on
  a document or page the harness writes (`pages/matrix.html` for the browsers), and ended with its group.
- **Effects** are read by the harness itself (`oracle.mjs`, `busctl` on the accessibility bus), not through an
  engine's tree, where the tree does not carry them: an editor's text and caret (`Text.GetText`, `CaretOffset`), a
  Writer document's paragraphs, a page's field and its button's label, the Electron fixture's status, what xterm's
  program received (a recorder with mouse reporting on), and, for Writer without AT-SPI, a change of the window's
  pixels (`pixels.mjs`). An editor click aims low in the text area, then at its first line, and counts when the
  caret moved there.
- `--experiment capture-readiness|key-pace --family <list>`: M0.3's experiments on each family's window, one family
  at a time; the readiness summary ends with the slowest real contents against the 40 ms wait, the key-pace summary
  with each window's verdict (`paceVerdict`). `--load` keeps every core busy (stress-ng) for the experiment.
- `--experiment qt-bridge` (`qt-bridge.mjs`): kate and qtcreator launched under each `org.a11y.Status` condition and
  with `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`, whether each registers and associates; the properties are put back.

## M1a.2's addition: the input events

- `--experiment events --vendor <bin> --newest <bin> --cua <bin> --out <dir>` (`events.mjs`): every engine gets the
  same request sequences against `xprobe record`, a harness-owned recorder window that prints every input event it
  receives, on a private X server the experiment starts itself (Xvfb, so the desktop route's XTEST input reaches
  nobody's desktop). The scenarios: mixed-case shortcuts and the chord grammar, held chords (`key_down`, `key_up`,
  shared keys, holds left at exit), clicks, moves, scrolls and drags on both routes, `drag_handle`,
  `move_relative`, `activate_window` and `launch_app` (against an entry of its own). Each request's answer and its
  events (type, sent or real, keycode or button, state, window, coordinates; not timestamps) are compared with the
  pinned build's; the run exits nonzero when cua differs anywhere. The newest build differs from the pinned one on
  pointer events (no `EnterNotify` before a background motion; a different desktop path), and is reported, not
  judged.

## M1a.3's additions: the full operation set and the proof

- **Operations** (`ops.mjs`): every command but text and clipboard. Scene `desktop`: `list_windows`, `list_apps`,
  `get_screenshot`, `launch_app` (the harness's own desktop entry, the engine's XDG directories pointed at it; its
  program appends to a file the harness counts). `gedit`, `chrome`: `tree`, `tree_shot`, `press_key`, `click`.
  `chrome-input` (`pages/input.html`, whose status lines count pointer moves, presses, drags, key downs and ups, the
  scroll position, context-menu requests and clicks): `click_element`, `right_click` (an element right click, the
  button-3 press at its visible point), `right_click_fallback` (an element below the first screen, so the right
  click falls back to its `showContextMenu` action), `secondary_action`, `move`, `drag`, `scroll`,
  `scroll_element_hidden`, `key_down`, `key_up` (the companion request that starts or ends the hold is untimed and
  witnessed), `activate_window` (the one request that changes the desktop on purpose; the harness gives the focus
  back). `over-budget`, `big-text`, `gtk-table` (a GTK 3 tree view over 10,000 rows, `pages/gtk-table.py`) and `calc`
  (LibreOffice Calc on a scratch CSV): `tree`. `retention`: `after_resize`, `after_remap`, `after_covered_change` —
  the engine retains its window, the harness resizes it (between two sizes), unmaps and maps it, or the engine's key
  changes the page while it is fully covered; then the timed screenshot (compared with the pinned build's of the same
  sample) and a key whose effect is read back. A cold sample is the engine's start and its first request, except where
  untimed preparation must come first (`key_up`, the retention cases, element ids through the vendor JavaScript),
  where it is that request alone; each row says which (`timed`).
- **The audit** (`audit.mjs`): after the blocks, every window-targeted operation (tree reads and screenshots as well
  as input) runs twice more per engine, on the window it is measured on, with the engine's X connections through
  `xtrace` on a proxy display of its own, and the trace is searched for SetInputFocus,
  ConfigureWindow with a stack mode, WarpPointer, a `_NET_ACTIVE_WINDOW` ClientMessage and XTEST FakeInput (matched
  by the opcode the server reported for XTEST, minor 2). The verdict needs cua's audit clean wherever a vendor
  build's witness or audit is. The negative check drives the stub through a proxy too, and the run is valid only when
  the witness and the audit both fail it. `--no-audit` leaves the pass out.
- **Deviations** (`deviations.mjs`): a difference from the pinned build passes only when a declared deviation names
  its operation, its field and cua's exact answer. The text and clipboard commands are checked apart, cua alone: each
  must answer `<command> is not available in this engine build`.
- **`--via vendor-js --vendor-js <@oai/sky directory>`** (`vendor-js.mjs`): every engine driven through OpenAI's own
  JavaScript client, OAI_SKY_LINUX_BIN set in the harness's process to the engine; each block reaches its engine
  through a path of its own, so the client's per-path process cache starts it fresh and the block ends it. Element
  requests carry the client's decimal ids. Outputs are compared as the wire's (the client's tree dehydrated back to
  native ids) and by the client's rendered tree; the bus-call pass runs over the wire only.
- `--experiment engine-readiness [--family <list>] [--load] [--trials 12]` (`readiness-check.mjs`): the capture rule
  cua-engine ships, judged by content: per family and condition (`unobscured`, the front window off the screen;
  `partial`; `covered`), a fresh engine per trial captures the window, and again 400 ms later; the first must match.
  The pinned build captures each condition too. A first capture the engine judged unobscured and got wrong stops the
  run's verdict (`readiness-stop`).
- `--experiment partial-cover --geometry <W>x<H>`: Firefox's cover threshold at another window size (the profile
  opens its first window at that size), swept from 40% to 70% visible from the bottom and from the left.
- `--experiment events` also has a key hold whose window is destroyed under it (`xprobe record … fragile-key`; the
  declared `interrupted_hold`), and reports each route's request times per command against the faster vendor build.

## M1a.4's changes: the M1a.3 review's findings

- **Effects on every sample** (`stats.mjs` `missedEffects`; Decision Log, M1a.4): every answered cua sample of an
  operation that reads effects must show its effect, whatever the vendor builds did on it; read once the state
  settles (`settledRead`, `pollEffect`).
- **Companions witnessed**: every request the engine under measurement sends besides the timed one (a hold's start
  or end, the retaining capture, the key that changes a covered window, element ids read through the vendor
  JavaScript) runs inside a witness span of its own. The harness's own changes to a window (the retention cases'
  resize and remap, giving the focus back) stay outside the spans.
- **The audit on every window-targeted operation** (`auditPlan`, `measuredTarget`): reads of the shared window and
  screenshots too, each on the window its samples are measured on.
- **The bus-call bound enforced** (`judgeCalls`): every `tree` verdict over the wire needs the cold and the warm count
  of cua and of a vendor build, cua's at most the vendor's plus 256. A count that did not run (`--no-counts`) or
  failed fails the verdict, and so does an excess, which fails the run.
- **The desktop-only commands through the vendor JavaScript** (`--experiment events --via vendor-js --vendor-js
  <@oai/sky directory>`): `move_relative` and `drag_handle` (start, move, end through the client's own handle) on the
  private Xvfb, well-formed requests only, each engine behind a fresh client. Answers and events are compared with
  the pinned build's as over the wire, and each step's effect is read back (the pointer through `xdotool
  getmouselocation`, the press, held motion and release through the recorder); a step either vendor build took must
  take effect in cua. Request times through the client are recorded, not judged.
- **The matrix with the audit** (`--experiment matrix`): after each family's series, every engine but `cua:none`
  sends two keys and two clicks to its own window again through an xtrace proxy (`matrix-audit` rows), the negative
  check runs through a proxy too, and the run judges Acceptance 5 per family (`backgroundAlone`: cua's witness
  clean wherever a vendor build's is, its audit clean wherever a vendor build's witness or audit is); a family that
  fails it makes the run incomplete. `--no-audit` leaves the pass out.
- **Readiness's vendor reference** (`judgeReadinessRun`): the run passes only when the pinned build's captures of
  every condition agree with the truth cua's first captures are judged against; one off or unjudged fails it.

## M1a.4's addition: the drag experiment

- `--experiment drag --vendor <bin> [--newest <bin>] --cua <bin> [--family <list>] [--ops <kinds>] [--trials 30]
  [--occlusion visible|covered] [--variant <label>=<cua flags>]...` (`drag.mjs`): per family of M0.4's matrix and per
  kind of drag it has, every lane drags the same path `--trials` times in its own window of the family, each drag in a
  witness span, its effect read back after it. The lanes: the pinned build (the reference), the newest build
  (recorded, not judged), `cua` as it ships (each drag paced by its target's family, `families.rs`), `cua:0ms` (no
  wait after a sample, the press or before the release) and the variants (for example a dwell,
  `--variant dwell='--drag-step-ms 0 --drag-press-dwell-ms 30 --drag-release-dwell-ms 30'`).
- **Kinds**: `select` (a text-selection drag: the page's selection, an editor's AT-SPI selection, a terminal's
  PRIMARY), `range` (an HTML range input), `scale` (a GTK 3 scale, `pages/gtk-scale.py`), `scroller` (a page
  element's scrollbar thumb), `scrollbar` (an editor's vertical scroll bar, gedit with classic scroll bars), `dnd`
  (HTML5 drag and drop) and `canvas` (a canvas fed by plain pointermove events, judged by how far the path's corners
  are from the stroke). The browsers show `pages/drag.html` (Electron through `pages/electron-page/`, a minimal app of
  the harness's); the editors a document whose first line is the words a selection spans.
- **Judgement**: a run took effect when its result is the pinned build's (the value its runs of the same parity end
  at; for a thumb the movement, within a quarter; one more drop; a stroke within 12 px of every corner). A lane
  passes a cell when every run position the pinned build took, it takes too, with the witness clean wherever the
  pinned build's was (Chrome's own drag and drop restacks and activates, whichever engine drags). A cell the pinned
  build never takes (GTK 4) is recorded, not judged.

## Files

| File | What it is |
|---|---|
| `../linux-engine-diff.mjs` | the entry point |
| `cli.mjs` | the command line |
| `engine.mjs` | an engine process over the wire |
| `run.mjs`, `ops.mjs` | the differential run and its operations |
| `audit.mjs` | the X request audit through `xtrace` |
| `deviations.mjs` | the declared deviations |
| `vendor-js.mjs` | `--via vendor-js`: the engines behind OpenAI's JavaScript client |
| `readiness-check.mjs` | the engine's capture readiness judged by content, per family |
| `scenes.mjs` | the harness's windows and the reader that reads effects back |
| `witness.mjs`, `xprobe/` | the witness; `xprobe` is the harness's own X client (witness, retention probe, image comparison, window close) |
| `busmon.mjs` | accessibility-bus call counts |
| `normalize.mjs`, `images.mjs`, `stats.mjs`, `report.mjs` | output and screenshot comparison, medians, verdicts and the exit status, summary.md |
| `experiments.mjs`, `readiness.mjs` | M0's capture-readiness and key-pace measurements |
| `matrix.mjs`, `matrix-judge.mjs`, `families.mjs`, `oracle.mjs`, `pixels.mjs`, `qt-bridge.mjs`, `pages/matrix.html` | M0.4's application-family matrix, its families and effect readers, and the Qt bridge check |
| `wire-check.mjs`, `stub-replay.mjs`, `record-wire.mjs`, `fixtures/wire/` | the wire fixtures |
| `stub-activating.mjs` | the negative check's stub engine |
| `events.mjs`, `xprobe/src/record.rs` | M1a.2's input events experiment and its recorder window |
| `pages/` | the Chrome scenes (`input.html` the pointer and key scene) and `gtk-table.py`, the large-table scene |
