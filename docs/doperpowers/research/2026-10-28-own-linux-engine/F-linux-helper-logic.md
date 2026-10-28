# F. Linux helper logic: the pinned engine and the newer capability bar

Research for SSFSKIM/cua #171, 2026-10-27–28. Behavioral facts only; no vendor implementation is proposed for copying.

## 0. Subject, method, evidence and limitations

### Subjects

**Primary:** `sky_linux_x64` from cua runtime **26.928.40906-linux-x64**, at:

`/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`

- SHA-256: `7ac3c2ae45a3dacc9209063e91d2df4ea9f206b814a9ffd976f5bcf90d73f1cd`.
- ELF x86-64 PIE, not stripped; BuildID `3e0dd87b3c0616e007710a46bc8612a0ae0415fe`.

**Comparison:** `sky_linux_x64` from **26.1023.51421**, SHA-256:

`88ce5e0ae64290dd36dbb2942a33ece6a7222f7294fc66410f4e26c29e4b2991`.

The newer binary copied from the Mac exactly matches the binary extracted from the independently downloaded deb. The deb was not installed. Its URL was taken from OpenAI’s Packages index:

`https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/chatgpt_26.1023.51421_amd64.deb`

Deb SHA-256 `4484dc2b54fc0978beb23b8d8d717494e4e0b4fbeab0a876739105e50b44de5a` matched Packages. Packages SHA-256 `9a559b2c2ea01b065de0788b603592f30f9575865ed9e49358ad78140eb05ff5` matched InRelease. **The InRelease signature was not independently authenticated**; the recorded verification is HTTPS retrieval plus this hash chain. Evidence: `vendor/index/{InRelease,Packages,verification.txt}`.

### Environment and methods

All heavy work and GUI interaction ran on **dc-linux171-1e68**, Ubuntu 24.04, x86-64, 8 vCPU, X11/Openbox on `:0`, 1280×800. The account’s actual home on this Linux VM is `/Users/new`, not `/home/new`. AT-SPI is at `/run/user/501/at-spi/bus_0`; the session bus is `/run/user/501/bus`.

Ghidra **12.1.4**, with OpenJDK 21, was downloaded on the VM. The archive hash matched the release’s published SHA-256:

`ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`.

The pinned binary received a full headless analysis, run under nohup. Its 104 selected own-crate function entries were decompiled; five decompilations failed. The newer binary received targeted symbol-based disassembly/decompilation, including an exact-ELF-function-extent pass: 171 entries, six failures. **The newer project was not fully auto-analyzed.** Some newer decompilations have unreliable extra control-flow after panic/allocation paths; those paths are not treated as facts without disassembly or trace confirmation.

The large native dispatcher and `run` resisted complete decompilation. Exact function extents and bounded jump-table overrides did not resolve the dispatcher timeout. Therefore this report combines successful named-helper decompilations, targeted dispatcher disassembly, and live traces; it does **not** claim that every dispatcher branch has been reconstructed.

**Address convention:** addresses below are ELF virtual addresses, matching `nm`. Ghidra loaded these PIEs at base `0x100000`, so add `0x100000` for Ghidra addresses and decompilation filenames. For example `accessible_node` at ELF `0x81d00` is `00181d00_…c`.

### Live evidence

The research used:

- Native NDJSON drivers recording requests, responses, operation wall time and desktop state before/after.
- `dbus-monitor` on the accessibility bus. The helper reconnects frequently, so the analysis follows its per-operation unique names rather than assuming one name for the process.
- `xtrace` as display `:9` forwarding to `:0`, and `strace -f -tt -T` on the helper and children.
- Actual cua MCP calls using the repository’s existing `pinnedApprovals` mechanism for the owned gedit fixture, with session-only approval memory.
- Direct pinned and newest vendor JS `create_client` calls, including the newest client extracted from its deb.
- A verified tee wrapper capturing pinned vendor JS requests and native responses.

**Important instrumentation boundary:** `/opt/cua/src/runtime/launch.mjs:295` overwrites `OAI_SKY_LINUX_BIN` with the pinned runtime path. Setting that variable on `cua serve` did not install the tee. The cua facade smoke test and the direct-vendor-client tee capture are separate evidence. No launch configuration or repository file was changed to work around this.

Below, **W** means the absolute VM directory `/Users/new/.local/share/cua-171`. Paths beginning with W are on that VM, not on the Mac. Short function names denote the full `sky_linux::client::x11::…` namespace unless another namespace is named.

## 1. Runtime and module inventory

The pinned binary is Rust **1.94.1**, compiler commit `e408947bfd200af42db322daf0fadfe7e26d3bd1`. Embedded Cargo paths identify `x11rb` and `x11rb-protocol` **0.13.2**, `image` **0.25.10**, `serde`/`serde_core` **1.0.228**, `serde_json` **1.0.149**, `anyhow` **1.0.102**, and `clap_builder` **4.6.0**, among other image/compression/runtime dependencies. These are embedded build-path facts, not an inferred dependency manifest. Evidence: `W/inventory/{nm.txt,strings.txt}`.

AT-SPI is implemented through the vendor’s own `dbus::{Connection,Reader,Value}` encoder/parser, not through libatspi, libdbus or zbus. `Connection::call` is at `0x90bc0`, `connect` at `0x92350`, and value decoding at `0x93e20`. X11 mostly uses x11rb. Keyboard layout resolution additionally uses Xlib’s `XOpenDisplay`, `XKeysymToKeycode`, and `XKeycodeToKeysym` (`resolve_keysyms`, `0x79d50`).

The important own modules are accessibility, input_target, keyboard/key_presser, window_buffer/get_screenshot, clipboard/selection, windows, apps and move_path. The newer build adds visible `verified_paste`, `virtual_cursor::{overlay,motion,render}`, and asynchronous-reply D-Bus functions. The unique own-crate symbol-name set grows from **100 to 166**: 74 additions and eight removals; multiple instances/closures explain the larger number of decompiled entries. Evidence: `W/inventory/newest-diff.txt`.

The pinned native command list is:

`perform_secondary_action`, `click`, `clipboard_read`, `clipboard_release`, `clipboard_write`, `drag`, `drag_handle`, `activate_window`, `get_screenshot`, `list_apps`, `list_windows`, `move`, `move_relative`, `press_key`, `key_down`, `key_up`, `scroll`, `type_text`, `launch_app`, `get_window_state`, plus `server` transport mode.

