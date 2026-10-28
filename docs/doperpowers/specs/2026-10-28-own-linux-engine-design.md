# cua's own Linux native engine (#171; child 4b of #114)

## Purpose

On Linux, cua's computer surface (`cua.getApp({windowId})`, `getAXState`, `click`, `typeText` and the rest of the window API in `docs/cua-api/core.md`) is answered today by OpenAI's `sky_linux_<arch>` helper and the `@oai/sky` JavaScript that drives it, both downloaded inside the pinned ChatGPT Linux package. After this work, cua's own engine, `cua-engine` (a Rust program in `native/linux-engine/`), and cua's own service answer the same API behind the same contract, on x86-64 and arm64. Once the default has switched and a soak has passed, `cua install` on Linux no longer downloads OpenAI's package.

Four things become observable that are not true today:

- **Nothing of the vendor runs.** During a Linux computer session, `ps` shows `cua-engine` as a child of cua's trusted worker and no `sky_linux_*`; `cua doctor` shows cua's engine, its version and its pinned hash.
- **It is faster.** Each operation of the measured bar (below) is answered at or below the faster of OpenAI's two builds on the same machine: a 480-element gedit tree read, a window screenshot, a key press, a click, a scroll, a drag.
- **Text arrives.** `typeText` and `paste` put exact Unicode text (Korean, emoji, combining marks, multi-line) into gedit, gnome-text-editor and Chrome, where OpenAI's pinned build fails on gedit after ten seconds and its newest build reports false errors on Chrome; a result says whether the text was applied, was not applied (nothing was sent, or the input was rejected outright), or was sent once and could not be confirmed.
- **The person's desktop is left alone,** exactly as well as OpenAI's helper leaves it: input to a background window changes neither the active window, the stacking order, the keyboard focus nor the pointer, at any moment of the operation and not only once it ends. Where an application ignores background input, a desktop the agent owns may bring the window forward; a desktop a person uses refuses instead.

How to see it: on the #171 VM (Ubuntu 24.04, X11), `CUA_NATIVE_ENGINE=cua cua serve` with a gedit window open, then in a cell `const app = await cua.getApp({windowId}); await app.typeText('안녕 🙂'); (await app.getAXState())` shows the text in the editor's node, `ps -eo comm | grep -c sky_linux` prints 0, and `node scripts/linux-engine-diff.mjs --scene gedit --ops all` prints one row per operation with ours at or below the vendor bar.

## Progress

