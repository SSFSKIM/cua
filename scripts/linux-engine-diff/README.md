# linux-engine-diff

The differential harness of #171 (`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, Verification
system): a contract test that sends the same well-formed requests to OpenAI's two Linux engine builds and to
`cua-engine`, over the engine wire, and compares their answers. Per operation and scene it records each engine's cold
and warm timings, its output (normalized), its accessibility-bus calls, the effect read back through the tree, and the
desktop state a separate X client watches for the whole of each window-targeted request. This is M0's first cut; M1a
adds the X request audit, `--via vendor-js` and the retention cases.

Run it on an X11 desktop with AT-SPI on (the #171 VM), in the X session's environment. The scenes are windows it
opens, owns and closes: gedit on scratch files it writes, Chrome windows (in the running Chrome) on its pages under
`pages/` with unique titles, and an xterm that holds the focus so every scene window is a background window. Nothing
is logged of windows it did not open, beyond `list_windows` digests and counts.

```bash
cargo build --release --offline --manifest-path scripts/linux-engine-diff/xprobe/Cargo.toml   # the witness and probes
node scripts/linux-engine-diff.mjs --check-wire --vendor-js "$SKY"
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$BUILT" \
  --scene gedit,chrome,over-budget,big-text --ops all --out "$OUT"
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
  wherever a vendor build's is.

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

## Files

| File | What it is |
|---|---|
| `../linux-engine-diff.mjs` | the entry point |
| `cli.mjs` | the command line |
| `engine.mjs` | an engine process over the wire |
| `run.mjs` | the differential run |
| `scenes.mjs` | the harness's windows and the reader that reads effects back |
| `witness.mjs`, `xprobe/` | the witness; `xprobe` is the harness's own X client (witness, retention probe, image comparison, window close) |
| `busmon.mjs` | accessibility-bus call counts |
| `normalize.mjs`, `images.mjs`, `stats.mjs`, `report.mjs` | output and screenshot comparison, medians, verdicts and the exit status, summary.md |
| `experiments.mjs`, `readiness.mjs` | M0's capture-readiness and key-pace measurements |
| `matrix.mjs`, `matrix-judge.mjs`, `families.mjs`, `oracle.mjs`, `pixels.mjs`, `qt-bridge.mjs`, `pages/matrix.html` | M0.4's application-family matrix, its families and effect readers, and the Qt bridge check |
| `wire-check.mjs`, `stub-replay.mjs`, `record-wire.mjs`, `fixtures/wire/` | the wire fixtures |
| `stub-activating.mjs` | the negative check's stub engine |
| `events.mjs`, `xprobe/src/record.rs` | M1a.2's input events experiment and its recorder window |
| `pages/` | the Chrome scenes |
