# linux-engine-diff

The differential harness of #171 (`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, Verification
system): a contract test that sends the same well-formed requests to OpenAI's two Linux engine builds and to
`cua-engine`, over the engine wire, and compares their answers. Per operation and scene it records each engine's cold
and warm timings, its output (normalized), its accessibility-bus calls, the effect read back through the tree, and the
desktop state a separate X client watches for the whole of each window-targeted request, and an audit of each input
operation's X requests. M0 cut it; M1a.3 gave it the full operation set, the audit, the retention cases, the
large-table scenes, `--via vendor-js` and the declared deviations.

Run it on an X11 desktop with AT-SPI on (the #171 VM), in the X session's environment. The scenes are windows it
opens, owns and closes: gedit on scratch files it writes, Chrome windows (in the run's own Chrome, below) on its pages
under `pages/` with unique titles, and an xterm that holds the focus so every scene window is a background window.
Nothing is logged of windows it did not open, beyond `list_windows` digests and counts.

```bash
cargo build --release --offline --manifest-path scripts/linux-engine-diff/xprobe/Cargo.toml   # the witness and probes
node scripts/linux-engine-diff.mjs --check-wire --vendor-js "$SKY"
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$ARTIFACT" \
  --scene gedit,chrome,chrome-input,over-budget,big-text,gtk-table,calc,retention --ops all --out "$OUT"
```

`$ARTIFACT` is the release workflow's attested artifact of the checked-out commit, or the run is `--dev` (below).

## The candidate: a gate judges the bytes that ship (#267)

A verdict run is a release gate unless it is given `--dev`. A gate takes as cua's candidate only the bytes a release
ships: the release workflow's (`.github/workflows/linux-engine.yml`) attested static musl artifact of the commit this
checkout is at (Decision Log 2026-11-01, "the gate judges the bytes that ship"). A musl build made the way the workflow
makes it passes only if its bytes are the attested artifact's, since the attestation is looked up by the file's
digest. On the #171 VM they are not: cd4c9297 built there with the workflow's toolchain, `RUSTFLAGS` remaps, hermetic
Cargo home, `CUA_ENGINE_GIT_SHA` and `strip` gave `15cee88b…` (4 KB smaller), not the attested `5f4a1600…`, and was
refused as unattested (#267). So a gate takes the workflow's artifact. `--cua` names the file:

```bash
# the build-only run of the release workflow on the commit to gate (the head of the ref it is dispatched on)
gh workflow run linux-engine.yml --repo SSFSKIM/cua --ref "$BRANCH" -f commit="$(git rev-parse HEAD)" -f publish=false
DIR=$(mktemp -d)   # a fresh, empty directory for the download
gh run download "$RUN_ID" --repo SSFSKIM/cua -n "cua-engine-$VERSION-linux-x64" -D "$DIR"
# or a released engine, with the checkout at the release's commit
gh release download "linux-engine-v$VERSION" --repo SSFSKIM/cua -p "cua-engine-$VERSION-linux-x64" -D "$DIR"
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$DIR/cua-engine-$VERSION-linux-x64" \
  --scene "$SCENES" --ops all --run "$RUN" --out "$OUT"
```

`candidate.mjs` stores the file as `cua-engine`, mode 0700, in a directory the run makes first under the temporary
directory (a downloaded artifact has lost its executable bit), and checks that copy, so the bytes checked are the bytes
every cua lane starts. The directory is removed on a refusal, an error and the run's end, and by a stop (SIGINT or
SIGTERM) at any point: a handler owns the stop from before the copy is made until the run's own (the Desktop's) is in
place, and a stop during the checks kills the command they wait on with SIGKILL and waits for it to end before the
harness exits 130 or 143. A gate runs the candidate only once it is attested; in order, it refuses:

- a file that is not an ELF file, a gnu build (a glibc interpreter or glibc's ABI tag: the host's default
  `x86_64-unknown-linux-gnu`, which `m2-final` and `m3-gate-t25` judged), a dynamic one, or one for another
  architecture than the host's;
- a checkout whose commit or state cannot be read, or that is not clean (`git status --porcelain` lists anything:
  commit the evidence of an earlier run, or write it outside the checkout);
- an unattested file: `gh attestation verify <copy> --repo SSFSKIM/cua --signer-workflow
  SSFSKIM/cua/.github/workflows/linux-engine.yml --deny-self-hosted-runners --format json` fails, with gh's reason;
- a digest mismatch: no verified attestation names the copy's sha256;
- a commit mismatch: the verified attestations name another source commit than the checkout's HEAD;
- then, the candidate's first run, a `--version` that does not name the checkout's commit (`cua-engine <version>
  (<12 hex>)`).

A refusal prints `candidate refused: <reason>` and exits 2 before anything runs.

Each execution takes a `--run` name of its own (the default is the start time): a name the out directory's
`results.jsonl` already has rows of is refused (`run refused: …`, exit 2) before the candidate is stored. `summary.md`
does not judge a run name whose rows mix a gate and a dev run (or a run from before #267): its heading says so and no
verdict line is drawn, so no row's label ever stands for another execution's. An accepted gate prints `release
gate; candidate: …` first.

The run records the candidate in its `meta` row (`gate`, and `candidate`: `sha256`, `target`, `linkage`, `version`, the
checkout's `commit` and whether it was `clean`, and `attestation`: the signer workflow and, from gh's JSON, each verified
attestation's subjects, predicate, source commit and ref, the workflow run and the runner) and `gate` in its `end` row.
`summary.md` shows it under the run's heading. gh's JSON is the record because its plain output prints nothing when it
is not on a terminal.

`--dev` runs any build, from any checkout, and asks gh nothing; the copy and the record are made the same way, with
`attestation` null, and the candidate's `--version` is run unchecked. Its summary heading, its verdict line in `summary.md` and on stdout all say `development run, not a
release gate`. Iterate on dev builds; a speed claim or an adoption run takes a musl build made the workflow's way
(`--target x86_64-unknown-linux-musl`, the workflow's `RUSTFLAGS` path remaps, `CUA_ENGINE_GIT_SHA`, and its `strip`),
still a dev run, or better the workflow's own artifact.

The experiments (`--experiment`) take `--cua` as before and are not gates.

## Instances of the run's own (task 43)

The harness never hands a window to, starts on, or takes over a person's application instance or profile, on any
display. A Chrome started without `--user-data-dir` takes the person's profile: on 2026-11-02 a run on a private
display did, and when the owner's Chrome (on a frozen `:0`) missed the profile's singleton handshake, the newcomer
killed it.

- **Chrome** (`chrome.mjs`): one instance per run, on `<scratch>/chrome-profile`, a directory the run makes (mode
  0700). Every Chrome window is an open of it (`Desktop.openChrome`, `openDuplicates`): `google-chrome` with the
  run's `--user-data-dir`, `--no-first-run`, `--no-default-browser-check`, `--disable-search-engine-choice-screen`,
  `--password-store=basic` (no use of the person's keyring), `--force-renderer-accessibility` and `--new-window
  <page>`. The first open starts the browser; a later one hands its window to it through the run's profile. No flag
  changes how Chrome renders, schedules or takes input. `assertOwnChrome` refuses any Chrome command line (`google-chrome`
  and its channels, `chrome`, `chromium`, `chromium-browser`, by file name) whose profile is not one existing
  directory, not a link, inside the run's scratch directory; `Desktop.spawnApp` refuses Chrome altogether. Windows
  close as Chrome closes one (WM_DELETE_WINDOW); the run's end then stops the instance by the pids it spawned, each
  only while `/proc/<pid>/cmdline` carries the run's `--user-data-dir` and no `--type=` (SIGTERM, SIGKILL after 10 s),
  and removes the profile. The end row's `desktop.chrome` says what it stopped and what was left. A harness killed by
  SIGKILL leaves its Chrome running.
- **The families** (`families.mjs`): each starts as an instance of its own: gedit and gnome-text-editor
  `--standalone`, kate `-n`, qtcreator on its own settings path, Firefox `--no-remote --new-instance` on a scratch
  profile, LibreOffice on a scratch user installation, Electron on a scratch user data directory, gnome-terminal on a
  terminal server of the scene's own (`/usr/libexec/gnome-terminal-server --app-id <scene>`, then the client for that
  name: a plain `gnome-terminal` asks the session's running server, the person's), xterm and the Python scenes plain.
  `instances.test.mjs` fails a family added without saying how it keeps to itself.
- **A private display's session bus** (`session-bus.mjs`): on a display marked `CUA171_PRIVATE_DISPLAY`,
  `Desktop.begin` starts a `dbus-daemon` of the run's own (listening in the run's scratch directory, its own process
  group) before anything else of the run's, and every process the run starts inherits its address. It can start
  exactly one service, the accessibility bus launcher (`org.a11y.Bus`): anything else a scene application asks for
  (dconf's writer, a portal, gvfs, the keyring, a terminal server) is unknown at once, so nothing of the person's
  session is reached or started. The run begins only once the launcher's bus is the display's `AT_SPI_BUS`, where
  the engines and the oracle look first; the applications' AT-SPI bridges (libatspi, Qt) would take
  `AT_SPI_BUS_ADDRESS` first, so no application is handed one (task 46 found that Qt 6 registers no tree with it set;
  they find the run's bus through the display's property and the launcher on the run's session bus), the harness's
  own processes get the run's, and the daemon inherits none of the person's. The end stops the daemon's group and puts the harness's own `DBUS_SESSION_BUS_ADDRESS` and
  `AT_SPI_BUS_ADDRESS` back. A dbus-daemon that cannot be started fails the run's start, which ends what it began.
- **A person's display's session bus** (`session-bus.mjs` `startAppSession`, task 47; the design session's ruling
  B2): on any other display the run's applications get a session bus of the run's too, the same daemon with no
  service at all, so it can activate nothing (kate on the person's bus had D-Bus-activated the person's
  kactivitymanagerd and kglobalaccel). The applications find the person's accessibility bus through the display's
  `AT_SPI_BUS`, as the engines do; a display that names none refuses the run. The harness's own processes (its tools,
  the engines, the reader) keep the person's session bus. That bus has no `org.a11y.Status`, so Firefox gets
  `GNOME_ACCESSIBILITY=1` and Chrome and Electron `ACCESSIBILITY_ENABLED=1` (the variables each reads first); Qt 5.15
  and 6.4 turn their bridge on only through `org.a11y.Bus` on the session bus, so the run's stand-in for the launcher
  (`a11y-stub.mjs`, task 48; the design session's ruling, sminos 334) owns that one name on that bus: `GetAddress`
  answers exactly the display's root `AT_SPI_BUS`, `org.a11y.Status` reads `IsEnabled` and `ScreenReaderEnabled` true
  through `Get` and `GetAll` and refuses every `Set` and any other call with a D-Bus error, and it forwards nothing,
  owns no other name and activates nothing. It is a node process of its own with an empty environment (it reaches no
  display), started with the bus, stopped with it and ending by itself when the bus does. With it Qt scenes run there;
  a stand-in that cannot start (a root value that is not a plain address, the name taken) leaves the run going and
  every Qt scene refused, with the reason (`QT_ON_PERSONS_DISPLAY`, and why the stand-in is missing). Its tests run on
  a dbus-daemon each starts itself, in ci-kit's `harness-dbus` gate on Ubuntu, where dbus is required.
- **The run's home** (`app-env.mjs`, task 45): every application the run launches, on every display, through the one
  place that builds its environment (`Desktop.appEnvironment`, which `spawnApp` and the run's Chrome take), runs with
  `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME` under `<scratch>/home`, made by
  the run (mode 0700) and removed with its scratch: settings, recent files (`recently-used.xbel`), KConfig files,
  Firefox's `~/.mozilla`, the Chrome wrapper's `mimeapps.list` and Chrome's NSS database (`~/.pki`) are the run's.
  `DISPLAY`, `XAUTHORITY` (named where the harness's HOME puts it when unset, since Xlib would look under the new
  HOME) and `XDG_RUNTIME_DIR` are handed on unchanged; the session bus is the run's own on every display (above), and
  no application starts before the run has one; `AT_SPI_BUS_ADDRESS`, `SESSION_MANAGER` and the bus's starter
  variables are not handed on. On a display a person uses, `GSETTINGS_BACKEND=memory`: a GSettings write would
  otherwise reach the person's dconf. A family's own variables (`env`) are applied last; one that names a variable the
  run decides (`PROTECTED_VARS`: the display, its authority, the runtime directory, the buses, `SESSION_MANAGER`,
  `GSETTINGS_BACKEND`) is refused at its launch, naming the family and the variable (task 47), and none may place a
  file outside the scratch. A family a separate HOME breaks may declare `home: 'xdg'`
  (the harness's HOME, the run's XDG directories); none does. Engines are not applications: they keep the harness's
  environment. A private display's session bus (and so its accessibility bus launcher) starts with the run's home and
  its settings in memory, so the launcher reads nothing of the person's, and the run turns its accessibility switch
  on there at its start (below).
- **The accessibility switches** (`a11y-status.mjs`, task 45): `org.a11y.Status` `IsEnabled` and
  `ScreenReaderEnabled`, which Qt and Firefox read when they start. On a display a person uses they are the person's
  settings, which the harness never writes, and its applications do not see them (their bus is the run's, above): they
  see the stand-in's, both on and read-only, which a Qt scene (the families marked `qt`, and a Qt `openDuplicates`)
  reads before it starts, refusing when it does not answer; qt-bridge runs no condition there, since none can be set.
  On a private display they are the run's own launcher's: the run's start sets `IsEnabled` on the run's
  bus and reads it back (a switch that does not take fails the start), a Qt scene refuses when both are off, and
  qt-bridge sets its conditions there and puts them back.

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
  the run's own Chrome), `electron` (cua's fixture, `scripts/native-matrix/fixtures/electron/`, run by the `electron`
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
  receives, on a private X server the experiment starts itself (Xvfb through `startPrivateServer`, watched from its
  first client on, so the desktop route's XTEST input reaches nobody's desktop). The scenarios: mixed-case shortcuts and the chord grammar, held chords (`key_down`, `key_up`,
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
  the witness and the audit both fail it. `--no-audit` leaves the pass out. A proxy's credentials (task 46's finding
  3): on a private display xtrace copies none and reads no authority file (the harness's X server has none); on a
  person's display it reads the person's authority file where it is (xtrace 1.4.0 reads from its `-F` file and writes
  into its `-f` file, the reverse of its help) and writes the proxy's credentials into the proxy's own directory,
  which goes at the proxy's stop and when it fails to start.
- **Windows the harness did not open** (the design session, 2026-11-02, and T4b's audit round; `scenes.mjs`,
  `xtools.mjs`, `foreign.mjs`, xprobe `record-run`): no request of the harness's, or of an engine it drives, may change
  a window the harness did not open. It catches accidental changes; it is no proof against an adversarial engine.
  - *What changes a window* (`foreign.mjs` `changeOf`): destroying, reparenting, mapping, unmapping, configuring or
    circulating it; any SendEvent to it (a client message names its window too); warping the pointer into it; focusing
    it; killing its client; writing, deleting or rotating its properties (a deleting GetProperty too); changing its
    attributes other than our own event selection (an override-redirect change included); a Composite redirect; a
    window created inside it; and input that lands in it: XTEST and a warp, a key by the input focus, a button by the
    window under the pointer, a motion or warp by where it ends. The root is the desktop: writes to its properties and
    event selections on it stay out, and it is the neutral destination of a client message to the window manager.
    One exemption, the selection owner's answer, paired with the SelectionRequest our connection received and written
    by that connection: the property the request named, written while it is served (an INCR transfer's announcement
    and every chunk up to its zero-length end), and the SelectionNotify for the request's selection and target. A
    write no request asked for, a write after its transfer ended, or a notify for another target is foreign. The
    record reads its delivered events (SelectionRequest, DestroyNotify) on a context without errors, and its errors on
    a second one: X.Org's RECORD drops every delivered event of a client whose ranges include errors.
  - *Whose a window is*, judged in trace order: a window the harness registered, for the one life it had when the
    harness found it (`Desktop.registry`, each id with every time it was found; a finding binds the life born before it
    and after the id's previous life ended); a window our connection created, once the server accepted the creation
    (no error for its sequence number), under the root or one of ours; a window another client created inside one of
    ours; a window manager frame while it holds one of ours; and an override-redirect window on the root that the
    client of a live harness window opens during an engine's operation on that window (`Desktop.operations`, from
    `engine.mjs` `watchOperations`: Chrome's drag image during the drag, a select's list during the click). Chrome
    serves the person's windows from the same client, so a popup opened at any other time is foreign. A life ends at
    its DestroyNotify, a DestroyWindow, or its creating client's end, so a reused id is foreign again. A window reparented into one of ours
    keeps the owner it had. Parentage is the trace's own, at request time: no window is resolved on the display after
    the run.
  - *Two sources.* The run's own xtrace proxy (`Desktop.begin`), through which every `xdotool` and every acting xprobe
    command connects (`xtools.mjs`; a test keeps it so), and every audit pass's engine trace, the activating stub's
    included, are judged by `auditForeign`; there every connection is ours, and XTEST is placed only by what the trace
    shows (the focus a request set or a reply read, the pointer a reply read), the rest counted as unplaced. On a
    private display only (marked `CUA171_PRIVATE_DISPLAY`; `startRunRecord` and xprobe both refuse any other), the whole
    run is also recorded server-side through RECORD (`xprobe record-run`, `startRunRecord`), every client's requests
    of those kinds, each client attributed by its process (X-Resource and `/proc`): ours when it descends from the
    harness's process and is one of its X tools or engines. `auditRecord` judges every request of ours, sampled by an
    audit pass or not; the record places XTEST by reading the focus and the pointer right after the server handled it.
    A client it could not attribute is counted, not judged. Any foreign change, a harness trace that recorded nothing,
    or a record that did not begin and end cleanly fails the run. Both are read from their files line by line, the
    trace keeping only the requests the judge reads (`parseXtraceFile`, `auditRecordFile`), and xtrace shows lists to
    256 entries (`-m 256`): each xdotool call's connection setup and keymaps were 60 KB, and a 40-minute run's trace
    passed Node's 512 MB string limit.
  - *The record stays off a person's display, and every run is watched* (task 41). X.Org 21.1's `FlushClient`, re-entered by
    RECORD's flush callback for a recording client that fell behind, drops recorded bytes or spins for good on a
    zero-length `writev`; that froze `:0` (evidence: `docs/evidence/2026-10-28-own-linux-engine/m4/xserver-record-hang/`).
    So on a display not marked private the run has no record client, and the engines' requests are judged by the
    sampled route audits; the harness's own trace stays whole-run everywhere. `Desktop.begin` first starts the run's
    watchdog (`startRunWatchdog`, `xprobe watchdog`), on every display, before anything of the run's reads the display
    (task 44; the constructor reads nothing): a GetInputFocus round trip every 2 s from its own connection, in a process
    group of its own. A display that does not answer the first fails the start. One unanswered later for 5 s kills
    the guarded processes (the record client, guarded from its spawn), stops the run (SIGTERM), writes a `stall` line
    to the run's `watchdog.jsonl` and an alert naming the display, then SIGKILLs the run if it still lives after 20 s;
    the run's own stop never cuts that short. Readiness is the watchdog's own (a `ready` line with its pid, written
    after its spawn; one that ends before the start takes that line up fails the start), and a watchdog that ends
    before the run asked it to stops the run (SIGTERM) and fails it, as any end other than a clean one does
    (`desktopEnding`). The cleanup after that loss runs unwatched (a stated limit), so the run exits nonzero and its
    last line, `cua171 STOPPED: …`, names the loss and whether the cleanup completed (`stop.mjs` `stopBecause`). Every X server the harness starts itself is watched the same
    way from its first client on (`startPrivateServer`, the events experiment's). A test process reaches no real
    display (`hermetic.mjs`; xprobe's test build connects to none), and everything the harness starts that reaches
    an X display (its X tools, the engines, the applications, Chrome, the bus daemon) goes through one spawner
    (`xspawn.mjs`, task 47), which refuses a display the run did not create (a private server it started, or a trace
    proxy in front of one) unless the process is a declared live run (`declareLiveRun`, made by the CLI,
    `services.mjs` and `scripts/accept/linux-device-mode.mjs`, never honored in a test); the hermetic names
    (`:cua171-…`) reach no display and pass. A start the harness hands to code of another's, which starts the
    engine with the process's environment (`--via vendor-js`: OpenAI's client), is checked the same way before the
    client is loaded, made or called, on that environment with the lane's variables over it (`VendorJsEngine`, task
    48); a source test fails any other write into `process.env` that is not listed as handing on no display, or behind
    the check. The harness's suite runs as `npm run
    test:linux-engine-diff`, through a wrapper (`test/linux-engine-diff/suite-check.mjs`, task 45; a wrapper since task
    47, so it runs on the whole declared Node range, and ci-kit's `test` gate runs it) that gives the suite a
    temporary directory of its own and fails it, naming each, on any process it started that still names a run's
    scratch directory or profile when it ends, and on any scratch directory it left; each is then ended or removed.
  - *No window of the person's can be taken for the run's*: every title carries the run's label and a random nonce of
    the run's own (`Desktop.label`), and a window already on the display when the run began is never found or adopted
    (`Desktop.preexisting`), whatever its title.
  - *The harness acts only on a window that is still the run's*: cleanup closes a Chrome window it found only while
    that id is alive and titled with the scene's label (`Desktop.stillOurs`; the person may have closed it and Chrome
    given its id to a window of theirs), and never registers it again; a window not closed so is recorded in the end
    row (`skipped`). Every pointer move of the harness's (`parkPointer`, the dnd experiment's `--park-pointer`, the
    GTK 4 probe) reads the top window at its point first (xprobe `top-at`, `Desktop.pointerSafeAt`) and goes only onto
    the root or a live window of the run's.
  - *Observers that act are fenced* (`xtools.mjs`): xprobe `retention` redirects only a live window of the run's, and
    xprobe `grabs`, which takes the root's pointer and keyboard, runs only on a private display marked
    `CUA171_PRIVATE_DISPLAY` (xprobe refuses any other; `startPrivateServer` marks the harness's own Xvfb). The post-request check that no
    grab is left reads the server's record of every client's grabs (`clip.mjs` `watchGrabs`, `grabsIn`) instead of
    grabbing; so does the dnd experiment, whose momentary foreign grab (`--grab-at-ms`) is gone.
  - The window found active at the start is recorded and never activated again. A run that starts with a foreign
    window active first opens and activates a holder (an xterm in the front window's corner), closed after every other
    window of the run's; what the window manager activates then is its own doing. The `meta` row records the start's
    active window, and the `end` row (`desktop`) both active windows, each marked `foreign` or `harness`, the holder,
    the trace's audit and the record's. The negative checks raise and activate only the top two of the harness's own
    windows.
- **Deviations** (`deviations.mjs`): a difference from the pinned build passes only when a declared deviation names
  its operation, its field and cua's exact answer. (In M1a the text and clipboard commands were checked apart, cua
  alone, each refused with `<command> is not available in this engine build`; M2 replaced that with its text
  operations, below.)
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
- **Speed on unrounded medians** (`stats.mjs`): the summary shows tenths of a millisecond, the verdict compares the
  medians themselves, so a sub-millisecond operation's loss of a few hundredths is a loss.
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
  getmouselocation`, the press, held motion and release through the recorder); every step with an effect read must
  take effect in cua, whatever the vendor builds did on it (a scenario no vendor build took effect on fails too: its
  reader proves nothing). Request times through the client are recorded, not judged.
- **The matrix with the audit** (`--experiment matrix`): after each family's series, every engine but `cua:none`
  sends two keys and two clicks to its own window again through an xtrace proxy (`matrix-audit` rows), the negative
  check runs through a proxy too, and the run judges Acceptance 5 per family (`backgroundAlone`: cua's witness
  clean wherever a vendor build's is, its audit clean wherever a vendor build's witness or audit is); a family that
  fails it makes the run incomplete. `--no-audit` leaves the pass out.
- **Readiness's vendor reference** (`judgeReadinessRun`): the run passes only when the pinned build's captures of
  every condition agree with the truth cua's first captures are judged against; one off or unjudged fails it.
- **The M1a branch review's rules:**
  - An audit counts only when its audited requests answered as the timed pass's did (`auditVerdict`; the matrix's
    audit pass requires its keys and clicks answered).
  - The events experiment's wire request times are part of its outcome (`eventsPass`); through the vendor client they
    are recorded only.
  - The desktop route's are judged from interleaved fresh engines (`desktopBlocks`, 20 rounds since M3.1's fix
    round, `--first-rounds`):
    - a timed request counts only when it answers as the pinned build's same request (`blockAnswerMismatches`; a
      mismatch fails the run);
    - a group is judged only with 20 samples an engine, and every Acceptance 3 desktop group
      (`MANDATORY_SPEED_GROUPS`) must be, or the run is incomplete;
    - a median above the bar whose bootstrap 95% interval of cua minus the faster build includes 0 and reaches at most
      max(5% of the bar, 1 ms) (`stats.mjs` `noiseBound`) is "same (within noise)", in any series;
    - a loss `deviations.mjs` `SPEED_GAPS` declares is a "declared gap", never a pass;
    - an interval that includes 0 but reaches past the bound is undetermined: its commands' sequences get up to two
      more sets of rounds (`TOP_UPS`, `events-top-up` rows), and a group still that wide fails. Since M3.1's fix round
      the sets follow Acceptance 3's schedule (`eventStage`): a group short of 20 samples an engine is brought to 20,
      one undetermined at 20 to 40, where its outcome is final, and a group decided at a stage keeps that verdict
      whatever the later rounds of shared sequences add.
  - `--via vendor-js` refuses `--variant`: the vendor client starts the engine without the variant's flags.
  - The desktop entries the harness writes take their paths as quoted `Exec` arguments (`desktop-entry.mjs`), never as
    shell source.

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
  build never takes (GTK 4) is recorded, not judged. The run is complete only when every requested family and kind
  produced its cell and nothing threw (`dragCompleteness`); a family's error leaves its remaining kinds unmeasured
  and the run incomplete, while a lane that misses is a measured outcome.