- [x] (2026-10-28) Reading program, tier 1 (static) and tier 2 (Ghidra and live tracing on the VM): `A-linux-contract.md`, `F-linux-helper-logic.md` in `docs/doperpowers/research/2026-10-28-own-linux-engine/`. Landscape survey `C-linux-2026.md` kept local (owner's no-code-from-surveyed-projects ruling, as for #117).
- [x] (2026-10-28) Owner rulings: same success bar as #117; read the Linux helper as deeply as the macOS one; OpenAI's own crate set counts as vetted; Rust directly (no language bake-off); per-device background mode; Wayland designed for, not built; visible cursor and any-character typing to the backlog. Design approved.
- [x] (2026-10-28) Spec review round 1 (two independent reviews, design and buildability): 18 findings, one raised by both, each resolved by the design session and folded in (Decision Log, review round 1).
- [x] (2026-10-28) Spec review round 2: six findings on the round-1 revision, each resolved by the design session and folded in (Decision Log, review round 2).
- [ ] M0 — Behaviour specification, speed spike, wire fixtures, application-family matrix.
- [ ] M1a — Engine core, wire-compatible, with the differential harness.
- [ ] M1b — Distribution and selection: release workflow and the first release, pins, install, doctor, `CUA_NATIVE_ENGINE` on Linux, the facade harnesses' Linux engine lanes, the CI gate.
- [ ] M2 — Text and clipboard: one verified paste route; its release.
- [ ] M3 — cua's own Linux service, the device mode, the capability report and the truncation line; its release.
- [ ] M4 — The measured improvements: identity, minimized windows, truncation, waits; its release.
- [ ] M5 — Acceptance on both architectures on the pinned release; docs; the owner's default switch.
- [ ] M6a — A vendor-free Linux runtime.
- [ ] M6b — Retirement of the vendor's Linux package (after the soak).

## Scope, inheritance and evidence

Child 4b, board #171, of the independence composite #114 (no checked-in parent spec). The parent contract: full independence from OpenAI with no capability or performance regression and an unchanged model-facing API. Its macOS sibling #117 (`docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`) established the patterns reused here: the contract kept behind `src/services/sky.mjs`, engine selection by `CUA_NATIVE_ENGINE` and `~/.config/cua/engine.json`, the no-regression rule measured against the vendor on the same machine, per-app approvals through `src/services/engine/policy.mjs` (already live on Linux since #117 M3), and the module tree its M6 designs (`ModuleTree`), which M6a reuses. The Linux sandbox (#115) and REPL host (#116) are already cua's own.

In scope: the Linux engine for X11 sessions on x86-64 and arm64, cua's own Linux service replacing `@oai/sky`'s Linux target, engine selection on Linux, the engine's distribution through this repository's releases, the verification system, and retiring the vendor package on Linux. Out of scope: a Wayland backend (designed for through the capability report; the next ticket after #171, #224), the newest vendor build's visible agent cursor (#225), typing characters absent from the keyboard layout through keymap remapping (#226; committed Unicode text is in scope through paste), pixel-precise scrolling (#227), and audio recording (dormant).

Terms used below:

- **Engine**: the native process that talks to the accessibility bus and the X server. The vendor's is `sky_linux_<arch>`; cua's is `cua-engine`, built from `native/linux-engine/`.
- **Service**: the JavaScript in the trusted worker of cua's REPL host that spawns the engine and turns the facade's calls into engine requests. The vendor's is `@oai/sky`'s `service.js` with `targets/linux/*`; cua's is `src/services/engine/linux/` (M3).
- **Facade**: the model-facing API in `src/cua-api/` (`bind-linux-app.mjs`, `linux-accessibility-tree.mjs`, `sky.mjs`, `create-tinysky-alt.mjs`). Unchanged by this work except for the truncation line M3 adds to `bind-linux-app.mjs`.
- **Wire**: the line protocol between service and engine: one JSON object per line on the engine's stdin, `{id, command, input}`, answered on stdout by `{id, ok, output | error, restart?}` (A §1.6). `output` is a JSON value (an object, an array, a string or null), never a JSON-encoded string.
- **Background route**: input addressed to one window through X11 `SendEvent` with synthetic focus events, which changes no desktop state (F §4). **Desktop route**: input through the XTEST extension, which moves the real pointer and goes to whatever has focus. **Foreground route**: the desktop route after activating the window, used only in `dedicated` mode for a family that ignores the background route (Device mode).
- **Retention**: keeping a window's contents available offscreen through the Composite extension's `RedirectWindow`, which background capture and the vendor's background input rely on (F §8, §10).
- **Witness**: the desktop state a separate X client watches for the whole of an operation: root `PropertyNotify` for `_NET_ACTIVE_WINDOW` and `_NET_CLIENT_LIST_STACKING`, and the X server's input focus and the pointer position sampled every 5 ms. The harness pairs it with an audit of the engine's own X requests (Verification system); the clipboard is checked apart from it.
- **Scene**: one harness-owned window in a known state (gedit on a scratch file, Chrome on a unique-title local page, a harness textarea page in Chrome, the over-budget page, and the families of the matrix in M0).
- **Bar**: for each operation and scene, the faster median of OpenAI's two builds measured in rotating blocks on the same machine in the same sitting, cold and warm apart, and the union of what either build succeeds at.
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

The facade does not change, with one exception: M3 adds the truncation line to the Linux binder (Observation). The service answers `setup` with `{target: "linux", methods: [the 20 names in A §1.2's order]}` and `execute {method, args}` with what each method returns today (A §1.3–1.5), including the drag-handle messages and every sentence A §1.5 lists. The trusted wrapper `src/services/sky.mjs` keeps its role (approvals before secrets, the exact `type_text` shape eligible for secret substitution, `launch_app` interception through the supervisor's `gio launch`), and `src/services/engine/policy.mjs`'s Linux rules stay as they are.

The engine speaks the vendor's wire unchanged: the same commands (the pinned 20 plus `type_characters`), the same input field names and defaults, the same output shapes (`Window`, `AccessibilityNode` with `id` being the bus name plus object path, `ax_tree_source`, screenshot file paths), the same `restart` flag semantics, and the same CLI (`cua-engine server [--mouse-size-px N]`). `output` carries each command's value as JSON: an object for `get_window_state`, an array for `list_windows`, `list_apps` and `get_screenshot`, a string for `clipboard_read`'s handle, null for the void commands; the vendor JavaScript stringifies it for its wrappers to parse (A §1.6). Why: the wire is a good fit (a stdio child of the trusted worker needs no socket, no peer check and no extra sandbox hole), and wire compatibility lets the engine run behind OpenAI's own JavaScript in place of their binary. That makes the first comparison exact: the same JavaScript, the same requests, two engines (the differential harness, below). The alternative, a new wire designed for cua's service, lost because it would make the faithful-copy stage unmeasurable. Additions are new commands or new optional output fields that the vendor JavaScript ignores or passes through unread (`capabilities`, `truncated`, `minimized`), so compatibility holds in both directions.

### The engine: `native/linux-engine/`

**One Rust program, OpenAI's crate set.** A Cargo package producing `cua-engine`. Its dependencies are limited to crates OpenAI's helper links (R/A §2.2), at those versions or later compatible releases: `x11rb` and `x11rb-protocol` (X11 with the XTEST, Composite, XFIXES and Render features), `serde`, `serde_json`, `anyhow`, `image` restricted to its JPEG encoder, and the small utilities already in that set if needed (`smallvec`, `once_cell`, `itoa`, `rustix`). The owner's ruling (2026-10-28): a package OpenAI's own helper ships counts as vetted; anything else needs a review first. The D-Bus client is cua's own code, as OpenAI's is; the `atspi`/`zbus` crates are not used (not in OpenAI's set, 87 transitive packages, mid-transition between zbus 5 and 6). Keysym lookup uses the core protocol's `GetKeyboardMapping` through x11rb rather than libX11, so the binary needs no shared libraries.

**Static, both architectures.** Built for `x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl`, statically linked, like the sandbox helper this repository already ships (`.github/workflows/linux-sandbox-helper.yml`). It therefore has no glibc floor at all, better than the vendor's 2.30, and nothing to resolve at run time.

**Process model.** The service spawns one engine per trusted worker on first use (`stdio: pipe`), keeps it while the worker lives, and kills it with the worker. Requests are executed one at a time in arrival order, as the vendor's are; the JavaScript may pipeline them. One persistent connection to the accessibility bus and one to the X server live for the process's lifetime; a broken connection is reopened once per request before the request fails, and an unrecoverable state answers with `restart: true`, which the service treats as the vendor's transport does (A §1.6).

**Modules** (each its own file under `native/linux-engine/src/`): `wire` (framing, request and response types, the command enum), `dbus` (cua's client: address discovery through the root window's `AT_SPI_BUS` X11 property, else `org.a11y.Bus.GetAddress` on the session bus, as the vendor reads it (`sky-linux-behaviour.md` §19); `EXTERNAL` authentication; `Hello`; marshalling of the types AT-SPI uses; serial-matched replies with any number of calls in flight; per-call deadlines), `atspi` (window association, tree read, element resolution, actions, text), `x11` (windows and properties, the background and desktop routes, retention, capture, keysyms, activation), `clipboard` (selection owner and reader, snapshots, INCR, the clipboard lock), `apps` (XDG desktop entries), `capture` (JPEG encoding), `caps` (the capability report).

### Observation

**Window association** follows the vendor's evidence (F §2.1): X11 PID through `_NET_WM_PID`, then the registry's applications with that PID, then the frame among their children by title, then by size. Where the vendor gives up and degrades to a one-node X11 tree (several frames with the same title and size, F §2.1), cua also compares each candidate frame's screen position (`Component.GetExtents` in screen coordinates) with the X11 window's translated position, and the stacking order; when that still leaves more than one, the request fails with `Window <id> matches several accessibility windows; close or retitle the duplicates` instead of returning a fallback that looks like an empty window. The vendor answers every other association failure in `get_window_state` with the same one-node X11 tree too (no usable `_NET_WM_PID`, no provider with the PID, an unreachable bus, a root node that fails; `sky-linux-behaviour.md` §4); those keep the vendor's fallback with `ax_tree_source: "x11"`, and only the duplicate-frames case changes.

**Minimized windows** (M4). `list_windows` also lists iconified windows (`WM_STATE` Iconic) with the additive field `minimized: true`. The vendor omits them, so today a bound window that the person minimizes becomes `Window <id> is unavailable.` to cua's policy and facade, which find windows in that list; listing them is a declared deviation. The policy (`src/services/engine/policy.mjs`) and the facade accept a listed minimized window as they accept any other, its app identity still resolved from the engine's own `list_windows`. Its tree is read; its screenshot is unavailable (`Screenshot unavailable for window <id>.`), and window-targeted input to it fails with `Window <id> is minimized; activate it first`.

**The tree read** returns the same nodes with the same fields as the vendor (F §2.2): role name, `Name`, `Description`, text of `text` and `entry` roles (and visible table cells), states, the action names when the Action interface is present, and children in order; the same limits; the same visible-table sampling for tables over 5,000 children. What changes is how it is fetched. The vendor reconnects for every read and sends about six calls per element, each waiting for its reply (3,038 calls for 480 gedit elements). cua's engine reuses its connection and sends the vendor's per-element calls for the vendor's exact field set (`GetRoleName`, `Properties.Get` of `Name` and `Description`, `GetText` where the role calls for it, `GetState`, `GetInterfaces` then `NActions` and `GetName` per action, `GetChildren`), many in flight instead of one. Acquisition follows the preorder frontier (the nodes preorder visits next) with a lookahead window of at most W calls in flight and R bytes of outstanding replies, so a read costs about one round trip per window of calls instead of one per call; M0 chooses W and R, starting from 64 calls and 4 MiB. R counts the bytes of replies received and not yet consumed plus a fixed reservation for each call in flight (4 KiB to start; M0 may tune it), and a new call is issued only while that sum is under R. A reply larger than the remaining credit is still read in full and never truncated, since every field must match the vendor's; while it is outstanding nothing new is issued until credit returns, so staging memory is bounded by R plus the largest single reply. Why a bounded window, and not unbounded concurrency or a whole tree level at a time: applications answer accessibility calls on their UI thread, so flooding one application gains nothing and can stall it, and one level of a very wide container would put thousands of calls in flight and fetch attributes for nodes preorder never admits.

Admission stays the vendor's (F §2.3): a depth-first preorder walk with one shared counter, refusing a node when the count already exceeds 4,999 before its increment, and a node deeper than 63. Speculation stays inside it: attribute calls are scheduled only for nodes that preorder admission could still admit, and once admission reaches 5,000 nothing more is scheduled; a very wide container's children are listed with `GetChildren`, but their attributes are fetched only inside the admission window. A node is in the output if and only if preorder admission admits it. The over-budget scene checks both halves (M1a): the retained native ids equal the vendor's exactly, and cua's accessibility-bus calls on that scene are at most the vendor's plus a small constant M0 fixes. Both counts include the vendor's extra calls on tables (a `ChildCount` read per `table`, and the sampled cells' re-read of role, state and extents; `sky-linux-behaviour.md` §5.1, §5.4).

`Cache.GetItems` is not on the main path. M0 measures it as an experiment, and M4 adopts it only if it reproduces the sequential read's output exactly on menus, Qt and changing trees, and then only under these rules: it supports every cache signature the applications answer with, Qt's legacy one included; it maps numeric roles to names, with `GetRoleName` for a role it does not know; and wherever the index in parent or the child count is the -1 sentinel, it falls back to `GetChildren`. The alternative, libatspi's client-side cache, lost because it needs a GLib main loop in the engine and still issues the per-element text and action calls synchronously (R/C).

A read that hits a limit or loses a child no longer omits it silently: the engine adds `truncated: {nodes, depth, failed}` (counts of what was cut; a node whose `GetRoleName` fails drops with its subtree, as in the vendor, and counts in `failed`) to its `get_window_state` output (M4). The service returns structure and the facade renders it, so the line is the facade's: cua's service passes the field in the WindowState, `src/cua-api/sky.mjs`'s hydration keeps it (it copies the state's fields), and `src/cua-api/bind-linux-app.mjs` appends `Accessibility tree truncated: <n> elements not shown (<reason>)` after the tree wherever it renders one, in `getAXState` and in the combined observation, whether or not the observation is emitted; a state without the field renders as today (M3). M4's over-budget fixture shows the line end to end. The vendor JavaScript ignores the field.

**Screenshots.** A window screenshot is `GetImage` (ZPixmap) of the window's own drawable while it is retained, converted to RGB and encoded as JPEG at quality 80 with 4:4:4 sampling, as the vendor does (F §8), so an overlapped window is captured as itself. The desktop screenshot is `GetImage` of the root. `--mouse-size-px` defaults to 0 (no pointer stamped into desktop screenshots), the newest build's default, because a stamped pointer is pixels the model must ignore; a positive value stamps it through XFIXES as the pinned build does, at the cursor's native size (the value sizes only the fallback icon used without XFIXES, `sky-linux-behaviour.md` §16). Screenshot files go to the engine's private temporary directory, named as the vendor names them.

### Input

**The background route is the vendor's recipe** (F §4.2), kept exactly because it is the bar: when a request names a window, send synthetic `FocusIn` (detail `Nonlinear`, mode `Normal`) unless the real focus is already within it, then the pointer or key events with `propagate = false` and event mask 0, pointer events addressed to the deepest child window under the window-relative point, timestamps from the server time anchor plus elapsed time, button and modifier state from the engine's own held-input bookkeeping; at the end, `FocusOut` unless the real focus has meanwhile entered the target. No request on this route sends `_NET_ACTIVE_WINDOW`, raises, sets input focus or moves the pointer. The harness proves it continuously, not from before-and-after snapshots: the witness watches the desktop for the whole operation, and an audit of the engine's X requests finds none of the forbidden ones (Verification system). Requests without a window use the desktop route (XTEST), as the vendor's do.

**Retention and the fixed waits.** The vendor redirects the target window, sleeps 100 ms, and sleeps another 100 ms before unredirecting, for every targeted input and every window screenshot (F §10). cua's engine keeps a window retained from its first targeted request until the window is destroyed or the engine exits, so later requests pay no setup or teardown. Because retention outlives a request, the harness checks it where it could go stale: after a resize, an unmap and remap, and a content change while the window is fully occluded. Whether background input needs retention at all, and how long after `RedirectWindow` the first `GetImage` returns the window's real contents, are measured in M0; the engine waits for the readiness condition M0 measures (for example, two consecutive captures equal), or a fixed wait no longer than M0 shows necessary, never for a constant chosen without a measurement. Key pacing (33 ms per key in the pinned build, F §6.1) is kept only as long as M0 shows a toolkit drops faster keys.

**Keys.** `press_key`, `key_down` and `key_up` keep the vendor's chord semantics exactly (A §1.3, F §6.1): a key names a keysym, Shift is added only where the vendor adds it, so `"Z"` produces z without Shift as in both vendor builds, and `Ctrl+Z` stays undo. Literal case is what `type_characters` and `type_text` are for. `type_characters` types characters the current keyboard layout can produce, as the newest build does, and refuses the first character it cannot (`Character <c> is not on the keyboard layout`). Tests cover mixed-case shortcuts and held-chord equivalence with the vendor: the same `press_key`, `key_down` and `key_up` sequences produce the same X key events in both engines.

**Clicks, scroll, drag, move** follow the vendor: element clicks invoke action index 0 for a left click and synthesize a button-3 press at the element's visible point for a right click (F §5); scroll converts pixels to wheel steps of 100 with a minimum of one, buttons 4–7, each held 36 ms (F §9); drags press, visit each interpolated point, release; `drag_handle` keeps its desktop-only start/move/end state; `move_relative` is desktop-only. These are kept exactly in M1a; only their waits change, and only when measurements allow.

**Activation and apps.** `activate_window` sends `_NET_ACTIVE_WINDOW` (source indication 1), raises, and sets input focus, as the vendor does; it is the one window request that changes desktop state, deliberately. `list_apps` reads XDG desktop entries as the vendor does (A §2.7); `launch_app` stays available on the wire, while cua's wrapper keeps launching through the supervisor.

**Device mode and the foreground route.** M0's matrix records, per application family (the toolkit an application's AT-SPI `Application.ToolkitName` names, plus the X11 class), whether the background route's clicks, keys and text take effect. Families that ignore it are listed in `native/linux-engine/src/families.rs` with the matrix run that showed it. For such a family the engine answers, in `shared` mode, `<App> does not accept background input; use a dedicated desktop or activate the window first`, and in `dedicated` mode activates the window and uses the desktop route (the foreground route), leaving the window active afterwards (restoring focus would not undo what the person might have seen, and on a dedicated desktop nobody is there). An unlisted family always uses the background route. Why the list and not detection at run time: an ignored click leaves no reliable trace to detect, and a retry through the desktop route after an uncertain first attempt risks doing the action twice. `src/runtime/launch.mjs` resolves the mode and sets `CUA_DESKTOP_MODE` in the trusted worker's environment (its allowlist gains the name); the service passes it to the engine as `--desktop shared|dedicated`. `deploy/cloud-vm/cua-provision.sh` writes `"desktop": "dedicated"` into the provisioned user's `~/.config/cua/engine.json`.

### Text and clipboard: one verified paste route

Both builds' text paths fail somewhere (F §6–7): the pinned build calls `EditableText.PasteText`, which inserts nothing in gedit and fails after 10 s; the newest build pastes with a targeted Ctrl+V for `type_text` but still uses `PasteText` for `clipboard_write`, and reports errors after correct edits in Chrome. cua's engine has one route for `type_text` and `clipboard_write`. It observes before it acts, holds the display's clipboard lock for the whole exchange, sends at most once, bounds every wait, and ends through one guarded cleanup:

1. **Observe.** Read the target element (the one `element_id` names, else the window's focused element): whether it has focus and, if it implements Text, its character count, caret and selection.
2. **Focus only if needed.** If `element_id` names an element that does not have focus, focus it with a background-route click at its visible point (F §5) and observe it again; the text then goes where that click leaves the caret, as a person's click would. The vendor instead always clicks the named element and then puts the caret or selection back through AT-SPI (`sky-linux-behaviour.md` §7.4); cua's rule is a deliberate departure (review round 1). An element that already has focus is never clicked, so a caret or selection the caller placed stays where it is.
3. **Lock, snapshot, own.** Take the clipboard lock (below); remember the current CLIPBOARD contents as the vendor does (A §2.6), within the snapshot bounds (below); become the CLIPBOARD owner, serving the text (`UTF8_STRING`, `text/plain`, `text/plain;charset=utf-8`, `STRING` for Latin-1-only text, `TARGETS`, INCR for large data) or, for `clipboard_write`, the snapshot's formats.
4. **Revalidate, then dispatch once.** Immediately before sending, check that the same element has focus with the same selection and caret, and that the desktop focus is unchanged: on the background route the synthetic-focus state the engine holds for the window, on the foreground route the X server's real input focus. On any change, run the cleanup (below) and refuse with `requested field or selection changed before dispatch; nothing was sent`. Otherwise send Ctrl+V once through the background route (the foreground route in `dedicated` mode for a listed family).
5. **Confirm.** Poll the element's Text every 20 ms for up to 2 s for the expected change, which is that the text now contains the inserted string where the caret or selection was. The check is against the inserted segment, not the whole field, so autocompletion or suggestion text around it (the cause of the newest build's Chrome false errors) does not fail it. Meanwhile the paste's selection transfer is served within the transfer bounds (below). When both are done, run the cleanup and release the lock.
6. **Answer.** **Applied** (success) when the change is confirmed. **Not applied** only when nothing was sent (a refusal before dispatch: no editable target, the field, selection or focus changed, `clipboard busy`, or CLIPBOARD lost before dispatch) or when the input was rejected outright (the X server refused the events, for example with `BadWindow` for a window that closed). Everything else after dispatch is **unconfirmed**, including a field still unchanged at the deadline (an application may apply a paste late), a transfer that hit its bounds before the Text read confirmed the edit, and a field with no readable Text: an error whose sentence says the paste was sent once and the field must be read before retrying. Nothing is sent a second time, and no answer after dispatch says or implies that a retry is safe.

**The cleanup.** One guarded operation ends every paste on every exit path: normal completion, a refusal before dispatch, a timeout and an error. The engine never calls `SetSelectionOwner` to restore. While it still owns CLIPBOARD (it has received no `SelectionClear`), restoring means switching the content it serves to the remembered snapshot, which it keeps serving afterwards as the vendor's persistent owner serves after a request (R/A §2.6; the vendor itself restores by conditionally taking ownership again or giving CLIPBOARD up, `sky-linux-behaviour.md` §13.5, which this design rejects), so no other client's newer clipboard can be overwritten. Once it has received `SelectionClear`, the cleanup does nothing.

**Serving generations.** A late conversion must never receive the restored snapshot as if it were the paste. Every paste gets its own serving generation, keyed by the timestamp of the synthetic Ctrl+V the engine sent. After that paste's cleanup, a `ConvertSelection` carrying the paste's timestamp, or any timestamp from when the engine took ownership up to the cleanup, is refused with a `SelectionNotify` whose property is None; so is a `CurrentTime` request arriving within 10 s after a paste that did not confirm. Requests outside those windows get the snapshot. An INCR transfer already accepted stays pinned to the payload it started with.

**Snapshot bounds.** Reading the current owner's contents is bounded too, for the paste's snapshot and for `clipboard_read`: 500 ms for the `TARGETS` reply, 500 ms for each format's first response, 2 s between INCR chunks, and 5 s overall across all formats. On expiry before dispatch the engine releases both locks and answers that nothing was sent.

**Transfer bounds.** After Ctrl+V, no `SelectionRequest` within 500 ms means no transfer started; an active transfer must make progress at least every 2 s between INCR chunks and finish within 10 s overall. On any of these, the engine stops serving that transfer, runs the cleanup, and answers unconfirmed unless the Text read already confirmed the edit. Requests run one at a time, so a paste never holds the request queue beyond these bounds, the lock's 5 s and the 2 s confirmation.

**The clipboard lock.** The clipboard belongs to the display, not to one engine, so two sessions pasting on one display at once could each paste the other's text or restore a stale clipboard. A paste therefore holds a per-display lock that every engine shares, from the snapshot through taking ownership, dispatch and the transfer to the cleanup; `clipboard_read` holds it from its Copy through its snapshot, since its Copy changes the owner too. The lock is the private X selection `CUA_CLIPBOARD_LOCK`, owned by a lock window the engine creates. Acquiring it is atomic: `GrabServer`, `GetSelectionOwner` (it must answer None), `SetSelectionOwner` to the lock window, `GetSelectionOwner` again to verify that it names the lock window, `UngrabServer` (the vendor's `SelectionReader::lock` does the same, verify read included, with 5 ms retries until its command's 10 s deadline, `sky-linux-behaviour.md` §13.2; cua's deadline is its own 5 s). The grab is that short and is released before any waiting or clipboard work; a lock found owned is tried again after the grab is released. Releasing gives the selection up. The engine then takes the vendor's `SKY_CLIPBOARD_LOCK` (R/A §2.6) the same way, after `CUA_CLIPBOARD_LOCK`. How the vendor itself acquires `SKY_CLIPBOARD_LOCK` is recorded in M0's behaviour specification; interoperating with a vendor engine pasting at the same time is best effort, and the differential harness never runs two engines' pastes concurrently. Acquiring both takes at most 5 s; after that the request is refused with `clipboard busy` and nothing is sent. If a non-participant (a program that takes CLIPBOARD without the lock) takes ownership before dispatch, the paste aborts with nothing sent; after dispatch, the result is unconfirmed. Either way the engine has received `SelectionClear`, so the cleanup leaves the new owner's contents alone.

`EditableText.PasteText` is never called; neither is `InsertText` or `SetTextContents` (they bypass the application's own input handling, and their support differs by toolkit). `clipboard_read` invokes the application's Copy through its menu or context action as the vendor does and snapshots every offered format under a handle; `clipboard_release` frees it. Snapshot limits keep the vendor's 64 MiB aggregate (F §7).

### The capability report

A new wire command, `capabilities`, answers `{backend: "x11", tree: "at_spi", input: {background: true, desktop: true}, capture: {window: "retained", desktop: true}, text: {paste: "verified", literal: true}, desktop: "shared" | "dedicated", version, build}`. cua's service reads it at setup and `cua doctor` prints it. A future Wayland backend answers with its own values (for example `capture.window: "portal"`, `input.background: false`) and the service turns a missing capability into one sentence naming it, instead of a failure inside the engine. The vendor JavaScript never sends it.

### The service: `src/services/engine/linux/` (M3)

cua's own replacement for `@oai/sky`'s Linux target, written from `R/A` §1 and the facade's tests, never translated from the vendor's minified code. Its parts: `client.mjs` (checks the engine's version, spawns `cua-engine server --desktop <mode>`, the wire, pending requests by id, the restart rule, the stderr tail for diagnostics), `ids.mjs` (the vendor's element numbering, A §1.4: one increasing counter per client, a per-window map from native id to decimal id rebuilt on full observations and copied on queries, the `Unknown element ID <id> for this window; refresh get_window_state()` sentence), `settle.mjs` (the deferred 100 ms action settle, A §1.6, and M4's measured replacement), `methods.mjs` (the 20 methods and drag handles), `service.mjs` (`handleRpc` for `setup`, `execute`, `drag_start`, `drag_move`, `drag_end`, screenshots read from the engine's files into `{filepath, data_url}`, and `truncated` passed through in the WindowState for the facade's line). `src/services/sky.mjs` loads it through `CUA_SKY_SERVICE` as it loads the vendor's today.

**The engine version.** `client.mjs` declares `MIN_ENGINE_VERSION`, the oldest engine the service drives; before its first request it runs `cua-engine --version` and refuses an older engine with `cua-engine <found> is older than <MIN_ENGINE_VERSION>, which this cua needs; run cua install --engine`. A release pull request raises it when the service relies on that release's behaviour or wire. Before M3 the vendor JavaScript drives the engine and checks no version; only an explicit `cua` selection reaches the engine then, and `cua doctor` flags an installed engine that is not the pinned one.

### Selection, distribution and install

**Selection.** `nativeEngineFor` in `src/runtime/launch.mjs` resolves `CUA_NATIVE_ENGINE=vendor|cua` on Linux too (env, else `engine.json`'s `engine`, else the default `vendor`, flipped to `cua` by M5 when the owner says so), mirrored in `scripts/repl-parity/selection.mjs`. On Linux, `cua` sets `OAI_SKY_LINUX_BIN` to the installed `cua-engine` and keeps the vendor service until M3; from M3 it sets `CUA_SKY_SERVICE` to `src/services/engine/linux/service.mjs`. `CUA_NATIVE_ENGINE=cua` with no engine installed is refused, `engine_not_installed`, naming `cua install --engine`. For the harnesses only, `CUA_LINUX_ENGINE_BIN=<path>` overrides the installed engine's path when the selection is `cua` (today `launch.mjs` overwrites `OAI_SKY_LINUX_BIN` unconditionally, which blocked tracing in tier 2).

**Distribution.** `.github/workflows/linux-engine.yml`, modelled on `linux-sandbox-helper.yml` (a push of the file registers it, so it can be dispatched from a branch before it reaches main): dispatched with a cua commit, it builds both musl targets from that commit with Rust 1.94.1 and a hermetic Cargo home, runs the engine's tests, attests build provenance, and publishes `cua-engine-<version>-linux-{x64,arm64}` with their SHA-256 sums as the release `linux-engine-v<version>`, the version read from `native/linux-engine/Cargo.toml` at that commit; it refuses a version whose release exists. `runtime/engine/linux-engine.json` pins version, URLs and hashes.

Every milestone that changes engine behaviour or the wire (M1b's first release, then M2, M3 and M4) ends with a release in its own pull request: the reviewed head commit carries the bumped version, the workflow is dispatched on that commit, both assets' attestations are verified (`gh attestation verify`), and `scripts/linux-engine-pin.mjs` rewrites the pin, committed to the same pull request (from M3 with `MIN_ENGINE_VERSION` raised where needed). The pin commit changes nothing the engine is built from, so the released assets are the merged engine. M5's acceptance then runs on exactly those pinned assets.

`cua install` on Linux (and `cua install --engine`) fetches the asset for the machine's architecture into `$CUA_HOME/engine/linux/`, verifies the hash, and marks it executable, replacing an installed engine of another version with one rename (a running engine keeps its file); `src/runtime/sandbox.mjs` protects that path as it protects the sandbox helper. `cua engine build` on Linux runs `cargo build --release` for local development and installs the result as the selected engine with `"build": "local"` in the doctor row.

**Doctor.** `src/runtime/doctor-engine.mjs`'s Linux branch reports the selected engine, its version and hash (or local build), the device mode, and the `capabilities` answer; `cua engine` commands stop refusing `engine_macos_only` for the subcommands that apply on Linux (`build`, `status`).

**The vendor-free runtime (M6a).** Until M6a every Linux session, browser-only ones included, resolves the vendor's archive: `locateRuntime` and `resolveRuntime` (`src/runtime/manifest.mjs`, called by `src/mcp/connection.mjs` for every connection) read the active pointer's vendor release and its install record, and `buildLaunch` (`src/runtime/launch.mjs`) takes from that tree the module tree cells import from (`CUA_REPL_NODE_MODULE_DIRS`), the helper and the vendor service. M6a replaces each with cua's own part: #117 M6's ModuleTree (`runtime/modules/package.json` and its lockfile, installed by `cua install` with `npm ci --omit=dev` into `$CUA_HOME/modules/<lock hash>/`; "Engine selection, host switch and retirement" and M6 in `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`), cua's managed Node (`src/runtime/managed-node.mjs`), the sandbox helper (`src/sandbox/linux.mjs`) and `cua-engine` with cua's service. If #117 M6 has not landed when M6a starts, M6a builds ModuleTree for Linux following that design text, and #117 M6 reuses it.

- **The runtime record.** The Linux runtime record names those four parts by their own pins instead of an archive, and its release name is derived from them, so a change to any part is a new release for the handshake records and the active pointer.
- **Resolution and launch.** `locateRuntime` and `resolveRuntime` resolve that record on Linux (each part present and matching its pin; no archive install record), and `buildLaunch` takes the module tree, the engine and cua's service from it.
- **Old pointers.** An active pointer that names a vendor Linux release is migrated: `cua install` rewrites it to the own record; until then the resolution uses the own record when its parts are installed and otherwise refuses `runtime_not_installed` naming `cua install`, never launching from the vendor tree.
- **Browser-only sessions** resolve the same record and need its Node, module tree and sandbox helper, not the engine.
- **The vendor tree.** Until M6b, `cua install` still places it for `CUA_NATIVE_ENGINE=vendor`, the only thing that reads it, which is refused, naming `cua install`, when it is absent.
- **Tests:** an empty home (`cua install`, then a computer session and a browser-only session), and an upgraded home whose vendor tree is unavailable (the pointer names the vendor release, its tree is gone): both serve `cua` sessions, browser-only included.

**Retirement (M6b).** After the soak, the deletion: the deb acquisition in `src/runtime/install.mjs`, the Linux vendor pins (`runtime/releases/26.928.40906-linux-{x64,arm64}.json`), `LINUX_LAYOUT_KEYS` with its `skyLinuxBin` and `skyVendorService` keys, the vendor rows in doctor, and the `sky_linux` patterns in `scripts/native-baseline/linux.mjs`, `scripts/probe/lib.mjs` and `scripts/sandbox-probe/linux-probes.mjs` (A §4.1, §4.3) are removed or moved to cua's engine; `CUA_NATIVE_ENGINE=vendor` on Linux is refused as `engine_retired`, its sentence naming the release that removed the vendor engine and `CUA_NATIVE_ENGINE=cua`.

### Verification system

**The differential harness** (`scripts/linux-engine-diff.mjs` with its library under `scripts/linux-engine-diff/`) runs on an X11 machine with the scenes open and drives three engines over the wire directly (or, with `--via vendor-js`, through OpenAI's own JavaScript client with `OAI_SKY_LINUX_BIN` set to each engine in turn): the pinned vendor binary, the newest vendor binary (its path given by `--newest`; it is never installed), and `cua-engine`.

It measures in blocks. A block is one engine with its process started fresh for the block, so nothing an engine retained (cua's retention included) outlives it; the block takes the cold sample (the first request after the engine starts) and then the warm series (7 tree reads, 5 per input operation). Block order rotates across the sitting (three blocks per engine by default), so the engines interleave without sharing a process, and no two engines ever paste at the same time; cold and warm series are reported and judged apart. Tree reads of a scene window serve every engine; where retention state matters (screenshots and input), each engine gets its own equivalent scene window, so one engine's retained window is never the window another is measured on.

Per operation and scene it records, for each engine, the samples, the output normalized (native ids mapped by position, file paths dropped, images compared by size and mean absolute pixel difference), the accessibility-bus call count (from `dbus-monitor --address <a11y bus>` filtered to the engine's unique names), the effect read back (text through the tree, caret, scroll position), and non-interference, proven continuously:

- **The witness.** A separate X client selects `PropertyNotify` on the root for `_NET_ACTIVE_WINDOW` and `_NET_CLIENT_LIST_STACKING` and samples the input focus and the pointer every 5 ms, from before the request is sent until after its answer; any change in that span fails the operation, whatever the state at its end.
- **The audit.** In its own untimed pass, the engine's X connection goes through `xtrace` on a proxy display (as R/F §0 traced), and a background-route operation fails on any forbidden request: `SetInputFocus`, `ConfigureWindow` with a stack mode, `WarpPointer`, a `_NET_ACTIVE_WINDOW` ClientMessage, or XTEST `FakeInput` (which the VM's xtrace prints as UNKNOWN opcode 132/2, R/F §4.1, so the audit matches XTEST's major opcode, as the server reports it, with minor 2).
- **The negative check.** Every harness run first drives a stub engine (`scripts/linux-engine-diff/stub-activating.mjs`, speaking the wire) that activates the target window, sends its input and restores the previous active window, focus and stacking; the run is invalid unless the witness and the audit both fail it.

Clipboard preservation is checked apart from the witness: after a paste or `clipboard_write` the clipboard holds what it held before (or what a competing owner set meanwhile), and the concurrent case (two sessions pasting distinct markers at once) shows no cross-delivery and no stale restore.

Beyond the reference scenes the harness runs the over-budget scene (a harness HTML page in Chrome, or a GTK window, generating more than 5,000 elements with both wide and deep branches), compared by exact retained native ids from M1a; the retention cases (a scene window resized, unmapped and remapped, and changed while fully occluded, each followed by a screenshot and an input whose effect is read back); and the text cases of Acceptance 6 (M2), whose exact multi-line and combining-mark checks run in a harness-owned textarea page in Chrome and in gedit and gnome-text-editor, while Chrome's address bar gets a separate single-line Unicode case (a newline there would navigate) that covers the newest build's false-error regression.

It writes `results.jsonl` and a `summary.md` table to `docs/evidence/2026-10-28-own-linux-engine/<milestone>/`. The verdict for an operation passes when cua's median is at or below the bar's (warm against warm, cold against cold), its output equals the vendor's (or differs only as a declared deviation listed in `scripts/linux-engine-diff/deviations.mjs`, each naming this spec's section), its witness and audit are clean wherever the vendor's witness is, and its effect is verified wherever either vendor build's is.

**The facade suites.** From M1b the facade-level suites run on either engine. `scripts/repl-parity.mjs --suite native` runs the native cases (19 today) on a declared Linux device with `--host cua` (cua's own host, the only one on Linux) and `--engine vendor|cua`, forwarding the selection to the device as `CUA_NATIVE_ENGINE` and, with `--engine-bin`, `CUA_LINUX_ENGINE_BIN`; its `diff` pairs the two engine lanes. `scripts/native-baseline.mjs` measures the facade end to end on Linux with `--engine vendor|cua`, and `compare --engines` judges the two lanes. Both verify which engine answered from the trusted worker's child process: its executable (`/proc/<pid>/exe`) must be the pinned runtime's `sky_linux_<arch>` on the vendor lane and the installed or named `cua-engine` on the cua lane, and a run where anything else answered is incomplete. `scripts/repl-parity/devices.mjs` declares the two VMs (M1b, with their preparation; Concrete Steps). In M1a, before `cua serve` can select another engine, the facade-level proof is `scripts/linux-engine-diff.mjs --via vendor-js` alone. The native suite's two text cases, which today require the GTK failure and the window's exit (A §3.2), become positive cases (text inserted, window alive) with a recorded oracle departure, in M2; until then the `cua` lane meets M1b's temporary candidate expectations for them (M1b). `scripts/accept/linux-native.mjs` types with `typeText` once M2 lands instead of one keysym per character.

**CI.** A new ci-kit gate `engine-linux` on the `hosted` lane (GitHub's Ubuntu runner), from M1b: `cargo fmt --check`, the release build, `cargo test` (wire, D-Bus marshalling, keysym table and chord semantics, JPEG settings, families table), and a live test under `xvfb-run` with `dbus-run-session`, `at-spi2-core` and a GTK3 test window (`zenity --text-info --editable`) that reads the tree, sends a background `press_key` whose effect it reads back through the tree, and captures a window screenshot. M2 adds the paste assertions: a Unicode `type_text` and a `clipboard_write` read back exactly. Live comparisons against the vendor run on the #171 VM, never in CI (the vendor package is not fetched there).

## Acceptance

Run on the #171 VM (x86-64) and, for M5, on an arm64 Ubuntu 24.04 VM provisioned the same way; "the scenes" are gedit on a scratch file and Chrome on a unique-title local page, plus the families of M0's matrix, the over-budget page and the harness textarea page where stated. M5 runs every item on the exact pinned release assets `cua install` fetches on each architecture: no `CUA_LINUX_ENGINE_BIN`, no `--engine-bin` and no local build.

1. **No vendor process.** With `CUA_NATIVE_ENGINE=cua`, a computer session that binds gedit, reads it, types and takes a screenshot leaves `pgrep -fc 'sky_linux'` at 0 throughout, and `cua doctor` shows the engine row with the pinned version and hash (M1b), the service as `cua` (M3).
2. **The same answers.** For each of the 21 commands on the scenes, the differential harness (Concrete Steps) reports cua's output equal to the vendor's or a declared deviation, for every operation, the retention cases included.
3. **At or below the bar.** In the same run, every operation's verdict passes on speed: cua's warm median at or below the faster vendor build's warm median, and its cold first request at or below the faster cold one. The 480-element gedit tree read and the 222-element Chrome read, the window screenshot, `press_key`, `click`, `scroll`, `drag` are each listed with the three medians of each series.
4. **Same elements.** The gedit and Chrome reads return exactly the vendor's nodes (480 and 222 on the reference scenes: same native ids, roles, names, descriptions, states, actions and order) through the windowed per-element read; on the over-budget scene the retained native ids equal the vendor's exactly, cua's accessibility-bus calls are at most the vendor's plus M0's constant, and read through the facade the state ends with the truncation line (M4); the summary records each engine's accessibility-bus calls and how many it awaited one after another. If M4 adopts `Cache.GetItems`, its output equals the sequential read's on menus, Qt and a changing tree.
5. **Background left alone.** Every window-targeted operation in the run, in `shared` mode, keeps the witness unchanged for its whole span and its audit clean, on every family where the vendor's witness is unchanged; the activate-and-restore stub engine fails both.
6. **Text arrives once.** `typeText('cua171 안녕 e\u0301 🙂\nline2')` (a combining acute after e) returns success and reads back exactly in gedit, gnome-text-editor and the harness textarea page in Chrome; a single-line Unicode string typed into Chrome's address bar returns success and reads back exactly; `clipboard_write` of a snapshot into gedit succeeds; the accessibility-bus trace of the whole run contains no `PasteText`, `InsertText` or `SetTextContents` call. Paste's safety cases hold: a preselected range is replaced by the text; a focus change between observation and dispatch is refused with nothing sent, and combined with an external clipboard takeover it leaves the new owner's contents intact; two sessions pasting distinct markers at once each land once in their own field, and no stale clipboard is restored; two engines acquiring the lock in a tight loop and pasting distinct markers never cross-deliver; a page that handles no paste and a requestor that stalls an INCR transfer each get the unconfirmed answer within the transfer bounds; a target that applies the paste after the deadline answers unconfirmed, never with a sentence that permits a retry, and holds the text once; a paste into a field whose Text cannot be read returns the unconfirmed sentence and the field contains the text once.
7. **Identity and minimized windows.** With three Chrome windows of the same title and size, reading the first returns its full tree or the duplicate-windows sentence, never a one-node X11 tree with `at_spi` content missing. A minimized gedit window is listed with `minimized: true`; a gedit window bound through the real facade and then minimized still reads (`getAXState` returns its tree), and its screenshot answers `Screenshot unavailable for window <id>.`.
8. **Device mode.** For a family M0 lists as ignoring background input, a click in `shared` mode returns the "does not accept background input" sentence with the witness unchanged, and in `dedicated` mode takes effect with the window activated.
9. **Install.** On a fresh `CUA_HOME` on x86-64 and arm64, `cua install --engine` fetches the pinned asset, verifies its hash, and `cua doctor` passes the engine row with the pinned version; `file $CUA_HOME/engine/linux/cua-engine` says statically linked.
10. **Suites.** `scripts/repl-parity.mjs --suite native` passes on the `cua` engine lane with the two text cases as positive cases (from M2; in M1b under the temporary candidate expectations), and its diff against the vendor engine lane shows only declared differences; `scripts/native-baseline.mjs compare --engines` between the two Linux lanes prints VERDICT: PASS with no cua median above the vendor's; both record that the requested engine was the trusted worker's child; `scripts/accept/linux-native.mjs` passes with `CUA_NATIVE_ENGINE=cua`; `npm test` and the `engine-linux` gate pass.
11. **Both architectures.** Items 2–8 hold on the arm64 VM against that machine's vendor builds.
12. **Vendor-free runtime (M6a).** On an empty home after `cua install`, and on an upgraded home whose vendor tree is then made unavailable, a computer session (items 1 and 6) and a browser-only session work; with the vendor tree unavailable, only `CUA_NATIVE_ENGINE=vendor` is refused, naming `cua install`.
13. **Retirement (M6b).** After the soak, `cua install` on Linux downloads no ChatGPT package, `cua doctor` lists no vendor runtime rows on Linux, `CUA_NATIVE_ENGINE=vendor` is refused as `engine_retired`, and items 1–10 still hold, the facade suites' vendor lanes cited from M5's sitting (the vendor engine is no longer selectable).

## Constraints binding every milestone

- Dependencies of `native/linux-engine/`: only crates OpenAI's helper links (R/A §2.2; the owner's 2026-10-28 ruling), at those versions or later compatible releases, each listed in `native/linux-engine/Cargo.toml` with the version the vendor shipped noted beside it; any other crate needs the owner's yes first.
- No code from the vendor or from projects surveyed in `C-linux-2026.md`: behaviour, constants and call patterns from `R/A` and `R/F`, never translated code. Decompiled output stays on the VM.
- `EditableText.PasteText`, `InsertText` and `SetTextContents` are never called.
- The facade, `docs/cua-api/core.md` and the setup method list stay unchanged, with one exception in the facade: M3 adds the truncation line to `src/cua-api/bind-linux-app.mjs`, with its tests. M5 documents the device mode and the `minimized` field in `docs/cua-api/core.md`.
- Live GUI work runs on the #171 VM or the arm64 acceptance VM only, and so do the harness controllers (through each VM's own alias); never on the owner's MacBook (its compute is the MAWS app's) or the Mac mini. Builds and tests run on the VM or in CI.
- Nothing logs accessibility text, titles or screenshots of windows the harness does not own; the harness closes every window it opens.
- Each milestone lands as its own pull request to `main` after a `doperpowers:reviewer-high` review and `MERGEABLE`. Its work is committed before it is gated (`ci-gate` tests the committed HEAD), and the gated SHA is recorded in the milestone's evidence and pull request. A milestone that changes engine behaviour or the wire ends with its release in the same pull request (Distribution). The spec's Progress, Surprises and Decision Log are current at every stopping point.
- A plugin bump (`.claude-plugin/plugin.json`, minor) accompanies every plugin-visible change: M1b (selection on Linux), M2 and M4 (their engine releases change what `cua install` installs), M3 (cua's service), M5 (the default), M6a (the runtime), M6b (install).

## Plan of Work

### M0 — Behaviour specification, speed spike, wire fixtures, application-family matrix

A prototyping milestone whose deliverable is knowledge. It answers three questions before the engine is built: can a Rust read of the vendor's exact tree beat the vendor, and by how much with each fetching strategy; what do background input and capture actually need (retention, waits, key pacing); and which application families ignore the background route.

**Behaviour specification.** `docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`: the consolidated rules M1a builds against, each tagged with its source in `R/A` or `R/F` (the macOS `sky-behaviour.md` is the shape): window association, the per-element field set, preorder admission and limits, the visible-table path, every command's validation and error sentence, the chord grammar and its Shift rules, the background and desktop routes, activation, scroll and drag arithmetic, clipboard formats, handles and the persistent owner, how the vendor acquires `SKY_CLIPBOARD_LOCK` (`SelectionReader::lock`), screenshot encoding.

**Spike.** `native/linux-engine/` as a minimal package: the wire, cua's D-Bus client, `list_windows`, `get_window_state` (tree, with `include_screenshot`), `press_key` and `click` on the background route. Three tree variants behind a `--tree sequential|frontier|cache` flag: `sequential` reproduces the vendor's calls one by one (its job is to show the harness reproduces the vendor's numbers); `frontier` sends the same per-element calls along the preorder frontier on a persistent connection, inside the admission window, with `--window-calls <W>` and `--window-bytes <R>` (the candidate main path); `cache` seeds from `GetItems` as an experiment only, recording which applications answer it, with which signature, and where its output differs from `sequential`. Two retention variants for input behind `--retention per-request|session|none`, and a `--settle-ms` for the post-`RedirectWindow` wait. Run a first cut of the differential harness (gedit and Chrome scenes, both vendor builds, engines in fresh-process blocks) over all variants, and `frontier` also on a first over-budget page; from those runs M0 chooses W and R (with the per-call reservation, Observation) and fixes the constant by which cua's bus calls on the over-budget scene may exceed the vendor's. Beside the over-budget page, a single-reply-over-R case: a text node whose text exceeds 4 MiB, read by `frontier` exactly as `sequential` reads it.

**Wire fixtures.** `scripts/linux-engine-diff/fixtures/wire/` holds the vendor's answers for each kind of `output`, taken from its recorded wire (R/F §13, the traces' `wire.jsonl`): an object (`get_window_state`), an array (`list_windows`), a string (`clipboard_read`'s handle) and null (`click`). The harness's vendor-JS adapter replays each through OpenAI's JavaScript client against a stub engine and checks what the wrapper returns, and does the same with the spike's answers for the commands it implements.

**Matrix.** On the VM, install the families' representative applications (GTK3 gedit, GTK4 gnome-text-editor, Qt6 `kate` or `qtcreator`, Firefox, an Electron app (cua's Electron fixture from the macOS harness, built for Linux), LibreOffice Writer, xterm) and record, for each, whether the vendor's background click, key and `type_text` take effect, with the witness. Record each family's `Application.ToolkitName`.

**Promote or discard.** Promote when the wire fixtures pass through the vendor JavaScript, `frontier` returns the vendor's node set exactly on both scenes with a median at or below the bar, and a background `press_key` with `session` retention (or `none`) has an unchanged witness, a verified effect and a median at or below the bar. If `frontier` does not beat the bar on the tree read within three tuning iterations, the spike is discarded as a shape, its traces kept, and the fork goes to the owner with `cache`'s measurements beside it (adopting `cache` is M4's question, under the rules in Observation). The verdict, the numbers and the matrix go to Surprises & Discoveries; the design's input and retention paragraphs are revised from them with a Decision Log entry.

What it does not touch: `src/`, install, CI. What it proves: none of the acceptance; it fixes the numbers and the families list M1a–M4 are measured against.

### M1a — Engine core, wire-compatible, with the differential harness

What exists at its end: `cua-engine` answers all 21 commands with the vendor's outputs on the scenes, faster where M0 showed it can be, and the differential harness runs the full operation set against both vendor builds, with the continuous witness, the X request audit, the stub engine's negative check, block isolation, the over-budget scene and the retention cases. Behind OpenAI's own JavaScript (the harness's `--via vendor-js` mode, `OAI_SKY_LINUX_BIN` set in the harness's own process), every operation answers as it does over the wire; that is M1a's only facade-level proof, because `cua serve` cannot select another engine until M1b.

Touches: `native/linux-engine/` (all modules above; `frontier`, with M0's W and R, becomes the only tree path, and `sequential` and `cache` leave the engine), `scripts/linux-engine-diff.mjs` and `scripts/linux-engine-diff/` (the witness, the audit, the stub engine, the scenes), `docs/evidence/2026-10-28-own-linux-engine/m1a/`.

Decisions: behaviour as in `sky-linux-behaviour.md`, including the vendor's defects that M2 and M4 own (the identity fallback, minimized omission and refusal, `PasteText` for text: in M1a `type_text` and `clipboard_write` answer `type_text is not available in this engine build` rather than reproduce a known failure, a declared deviation until M2). Keys keep the vendor's chord semantics exactly, with the mixed-case shortcut and held-chord tests (Input, Keys). Admission is the vendor's preorder and speculation stays inside it, checked on the over-budget scene by exact retained native ids and the bus-call bound. Error sentences are the vendor's where `R/A` lists them, else cua's own and bounded. The harness's deviations list starts here.

Does not touch: `src/`, the service, install, selection.

Proves: acceptance 2–5 on x86-64 for every command except text and clipboard.

### M1b — Distribution and selection

What exists at its end: `cua install --engine` on Linux installs a pinned, CI-built static engine, the first release; `CUA_NATIVE_ENGINE=cua` runs a Linux computer session on it behind the vendor service; `cua doctor` shows it; the facade suites run on either engine; the `engine-linux` gate runs on every pull request.

Touches: `.github/workflows/linux-engine.yml`, `runtime/engine/linux-engine.json`, `scripts/linux-engine-pin.mjs`, `native/linux-engine/Cargo.toml` (version 0.1.0), `src/runtime/launch.mjs` (`nativeEngineFor` on Linux, `CUA_LINUX_ENGINE_BIN`), `src/runtime/install.mjs`, `src/runtime/manifest.mjs` (the engine path as an owned path, not a vendor layout key), `src/runtime/sandbox.mjs` (protected path), `src/runtime/doctor-engine.mjs`, `src/cli.mjs` (`cua install --engine` and `cua engine build|status` on Linux), `scripts/repl-parity/selection.mjs`, the facade harnesses (below), `.github/ci-kit.yml`, `.claude-plugin/plugin.json`, tests beside each.

The facade harnesses' Linux engine lanes:

- `scripts/repl-parity.mjs` and `scripts/repl-parity/{native,topology}.mjs`: the Linux native suite accepts `--engine vendor|cua` with `--host cua`, and `--engine-bin <absolute path on the device>` with `--engine cua`, and forwards them to the device's serve as `CUA_NATIVE_ENGINE` and `CUA_LINUX_ENGINE_BIN`; `meta.json` records the engine; `diff` pairs runs by engine, against the new `scripts/repl-parity/expected/native-linux.json`.
- Temporary candidate expectations for the two native text cases on the `cua` engine, in `scripts/repl-parity/expected/native-linux.json` and its diff declarations: the known refusal sentence `type_text is not available in this engine build`, the text unchanged (the cases record whether their marker reached the text) and the window alive. The run's assessment accepts exactly these for exactly those two cases, so M1b's full-suite run passes honestly; no other candidate failure is waived, and M2 replaces them with the positive assertions.
- `scripts/repl-parity/vendor-defects.mjs` and `test/repl-parity/vendor-defects.json`: a declaration names the engine it was observed on (on Linux the host is always cua's). The current text-case oracles encode arm64's outcome, so the vendor engine on the x64 VM fails them differently (Surprises); that failure is declared here, and M2 replaces the oracles.
- `scripts/repl-parity/devices.mjs` declares `cua-171` (the #171 VM) and `cua-171-arm64` (M5's arm64 VM), Linux, each comment naming the device's preparation: an ssh alias of that name on the VM reaching the VM itself, so the controller runs in the VM's worktree as `hosted-macos` reaches itself; one ready bound Chrome profile, which repl-parity's prepare requires; gedit, gnome-text-editor and zenity installed (Concrete Steps has the commands).
- `scripts/native-baseline.mjs` and `scripts/native-baseline/{engine,remote,linux,compare}.mjs`: `--engine vendor|cua` (and `--engine-bin`) on Linux computer runs, with no approved engine (that is macOS's); the Linux lanes in `compare --engines` (`--host cua --engine vendor` against `--host cua --engine cua`, the engine the one permitted difference, from M3 the service too).
- Both harnesses check which engine answered from the trusted worker's child executable (The facade suites).

Decisions: the workflow is dispatched on the M1b pull request's reviewed head commit; its first release is `linux-engine-v0.1.0`; `scripts/linux-engine-pin.mjs` writes the pin from that release's assets after `gh attestation verify` of both. The `engine-linux` gate covers the build, the unit tests, and the live tree read, background key and screenshot under xvfb; paste comes in M2. The default stays `vendor`.

Does not touch: the service, the facade, the text route.

Proves: acceptance 1 (engine row), 9, and 10's facade suites on both engine lanes, the text cases under the temporary candidate expectations.

### M2 — Text and clipboard

What exists at its end: `type_text`, `clipboard_read`, `clipboard_write`, `clipboard_release` and `type_characters` work through the one verified paste route on gedit, gnome-text-editor and Chrome, with the three outcomes, under the clipboard lock; the engine is released.

Touches: `native/linux-engine/src/{clipboard,atspi,x11}`, `native/linux-engine/tests/` (the gate's paste assertions), the harness's text scenes and effects (the textarea page, gnome-text-editor, the address bar case, the late-applying page, the ignored-paste page, the stalled-INCR requestor, the concurrent-paste and lock-contention cases), `test/repl-parity/scenarios/native.mjs` (the two text cases become positive: text inserted once, window alive) with the vendor engine's failure of them declared in `test/repl-parity/vendor-defects.json`, and M1b's temporary candidate expectations removed from `scripts/repl-parity/expected/native-linux.json`, `scripts/accept/linux-native.mjs` (types with `typeText`), the release (version, pin), `.claude-plugin/plugin.json`, evidence `m2/`.

Decisions: the design's six steps, the guarded cleanup, the serving generations, the snapshot bounds (500 ms for `TARGETS`, 500 ms per format's first response, 2 s between INCR chunks, 5 s overall), the transfer bounds (500 ms to the first request, 2 s between INCR chunks, 10 s overall) and the atomic clipboard lock; the 20 ms poll and 2 s confirmation deadline; the sentences `requested field or selection changed before dispatch; nothing was sent`, `clipboard busy` and the unconfirmed `Paste was sent once and could not be confirmed; read the field before retrying`; conditional clipboard restore. Text over 64 MiB is refused before anything is sent. Tests: a preselected range is replaced; a focus change between observation and dispatch is refused, and combined with an external clipboard takeover it leaves the new owner's contents intact; two sessions paste distinct markers at once with no cross-delivery and no stale restore; two engines acquire the lock in a tight loop and paste distinct markers, under adversarial interleavings, with no cross-delivery; a harness page whose paste handler inserts the text 3 s after the paste event gets the unconfirmed answer, never one that permits a retry; a page that handles no paste and a requestor that requests and then stops acknowledging INCR chunks each get the unconfirmed answer within the bounds, the request queue free again after them; a requestor that delays its `ConvertSelection` itself past 500 ms is never served the snapshot as that paste, and the result is unconfirmed; a silent clipboard owner and an owner that stalls mid-INCR during the snapshot each end the request with nothing sent and both locks released.

Proves: acceptance 6, and 2–5 for the text and clipboard commands.

### M3 — cua's own Linux service, the device mode and the capability report

What exists at its end: with `CUA_NATIVE_ENGINE=cua`, no vendor JavaScript is loaded for the Linux computer surface; `src/services/engine/linux/` drives `cua-engine` and refuses one older than `MIN_ENGINE_VERSION`; `capabilities` is answered and shown; the device mode is read and passed; families listed by M0 behave per mode; the facade renders the truncation line; the engine is released.

Touches: `src/services/engine/linux/` (new), `src/runtime/launch.mjs` (`CUA_SKY_SERVICE` for the `cua` selection on Linux), `src/services/sky.mjs` (only if loading the new module needs it), `src/cua-api/bind-linux-app.mjs` (the truncation line), `test/cua-api/{facade.test.mjs,facade-scenarios.mjs,sky.test.mjs}`, `native/linux-engine/src/{caps,families}.rs`, the `--desktop` flag, `deploy/cloud-vm/cua-provision.sh` (`"desktop": "dedicated"`), `src/runtime/doctor-engine.mjs`, `test/` (service unit tests with a fake engine speaking the wire), the release, `.claude-plugin/plugin.json`.

Decisions: the service's parts as in the design; numbering identical to the vendor's (the harness compares rendered trees from both services on the same engine); `MIN_ENGINE_VERSION` set to M3's release, whose `capabilities` and `--desktop` the service needs. The service passes `truncated` through and the facade prints the line; its tests cover `getAXState`, the combined observation, `emit: false` and a state without the field, and the truncated scenarios join `test/cua-api/facade-scenarios.mjs` as a declared deliberate difference, so the vendor differential (`facade-vendor.test.mjs`) records it. The facade's other tests stay unchanged and pass.

Proves: acceptance 1 (no vendor process or module), 8; 2 rerun through the facade with `scripts/native-baseline.mjs compare --engines`, now with cua's service on the cua lane.

### M4 — The measured improvements

What exists at its end: the deviations the design lists beyond M1a–M3, each measured: duplicate-window resolution or its sentence, minimized windows listed and readable, truncation reported, the remaining fixed waits replaced by M0's measured conditions, the action settle reduced where effects still verify, key pacing removed where M0 showed toolkits keep up; the engine is released.

Touches: `native/linux-engine/src/{atspi,x11}`, `src/services/engine/linux/settle.mjs`, the harness's identity, minimized and over-budget scenes, `test/repl-parity/scenarios/native.mjs` (a minimized-window case: bind gedit, minimize it, `getAXState`, which the vendor lane fails as declared), `scripts/linux-engine-diff/deviations.mjs` (the `minimized` listing), the release, `.claude-plugin/plugin.json`, evidence `m4/`.

Decisions: a wait is shortened only when the harness's effect checks pass on every family of the matrix at the new value, 30 consecutive runs; otherwise it stays at the vendor's value and the evidence says why. The over-budget fixture, read through the facade, shows the truncation line with the counts the engine reported. `Cache.GetItems` is adopted only under the rules in Observation, on evidence that it reproduces the sequential output exactly on menus, Qt and changing trees; otherwise the per-element read stays the only path and the evidence says why.

Proves: acceptance 3 (with the improvements), 4, 7.

### M5 — Acceptance on both architectures, docs, the default

What exists at its end: the acceptance section run as written on x86-64 and arm64, on the pinned release, with evidence; `README.md` and `docs/cua-api/core.md` describe the Linux engine, the device mode, the capability report and the `minimized` field; the owner's decision on the default recorded; on yes, the default is `cua` on Linux and the plugin bumped.

Touches: `docs/evidence/2026-10-28-own-linux-engine/m5/`, `README.md`, `docs/cua-api/core.md`, `src/runtime/launch.mjs` (`DEFAULT_NATIVE_ENGINE` on Linux), `.claude-plugin/plugin.json`.

Decisions: every item runs on the exact pinned release assets that `cua install` fetches on each architecture, with no `CUA_LINUX_ENGINE_BIN`, `--engine-bin` or local build; an engine fix found here ends with its own release and the affected items run again on it. The arm64 VM is a devcloud Hetzner `cax31` in an EU location (Hetzner's arm64 types were EU-only at this writing; `devcloud vm up --dry-run` checks), provisioned with `deploy/cloud-vm/cua-provision.sh`, prepared as the device `cua-171-arm64`, deleted after the run. The default flips only on the owner's word.

Proves: acceptance 1–11.

### M6a — A vendor-free Linux runtime

What exists at its end: a Linux session, computer or browser-only, resolves and launches from cua's own parts with no vendor tree read, as "The vendor-free runtime (M6a)" describes; the vendor tree remains only for `CUA_NATIVE_ENGINE=vendor`. It may start once M5 lands; it removes nothing, so the soak's rollback still works.

Touches: `runtime/modules/` and `package.json` (`classic-level`) if #117 M6 has not landed, the Linux runtime record beside `runtime/releases/`, `src/runtime/manifest.mjs`, `src/mcp/connection.mjs`, `src/runtime/launch.mjs`, `src/runtime/install.mjs`, `src/runtime/layout.mjs` (the pointer's migration), `src/runtime/checks.mjs` and doctor, tests (the empty home and the upgraded home whose vendor tree is unavailable), `.claude-plugin/plugin.json`.

Interfaces: consumes #117's `ModuleTree` (or produces it, if it has not landed). Proves: acceptance 12.

### M6b — Retirement of the vendor's Linux package

After a soak the owner ends (no `CUA_NATIVE_ENGINE=vendor` needed on Linux since M5), the deletion "Retirement (M6b)" describes: acquisition, pins, layout keys, doctor rows and the harness patterns go, and `CUA_NATIVE_ENGINE=vendor` on Linux is refused as `engine_retired`. Touches: `src/runtime/install.mjs`, `manifest.mjs`, `checks.mjs`, doctor, `launch.mjs`, `runtime/releases/26.928.40906-linux-{x64,arm64}.json`, `scripts/native-baseline/*`, `scripts/probe/lib.mjs`, `scripts/sandbox-probe/linux-probes.mjs`, `scripts/repl-parity/*` (the Linux vendor lanes), tests, `.claude-plugin/plugin.json`. Proves acceptance 13.

## Concrete Steps

Working directory is the worktree, `$WT` (`~/Developer/GitHub/cua-171` on the #171 VM; from the MacBook, `devcloud vm ssh dc-linux171-1e68` opens a shell there), in the X session's environment, unless stated. A command that needs what a milestone adds is marked with that milestone and does not work before it lands. Every block is bash, checked with `bash -n`; it has no placeholders, only the variables below.

**Variables**, set once per shell. `MILESTONE` and `BRANCH` name the milestone being worked (`m0`, `m1a`, `m1b`, `m2`, `m3`, `m4`, `m5`); on the arm64 VM, `DEVICE=cua-171-arm64`.

```bash
DEVICE=cua-171
MILESTONE=m1a
BRANCH=feat/171-linux-engine
WT="$HOME/Developer/GitHub/cua-171"
DATE="$(date -u +%Y%m%d)"
ARCH="$(node -p process.arch)"
OUT="docs/evidence/2026-10-28-own-linux-engine/$MILESTONE"
if [ "$MILESTONE" = m5 ]; then OUT="$OUT/$ARCH"; fi
MSG_FILE="$HOME/.local/share/cua-171/commit-msg.txt"
SKY="$HOME/.local/share/cua/runtimes/26.928.40906-linux-$ARCH/cua_node/lib/node_modules/@oai/sky"
VENDOR="$SKY/bin/linux/sky_linux_$ARCH"
NEWEST="$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_$ARCH"
BUILT="$WT/native/linux-engine/target/release/cua-engine"
INSTALLED="$HOME/.local/share/cua/engine/linux/cua-engine"
ENGINE_BIN=()   # M1b, before its release exists: ENGINE_BIN=(--engine-bin "$BUILT")
case "$MILESTONE" in
  m0) SCENES=gedit,chrome ;;
  m1a|m1b) SCENES=gedit,chrome,over-budget,retention ;;
  *) SCENES=gedit,chrome,over-budget,retention,chrome-textarea,chrome-address-bar,gnome-text-editor ;;
esac
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
```

**Once per VM.** ci-gate is not installed on the VM; it needs only Node 22+ and the authenticated `gh`, both present there. From M1b, the device's preparation for the facade harnesses: an ssh alias reaching the VM itself, and one ready bound Chrome profile, which repl-parity's prepare requires (the #171 VM has `me`; elsewhere `cua profiles add me --chrome-profile Default`, then `cua profiles bind me`).

```bash
git clone https://github.com/SSFSKIM/ci-kit "$HOME/Developer/GitHub/ci-kit"
"$HOME/Developer/GitHub/ci-kit/install.sh"
# M1b on
ssh-keygen -t ed25519 -N '' -C "$DEVICE" -f "$HOME/.ssh/${DEVICE}_ed25519"
cat "$HOME/.ssh/${DEVICE}_ed25519.pub" >> "$HOME/.ssh/authorized_keys"
printf 'Host %s\n    HostName 127.0.0.1\n    User %s\n    IdentityFile %s\n    IdentitiesOnly yes\n' "$DEVICE" "$(id -un)" "$HOME/.ssh/${DEVICE}_ed25519" >> "$HOME/.ssh/config"
ssh-keyscan -t ed25519 127.0.0.1 >> "$HOME/.ssh/known_hosts"
ssh -o BatchMode=yes "$DEVICE" true
# expected: exit 0 without a prompt
cua profiles list
# expected: one ready profile
```

**At the start of each milestone**, the worktree of its branch (an earlier milestone's worktree is removed first).

```bash
if [ -d "$WT" ]; then git -C "$HOME/Developer/GitHub/cua" worktree remove "$WT"; fi
git -C "$HOME/Developer/GitHub/cua" fetch
git -C "$HOME/Developer/GitHub/cua" worktree add "$WT" "$BRANCH"
cd "$WT" && npm ci
```

**Every stopping point:** commit, push, gate the committed HEAD. Write the commit message to `$MSG_FILE` first; it is never part of a block. Push before preparing or releasing, since both check commits out from origin.

```bash
git -C "$WT" add -A
git -C "$WT" commit -F "$MSG_FILE"
git -C "$WT" push -u origin "$BRANCH"
ci-gate "$WT"
# expected: GREEN; the tested SHA, printed next, goes into "$OUT/README.md" and the pull request
git -C "$WT" rev-parse HEAD
```

**Build, smoke and test the engine** (M0 on; the tests are what the CI gate runs).

```bash
cargo build --release --manifest-path native/linux-engine/Cargo.toml
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | "$BUILT" server
# expected: one line {"id":1,"ok":true,"output":[{"id":...,"app":"org.gnome.gedit",...},...]}: output is a JSON array, not a string
cargo test --manifest-path native/linux-engine/Cargo.toml
xvfb-run -a dbus-run-session -- cargo test --manifest-path native/linux-engine/Cargo.toml --features live -- --test-threads 1
```

**The wire fixtures** through OpenAI's JavaScript client (M0), then **the differential harness** (M0's first cut, M1a's full set, M2's text scenes, by `SCENES`; M0's matrix families join by name once M0 lists them).

```bash
node scripts/linux-engine-diff.mjs --check-wire --vendor-js "$SKY"
# expected: one PASS line per output kind (object, array, string, null), for the vendor's recorded answers and the spike's
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$BUILT" --scene "$SCENES" --ops all --out "$OUT/diff"
# expected: the stub engine failed by the witness and the audit, then summary.md with one row per operation and scene:
#           pinned / newest / cua cold and warm medians, calls, witness, audit, effect, verdict PASS
```

**Release**, ending M1b, M2, M3 and M4 (M1b adds the workflow and the pin script). The reviewed head commit carries the bumped version in `native/linux-engine/Cargo.toml` and is pushed. Afterwards the pin is committed to the same pull request through the stopping-point block (from M3 with `MIN_ENGINE_VERSION` raised where needed).

```bash
VERSION="$(cargo metadata --no-deps --format-version 1 --manifest-path native/linux-engine/Cargo.toml | jq -r '.packages[] | select(.name == "cua-linux-engine") | .version')"
HEAD_SHA="$(git rev-parse HEAD)"
gh workflow run linux-engine.yml --ref "$BRANCH" -f commit="$HEAD_SHA"
sleep 15   # until the dispatched run is listed
RUN_ID="$(gh run list --workflow linux-engine.yml --commit "$HEAD_SHA" --event workflow_dispatch --limit 1 --json databaseId -q '.[0].databaseId')"
gh run watch "$RUN_ID" --exit-status
node scripts/linux-engine-pin.mjs "linux-engine-v$VERSION"
# expected: both assets pass gh attestation verify, and runtime/engine/linux-engine.json names their URLs and SHA-256s
node bin/cua.mjs install --engine
node bin/cua.mjs doctor
# expected: the engine row passes with VERSION and the pinned hash
```

**The facade suites** (M1b on; M1b adds `--engine` and `--engine-bin` on Linux, the engine-answered check, diff by engine, the expected file with its temporary candidate expectations, and the Linux lanes of `compare --engines`). The native baseline refuses while any gedit runs, so the block first ends the research fixture on `scratch.txt`.

```bash
SHA="$(git rev-parse HEAD)"
EXPERIMENT="171-$MILESTONE-$DATE"
mkdir -p "$OUT/parity"
node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$SHA"
node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine vendor --out "$OUT/parity/vendor"
node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine cua "${ENGINE_BIN[@]}" --out "$OUT/parity/cua"
node scripts/repl-parity.mjs diff "$OUT/parity/vendor" "$OUT/parity/cua" --expected scripts/repl-parity/expected/native-linux.json
node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE"
# expected: the cua run prints assertions PASS; the vendor run PASS or RECORDED_VENDOR_DEFECT (the declared text cases);
#           the diff report is ok with only the declared differences
pkill -f "gedit --standalone $HOME/.local/share/cua-171/tools/scratch.txt" || true
node scripts/native-baseline.mjs prepare --device "$DEVICE" --commit "$SHA"
for n in 1 2 3; do
  node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --host cua --engine vendor --out "$OUT/baseline/cv/run-$n"
  node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --host cua --engine cua "${ENGINE_BIN[@]}" --out "$OUT/baseline/cc/run-$n"
done
node scripts/native-baseline.mjs summary "$OUT/baseline/cv"
node scripts/native-baseline.mjs summary "$OUT/baseline/cc"
node scripts/native-baseline.mjs compare --engines "$OUT/baseline/cv" "$OUT/baseline/cc" --out "$OUT/baseline/engines.md"
# expected: VERDICT: PASS and the per-operation table, no cua median above the vendor's
CUA_NATIVE_ENGINE=cua node scripts/accept/linux-native.mjs
# expected: a JSON report with every step PASS (the VM's default home, its engine from node bin/cua.mjs install --engine)
```

**M5**, on each VM, on the pinned release only: `ENGINE_BIN` stays empty, and there is no `CUA_LINUX_ENGINE_BIN` and no local build. On the arm64 VM the newest arm64 build is extracted to the `NEWEST` path first, its package checked as R/F §0 records for x64. After this block, the facade-suites block runs as written (item 10).

```bash
FRESH="$(mktemp -d)"
CUA_HOME="$FRESH" node bin/cua.mjs install --engine
CUA_HOME="$FRESH" node bin/cua.mjs doctor
file "$FRESH/engine/linux/cua-engine"
# expected (item 9): the engine row passes with the pinned version; file says statically linked
node bin/cua.mjs install --engine
node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$INSTALLED" --scene "$SCENES" --ops all --out "$OUT/diff"
# expected (items 2-8): as for M1a, every verdict PASS
```

## Interfaces and Dependencies

`native/linux-engine/` (Cargo package `cua-linux-engine`, binary `cua-engine`), Rust 1.94.1 (`rust-toolchain.toml`), edition 2024; its version in `Cargo.toml` is 0.1.0 at M1b's release and the next minor at each later release. Dependencies as in the constraints.

The wire (`src/wire.rs`): requests and responses as in R/A §1.6; `output` is a JSON value (an object, an array, a string or null), never a JSON-encoded string. Commands: the pinned 20 (R/A §1.2) with R/A §1.3's inputs, `type_characters {window, text}` → number of characters sent, and `capabilities {}` → the object in the design. `get_window_state` output gains the optional `truncated: {nodes: u32, depth: u32, failed: u32}`; a `list_windows` Window gains the optional `minimized: true` (M4). The CLI: `cua-engine server [--mouse-size-px <n>] [--desktop shared|dedicated]`; `cua-engine --version` prints `cua-engine <version> (<git sha>)`.

The service (`src/services/engine/linux/service.mjs`): `export async function handleRpc(message, nodeRepl)` with the vendor service's messages (R/A §1.2), so `src/services/sky.mjs` loads it unchanged. `src/services/engine/linux/client.mjs` exports `MIN_ENGINE_VERSION`, checked against `cua-engine --version` before the first request.

The facade (`src/cua-api/bind-linux-app.mjs`, M3): a rendered state whose WindowState carries `truncated` ends with the line `Accessibility tree truncated: <n> elements not shown (<reason>)`.

Selection (`src/runtime/launch.mjs`): `nativeEngineFor` resolves on Linux with the same precedence, reasons and refusals it applies on macOS (its existing parameters, plus the platform), and its Linux result carries the engine binary's path; `CUA_LINUX_ENGINE_BIN` is read only when the engine is `cua`. The device mode resolves beside it: `CUA_DESKTOP_MODE`, else `engine.json`'s `desktop`, else `shared`; any other value is refused as `invalid_setting`.

Pins (`runtime/engine/linux-engine.json`): `{version, release, assets: {x64: {url, sha256}, arm64: {url, sha256}}}`, written by `scripts/linux-engine-pin.mjs <release tag>` after `gh attestation verify` of both assets. The release workflow (`.github/workflows/linux-engine.yml`): `workflow_dispatch` with `commit` (40 hex digits).

The harness (`scripts/linux-engine-diff.mjs`): `--vendor <bin> --newest <bin> --cua <bin> --scene <list> --ops <list|all> --out <dir> [--blocks 3] [--samples-tree 7] [--samples-input 5] [--via vendor-js --vendor-js <@oai/sky directory>]`, and `--check-wire --vendor-js <@oai/sky directory>` (M0); exit 0 when the stub engine failed the witness and the audit and every verdict passes. Scenes: `gedit`, `chrome`, `over-budget`, `retention` (M1a), `chrome-textarea`, `chrome-address-bar`, `gnome-text-editor` (M2), and the matrix families by name; the paste safety cases (the late-applying and ignored-paste pages, the stalled-INCR requestor, concurrent pastes, lock contention) run as operations of the M2 scenes. The over-budget scene's bus-call constant, like the tree read's window (W calls, R bytes), is fixed by M0. `scripts/linux-engine-diff/deviations.mjs` exports `[{op, scene?, field, reason, section}]`.

The facade harnesses (M1b): `scripts/repl-parity.mjs run --device <Linux device> --suite native --host cua --engine vendor|cua [--engine-bin <absolute path on the device>] --out <dir>` and `diff <vendor-dir> <cua-dir> --expected scripts/repl-parity/expected/native-linux.json` (which carries M1b's temporary candidate expectations for the two text cases until M2); `scripts/native-baseline.mjs run --device <Linux device> --experiment <id> --host cua --engine vendor|cua [--engine-bin <absolute path on the device>] --out <dir>/run-<n>` and `compare --engines <cv-dir> <cc-dir>`; the devices `cua-171` and `cua-171-arm64` in `scripts/repl-parity/devices.mjs`.

The Linux runtime record (M6a): beside the archive pins, parsed as strictly; it names the ModuleTree's lock hash, the managed Node's version, the sandbox helper's upstream tag and the engine's version, and its `release` is derived from the four. `locateRuntime` and `resolveRuntime` return it with the paths `buildLaunch` needs (the module tree, the engine, cua's service). `ModuleTree` is #117's (its Interfaces): the packages cells import and `classic-level`, under `$CUA_HOME/modules/<lock hash>/`, named to the own host as `CUA_REPL_NODE_MODULE_DIRS`.

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
- Observation: the native suite's two text-case oracles accept only arm64's outcomes (the NoReply or EAGAIN error, then the window's exit); on x64 the pinned vendor answers `editable Paste did not insert text` and gedit survives, so the vendor engine lane fails them on the #171 VM until M1b declares that failure.
  Evidence: R/A §3.3; `test/repl-parity/scenarios/native.mjs` (the `app/typetext` and `app/paste` cases).
- Observation (M0.1): the behaviour specification (`docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`) corrects the research in places M1a depends on: `AT_SPI_BUS` is a root-window X11 property, not an environment variable (§19, correcting R/A §2.4); association chooses the frame by Name among every child of the application, with no role filter (§4, correcting R/F §2.1); every association failure in an observation becomes the X11 fallback, and the identity sentences reach callers only through element requests (§4); a window's `app` in `list_windows` is `_GTK_APPLICATION_ID`, the class or `x11:<id>`, never a desktop id (§3); each association also runs a full `list_windows` (about 300 X requests, 50 ms), a hidden cost of every vendor observation.
  Evidence: `sky-linux-behaviour.md` §3, §4, §19, each with its function address or trace.
- Observation (M0.1): the vendor's `clipboard_write` leaves the written snapshot on CLIPBOARD in both builds; neither build restores after it. Its type_text restore takes ownership again (or gives an empty CLIPBOARD up) conditionally, and it always clicks a named element, then restores caret and selection through AT-SPI.
  Evidence: `sky-linux-behaviour.md` §7.4, §13.1, §13.5.
- Observation (M0.1): two of the behaviour reading's sub-readers (the dispatcher and wire, the text flow) were stopped by a safety classifier mid-report; what only they could settle is open in the behaviour specification (§22.11–13: unparsable request lines and the `restart` classes, unknown input fields, the pinned text routes' order and menu-label rule), for M0.3's wire probes to record.
  Evidence: `.doperpowers/sde/…/task-1-report.md` (local); `sky-linux-behaviour.md` §22.

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

- Decision (2026-10-28, review round 1): two independent reviews (design; buildability) raised 18 findings, one of them in both; the design session resolved each, and this revision applies the resolutions to the design, acceptance, milestones, Concrete Steps and Interfaces. What moved, with its reason and the alternative it rejects:
  - Keys keep the vendor's chord semantics, which reverses the authoring call: `"Z"` produces z without Shift and literal case goes through `type_characters` and `type_text`. Adding Shift for an uppercase keysym would have turned `Ctrl+Z` (undo) into `Ctrl+Shift+Z` (redo) and `Ctrl+W` into `Ctrl+Shift+W` for every caller that writes shortcuts with capitals. Rejected: the uppercase-adds-Shift deviation.
  - Paste observes before it acts: it reads focus, caret and selection first, clicks only an element that lacks focus, and revalidates element, selection, caret and desktop focus immediately before dispatch, refusing with nothing sent on any change. Rejected: always clicking the named element first, which moves a caret and collapses a selection the caller made.
  - A per-display, cross-engine clipboard lock (`CUA_CLIPBOARD_LOCK`, and the vendor's `SKY_CLIPBOARD_LOCK` for comparisons) holds from the snapshot to the conditional restore, 5 s to acquire, else `clipboard busy`; `clipboard_read` takes it too, since its Copy changes the owner. Without it two sessions on one display can paste each other's text or restore a stale clipboard. Rejected: relying on each engine's one-request-at-a-time order, which serializes one engine, not the display.
  - "Not applied" means a refusal before dispatch or an outright rejection; a field unchanged at the deadline after dispatch is unconfirmed, because an application may apply a paste late and a "not applied" answer would invite a retry that pastes twice. Rejected: the authoring definition (an unchanged field with no sign of a pending paste).
  - The tree's main path is level-pipelined per-element reads of the vendor's field set, `GetRoleName` included; `Cache.GetItems` is an M0 experiment that M4 adopts only if it reproduces the sequential output exactly on menus, Qt and changing trees, under the signature, role-name and -1-sentinel rules. Rejected: `GetItems` as the main path with a per-element fallback for missing nodes, since cache answers differ by toolkit in ways a missing-node fallback does not catch.
  - Admission is the vendor's preorder, whatever the fetch order, checked by exact retained native ids on an over-budget scene in M1a. Rejected: admitting in fetch order, which on an over-budget tree keeps a different node set (breadth first keeps shallow nodes that preorder drops).
  - Non-interference is proven continuously: the witness watches for the whole operation, an `xtrace` audit finds no forbidden request on the background route, and an activate-act-restore stub engine must fail both; the CLIPBOARD owner leaves the witness, and clipboard preservation is checked on its own. Rejected: before-and-after snapshots alone, which the stub engine passes.
  - Comparisons are isolated: each engine in its own block with a fresh process, separate equivalent windows where retention matters, cold and warm apart, plus resize, unmap-and-remap and fully-occluded-change cases. Rejected: per-sample interleaving, in which cua's retention carries warm state between samples and onto windows another engine is measured on.
  - `list_windows` lists minimized windows with `minimized: true`, a declared deviation, so a bound window the person minimizes stays readable through the policy and the facade. Rejected: the vendor's omission, which turns such a window into `Window <id> is unavailable.`
  - Multi-line and combining-mark checks run in a harness textarea page in Chrome and in the two editors; the address bar keeps a single-line case, because a newline there navigates.
  - Execution: the `engine-linux` gate's live part starts in M1b with tree, key and screenshot, and M2 adds paste. Every milestone that changes engine behaviour or the wire (M1b, M2, M3, M4) ends with a release built from its reviewed head commit and pinned in the same pull request, the service refuses an engine older than `MIN_ENGINE_VERSION`, and M5 accepts the pinned assets on both architectures (rejected: one release at M1b and local builds after it, which would accept a binary no user installs). M1b gives the facade harnesses their Linux engine lanes and declares the two VMs, and M1a's facade-level proof is the harness's `--via vendor-js` mode alone. Wire `output` is a JSON value, with fixtures of each kind exercised through the vendor JavaScript before M0 promotes. Concrete Steps set up the VM worktree and gate committed, recorded SHAs.
  - M6 splits into M6a, a vendor-free Linux runtime on #117 M6's ModuleTree, the managed Node, the sandbox helper and `cua-engine`, and M6b, the deletion. The vendor archive supplies the runtime record, the active pointer and the module tree that every Linux session resolves, browser-only ones included, so deleting its acquisition alone would break them. Rejected: one M6 that only removes.
  - The truncation line renders in the facade (`src/cua-api/bind-linux-app.mjs`), because the service returns structure and only the facade renders the tree; the facade constraint names this one exception, and M4's over-budget fixture proves the line end to end. Rejected: the service printing it, which has no rendered tree to append to.
  Rationale: the authoring design would have changed behaviour callers rely on (shortcut keys, the admitted node set, a caret moved by an unneeded click) or could pass a regression its checks did not see (an activate-and-restore engine, warm state shared across engines, an engine no user installs). Each resolution keeps the vendor's observable behaviour where a caller depends on it and closes the gap in the check.
  Date/Author: 2026-10-28, the design session (cua_repl session 1ea561bc), resolving both reviews.

- Decision (2026-10-28, review round 2): a second review, of the round-1 revision (5412c177), raised six findings; the design session resolved each, and this revision applies them to the design, acceptance, milestones, Concrete Steps and Interfaces.
  - One guarded clipboard cleanup ends every paste on every exit path (completion, a refusal before dispatch, a timeout, an error). The engine never calls `SetSelectionOwner` to restore: while it still owns CLIPBOARD it switches what it serves to the remembered snapshot and keeps serving it, as the vendor's persistent owner does, and after `SelectionClear` it does nothing. Round 1's refusal path gave up ownership and restored without that guard, so a program that took the clipboard in between would have had its newer contents overwritten. Rejected: restoring by taking ownership back.
  - The lock is acquired atomically under a short server grab (`GrabServer`, `GetSelectionOwner` answering None, `SetSelectionOwner` to the lock window, `UngrabServer`), released before any waiting or clipboard work, with `SKY_CLIPBOARD_LOCK` taken the same way after it. Round 1's check, set and second check could interleave so that a second engine took the lock between the first one's check and its confirmation, and both believed they held it. How the vendor acquires `SKY_CLIPBOARD_LOCK` moves to M0's behaviour specification; interoperating with a vendor engine pasting at the same time is best effort, and the harness never pastes with two engines at once. Rejected: the round-1 check-set-check acquisition.
  - The transfer wait is bounded (500 ms to the first `SelectionRequest`, 2 s between INCR chunks, 10 s overall), after which the engine stops serving, runs the cleanup and answers unconfirmed unless the Text read already confirmed the edit. Requests run one at a time, so round 1's unbounded wait for transfer completion let a requestor that never asked, or stalled, hold every later request of the session. Rejected: waiting for completion without a bound.
  - Speculative acquisition is bounded: the read follows the preorder frontier with a window of at most W calls in flight and R bytes of replies outstanding (M0 chooses them, starting from 64 and 4 MiB), schedules attribute calls only for nodes preorder admission could still admit, schedules nothing once admission reaches 5,000, and lists a very wide container's children without fetching their attributes outside the window. The over-budget fixture now also bounds cua's bus calls by the vendor's plus a constant M0 fixes, and the spike's `level` variant becomes `frontier` with the window parameters. Round 1's level-by-level pipelining put a whole level in flight, unbounded on a very wide container, and fetched attributes for nodes preorder never admits. Rejected: level-by-level pipelining.
  - Concrete Steps are executable: variables set once (`MILESTONE`, `VERSION` from `cargo metadata` through `jq`, `DATE`), every expansion quoted, commit messages kept out of the blocks (`git commit -F "$MSG_FILE"`), and every block checked with `bash -n` (shellcheck reports nothing either).
  - M1b's full-suite parity run gets an honest verdict before M2: temporary candidate expectations for the two text cases on the `cua` engine (the refusal `type_text is not available in this engine build`, the text unchanged, the window alive), in `scripts/repl-parity/expected/native-linux.json` and its diff declarations, which M2 replaces with the positive assertions; no other candidate failure is waived. Without them the run would fail on two cases its own engine deliberately refuses until M2, or pass only by an unstated waiver.
  Rationale: each finding was a place where an exit path, a race or a wait could hurt the person's clipboard or stall a session, where speculation could cost more calls than the vendor, or where the execution text could not be run or judged as written; the resolutions close each with one rule and a test that would fail without it.
  Date/Author: 2026-10-28, the design session (cua_repl session 1ea561bc), resolving the second review.

- Decision (2026-10-28, review round 3): a last, narrow review of the round-2 fixes (on a4cdd9bf) raised three findings; the design session resolved each, and the plan-executor folded them in as the spec's writer. The review found the cleanup without reacquisition, the atomic CUA-then-SKY locks, the outgoing transfer bounds, the Concrete Steps blocks and M1b's text expectations correct, and is converged.
  - Late conversions never receive the restored snapshot (M2): each paste has its own serving generation keyed by its synthetic Ctrl+V's timestamp; after cleanup, a `ConvertSelection` with that timestamp or one from ownership to cleanup, and a `CurrentTime` request within 10 s after an unconfirmed paste, are refused with property None; an accepted INCR transfer stays pinned to its payload. Without it, a requestor slow to convert would paste the person's old clipboard into the field as if it were the text. Test: a requestor that delays `ConvertSelection` past 500 ms.
  - Snapshot reads are bounded (M2): 500 ms for `TARGETS`, 500 ms per format's first response, 2 s between INCR chunks, 5 s overall, for the paste snapshot and `clipboard_read`; on expiry before dispatch both locks are released and nothing is sent. Without it a silent or stalled owner would hold the request queue and the display's lock. Tests: a silent owner, an owner stalling mid-INCR.
  - The byte budget R (M0 now): reply bytes received and not yet consumed plus a per-call reservation (4 KiB to start) for each call in flight; issue only while under R; a reply over the remaining credit is read whole, never truncated, and blocks new calls until credit returns, so staging is bounded by R plus the largest reply. M0's frontier spike measures with this policy and adds a single-reply-over-R case (a text node over 4 MiB, read exactly).
  Date/Author: 2026-10-28, the design session (cua_repl session 1ea561bc) resolving the third review; folded by the plan-executor (session linux171).

- Decision (2026-10-28, execution pre-flight): how the plan is run and landed.
  - Each milestone lands as its own squash-merged pull request to `main`. M0's branch is `feat/171-linux-engine`, which also carries this spec and the research; every later milestone works on `feat/171-<milestone>` (for example `feat/171-m1a`), branched from `main` after the previous merge, where Concrete Steps name one `BRANCH` for all. Branches are kept after merge, and GitHub keeps each pull request's head, so a SHA the evidence cites stays fetchable after the squash.
  - The work happens in a worktree of the #171 VM's checkout at `~/Developer/GitHub/cua/.claude/worktrees/cua-171` (the harness's own worktree location) instead of `~/Developer/GitHub/cua-171`; Concrete Steps' `$WT` reads as that path.
  - M0 runs as four tasks of the execution loop, in this order, because its deliverables are separable and each consumes the one before: M0.1 the behaviour specification; M0.2 the spike engine (its variants and flags); M0.3 the wire fixtures and the harness's first cut (scenes, fresh-process blocks, the witness, bus-call counts), its runs over the variants, the choice of W, R and the over-budget constant, and the promotion verdict; M0.4 the application-family matrix, measured with M0.3's witness. M0 promotes or is discarded on M0.3's verdict, and the matrix does not change that verdict.
  - Each task is reviewed clean by the loop's task reviewer before the next consumes it; each milestone's pull request then gets `doperpowers:reviewer-high` and a green `ci-gate` before merge, the per-milestone branch review the authoring entry names.
  Rationale: the brief lands milestones one by one; M0 in one executor would hold a D-Bus client, a harness, the measurements and a seven-family matrix in one context.
  Date/Author: 2026-10-28, the plan-executor (session linux171).

- Decision (2026-10-28, M0.1 folded): the Design is revised where the behaviour specification (§21) read the vendor differently, keeping each of the Design's own rules:
  - Address discovery reads the root window's `AT_SPI_BUS` property, then the session bus (Modules); the text is also served as `text/plain`, which the vendor serves and a requestor may ask for alone (step 3); lock acquisition keeps the vendor's verify read of the owner inside the grab (The clipboard lock); the extra table calls count in the over-budget bound and a failed `GetRoleName` counts in `truncated.failed` (Observation); every association failure other than duplicate frames keeps the vendor's X11 fallback (Window association); a positive `--mouse-size-px` stamps the cursor at its native size (Screenshots).
  - Where the Design had said "as the vendor does" of a rule the vendor does not follow (the focusing click; the cleanup's serving of the snapshot), the text now names the vendor's mechanism and records cua's rule as the departure it is, decided in review rounds 1 and 2.
  - `clipboard_write` restores the clipboard after its paste, unlike both vendor builds, which leave the written snapshot on CLIPBOARD: a declared deviation (M2, `scripts/linux-engine-diff/deviations.mjs`), because the Design's one route ends every paste with the cleanup and the person's clipboard is theirs (Purpose, "the person's desktop is left alone"); the facade's Linux `paste` calls `type_text`, never `clipboard_write` (R/A §1.5), so no model-facing call depends on the vendor's leftover.
  Date/Author: 2026-10-28, the plan-executor (session linux171); the `clipboard_write` deviation and the focusing click sent to the design session for a check.

## Outcomes & Retrospective

Pending — written at finish.
