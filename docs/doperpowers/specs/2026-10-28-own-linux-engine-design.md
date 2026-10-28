# cua's own Linux native engine (#171; child 4b of #114)

## Purpose

On Linux, cua's computer surface (`cua.getApp({windowId})`, `getAXState`, `click`, `typeText` and the rest of the window API in `docs/cua-api/core.md`) is answered today by OpenAI's `sky_linux_<arch>` helper and the `@oai/sky` JavaScript that drives it, both downloaded inside the pinned ChatGPT Linux package. After this work, cua's own engine, `cua-engine` (a Rust program in `native/linux-engine/`), and cua's own service answer the same API behind the same contract, on x86-64 and arm64. Once the default has switched and a soak has passed, `cua install` on Linux no longer downloads OpenAI's package.

Four things become observable that are not true today:

- **Nothing of the vendor runs.** During a Linux computer session, `ps` shows `cua-engine` as a child of cua's trusted worker and no `sky_linux_*`; `cua doctor` shows cua's engine, its version and its pinned hash.
- **It is faster.** Each operation of the measured bar (below) is answered at or below the faster of OpenAI's two builds on the same machine: a 480-element gedit tree read, a window screenshot, a key press, a click, a scroll, a drag.
- **Text arrives.** `typeText` and `paste` put exact Unicode text (Korean, emoji, combining marks, multi-line) into gedit, gnome-text-editor and Chrome, where OpenAI's pinned build fails on gedit after ten seconds and its newest build reports false errors on Chrome; a result says whether the text was applied, not applied, or could not be confirmed.
- **The person's desktop is left alone,** exactly as well as OpenAI's helper leaves it: input to a background window changes neither the active window, the stacking order, the keyboard focus nor the pointer. Where an application ignores background input, a desktop the agent owns may bring the window forward; a desktop a person uses refuses instead.

How to see it: on the #171 VM (Ubuntu 24.04, X11), `CUA_NATIVE_ENGINE=cua cua serve` with a gedit window open, then in a cell `const app = await cua.getApp({windowId}); await app.typeText('안녕 🙂'); (await app.getAXState())` shows the text in the editor's node, `ps -eo comm | grep -c sky_linux` prints 0, and `node scripts/linux-engine-diff.mjs --scene gedit --ops all` prints one row per operation with ours at or below the vendor bar.

## Progress