Newest adds **`type_characters`**. Neither Linux helper offers macOS `set_value` or `select_text`. Cua’s Linux `paste` facade is not the clipboard-handle API: it uses the text-typing route. Evidence: both `--help` captures, JS `create_client.js`, and A-linux-contract.

## 2. Window association and tree acquisition

### 2.1 Finding the AT-SPI window

`at_spi_connection` (`0x836e0`) obtains an accessibility-bus connection. `at_spi_window` (`0x7f2c0`) reads the X11 target and its PID/title, enumerates `org.a11y.atspi.Registry`’s desktop-root `GetChildren`, calls `org.freedesktop.DBus.GetConnectionUnixProcessID` for application bus names, then reads candidate application children and their Accessible names. `match_window` (`0x7db80`) uses title comparisons and, where necessary, component sizes and the X11 window set. It re-reads identity properties before accepting the match; PID, title and size changes are not simply ignored.

The direct trace starts, for example, with registry `GetChildren`, PID queries for Chrome and gedit, gedit application `GetChildren`, and the candidate frame’s `Accessible.Name`. This discovery is repeated on later observations, with a fresh helper bus name each time. Evidence: `W/traces/trace/dbus.log`, sender `:1.6`, serials 1–13; later senders repeat the pattern.

**Duplicate-window weakness:** three Chrome windows with the same title and 1050×780 dimensions caused both helpers to answer an explicit original-window request with `ax_tree_source: "x11"` and one `x11:0x600002` node, instead of an AT-SPI tree. Closing the two extra windows did not immediately repair this: Chrome still exposed their accessible objects. Giving the original window a unique `about:blank` tab title restored `at_spi`. Evidence: `W/traces/{paired-duplicate-windows.jsonl,paired-stale-atspi.jsonl,cleanup-extras.json,paired.jsonl}`. Do not count this fast fallback as a tree-performance improvement.

### 2.2 Calls per element: no bulk cache

`accessible_node` (`0x81d00`) reads:

1. `Accessible.GetRoleName`.
2. `Properties.Get("org.a11y.atspi.Accessible", "Name")`.
3. The same for `Description`.
4. `Text.GetText(0, -1)` for roles **text** and **entry**, and for table cells produced by the special visible-table path.
5. `Accessible.GetState`, decoded by `decode_states` (`0x80560`).
6. `actions` (`0x87550`): `Accessible.GetInterfaces`; if Action is exposed, `Properties.Get(Action, NActions)` and `Action.GetName(i)` for each action.
7. `tree_children` (`0x80a90`), normally `Accessible.GetChildren` through `children` (`0x87a70`), then recursive children in returned order.

The ordinary node therefore costs six baseline method calls, plus text and action calls. A named slider’s `Value.CurrentValue` is not part of this normal extraction merely because it exposes Value. Geometry is not fetched for every ordinary observation node. It is fetched by spatial targeting/table handling.

There is **no `Cache.GetItems`, `Properties.GetAll`, Collection bulk-match request, or concurrent per-node attribute batch in the observed tree path**. Replies are consumed before subsequent node requests. The newer `send_call`/`PendingReply` machinery does not turn observation into bulk caching: its measured per-tree call counts were identical.

Measured bus traffic:

| Scene | Nodes | D-Bus calls | Selected breakdown |
|---|---:|---:|---|
| gedit scratch | 480 | 3,038 | 480 each RoleName/State/Interfaces; 482 GetChildren; 1,036 Properties.Get; 74 Action.GetName; 3 GetText |
| Chrome New Tab | 270 | 2,440 | 270 each RoleName/State/Interfaces; 272 GetChildren; 814 Properties.Get; 540 Action.GetName; 1 GetText |

Evidence: `W/traces/{trace,newest-trace}/dbus-counts.json`. The full trace preserves arguments and replies, not just totals.

### 2.3 Limits and omissions

`accessible_node` checks the shared node counter **before incrementing**: reject when greater than 4,999. It checks depth before reading: reject when greater than `0x3f`. Consequently the normal tree admits **5,000 nodes and depth indices 0–63**. These are different from macOS’s 200-level/no-node-budget rules.

The recursive caller discards failed children and continues. Thus an exhausted node/depth budget or a failed child read can silently omit a subtree; there is no model-visible truncation marker in the node structure or JS renderer. The two limit error strings are present, but the child error is swallowed. Evidence: `accessible_node` entry at `0x81d19–0x81d2a`, recursion/error branch at `0x82168`; `W/inventory/accessible_node.asm` and `W/decomp/00181d00_…c`.

`GetText(0,-1)` has no explicit string truncation in this routine. There is no whole-walk deadline visible in it. D-Bus socket/message limits are separate (§10).

For a **table** whose `Accessible.ChildCount > 5,000`, `tree_children` tries `visible_table_cells` (`0x83db0`) rather than retrieving all children. This requires Table support and visible bounds, uses `Component.GetAccessibleAtPoint`, checks that returned objects are cells with visible bounds inside the table, deduplicates, and advances spatially across discovered cell bounds. The sampling is bounded by the remaining node budget and a 5,000-iteration check. Sampled cells are read as leaves with text. If the optimization fails, the code falls back to ordinary children. This was read statically, not exercised against a virtualized 5,000+-child fixture.

There is no blanket “only showing nodes” pruning for ordinary trees: the recorded gedit tree includes enabled, visible-but-not-showing menu/header objects.

### 2.4 Fallback and minimized windows

The X11 fallback (`x11_tree`, `0x87e40`) exposes X windows and X properties, not application semantic controls; it can be only one node. Its IDs use an `x11:` prefix. Element-action resolution explicitly rejects those as AT-SPI targets (`element_with_ancestors_in_window`, `0x86430`).

Both builds rejected a minimized gedit window **before both tree-only and tree-plus-image observation**:

`X11 window 18874616 is not mapped`.

They did not unminimize it to observe. Explicit `activate_window` restored it. Evidence: `W/traces/{trace-minimized,newest-trace-minimized}/wire.jsonl`, 1.9–6.1 ms traced refusals.

## 3. Text presentation, query filtering, indexes and diffing

These policies are predominantly **JS**, not Rust, and should not be reverse-engineered as native rendering rules. Sources are pinned/newest `targets/linux/{accessibility_tree.js,element_ids.js,get_window_state.js}`; all are minified single-line files in the extracted/runtime trees.

### Rendering