## M2's additions: text, clipboard and the paste safety cases

- **Text operations** (`text.mjs`, kind `text`), each on every engine's own window, apart from the scene's other
  windows, so a document they grow never changes another operation's scene:
  - `gedit`: `type_text` (Acceptance 6's `cua171 안녕 é 🙂\nline2`, the acute a combining mark, at the caret),
    `type_text_selection` (a preselected range replaced), `type_text_dedicated` (cua alone with `--desktop dedicated`:
    gedit takes the background route, so its witness must stay clean), `type_characters` (`Hi 42!`, the newest build
    the reference), `clipboard_read` (the application's Copy of the selected first word; its effect is the clipboard),
    `clipboard_write` (a handle read untimed, then the harness's own owner takes CLIPBOARD, then the write: cua leaves
    that owner's text, the vendor builds the snapshot, a declared deviation), `clipboard_release`;
  - `chrome-textarea` (`pages/text.html`): `type_text`;
  - `chrome-address-bar` (a Chrome window's address bar, focused with Ctrl+L and its text selected): `type_text` of a
    single line, which must read back exactly;
  - `gnome-text-editor`: `type_text`, cua with `--desktop dedicated` (GTK 4 ignores the background route).

  A sample's prior clipboard is the harness's own text (`clip.mjs`, `xprobe clip-own`), and the field is read through
  the harness's own bus reads (`oracle.mjs`): the effect is the paste landing exactly once where the caret or the
  selection was; `clipboard_kept` records whether CLIPBOARD (read with a real timestamp, `xprobe clip-read`) holds what
  it held. The bar is built from the vendor samples that succeeded (no vendor success, no bar); every cua request must
  succeed, take effect and keep the clipboard, whatever the vendor builds did. A text operation's reference answer is
  that of a build whose route applied it in the block; where neither does (gnome-text-editor; gedit's
  `clipboard_write`), cua's success is a declared deviation.
- **The witness by route**: the route each cua text request must take is known beforehand (`text.mjs`
  `expectedRoute`: the foreground route for gnome-text-editor in dedicated mode, the background route everywhere else,
  none for `clipboard_read` and `clipboard_release`), and cua reports the route it took on its `--stats` line. A request
  whose reported route differs from the expected one, a missing record included, fails its witness (`witness.mjs`
  `judgeRouteSpan`). Where both are `foreground`, the request may activate its target and move the pointer and nothing
  else (`judgeForegroundSpan`: the active window and the focus end in the target; the stacking is judged on the
  restack events, `judgeRestacks`, and only the target's top-level, its window manager frame from `xprobe toplevel`,
  may move, and only to the top; then a quiet 300 ms span and no grab left, read from the server's record of grabs since T4b); every other request must
  leave the witness unchanged. The restack events come from `SubstructureNotify` on the root: the witness records the
  root's children when a span begins and every `ConfigureNotify`, `CirculateNotify`, map, unmap, creation, destruction
  and reparenting of one in order (`xprobe/src/restack.rs`). They are never coalesced, unlike
  `_NET_CLIENT_LIST_STACKING`, which is read after its notify and so shows only the latest of quick changes: that
  property stays a second record (each change read back with its orders must be the target's raise), and its
  same-value rewrites pass only because no forbidden restack accompanies them. The activation and the focus are judged
  the same way (`judgeFocus`): with `FocusChange` on the root and every root child, the witness records every
  `FocusIn`, `FocusOut` and `_NET_ACTIVE_WINDOW` activation request in order (`xprobe/src/focus.rs`), and only the
  target may be activated or take the focus (its frame or its own window), through no focus on the way at most; an
  active-window notify, which carries no value, passes only beside such clean evidence. Where the foreground route is
  expected, the X request audit is the foreground audit (`audit.mjs` `auditForeground`): of the requests the background
  route forbids, only the `_NET_ACTIVE_WINDOW` ClientMessage, the stacking `ConfigureWindow` and `SetInputFocus`
  naming the target, and XTEST FakeInput are allowed. A run with a foreground request also runs the foreground checks
  (`foregroundNegativeCheck`), or the run is invalid: another window raised and the top one raised back, 50 ms apart
  and under one server grab (`xprobe restack-grabbed`), and the focus and the active window switched to another
  window and back under one server grab (`xprobe focus-grabbed`), which the allowance must fail; the target raised,
  and the target activated through the window manager, which it must pass.
- **A text operation proves its effect**: every text operation's definition reads an independent effect (the field
  through the harness's own AT-SPI reads, or the clipboard), and a sample whose effect could not be read is a miss
  (`effect_unread`), whatever the operation's other samples could read; `clipboard_release`, which changes only the
  engine's own handle map, declares why it has none (`effectFree`).
- **The desktop route's groups are topped up**: a group of a `desktop` scene operation with fewer than 20 samples an
  engine in a series (the cold series has one a block) gets fresh-engine rounds (`top-up` rows, blocks `topup-<n>`)
  until each engine has 20, and is then judged with the interval and its bound; the judge never passes or fails a
  desktop group on fewer (`judgeOperation` `minSamples`). Superseded at M3.1: every series is topped up (M3.1's
  additions, below).
- **The display-wide unconfirmed-paste window** (`CUA_CLIPBOARD_QUARANTINE`): after an unconfirmed paste every cua
  engine on the display refuses text requests for up to 10 s. The harness waits it out before every text sample, every
  safety case and each late-conversion trial (`clip.mjs` `waitQuarantineOver`, `xprobe quarantine`), and never
  removes it, since the unconfirmed paste's target may still convert until it ends.
- **A failed preparation** (`prepare.mjs`; the gate's rule, Decision Log 2026-11-01): every failed attempt records
  the step it failed at (`prepare_attempts`): the harness oracle's (a selection the window refused) or the engine's
  request. A sample whose engine could not make the handle it needs (`prepare_error`, `prepare_step` engine: a Copy
  failed, so a handle no engine issued is sent) times another request than the operation's, so no engine's such sample
  is in the medians; a cua sample of that kind fails its verdict, a vendor build's is recorded, and it is never
  resampled. A sample whose preparation failed only at the oracle sends nothing and is resampled once in its own
  condition (a cold one on a fresh engine); a second oracle failure leaves it invalid (`prepare-failure` rows, outcome
  `resampled` or `invalid`). More than 2 resampled or invalid samples in a case, or 1% of its samples if larger, or more
  than 1% of the run's samples, fails the run; the summary lists the counts.
- **The text scene kept as each sample needs it** (task 24, after m3-gate-verdict).
  - **The first word.** Each lane's gedit text window lives for the whole run. The pinned build's failed paste over a
    selection deletes the range and inserts nothing, which emptied its window after 9 samples. So before each sample
    whose preparation selects the first word, the oracle checks that word and puts it back through `EditableText`
    when it is missing (`text.mjs` `sceneTextBefore`).
    - The check is the same for every lane.
    - The restore is recorded on the sample (`text_restored`).
    - The verdict line and the summary count the restores per lane, every lane named.
    - A candidate's window is never put back. A restore it would need means its own sample left the text wrong, so
      the run stops as a failure (`text-lost`).
  - **The caret.** `selectFirstWord` puts the caret at the end before it selects, since GTK 3 refuses `AddSelection`
    while a selection exists.
  - **The backstop.** A refusal the restore cannot prevent restores the lane's scene before the one resample:
    - a fresh window, opened only once the old one is gone;
    - the cover given back;
    - for a warm sample, the operation itself run once on the fresh window, untimed, with its own preparation and
      witness, as the series' samples ran it (`run.mjs` `restoreLaneScene`, `warmUpRecord`); a cold sample gets a fresh
      engine and a fresh window only;
    - the restore and its warm-up recorded on the failure's row and on the counted resample (`scene_restore`).
    A candidate's warm-up that fails, or whose witness saw a change, fails the run with its error text
    (`prepare.mjs` `judgeWarmUps`); a vendor's is recorded. A warm-up whose own preparation is refused leaves the
    sample invalid. The caps count the resample as before.
  - Every restore counts in its lane's total: the samples', the failed preparations', the warm-ups', the audit's
    (`text_restores` on its row) and the bus pass's. None of them adds a timed sample.
- **A stopped run** (`stop.mjs`): SIGINT or SIGTERM stops the witness, closes every window the harness opened, and
  stops the run's Chrome and its session bus before the process exits 130 or 143. A stop during the run's start
  waits for it: the start ends what it acquired (its trace, record, session bus and watchdog) and starts nothing more.
- **Every cleanup a case owes runs when it ends** (`Cases.guarded`): the engines, clipboard owners and target windows
  a case starts, whether it ends by its verdict or by an exception half-way through its setup; a sample's clipboard
  owner ends with the sample the same way (`runSample`). Each disposal establishes that what it ends is gone (an
  engine or owner that has exited, a target window's process group answering ESRCH); a disposal that fails fails the
  case, after every other disposal has run: a case that passed throws `cleanup failed: …`, and a case that threw keeps
  its own error with the failures attached.
- **The bus trace**: a pass per text operation and engine, a fresh process under `dbus-monitor`, counts
  `PasteText`, `InsertText` and `SetTextContents`; cua's must be 0 (vendor counts recorded). The safety cases' whole
  phase is watched the same way.
- **Paste safety cases** (`safety.mjs`, kind `case`, cua alone, after the blocks, on windows of their own):
  `chrome-textarea`: `focus_change` (the prior owner holds the engine's snapshot `TARGETS` while the harness moves the
  focus to the page's other field through AT-SPI: `requested field or selection changed before dispatch; nothing was
  sent`, neither field changed), `focus_change_takeover` (the same, and the prior owner takes CLIPBOARD back 0, 20 or
  50 ms after the engine takes it: nothing sent, the new owner's text intact), `silent_owner` (the prior owner never
  answers the snapshot's `TARGETS`: `clipboard capture timed out: …; nothing was sent` within the bound, and the next
  paste goes in, so both locks were released), `concurrent` (two engines paste distinct
  markers at once into their own windows), `contention` (two engines, 20 pastes each with random gaps of 0–30 ms),
  `late_page` (the page inserts the paste's text 3 s after its paste event: unconfirmed, then the text once),
  `ignored_page` (unconfirmed, the field unchanged, the next request answered at once); `paste-target`
  (`pages/paste-target.py`, a GTK 3 window whose conversions the harness controls, made on its own X connection so the
  engine attributes them to the target): `stalled_incr` (100 KB, the INCR transfer never acknowledged), `late_convert`
  (a conversion 1.5 s after the chord, served the paste itself, never the prior clipboard; 3 s after it, with the
  chord's timestamp and with CurrentTime, refused), `unreadable` (no Text interface: unconfirmed, the text received
  once); `gedit`: `caret_placed` (a caret placed, the focus moved to a toolbar button, then `type_text` naming the
  field: clicked, the caret put back, the text at the caret); `gnome-text-editor`: `restore_refused` (dedicated mode,
  the focus moved to the search bar with Ctrl+F through the desktop route: clicked through XTEST, GTK 4 refuses the
  caret's restore, the text goes in once, the foreground route's witness allowance).
- **The matrix** (`--experiment matrix`): `gnome-terminal` joins (VTE, paste chord Ctrl+Shift+V; its recorder shows what
  it receives, so a paste is confirmed in the terminal's text), and cua's `type_text` runs beside the vendor builds'.
- `--via vendor-js` refuses the text operations and the cases: their facade-level proof is the facade suites.
- **Same within noise** (Acceptance 3's rule, now in every verdict over the wire): a candidate median above the bar
  whose bootstrap 95% interval of the candidate's median minus the bar build's includes 0 and reaches at most max(5% of
  the bar, 1 ms) passes as "same within noise", listed in the verdict with its interval, when both sides have at least
  20 samples in the series; a wider interval is undetermined, which fails the verdict (the differential run adds no
  samples); with fewer samples, the medians alone decide. Superseded at M3.1 (below): no series is judged on its
  medians.
- **Parity** (Acceptance 3's parity rule): `deviations.mjs` `PARITY` lists an operation, scene and series whose work
  is identical by construction in every engine (the cold desktop screenshot, Decision Log, M1a.4). Above the bar, it is
  **parity** when cua's median lies within the bar build's own spread of samples of that series in the run, which is
  neither a pass nor a failure: listed apart in the verdict and on the run's last line, it does not fail the run;
  outside that spread it fails. Unlisted operations are unaffected. `clipboard_release` (a map removal in every engine, about 0.1 ms the harness's own
  scheduling dominates) takes 10 warm samples a block so that its warm series has them.

## M3.1's additions: the device mode

- **The kinds experiment** (`--experiment kinds [--family <list>] [--ops scroll,move,click] [--occlusion …]
  [--lanes …]`, `kinds.mjs`): per family of M0.4's matrix, plus the harness's GTK 4 scene (`pages/gtk4-input.py`) and
  Qt scenes (`pages/qt-input.py`: plain Qt 5 or Qt 6 widgets counting what reaches the toolkit, and under a named
  style an auto-raise tool button for the hover run, families `qt5-breeze` and `qt5-fusion`), each lane scrolls,
  moves or clicks its own window `--trials` times and reads the effect back (a page's or scene's counts, a terminal's
  mouse reports, a scroll bar's value, or for a hover the pixels of a capture). The lanes: the vendor builds, `cua`,
  and the control `xtest` (the window activated, then a windowless request at root coordinates through XTEST). A cell
  the control takes and no background lane takes is a kind the family ignores (`ignored`), the evidence for a listing
  in `families.rs`.
- **Load** (`--load`, `--load-factor <workers per core>`): stress-ng's CPU workers for the experiment's length, ended
  with it, an interrupted experiment included.
- **Occlusions** (`--occlusion`, `Desktop.arrange`): `covered`, `visible`, `partial` (the front window over the scene
  window's bottom half), `partial-deep` (its bottom 70%) and `partial-top` (its top 55%, where the targets are). The
  drag experiment takes the same lanes and occlusions.
- **The drag-and-drop experiment** (`--experiment dnd [--family chrome,electron,firefox] [--lanes …]`, `dnd.mjs`):
  per lane, drags along `pages/drag.html`'s drag-and-drop path, each recorded with the `XdndSelection` owners, the
  grabs during and after, the desktop (active window, focus, stacking) before, at the answer and 1 s later, the
  witness, the drop, and cua's answer (the declared refusal, or that the drop may have happened). `cua:active` is cua
  with the window activated before each drag; `--variant` adds the dedicated and forced-late lanes. `--no-grabs` leaves
  out the 100 ms grab sampler, whose own grabs can fail Chrome's drag-start grab. `--dnd-cold` (task 20) makes every
  drag the first request of a fresh engine, its window in front after the device case's 1200 ms settle, the lanes
  taking turns round by round; `--prelude dedicated` runs the case a block runs before it (cua's dedicated long drop
  through the foreground route), `--cover-ms N` covers the window that long first, and `--ballast gate` opens the
  Chrome windows a full verdict run has open. Each row carries the page's counters and its pointer log. Measurement
  only, for the mechanism: `--stray nudge|popup:<ms>` puts a pointer event that is not the drag's into it (the real
  pointer nudged a pixel and back through XTEST, or another client's window mapped under the real pointer for 5 ms),
  `--park-pointer X,Y` parks the real pointer first. (`--grab-at-ms`, another client's momentary grab, is gone: it took
  the person's pointer and keyboard on `:0`.)
- **The drop-miss instruments** (task 18, run beside any run; none is started by the harness): `xprobe request-watch`
  records through RECORD every client's `SetSelectionOwner`, core and XInput 2 pointer and keyboard grabs with their
  replies, server grabs, XDND client messages sent over the wire (Chrome short-circuits its own), and synthetic
  (`SendEvent`) or XTEST key, button and focus events, motions counted (`XPROBE_EVERY_MOTION=1` lists each); `xprobe
  cursor-watch` the displayed cursor's changes (a drag source's grab cursor shows its negotiated operation);
  `xprobe crossing-watch` the crossing events clients receive and the real pointer. The two RECORD watchers exit
  nonzero, naming the cause, when their record is cut short (the collector failed or its data ended before stdin
  closed), so a partial record never reads as complete. The drag page's `dnd` line also
  counts dragends with the last drop effect, the press-to-dragstart and dragstart-to-dragend times, the page's mouseups
  and the last press's wall clock (`at`), which lines a drag up with those records. Its `moves` line (task 20) logs
  every pointermove between a source's press and its release (event time and handler time after the press's, offset,
  buttons, coalesced count) and the dragstart, pointercancel, pointerup and dragend times, so a record shows whether the
  renderer saw a move past Blink's 4 px drag threshold before the mouseup; `XPROBE_EVERY_MOTION=1` lists each
  synthetic motion with its window and button state.
- **Acceptance 8's cases** (`device.mjs`, the scenes `device-gtk4`, `device-firefox`, `device-xterm`, `device-qt`,
  `device-chrome`, `device-chrome-dnd`, and `gnome-text-editor`'s and `desktop`'s): cua alone, each judged by its
  expectation (refusal with the Device mode sentence and nothing sent; the foreground route in dedicated mode; the
  background route; a drag and drop cancelled before the drop; an honest answer when the cancel comes too late), with
  the witness and the X request audit of the kind the expectation needs. The audit counts only over audited requests
  that answered as the case expects (`audit.answered`: a refusal or a cancel its sentence, a late case an honest one,
  the others success), and at least one. `capabilities` is checked against the engine's version and build. The cancel
  and the late case run again with the drop's signature already held (`obscuredInFront`: Chrome activated, and an
  override-redirect window of the harness's own, `xprobe overlay`, over its bottom-right corner, away from the path,
  so the drag is watched); the engine must record the bits held (`dnd.held_at_start`). The `stray` cases (task 20)
  expect the answer that the drag may not have started, nothing dropped, and the background audit clean: Chrome in
  front with the real pointer parked outside its window, on the front window (its capture grab crosses in), and with
  the pointer parked inside while xdotool nudges it a pixel and back every 2 ms all through a text selection (a drag
  that never takes a drag and drop is in its press window until its release; the case's `alongside` input starts just
  before the request, and the witness allows the pointer field alone, `pointerMoves`). In dedicated mode the pointer
  parked outside takes the foreground route and the short drop lands. A parked pointer goes back where the case found
  it in the sample's cleanup.
- **Minimized windows** (M4's T4, `minimized.mjs`, the scenes `minimized` (gedit), `minimized-xterm` and
  `minimized-recorder`): cua alone, each sample's window minimized with `xprobe minimize` (the harness's front window
  takes the focus first, so the window manager's focus fallback lands on a harness window; the active window afterwards
  is recorded, and one the harness did not open stops the run) and restored with `xprobe restore` after it, both
  outside the spans. Every window-targeted input answers `Window <id> is minimized; activate it first` with nothing
  sent (the `nothing-sent` audit), in both modes and before the device refusal. `list_windows` lists the window with
  `minimized: true` and no other. A state read answers for the requested window (its id, the field on it, a tree
  showing the fixture's marker, gedit's file name) with no screenshot. The same window restored loses the field and
  gives one screenshot that is a real image of it: the file exists and decodes at the window's size, and matches the
  window's own contents (`xprobe snap`, then `xprobe imgdiff` with no rows masked). A key held before the minimize is
  released after it, the hold proven first and then the release, on each route's own evidence:
  - on the background route, on `minimized-recorder`, a window `xprobe record … managed` holds (the window manager
    manages it, and its client is the harness, so a synthetic event reaches the harness): it received the hold's
    synthetic press, then exactly the release of the held key, with nothing beside it but the route's FocusOut;
  - on xterm's foreground route in dedicated mode, the server's keymap (`xprobe keys-down`): the key down after the
    hold and up after the release.

  Either way the `held-release` audit splits the trace at the case's marks (`ctx.traceMark`, the proxy's log offsets
  once the log is quiet) and requires the hold's press on its route, then release events for exactly the held set,
  with no press, no motion, no activation and no focus request. `activate_window` restores the window and answers
  success; a withdrawn window answers the first focus error at the engine's 1 s bound. Elsewhere in the run, a
  listing's minimized windows are set aside where the deviation declares them (`setAsideMinimized`).
- **Identity** (M4's T5, `identity.mjs`, the scenes `identity` (Chrome), `identity-gtk3`, `identity-gtk4` and
  `identity-kate`): cua alone, on windows of one process with one title, unique to the run, and one size, each
  showing its own marker (`Desktop.openDuplicates`: Chrome windows on `pages/identity.html`, opened one at a time and
  each found as the one new window of the title; or one process of `pages/identity-windows.py`, which reports each
  window's marker and X11 id once it is mapped). Each sample reads one window in turn; the harness arranges the
  windows before the request, outside the spans, and waits until their origins read back (and, on GTK, until one
  frame says `active`). Placed apart, each read answers its own tree, its marker and no other's (GTK 4, whose
  extents are window-relative, the sentence); stacked with the front window active, each answers `Window <id>
  matches several accessibility windows; close or retitle the duplicates`; stacked with the read window active, GTK 3
  answers its own tree (the active-state tie-break) and Chrome, which marks no frame active, the sentence; stacked
  with another duplicate active, the sentence. On the Chrome scene, stacked, an element click, a secondary action,
  `type_text` and `clipboard_read` answer the sentence with nothing sent (the `nothing-sent` audit), and Shift held
  while the windows are apart is released once they are stacked, the page then showing it up. kate's two windows each
  read their own document, by the caption rule. Every read's answer must be one `deviations.mjs` declares for the
  scene.
- **The witness's allowances** (`witness.mjs`):
  - **Foreground.** Override-redirect windows of the target's own X client (its resource-id base) may map, restack
    and unmap; one may stay mapped at the end only where the input opens it, as a right click's menu. Every other
    client's window still fails, and `foregroundNegativeCheck` maps another client's popup (`xprobe popup`), which
    must fail.
  - **In front** (`judgeInFrontSpan`), only for the case that declares it and a request whose `--stats` `dnd`
    recorded `in_front`. It is judged on the event records: activations name the target, restacks move only the
    target client's own windows with its frame on top, the frame's order among every other client's mapped windows
    (override-redirect ones included) kept, and focus events stay with the target. `inFrontNegativeCheck` runs beside
    the stub check in every run: the target's own activation passes, and another window's activation, a coalesced
    restack, or another client's override-redirect window raised just above the target's frame and put back under one
    server grab (`xprobe overlay … below <frame>`, `cross`) fails.
- **The speed rule, revised** (Acceptance 3 as the design session revised it at M3.1, after #235's review found the
  shortcut): `judgeOperation` and `eventSpeeds` judge a series only when cua and the bar build each have 20 samples,
  and only through the interval guard, whichever way the medians point. The interval passes when its upper end is at
  most max(5% of the bar, 1 ms), is a loss when it lies above 0, and is otherwise undetermined; fewer samples are
  undetermined too. A passing series is labelled by its interval (`speedLabel`, spec 948c30d4): **faster** (wholly
  below 0), **same (within noise)** (including 0) or **within the bound** (wholly above 0: a small measured loss, never
  called noise). The summary lists every "within the bound" pass in one table.
  - The differential run tops every undetermined series up to 20 samples a side, then 40 (`top-up` rows, blocks
    `topup-<level>-<pass>-<n>`): fresh engines for a cold series, and for a warm one only the rounds it needs. One still
    undetermined at 40 fails. The rounds are planned from the samples the judge counts (`windowTopUp`: no failed
    preparation, and for a text command none of a vendor build's unsuccessful requests), and planned again, up to
    three times a level, when failed samples left a series short. Since M3.1's second fix round each series is decided
    per candidate at the first look that judges it (`speedDecisions`: a pass or failure on 20 a side, or undetermined
    on 40), and that decision is frozen with the samples it rested on (`speed-decision` rows): the cold samples that a
    warm top-up's fresh engines prime never reopen it. The verdict judges each series' speed on its decided samples and
    everything else on every sample (`judgeWithDecisions`); `rejudge.mjs` replays the recorded decisions.
  - A parity-declared series with an open interval is sampled on and rests at parity.
  - `rejudge.mjs <results.jsonl> <run>` judges a recorded run again offline: the verdicts that change, and the
    under-20 series the old rule judged on medians. A run made through the vendor client (`meta.via` `vendor-js`) is
    not judged on speed, as the live run never judges it.
- **Declared refusals** (`deviations.mjs` `REFUSALS`): an operation the vendor lands and cua refuses in shared mode,
  recorded as a loss (verdict `declared refusal`, listed apart, never a pass) while every cua sample answers the
  declared sentence with the witness unchanged. It excuses only what the refusal itself makes differ (the failed
  request, the answer, the effect; `declaredRefusalVerdict`); the audit and every other failure the judge finds stand.
- **The drag-and-drop experiment's probes** (`withDropProbes`): each drag's `XdndSelection` watcher and grab sampler
  are stopped whatever happens, each stop tried on its own.

## Files

| File | What it is |
|---|---|
| `../linux-engine-diff.mjs` | the entry point |
| `cli.mjs` | the command line |
| `candidate.mjs` | a verdict run's cua candidate: stored, its target read, its attestation verified; a gate's refusals |
| `engine.mjs` | an engine process over the wire |
| `run.mjs`, `ops.mjs` | the differential run and its operations |
| `audit.mjs` | the X request audit through `xtrace` |
| `deviations.mjs` | the declared deviations |
| `vendor-js.mjs` | `--via vendor-js`: the engines behind OpenAI's JavaScript client |
| `readiness-check.mjs` | the engine's capture readiness judged by content, per family |
| `scenes.mjs`, `stop.mjs` | the harness's windows and the reader that reads effects back; their cleanup on SIGINT or SIGTERM |
| `chrome.mjs` | the run's own Chrome: its one launcher, the guard on every Chrome command line, its stop by the pids it spawned |
| `session-bus.mjs` | the run's own session bus: a private display's, its accessibility bus wired to the display; a person's display's, for the applications, activating nothing |
| `app-env.mjs` | the environment every application the run launches runs with: the run's home, the display and buses handed on |
| `a11y-status.mjs` | the session's accessibility switches: read on a person's display, set only on the run's own bus |
| `a11y-stub.mjs`, `dbus-wire.mjs` | the run's stand-in for org.a11y.Bus on a person's display's application bus, and the D-Bus wire it speaks |
| `prepare.mjs` | the gate's rule for a sample whose harness-side preparation fails: one resample, the counts and caps |
| `witness.mjs`, `xprobe/` | the witness; `xprobe` is the harness's own X client (witness, retention probe, image comparison, window close) |
| `busmon.mjs` | accessibility-bus call counts |
| `normalize.mjs`, `images.mjs`, `stats.mjs`, `report.mjs` | output and screenshot comparison, medians, verdicts and the exit status, summary.md |
| `experiments.mjs`, `readiness.mjs` | M0's capture-readiness and key-pace measurements |
| `matrix.mjs`, `matrix-judge.mjs`, `families.mjs`, `oracle.mjs`, `pixels.mjs`, `qt-bridge.mjs`, `pages/matrix.html` | M0.4's application-family matrix, its families and effect readers, and the Qt bridge check |
| `wire-check.mjs`, `stub-replay.mjs`, `record-wire.mjs`, `fixtures/wire/` | the wire fixtures |
| `stub-activating.mjs` | the negative check's stub engine |
| `events.mjs`, `xprobe/src/record.rs` | M1a.2's input events experiment and its recorder window |
| `pages/` | the Chrome scenes (`input.html` the pointer and key scene, `text.html` the text scene) and `gtk-table.py`, the large-table scene |
| `text.mjs`, `safety.mjs`, `safety-judge.mjs`, `clip.mjs`, `xprobe/src/clip.rs`, `pages/paste-target.py` | M2's text operations, the paste safety cases and their judges, the clipboard owner and reader, the paste-target window |
| `kinds.mjs`, `dnd.mjs`, `device.mjs`, `xprobe/src/dnd.rs`, `pages/gtk4-input.py`, `pages/qt-input.py` | M3.1's kinds and drag-and-drop experiments, Acceptance 8's device cases, the `XdndSelection` watch, the GTK 4 and Qt scenes |
| `rejudge.mjs` | a recorded run's speed verdicts judged again under the revised rule |