- [x] (2026-10-28) Reading program, tier 1 (static) and tier 2 (Ghidra and live tracing on the VM): `A-linux-contract.md`, `F-linux-helper-logic.md` in `docs/doperpowers/research/2026-10-28-own-linux-engine/`. Landscape survey `C-linux-2026.md` kept local (owner's no-code-from-surveyed-projects ruling, as for #117).
- [x] (2026-10-28) Owner rulings: same success bar as #117; read the Linux helper as deeply as the macOS one; OpenAI's own crate set counts as vetted; Rust directly (no language bake-off); per-device background mode; Wayland designed for, not built; visible cursor and any-character typing to the backlog. Design approved.
- [ ] M0 — Behaviour specification, speed spike, application-family matrix.
- [ ] M1a — Engine core, wire-compatible, with the differential harness.
- [ ] M1b — Distribution and selection: release workflow, pins, install, doctor, `CUA_NATIVE_ENGINE` on Linux, the CI gate.
- [ ] M2 — Text and clipboard: one verified paste route.
- [ ] M3 — cua's own Linux service, the device mode and the capability report.
- [ ] M4 — The measured improvements: identity, minimized windows, truncation, waits.
- [ ] M5 — Acceptance on both architectures; docs; the owner's default switch.
- [ ] M6 — Retirement of the vendor's Linux package (after the soak).

## Scope, inheritance and evidence

Child 4b, board #171, of the independence composite #114 (no checked-in parent spec). The parent contract: full independence from OpenAI with no capability or performance regression and an unchanged model-facing API. Its macOS sibling #117 (`docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`) established the patterns reused here: the contract kept behind `src/services/sky.mjs`, engine selection by `CUA_NATIVE_ENGINE` and `~/.config/cua/engine.json`, the no-regression rule measured against the vendor on the same machine, and per-app approvals through `src/services/engine/policy.mjs` (already live on Linux since #117 M3). The Linux sandbox (#115) and REPL host (#116) are already cua's own.

In scope: the Linux engine for X11 sessions on x86-64 and arm64, cua's own Linux service replacing `@oai/sky`'s Linux target, engine selection on Linux, the engine's distribution through this repository's releases, the verification system, and retiring the vendor package on Linux. Out of scope: a Wayland backend (designed for through the capability report; the next ticket after #171), the newest vendor build's visible agent cursor (backlog), typing characters absent from the keyboard layout through keymap remapping (backlog; committed Unicode text is in scope through paste), pixel-precise scrolling (backlog), and audio recording (dormant).

Terms used below:

- **Engine**: the native process that talks to the accessibility bus and the X server. The vendor's is `sky_linux_<arch>`; cua's is `cua-engine`, built from `native/linux-engine/`.
- **Service**: the JavaScript in the trusted worker of cua's REPL host that spawns the engine and turns the facade's calls into engine requests. The vendor's is `@oai/sky`'s `service.js` with `targets/linux/*`; cua's is `src/services/engine/linux/` (M3).
- **Facade**: the model-facing API in `src/cua-api/` (`bind-linux-app.mjs`, `linux-accessibility-tree.mjs`, `sky.mjs`, `create-tinysky-alt.mjs`). Unchanged by this work.
- **Wire**: the line protocol between service and engine: one JSON object per line on the engine's stdin, `{id, command, input}`, answered on stdout by `{id, ok, output | error, restart?}` (A §1.6).
- **Background route**: input addressed to one window through X11 `SendEvent` with synthetic focus events, which changes no desktop state (F §4). **Desktop route**: input through the XTEST extension, which moves the real pointer and goes to whatever has focus.
- **Retention**: keeping a window's contents available offscreen through the Composite extension's `RedirectWindow`, which background capture and the vendor's background input rely on (F §8, §10).
- **Witness**: the desktop state read before and after an action: `_NET_ACTIVE_WINDOW`, `_NET_CLIENT_LIST_STACKING`, the X server's input focus, the pointer position, and the CLIPBOARD owner.
- **Scene**: one harness-owned window in a known state (gedit on a scratch file, Chrome on a unique-title local page, and the families of the matrix in M0).
- **Bar**: for each operation and scene, the faster median of OpenAI's two builds measured interleaved on the same machine in the same sitting, and the union of what either build succeeds at.
- **Device mode**: `shared` (a person may be using this desktop) or `dedicated` (the desktop belongs to the agent). Read from `CUA_DESKTOP_MODE`, else `~/.config/cua/engine.json`'s `desktop`, else `shared`.

Research inputs, cited as `R/<file>` in `docs/doperpowers/research/2026-10-28-own-linux-engine/`:

| File | What it settles |
|---|---|
| `A-linux-contract.md` | The JS-side contract (20 setup methods, every shape, error sentence and the wire), the pinned binary's identity (Rust 1.94.1, glibc floor 2.30, six `NEEDED` libraries, linked crates), the static catalogue of AT-SPI, X11, clipboard and text vocabulary, recorded baselines and defects, cua's touchpoints (§4), tier-2 targets (§5) |
| `F-linux-helper-logic.md` | Tier 2 on the VM: per-element D-Bus calls (3,038 for a 480-node gedit tree), limits (5,000 nodes, depth 0–63, silent omission), the background recipe, the three fixed waits, text and clipboard routes in both builds, screenshots (window drawable `GetImage`, JPEG quality 80, 4:4:4), scroll quantization, activation, timings (§11), design constraints (§12) |

Two vendor builds are read and measured: the pinned **26.928.40906** (what cua installs) and the newest **26.1023.51421** (adds `type_characters`, `follow_focused_modal`, verified paste, asynchronous D-Bus replies, the virtual cursor). Their binaries and traces are on the #171 VM under `~/.local/share/cua-171/` (F §13). Decompiled vendor code stays on the VM and is never committed; the reports cite functions by name and address.

The #171 VM is `dc-linux171-1e68` (devcloud, Hetzner cpx41, x86-64, 8 vCPU, 16 GB, Ubuntu 24.04, kept without a lease by the owner's instruction): an X11 desktop on `:0` (Openbox, lightdm autologin as `new`, dummy video at 1280×800), AT-SPI on, Chrome with cua's extension, gedit, cua at `/opt/cua` from `deploy/cloud-vm/cua-provision.sh`, Rust 1.94.1. Reach it with `devcloud vm ssh dc-linux171-1e68 -- '<command>'`. Its home is `/Users/new`.

## Design

### The contract kept, and the wire adopted

The facade does not change. The service answers `setup` with `{target: "linux", methods: [the 20 names in A §1.2's order]}` and `execute {method, args}` with what each method returns today (A §1.3–1.5), including the drag-handle messages and every sentence A §1.5 lists. The trusted wrapper `src/services/sky.mjs` keeps its role (approvals before secrets, the exact `type_text` shape eligible for secret substitution, `launch_app` interception through the supervisor's `gio launch`), and `src/services/engine/policy.mjs`'s Linux rules stay as they are.

The engine speaks the vendor's wire unchanged: the same commands (the pinned 20 plus `type_characters`), the same input field names and defaults, the same output shapes (`Window`, `AccessibilityNode` with `id` being the bus name plus object path, `ax_tree_source`, screenshot file paths), the same `restart` flag semantics, and the same CLI (`cua-engine server [--mouse-size-px N]`). Why: the wire is a good fit (a stdio child of the trusted worker needs no socket, no peer check and no extra sandbox hole), and wire compatibility lets the engine run behind OpenAI's own JavaScript in place of their binary. That makes the first comparison exact: the same JavaScript, the same requests, two engines (the differential harness, below). The alternative, a new wire designed for cua's service, lost because it would make the faithful-copy stage unmeasurable. Additions are new commands or new optional output fields that the vendor JavaScript ignores (`capabilities`, `truncated`), so compatibility holds in both directions.

### The engine: `native/linux-engine/`

**One Rust program, OpenAI's crate set.** A Cargo package producing `cua-engine`. Its dependencies are limited to crates OpenAI's helper links (R/A §2.2), at those versions or later compatible releases: `x11rb` and `x11rb-protocol` (X11 with the XTEST, Composite, XFIXES and Render features), `serde`, `serde_json`, `anyhow`, `image` restricted to its JPEG encoder, and the small utilities already in that set if needed (`smallvec`, `once_cell`, `itoa`, `rustix`). The owner's ruling (2026-10-28): a package OpenAI's own helper ships counts as vetted; anything else needs a review first. The D-Bus client is cua's own code, as OpenAI's is; the `atspi`/`zbus` crates are not used (not in OpenAI's set, 87 transitive packages, mid-transition between zbus 5 and 6). Keysym lookup uses the core protocol's `GetKeyboardMapping` through x11rb rather than libX11, so the binary needs no shared libraries.

**Static, both architectures.** Built for `x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl`, statically linked, like the sandbox helper this repository already ships (`.github/workflows/linux-sandbox-helper.yml`). It therefore has no glibc floor at all, better than the vendor's 2.30, and nothing to resolve at run time.

**Process model.** The service spawns one engine per trusted worker on first use (`stdio: pipe`), keeps it while the worker lives, and kills it with the worker. Requests are executed one at a time in arrival order, as the vendor's are; the JavaScript may pipeline them. One persistent connection to the accessibility bus and one to the X server live for the process's lifetime; a broken connection is reopened once per request before the request fails, and an unrecoverable state answers with `restart: true`, which the service treats as the vendor's transport does (A §1.6).

**Modules** (each its own file under `native/linux-engine/src/`): `wire` (framing, request and response types, the command enum), `dbus` (cua's client: address discovery via `AT_SPI_BUS`, then `org.a11y.Bus.GetAddress` on the session bus; `EXTERNAL` authentication; `Hello`; marshalling of the types AT-SPI uses; serial-matched replies with any number of calls in flight; per-call deadlines), `atspi` (window association, tree read, element resolution, actions, text), `x11` (windows and properties, the background and desktop routes, retention, capture, keysyms, activation), `clipboard` (selection owner and reader, snapshots, INCR), `apps` (XDG desktop entries), `capture` (JPEG encoding), `caps` (the capability report).

### Observation

**Window association** follows the vendor's evidence (F §2.1): X11 PID through `_NET_WM_PID`, then the registry's applications with that PID, then the frame among their children by title, then by size. Where the vendor gives up and degrades to a one-node X11 tree (several frames with the same title and size, F §2.1), cua also compares each candidate frame's screen position (`Component.GetExtents` in screen coordinates) with the X11 window's translated position, and the stacking order; when that still leaves more than one, the request fails with `Window <id> matches several accessibility windows; close or retitle the duplicates` instead of returning a fallback that looks like an empty window. A minimized (unmapped) window's tree is read; its screenshot is unavailable (`Screenshot unavailable for window <id>.`) and window-targeted input to it fails with `Window <id> is minimized; activate it first` (M4).

**The tree read** returns the same nodes with the same fields as the vendor (F §2.2): role name, `Name`, `Description`, text of `text` and `entry` roles (and visible table cells), states, the action names when the Action interface is present, and children in order; the same limits, 5,000 nodes and depth 0–63; the same visible-table sampling for tables over 5,000 children. What changes is how it is fetched. The vendor reconnects for every read and sends about six calls per element, each waiting for its reply (3,038 calls for 480 gedit elements). cua's engine reuses its connection and walks the tree level by level, sending every call for the current level before reading any reply, so a level costs one round trip to each application instead of one per call. Where an application implements `org.a11y.atspi.Cache.GetItems`, the structure, roles, names, descriptions, states and interfaces come from that one call and only text and action names are fetched per element; a node absent from the cache result, or an application that answers `GetItems` with an error, falls back to the per-element read. Both paths must yield the same tree; the harness checks it. Why level by level and not unbounded concurrency: applications answer accessibility calls on their UI thread, so flooding one application gains nothing and can stall it; one level in flight bounds the queue to the tree's width. The alternative, libatspi's client-side cache, lost because it needs a GLib main loop in the engine and still issues the per-element text and action calls synchronously (R/C).

A read that hits a limit or loses a child no longer omits it silently: the engine adds `truncated: {nodes, depth, failed}` (counts of what was cut) to its `get_window_state` output, and cua's service prints one line, `Accessibility tree truncated: <n> elements not shown (<reason>)`, after the tree (M3, M4). The vendor JavaScript ignores the field.

**Screenshots.** A window screenshot is `GetImage` (ZPixmap) of the window's own drawable while it is retained, converted to RGB and encoded as JPEG at quality 80 with 4:4:4 sampling, as the vendor does (F §8), so an overlapped window is captured as itself. The desktop screenshot is `GetImage` of the root. `--mouse-size-px` defaults to 0 (no pointer stamped into desktop screenshots), the newest build's default, because a stamped pointer is pixels the model must ignore; a positive value stamps it through XFIXES as the pinned build does. Screenshot files go to the engine's private temporary directory, named as the vendor names them.

### Input

**The background route is the vendor's recipe** (F §4.2), kept exactly because it is the bar: when a request names a window, send synthetic `FocusIn` (detail `Nonlinear`, mode `Normal`) unless the real focus is already within it, then the pointer or key events with `propagate = false` and event mask 0, pointer events addressed to the deepest child window under the window-relative point, timestamps from the server time anchor plus elapsed time, button and modifier state from the engine's own held-input bookkeeping; at the end, `FocusOut` unless the real focus has meanwhile entered the target. No request on this route sends `_NET_ACTIVE_WINDOW`, raises, sets input focus or moves the pointer; the harness's witness checks every one. Requests without a window use the desktop route (XTEST), as the vendor's do.

**Retention and the fixed waits.** The vendor redirects the target window, sleeps 100 ms, and sleeps another 100 ms before unredirecting, for every targeted input and every window screenshot (F §10). cua's engine keeps a window retained from its first targeted request until the window is destroyed or the engine exits, so later requests pay no setup or teardown. Whether background input needs retention at all, and how long after `RedirectWindow` the first `GetImage` returns the window's real contents, are measured in M0; the engine waits for the readiness condition M0 measures (for example, two consecutive captures equal), or a fixed wait no longer than M0 shows necessary, never for a constant chosen without a measurement. Key pacing (33 ms per key in the pinned build, F §6.1) is kept only as long as M0 shows a toolkit drops faster keys.

**Keys.** `press_key`, `key_down` and `key_up` accept the vendor's chord grammar (A §1.3). One deliberate difference: an uppercase letter keysym (`"Z"`) adds Shift, so it types `Z`; both vendor builds type `z` (F §6.1), which no caller means. `type_characters` types characters the current keyboard layout can produce, as the newest build does, and refuses the first character it cannot (`Character <c> is not on the keyboard layout`).

**Clicks, scroll, drag, move** follow the vendor: element clicks invoke action index 0 for a left click and synthesize a button-3 press at the element's visible point for a right click (F §5); scroll converts pixels to wheel steps of 100 with a minimum of one, buttons 4–7, each held 36 ms (F §9); drags press, visit each interpolated point, release; `drag_handle` keeps its desktop-only start/move/end state; `move_relative` is desktop-only. These are kept exactly in M1a; only their waits change, and only when measurements allow.

**Activation and apps.** `activate_window` sends `_NET_ACTIVE_WINDOW` (source indication 1), raises, and sets input focus, as the vendor does; it is the one window request that changes desktop state, deliberately. `list_apps` reads XDG desktop entries as the vendor does (A §2.7); `launch_app` stays available on the wire, while cua's wrapper keeps launching through the supervisor.

**Device mode and the foreground route.** M0's matrix records, per application family (the toolkit an application's AT-SPI `Application.ToolkitName` names, plus the X11 class), whether the background route's clicks, keys and text take effect. Families that ignore it are listed in `native/linux-engine/src/families.rs` with the matrix run that showed it. For such a family the engine answers, in `shared` mode, `<App> does not accept background input; use a dedicated desktop or activate the window first`, and in `dedicated` mode activates the window and uses the desktop route, leaving the window active afterwards (restoring focus would not undo what the person might have seen, and on a dedicated desktop nobody is there). An unlisted family always uses the background route. Why the list and not detection at run time: an ignored click leaves no reliable trace to detect, and a retry through the desktop route after an uncertain first attempt risks doing the action twice. `src/runtime/launch.mjs` resolves the mode and sets `CUA_DESKTOP_MODE` in the trusted worker's environment (its allowlist gains the name); the service passes it to the engine as `--desktop shared|dedicated`. `deploy/cloud-vm/cua-provision.sh` writes `"desktop": "dedicated"` into the provisioned user's `~/.config/cua/engine.json`.

### Text and clipboard: one verified paste route

Both builds' text paths fail somewhere (F §6–7): the pinned build calls `EditableText.PasteText`, which inserts nothing in gedit and fails after 10 s; the newest build pastes with a targeted Ctrl+V for `type_text` but still uses `PasteText` for `clipboard_write`, and reports errors after correct edits in Chrome. cua's engine has one route for `type_text` and `clipboard_write`:

1. Read the focused editable element (for `type_text` with `element_id`, focus it first with a background-route click at its visible point, the vendor's way; `Component.GrabFocus` only where M2 shows it leaves the witness unchanged) and, if it implements Text, its character count, caret and selection.
2. Become the CLIPBOARD owner, serving the text (`UTF8_STRING`, `text/plain;charset=utf-8`, `STRING` for Latin-1-only text, `TARGETS`, INCR for large data) or, for `clipboard_write`, the snapshot's formats. Remember the previous owner's contents as the vendor does (A §2.6) and restore them conditionally after the paste: only if nobody else took the selection meanwhile.
3. Send Ctrl+V through the background route (the desktop route in `dedicated` mode for a listed family).
4. Confirm: poll the element's Text every 20 ms for up to 2 s for the expected change, which is that the text now contains the inserted string where the caret or selection was. The check is against the inserted segment, not the whole field, so autocompletion or suggestion text around it (the cause of the newest build's Chrome false errors) does not fail it.
5. Answer **applied** (success), **not applied** (the field is unchanged and nothing indicates a pending paste; the error names the field), or **unconfirmed** (no readable Text, or a change that does not match). An unconfirmed result is an error whose sentence says the paste was sent once and the field must be read before retrying; nothing is sent a second time.

`EditableText.PasteText` is never called; neither is `InsertText` or `SetTextContents` (they bypass the application's own input handling, and their support differs by toolkit). `clipboard_read` invokes the application's Copy through its menu or context action as the vendor does and snapshots every offered format under a handle; `clipboard_release` frees it. Snapshot limits keep the vendor's 64 MiB aggregate (F §7).

### The capability report

A new wire command, `capabilities`, answers `{backend: "x11", tree: "at_spi", input: {background: true, desktop: true}, capture: {window: "retained", desktop: true}, text: {paste: "verified", literal: true}, desktop: "shared" | "dedicated", version, build}`. cua's service reads it at setup and `cua doctor` prints it. A future Wayland backend answers with its own values (for example `capture.window: "portal"`, `input.background: false`) and the service turns a missing capability into one sentence naming it, instead of a failure inside the engine. The vendor JavaScript never sends it.

### The service: `src/services/engine/linux/` (M3)

cua's own replacement for `@oai/sky`'s Linux target, written from `R/A` §1 and the facade's tests, never translated from the vendor's minified code. Its parts: `client.mjs` (spawns `cua-engine server --desktop <mode>`, the wire, pending requests by id, the restart rule, the stderr tail for diagnostics), `ids.mjs` (the vendor's element numbering, A §1.4: one increasing counter per client, a per-window map from native id to decimal id rebuilt on full observations and copied on queries, the `Unknown element ID <id> for this window; refresh get_window_state()` sentence), `settle.mjs` (the deferred 100 ms action settle, A §1.6, and M4's measured replacement), `methods.mjs` (the 20 methods and drag handles), `service.mjs` (`handleRpc` for `setup`, `execute`, `drag_start`, `drag_move`, `drag_end`, screenshots read from the engine's files into `{filepath, data_url}`, and the truncation line). `src/services/sky.mjs` loads it through `CUA_SKY_SERVICE` as it loads the vendor's today.

### Selection, distribution and install

**Selection.** `nativeEngineFor` in `src/runtime/launch.mjs` resolves `CUA_NATIVE_ENGINE=vendor|cua` on Linux too (env, else `engine.json`'s `engine`, else the default `vendor`, flipped to `cua` by M5 when the owner says so), mirrored in `scripts/repl-parity/selection.mjs`. On Linux, `cua` sets `OAI_SKY_LINUX_BIN` to the installed `cua-engine` and keeps the vendor service until M3; from M3 it sets `CUA_SKY_SERVICE` to `src/services/engine/linux/service.mjs`. `CUA_NATIVE_ENGINE=cua` with no engine installed is refused, `engine_not_installed`, naming `cua install --engine`. For the differential harness only, `CUA_LINUX_ENGINE_BIN=<path>` overrides the installed engine's path when the selection is `cua` (today `launch.mjs` overwrites `OAI_SKY_LINUX_BIN` unconditionally, which blocked tracing in tier 2).

**Distribution.** `.github/workflows/linux-engine.yml`, modelled on `linux-sandbox-helper.yml`: dispatched with a cua commit, it builds both musl targets from that commit with Rust 1.94.1 and a hermetic Cargo home, runs the engine's tests, attests build provenance, and publishes `cua-engine-<version>-linux-{x64,arm64}` with their SHA-256 sums as the release `linux-engine-v<version>`. `runtime/engine/linux-engine.json` pins version, URLs and hashes. `cua install` on Linux (and `cua install --engine`) fetches the asset for the machine's architecture into `$CUA_HOME/engine/linux/`, verifies the hash, and marks it executable; `src/runtime/sandbox.mjs` protects that path as it protects the sandbox helper. `cua engine build` on Linux runs `cargo build --release` for local development and installs the result as the selected engine with `"build": "local"` in the doctor row.

**Doctor.** `src/runtime/doctor-engine.mjs`'s Linux branch reports the selected engine, its version and hash (or local build), the device mode, and the `capabilities` answer; `cua engine` commands stop refusing `engine_macos_only` for the subcommands that apply on Linux (`build`, `status`).

### Verification system

**The differential harness** (`scripts/linux-engine-diff.mjs` with its library under `scripts/linux-engine-diff/`) runs on an X11 machine with the scenes open and drives three engines over the wire directly (or, with `--via vendor-js`, through OpenAI's own JavaScript client with `OAI_SKY_LINUX_BIN` set to each engine in turn): the pinned vendor binary, the newest vendor binary (its path given by `--newest`; it is never installed), and `cua-engine`. Per operation and scene it records, for each engine, interleaved samples (7 for tree reads, 5 for input; order rotated per sample), the output normalized (native ids mapped by position, file paths dropped, images compared by size and mean absolute pixel difference), the accessibility-bus call count (from `dbus-monitor --address <a11y bus>` filtered to the engine's unique names), the witness before and after, and the effect read back (text through the tree, caret, scroll position). It writes `results.jsonl` and a `summary.md` table to `docs/evidence/2026-10-28-own-linux-engine/<milestone>/`. The verdict for an operation passes when cua's median is at or below the bar's, its output equals the vendor's (or differs only as a declared deviation listed in `scripts/linux-engine-diff/deviations.mjs`, each naming this spec's section), its witness never changed where the vendor's did not, and its effect is verified wherever either vendor build's is.

**Existing suites.** `scripts/repl-parity.mjs --suite native` runs the 19 native cases against each engine; its two text cases that today require the GTK failure and the window's exit (A §3.2) become positive cases (text inserted, window alive) with a recorded oracle departure, in M2. `scripts/native-baseline.mjs` measures the facade end to end on Linux with `--engine vendor|cua`. `scripts/accept/linux-native.mjs` types with `typeText` once M2 lands instead of one keysym per character.

**CI.** A new ci-kit gate `engine-linux` on the `hosted` lane (GitHub's Ubuntu runner): `cargo fmt --check`, `cargo test` (wire, D-Bus marshalling, keysym table, JPEG settings, families table), and an integration test under `xvfb-run` with `dbus-run-session`, `at-spi2-core` and a GTK3 test window (`zenity --text-info --editable`) that reads the tree, types through the paste route and captures a screenshot. Live comparisons against the vendor run on the #171 VM, never in CI (the vendor package is not fetched there).

## Acceptance

Run on the #171 VM (x86-64) and, for M5, on an arm64 Ubuntu 24.04 VM provisioned the same way; "the scenes" are gedit on a scratch file and Chrome on a unique-title local page, plus the families of M0's matrix where stated.

1. **No vendor process.** With `CUA_NATIVE_ENGINE=cua`, a computer session that binds gedit, reads it, types and takes a screenshot leaves `pgrep -fc 'sky_linux'` at 0 throughout, and `cua doctor` shows the engine row with the pinned version and hash (M1b), the service as `cua` (M3).
2. **The same answers.** For each of the 21 commands on the scenes, `node scripts/linux-engine-diff.mjs --scene gedit,chrome --ops all` reports cua's output equal to the vendor's or a declared deviation, for every operation.
3. **At or below the bar.** In the same run, every operation's verdict passes on speed: cua's median at or below the faster vendor build's. The 480-element gedit tree read and the 222-element Chrome read, the window screenshot, `press_key`, `click`, `scroll`, `drag` are each listed with the three medians.
4. **Same elements.** The gedit and Chrome reads return exactly the vendor's nodes (480 and 222 on the reference scenes: same native ids, roles, names, descriptions, states, actions and order); the summary records each engine's accessibility-bus calls and how many it awaited one after another.
5. **Background left alone.** Every window-targeted operation in the run, in `shared` mode, has an unchanged witness, on every family where the vendor's is unchanged.
6. **Text arrives once.** `typeText('cua171 안녕 é 🙂\nline2')` into gedit, gnome-text-editor and Chrome's address bar returns success and the text reads back exactly; `clipboard_write` of a snapshot into gedit succeeds; the accessibility-bus trace of the whole run contains no `PasteText`, `InsertText` or `SetTextContents` call; a paste into a field whose Text cannot be read returns the unconfirmed sentence and the field contains the text once.
7. **Identity and minimized windows.** With three Chrome windows of the same title and size, reading the first returns its full tree or the duplicate-windows sentence, never a one-node X11 tree with `at_spi` content missing; a minimized gedit window's tree is read, its screenshot answers `Screenshot unavailable for window <id>.`.
8. **Device mode.** For a family M0 lists as ignoring background input, a click in `shared` mode returns the "does not accept background input" sentence with the witness unchanged, and in `dedicated` mode takes effect with the window activated.
9. **Install.** On a fresh `CUA_HOME` on x86-64 and arm64, `cua install --engine` fetches the pinned asset, verifies its hash, and `cua doctor` passes the engine row; `file $CUA_HOME/engine/linux/cua-engine` says statically linked.
10. **Suites.** `scripts/repl-parity.mjs --suite native` passes against `cua` with the two text cases as positive cases; `scripts/native-baseline.mjs --engine cua` shows no row above the vendor's; `scripts/accept/linux-native.mjs` passes; `npm test` and the `engine-linux` gate pass.
11. **Both architectures.** Items 2–8 hold on the arm64 VM against that machine's vendor builds.
12. **Retirement (M6).** After the soak, `cua install` on Linux downloads no ChatGPT package, `cua doctor` lists no vendor runtime rows on Linux, and items 1–10 still hold.

## Constraints binding every milestone

- Dependencies of `native/linux-engine/`: only crates OpenAI's helper links (R/A §2.2; the owner's 2026-10-28 ruling), at those versions or later compatible releases, each listed in `native/linux-engine/Cargo.toml` with the version the vendor shipped noted beside it; any other crate needs the owner's yes first.
- No code from the vendor or from projects surveyed in `C-linux-2026.md`: behaviour, constants and call patterns from `R/A` and `R/F`, never translated code. Decompiled output stays on the VM.
- `EditableText.PasteText`, `InsertText` and `SetTextContents` are never called.
- The facade, `docs/cua-api/core.md` and the setup method list stay unchanged except where M3 adds the truncation line and M5 documents the device mode.
- Live GUI work runs on the #171 VM or the arm64 acceptance VM only; never on the owner's MacBook (its compute is the MAWS app's) or the Mac mini. Builds and tests run on the VM or in CI.
- Nothing logs accessibility text, titles or screenshots of windows the harness does not own; the harness closes every window it opens.
- Each milestone lands as its own pull request to `main` after a `doperpowers:reviewer-high` review and `MERGEABLE`; the spec's Progress, Surprises and Decision Log are current at every stopping point.
- A plugin bump (`.claude-plugin/plugin.json`, minor) accompanies every plugin-visible change: M1b (selection on Linux), M3 (cua's service), M5 (the default), M6 (install).

## Plan of Work

### M0 — Behaviour specification, speed spike, application-family matrix

A prototyping milestone whose deliverable is knowledge. It answers three questions before the engine is built: can a Rust read of the vendor's exact tree beat the vendor, and by how much with each fetching strategy; what do background input and capture actually need (retention, waits, key pacing); and which application families ignore the background route.

**Behaviour specification.** `docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`: the consolidated rules M1a builds against, each tagged with its source in `R/A` or `R/F` (the macOS `sky-behaviour.md` is the shape): window association, the per-element field set and limits, the visible-table path, every command's validation and error sentence, the background and desktop routes, activation, scroll and drag arithmetic, clipboard formats and handles, screenshot encoding.

**Spike.** `native/linux-engine/` as a minimal package: the wire, cua's D-Bus client, `get_window_state` (tree, with `include_screenshot`), `press_key` and `click` on the background route. Three tree variants behind a `--tree sequential|level|cache` flag: `sequential` reproduces the vendor's calls one by one (its job is to show the harness reproduces the vendor's numbers), `level` sends a level's calls together on a persistent connection, `cache` seeds from `GetItems`. Two retention variants for input behind `--retention per-request|session|none`, and a `--settle-ms` for the post-`RedirectWindow` wait. Run a first cut of the differential harness (gedit and Chrome scenes, both vendor builds) over all variants.

**Matrix.** On the VM, install the families' representative applications (GTK3 gedit, GTK4 gnome-text-editor, Qt6 `kate` or `qtcreator`, Firefox, an Electron app (cua's Electron fixture from the macOS harness, built for Linux), LibreOffice Writer, xterm) and record, for each, whether the vendor's background click, key and `type_text` take effect, with the witness. Record each family's `Application.ToolkitName`.

**Promote or discard.** Promote when `level` or `cache` returns the vendor's node set exactly on both scenes with a median at or below the bar, and a background `press_key` with `session` retention (or `none`) has an unchanged witness, a verified effect and a median at or below the bar. If no variant beats the bar on the tree read within three tuning iterations, the spike is discarded as a shape, its traces kept, and the fork goes to the owner. The verdict, the numbers and the matrix go to Surprises & Discoveries; the design's input and retention paragraphs are revised from them with a Decision Log entry.

What it does not touch: `src/`, install, CI. What it proves: none of the acceptance; it fixes the numbers and the families list M1a–M4 are measured against.

### M1a — Engine core, wire-compatible, with the differential harness

What exists at its end: `cua-engine` answers all 21 commands with the vendor's outputs on the scenes, faster where M0 showed it can be, and the differential harness runs the full operation set against both vendor builds. Behind OpenAI's own JavaScript (`OAI_SKY_LINUX_BIN` pointing at it, the harness's `--via vendor-js` mode), the facade's native cases pass except the two text cases, which M2 turns positive.

Touches: `native/linux-engine/` (all modules above; the spike's winning variants become the only code path, the losing ones deleted), `scripts/linux-engine-diff.mjs` and `scripts/linux-engine-diff/`, `docs/evidence/2026-10-28-own-linux-engine/m1a/`.

Decisions: behaviour as in `sky-linux-behaviour.md`, including the vendor's defects that M2 and M4 own (the identity fallback, minimized refusal, `PasteText` for text: in M1a `type_text` and `clipboard_write` answer `type_text is not available in this engine build` rather than reproduce a known failure, a declared deviation until M2). The uppercase-keysym difference lands here. Error sentences are the vendor's where `R/A` lists them, else cua's own and bounded. The harness's deviations list starts here.

Does not touch: `src/`, the service, install, selection.

Proves: acceptance 2–5 on x86-64 for every command except text and clipboard.

### M1b — Distribution and selection

What exists at its end: `cua install --engine` on Linux installs a pinned, CI-built static engine; `CUA_NATIVE_ENGINE=cua` runs a Linux computer session on it behind the vendor service; `cua doctor` shows it; the `engine-linux` gate runs on every pull request.

Touches: `.github/workflows/linux-engine.yml`, `runtime/engine/linux-engine.json`, `src/runtime/launch.mjs` (`nativeEngineFor` on Linux, `CUA_LINUX_ENGINE_BIN`), `src/runtime/install.mjs`, `src/runtime/manifest.mjs` (the engine path as an owned path, not a vendor layout key), `src/runtime/sandbox.mjs` (protected path), `src/runtime/doctor-engine.mjs`, `src/cli.mjs` (`cua engine build|status` on Linux), `scripts/repl-parity/selection.mjs`, `.github/ci-kit.yml`, `.claude-plugin/plugin.json`, tests beside each.

Decisions: the workflow is dispatched once the M1a code is on `main`; its first release is `linux-engine-v0.1.0`; the pin file is written from that release's assets by a small script that checks the attestation (`gh attestation verify`). The default stays `vendor`.

Does not touch: the service, the facade, the text route.

Proves: acceptance 1 (engine row), 9.

### M2 — Text and clipboard

What exists at its end: `type_text`, `clipboard_read`, `clipboard_write`, `clipboard_release` and `type_characters` work through the one verified paste route on gedit, gnome-text-editor and Chrome, with the three outcomes.

Touches: `native/linux-engine/src/{clipboard,atspi,x11}`, the harness's text effects, `scripts/repl-parity/` (the two text cases become positive, with the departure recorded in `scripts/repl-parity/vendor-defects.mjs`), `scripts/accept/linux-native.mjs` (types with `typeText`), evidence `m2/`.

Decisions: the design's five steps; the 20 ms poll and 2 s confirmation deadline; the unconfirmed sentence `Paste was sent once and could not be confirmed; read the field before retrying`; conditional clipboard restore. Text over 64 MiB is refused before anything is sent.

Proves: acceptance 6, and 2–5 for the text and clipboard commands.

### M3 — cua's own Linux service, the device mode and the capability report

What exists at its end: with `CUA_NATIVE_ENGINE=cua`, no vendor JavaScript is loaded for the Linux computer surface; `src/services/engine/linux/` drives `cua-engine`; `capabilities` is answered and shown; the device mode is read and passed; families listed by M0 behave per mode.

Touches: `src/services/engine/linux/` (new), `src/runtime/launch.mjs` (`CUA_SKY_SERVICE` for the `cua` selection on Linux), `src/services/sky.mjs` (only if loading the new module needs it), `native/linux-engine/src/{caps,families}.rs`, the `--desktop` flag, `deploy/cloud-vm/cua-provision.sh` (`"desktop": "dedicated"`), `src/runtime/doctor-engine.mjs`, `test/` (service unit tests with a fake engine speaking the wire), `.claude-plugin/plugin.json`.

Decisions: the service's parts as in the design; numbering identical to the vendor's (the harness compares rendered trees from both services on the same engine); the truncation line printed by the service. The facade's tests stay unchanged and pass.

Proves: acceptance 1 (no vendor process or module), 8; 2 rerun through the facade with `scripts/native-baseline.mjs --engine cua`.

### M4 — The measured improvements

What exists at its end: the deviations the design lists beyond M1a–M3, each measured: duplicate-window resolution or its sentence, minimized windows readable, truncation reported, the remaining fixed waits replaced by M0's measured conditions, the action settle reduced where effects still verify, key pacing removed where M0 showed toolkits keep up.

Touches: `native/linux-engine/src/{atspi,x11}`, `src/services/engine/linux/settle.mjs`, the harness's identity and minimized scenes, evidence `m4/`.

Decisions: a wait is shortened only when the harness's effect checks pass on every family of the matrix at the new value, 30 consecutive runs; otherwise it stays at the vendor's value and the evidence says why.

Proves: acceptance 3 (with the improvements), 4, 7.

### M5 — Acceptance on both architectures, docs, the default

What exists at its end: the acceptance section run as written on x86-64 and arm64, with evidence; `README.md` and `docs/cua-api/core.md` describe the Linux engine, the device mode and the capability report; the owner's decision on the default recorded; on yes, the default is `cua` on Linux and the plugin bumped.

Touches: `docs/evidence/2026-10-28-own-linux-engine/m5/`, `README.md`, `docs/cua-api/core.md`, `src/runtime/launch.mjs` (`DEFAULT_NATIVE_ENGINE` on Linux), `.claude-plugin/plugin.json`.

Decisions: the arm64 VM is a devcloud Hetzner `cax31` in an EU location (Hetzner's arm64 types were EU-only at this writing; `devcloud vm up --dry-run` checks), provisioned with `deploy/cloud-vm/cua-provision.sh`, deleted after the run. The default flips only on the owner's word.

Proves: acceptance 1–11.

### M6 — Retirement of the vendor's Linux package

After a soak the owner ends (no `CUA_NATIVE_ENGINE=vendor` needed on Linux since M5), `cua install` on Linux stops fetching the ChatGPT package: the Linux runtime pins, the `skyLinuxBin`/`skyVendorService` layout keys, the deb acquisition path, the vendor rows in `doctor`, the `sky_linux` patterns in `scripts/native-baseline/linux.mjs`, `scripts/probe/lib.mjs` and `scripts/sandbox-probe/linux-probes.mjs` (A §4.1, §4.3) are removed or moved to cua's engine; `CUA_NATIVE_ENGINE=vendor` on Linux is refused with a sentence naming the release that removed it. Proves acceptance 12.

## Concrete Steps

Working directory is `~/Developer/GitHub/cua` on the #171 VM, in a worktree of the milestone's branch, unless stated.

```
# M0 and later: build and smoke the engine (VM)
cargo build --release --manifest-path native/linux-engine/Cargo.toml
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | DISPLAY=:0 ./native/linux-engine/target/release/cua-engine server
# expected: one line {"id":1,"ok":true,"output":"[{\"id\":...,\"app\":\"org.gnome.gedit\",...}]"}

# The differential harness (VM, X session environment)
VENDOR=~/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=~/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
DISPLAY=:0 node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" \
  --cua native/linux-engine/target/release/cua-engine --scene gedit,chrome --ops all --out docs/evidence/2026-10-28-own-linux-engine/m1a
# expected: summary.md with one row per operation and scene, columns pinned / newest / cua median, calls, witness, effect, verdict PASS

# Engine tests, as the CI gate runs them (VM or CI)
cargo test --manifest-path native/linux-engine/Cargo.toml
xvfb-run -a dbus-run-session -- cargo test --manifest-path native/linux-engine/Cargo.toml --features live -- --test-threads 1

# Facade with cua's engine (M1b and later)
CUA_NATIVE_ENGINE=cua DISPLAY=:0 node scripts/repl-parity.mjs --suite native
CUA_NATIVE_ENGINE=cua DISPLAY=:0 node scripts/accept/linux-native.mjs

# The repository's gates (from the MacBook or the VM)
ci-gate ~/Developer/GitHub/cua-171
```

## Interfaces and Dependencies

`native/linux-engine/` (Cargo package `cua-linux-engine`, binary `cua-engine`), Rust 1.94.1 (`rust-toolchain.toml`), edition 2024. Dependencies as in the constraints.

The wire (`src/wire.rs`): requests and responses as in R/A §1.6. Commands: the pinned 20 (R/A §1.2) with R/A §1.3's inputs, `type_characters {window, text}` → number of characters sent, and `capabilities {}` → the object in the design. `get_window_state` output gains the optional `truncated: {nodes: u32, depth: u32, failed: u32}`. The CLI: `cua-engine server [--mouse-size-px <n>] [--desktop shared|dedicated]`; `cua-engine --version` prints `cua-engine <version> (<git sha>)`.

The service (`src/services/engine/linux/service.mjs`): `export async function handleRpc(message, nodeRepl)` with the vendor service's messages (R/A §1.2), so `src/services/sky.mjs` loads it unchanged.

Selection (`src/runtime/launch.mjs`): `nativeEngineFor` resolves on Linux with the same precedence, reasons and refusals it applies on macOS (its existing parameters, plus the platform), and its Linux result carries the engine binary's path; `CUA_LINUX_ENGINE_BIN` is read only when the engine is `cua`. The device mode resolves beside it: `CUA_DESKTOP_MODE`, else `engine.json`'s `desktop`, else `shared`; any other value is refused as `invalid_setting`.

Pins (`runtime/engine/linux-engine.json`): `{version, release, assets: {x64: {url, sha256}, arm64: {url, sha256}}}`.

The harness (`scripts/linux-engine-diff.mjs`): `--vendor <bin> --newest <bin> --cua <bin> --scene <list> --ops <list|all> --out <dir> [--samples-tree 7] [--samples-input 5]`; exit 0 when every verdict passes. `scripts/linux-engine-diff/deviations.mjs` exports `[{op, scene?, field, reason, section}]`.

## Surprises & Discoveries

- Observation: the Linux helper is not stripped; every function keeps its Rust module path (3,338–3,500 names), unlike the macOS helper (about 21% named).
  Evidence: R/A §2.1; `/Users/new/codex-app-src/readable/chatgpt-26.1013.31256/cua-native/README.md`.
- Observation: OpenAI wrote its own D-Bus client for AT-SPI and uses x11rb for X11; no libatspi, libdbus or zbus.
  Evidence: R/A §2.4, `sky_linux::client::x11::dbus::Connection::{connect,call}`.
- Observation: most of the vendor's latency is fixed sleeps and sequential calls, not work: 100 ms after `RedirectWindow`, 100 ms before teardown, 33 ms per key edge (pinned), and the JavaScript's deferred 100 ms; six calls per element, each awaited.
  Evidence: R/F §10 (`drop_in_place<InputTarget>` loads 100,000,000 ns), §2.2 (3,038 calls, 480 nodes).
- Observation: the vendor's background route really is background: 30 traced operations per build changed no witness field.
  Evidence: R/F §4.3.
- Observation: the newest build fixes gedit `type_text` (targeted Ctrl+V) but not `clipboard_write` (still `PasteText`, 10.2 s failure), and reports false errors after correct Chrome edits.
  Evidence: R/F §6.3, §7.
- Observation: `cua serve` overwrites `OAI_SKY_LINUX_BIN`, so a different helper cannot be swapped in through the environment; M1b adds `CUA_LINUX_ENGINE_BIN`.
  Evidence: `src/runtime/launch.mjs` (the Linux branch setting `OAI_SKY_LINUX_BIN: p.skyLinuxBin`); friction entry `linux-helper-override-overwritten-by-cua-serve`.

## Decision Log

- Decision (2026-10-28, authoring): verification. The spec gets one independent review by the `doperpowers:adversarial-reviewer` agent (technical-heavy: a wire protocol, X11 and D-Bus semantics, a vendor bar) and, in the same round, the same agent type's buildability review of the execution section. Execution runs under a `doperpowers:plan-executor` (opus, high) with its default worker pins; each milestone's pull request gets `doperpowers:reviewer-high`; the final branch review is doperpowers:review-code at the high rung per milestone PR.
  Rationale: the cost of a wrong behaviour decision is paid in every Linux session, and the bar is measured against a vendor whose behaviour is only partly recovered.
  Date/Author: 2026-10-28, the design session (cua_repl session 1ea561bc).

- Decision (2026-10-28, owner): open source that OpenAI's own helper ships counts as vetted ("if OpenAI use for theirs, that means it's verified"); building on x11rb, serde/serde_json, clap and the image crates is allowed. Crates outside that set still need a review.
  Rationale: the owner's no-unvetted-open-source rule exists because unvetted code is unverified; OpenAI's shipping use is the verification.
  Alternative rejected: distro libraries only (libatspi/GLib, the landscape survey's recommendation), or cua-only code in Node.
  Date/Author: 2026-10-28, owner, recorded by the design session.

- Decision (2026-10-28, owner): Rust directly, no language comparison; the spike measures fetching strategies within Rust.
  Rationale: the decompiled helper maps onto Rust structure, OpenAI's crate set covers X11 and JPEG, and tree speed depends on calls in flight rather than language; Node would have added an X11 client and a JPEG encoder to own.
  Date/Author: 2026-10-28, owner, on the design session's recommendation.

- Decision (2026-10-28, owner): when an application ignores background input, a per-device mode decides: `dedicated` may bring the window forward, `shared` refuses.
  Date/Author: 2026-10-28, owner.

- Decision (2026-10-28, design session under the owner's delegation): scope. #171 builds the X11 engine with a capability report shaped for a later Wayland backend; the Wayland backend is the next ticket; the visible agent cursor and keymap-remapping for characters off the layout go to the backlog.
  Rationale: the owner ranked the two Wayland options above the cursor and any-character typing; the vendor itself is X11-only, so parity does not require Wayland.
  Date/Author: 2026-10-28.

- Decision (2026-10-28): the bar per operation is the better of OpenAI's pinned (26.928.40906) and newest (26.1023.51421) builds, measured interleaved on the same machine.
  Rationale: the newest build changed 74 own functions and fixes some failures; "same or better than OpenAI" means their best.
  Alternative rejected: the pinned build alone (what cua installs).
  Date/Author: 2026-10-28, the design session.

## Outcomes & Retrospective

Pending — written at finish.