The JS recursively simplifies a copy for printing:

- Generic roles `group`, `panel`, `filler`, `section`, `generic` print as `container`; `text`, `static`, `label` print as `text`; a `menu item` has no role word.
- Empty non-interactive leaves are removed; an `x11:` node survives.
- Empty non-interactive single-child generic groups collapse. Redundant same-role generic hierarchy is flattened.
- Redundant textual children already represented in a parent are dissolved when there is no interactive descendant.
- Consecutive non-interactive text-only leaf siblings merge into a space-joined text value.
- Descriptive values are name, description and value, deduplicated by exact value; images/icons count as descriptive.
- Flags print in this order: focused, selected, expanded, indeterminate, checked/unchecked, settable, disabled, as applicable.
- An initial action named press/click/dodefault/clickancestor is suppressed in the secondary-action list. A unique showcontextmenu is also suppressed. Remaining actions print as Secondary Actions.
- Long detail strings, greater than 100 JS characters or containing a newline, move after shorter ones, stably. A single non-action detail prints without its label.
- Carriage return, newline and tab within a rendered node are escaped. Structural indentation is tabs; the line is `<id> <description>`.

The native response is structured. The direct renderer has no macOS Window/App header or selection trailer. Cua’s Linux facade adds `Accessibility source: …`, visible in `W/traces/facade/harness.jsonl`.

### Index allocation and resolution

`ElementIds.assign` traverses the **unpruned native tree**, preorder. It assigns globally increasing decimal-string IDs, with separate native-ID maps per X11 window. Rendering happens later. Hence public indexes can have gaps in printed text; that is expected, not a missing native node or a diff.

The native key is the accessible **bus name plus object path**, for example `:1.2:/org/a11y/atspi/accessible/73`. A surviving key retains its public numeric ID across observations. On a full observation, entries absent from the new tree are dropped; IDs are not recycled because `next_id` only increases. On a nonempty query observation, assignment starts from a copy of the previous map, preserving entries not in the filtered result.

`resolve` translates numeric action IDs back through the target window’s map; an unknown numeric ID fails in JS. A native nonnumeric ID is passed through. The helper does **not** simply invoke a cached native object: `element_with_ancestors_in_window` (`0x86430`) re-associates the window and `find_element` (`0x7d4f0`) walks current children to establish that the bus/path ID belongs under that window. This lookup itself has 64-level/5,000-node bounds. There is no macOS-style text/name fingerprint refetch or revision lineage protocol in this path.

**No Linux diff:** each `get_window_state` returns a tree. `query` is case-insensitive tree filtering retaining ancestors, not an incremental diff or native subscription. Native `filter_children` (`0x824d0`) resisted C decompilation; exact query-field matching beyond the JS/type contract remains a bounded static gap. Do not assume it avoids the full initial walk.

Newest’s JS changes here are small: `get_window_state` passes an optional `focused_modal` to the renderer, whose first line can identify the focused modal window. New native input adds `follow_focused_modal`. ElementIds and ordinary simplification remain unchanged. Evidence: `W/inventory/js-diff.txt`.

## 4. Background input: the actual recipe

### 4.1 Two fundamentally different routes

**With a window:** targeted X11 `SendEvent`. **Without a window:** desktop XTEST FakeInput. These are not interchangeable.

The targeted implementation is `KeyboardState::target` (`0x9a830`), `BackgroundWindow::{send_event,move_to}` (`0x7ad40`, `0x7b2d0`), and `BackgroundSession::send_focus` (`0x7d2d0`). The desktop dispatch calls `context::send_event_at_position` (`0x96400`) and x11rb’s `xtest::fake_input` (`0x6a510`).

`xtrace` on this VM labels XTEST opcode 132/minor 2 as UNKNOWN, so a text search only for “FakeInput” incorrectly finds none. The request bytes, the extension query, the named native call, and actual pointer movement establish the desktop route. Evidence: `W/traces/trace-misc/x11.log`, requests `000:0233` onward.

### 4.2 Targeted sequence

1. Resolve/check the target window and retain its rendering using a temporary Composite redirect.
2. Determine whether actual keyboard focus is inside it (`focus_is_within`, `0x7a760`). If not, send synthetic **FocusIn**, `detail=Nonlinear`, `mode=Normal`, to the target. This changes the application’s belief, not the X server’s keyboard focus.
3. Send input with **`propagate=false`, `event-mask=0`**. For pointer targeting, the code translates coordinates and descends the window hierarchy at the requested point. EnterNotify/MotionNotify establish the synthetic pointer position; key events in the traces go to the target top-level window.
4. Event state comes from the helper’s held-key/button bookkeeping. Button release carries the pre-release button mask. Modifier press/release ordering is visible in the key traces.
5. On release of the background session, if the helper synthesized focus and actual focus still is not within the target, send synthetic **FocusOut**, then release Composite retention. If actual focus has entered the target, do not spoof it out. Evidence: `alloc::rc::Rc<T,A>::drop_slow`, `0x63f90`, in `W/decomp-repaired`.

Pointer/key timestamps use a server-time anchor plus elapsed monotonic milliseconds (`BackgroundWindow::send_event`, `0x7ad40`). Focus events themselves do not have an X11 time field. The event record carries root and local coordinates, same-screen true and child None in the tested top-level cases.

There is no `_NET_ACTIVE_WINDOW` activation message, XSetInputFocus-equivalent request, ConfigureWindow raise, or physical-pointer move in the recorded window-targeted input sequences. Actual activation is confined to the explicit activation tests. The regular input path does not activate and then restore the desktop: it never changed that desktop state in the first place.

### 4.3 Independent witness and effects

Every recorded request captured `_NET_ACTIVE_WINDOW`, `_NET_CLIENT_LIST_STACKING`, actual keyboard focus and `xdotool getmouselocation` before/after. Across both 30-operation main trace sets, **all comparisons were equal**. In both extra trace sets, only the two explicit activate_window calls changed desktop state.

Effects were also verified, not inferred from successful return:

- With Chrome active, targeted gedit End and `press_key("Z")` appended **lowercase z** to the scratch text while Chrome remained active.
- With gedit active, Chrome’s location field accepted `cua171 Ωé🙂` through the pinned type_text route.
- Newest inserted Unicode in background gedit while preserving desktop state.

