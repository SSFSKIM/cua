# Sky Linux behaviour: the specification cua's Linux engine is built against

For SSFSKIM/cua #171 (cua's own Linux native engine; child 4b of #114). This is M0's behaviour specification, task M0.1 of `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` (read at a7310121). The spec is cited as "Design, <paragraph>" by the paragraph's lead words, and its Decision Log entries by date and subject.

It consolidates the two readings in this directory, `A-linux-contract.md` (the JS side and the binary's static catalogue) and `F-linux-helper-logic.md` (tier 2: Ghidra and live traces), into one rule set for `native/linux-engine/` (M1a) and, where the JS contract is concerned, for cua's service (M3). The subject is OpenAI's `sky_linux_x64` from runtime 26.928.40906 (the pinned build, SHA-256 `7ac3c2ae…f1cd`), with the newest build 26.1023.51421 (`88ce5e0a…2991`) wherever it sets the other half of the bar. Where R/A and R/F did not settle a rule, this reading went back to the decompiled output, the disassembly and the recorded traces on the #171 VM (`~/.local/share/cua-171/`, called W below) and cites functions by name and ELF virtual address. No decompiled code is reproduced here: behaviour, constants, call order and sentences only (Constraints).

## How to read it

- **Source tags.** Every rule carries its source in square brackets.
  - `[A §n]` and `[F §n]` are the two research reports.
  - `[read: <function> 0x<VA>]` was read in the pinned binary's code by this reading (Ghidra output or disassembly; addresses are ELF virtual addresses, Ghidra's minus `0x100000`). `[newest: …]` is the same for 26.1023.51421.
  - `[traced: <W/traces/dir>]` was seen in a recorded trace (wire, `dbus-monitor`, `xtrace`, `strace`). Request numbers are `xtrace` sequence numbers.
  - "inference" inside a tag means the point is deduced, and the tag says from what.
  - `[cua: Design, <paragraph>]` and `[cua: Decision Log, <date> <subject>]` are cua's own rules.
  - "open §22.n" marks a rule this reading could not settle; §22 says what would settle it.