Evidence: `W/traces/{trace,trace-extra,newest-trace,newest-trace-extra}/wire.jsonl` and their D-Bus/X11 logs. The original witness pointer was `(640,400)`; it remained there for targeted input. Desktop-mode tests intentionally moved it and the harness explicitly restored it afterward; that restoration was **not** vendor behavior.

## 5. Click and secondary actions

`perform_action` (`0x81800`) resolves the element live, fetches its action names, and obtains a targeted input session even around an accessibility action.

- A primary element activation invokes **action index 0**, rather than applying the macOS AXPick/AXPress preference table.
- A named secondary action is matched case-insensitively against advertised action names. Empty names, missing names and ambiguous duplicate matches fail; it does not blindly invoke an arbitrary string.
- `do_action` (`0x88830`) calls `org.a11y.atspi.Action.DoAction`.
- A left click on gedit’s text view, which does not expose Action, **fails rather than falling back to a coordinate left click**. Recorded error: `AT-SPI element does not expose actions; refresh get_window_state(): AT-SPI element does not implement Action`.
- A right click on that same text view reads Component extents, including a clipping ancestor, and synthesizes ButtonPress/Release button **3** at the visible target point. The trace’s point was `(455,388)` relative to the gedit window, `(825,388)` on the root. It did not raise the window or move the real pointer.

Evidence: `W/traces/trace-element/{wire.jsonl,dbus.log,x11.log}`; `element_bounds` (`0x816e0`), `element_position` (`0x82db0`); `W/traces/{trace-clipboard,newest-trace-clipboard}` for actual perform_secondary_action calls.

Coordinate clicks use the targeted or desktop route from §4. `full_desktop::click::click` (`0x7a010`) defaults to one click and a **12 ms press-to-release hold**, overridden by duration. Coordinates are target-window-relative when a window is present. Element-targeted click supports one left/right click without key/duration; multi-click, middle or held-key cases require coordinates. The exact full branch ordering for right-click elements that also advertise a context action was not reconstructed; the no-Action text-view route above was directly verified.

## 6. Keyboard and text entry

### 6.1 press_key, key_down, key_up

The pinned key resolver (`0x79d50`) opens the X display, resolves existing keysyms to keycodes, examines keymap levels 0 and 1, and may synthesize Shift for shifted symbols. It does **not** remap an unused keycode for arbitrary Unicode. A zero keycode is an error. `keys::keys` (`0x94a10`) supplies the keysym/chord grammar; `normalized_chord` (`0x9cad0`) normalizes held-chord identity.

A notable legacy rule remains in both builds: uppercase ASCII keysym names do not reliably mean uppercase typed characters. The static resolver excludes A–Z from its automatic level-1 Shift addition, and **`press_key("Z")` typed z in both builds**. Newest type_characters is a different, literal-character route and did type uppercase correctly.

`KeyboardState::acquire` (`0x9ba90`) and `release` (`0x9c190`) maintain shared key references, so held chords can span actions. Input is released through cleanup paths, not just on successful user code. The pinned routines each impose **33 ms** pacing. Newest removes those standalone down/up delays, while a normal press retains a roughly 33 ms hold. Measured timing is in §11.

### 6.2 Pinned type_text: clipboard-driven, not per-character typing

The pinned path goes through `clipboard::paste_owner` (`0x9cbf0`), not a stream of Unicode key events. It establishes clipboard ownership, targets the window/focused editable, and dispatches an app paste operation.

Two routes were observed:

- **Chrome:** accessibility context-menu actions. `focused_context_action` (`0x852d0`) and menu-search helpers find and activate Copy/Paste items through Action.DoAction. This worked on the background address field, including Ω, é and emoji.
- **gedit/GTK:** `perform_editable_clipboard_action` at `0x86dd0`. It reads CaretOffset, CharacterCount and selection information, supports at most one selection, deletes a selected range when needed, then calls **EditableText.PasteText(offset)**. Its sibling at `0x86a20` implements the copy-side selection operation.

On this x64 VM, gedit answered **boolean true** to PasteText but no characters were inserted. The helper later returned `editable Paste did not insert text` after **10.216 seconds**. Gedit survived. This is different from the previously recorded arm64 GTK crash; neither outcome should be generalized over the other.

Evidence: `W/traces/trace-extra/dbus.log:73780` records PasteText at offset 16, the true reply, and subsequent CharacterCount checks; `trace-extra/wire.jsonl` records the timeout and unchanged tree. The clipboard-write test reproduced the same defect independently (§7).

### 6.3 Newest type_text: verified paste and pre-dispatch fallbacks

Newest adds `accessibility::verified_paste`:

- `TextField::observe`, ELF `0x95a80`.
- `TextSelection::read`, `0x927d0`.
- `TextField::ensure_focus`, `0x93ba0`, and `ensure_selection_unchanged`, `0x95680`.
- `TextField::confirm_edit`, `0x93660`.
- `TextField::without_paste`, `0x93eb0`.
- `TextField::type_characters`, `0x941d0`.
- `TextField::replace_selection`, `0x94ed0`.

The machinery snapshots field text/selection, checks focus and the intended edit, and verifies resulting text and selection afterward. Confirmation polls at a **60 ms** cap per sleep; the fallback routines construct a **2-second** confirmation deadline. These are field-effect checks, not a general UI-settle algorithm.

The named fallback routines contain three different mechanisms:

- Literal keyboard typing when the direct insertion preconditions do not hold.
- **EditableText.InsertText** in `without_paste` when the no-selection/editable-interface conditions permit it.
- **EditableText.SetTextContents** in `replace_selection`, after constructing a replacement whole-field value from the verified selection; it then moves the caret and confirms the result.

These are reachable native mechanisms, not an instruction that the public JS chooses among methods automatically. The full dispatcher’s fallback-priority tree remains partially unrecovered. In the actual successful gedit Unicode test, **none of those EditableText mutation methods was used**: the helper owned the clipboard and sent targeted **Ctrl+V**. That is the observed successful GTK recipe.

Crucially, after a Paste has been dispatched, newest treats an unconfirmed effect as indeterminate and reports that **no second Paste or typing fallback was sent**. This avoids duplicate input on uncertain completion.

It still has false negatives. The direct newest-client test returned an error after inserting exactly `Newest-chrome-42 Ωé🙂`. A second bounded series returned errors after correctly inserting `ASCII-one` and `combining-é`, while BMP, astral and a later plain ASCII string succeeded. Thus the failure is **not established as a Unicode-only bug**. These errors took about **2.83–2.85 seconds**, versus about **0.845 seconds** for confirmed success. Evidence: `W/traces/{newest-js.jsonl,newest-text-cases.jsonl}`.

### 6.4 Newest type_characters

Newest exposes an additional public native/JS method rather than rewriting `type_text.js`:

- Input: required window and text; no element_id.
- Output: number of characters sent; the caller must inspect the app to verify effect.
- `KeyPresser::type_character` at `0x883b0`, `literal_keycodes` at `0x88870`, `resolve_on_display` at `0x88ac0`, `KeyboardState::type_characters` at `0xc6bc0`.

`" AbZ09!?"` returned **8** and appeared exactly in both gedit and Chrome, preserving background use. Each eight-character call took about **702–704 ms through newest JS**. The US-layout string `éΩ🙂` failed at é with `resolve_keys failed xlib::XKeysymToKeycode keysym=0xe9`; no arbitrary-Unicode remapping was observed. Literal keyboard typing is therefore not a replacement for the working Unicode clipboard route.

The extracted JS diff confirms that `type_characters` is simply added to `create_client`; **type_text.js is unchanged**, and the client does not automatically choose type_characters over type_text. Evidence: `W/inventory/js-diff.txt`, newest `TypeCharacters.d.ts`, `W/traces/newest-js.jsonl`.

## 7. Clipboard ownership, snapshots and restoration

The native clipboard API is more than copying a string:

- `clipboard_read(window)` invokes the app’s Copy action and captures a reusable snapshot handle.
- `clipboard_write(window, handle)` invokes app Paste using that snapshot, independent of later clipboard content.
- `clipboard_release(handle)` releases the helper’s stored snapshot.

The selection implementation has a reader, a selection-serving owner worker, ownership guards, INCR transfer handling, and a separate restoration path. Key pinned functions are `SelectionReader::{read,snapshot,current_state}` at `0xa1ea0`, `0xa3be0`, `0xa0a40`; `SelectionOwner::start` at `0x9fcc0`; `ClipboardState::restore` at `0x9e980`; `set_selection_owner_if` at `0xa65f0`.

`SelectionReader::snapshot` reads TARGETS, captures formats, checks owner/state stability while capturing, and maintains an aggregate **64 MiB** budget (`0x4000000`). `read` understands incremental transfers and rejects invalid INCR formats, type changes during a transfer and oversize data. Restoration uses conditional owner changes rather than unconditionally overwriting another process’s new clipboard. The implementation has distinct lock/read/capture/paste timeouts; not every exact deadline or handle-count bound was recovered.

**Measured app behavior, with all three tracers running:**

| Method | gedit pinned / newest | Chrome pinned / newest |
|---|---|---|
| clipboard_read | 750 / 712 ms, success | 588 / 519 ms, success |
| clipboard_write | **10,218 / 10,213 ms, failure** | 1,027 / 1,011 ms, success |
| clipboard_release | 0.31 / 0.28 ms | 0.30 / 0.32 ms |

The gedit failure remained `editable Paste did not insert text` in **both** builds. Newest’s successful type_text route therefore must not be mistaken for a fixed clipboard_write route. Evidence: `W/traces/{trace-clipboard,newest-trace-clipboard}/wire.jsonl` and D-Bus traces.

A multi-format/large-INCR stress test was not performed. The 64 MiB statement is static evidence, not a successfully exercised capacity guarantee.

## 8. Screenshots and cursor presentation

### Window screenshots

`WindowBuffer::new` (`0x88930`) requires Composite support, issues **Composite RedirectWindow, Automatic**, waits **100 ms**, then keeps that retention alive. Drop issues **UnredirectWindow** (`drop_in_place<WindowBuffer>`, `0x50af0`).

`capture_screenshot` (`0x89140`) issues ordinary **GetImage, ZPixmap**, on the **target window drawable** at `(0,0)` with the window width/height. It does not take a root screenshot and crop the target rectangle, does not name a pixmap in the observed path, and did not use XShm. This is why it can read the target’s retained buffer while another window overlaps it. Full occlusion pixel-equality was not separately tested.

Example trace: gedit drawable `0x012000f8`, 910×756; Chrome drawable `0x00600002`, 1050×780. Both were captured while desktop focus/stacking remained unchanged. Evidence: `W/traces/trace/x11.log`, RedirectWindow/GetImage/UnredirectWindow around requests `000:0524–0528`, and equivalent newer traces.

### Encoding and cost

The helper converts the X image to RGB and writes **JPEG** through Rust image’s encoder. The quantization tables in `capture_screenshot` equal standard **quality 80** tables. The JPEG SOF markers confirm all components have sampling `0x11`, i.e. **4:4:4**. There is no native downsizing in the captured examples.

Preserved samples:

| Image | Dimensions | Pinned bytes | Newest bytes |
|---|---:|---:|---:|
| gedit window | 910×756 | 36,056 | 36,374 |
| Chrome New Tab window | 1050×780 | 52,885 | 52,994 |
| Whole desktop | 1280×800 | 58,648 | 57,694 |

Evidence: `W/traces/image-metadata.txt`, `W/traces/images/`, `capture_screenshot`’s embedded quantization values.

The helper writes files named from PID/time under its temporary directory. For these direct runs, vendor-generated originals were under `/tmp`; selected image evidence was copied to W so it does not depend on temporary-file lifetime. Raw research scripts and projects were never placed in `/tmp`.

`get_screenshot` is the **whole-desktop** operation, taking GetImage on the root. A window screenshot is obtained through `get_window_state(include_screenshot:true)`, so it also pays for the tree. Tree-only is possible with `include_screenshot:false`. Measurements in §11 distinguish them.

### Cursor changes between builds

Pinned defaults `--mouse-size-px` to **12** and calls XFixes GetCursorImage in the desktop screenshot path. The recorded call reports the physical pointer at `(640,400)`. The window screenshots did not take that pointer-stamping path.

Newest defaults the option to **0**, described as an opt-in to stamping the native pointer into desktop screenshots. Its default desktop capture omitted the XFixes cursor request.

Newest additionally contains a **live virtual cursor** subsystem: alpha overlay, motion paths, rendering/blur, window-backdrop sampling, target geometry tracking and restacking. `run` reads **`SKY_LINUX_WINDOW_CURSOR`** (disassembly at `0x28d59`). Overlay symbols and strings establish requirements for a 32-bit alpha visual, X Render, X Shape input regions and an X11 compositor. Default recorded input did not create a visible cursor overlay. An isolated `SKY_LINUX_WINDOW_CURSOR=1` move succeeded on this non-composited Openbox VM without an error, but no visual overlay was independently verified. Do not claim compositor-path visual parity from this environment.