- **Precedence.** Code read here wins over R/F, which wins over R/A. A rule that changes what R/A or R/F says says so in the words "**corrects A §n**" or "**corrects F §n**", so they can be found by searching.
- **Departures.** Where cua departs, the rule gives both sides: "vendor: … / cua: …". A rule with no cua half is adopted as written for M1a.
- **Defects.** "**Vendor defect, not copied.**" marks vendor behaviour cua deliberately does not reproduce; each names the milestone that owns the departure.
- **Quotes.** Vendor sentences are verbatim in code spans, with `<id>`, `<n>` and the like for substituted parts. `{:?}` in a sentence means Rust Debug quoting of the argument (a string in double quotes, with escapes).
- **Errors on the wire.** A failing command's `error` is the error's context chain joined by `": "`, outermost first (anyhow's `{:#}`) [read: `sky_linux::run` 0x220e0; traced: every recorded error]. A sentence below that a caller adds context to appears inside such a chain; §20 lists the chains.

## 1. Process, CLI and the wire

- **CLI.** `sky_linux server [--mouse-size-px N] [--timeout-ms N] [--client x11-full-desktop]` (clap 4.6); `--mouse-size-px` defaults to 12 in the pinned build and 0 in the newest; `--timeout-ms` defaults to 30,000 and bounds no traced request (§19) [A §2.7; read: `sky_linux::run` 0x220e0, help text W/inventory/pinned-help.txt, newest-help.txt]. The vendor JavaScript passes `--mouse-size-px <v>` only when the option is truthy, then `server`, so `mouse_size_px: 0` is never forwarded [A §1.6]. cua: `cua-engine server [--mouse-size-px N] [--desktop shared|dedicated]` and `cua-engine --version` [cua: Interfaces and Dependencies].
- **Process start.** The vendor's `main` sets `RUST_LIB_BACKTRACE=full` before anything else, so its errors capture backtraces and its children inherit the variable; an error returned from the server loop prints `Error <message>` to stderr and exits 1 [read: `sky_linux::main` 0x283d0]. `OAI_SKY_LINUX_BACKTRACE=full` (ASCII case-insensitive) switches the wire `error` from the compact chain to the multi-line Debug form with `Caused by:` and the backtrace; any other value or none gives the compact form [read: initializer 0x4d170]. cua need not read that variable; the compact form is the contract.
- **Panics** abort the process (panic strategy abort): no response is written and no cleanup runs [read: `__rust_start_panic` 0x2d360]. The JavaScript then rejects every pending request with the exit diagnostics (`exit=<code>` / `signal=<signal>` plus the stderr tail) and spawns a new helper on the next request [A §1.6].
- **Framing.** One JSON object per line on stdin; the line's trailing `\n` or `\r\n` is stripped; a line that is blank after trimming is skipped with no response; there is no length cap. Invalid UTF-8 or a read error ends the server (`failed to read server request: <io error>`), with no response, exit 1. EOF exits 0 after orderly cleanup (§11.3, §13.5) [read: `run` 0x25a2e–0x27c09].
- **Request.** `{id, command, input}` with unknown keys refused (``unknown field `k`, expected one of `id`, `command`, `input` ``); `id` is any JSON value, echoed back unchanged (the JavaScript sends integers from 1); `command` is exact-case, one of the 20 commands of §2 or `server` (refused inside the server as `server command cannot be nested`) [read: `run` 0x25f5c–0x27a76, 0x272d8; A §2.3]. A missing `input` is `{}` on the JavaScript side [A §1.6]; how the helper answers a line it cannot parse as a request at all is open (§22.11).
- **Input parsing.** The command's input is deserialized after the request; a failure is the error `failed to parse command input: <serde message>`, e.g. ``failed to parse command input: unknown field `x`, expected one of `dx`, `dy`, `key` `` [traced: W/traces/trace-minimized; read: literal 0x26a63a].
- **Response.** Always the five keys in this order: `{"id":…,"ok":true|false,"output":…,"error":…,"restart":false}`; on success `error` is null, on failure `output` is null and `error` a string (How to read it, errors on the wire). Compact JSON, one line, flushed per response [traced: all 792 recorded responses and the raw stdout in W/traces/facade/stdout.ndjson; F §0]. `output` is a JSON value: an object (`get_window_state`), an array (`list_windows`, `list_apps`, `get_screenshot`), a string (`clipboard_read`'s handle) or null (every other command) [traced: one success of each command in W/traces/*/wire.jsonl]. cua answers in exactly this shape [cua: Design, The contract kept].
- **`restart`.** No recorded response has `restart: true` (11 recorded failures, all false); which errors set it in the vendor is open (§22.11). The JavaScript, on `restart: true`, kills the child and rejects its other pending requests [A §1.6]. cua sets it only for an unrecoverable engine state [cua: Design, Process model].
- **Execution.** Strictly sequential on one thread: a request is read, executed, answered and flushed before the next line is read; pipelined requests queue in the pipe and are answered in order [read: `run`]. The JavaScript may pipeline and correlates by id; unknown ids are ignored; a non-JSON line or one without a numeric id kills the child (`sky_linux server emitted invalid JSON: <line>`, `sky_linux server response missing numeric id`) [A §1.6].
- **Server-only commands.** Outside `server` mode, `key_down and key_up require sky_linux server` and `clipboard_read, clipboard_write, and clipboard_release require sky_linux server` [read]. cua has no one-shot mode.
- **The JavaScript's settle.** After each successful input the JavaScript defers the next eligible call by `max(0, post_action_sleep_ms ?? 100)` ms; listing, state and screenshot calls wait but do not defer; `clipboard_release` neither waits nor defers [A §1.6; vendor `targets/linux/action_settler.js`]. It is not the helper's, but it is part of the bar until M3's service replaces it (`settle.mjs`) [cua: Design, The service].

## 2. The command surface and the input schema

- **Setup.** `{target: "linux", methods: [perform_secondary_action, click, clipboard_read, clipboard_release, clipboard_write, drag, drag_handle, activate_window, get_screenshot, list_apps, list_windows, move, move_relative, press_key, key_down, key_up, scroll, type_text, launch_app, get_window_state]}`, plus `start_audio_recording` and `stop_audio_recording` with `SKY_ENABLE_AUDIO=1` (JavaScript only; audio is out of scope) [A §1.2; cua: Design, Scope]. An unknown method: `Sky runtime method is not available: <method>` [A §1.2].
- **Wire commands.** The same 20 names; the newest build adds `type_characters`; cua adds `capabilities` [F §1; cua: Design, The capability report].
- **Inputs**, from the shipped declarations (`types/full-desktop/*.d.ts`), the recorded requests and the helper's types. `W` is a Window; only its `id` (u32) is read (§3). Widths are the helper's storage types [read: dispatcher stores, `Target::deserialize` 0xc1670; traced]:

  | Command | Input fields | Defaults and checks |
  |---|---|---|
  | `list_windows`, `list_apps`, `get_screenshot` | none (`{}`) | |
  | `get_window_state` | `window: W`, `query?: string`, `include_screenshot?: bool` | screenshot absent = true (§5.6); query trimmed, empty = none (§5.5) |
  | `click` | `window?`, `element_id?: string`, `x?`, `y?` (i16), `mouse_button?: left\|right\|middle\|l\|r\|m`, `click_count?` (u32), `key?: string`, `duration?` (u64 ms) | count 1, hold 12 ms (§10.1) |
  | `perform_secondary_action` | `window: W`, `element_id: string`, `action: string` | §7.1 |
  | `scroll` | `window?`, `element_id?`, `direction: up\|down\|left\|right\|u\|d\|l\|r`, `pixels?` (u16), `x?`, `y?`, `key?` | pixels 800 (§10.3) |
  | `move` | `window?`, `x`, `y`, `key?` | §10.2 |
  | `move_relative` | `dx`, `dy` (i16), `key?` | unknown fields refused (traced) |
  | `drag` | `window?`, `path: [{x, y}]`, `key?` | ≥ 2 points (§10.4) |
  | `drag_handle` | `action: start\|move_to\|end` (the tag), `x`, `y` for start and move_to | §10.5 |
  | `press_key` | `window?`, `key: string`, `duration?` (u64 ms) | §11.3 |
  | `key_down`, `key_up` | `window?`, `key: string` | §11.3 |
  | `type_text` | `window?`, `element_id?`, `text: string` | §12 |
  | `type_characters` (newest) | `window: W`, `text: string` | §11.4 |
  | `activate_window` | `window: W` | §14 |
  | `launch_app` | `app: string` | §15 |
  | `clipboard_read` | `window: W` | §13 |
  | `clipboard_write` | `window: W`, `handle: string` | §13 |
  | `clipboard_release` | `handle: string` | §13 |

  Serde's own messages for a wrong type, a missing field or an unknown variant (``missing field `window` ``, ``unknown variant `x`, expected one of …``, ``invalid type: …``) appear after `failed to parse command input: `. Whether every input other than `move_relative`'s refuses unknown fields, and the exact serde text for out-of-range or fractional numbers (an `x` of 50.5 or 70000, a negative `pixels`), are open (§22.12); the wire fixtures and the harness record them (M0.3).
- **Validation sentences by command, in check order** [A §2.7; read: dispatcher; the element paths in §6–7]:
  - `click`: the `key` chord is parsed and resolved first (its errors come first); with `element_id`: `element click requires window`, `provide element_id or x/y, not both`, then any of middle, a `click_count` other than 1, a `key` or a `duration` gives `element click supports one left or right click without key or duration; use coordinates for other mouse options`; without it: only one of x and y gives `coordinate click requires both x and y`; a window with neither gives `window click requires coordinates or an element`.
  - `scroll`: `element scroll requires window`, `provide element_id or x/y, not both`, `x and y must be provided together`, `pixels must be non-zero` (after element resolution, §7.3).
  - `type_text`: `element typing requires window`, then §7.4, §12.
  - `drag`: `drag path must contain at least two points` (after the target is opened, §10.4).
  - `press_key`, `key_down`, `key_up`: `key must be a non-empty string`, `unsupported key=<part>` (§11).
  - `perform_secondary_action`: `action name must not be empty` (after the action reads, §7.1).
  - `launch_app`: `app must be a non-empty string` (§15).
  - The window checks of §3 and §8.1 (`X11 window <id> is not mapped`, `window <id> is not mapped; restore it before using background input or taking a screenshot`, `background input requires an application window`).
- **The JavaScript's own checks** happen before the wire and stay with the facade and the service: `Unknown element ID <id> for this window; refresh get_window_state()` (§6.1), the drag-handle sentences (§10.5), and the facade's refusals (`Linux scroll accepts { pixels }, not pages.`, `pixels must be a positive finite number.`, `selectText is unavailable on Linux.`, `setValue is unavailable on Linux; use click, pressKey, and typeText.`, `Linux paste supports only text format.`, …) [A §1.5].

## 3. Windows: listing, targets and coordinates

- **What `list_windows` collects, in order** [read: `windows::list_windows` 0x96ae0; traced: W/traces/trace, requests 0003–0033]:
  1. the focus: `_NET_ACTIVE_WINDOW` on the root; if the property is absent (empty), `GetInputFocus`'s window, compared raw. A present `_NET_ACTIVE_WINDOW` of 0 means nothing is focused, with no fallback;
  2. every id of `_NET_CLIENT_LIST_STACKING`, in property order (bottom to top), then any `_NET_CLIENT_LIST` id not already present, de-duplicated;
  3. then a walk of the window tree: `QueryTree` on the root, children pushed on a stack (topmost popped first, depth first). A window whose map state is not Viewable is neither listed nor descended into. A Viewable window is added when any of `_NET_WM_WINDOW_TYPE`, `WM_STATE`, `WM_TRANSIENT_FOR` or `WM_CLASS` is non-empty, or, for children of the root only, `_NET_WM_NAME`, then `WM_NAME`, then the override-redirect flag (the flag's identity is inference from the attribute layout). Every Viewable window is descended into whether it was added or not. The walk stops silently at 10,000 ids.
  4. Each id is described (below); a window that describes as None (not Viewable, or zero width or height) is skipped, and one whose description fails is **dropped silently**.
- **Consequences.** WM-unmanaged windows appear (popups and menus through `_NET_WM_WINDOW_TYPE`, Openbox's 1×1 supporting window at −100,−100 through its name, listed as `x11:4194591`). Minimized clients do not appear [read: as above; traced: W/traces/trace/windows.json]. **Corrects A §1.3** ("mapped app windows, dialogs and transients": the set is wider).
- **Atoms and properties.** Every atom is interned on every use (`InternAtom`, only-if-exists false, no cache), and every `GetProperty` asks offset 0, length 0x1000 longs, type Any, delete false [traced: W/traces/trace]. cua may cache atoms; the requests are not part of the contract.
- **The Window object, field by field** [read: `windows::describe_window` 0x98b60 and closures 0x999b0, 0x99be0, 0x99de0; traced: W/traces/trace/windows.json]:
  - `id`: the X window id, a number (u32).
  - `x`, `y`: the **client window's** origin in root coordinates (`TranslateCoordinates` window→root at 0,0), not the frame's; i16.
  - `width`, `height`: the client window's own `GetGeometry` size; u16. Zero gives None (the window is skipped).
  - `title`: `_NET_WM_NAME` if present, else `WM_NAME`; omitted when both are absent. Both are always fetched. Text goes through `property_text` (0x986d0): lossy UTF-8 decoding (so a Latin-1 `WM_NAME` decodes lossily, not as Latin-1), trailing NULs stripped, Unicode trim, empty → None.
  - `app`: `_GTK_APPLICATION_ID` (e.g. `org.gnome.gedit`); else the **last** NUL-separated segment of `WM_CLASS` after trimming, i.e. the class (`Google-chrome`), fetched only in this case; else `x11:<decimal id>`, also when reading `WM_CLASS` fails. `list_windows` never returns a desktop id; only `list_apps` rewrites `app` (§15). **Corrects A §1.4** ("desktop application identifier or X11 class").
  - `window_type`: the first atom of `_NET_WM_WINDOW_TYPE` (format 32 only), named by `GetAtomName`, with the prefix `_NET_WM_WINDOW_TYPE_` stripped and the rest ASCII-lowercased: `normal`, `dialog`, `popup_menu`, `dropdown_menu`, `tooltip`, `menu`, `utility`, `splash`, `toolbar`, `dock`, `desktop`, `notification`, `combo`, `dnd`, and any foreign atom lowercased whole. Omitted when absent or unreadable.
  - `modal`: `_NET_WM_STATE` contains `_NET_WM_STATE_MODAL`. An error reading `_NET_WM_STATE` fails the whole description, so the window is dropped.
  - `focused`: the focus from step 1 equals this id exactly.
- **Key order.** A Window serializes through a JSON map with its keys in alphabetical order: `app, focused, height, id, modal, title, width, window_type, x, y`; `title` and `window_type` are skipped when None [read: `Window::serialize` 0xc1460; traced: W/traces/facade/stdout.ndjson]. cua emits the same order, so outputs compare byte for byte.
- **A request's `window`.** The input type is `Target`, one field `id` (u32); every other field of the Window the JavaScript sends is ignored, and a missing `id` is serde's `missing field \`id\`` [read: `Target::deserialize` 0xc1670; traced: `{"window":{"id":18874616}}` accepted]. The engine trusts nothing else in the object: titles and positions are re-read from X11.
- **`get_window(id)`** (0x96630), used by `get_window_state` and by window-centred scroll: describe as above; None gives `X11 window <id> is not mapped` (minimized, unmapped and zero-size windows alike); an X error such as `BadWindow` propagates as x11rb's reply-error text [read; traced: W/traces/trace-minimized, four refusals in 1.9–6.1 ms; the `BadWindow` wording: open §22.1].
- **Window-relative coordinates.** `desktop_position(window, x, y)` (0x99eb0) translates window→root with no bounds check; `X11 window <id> is on another screen`, and X errors take the context `failed to translate coordinates for X11 window <id>` [read]. The bounds check happens when the pointer is placed (§8).
- **Minimized windows.** vendor: omitted from `list_windows`, and every window request on them fails (`X11 window <id> is not mapped` for observation; `window <id> is not mapped; restore it before using background input or taking a screenshot` for input and capture, §8) [F §2.4; read] / cua: listed with `minimized: true` and readable, from M4 [cua: Design, Minimized windows]. **Vendor defect, not copied** (M4); M1a reproduces the vendor.

## 4. Window association (finding the AT-SPI frame)

- **When it runs.** Every `get_window_state` and every element request re-associates from scratch on a fresh bus connection; nothing is cached between requests [F §2.1; read: `accessibility::at_spi_window` 0x7f2c0; traced: a new sender per observation].
- **Steps** [read: `at_spi_window` 0x7f2c0, `match_window` 0x7db80, `at_spi_window_size` 0x83cd0; traced: W/traces/trace/dbus.log sender `:1.6` serials 1–13, Chrome `:1.19` serials 2–8]:
  1. `get_window(id)` (§3) for the title (`_NET_WM_NAME`, else `WM_NAME`); `_NET_WM_PID`, which must be exactly one non-zero u32, else `X11 window <id> has no usable _NET_WM_PID`; and `WM_NAME` again, kept as a second title.
  2. The registry's applications: `GetChildren` on `org.a11y.atspi.Registry` at `/org/a11y/atspi/accessible/root`; for each application bus name in reply order, `org.freedesktop.DBus.GetConnectionUnixProcessID`, which must be one u32 equal to the PID (an error skips that application silently).
  3. For each application with that PID, in turn: `GetChildren` of its root (an error aborts), then `Properties.Get(org.a11y.atspi.Accessible, Name)` of **every** child. There is no role filter (no `GetRoleName` is sent here). A Name that fails or is not a string gives `AT-SPI window identity is unavailable`. **Corrects F §2.1** (which implies frames are chosen by role).
  4. No application with the PID: `AT-SPI provider with process ID <pid> is unavailable for X11 window <id>`.
  5. Title match: ASCII case-insensitive, equal byte length, no trimming. List A holds children whose Name matches the title, list B those matching `WM_NAME`; if the window has no title, every child is in A. Use A, else B; both empty gives no match (None).
  6. Same-title X11 siblings: once a candidate matches, `list_windows` runs (about 300 X requests and 50 ms in the traces, a hidden cost of every observation). A sibling is another listed window whose title or `WM_NAME` matches the first candidate's Name case-insensitively and whose `_NET_WM_PID` is not a definitely different PID (absent or 0 counts as the same process); with no target title, every same-process window is a sibling.
  7. Decision: exactly one candidate and no sibling is a match, with no size check (the traced gedit and Chrome cases). Otherwise:
     - no target title: `ambiguous AT-SPI window identity for X11 window <id>: multiple windows in process <pid> match the available identity`;
     - a sibling with the target's X11 width and height: `ambiguous AT-SPI window identity for X11 window <id>: X11 window <sibling> has the same title and size`;
     - else `Component.GetSize` of each candidate (two int32 > 0, else `AT-SPI window did not return a valid size`; a failure gives `ambiguous AT-SPI window identity for X11 window <id>: window size is unavailable` with the cause), keeping those exactly equal to the X11 size; not exactly one kept gives `ambiguous AT-SPI window identity for X11 window <id>: matching titles do not have one matching size`.
  8. Re-verification before accepting: `get_window`, `_NET_WM_PID` and `WM_NAME` are read again and must be equal (byte-exact this time, or both absent); where a size was used, the X11 size and `GetSize` again must still equal it; the frame's Name is read again and must be byte-equal. Any change gives `window identity changed while resolving X11 window <id>; retry the operation`.
- **The root** of the tree is the matched child itself (role `frame` for gedit and Chrome), not the application node [traced].
- **What a failure does to an observation.** In `get_window_state`, every association outcome other than a match (an error, None, an unreachable bus, the root node failing) is dropped and the request answers the X11 fallback tree (§5.7) with `ax_tree_source: "x11"`; none of the sentences above reaches an observation [read: dispatcher 0xb557e–0xb5f80]. They reach callers only through element requests (§6). **Corrects F §2.1**'s framing of them as refusals.
- **Duplicate windows.** Three Chrome windows with the same title and 1050×780 size gave the x11 fallback in all 28 traced runs, and closing two of them did not repair it while Chrome still exposed their frames [F §2.1; traced: W/traces/paired-duplicate-windows.jsonl, paired-stale-atspi.jsonl]. vendor: the one-node fallback / cua: screen position (`Component.GetExtents` in screen coordinates against the X11 window's translated origin) and stacking order break the tie, else the request fails with `Window <id> matches several accessibility windows; close or retitle the duplicates` [cua: Design, Window association]. **Vendor defect, not copied** (M4); M1a reproduces the fallback.

## 5. The tree read

### 5.1 The node

- **Calls per node, in order** [F §2.2; read: `accessible_node` 0x81d00, `role` 0x87440, `property` 0x87cf0, `text_property` 0x80950, `actions` 0x87550, `children` 0x87a70; traced: W/traces/trace/dbus.log from l.2416; totals match `dbus-counts.json`, gedit 3,038 and Chrome 2,440]:
  1. `Accessible.GetRoleName`;
  2. `Properties.Get(org.a11y.atspi.Accessible, Name)`;
  3. the same for `Description`;
  4. `Text.GetText(int32 0, int32 -1)`, only when the role is exactly `text` or `entry`, or for a sampled table cell (§5.4);
  5. `Accessible.GetState`;
  6. `Accessible.GetInterfaces`;
  7. if the interfaces include `org.a11y.atspi.Action`: `Properties.Get(org.a11y.atspi.Action, NActions)`, then `Action.GetName(int32 i)` for each i;
  8. for role `table` only: `Properties.Get(org.a11y.atspi.Accessible, ChildCount)` (§5.4);
  9. `Accessible.GetChildren`, then each child, depth first, in reply order.
- **Fields** [read: as above; traced: W/traces/trace/gedit.tree.json, Google-chrome.tree.json]:
  - `id`: `<bus name>:<object path>`, e.g. `:1.2:/org/a11y/atspi/accessible/73`.
  - `role`: the `GetRoleName` string verbatim (`push button`, `split pane`); `unknown` when the reply is not a string. A failing `GetRoleName` **drops the node and its subtree**.
  - `name`, `description`: omitted when the call fails, the value is not a string, or the string is empty; no trimming.
  - `value`: the `GetText` string verbatim, **including the empty string** (two Chrome `Search` entries carry `"value": ""`); omitted when the call fails or is not a string. The Value interface is never read (a `split pane` exposes it and gets no call); ordinary `table cell` nodes get no value.
  - `states`: `GetState` must return an array of exactly two u32 words, else the key is omitted (`AT-SPI GetState did not return a bitset`, `… two uint32 words`, both swallowed). Emitted in this order, every other bit dropped (`active` and `resizable` never appear):

    | AT-SPI state | bit | emitted |
    |---|---|---|
    | CHECKED | word 0 bit 4 | `checked` |
    | DEFUNCT | 6 | `defunct` |
    | EDITABLE | 7 | `editable` |
    | ENABLED | 8 | `enabled` |
    | EXPANDED | 10 | `expanded` |
    | FOCUSABLE | 11 | `focusable` |
    | FOCUSED | 12 | `focused` |
    | SELECTED | 23 | `selected` |
    | SENSITIVE | 24 | `sensitive` |
    | SHOWING | 25 | `showing` |
    | VISIBLE | 30 | `visible` |
    | INDETERMINATE | word 1 bit 0 (32) | `indeterminate` |
    | CHECKABLE | word 1 bit 9 (41) | `checkable` |

    An empty array is emitted when no mapped bit is set [read: `decode_states` 0x80560; traced: the frame's word `0x43200102` emits `enabled, sensitive, showing, visible`; the position of the last two rows: open §22.2].
  - `actions`: omitted when `GetInterfaces` lacks Action; `[]` when `NActions` is 0; else the `GetName` strings verbatim with their case (`showContextMenu`, `doDefault`). `NActions` must be a variant int32 ≥ 0. Any failure, a single `GetName` included, omits the whole key.
  - `children`: always present; `[]` when `GetChildren` fails or does not return an array (`AT-SPI GetChildren did not return object references`, swallowed); array entries that are not `(string, object path)` pairs are skipped.
- **Key order and omission.** A node serializes through a JSON map, keys alphabetical: `actions, children, description, id, name, role, states, value`; absent fields are skipped, never null [read: `AccessibilityNode::serialize` 0xc0940; traced: raw helper stdout in W/traces/trace/strace.log]. The vendor JavaScript adds `native_id` and replaces `id` (§6.1).
- **cua.** The same calls for the same fields, many in flight on one persistent connection, along the preorder frontier inside the admission window (W calls, R bytes, chosen by M0) [cua: Design, The tree read]. The traced call count per node is the bar for the over-budget bound; cua's count includes the `table` nodes' `ChildCount` and the re-reads of §5.4. A node whose `GetRoleName` fails counts in `truncated.failed` (M4) [cua: Design, The tree read].

### 5.2 Admission and limits

- **Preorder with one shared counter** [F §2.3; read: `accessible_node` 0x81d00, entry 0x81d19–0x81d2a]: the counter starts at 0 in the dispatcher and the root consumes one. Before reading a node, its admission is refused when the counter already exceeds 4,999 (`AT-SPI accessibility tree exceeded its node limit`) or when its depth exceeds 63, the root being depth 0 (`AT-SPI accessibility tree exceeded its depth limit`). Both checks run before any call for that node. So at most 5,000 nodes and depths 0–63.
- **Silent omission.** A refused or failed child (a limit, or a failed `GetRoleName`) is dropped with its subtree, and the walk continues with its siblings; nothing in the output marks it [F §2.3; read: recursion at 0x82168]. `GetChildren` is still called on admitted nodes after the budget is exhausted, so a full budget still costs one call per remaining admitted node's child list [read].
- **No deadline.** No whole-walk deadline and no string truncation; each call is bounded only by the socket's 2 s timeouts (§19) [F §2.3, §10].
- **If the root fails**, the request answers the X11 fallback (§5.7) [read].
- vendor: silent / cua: `truncated: {nodes, depth, failed}` beside the tree, and the facade's line [cua: Design, The tree read] (M4).

### 5.3 What is not on the path

No `Cache.GetItems`, `Properties.GetAll` or Collection match in either build; replies are consumed before the next request [F §2.2]. The newest build's asynchronous-reply code leaves the per-tree call count unchanged [F §2.2]. No visibility pruning: enabled, visible but not showing menu and header nodes are in the gedit tree [F §2.3].

### 5.4 The visible-table path

Read statically, never exercised by a trace [read: `tree_children` 0x80a90, `visible_table_cells` 0x83db0, `element_bounds` 0x816e0; F §2.3]:

- **Trigger.** Role exactly `table` (not `tree table`) and `ChildCount` a variant int32 greater than 5,000. A failing `ChildCount` falls back to `GetChildren`.
- **Budget.** 4,999 minus the counter before the table; a budget of 0 gives no cells.
- **Preconditions** on the table: `GetInterfaces` includes `org.a11y.atspi.Table` (else `AT-SPI table does not implement Table`); `GetState` includes showing and visible (else `AT-SPI table is not visible`); `Component.GetExtents(uint32 0)`, screen coordinates, gives a non-empty rectangle x1,y1,x2=x+w,y2=y+h (else `AT-SPI table has no visible bounds`).
- **Scan.** Rows from y = y1: for each row, x = x1 and next_y = y2; while x < x2, cells < budget and at most 5,000 hit tests in all: `Component.GetAccessibleAtPoint(int32 x, int32 y, uint32 0)` on the table, whose reply must be an `(s, o)` (an empty bus name means the table's bus); the null path `/org/a11y/atspi/null` gives `AT-SPI table hit test found no cell`, the table itself `AT-SPI table hit test returned the table`, a role other than `table cell` `AT-SPI table hit test returned a non-cell object`, a cell not showing and visible `AT-SPI table hit test returned a cell without visible bounds`; then the cell's `GetExtents`. A cell whose bottom is at or above y ends the row with next_y = y + 1. A cell whose right edge is beyond x must intersect the table (else `AT-SPI table hit test returned a cell outside the table bounds`), is kept once (de-duplicated by bus and path), and sets x = min(right, x2), next_y = min(next_y, bottom). Otherwise next_y = min(next_y, bottom) and x += 1. Then y = next_y until y ≥ y2. Stopping on the budget or the hit-test count returns the cells found.
- **Fallback.** Any error abandons sampling and lists the table's children with `GetChildren`, admitted normally. A single blank spot (a null hit) is such an error.
- **Sampled cells** are read as leaves with the normal field set plus `value` from `GetText` (role `table cell`), `children: []` and no `GetChildren`, in row-major discovery order. `GetRoleName`, `GetState` and `GetExtents` are therefore fetched twice per cell.
- Exact sentence boundaries above are the fragments' lengths as passed; the corner branches are open §22.3.

### 5.5 Query filtering

[read: `filter_children` 0x824d0 from disassembly; dispatcher 0xb598a–0xb59c9; no trace contains a query]

- It runs after the full walk (and after the X11 fallback, so it applies to both sources); it does not shorten the walk. **Settles F §3**'s open predicate.
- The query is trimmed, then lowercased with Unicode lowercasing; empty after trimming means no filter (inference for the exact trim set: open §22.4).
- Children are filtered recursively. A node matches when the lowercased form of any of `id`, `role`, `name`, `description` or `value` contains the query; states and actions are not matched. Because `id` is matched, a query such as `accessible` or `:1.` keeps everything.
- A node is kept when it matches or has a kept child; a matching node's non-matching descendants are pruned (it does not keep its whole subtree). The root is always kept, possibly with `children: []`.
- The vendor JavaScript numbers a query observation from a copy of the previous map (§6.1).

### 5.6 `get_window_state`'s assembly

[read: dispatcher 0xb557e–0xb67f7; traced: W/traces/trace, trace-extra, trace-minimized]

1. `get_window(window.id)` (§3); not mapped fails here, before any bus work.
2. A fresh accessibility-bus connection, association (§4), the walk (§5.1–5.4).
3. Both bus file descriptors closed.
4. The X11 fallback (§5.7) if anything in 2 failed.
5. The query filter (§5.5).
6. The screenshot, when `include_screenshot` is absent or true: retention (§9), `GetGeometry` (context `failed to read screenshot geometry for X11 window <id>`), capture (§16).
7. The answer: `{ax_tree, ax_tree_source, screenshots, window}` in that (alphabetical) key order; `window` is the fresh description from step 1, not the request's; `screenshots` is `[]` or `[{"filepath": …}]`.

What fails the request: step 1, X errors on the fallback's root, the screenshot, input parse errors. Nothing from the bus does. cua keeps that order of outcomes; its retention changes only when the setup cost is paid (§9).

### 5.7 The X11 fallback tree

[read: `x11_tree` 0x87e40; traced: the one-node case in W/traces/paired-duplicate-windows.jsonl]

- `ax_tree_source: "x11"` (else `"at_spi"`).
- A node: `id` `x11:0x<lowercase hex, unpadded>`; `name` `_NET_WM_NAME`, else `WM_NAME`, omitted if neither; `description` `WM_CLASS` with the NUL separator replaced by ` / ` (`google-chrome / Google-chrome`; trailing-NUL handling is inference); `role` `dialog` when `WM_TRANSIENT_FOR` is non-empty, else `window` at depth 0 and `container` below; no `states`, `actions` or `value`.
- `children`: `QueryTree` children that are not InputOnly and are Viewable, recursed in stacking order; child errors dropped. It is recursive, and is one node only because client windows rarely have mapped children. **Corrects F §2.4.**
- Limits: 5,000 nodes (`X11 window tree exceeded its node limit`) and depth 64 (`X11 window tree exceeded its depth limit`).
- Element requests refuse `x11:` ids (§6.2).

## 6. Element ids and resolution

### 6.1 Numbering (JavaScript)

[A §1.4; F §3; vendor `targets/linux/element_ids.js`]

- `ElementIds.assign` walks the **unpruned** native tree in preorder before rendering. One counter per client starts at 0 and is shared by all windows; each window has a native-id → decimal-id map. A full observation rebuilds the map, keeping an id for a native id the previous map had; a non-blank query starts from a copy of the previous map. Ids are never reused; printed trees may show gaps. Each node keeps its native id in `native_id`.
- `resolve`: an `element_id` of digits only is looked up in the request's window's map (no window: an empty map); found, it is replaced by the native id; not found, `Unknown element ID <id> for this window; refresh get_window_state()`. Any other string passes through as a native id.
- cua's service reproduces this exactly (M3) [cua: Design, The service].

### 6.2 Native resolution

[read: `element_with_ancestors_in_window` 0x86430, `element_in_window` 0x83b30, `find_element` 0x7d4f0, `find_visible_table_cell` 0x85a80; traced: W/traces/trace-element sender `:1.342` serials 8–69]

1. An id that starts with `x11:` (exactly, case-sensitive) is refused before any work: `element actions require AT-SPI; X11 fallback IDs only identify windows`.
2. `get_window(id)` (§3).
3. A bus connection: unavailable gives `AT-SPI accessibility bus is unavailable`; errors propagate.
4. Association (§4) from scratch: no frame gives `window has no AT-SPI accessibility tree`; association errors propagate (this is where §4's sentences reach a caller).
5. Preorder walk from the frame, children in reply order: each visit checks depth < 64 and visits < 5,000 (else `AT-SPI element search exceeded its tree limit`, which **aborts the request**), compares `<bus>:<path>` byte for byte with the id, and only if it differs calls `GetChildren`. A failing `GetChildren` makes that subtree empty. The frame itself is a valid target. **Corrects F §2.3** for this path (the limit is not swallowed here).
6. Not found: a second walk, `find_visible_table_cell`, with the same bounds (`AT-SPI element search exceeded its traversal limit`), reading `GetRoleName` and the table-aware children of §5.4 per node. If it finds the id, it wins, even over step 5's limit error; otherwise step 5's error, or `element is not in this window's AT-SPI tree; refresh get_window_state()`.
- **Ancestors** are collected nearest first, ending with the frame, for the right click's clipping (§7.2).
- **Identity only.** Only the bus and path are compared: no role or name fingerprint, no revision check [F §3].
- **Cost.** About 7 calls of association, one `GetChildren` per node before the target, and for a missing id about two full walks; a traced left-click refusal took 70 calls and 238 ms, of which about 172 ms were the association's X11 requests [traced: W/traces/trace-element].
- An id that is malformed, empty or `X11:` has no sentence of its own: it walks and is not found.

## 7. Element actions

### 7.1 Primary click and named actions

[F §5; read: `perform_action` 0x81800, `do_action` 0x88830, dispatcher 0xbaf3b–0xbb33a and 0xb6131; traced: W/traces/trace-extra `:1.58` serials 25–28, trace-clipboard ids 9 and 18, trace-element id 1]

1. Resolve the element (§6.2).
2. Read its actions: `GetInterfaces` (no Action: `AT-SPI element does not implement Action`), `NActions`, `GetName(i)`. Any failure here is wrapped: `AT-SPI element does not expose actions; refresh get_window_state(): <cause>`. Other causes: `AT-SPI GetInterfaces did not return an array`, `AT-SPI NActions did not return a variant`, `AT-SPI NActions returned a negative count`, `AT-SPI NActions did not return an integer`, `AT-SPI action has no name`, and D-Bus errors.
3. Choose the action:
   - **primary** (click with `mouse_button` left, `l` or absent): index 0 whatever its name; none gives `element has no primary accessibility action`. There is no AXPress-style preference table and no state or visibility check.
   - **named** (`perform_secondary_action`): a `action` empty after trimming gives `action name must not be empty` (checked after the reads); the **untrimmed** name is compared ASCII case-insensitively (A–Z only) and at full length against each `GetName`; two matches give `AT-SPI action {:?} is ambiguous`, none `AT-SPI action {:?} is unavailable; available actions: <list>`, the list being the names in Rust Debug form (`["click", "press"]`, `[]` when empty).
4. Open a targeted input session for the window (§8.1): retention, the 100 ms setup sleep, a synthetic FocusIn when the focus is not within it. The session is opened even though no X input is sent.
5. `Action.DoAction(int32 i)`: a reply other than boolean true gives `AT-SPI element refused action <i>; refresh get_window_state() to check its state` (i 0-based); an index above `i32::MAX` gives `out of range integral type conversion attempted`; D-Bus errors propagate.
6. Close the session: 100 ms sleep, FocusOut if synthesized, `UnredirectWindow`.
- **Result** `output: null`. A left click on a node with no Action (gedit's text view) **fails** rather than falling back to a coordinate click [F §5].
- **Cost.** Every element action pays the session's two 100 ms sleeps (a traced `DoAction` click took 290 ms, a secondary action 408–441 ms) [traced].
- cua: the same choice of action and the same sentences; the session's waits change only as §9 allows [cua: Design, Clicks, scroll, drag, move].

### 7.2 Right click on an element

[F §5; read: dispatcher, `element_position` 0x82db0, `element_bounds` 0x816e0; traced: W/traces/trace-element]

1. Resolve with ancestors (§6.2); open the session (§8.1).
2. `GetState` must include both showing and visible, else `element is not visible; scroll it into view before right-clicking`.
3. The visible point: `Component.GetExtents(uint32 0)` (screen) gives x0,y0,x1=x+w,y1=y+h (`AT-SPI element did not return bounds`, `AT-SPI element did not return valid bounds`); intersect with the window's rectangle from `get_window`; for every ancestor, nearest first and all of them, `GetRoleName` (not a string: `AT-SPI ancestor did not return a role`), and for role exactly `viewport` or `scroll pane` intersect with its `GetExtents` (an error there is ignored). Empty gives `element has no visible bounds in this window`. The point is the centre, x0 + (x1−x0)/2 and y0 + (y1−y0)/2 in root coordinates, floored, which must fit i16 (`out of range integral type conversion attempted`).
4. A coordinate click with button 3 at that point through the background route (§10.1).
- **Fallback when 1–3 fail** (read, not traced): resolve again (its error replaces the original), read the actions (an error returns the original error), and if exactly one action is named `showcontextmenu` (ASCII case-insensitive), open a new session and `DoAction` it; with none or several, the original error. A failure of the click itself does not fall back. **Settles F §5**'s "not reconstructed".
- Traced: gedit's text view, 13 ancestors, only the `scroll pane` clipped, point (825,388) on the root, (455,388) in the window; two Enter+Motion pairs, press and release of button 3 12 ms apart; no raise, no pointer move.
- Middle, multi-click, held key or duration on an element are refused (§2).
- **Newest:** `…before clicking` replaces `…before right-clicking`; new sentences `element is disabled`, `element has no primary accessibility action and is not editable` and `element now exposes accessibility actions; refresh get_window_state()` [newest: strings].

### 7.3 Element scroll

[read: dispatcher, not traced] `element scroll requires window`; with x or y also given, `provide element_id or x/y, not both`; resolve (§6.2); open the session; the point is the centre of the element's extents intersected with the window, **with no ancestor clipping and no state check**; then `pixels` is validated (`pixels must be non-zero` comes after resolution and the session); the key chord; the pointer is placed (§8.2) and the wheel route runs (§10.3).

### 7.4 Focusing an element before typing

[read: dispatcher 0xb8a58–0xb9775 and 0xbf443–0xbf5a0; not traced] For `type_text` with `element_id`:

1. `element typing requires window`; resolve (§6.2).
2. `GetState` must include editable, else `element is not editable; refresh get_window_state() and choose an editable element`; no focused or showing check.
3. Open the session.
4. Remember the caret and selection: `Properties.Get(Text, CaretOffset)` as int32 (`editable element did not return a caret offset`, `editable element did not return a valid caret offset`); `Text.GetNSelections`, and when positive `GetSelection(0)` as two int32 (`editable element did not return valid selection offsets`).
5. `Component.GetExtents(uint32 0)`; width or height ≤ 0 gives `editable element has no visible bounds` (no window or ancestor clipping).
6. A left click at the extents' centre (i16): pointer placement, press of button 1, 12 ms, release, then a 30 ms settle.
7. Restore what the click moved: `AddSelection(start, end)` when a selection was remembered, else `SetCaretOffset(caret)`; a reply other than true gives `editable element refused to restore its text selection`.
8. Typing continues in the same session (§12).
- The pinned build has no `GrabFocus`; the newest has it, and drops `editable element has no visible bounds` [newest: strings].
- vendor: always clicks the named element, then restores the caret or selection through AT-SPI / cua: observes first, clicks only an element without focus, never restores through `SetCaretOffset` or `AddSelection`, and revalidates before dispatch [cua: Design, Text and clipboard, steps 1–4; Decision Log, 2026-10-28 review round 1]. The vendor's restore is the call that fails on GTK4 (`SetCaretOffset … NotSupported`, A §3.3).

## 8. The background route (window-targeted input)

[F §4; read: `KeyboardState::target` 0x9a830, `focus_is_within` 0x7a760, `WindowBuffer::new` 0x88930, `BackgroundWindow::send_event` 0x7ad40, `BackgroundWindow::move_to` 0x7b2d0, `BackgroundSession::send_focus` 0x7d2d0, `drop_in_place<InputTarget>` 0x506a0, `Rc::drop_slow` 0x63f90; traced: W/traces/trace requests 0a9a–0ad8, trace-extra 0130, and F §4.3's witness]

### 8.1 The session

Opened per request that names a window (the input commands, the element actions of §7, and `type_text`), in this order:

1. `GetModifierMapping` (for the state field, §8.3).
2. The server-time anchor: an InputOnly 1×1 window at 0,0 under the root with event mask PropertyChange; `ChangeProperty` of `WM_NAME` (type STRING, empty, Replace); the `PropertyNotify` it causes gives the server time, paired with a monotonic instant taken then; `DestroyWindow`. No notify: `X11 did not return a timestamp for background input`.
3. `focus_is_within`: `GetInputFocus`, then up the `QueryTree` parents, at most 100 steps; the target itself is true; None, PointerRoot or the root is false.
4. Retention (§9): the window must be Viewable (else `window <id> is not mapped; restore it before using background input or taking a screenshot`), Composite `QueryVersion` 0.4 (context `background window rendering requires the X Composite extension`; with no extension at all, x11rb's bare `Unsupported extension`), `RedirectWindow` Automatic (context `failed to retain the target window's rendering buffer`), **sleep 100 ms**.
5. If the focus is not within the window: a synthetic **FocusIn**, detail Nonlinear, mode Normal, to the top-level target, `SendEvent` propagate false, mask 0. If that send fails, focus is checked again and FocusOut is sent to roll back.
- The root as target: `background input requires an application window`.
- **Teardown**, when the request ends: release any buttons 1–3 still held; **sleep 100 ms**; if FocusIn was synthesized and the focus is still not within the target, FocusOut (same detail and mode; a focus-check error is swallowed); `UnredirectWindow` (errors swallowed).
- **Held keys keep the session.** While any key is held for a window (`key_down`), its session persists across requests: the redirect, the synthetic focus and the anchor stay, and later requests to that window reuse it with no X requests; FocusOut and unredirect come when its last held key is released [read: `KeyboardState::acquire` 0x9ba90, `release` 0x9c190; traced: W/traces/trace 5635–5643, 11133–11150].
- **None of these requests** changes desktop state: no `_NET_ACTIVE_WINDOW`, `SetInputFocus`, `ConfigureWindow` stacking or pointer warp on this route; 30 traced operations per build left every witness field unchanged [F §4.2–4.3]. This is the bar [cua: Design, The background route].

### 8.2 Placing the pointer

`move_to(root x, y)`:

- The base window is the implicit-grab window while button 1, 2 or 3 is held, else the top-level target.
- Not grabbed: `TranslateCoordinates` root→base and `GetGeometry`; a point outside 0 ≤ x < w, 0 ≤ y < h gives `background pointer position is outside the target window`. Then the deepest child: up to 100 levels, `QueryTree` children topmost first, each Viewable child (InputOnly allowed) translated and tested with its `GetGeometry` (border excluded); descend into the first that contains the point. Then **EnterNotify** (detail Nonlinear, mode Normal, same-screen) and **MotionNotify** (detail Normal) to that window with its local coordinates, on every call, with no "already inside" check. **LeaveNotify is never sent.**
- Grabbed: one MotionNotify to the grab window, with no bounds check.
- The position (window, root and local coordinates) is stored for the button events.

### 8.3 Event fields

Every event is a checked `SendEvent` (propagate false, event mask 0; a `GetInputFocus` round trip follows each):

- `time`: the anchor's server time plus elapsed milliseconds (a clock regression clamps to +0). Focus events have no time field.
- `root`: the screen's root; `child`: always None; `same_screen`: true.
- `state`: the held-button mask OR the modifier masks of every keycode currently held **for this target** (from `GetModifierMapping`), computed before the event updates the bookkeeping, so a key's press carries the state without it and its release with it; the real keyboard state (NumLock, …) is never included.
- **Keys**: to the top-level target (not the focused child), root and event coordinates 0.
- **Buttons**: to the window and coordinates of the last `move_to` (none stored: `background pointer input requires a position`). Buttons 1–5 set or clear bit `1 << (b + 7)` after the send, so a release carries the pre-release mask; 6 and 7 have no mask bit; a press of 1–3 records the implicit grab, their release clears it.

## 9. Retention and the fixed waits

[F §8, §10; read: `WindowBuffer::new` 0x88930, `drop_in_place<WindowBuffer>` 0x50af0, `drop_in_place<InputTarget>` 0x506a0 (100,000,000 ns at 0x5071f); traced: 18 redirects in W/traces/trace = 6 screenshots + 12 input sessions]

- **Who redirects.** Every targeted-input session (except while a held key keeps one) and every `get_window_state` that includes a screenshot. Not a tree-only observation, and not the desktop `get_screenshot`.
- **The waits.** 100 ms after `RedirectWindow`; 100 ms before teardown (input sessions only); the JavaScript's deferred 100 ms after each input (§1). No `NameWindowPixmap` is ever sent: capture reads the window id itself. **Corrects A §2.5**'s capture vocabulary.
- **Cost floor.** About 200 ms plus round trips for a background pointer operation (a traced window-relative `move` took 207 ms) [F §11].
- vendor: per request / cua: retained from the first targeted request until the window is destroyed or the engine exits, waiting for the readiness condition M0 measures rather than a constant [cua: Design, Retention and the fixed waits]. The harness's retention cases check it after a resize, an unmap and remap, and a change while fully occluded.

## 10. The desktop route, clicks, move, scroll and drag

### 10.1 Clicks

[F §5; read: `full_desktop::click::click` 0x7a010, dispatcher; traced: W/traces/trace 0ac2–0ad8, trace-misc 1430–1461]

- Buttons: `left`/`l`/absent 1, `middle`/`m` 2, `right`/`r` 3.
- `click_count` (u32) defaults to 1, no upper bound; 0 still moves the pointer and clicks nothing [read; probe open §22.5]. `duration` (u64 milliseconds) is the hold; absent is **12 ms**, 0 is no sleep.
- With a position: the pointer is placed first (window: §8.2 after `desktop_position`; desktop: `move_path`, §10.2). Then for each click: press the `key` chord (§11), place the pointer again (window: `move_to`; desktop: one absolute XTEST motion), button press, hold, button release, release the chord. No delay between clicks beyond the hold.
- Window without coordinates or element: `window click requires coordinates or an element`. No window and no coordinates: XTEST press and release at the current pointer, with no motion.
- Validation order and sentences are in §2.

### 10.2 Move and relative move

[F §9; read: `move_path` 0xa7340, dispatcher arms 0xb2e00 and 0xb2ae0, `context::send_event_at_position` 0x96400; traced: W/traces/trace-misc, trace-minimized 0128]

- **The XTEST primitive.** `FakeInput(type, detail, time 0, root, x, y, device 0)`, then a sync round trip; buttons and keys carry x = y = 0.
- **`move` without a window.** Press the `key` chord, then `move_path` to (x, y): `QueryPointer` on the root; at the target already, one motion; else n = clamp(ceil(hypot / 160 × 10), 1, 10) and the points round(start + d·i/n) for i = 0…n, clamped to i16, consecutive duplicates removed, **the start included**; an absolute XTEST motion per point, 8 ms between points and none after the last. Release the chord. The pointer is not restored [traced: (640,400)→(1260,790) gave 11 motions from 640,400].
- **`move` with a window.** `desktop_position`, then `move_to` (§8.2), with the chord pressed first; the real pointer does not move.
- **`move_relative`.** Desktop only: press the chord, one `FakeInput(MotionNotify, detail 1 = relative, root None, dx, dy)`, release. No interpolation, no `QueryPointer`. `dx`, `dy` are i16; out-of-range values are a serde error, with no sentence of the helper's own (inference). Its input denies unknown fields [traced: ``unknown field `x`, expected one of `dx`, `dy`, `key` ``].

### 10.3 Scroll

[F §9; read: dispatcher 0xbbce0–0xbc4f9 (default `0x320` at 0xbc14e, 36 ms `0x2255100` ns at 0xbc38e); traced: W/traces/scroll-cases]

- `pixels` (u16) defaults to **800**; 0 gives `pixels must be non-zero`; negative or above 65,535 is a serde error (inference from the type).
- Steps: max(round(pixels / 100), 1), rounding half away from zero (50 → 1, 150 → 2, 120 → 1, 240 → 2, default 8).
- Buttons by direction: up/u 4, down/d 5, left/l 6, right/r 7. Each step: press, hold **36 ms**, release, no gap.
- The point: an element (§7.3); x and y (window-relative through `desktop_position`, or desktop); only one of them, `x and y must be provided together`; element with x/y, `provide element_id or x/y, not both`; a window with neither, the window's centre (width >> 1, height >> 1) from `get_window`; no window and neither, the current pointer with no motion.
- Order: parse `key`, place the pointer (background `move_to` or desktop `move_path`), press the chord, the steps, release the chord.
- Background wheel releases carry the Button4/5 mask. "Pixels" is a convenience, not pixel scrolling [F §9]; pixel-precise scrolling is backlog [cua: Design, Scope].

### 10.4 Drag

[F §9; read: dispatcher 0xb6e9c, interpolation 0xb80e2–0xb8259; traced: W/traces/trace (40 px drag: 41 MotionNotify, x 200…240, state Button1)]

1. Open the target. A window drag pays the full session setup **before** the path is checked.
2. Window drag: each point is translated to the root (`desktop_position`, one `TranslateCoordinates` per point).
3. Fewer than two points: `drag path must contain at least two points`.
4. Place the pointer at p0 (`move_to`, or `move_path` from the current pointer); press the chord; place again at p0 (`move_to`, or one absolute XTEST motion); press button 1.
5. For each consecutive pair a→b: n = max(1, trunc(hypot(dx, dy))); for i = 0…n the point a + (i·dx/n, i·dy/n) with **integer division truncating toward zero**; a motion, then **1 ms** sleep, after every sample including the last. The joint point between segments is sent twice; no cap on the number of motions.
6. Release button 1, release the chord, close the target.
- Window drags move under the implicit grab, so points outside the window are allowed after the press (§8.2). **Settles F §9**'s open interpolation.

### 10.5 drag_handle

[F §9; A §1.2; read: dispatcher 0xb4bf8, 0xb7227; traced: W/traces/trace-misc 0252–0262]

Desktop only, input internally tagged on `action`: `start {x, y}`: `move_path`, one absolute motion, press button 1; `move_to {x, y}`: `move_path`; `end`: release button 1, with no motion. The helper keeps **no state**: start-once, move-while-dragging and end-while-dragging are the JavaScript's rules (`drag handle can only be started once`, `drag handle must be started before moving`, `drag handle must be started before ending`, A §1.5); a stray `end` releases button 1. The button stays held across other requests (it was held across a screenshot).

## 11. Keys

### 11.1 The chord grammar

[read: `keys::keys` 0x94a10; all 164 name immediates decoded]

- **Splitting.** The key string is split on `+`; every part is trimmed (Unicode whitespace; the predicate is inference). An empty part toggles a flag: a second consecutive empty part emits `plus` (0x2b); any non-empty part clears the flag. So `+` → [plus], `ctrl++` → [Control_L, plus], `+++` → [plus, plus], `ctrl+` → [Control_L], `a++b` → [A, B] (a lone empty part is dropped), and `""` or `"  "` → [] (refused by the caller, §11.3). Order and duplicates are kept (`a+a` → [A, A]).
- **Normalizing.** Each part is ASCII-lowercased; then a leading `xk_` is stripped when the part is at least three bytes (`XK_Return` works).
- **A single printable ASCII character** maps directly: letters to the **uppercase** keysym (`a` and `A` both XK_A … XK_Z, 0x41–0x5a; the lowercase keysyms 0x61–0x7a are never produced); digits and printable punctuation to their Latin-1 code. Any other single byte is unsupported; non-ASCII characters are unsupported.
- **Names** (after lowercasing and stripping), the complete table:

  | Names | Keysym |
  |---|---|
  | ctrl, lctrl, control_l | Control_L 0xffe3 |
  | rctrl, control_r | Control_R 0xffe4 |
  | alt, lalt, alt_l | Alt_L 0xffe9 |
  | ralt, alt_r | Alt_R 0xffea |
  | shift, lshift, shift_l | Shift_L 0xffe1 |
  | rshift, shift_r | Shift_R 0xffe2 |
  | meta, lmeta, meta_l | Meta_L 0xffe7 |
  | rmeta, meta_r | Meta_R 0xffe8 |
  | super, lsuper, super_l | Super_L 0xffeb |
  | rsuper, super_r | Super_R 0xffec |
  | enter, return | Return 0xff0d |
  | kpenter, kp_enter | KP_Enter 0xff8d |
  | esc, escape | Escape 0xff1b |
  | tab | Tab 0xff09 |
  | bsp, backspace | BackSpace 0xff08 |
  | del, delete | Delete 0xffff |
  | ins, insert | Insert 0xff63 |
  | home, end, left, up, right, down | 0xff50, 0xff57, 0xff51, 0xff52, 0xff53, 0xff54 |
  | pgup, page_up; pgdn, page_down | Prior 0xff55; Next 0xff56 |
  | pause | 0xff13 |
  | scrlk, scroll_lock | 0xff14 |
  | sysrq, sys_req | 0xff15 |
  | numlk, num_lock | 0xff7f |
  | caplk, caps_lock | 0xffe5 |
  | space, spacebar, sb | space 0x20 |
  | f1 … f20 | 0xffbe … 0xffd1 |
  | kp0 … kp9, kp_0 … kp_9 | 0xffb0 … 0xffb9 |
  | plus, less, greater, percent, exclam, dollar, period, ampersand, asterisk, question | `+ < > % ! $ . & * ?` |
  | slash, fslash; bslash, backslash | `/`; `\` |
  | comma, minus, colon, semicolon, equal, at, bar | `,` `-` `:` `;` `=` `@` `\|` |
  | grave | the backtick, 0x60 |
  | parenleft, parenright, braceleft, braceright, bracketleft, bracketright, quotedbl, apostrophe, numbersign, underscore, asciitilde, asciicircum | `( ) { } [ ] " ' # _ ~ ^` |

- **No other names.** There is no `XStringToKeysym` fallback: `control`, `ctl`, `cmd`, `command`, `win`, `option`, `altgr`, `prior`, `next`, `pageup`, `print`, `menu`, `kp_add` and the lowercase-letter keysym names all fail (`xk_a` still gives 0x41). The error is `unsupported key=<part>`, the part lowercased and stripped (`XK_Foo` → `unsupported key=foo`).
- **Newest** adds Menu 0xff67, KP_Multiply … KP_Divide 0xffaa–0xffaf and KP_Equal 0xffbd under names such as `menu`, `next`, `kp_add`/`kpadd`, `kp_decimal`, `kp_equal`, `kp_multiply`, `kp_separator`, `kp_subtract` [newest: keysym-constant diff; full name table open §22.6]. cua accepts the pinned table exactly in M1a; adopting the newest names is an additive deviation the deviations list would declare.

### 11.2 Keysyms to keycodes, and Shift

[F §6.1; read: `key_presser::resolve_keysyms` 0x79d50; traced: W/traces/trace connections 001–003, trace-extra/x11.log:694]

- The vendor opens a **fresh Xlib display per call** (`XOpenDisplay(NULL)`, so `$DISPLAY`) and closes it after; an empty list opens nothing.
- For each keysym in order: `XKeysymToKeycode` (0 gives `resolve_keys failed xlib::XKeysymToKeycode keysym=0x<lowercase hex, unpadded>`), then `XKeycodeToKeysym` at index 0 and 1 only.
- **Shift is synthesized** (Shift_L's keycode pushed before the key's) only when the keysym is **not** in 0x41–0x5a, no Shift has been seen earlier in the chord (a synthesized one or an explicit Shift_L/Shift_R), and the keysym is at level 1 but not level 0. Shift_L without a keycode: `resolve_keys failed xlib::XKeysymToKeycode for synthesized Shift`. At most one Shift per chord; no other modifier is ever synthesized.
- **Consequences.** Letters never get Shift: `press_key("Z")` types z in both builds, and upper case needs `shift+z`; `!` and `@` get Shift; a symbol only at level 2 or above (AltGr) is pressed unmodified, with no error, giving its base symbol (open §22.7 for real layouts). `XKeysymToKeycode`'s XKB order scans level 0 across all keycodes first, so on pc105 `<` may resolve to keycode 94 rather than Shift+comma (inference from libX11).
- cua: the same semantics without libX11: `GetKeyboardMapping` through x11rb, with the lookup order and the level 0/1 rule reproduced so that the same chord gives the same keycodes and Shift [cua: Design, The engine; Keys]. The A–Z exclusion stays: it is what keeps `Ctrl+Z` undo [cua: Decision Log, 2026-10-28 review round 1, keys].

### 11.3 press_key, key_down, key_up

[F §6.1; read: dispatcher 0xb4740–0xb64f8, `KeyboardState::{target 0x9a830, acquire 0x9ba90, release 0x9c190, key_down 0x9c890, key_up 0x9a570}`, `normalized_chord` 0x9cad0, `drop_in_place<X11FullDesktopClient>` 0x51ba0; traced: W/traces/trace-extra 1462–1471, trace 5585–5643]

- **press_key order.** Open the target (window session, §8.1, or desktop) **before** parsing; parse and resolve; no keycodes gives `key must be a non-empty string`; acquire; hold; release; close the target. So a bad key on a background window still costs a FocusIn/FocusOut pair and the 100 ms teardown (open §22.8 to confirm by trace).
- **acquire.** For each keycode in chord order: already held for this target, increment its count with no event and no sleep; else KeyPress, count 1, append to the press order, **sleep 33 ms**. Overflow: `held key reference count overflow`. A failure releases what this call acquired and returns the error.
- **Hold.** `duration` is milliseconds (u64, no clamp found); the extra sleep is duration − 33 ms, saturating; no duration, none. So the gap from the last press to the first release is max(duration, 33 ms).
- **release.** Keycodes in reverse press order (LIFO). Count above 1: decrement only; absent: skip; count 1: KeyRelease, remove, **sleep 33 ms**. A failed send leaves the key counted and keeps the first error. **Corrects F §6.1**: the 33 ms is per new key edge, not per routine.
- **Timeline** (traced, Chrome, `ctrl+l`): Ctrl↓ (state 0), 35 ms, l↓ (state Control), 35 ms, l↑ (Control), 37 ms, Ctrl↑ (Control); about 266 ms on the wire.
- **key_down.** Normalize the chord (`keys` only: aliases, case and `xk_`; order and duplicates kept, so `ctrl+shift` and `shift+ctrl` are different holds); empty gives `key must be a non-empty string`. The hold's identity is (window id or the desktop, keysym list). Already held: no-op, no X traffic. Else resolve, open the target, acquire, record the hold with its keycodes, close the per-call target (the held key keeps the session, §8.1).
- **key_up.** Normalize (so an unknown or empty key fails even when nothing is held); a hold not found, a different window or the desktop included, is a **no-op**, and the hold stays. Else remove the hold, take the cached target, release its keycodes; a target failure re-inserts the hold, a partial release re-inserts it with the unreleased keycodes (medium confidence).
- **Shared keys.** Counts are per (target, keycode), shared with `press_key` and with the `key` chords of click, move, scroll and drag (`KeyPresser::new` 0x79c20 and its drop 0x50570): `key_down ctrl+a`, `key_down ctrl+b`, `key_up ctrl+a` releases only a.
- **Exit.** On orderly teardown (stdin EOF) the client releases every held key in reverse press order through its target, 33 ms apart, ignoring send errors; a killed helper releases nothing [read: 0x51ba0]. Holds survive the JavaScript kernel's resets because the helper does [A §1.6].
- **Desktop keys** are XTEST `FakeInput` type 2/3, detail the keycode, time 0, the server computing the state; no modifier mapping, anchor or teardown (a desktop Escape took 74.8 ms) [traced: W/traces/trace-misc 1530/1537].
- **Newest.** `acquire` and `release` have no sleeps; `press_key` presses all keys back to back, holds max(duration, 33 ms) once, and releases all back to back [newest: 0xc8010, 0xc8640, dispatcher 0xe272e–0xe2821; traced: W/traces/newest-trace-extra 1472–1481]. That is 33 ms per press instead of 4 × 33 ms for a two-key chord.
- cua: the vendor's events and states exactly (held-chord equivalence tests against both builds), with pacing kept only where M0 shows a toolkit drops faster keys [cua: Design, Retention and the fixed waits; Keys].

### 11.4 type_characters (newest)

[F §6.4; newest: dispatcher 0xe4718, `KeyboardState::type_characters` 0xc6bc0, `literal_keycodes` 0x88870, `resolve_on_display` 0x88ac0, `KeyPresser::type_character` 0x883b0; traced: W/traces/newest-js.jsonl lines 6, 13]

- Input `{window, text}`; `window` required (a parse error otherwise); no empty-text check (`""` presumably answers 0, inference). The target is opened before any character is checked.
- Every character is resolved up front on one display, and the first failure aborts before anything is sent:
  - U+0000–U+001F and U+007F–U+009F (tab and newline included): `cannot type control character <char {:?}> as literal text`;
  - keysym = the code point below 0x100, else 0x01000000 + code point (é → 0xe9, Ω → 0x10003a9);
  - no keycode: `resolve_keys failed xlib::XKeysymToKeycode keysym=0x<hex>` (traced for `éΩ🙂` on the US layout);
  - a keycode with the keysym at neither level 0 nor 1: `cannot type literal keysym 0x<hex> on this keyboard layout`;
  - else the Shift rule of §11.2 **without** the A–Z exclusion, so `A` gets Shift.
- Per character: acquire, 33 ms, release, then 33 ms unless it is the last. Output: the number of characters sent (`" AbZ09!?"` → 8, about 702 ms through the newest JavaScript). A failure mid-string: `typing interrupted after <n> complete characters; inspect the window before retrying` over the cause.
- cua: the same input and output; it refuses the first character the layout cannot produce with `Character <c> is not on the keyboard layout`, before sending anything [cua: Design, Keys]. The control-character and level rules are adopted; their sentences are cua's single refusal (a declared deviation in the sentence only).

## 12. Text entry

### 12.1 Pinned `type_text`

[F §6.2; read: dispatcher 0xb8a12 onward, `clipboard::paste_owner` 0x9cbf0, `accessibility::focused_editable` 0x831d0, `focused_context_action` 0x852d0, `perform_editable_clipboard_action` 0x86dd0; traced: W/traces/trace-extra (Chrome success, gedit failure), W/traces/trace-extra/dbus.log:73780]

1. **Validation.** `text` required (a parse error otherwise); `element_id` without `window`, `element typing requires window`.
2. **Focus the element** if `element_id` is given: always a click, then the caret or selection put back (§7.4), even when the element already had focus.
3. **Empty text** is accepted: after step 2 the helper sleeps 512 ms and answers success, with no clipboard work [read: 0xbf5a6].
4. **Lock and snapshot** (§13.2, §13.3): the display lock, the current CLIPBOARD state, a snapshot of the prior clipboard (empty when it had no owner). Text above 0x1555555 bytes (64 MiB ÷ 3) is refused here, after the lock and snapshot: `clipboard text exceeds byte limit`.
5. **Own CLIPBOARD** with the text (§13.4): an owner serving `UTF8_STRING`, `text/plain` and `text/plain;charset=utf-8`, taken **unconditionally**.
6. **Paste into the focused element.** `paste_owner` finds the window's focused element again (a walk of `GetChildren` and `GetState` looking for focused; it does not use `element_id`), then chooses a route by what the element implements:
   - **EditableText** (gedit's text view): read `CaretOffset`, `CharacterCount`, `GetNSelections` (at most one selection; a selected range is deleted with `DeleteText` first), then `EditableText.PasteText(caret)`. Then poll `CharacterCount` every ~20 ms; success is the count rising. On gedit 46 x64, `PasteText` answers true and inserts nothing, so the poll runs to the command's 10 s deadline and fails with `editable Paste did not insert text` after about 10.2 s (the post-paste caret refusal is the sibling sentence; gedit survives; arm64 crashed instead, A §3.3) [traced: PasteText(54) → true, then CharacterCount 54 from +514 ms to the deadline, W/m01/text extract of W/traces/trace-clipboard].
   - **Context menu** (Chrome's omnibox: Action and Text, no EditableText): `DoAction` of the element's `showContextMenu`, then a search of the application's frames for the menu that opened (`GetRoleName` per node down to role `menu`, then each `menu item`'s Name) and `DoAction(0)` on the item labelled Paste (`Paste Ctrl+V` was chosen over `Paste and search for …`; the exact label rule is open §22.13). Success is the clipboard transfer having been served and 512 ms passing with no further request; the field's text is never read [traced: W/traces/trace-extra, Chrome, `cua171 Ωé🙂`, 896 ms].
   - A window-level Edit menu route exists (`edit_menu_item` 0x80bf0); its place in the route order is open §22.13.
7. **Restore** the prior clipboard (§13.5), whatever the paste's outcome; then release the lock.
- **Sentences** on this path: `editable Paste did not insert text`, `clipboard text exceeds byte limit`, `clipboard paste timed out`, `clipboard owner stopped during paste`, the lock's and the snapshot's (§13), the restore's (`failed to restore clipboard`; with a failed paste, `<paste error>: also failed to restore clipboard: <cause>`; their order on the wire is open §22.14), and §7.4's.
- **EditableText calls.** The pinned build calls `PasteText`, `CopyText` and `DeleteText`; never `InsertText` or `SetTextContents` (absent from its strings) [A §2.4].

### 12.2 Newest `type_text` (verified paste)

[F §6.3; newest: `verified_paste::TextField::{observe 0x95a80, ensure_focus 0x93ba0, ensure_selection_unchanged 0x95680, confirm_edit 0x93660}`, `DesktopKeyboardFocus` 0x92ac0–0x92c50, dispatcher 0xcb7e5–0xcb832; traced: W/traces/newest-js.jsonl, newest-text-cases.jsonl, W/m01/text extracts of newest-trace-extra]

1. Observe the field: `GetText(0, -1)`, `GetNSelections`/`GetSelection(0)`, `CaretOffset`, `GetInterfaces` and its actions.
2. Check focus, selection and the desktop keyboard focus; on a change before dispatch, refuse with nothing sent (`requested field or selection changed before dispatch; no Paste was sent`, `window no longer has desktop focus; no Paste was sent`).
3. Own CLIPBOARD (§13.4) and send **Ctrl+V** to the window through the background route (§8). No `PasteText` on this path.
4. Wait for the transfer (the 512 ms quiet rule, §13.4), then confirm until min(now + 2 s, the 10 s command deadline), sleeping at most 60 ms between reads of the text, selection and caret.
5. Unconfirmed after dispatch: no second paste or typing fallback. Traced chains: `text insertion was not confirmed; no fallback or second Paste was sent: Paste was sent once; inspect the field before retrying: field text was still unchanged; inspect the field before retrying`, and the same ending `text changed but could not confirm the requested edit; inspect the field before retrying`.
- Measured: gedit Unicode success 839 ms; Chrome success 845–850 ms, but false errors after correct edits in 2,831–2,853 ms (`ASCII-one`, `combining-é`), so not a Unicode-only bug [F §6.3, §11].
- The newest build also contains `InsertText` (in `without_paste`) and `SetTextContents` (in `replace_selection`) and a literal-typing fallback; the traced successes used none of them, and their priority is unrecovered [F §6.3; open §22.13]. Its `clipboard_write` still uses `PasteText` and fails on gedit in 10.2 s [F §7].
- Other newest sentences: `Paste was sent but delivery is uncertain ({}); inspect the field before retrying`, `paste shortcut dispatch interrupted; inspect the window before retrying`, `sent paste shortcut to the window but could not confirm a clipboard read; no second paste or typing was sent`, `native menu opened without an available {}; no clipboard action was sent`, `Copy produced no readable clipboard content`, `could not preserve the clipboard ({})`, `input was sent; failed to restore clipboard` [newest: strings at 0x2cfd18 and 0x2d1c44].

### 12.3 cua's route

vendor: `PasteText` (pinned) or targeted Ctrl+V with a confirm that compares the whole field (newest) / cua: one route for `type_text` and `clipboard_write`: observe, focus only if needed, lock, snapshot, own, revalidate, one targeted Ctrl+V, confirm the inserted segment (20 ms polls, 2 s), applied / not applied / unconfirmed, one guarded cleanup; `PasteText`, `InsertText` and `SetTextContents` never called [cua: Design, Text and clipboard; Constraints]. In M1a, `type_text` and `clipboard_write` answer `type_text is not available in this engine build` (declared deviation until M2) [cua: Plan of Work, M1a]. What M2 takes from the vendor: the formats (§13.4), the targeted Ctrl+V of §8 and the newest build's no-second-paste rule; §21 lists where the Design's wording and this reading differ.

## 13. Clipboard

### 13.1 The commands

[F §7; read: dispatcher 0xad78c (`clipboard_read`), 0xb51d4 (`clipboard_write`), 0xae9e6 (`clipboard_release`); traced: W/traces/trace-clipboard, newest-trace-clipboard]

- **`clipboard_read {window}`**: refused before anything else when 32 handles are stored (`too many clipboard handles; release unused handles`); then the lock (§13.2); the current CLIPBOARD state; the application's **Copy** on the focused element, by the same route choice as §12.1 step 6 (gedit: `EditableText.CopyText(start, end)` of the current selection after reading caret, count and selection; Chrome: `showContextMenu`, then the menu item labelled Copy); a wait, polling every 5 ms, for the CLIPBOARD owner to change (`clipboard update timed out`; no owner after Copy: `Copy cleared the clipboard`); the snapshot (§13.3); the handle-storage check (stored bytes plus the snapshot above 256 MiB: `clipboard handle storage is full; release unused handles`); store; release the lock. The prior clipboard is **not** restored: the application's copy stays on it. Output: the handle string. Measured 519–750 ms.
- **`clipboard_write {window, handle}`**: an unknown handle is refused **before** the lock (`unknown clipboard handle; copy again in this Linux helper`); the lock; an owner serving the snapshot's formats takes CLIPBOARD unconditionally; the Paste by the route choice of §12.1 (gedit: `PasteText`, which fails as there; Chrome: the context menu, success in about 1 s); release the lock. The prior clipboard is **not** restored either: the snapshot stays on CLIPBOARD as the persistent owner (§13.5) [read: 0xb53d4–0xb5456; traced: no restore at trace-clipboard x11.log:1790, the next write's STOP at 5333].
- **`clipboard_release {handle}`**: removes the handle; an unknown or already released handle answers success, as the declaration promises ("releasing the same handle again has no effect") [A §1.3; read: 0xae9e6, untraced; open §22.15]. No lock; the JavaScript neither waits nor defers.
- **Handles**: `<pid>-<nanoseconds since the epoch at client start, u128>-<n>`, n a per-client counter from 1 (`31747-1793171648543593690-1`); kept in a sorted map; at most 32 and 256 MiB in all; valid until released or the helper exits [read: `X11FullDesktopClient` constructor 0x7a4a0, template 0x25ff8d, counter 0xbdadb; traced]. **Corrects A §2.6**: `with_restored_clipboard_lifetime` (0x7a4a0) is the client's constructor, not a scope; its flag selects the one-shot hand-off of §13.5.
- cua: the same handle format, limits and sentences; Copy by the vendor's route choice (no `PasteText` is needed to copy) [cua: Design, Text and clipboard].

### 13.2 The display lock: how the vendor acquires `SKY_CLIPBOARD_LOCK`

[read: `SelectionReader::new` 0xa1080, `Atoms::new` 0xa6f20, `SelectionReader::lock` 0xa1c00, `set_selection_owner_if` 0xa65f0, `drop_in_place<SelectionLock>` 0x51310; traced: W/traces/trace-clipboard/x11.log connection 002, lines 721–759 (acquire) and 1631–1646 (release); identical in newest, `lock` 0xcf210, traced in newest-trace-clipboard]

- **Who holds it.** Each clipboard command opens a **new X connection** (the reader) and on it: interns, in order, `CLIPBOARD`, `TARGETS`, `INCR`, `SKY_CLIPBOARD_PROPERTY`, `SKY_CLIPBOARD_STOP`, `SKY_CLIPBOARD_LOCK` (only-if-exists false); XFIXES `QueryVersion` 1.0; creates an **InputOnly 1×1 window at 0,0 under the root**, never mapped, event mask PropertyChange; and selects XFIXES selection input (set-owner, window-destroy, client-close) on that window for `CLIPBOARD` and for `SKY_CLIPBOARD_LOCK`. That window owns the lock.
- **The compare-and-set** (`set_selection_owner_if(selection, new owner, check, expected)`): `GrabServer`; `GetSelectionOwner(selection)`; when checking and the owner is not `expected`, stop with "not set"; else `SetSelectionOwner(new owner, selection, CurrentTime)` and `GetSelectionOwner` again, which must now be the new owner (else `failed to acquire X11 selection`); `UngrabServer` in every case (failure: `failed to release X11 server`). The interleaved `GetInputFocus` requests in the trace are x11rb's syncs for checked requests.
- **Acquire** is that operation with "expected None": under the grab, the lock is taken only if nobody owns it, and verified. It is atomic. Traced: `GrabServer`, `GetSelectionOwner(SKY_CLIPBOARD_LOCK)` → None, `SetSelectionOwner(owner=0x01600000, SKY_CLIPBOARD_LOCK, CurrentTime)`, the XFIXES SelectionNotify, `GetSelectionOwner` → 0x01600000, `UngrabServer`.
- **Contention.** "Not set" means busy. The loop: if the command's deadline has passed, fail `waiting for another clipboard operation timed out`; poll one X event (an XFIXES notify for `CLIPBOARD` updates the reader's state: generation, owner, timestamp; lock notifications are not specially awaited); with no event, park for min(time left, **5 ms**); try the full grab cycle again. A waiting engine therefore grabs the server about every 5 ms.
- **Deadline.** One instant, now + **10 s**, set before the reader is created, bounds the whole command: the lock wait, Copy's owner wait, the snapshot, the paste [read: call sites 0xad6d2, 0xb511f, 0xb8ed7].
- **Span.** Only `clipboard_read`, `clipboard_write` and `type_text` take it (§13.1, §12.1); `clipboard_release` does not.
- **Release.** Dropping the lock runs the compare-and-set with new owner None, expected the reader's window (under the grab, give it up only if still ours; errors ignored); then the reader's window is destroyed. A holder that dies releases it too, since X clears a selection whose owner window or client goes away (inference from X semantics).
- **For cua.** The Design's acquisition (`GrabServer`, `GetSelectionOwner` None, `SetSelectionOwner` to the lock window, `UngrabServer`) is the vendor's, which also re-reads the owner after setting it; cua should verify the same way. Because the vendor's retry is the same atomic cycle against `SKY_CLIPBOARD_LOCK`, an engine that takes `CUA_CLIPBOARD_LOCK` and then `SKY_CLIPBOARD_LOCK` this way excludes a concurrent vendor paste correctly. vendor: 10 s, the command's deadline / cua: 5 s to acquire both, then `clipboard busy` with nothing sent [cua: Design, The clipboard lock].

### 13.3 Reading and snapshotting the clipboard

[read: `SelectionReader::current_state` 0xa0a40, `snapshot` 0xa3be0, `read` 0xa1ea0; traced: W/traces/trace-clipboard, trace-extra 004]

- **State.** A `GetInputFocus` round trip, drain events (each XFIXES notify for `CLIPBOARD` bumps a generation and records owner and timestamp), `GetSelectionOwner(CLIPBOARD)`: (generation, owner, timestamp), the timestamp 0 when the last notify's owner is not the current one.
- **No owner:** an empty snapshot, no reads.
- **TARGETS:** read through `read` with a 1,024-byte cap (`X11 selection exceeds byte limit`); refused gives `clipboard owner did not provide its formats`; not ATOM/32 with a length multiple of 4 gives `clipboard owner returned invalid TARGETS`.
- **Targets captured:** in offered order, atom 0 and duplicates skipped; each named with `GetAtomName` (uncached); skipped by name: `BITMAP`, `DELETE`, `PIXMAP`, `WINDOW`, `TARGETS`, `COLORMAP`, `DRAWABLE`, `MULTIPLE`, `TIMESTAMP`, `TARGET_SIZES`, `SAVE_TARGETS`, `INSERT_PROPERTY`, `INSERT_SELECTION`; a refused target is skipped; a reply whose **type** is `COLORMAP`, `DRAWABLE`, `WINDOW`, `PIXMAP` or `BITMAP` is dropped; any read error fails the snapshot (`failed to capture clipboard format {:?}: <cause>`). Stored in ascending atom order. Nothing kept: `clipboard has no readable data formats`. **Corrects A §2.6** (`MULTIPLE`, `SAVE_TARGETS` and `TIMESTAMP` are compared as bytes, not absent).
- **Stability:** after TARGETS and after every format, the state must equal the starting one, else `clipboard changed while its contents were being captured`; the deadline is checked before every read (`clipboard capture timed out`).
- **Caps:** **64 MiB** in all (0x4000000); each read may use what is left (the first asks for 0x01000000 longs).
- **One read:** a fresh InputOnly 1×1 requestor window (PropertyChange); `ConvertSelection(CLIPBOARD, target, SKY_CLIPBOARD_PROPERTY, CurrentTime)`; poll with 5 ms parks for the matching `SelectionNotify` (`X11 selection read timed out` at the deadline; property None is a refusal; another property is `unexpected selection property`); `GetProperty` length 0 for type and size (over the cap: `X11 selection exceeds byte limit`); `GetProperty` with delete for the whole (bytes left: `incomplete X11 selection property`); formats 8/16/32 aligned (`misaligned X11 selection data`, `invalid X11 property format <n>`); destroy the requestor.
- **INCR:** a format-32 INCR property (`invalid INCR property format`) with a size within the cap; then each `PropertyNotify` NewValue is read and deleted; type and format must not change (`X11 selection changed type during INCR transfer`); the total stays within the cap; a zero-length chunk ends it. No per-chunk timeout, only the command deadline. Untraced (open §22.16).

### 13.4 Serving the clipboard

[read: `SelectionOwner::start` 0x9fcc0, owner thread 0x414c0, `Property::write` 0xa71f0, `remove_transfer` 0xa5450; newest `SelectionOwner::wait_for_transfers` 0xccc20; traced: W/traces/trace-extra connections 005, 012, 013]

- **An owner** is a new X connection, the six atoms, an InputOnly 1×1 unmapped window with no event mask, and a thread. `start` refuses a target or type atom 0 (`X11 selection atom cannot be None`), a format other than 8/16/32 (`invalid X11 property format <n>`), unaligned data (`misaligned X11 property data`) and a format map containing TARGETS (`TARGETS is generated by the selection owner`). The caller then takes the selection on the owner's connection (§13.2's compare-and-set: unconditional for a paste, conditional for a restore).
- **Text** is served as `UTF8_STRING`, `text/plain` and `text/plain;charset=utf-8`, each typed as itself, format 8; not `STRING`, `TEXT` or `COMPOUND_TEXT`. TARGETS answers `[TARGETS, UTF8_STRING, text/plain, text/plain;charset=utf-8]` [traced: trace-extra 005:0013]. A snapshot is served format by format with its captured type and format, TARGETS listing TARGETS and the captured atoms in ascending order.
- **SelectionRequest:** another selection is ignored; property None means the target is the property; TARGETS gets an ATOM/32 list; a known target gets `ChangeProperty` (Replace) and a `SendEvent` (propagate false, mask 0) of `SelectionNotify` with the request's time; an unknown target, `MULTIPLE` and `TIMESTAMP` included, gets `SelectionNotify` with property None. Request timestamps are not checked (CurrentTime requests are served).
- **INCR:** chunks of min(maximum request bytes − 24, **65,536**) (under 4: `X11 maximum request size is too small`); larger data: the requestor's event mask set to PropertyChange | StructureNotify, an INCR property (format 32, the total length), the next chunk on each `PropertyNotify` Deleted, aligned to the format, a final zero-length write; a requestor's DestroyNotify drops its transfers. Untraced (open §22.16).
- **The loop** polls events, sleeping 10 ms when idle; a `SKY_CLIPBOARD_STOP` ClientMessage (format 32, zero data) on its own window ends it; `SelectionClear` arms a 10 s drain that keeps serving in-flight INCR transfers and ends as soon as none remain; on exit it destroys its window (context `destroy selection owner window`).
- **Paste completion:** done when at least one data request has been served, no transfer is active, and **512 ms** have passed with no further request; else `clipboard paste timed out` at the command deadline, or `clipboard owner stopped during paste`. This is what "success" means on the pinned context-menu route.
- cua: the vendor's formats plus `STRING` for Latin-1-only text, and INCR, with the Design's transfer bounds (500 ms to the first request, 2 s between chunks, 10 s overall) instead of the vendor's command-wide 10 s [cua: Design, Transfer bounds]. Serving `text/plain` as the vendor does is not in the Design's list (§21).

### 13.5 The persistent owner and the restore

[read: `ClipboardState::restore` 0x9e980, client slot +0xd8, `drop_in_place<X11FullDesktopClient>` 0x51ba0; traced: W/traces/trace-extra connections 004, 012–013, strace EOF sequence]

- **The persistent owner.** The current owner (the text owner, a written snapshot's owner, or a restored one) lives in one slot of the client; a new owner replaces it (the old one gets STOP and is dropped). It keeps serving across later requests until another client takes CLIPBOARD or the helper exits. On stdin EOF the helper sends it STOP, destroys its window and exits, so **a written or restored clipboard is lost when the helper exits**, leaving CLIPBOARD unowned [traced: EOF at 39.8075, STOP 39.8173, DestroyWindow 39.8177, exit 39.8183]. **Settles A §2.6**'s open lifetime for server mode.
- **Restore** runs only after `type_text`'s paste, whatever its outcome:
  - the prior clipboard was **empty**: the compare-and-set with new owner None, expected the text owner's window (give CLIPBOARD up only if still ours), then the slot is cleared and the text owner gets STOP [traced: trace-extra 004:001c–0022];
  - it was **not empty**: a new owner serving the snapshot, on its own connection and window, takes CLIPBOARD with the compare-and-set expecting the text owner's window; on success it becomes the persistent owner and the text owner gets `SelectionClear`; if someone else took CLIPBOARD meanwhile, the new owner is dropped and the call succeeds, leaving the other client's clipboard alone [traced: trace-extra 013 taking over from 012].
- **One-shot mode** (the CLI outside `server`) hands the restored owner to a `clipboard_owner` child (`current_exe clipboard_owner`, stdin protocol: the magic `SKYCLIP1`, the selection atom, the expected owner, a format count of at most 256, then per format target, type, format and bytes, 64 MiB in all; the child prints `ready` or `skipped`) so that the clipboard outlives the CLI. Server mode never spawns it [read; traced: no execve in server traces]. cua has no one-shot mode.
- vendor: restore by a new owner taking CLIPBOARD conditionally, or by giving it up conditionally; nothing restored after `clipboard_write` or `clipboard_read` / cua: never calls `SetSelectionOwner` to restore; while it still owns CLIPBOARD it switches what it serves to the remembered snapshot and keeps serving it, and after `SelectionClear` it does nothing [cua: Design, The cleanup]. Both leave a newer owner's contents alone. Two points where the Design's text and this reading differ are §21's: the Design calls switching content what "the vendor's persistent owner does", and its cleanup restores after `clipboard_write`, which the vendor does not.

## 14. Activation

[F §9; read: dispatcher arm 0xadb08 → 0xb3a44; traced: W/traces/trace-extra 011a–011f, trace-minimized 0121–0125]

`activate_window {window}`, with no prior validation:

1. `InternAtom _NET_ACTIVE_WINDOW`;
2. `SendEvent` to the root, propagate false, mask SubstructureNotify | SubstructureRedirect: ClientMessage format 32, window = target, data [1 (source indication: application), 0 (CurrentTime), 0, 0, 0]; context `failed to request focus for X11 window <id>`;
3. `ConfigureWindow` stack mode Above; context `failed to raise X11 window <id>`;
4. `SetInputFocus` revert-to PointerRoot, CurrentTime; context `failed to focus X11 window <id>`.

Each step is checked with a round trip; no wait, no `MapWindow`. It restored the minimized fixture because Openbox mapped the window on the ClientMessage before `SetInputFocus`; a slower window manager would likely give `BadMatch` (inference; open §22.9). About 5–9 ms traced. It is the one window request that changes desktop state [cua: Design, Activation and apps].

## 15. Applications

[F §9; A §2.7; read: `apps::desktop_entries` 0x8d8a0, `expand_exec` 0x8cae0, `executable_exists` 0x90850; traced: W/traces/trace-misc/apps.json]

- **Roots, in order:** `$XDG_DATA_HOME/applications` if the variable is set (even empty), else `$HOME/.local/share/applications`; then each non-empty `:`-piece of `$XDG_DATA_DIRS` joined with `applications`, the default `/usr/local/share:/usr/share` applying only when the variable is unset or not UTF-8 (an empty value gives no system roots).
- **Walk:** recursive, depth first (subdirectories in reverse `readdir` order, no cycle guard); files whose extension is exactly `desktop`.
- **id:** the root-relative path's components joined with `-`, `.desktop` kept (`org.gnome.gedit.desktop`). **The first id seen wins, before parsing**, so a user entry that is later filtered out still hides the system one.
- **Parsing:** only the `[Desktop Entry]` group; lines trimmed; `#` comments; split at the first `=`, key and value trimmed; no unescaping, no localized `Name[xx]`, the last occurrence of a key wins.
- **Filter, in order:** `Hidden` or `NoDisplay` true (case-insensitive) → skip; `Terminal` true → skip (no terminal is ever launched); `Type` not `Application` → skip; `TryExec` not executable → skip; no `Name` or no `Exec` → skip; an `Exec` that does not tokenize → skip; `argv[0]` not executable → skip. `executable_exists`: a path with more than one component is stat'ed directly, else searched in `PATH`; a regular file with any execute bit. `OnlyShowIn`, `NotShowIn`, `DBusActivatable` and `XDG_CURRENT_DESKTOP` are ignored. **Corrects A §2.7** (those keys are compared as integers, which a string search misses).
- **`list_apps` output:** `[{id, name, windows}]`, stably sorted by ASCII-lowercased `name`. Windows are associated per entry: every listed window (§3) whose `app` equals, ASCII case-insensitively, the entry's `StartupWMClass`, its `Name`, its id without `.desktop`, or the last `.`-segment of that stem; each is cloned with `app` set to the desktop id. A window can appear under several apps; unmatched windows are dropped; apps without windows are kept.
- **`Exec` tokenizing:** whitespace splits outside quotes; `"` and `'` quote; backslash escapes except inside single quotes; standalone `%f %F %u %U %d %D %n %N %v %m` are dropped; standalone `%i` becomes `--icon <Icon>` (dropped without an Icon); inside other tokens `%%` → `%`, then `%c` → Name, then `%k` → the entry's path. Errors, swallowed during discovery: `desktop Exec contains an unfinished quote or escape`, `desktop entry "<id>" has no executable`.
- **`launch_app {app}`:** `app` trimmed, empty gives `app must be a non-empty string`; a full rescan; the first entry in discovery order whose id, `Name` or id without `.desktop` equals `app` case-insensitively, else `launchable application {:?} was not found`; spawn `argv[0]` with the rest, stdin, stdout and stderr on `/dev/null`, the helper's cwd and environment, no `setsid`, a detached thread reaping it; the answer comes at once (11–14 ms traced), and a spawn error has the context `failed to launch application {:?}`. Children inherit `RUST_LIB_BACKTRACE=full`, which the vendor's `main` sets (inference). The newest build's code is the same.
- cua's wrapper keeps launching through the supervisor's `gio launch`, after validating the id against the engine's `list_apps` [A §4.2; cua: Design, Activation and apps]; the wire command stays for the vendor JavaScript.

## 16. Screenshots

[F §8; read: `capture_screenshot` 0x89140; traced: W/traces/trace 0527, 16ad; W/traces/images, image-metadata.txt]

- **Window:** retention (§9), `GetGeometry`, then `GetImage` ZPixmap of the **window's own drawable** at (0,0) with its width and height, plane mask all ones; no root crop, no pixmap, no XShm. An overlapped window is captured as itself (full occlusion untested).
- **Desktop (`get_screenshot`):** `GetImage` of the root at the screen's pixel size, one image; no retention.
- **Pixels:** depth, visual and byte order are ignored: the reply must hold at least w·h·4 bytes (else `x11 screenshot <n> bytes, expected at least <m> bytes`, so a depth-16 visual fails), read as B,G,R,X with stride w·4 and converted to RGB. cua may handle other depths; on depth 24/32 the output must be identical (open §22.17).
- **Encoding:** `image` 0.25's JPEG encoder at **quality 80**, JFIF APP0 1.2, density 1×1 with no units, **4:4:4** (the encoder's fixed sampling), no resizing. Measured sizes: gedit 910×756 about 36 KB, Chrome 1050×780 about 53 KB, the desktop 1280×800 about 58 KB.
- **Files:** `$TMPDIR`, else `/tmp`, named `<pid>_<nanoseconds since the epoch>.jpg`, created with mode 0666 before the umask and never deleted by the helper; errors `failed to create <path>`, `failed to write <path>`, `failed to convert screenshot filepath`, `system time is before the Unix epoch`. Output: `[{"filepath": …}]`, always one entry, for `get_screenshot` and for `screenshots` alike. cua writes to its private temporary directory with the same naming [cua: Design, Screenshots].
- **The pointer** (desktop only, `--mouse-size-px` not 0; pinned default 12, newest 0): XFixes `GetCursorImage` (its pixels must number w·h, else `xfixes cursor image <n> pixels, expected <m>`), drawn at its **native size** at (x − xhot, y − yhot) with alpha applied to already premultiplied pixels (edges come out darker; a vendor quirk); on any XFixes failure, an embedded 48×48 arrow resized to size × size at the `QueryPointer` position, with no hotspot (untraced). So the option is effectively on or off; the size only scales the fallback. **Corrects F §8**'s "size". Window screenshots never stamp it. vendor: default 12 / cua: default 0, a positive value stamping the XFixes cursor [cua: Design, Screenshots].
- **Timing:** tree plus window image 430–573 ms against 315–506 ms for the tree alone; the desktop about 31 ms [F §11].

## 17. Timing reference

[F §10–11; traced: W/traces/paired.jsonl, untraced, interleaved, gedit 480 nodes 910×756 and Chrome 222 nodes 1050×780, both in the background]

| Operation | gedit pinned / newest, ms | Chrome pinned / newest, ms | Where the time goes |
|---|---:|---:|---|
| `get_window_state`, tree only | 506.1 / 435.9 | 314.7 / 326.3 | sequential calls (§5.1), the association's `list_windows` (§4) |
| tree + window JPEG | 573.2 / 562.0 | 429.6 / 460.1 | + 100 ms retention, capture, encode |
| `move`, window-relative | 202.8 / 203.6 | 202.7 / 203.5 | the session's two 100 ms sleeps |
| `click`, coordinate left | 215.1 / 216.3 | 215.3 / 216.1 | + 12 ms hold |
| `press_key Right` | 269.3 / 235.9 | 270.1 / 236.7 | + 2 × 33 ms (pinned) / 33 ms (newest) |
| `key_down Shift` | 236.8 / 203.7 | 235.7 / 202.9 | |
| `key_up Shift` | 134.2 / 101.2 | 134.3 / 101.2 | the held session already exists |
| `scroll`, 120 px | 238.8 / 239.8 | 239.0 / 240.2 | + one 36 ms step |
| `drag`, 40 px | 254.2 / 251.5 | 254.1 / 251.0 | + 41 × 1 ms |

Global: `list_apps` 14.2 / 16.5, `list_windows` 12.7 / 13.7, `get_screenshot` 31.0 / 30.7. Text and clipboard are in §12–13. The JavaScript adds its deferred 100 ms after every input (§1). These are the numbers the bar is first compared with; M0's harness re-measures them in the same sitting [cua: Design, Verification system].

## 18. Settling and interference

- **No UI settle in the helper.** No AT-SPI event subscription, quiet period or tree-stability wait on any observation or action; the only waits are §9's fixed sleeps, the key and wheel holds, the 512 ms paste quiet window, and the JavaScript's deferred 100 ms [F §10].
- **No intervention monitor.** No human-input detection or debounce as on macOS; the background session's teardown checks the real focus only so as not to send FocusOut after the person focused the window, and the newest paste checks field focus, selection and desktop focus before dispatch [F §10]. cua adds none beyond the Design's paste revalidation [cua: Design, Text and clipboard, step 4].

## 19. The accessibility-bus client

[F §10; read: `at_spi_connection` 0x836e0, `dbus::Connection::connect` 0x92350, `Connection::call` 0x90bc0, `decode_address_value` 0x93940; traced: W/traces/trace/strace.log l.2260–2273]

- **Address precedence.** (1) The root window's `AT_SPI_BUS` **X11 property** (`unix:path=/run/user/501/at-spi/bus_0,…` on the VM), connected to directly; an X error here falls back like any bus failure. (2) If absent: `$DBUS_SESSION_BUS_ADDRESS`, else `unix:path=$XDG_RUNTIME_DIR/bus`; both unset gives no bus (the X11 fallback, silently). On the session bus, `org.a11y.Bus.GetAddress` (destination `org.a11y.Bus`, path `/org/a11y/bus`), whose first value must be a string (`AT-SPI bus did not return a socket address`); then that session connection is closed. No environment variable named `AT_SPI_BUS` is read. **Corrects A §2.4.** Path (2) is untraced (open §22.10). cua: the same precedence; the spec's "`AT_SPI_BUS`" in the `dbus` module means this property [cua: Design, Modules].
- **Address parsing.** Entries split on `;`; only `unix:` entries; keys split on `,`; the first `path=` gives a filesystem socket, the first `abstract=` an abstract one; values %-decoded (`D-Bus address has an invalid escape`); a connect failure returns at once (`failed to connect to the D-Bus socket`, `failed to connect to the abstract D-Bus socket`), later entries not tried (medium confidence); none usable gives `D-Bus address does not contain a supported Unix socket`.
- **Connection.** `AF_UNIX` stream, `SO_RCVTIMEO` and `SO_SNDTIMEO` **2 s**; `\0AUTH EXTERNAL <hex of the decimal uid>\r\n` (the uid from `statx("/proc/self")`), a reply line beginning `OK ` (else `D-Bus EXTERNAL authentication failed`), no unix-fd negotiation, `BEGIN\r\n`, `Hello`.
- **Calls.** Little-endian, type 1, flags 0, version 1; header fields PATH, INTERFACE, MEMBER, DESTINATION, then SIGNATURE when there are arguments; serials per connection from 1; argument types `s`, `i`, `u` only. Strictly synchronous: write, then read until the matching REPLY_SERIAL, discarding signals and other replies. Limits: body or header array above 16 MiB gives `D-Bus message exceeds the maximum size`; `big-endian D-Bus responses are unsupported`; `unsupported D-Bus protocol version`; `unexpected D-Bus response type`. An ERROR reply becomes `D-Bus <interface>.<member> failed: <error name | unknown error>: <first string argument | method call failed>`. A timeout surfaces as the I/O error (EAGAIN, `Resource temporarily unavailable (os error 11)`, the arm64 GTK crash's error, A §3.3).
- **Lifetime.** One fresh connection per `get_window_state` and per element request (a new `Hello` and sender each time), closed right after the tree read. cua: one persistent connection for the engine's life, reopened once per request when broken [cua: Design, Process model].
- **The CLI's `--timeout-ms`** (default 30,000) did not bound any traced request, with values 1–500 [F §10]; it is not an observation deadline.

## 20. Error sentences

Each sentence is given verbatim in the section of the path that raises it; this section is the index and the rules for composing them.

- **Composition.** The wire `error` is the context chain joined by `": "`, outermost first. Contexts the vendor adds, with the sentence or cause after them:
  - `failed to parse command input: <serde>` (§1);
  - `AT-SPI element does not expose actions; refresh get_window_state(): <cause>` (§7.1);
  - `D-Bus <interface>.<member> failed: <error name>: <message>` (§19), which is how application-side D-Bus errors reach callers (A §3.3's `D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying`);
  - `failed to capture clipboard format {:?}: <cause>` (§13.3);
  - `ambiguous AT-SPI window identity for X11 window <id>: <reason>` (§4);
  - the X11 contexts `failed to translate coordinates for X11 window <id>`, `failed to read screenshot geometry for X11 window <id>`, `background window rendering requires the X Composite extension`, `failed to retain the target window's rendering buffer`, `failed to request focus for X11 window <id>`, `failed to raise X11 window <id>`, `failed to focus X11 window <id>`, `failed to launch application {:?}`, `destroy selection owner window` (§3, §8, §14–16);
  - the restore's `failed to restore clipboard` and `also failed to restore clipboard: <cause>` (§12.1);
  - newest: `text insertion was not confirmed; no fallback or second Paste was sent: Paste was sent once; inspect the field before retrying: <reason>` (§12.2), `typing interrupted after <n> complete characters; inspect the window before retrying: <cause>` (§11.4).
- **Where they are.** Windows §3; association §4; tree §5; resolution §6.2; actions §7; background route §8; clicks, scroll, drag §10; keys §11; text §12; clipboard §13; activation §14; apps §15; capture §16; the bus §19; validation by command §2; the JavaScript's own §2 and §6.1.
- **cua's rule.** The vendor's sentence wherever this document gives one; for paths cua adds or changes, cua's own sentence, bounded and naming what to do next, and listed in the harness's deviations where it replaces a vendor sentence [cua: Plan of Work, M1a decisions]. cua's new sentences so far: `Window <id> matches several accessibility windows; close or retitle the duplicates` (M4), `Window <id> is minimized; activate it first` and `Screenshot unavailable for window <id>.` for minimized windows (M4), `<App> does not accept background input; use a dedicated desktop or activate the window first` (M3), `requested field or selection changed before dispatch; nothing was sent`, `clipboard busy`, `Paste was sent once and could not be confirmed; read the field before retrying` (M2), `Character <c> is not on the keyboard layout` (§11.4), `type_text is not available in this engine build` (M1a only) [cua: Design].

## 21. Coverage, and where the Design reads differently

**The behaviour specification's list** (Plan of Work, M0) and where each item is:

| Item | Section |
|---|---|
| window association | §4 (and §3 for the window itself) |
| the per-element field set | §5.1 |
| preorder admission and limits | §5.2, §6.2 |
| the visible-table path | §5.4 |
| every command's validation and error sentence | §2, §20, and each command's section |
| the chord grammar and its Shift rules | §11.1–11.2 |
| the background and desktop routes | §8, §10 |
| activation | §14 |
| scroll and drag arithmetic | §10.3–10.5 |
| clipboard formats, handles and the persistent owner | §13.1, §13.3–13.5 |
| how the vendor acquires `SKY_CLIPBOARD_LOCK` (`SelectionReader::lock`) | §13.2 |
| screenshot encoding | §16 |

**Where the Design's text and this reading differ.** None of these blocks M1a; each is for the controller to fold into the spec or to answer.

1. **`clipboard_write` does not restore** in either vendor build: the written snapshot stays on CLIPBOARD (§13.1, §13.5). The Design's cleanup restores the remembered clipboard after `clipboard_write` too. That makes cua's `clipboard_write` a no-op on the clipboard's final contents where the vendor's leaves the snapshot there: a behaviour change, observable through the differential harness's clipboard check, to be declared (M2) or reversed.
2. **The vendor restores by taking ownership** (a new owner, conditionally) or by giving CLIPBOARD up conditionally when it was empty (§13.5). The Design's cleanup is a departure, not the vendor's mechanism; its phrase "as the vendor's persistent owner does" fits only the part about serving after the request.
3. **The vendor's lock wait is the command's 10 s deadline** and it re-reads the owner after setting it (§13.2). cua's 5 s is its own; the re-read should be kept.
4. **The vendor always clicks a named element and then restores the caret or selection through AT-SPI** (§7.4). The Design's step 2 says the click is made "as the vendor does" and that "the text then goes where that click leaves the caret"; the vendor puts the caret back. cua's rule (no click when focused; no AT-SPI restore) is a departure either way.
5. **`text/plain`.** The vendor serves `UTF8_STRING`, `text/plain` and `text/plain;charset=utf-8` (§13.4); the Design lists `UTF8_STRING`, `text/plain;charset=utf-8`, `STRING` and `TARGETS`. Recommendation: serve `text/plain` as well, so requestors that ask only for it get the same answer.
6. **`AT_SPI_BUS` is a root-window X property**, not an environment variable (§19). The Design's `dbus` module says "address discovery via `AT_SPI_BUS`"; it should read the property, then the session bus.
7. **`--mouse-size-px` does not scale the cursor** (§16): a positive value stamps the XFixes cursor at its native size; the size only sizes a fallback icon.
8. **The tree read's extra calls** (§5.1, §5.4): `table` nodes get a `ChildCount` read, and sampled cells re-read role, state and extents. The over-budget call bound should count them. A failed `GetRoleName` drops a subtree, so it belongs in `truncated.failed`.
9. **Every association failure in `get_window_state` becomes the X11 fallback**, not only duplicate frames (§4): a missing `_NET_WM_PID`, no provider, a bus that cannot be reached. cua's duplicate-window sentence replaces one of these cases; the others still answer `ax_tree_source: "x11"` unless M4 decides otherwise.
10. **Window `app` is never a desktop id in `list_windows`** (§3); policy code that matches apps should expect `_GTK_APPLICATION_ID`, the class, or `x11:<id>`.

## 22. Open points

Each is a vendor rule this reading could not settle, with what would settle it. The harness's wire fixtures and first runs (M0.3) settle most of them by recording the vendor's answer; none blocks writing M1a's code, which reproduces the rule as stated where one is given.

1. **X11 errors' text** for a window that no longer exists (`BadWindow` through x11rb's reply error). Settle: `get_window_state` and `click` on a destroyed window id, both builds.
2. **The order of `indeterminate` and `checkable`** relative to `visible` in `states` (§5.1). Settle: a GTK inconsistent check button and a checkable menu item.
3. **The visible-table scan's corner branches** (§5.4) and the second resolution walk (§6.2). Settle: a GTK TreeView or Qt table of 10,000+ rows under `dbus-monitor`, with and without a blank area.
4. **The query's trim set and Unicode lowercasing** (§5.5). Settle: queries with surrounding whitespace and non-ASCII letters.
5. **`click_count` 0 or very large; `duration` as a fraction, negative or huge** (§10.1, §11.3). Settle: wire probes, both builds.
6. **The newest build's full key-name table** (§11.1). Settle: a static diff of `keys::keys` in the newest build.
7. **AltGr symbols on a non-US layout** (§11.2). Settle: `press_key("@")` under `setxkbmap de`.
8. **A bad key on a background window**: whether the FocusIn/FocusOut pair and the teardown precede the error, and a held window destroyed before `key_up` (§11.3). Settle: two traced probes.
9. **`activate_window` against a slow window manager** (§14). Settle: a fixture that delays mapping.
10. **The session-bus discovery path** (§19). Settle: an isolated Xvfb with the `AT_SPI_BUS` root property removed.
11. **The answer to an unparsable request line, and when `restart` is true** (§1). Settle: wire probes (a non-JSON line, a non-object, a missing `command`), and the `restart` classes from the dispatcher's error paths; record both builds.
12. **Unknown fields and number edge cases for every input** (§2). Settle: one probe per command with an extra field, a fractional and an out-of-range coordinate, a negative `pixels`.
13. **The pinned text routes' full order and the menu-label rule** (§12.1): when the Edit-menu route is used, how a Paste or Copy item is recognised (`Paste Ctrl+V` against `Paste and search for …`), and the newest build's fallback priority (§12.2). Settle: traces of `type_text` and `clipboard_read` on a GTK entry, a Qt field and a field with both EditableText and a context menu; a static reading of `clipboard_menu_items` 0x84c30 and `edit_menu_item` 0x80bf0.
14. **How a paste error and a restore error compose** on the wire (§12.1). Settle: an induced restore failure.
15. **`clipboard_release` of an unknown handle** (§13.1). Settle: one probe.
16. **INCR in both directions and data above 64 KiB** (§13.3–13.4). Settle: a large-payload trace.
17. **A depth-16 or depth-32 window's capture, and the cursor fallback icon** (§16). Settle: Xvfb at depth 16; a cursor without XFixes.

## Reading notes

- This reading's own scratch material (annotated disassembly, trace extracts, small scripts) is on the VM under `~/.local/share/cua-171/m01/`, beside the evidence of R/F §13; none of it is committed.
- Where R/A or R/F state a rule and this reading did not revisit it, the rule is cited to them alone.