## 9. Scroll, motion, drag, launch and activation

### Scroll is wheel quantization, not precise pixel delivery

Pinned dispatcher disassembly at `0xbc14e–0xbc1a3` gives:

- Default requested pixels: **800** (`0x320`).
- Divide by **100.0**, `roundf`, then clamp to at least **one** wheel click.
- Zero pixels is rejected.
- Direction maps to wheel buttons **4/5/6/7** for up/down/left/right.
- Each wheel press is held **36 ms** before release (`0xbc38e`, `0x2255100` ns).

A target-window scroll uses SendEvent and virtual pointer placement; a desktop scroll uses XTEST. An element origin is resolved spatially through the accessibility helpers, not through an AT-SPI ScrollTo operation in the traced coordinate route.

Probe results confirm the quantization: default→8 wheel presses; 0→error; 1,119,120,121→1; 240→2. Evidence: `W/traces/scroll-cases/results.json`, the per-case X11 logs, and `W/inventory/pinned-dispatcher.asm`. Thus “pixels” is an API convenience, **not pixel-accurate scrolling**.

### Move and drag

Targeted move sends synthetic EnterNotify/MotionNotify; it leaves the physical pointer untouched. `BackgroundWindow::move_to` (`0x7b2d0`) translates window-local coordinates and resolves child windows at the synthetic point.

Desktop `move_path` (`0xa7340`) queries the current physical pointer and interpolates to the target. Its step count is clamped to 1–10 from `ceil(distance / 160 × 10)`, with **8 ms** between moving samples. The actual pointer moves and is not restored by the helper.

`drag` holds button 1 while visiting/interpolating the supplied path and releases afterward. A recorded targeted 40-pixel horizontal drag produced MotionNotify samples at each x from 200 through 240, with Button1 state, bracketed by press/release. It did not use macOS’s three-drag-event recipe. Exact interpolation limits for arbitrary multi-segment drags remain partly in the unrecovered dispatcher.

`drag_handle` is a server-stateful **desktop** hold/move/end mechanism. It has no window input in the JS contract. It kept the button held across a screenshot in the probe; end released it. JS additionally enforces start-once, move-only-while-dragging and end-only-while-dragging. Evidence: `W/traces/{trace-misc,newest-trace-misc}` and `targets/linux/drag_handle.js`.

### Apps and explicit activation

`apps::desktop_entries` (`0x8d8a0`) and `expand_exec` (`0x8cae0`) discover desktop entries under XDG data/application directories and expand desktop Exec fields into argument vectors. `launch_app` spawns the discovered executable; it does not implement shell evaluation of the whole Exec string. The child application may itself be a shell script, as Google Chrome’s launcher is.

The observed app list included `org.gnome.gedit.desktop`, `google-chrome.desktop`, Terminal and X11VNC Server; windows were associated with entries. Launching existing gedit/Chrome IDs returned in **11–14 ms with tracing**, before UI completion. Chrome opened extra windows. There is no demonstrated “launch without raising” guarantee: application launch behavior can raise/open windows even though targeted input does not. Evidence: `trace-misc/{apps.json,wire.jsonl,strace.log}` and newest equivalents.

`activate_window` deliberately sends all three:

1. `_NET_ACTIVE_WINDOW` ClientMessage to the root, source indication 1.
2. ConfigureWindow stack mode Above.
3. SetInputFocus, revert-to PointerRoot, CurrentTime.

It changed actual focus and stacking, as expected, and restored the minimized fixture. Evidence: `trace-extra/x11.log` requests `000:011b–011f` and `000:02b2–02b6`.

## 10. Settling, deadlines and interference

### Three independent waits

1. **Composite retention:** WindowBuffer creation sleeps **100 ms**. This affects targeted input and window screenshots.
2. **Input target teardown:** `drop_in_place<InputTarget>`, ELF `0x506a0`, loads **100,000,000 ns** at `0x5071f` and sleeps before releasing the target. This is native, not JS. Evidence: `W/inventory/input-target-drop.asm`, and trace sleeps before UnredirectWindow.
3. **JS action settler:** `ActionSettler.defer()` sets a deadline at now plus `post_action_sleep_ms`, default **100 ms**. The next operation’s `wait()` waits out the remainder. It is a fixed deferred wait, not tree stability or a notification quiet period. It is unchanged in newest.

There is no observed general AT-SPI event subscription/quiet-period settle for ordinary Linux observation/actions. Newest field-edit confirmation is a distinct text-specific mechanism.

The pinned isolated native key cost is approximately **100 + 33 + 33 + 100 = 266 ms**, plus communication work. The next consecutive JS key adds approximately 100 ms, explaining the historical approximately 375–400 ms/key and the 16–17-second 43-key task. Newest removes about 33 ms from an ordinary press and from each standalone key_down/key_up.

### D-Bus and command limits

Pinned `Connection::connect` (`0x92350`) sets **2-second SO_RCVTIMEO and SO_SNDTIMEO**. `Connection::call` checks header/body lengths against **16 MiB** (`0x1000000`); it performs synchronous request/reply work and constructs D-Bus errors. These are I/O/message limits, not a 2-second whole-tree deadline.

The CLI advertises `--timeout-ms 30000`, but **it did not act as a request/traversal timeout in the server tests**. With values 1,25,100 and500, both builds completed get_window_state successfully in approximately405–432 ms and processed a following list_windows. Evidence: `W/traces/deadlines.json`. Its complete native meaning remains unrecovered; do not use that flag as the own engine’s observation deadline specification.

### User interference

No macOS-like generic input-intervention monitor, five-second HID debounce, or sticky “reobserve after user input” protocol was found in the inspected Linux modules or traces. Background-session teardown checks actual focus so it does not send synthetic FocusOut after the user has genuinely focused the target. Newest verified-paste also checks field focus, selection and desktop keyboard focus before dispatch, with refusal strings for changed focus/selection. Those are operation-specific race checks, not evidence of comprehensive human-input detection. No real-human concurrent-input experiment was run.

## 11. Timings and how to interpret them

### Untraced, interleaved comparison

Authoritative same-sitting comparison for the two builds: `W/traces/paired.jsonl` and `paired-summary.txt`. Native NDJSON round-trip times, excluding SSH and the desktop-state witness commands. Seven samples per tree mode; three per targeted input; five for desktop screenshots/listing. The runs alternate build order for observations. Ghidra jobs had finished; one-minute host load was **0.61–0.80**. Every observation was asserted to have `ax_tree_source=at_spi`.

Scenes: gedit scratch, **480 nodes**, 910×756; Chrome unique about:blank tab, **222 nodes**, 1050×780. Both targets were placed in the background for their respective measurements.

| Native method | gedit pinned / newest, ms | Chrome pinned / newest, ms |
|---|---:|---:|
| get_window_state, tree only | **506.1 / 435.9** | **314.7 / 326.3** |
| get_window_state, tree + window JPEG | **573.2 / 562.0** | **429.6 / 460.1** |
| move, window-relative | 202.8 / 203.6 | 202.7 / 203.5 |
| click, coordinate left | 215.1 / 216.3 | 215.3 / 216.1 |
| press_key, Right | **269.3 / 235.9** | **270.1 / 236.7** |
| key_down, Shift | 236.8 / 203.7 | 235.7 / 202.9 |
| key_up, Shift | 134.2 / 101.2 | 134.3 / 101.2 |
| scroll,120 requested pixels | 238.8 / 239.8 | 239.0 / 240.2 |
| drag,40-pixel segment | 254.2 / 251.5 | 254.1 / 251.0 |

Desktop/global rows: list_apps **14.2/16.5 ms**, list_windows **12.7/13.7 ms**, get_screenshot **31.0/30.7 ms**. Global operations are not inherently gedit/Chrome-scoped.

The tree distributions overlap substantially. Do not claim that newest uniformly speeds or regresses tree reading from this sample. Earlier untraced pinned measurements on the initial single-window scene were **254.8 ms** for both the480-node gedit tree and270-node Chrome New Tab tree; newest’s separate later run was420.6/395.8 ms. Those earlier runs differed in machine/scene history and are preserved separately, not used as a controlled build comparison. The owner’s “match or beat” bar should remember the faster successful pinned observations, not merely the final higher medians.

### Text, clipboard and less-common operations

- Pinned traced Chrome Unicode type_text: **895.8 ms**, verified correct, background-preserving.
- Pinned traced gedit Unicode type_text: **10,215.8 ms**, failure, unchanged text, app survived.
- Newest own-JS gedit Unicode type_text: **839.3 ms**, verified correct.
- Newest own-JS Chrome type_text: successful cases around**845–850 ms**; false-negative cases around**2,831–2,853 ms**, with requested text present.
- Newest own-JS type_characters, eight ASCII characters: **701.7/703.8 ms**, gedit/Chrome; returned8 and verified exact text.
- perform_secondary_action with tracing: gedit **408/405 ms**, Chrome **441/488 ms**, pinned/newest, success.
- Clipboard rows are in §7; they were traced, not apples-to-apples with the untraced table.
- Explicit activate_window, traced: approximately **5–9 ms** for ordinary mapped targets. Warm repeated activation in the untraced setup was sub-millisecond to about1ms; these measure dispatch, not a UI-settle promise.
- Launch existing app, traced: gedit **11.5/14.2 ms**, Chrome **13.1/12.2 ms**.
- Desktop drag_handle traced start/move/end: pinned **10.7/10.4/0.9 ms**, newest **8.4/7.2/5.3 ms**.
- Corrected desktop move_relative, traced: pinned **1.7 ms**, newest **10.8 ms** for a10-pixel move. An earlier test deliberately preserved its schema error (`x/y` instead of `dx/dy`) and is not a successful timing sample.

Actual cua facade smoke: pinned gedit bind/tree/key calls succeeded using existing fixture-pinned approvals. Three isolated pressKey calls reported **281.1,283.1,284.3 ms** in-cell. They were separated by observations and therefore are not a measurement of consecutive-key throughput. Evidence: `W/traces/facade/harness.jsonl`.

## 12. What most constrains cua’s design

1. **Keep genuine background delivery.** The proven baseline is SendEvent plus synthetic focus, without changing actual focus, stacking or physical pointer. An implementation that merely activates, acts and restores regresses the vendor even if the final desktop looks unchanged.
2. **Remove gratuitous waiting before optimizing microseconds.** Targeted input spends approximately200 ms in native fixed waits before JS settling or key pacing. Reusing safely retained rendering/session state is a high-value experiment; readiness must still be verified rather than assumed.
3. **Improve tree IPC without weakening identity.** Six-plus synchronous calls per node dominate observation. The newer async-reply infrastructure did not itself reduce tree call count. Cache/batched/pipelined alternatives should be evaluated against live apps, with honest truncation and deadlines.
4. **Separate key intent from literal text.** Legacy press_key uppercase behavior is not correct literal typing. Newest type_characters fixes layout-representable text but does not solve Unicode. Preserve both intents behind the unchanged facade.
5. **Do not copy the GTK PasteText defect.** Newest’s successful targeted Ctrl+V is a useful recipe. Its clipboard_write path still fails. A single unified, verified paste implementation would beat both builds.
6. **Distinguish rejected, applied and indeterminate edits.** Newest’s no-second-paste discipline is valuable, but false negatives after correct Chrome edits are dangerous if callers retry. Effect verification must be robust to application selection/autocomplete behavior.
7. **Make fallback explicit and measurable.** A one-node X11 tree is not equivalent to a semantic observation. Duplicate/stale accessible window identities and minimized windows need clear outcomes, not misleading performance credit.
8. **Screenshots are already background-capable but unnecessarily coupled.** Keep drawable-based retained capture, expose efficient screenshot-only work internally, and avoid forcing an accessibility walk or100ms buffer reacquisition for every image.
9. **Do not inherit “pixel scroll” precision claims.** Vendor pixels are rounded100-pixel wheel quanta with a minimum click. Better precision is an actual capability improvement, not merely a faster implementation.
10. **Define intervention policy deliberately.** Neither build establishes a general Linux human-input gate comparable to macOS. Field-focus checks alone are insufficient to claim that property.

## 13. Evidence index and handoff state

All paths in this list are absolute **on dc-linux171-1e68**.

### Binary and build provenance

- `/Users/new/.local/share/cua-171/inventory/nm.txt`, `strings.txt`, `newest-nm.txt`, `newest-strings.txt` — symbols and embedded build information.
- `/Users/new/.local/share/cua-171/inventory/{pinned-help.txt,newest-help.txt,newest-diff.txt,js-diff.txt}` — command/symbol/JS deltas.
- `/Users/new/.local/share/cua-171/downloads/release.json` and `/Users/new/.local/share/cua-171/inventory/ghidra-sha256.txt` — Ghidra release/hash verification.
- `/Users/new/.local/share/cua-171/vendor/index/{InRelease,Packages,verification.txt}` — newer package provenance.
- `/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/` — newer extracted binary, JS and declarations.

### Static work

- `/Users/new/.local/share/cua-171/ghidra/` — `linux171`, `newest171`, `newestfixed171` projects and analysis logs.
- `/Users/new/.local/share/cua-171/decomp/` —104 pinned function files;99 produced C, five reported failure.
- `/Users/new/.local/share/cua-171/decomp-repaired/` — targeted retry results and successfully recovered destructor routines.
- `/Users/new/.local/share/cua-171/decomp-newest-fixed/` —171 newer targeted entries;165 produced C, six failed. Prefer this over the preliminary `decomp-newest/` directory, while respecting the control-flow caveat in §0.
- Each decompilation directory has `INDEX.txt` mapping addresses/files/names.
- `/Users/new/.local/share/cua-171/inventory/{pinned-dispatcher.asm,newest-dispatcher.asm,accessible_node.asm,dbus_call.asm,input-target-drop.asm,key-literals.txt}` — disassembly/literal evidence supplementing C failures.

### Dynamic work

- `/Users/new/.local/share/cua-171/traces/{trace,newest-trace}/` — ordinary tree/input/screenshot cases; `wire.jsonl`, `dbus.log`, `dbus-counts.json`, `x11.log`, `strace.log`.
- `/Users/new/.local/share/cua-171/traces/{trace-extra,newest-trace-extra}/` — background effect verification, Unicode typing, activation, initial clipboard cases.
- `/Users/new/.local/share/cua-171/traces/{trace-clipboard,newest-trace-clipboard}/` — both apps’ clipboard-handle APIs and secondary actions.
- `/Users/new/.local/share/cua-171/traces/trace-element/` — no-action left-click refusal and synthesized element right-click.
- `/Users/new/.local/share/cua-171/traces/{trace-misc,newest-trace-misc}/` — listing, launch, desktop XTEST and drag handles, including child-process traces.
- `/Users/new/.local/share/cua-171/traces/{trace-minimized,newest-trace-minimized}/` — minimized refusals and corrected relative movement.
- `/Users/new/.local/share/cua-171/traces/scroll-cases/` — wheel quantization probes and individual X11 logs.
- `/Users/new/.local/share/cua-171/traces/paired.jsonl`, `paired-summary.txt` — final interleaved comparison with AT-SPI-source assertions.
- `/Users/new/.local/share/cua-171/traces/paired-duplicate-windows.jsonl` and `paired-stale-atspi.jsonl` — intentionally retained, non-comparable semantic-tree failures; do not merge their fast X11 fallbacks into the final tree benchmark.
- `/Users/new/.local/share/cua-171/traces/{timings,newest-timings}/wire.jsonl` — earlier untraced scene measurements.
- `/Users/new/.local/share/cua-171/traces/{newest-js.jsonl,newest-text-cases.jsonl,deadlines.json,newest-cursor-optin.json}` — newest JS/text/deadline/overlay probes.
- `/Users/new/.local/share/cua-171/traces/facade/harness.jsonl` — actual cua MCP smoke, pinned fixture approval and in-cell timings.
- `/Users/new/.local/share/cua-171/traces/facade/{stdin.ndjson,stdout.ndjson}` — three verified tee-captured calls from the direct pinned vendor JS client, **not** from cua serve.
- `/Users/new/.local/share/cua-171/traces/images/` and `image-metadata.txt` — preserved JPEGs and parsed dimensions/sampling/quantization.
- `/Users/new/.local/share/cua-171/tools/` — original research drivers, tee wrapper and Ghidra scripts for reproduction.
- `/Users/new/.local/share/cua-171/inventory/final-state.json` — clean checkout, decompilation counts and fixture ownership.

### What remains undetermined

- Complete dispatcher and `run` control flow, including the exact meaning of every native timeout and all restart/panic branches.
- Complete fallback priority among newest verified-paste routes, beyond the statically identified mechanisms and directly observed Ctrl+V route.
- Exact query-field predicate and all virtual-table sampling corner cases; large/deep-tree and table limit behavior was read statically rather than generated live.
- Handle-count limits and every clipboard deadline; multi-format/large-INCR behavior under contention.
- Every right-click advertised-action fallback case and arbitrary multi-segment drag interpolation cap.
- Visual cursor behavior with a compositor, and truly concurrent human-input safety.

These are explicit residual research tasks, not reasons to discard the verified recipes and performance opportunities above.

### Final state and reusable friction

`git -C /opt/cua status --porcelain` was empty. No repository files or vendor binaries were edited, no commits were made, and no VM was deleted/reprovisioned. The two probe-created Chrome windows and the unique blank test tab were closed. Chrome’s original window remains on New Tab. The owned gedit scratch fixture remains running as PID14228 on `/Users/new/.local/share/cua-171/tools/scratch.txt`, with test text; this is intentionally retained for follow-up. No tracing helper or Ghidra job remained running at the final process check.

The coordinator should record these reusable frictions in the Mac friction tracker:

- Ghidra rejects hidden path components in project paths. One failed import; workaround is the non-hidden symlink `/Users/new/cua171-analysis` into the required artifact directory.
- Rust optimized jump-table dispatch defeats full C recovery here even after exact symbol extents/overrides. Named helpers, disassembly and traces are the reliable fallback; retain the failed artifacts so the next session does not repeat the same120-second attempts blindly.
- cua’s launch layer overwrites OAI_SKY_LINUX_BIN; instrument direct vendor JS/helper or add an explicitly designed harness hook rather than assuming a parent environment override reached the child.
- xtrace’s XTEST decoder prints opcode132/2 as UNKNOWN; correlate/decode that request rather than concluding no XTest was used.
- An ad-hoc MCP client without form elicitation cannot bind a fresh approved fixture. The existing repository StdioClient plus pinnedApprovals solved this without broad approval or persistent policy changes.

