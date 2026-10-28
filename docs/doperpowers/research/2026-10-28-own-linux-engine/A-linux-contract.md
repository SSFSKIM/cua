
# #171 research A: Linux native-engine contract and tier-1 helper catalogue

Static inspection, 2026-10-28. Contract subject: pinned release **26.928.40906**, both Linux architectures. Newer binaries are compared separately; their additions are not silently imported into the pinned contract.

## Evidence, aliases and boundaries

| Alias | Absolute path |
|---|---|
| `C` | `/Users/new/Developer/GitHub/cua`, inspected HEAD `e1aeda21dc0f89c52b251c2985ca4206cc525dfa` |
| `S` | `/Users/new/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src` |
| `L` | `S/targets/linux` |
| `T` | `S/types/full-desktop` |
| `D64` | `/Users/new/.local/share/cua-171/artifacts/vendor-amd64.CaJGWa` |
| `DA` | `/Users/new/.local/share/cua-171/artifacts/vendor-arm64.WaJ1FG` |
| `B64` | `D64/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64` |
| `BA` | `DA/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64` |
| `DM` | `/Users/new/.local/share/cua-171/artifacts/mid-arm64.1N7FvX` |
| `BM` | `DM/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64` (26.1013.31256) |
| `DN` | `/Users/new/.local/share/cua-171/artifacts/newest-x64.jvF7Zi` |
| `BN` | `/Users/new/.local/share/cua-171/vendor/linux-26.1023.51421/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64` |
| `N` | `C/docs/evidence/2026-10-14-own-repl-host-native` |
| `P` | `C/docs/evidence/2026-10-17-own-sandbox/m3/gce-cua-bf7739f/results.jsonl` |

`S`’s JS files are minified to one line; citations to `:1` refer to that real source line, not an invented prettification. **Cross-package verification:** after extracting the Linux archives, all 90 extracted files comprising `service.js`, `targets/linux/*` and `types/full-desktop/*` matched the Darwin-shipped counterparts byte-for-byte on each architecture. Thus using `S` for Linux is verified, not assumed. Command: isolated Python read-only byte comparison of each extracted file against `S/<relative-path>`.

The earlier survey `/Users/new/.claude/jobs/1ea561bc/tmp/117/C-linux.md` and macOS contract were orientation, not evidence for binary claims. New inspection consisted of `ar x`, selective `tar xf`, `file`, `shasum`, `xcrun llvm-objdump`, `xcrun llvm-nm`, `strings`, and Python `-I` reading ELF bytes. No helper, GUI app, runtime, REPL host, Ghidra or trace session was started. No implementation code was copied. All runtime results below are explicitly **previously recorded evidence**, not fresh measurements.

For each inspected binary, retained evidence files are `objdump-p.txt` (`llvm-objdump -p`), `dynsyms.txt` (`-T`), `comment.txt` (`-s -j .comment`), `nm.txt` (`llvm-nm --demangle --numeric-sort`) and `strings.txt` (`strings -a -t x`). The pinned directories also contain `term-offsets.json` and `rust-string-slices.json`. The latter is a **candidate** inventory recovered from ELF relocation addends plus adjacent lengths; it is not complete reflection metadata and should not be treated as an independently proven schema. Binary offsets below are hexadecimal **file offsets**; function addresses in §5 are ELF virtual addresses before ASLR.

## 1. Full Linux JS-side contract

### 1.1 The boundary that can be replaced

The live layering is:

`model-facing cua API → src/cua-api/sky.mjs → trusted RPC "sky" → src/services/sky.mjs → CUA_SKY_SERVICE → vendor service.js → Linux wrappers → persistent sky_linux server`.

The model-facing facade can remain unchanged if a new service exports `handleRpc` and reproduces its setup/execute/drag-handle replies, including tree identities and image data URLs. The existing macOS replacement uses exactly this seam, not a requirement to preserve the vendor’s private native transport. Sources: `C/src/cua-api/sky.mjs:19-24,44-80`; `C/src/services/sky.mjs:176-194,209-228,245-261`; `C/src/services/engine/service.mjs:1-9,57`.

Important distinction: replacing only the helper behind the existing vendor JS requires reproducing the private JSON-lines wire too. Replacing the JS service, as #117 did, requires reproducing the service contract but may choose its own private transport. This is a design choice, not an existing external constraint.

### 1.2 Setup, dispatch and complete method list

`handleRpc({type:"setup"})` initializes the client once and returns `{target:"linux", methods:[...]}`. Methods are the own enumerable function properties in insertion order:

1. `perform_secondary_action`
2. `click`
3. `clipboard_read`
4. `clipboard_release`
5. `clipboard_write`
6. `drag`
7. `drag_handle`
8. `activate_window`
9. `get_screenshot`
10. `list_apps`
11. `list_windows`
12. `move`
13. `move_relative`
14. `press_key`
15. `key_down`
16. `key_up`
17. `scroll`
18. `type_text`
19. `launch_app`
20. `get_window_state`

`SKY_ENABLE_AUDIO === "1"` appends `start_audio_recording`, `stop_audio_recording`; they are JS implementations using external programs, not sky_linux commands. Source: `S/service.js:1`; `L/create_client.js:1`; `L/audio_recording.js:1`.

`execute` takes `{type:"execute",method,args:[...]}`, calls an own function with `...args`, and returns its result. Unknown methods throw plain `Error("Sky runtime method is not available: <method>")`. It reduces screenshots and recordings to `{filepath,data_url}` before trusted RPC transport; raw byte arrays are reconstructed by cua’s facade. Sources: `S/service.js:1`; `C/src/cua-api/sky.mjs:65-80`.

The separate service messages are:

| Message | Result / semantics |
|---|---|
| `{type:"drag_start",handle_id,point:{x,y}}` | Creates or reuses the service’s handle; awaits `.start(point)`; stores it; returns undefined. Linux only. |
| `{type:"drag_move",handle_id,point:{x,y}}` | Calls the stored handle’s `.move_to(point)`; undefined. |
| `{type:"drag_end",handle_id}` | Awaits `.end()`, deletes handle; undefined. |

The facade allocates a UUID per handle. A handle is single-use: idle → dragging → ended. Its private helper commands use `command:"drag_handle"` and `input:{action:"start",x,y}`, `{action:"move_to",x,y}`, or `{action:"end"}`. Sources: `S/service.js:1`; `L/drag_handle.js:1`; `C/src/cua-api/sky.mjs:51-59`.

### 1.3 Method arguments and results

Notation: `W` is the Window object below; `Point={x:number,y:number}`; `void` means service result undefined, normally represented as null across trusted worker transport and restored to undefined by the facade. All ordinary methods take one object argument unless shown as no-argument. Types here are the shipped public declarations; additional native validation is catalogued below, not guessed from `number`.

| Method | Input | Result and required semantics | Source |
|---|---|---|---|
| `perform_secondary_action` | `{window:W,element_id:string,action:string}` | void; case-insensitive named AT-SPI action; unavailable, ambiguous or failed action throws; no activation | `T/PerformSecondaryAction.d.ts:1-12`; `L/perform_secondary_action.js:1` |
| `click` | `{window?:W,element_id?:string,x?:number,y?:number,mouse_button?:MouseButton,click_count?:number,key?:string,duration?:number}` | void; coordinates are window-relative with W, desktop otherwise; no coordinates/no W clicks current pointer; element mode permits one left/right click without key/duration | `T/Click.d.ts:1-23`; `L/click.js:1` |
| `clipboard_read` | `{window:W}` | opaque string handle; invokes Copy and saves immutable multi-format snapshot in helper, not clipboard text in JS | `T/ClipboardRead.d.ts:1-12`; `T/ClipboardHandle.d.ts:1-8`; `L/clipboard_read.js:1` |
| `clipboard_release` | `{handle:string}` | void; duplicate release is documented no-op; no action-settler wait/defer | `T/ClipboardRelease.d.ts:1-8`; `L/clipboard_release.js:1` |
| `clipboard_write` | `{window:W,handle:string}` | void; Paste saved snapshot; reusable across windows until released/helper exits | `T/ClipboardWrite.d.ts:1-11`; `L/clipboard_write.js:1` |
| `drag` | `{window?:W,path:Point[],key?:string}` | void; at least two ordered points; window-relative without implicit activation | `T/Drag.d.ts:1-13`; `L/drag.js:1` |
| `drag_handle` | no arguments | synchronous object `{start,move_to,end}`, each method Promise<void>; desktop coordinates; facade uses special service messages above | `T/DragHandle.d.ts:1-14`; `L/drag_handle.js:1` |
| `activate_window` | `{window:W}` | void; deliberately raises window and directs keyboard focus | `T/ActivateWindow.d.ts:1-8`; `L/activate_window.js:1` |
| `get_screenshot` | no arguments | array of `{filepath,bytes:Uint8Array,data_url}`; service sends only filepath/data_url; JPEG | `T/GetScreenshot.d.ts:1-5`; `T/Screenshot.d.ts:1-8`; `L/get_screenshot.js:1` |
| `list_apps` | no arguments | `[{id:string,name:string,windows:W[]}]`, discoverable freedesktop desktop entries, including not-running apps | `T/ListApps.d.ts:1-14`; `L/list_apps.js:1` |
| `list_windows` | no arguments | `W[]`; mapped app windows, dialogs and transients | `T/ListWindows.d.ts:1-6`; `L/list_windows.js:1` |
| `move` | `{window?:W,x:number,y:number,key?:string}` | void; window-relative when targeted, no activation | `T/Move.d.ts:1-14`; `L/move.js:1` |
| `move_relative` | `{dx:number,dy:number,key?:string}` | void; desktop routing; each offset integer in −32768…32767 | `T/MoveRelative.d.ts:1-11`; `L/move_relative.js:1` |
| `press_key` | `{window?:W,key:string,duration?:number}` | void; `+`-separated X keysym-style chord; whitespace trimmed around `+`; common Ctrl/Alt/Shift aliases; hold duration ms | `T/PressKey.d.ts:1-17`; `L/press_key.js:1` |
| `key_down` | `{window?:W,key:string}` | void; repeat same parsed chord/target is no-op; persists across calls | `T/KeyDown.d.ts:1-10`; `L/key_down.js:1` |
| `key_up` | `{window?:W,key:string}` | void; absent hold no-op; shared physical keys remain held while other holds need them; aliases/case normalized, chord order retained | `T/KeyUp.d.ts:1-10`; `L/key_up.js:1` |
| `scroll` | `{window?:W,element_id?:string,direction:Direction,pixels?:number,x?:number,y?:number,key?:string}` | void; element requires W, alternatives are coordinates/current desktop target; native default distance if pixels omitted | `T/Scroll.d.ts:1-21`; `L/scroll.js:1` |
| `type_text` | `{window?:W,element_id?:string,text:string}` | void; element requires W and is focused before typing; invalid target must fail before input | `T/TypeText.d.ts:1-12`; `L/type_text.js:1` |
| `launch_app` | `{app:string}` | void; discoverable app identifier/name; no shell in native API; cua currently intercepts exact app-only shape as described in §4 | `T/LaunchApp.d.ts:1-7`; `L/launch_app.js:1` |
| `get_window_state` | `{window:W,query?:string,include_screenshot?:boolean}` | WindowState below; query case-insensitive and retains matching ancestors; screenshot default true | `T/GetWindowState.d.ts:1-13`; `L/get_window_state.js:1` |

`MouseButton = "left"|"right"|"middle"|"l"|"r"|"m"`; `Direction = "up"|"down"|"left"|"right"|"u"|"d"|"l"|"r"`. Sources: `S/types/MouseButton.d.ts:1`; `S/types/Direction.d.ts:1`.

Optional audio: start input `{max_duration_ms?:number}`, default 60000, integer range 100…300000; returns void. Stop takes no argument and returns `{filepath,bytes,data_url}` for 24 kHz stereo PCM WAV. Implementation runs `pactl get-default-sink`, then ffmpeg PulseAudio `<sink>.monitor`, and quits with `q\n`. Not a native-helper implementation requirement unless that currently-disabled option is deliberately exposed. Source: `L/audio_recording.js:1`; `T/StartAudioRecording.d.ts:1-7`; `T/StopAudioRecording.d.ts:1-6`.

### 1.4 Window/tree schema, identity and unchanged renderer

**Window, field by field** (`T/Window.d.ts:1-23`):

| Field | Type / meaning |
|---|---|
| `id` | number; X11 window identifier, stable for that window’s lifetime |
| `app` | string; desktop application identifier or X11 class |
| `title?` | user-visible string |
| `x`,`y` | numeric desktop origin |
| `width`,`height` | numeric pixel dimensions |
| `focused` | boolean; owns keyboard focus |
| `window_type?` | string, e.g. normal/dialog/popup_menu/tooltip |
| `modal` | boolean; WM modal flag |

**Native output of `get_window_state`** is `{window,ax_tree,ax_tree_source,screenshots:[{filepath}]}`. Service-facing `WindowState` has the same keys, with hydrated capture objects; `ax_tree_source` is exactly `"at_spi"` or `"x11"`. Sources: `T/WindowState.d.ts:29-38`; `L/get_window_state.js:1`; `L/get_screenshot.js:1`.

**AccessibilityNode, every field consumed or preserved:**

| Field | Contract / renderer consequence |
|---|---|
| `id:string` | Native identity in helper output; replaced by compact decimal string in vendor JS. Rendered at each line’s beginning. |
| `native_id?:string` | JS retains original native identity here; renderer uses `(native_id ?? id).startsWith("x11:")` to retain fallback nodes. |
| `role:string` | Exact role vocabulary affects pruning, interactive classification and displayed role; not an arbitrary normalized enum. |
| `name?:string` | First untitled label; omitted/blank values ignored. |
| `description?:string` | Distinct nonblank label, normally titled `Description`. |
| `value?:string` | Distinct nonblank label, normally titled `Value`. |
| `states?:string[]` | Missing is different from empty: empty implies no `enabled`, affecting disabled rendering and pruning. |
| `actions?:string[]` | Original names and order matter to primary/secondary-action display. |
| `children:AccessibilityNode[]` | Required even at leaves; recursively hydrated and traversed. |
| `to_string()` | JS-only, non-enumerable; not a wire field. Custom Node inspection uses the same function. |

State vocabulary is `checked,defunct,editable,enabled,expanded,focusable,focused,selected,sensitive,showing,visible,indeterminate,checkable`. Source: `T/WindowState.d.ts:4-27`; `C/src/cua-api/linux-accessibility-tree.mjs:11-16,30-51,55-137`.

The complete journey:

1. Helper emits native tree and screenshot paths.
2. Vendor JS reads each path and creates JPEG `data_url` plus bytes.
3. `ElementIds.assign` traverses **all raw nodes before rendering/pruning**. One monotonic counter starts at 0 for the client and is shared across windows; each window has its native-ID→decimal-ID map.
4. For an unfiltered observation the map is rebuilt from current nodes, reusing IDs from the previous observation when native identity remains. A vanished then later reappearing identity gets a new number once it has fallen out of that map. A nonblank trimmed query copies the old map, preserving identities outside the filtered result.
5. `click`, `scroll`, `type_text`, `perform_secondary_action` translate all-digit element IDs back through the selected window’s map; nonnumeric strings pass through as native IDs. An unknown decimal ID throws the refresh sentence below.
6. Service removes screenshot bytes for transport. `src/cua-api/sky.mjs` reconstructs bytes and attaches **cua’s unchanged renderer** to every node.
7. Bound App refreshes its captured `window` metadata from each observation and prefixes rendered output with `Accessibility source: <source>\n`.

Sources: `L/get_window_state.js:1`; `L/element_ids.js:1`; `L/get_screenshot.js:1`; `L/{click,scroll,type_text,perform_secondary_action}.js:1`; `S/service.js:1`; `C/src/cua-api/sky.mjs:65-80`; `C/src/cua-api/bind-linux-app.mjs:13-19`.

**Renderer’s grammar and policy are in JS, not sky_linux.** One line per retained node: tab indentation, decimal ID, role/flags/labels; no trailing newline is added. `group,panel,filler,section,generic` render as `container`; `text,static,label` as `text`; `menu item` has no role text. Flags in order: focused, selected, expanded, indeterminate, checked/unchecked, settable, disabled. Labels deduplicate by exact text; long labels (>100 chars or containing newline) sort after short ones. `\r`, `\n`, `\t` in content are escaped. Source: `C/src/cua-api/linux-accessibility-tree.mjs:19-51,124-137`.

Pruning retains labels/images/icons, retained descendants, X11 fallback nodes, or usable interactive nodes; collapses empty noninteractive containers; folds redundant text into parents when there are no interactive descendants; merges runs of plain-text leaves under noninteractive parents. Interactive state/action/role lists are explicit at `:114-122`. Secondary actions hide the first action if it is press/click/dodefault/clickancestor, and hide one unique showcontextmenu action. Sources: same file `:43-47,55-122`. These exact data dependencies make “roughly equivalent tree JSON” insufficient.

**Model-facing binding consequences:** `getApp` accepts only positive safe-integer `{windowId}` and does not launch. `listApps` maps native `{id,name,windows}` to `{id,displayName:name,isRunning:windows.length>0,windows}`. `getAXState` always returns full state, ignoring diff preference. A standalone screenshot requires exactly one region; combined observation tolerates zero and returns `{state}`. `paste` permits text only and calls `type_text`, not `clipboard_write`. Sources: `C/src/cua-api/create-tinysky-alt.mjs:62-91`; `C/src/cua-api/get-state.mjs:19-28`; `C/src/cua-api/bind-linux-app.mjs:21-42,69-83`; `C/src/cua-api/display.mjs:39-45`.

**Background behavior is part of the published API:** selected-window input does not activate the window or move the desktop pointer; apps may themselves activate another window or grab the pointer during held clicks, drags or menus. Coordinates remain window-relative. X11 fallback elements are observation-only. Sources: `C/docs/cua-api/core.md:158-168,202-206`.

### 1.5 Errors, exact names and sentences

Linux wrappers/transport use plain JS `Error`, not macOS `SkyComputerUseError`/numeric error codes. Unknown discriminants can raise `UnreachableCaseError`. The trusted worker serializes only `error.message` (or `String(error)`), not class-specific fields. Secret substitution adds cua’s `SecretInputError` at the trusted boundary and deliberately sanitizes downstream failures. Sources: `L/sky_linux_transport.js:1`; `S/service.js:1`; `C/src/repl-host/trusted-worker.mjs:141-166`; `C/src/services/secret-input.mjs:26-32`; `C/src/services/sky.mjs:116-135,218-239`.

Exact sentences already depended on by facades/harnesses:

| Sentence | Evidence |
|---|---|
| `Sky runtime method is not available: <method>` | `S/service.js:1` |
| `Sky drag handles require the Linux runtime` | same |
| `Sky drag handle has not been started` | same |
| `drag handle can only be started once` | `L/drag_handle.js:1` |
| `drag handle must be started before moving` | same |
| `drag handle must be started before ending` | same |
| `Unknown element ID <id> for this window; refresh get_window_state()` | `L/element_ids.js:1`; parity `C/test/repl-parity/scenarios/native.mjs:40` |
| `linux getApp requires { windowId } from listApps() or listWindows().` | `C/src/cua-api/create-tinysky-alt.mjs:88-90`; parity `:23` |
| `Window <id> is unavailable.` | create-tinysky `:65-67`; current policy `C/src/services/engine/policy.mjs:191-195` |
| `Screenshot unavailable for window <id>.` | `C/src/cua-api/bind-linux-app.mjs:26-29` |
| `Window <id> has multiple screenshot regions; a single screenshot is unavailable.` | `C/src/cua-api/display.mjs:39-41` |
| `Linux scroll accepts { pixels }, not pages.` | binder `:57-58`; parity `:32-36` |
| `pixels must be a positive finite number.` | display `:26-28`; parity `:36` |
| `selectText is unavailable on Linux.` | binder `:69-70`; parity `:38` |
| `setValue is unavailable on Linux; use click, pressKey, and typeText.` | binder `:72-73`; parity `:39` |
| `Linux paste supports only text format.` | display `:44-45`; parity `:43` |
| `launchable application "<app>" was not found` | `C/src/services/sky.mjs:188-191`; parity `:22`; native format fragments `B64@0x25fd1e,0x25fd37` |
| `Computer Use was not approved to use <display>` | current policy `C/src/services/engine/policy.mjs:215-220` |

Current Linux approval validation additionally raises `Computer Use app approval requires an object input`, `Computer Use app approval requires a window from listWindows()`, `Computer Use app approval requires a non-empty app`, and `Window <id> names no app to approve.` Sources: policy `:179-195`.

The GTK/NoReply failure sentences are recorded in §3. They should be characterized by an oracle, not intentionally recreated as product defects.

### 1.6 Private helper transport and process lifetime

- Helper path: package `bin/linux/sky_linux_${process.arch}`; trimmed nonempty `OAI_SKY_LINUX_BIN` overrides it. Default package lookup checks existence; override bypasses that check. Sources: `L/sky_linux.js:1`; `S/core/package_bin.js:1`.
- Spawn argv: optional `--mouse-size-px <value>` **only if JS option is truthy**, then `server`. Therefore `mouse_size_px:0` is not forwarded even though the type comment describes 0 as disabling it. Do not silently call this verified working disable behavior. Sources: `L/sky_linux.js:1`; `T/Options.d.ts:5-8`.
- One cached transport per serialized `[binaryPath,args]`, lazily spawned on first request; `stdio:[pipe,pipe,pipe]`; inherits worker environment/cwd. No shell. Sources: `L/sky_linux.js:1`; `L/sky_linux_transport.js:1`.
- Request framing: UTF-8 JSON followed by LF, `{id:<number starting at 1>,command:<method>,input:<input or {}>}`.
- Response: one LF-delimited JSON object with numeric `id`. Strict `ok===true` resolves `.output`; otherwise string `.error`, or fallback `sky_linux request failed: <command>`, becomes Error. `restart===true` on an error clears/kills the child and rejects its other pending requests.
- Requests may be pipelined by JS; a pending map correlates responses. This proves client concurrency, **not concurrent native execution**. Unknown response IDs are ignored. There is no advertised unsolicited event shape: every nonblank stdout line must parse and carry a numeric ID.
- Invalid JSON → `sky_linux server emitted invalid JSON: <line>`; missing numeric id → `sky_linux server response missing numeric id`. Both reset/kill child and reject pending work. Blank lines ignored. Stderr retains the last 8192 JS string units (not a rigorous byte count) and is appended, trimmed, to `exit=<code>` / `signal=<signal>` diagnostics.
- Pipes are unref’d; child is ref’d while requests are pending, unref’d when idle. Errors/exit reset the transport; next request can spawn a replacement. No request timeout, cancellation wire message, explicit shutdown method or registration handshake appears in this JS transport.
- `sky_linux()` stringifies non-null output for wrappers to parse; nullish output becomes `""`; void methods ignore it. `get_window_state` and list/read methods parse it. Sources for preceding six bullets: `L/sky_linux_transport.js:1`; `L/sky_linux.js:1`; individual wrappers.

Settling is JS-side: successful input defers next eligible call by `max(0,post_action_sleep_ms ?? 100)`; later calls wait until that deadline. Listing, state and screenshot reads wait but do not defer. Clipboard release neither waits nor defers. Source: `L/action_settler.js:1`, individual wrappers.

Options are loaded from JSON at `OAI_SKY_CONFIG_PATH` if present, otherwise target defaults from process.platform. Current cua creates a fresh environment with a narrow allowlist and explicitly sets only the Linux binary override, so ambient audio/config/backtrace/AT_SPI_BUS knobs are not automatically forwarded. Sources: `S/load_options.js:1`; `C/src/runtime/launch.mjs:183-184,262-265,293-299`; `C/src/runtime/linux-desktop.mjs:27-43`.

Under the current own host, the trusted worker and its sky_linux child survive kernel reset/timeouts; the helper is protected as part of that worker’s process tree and ends when the worker/session is stopped/reaped. Do not reset helper-owned clipboard handles/held keys merely because the JS kernel resets. Source: `C/src/repl-host/supervisor.mjs:14-20,40-58,199-205,234-269`. Vendor node_repl internals are out of scope.

## 2. Vendor ELF facts and static behavior catalogue

### 2.1 Identity, toolchain, dependencies and libc floor

| | x64 pin | arm64 pin |
|---|---|---|
| File | `B64` | `BA` |
| Bytes | 3,423,488 | 3,189,032 |
| SHA-256 | `7ac3c2ae45a3dacc9209063e91d2df4ea9f206b814a9ffd976f5bcf90d73f1cd` | `a2ee3b612a2a65a9e1cb429b69954f9cfddf26072568aeb882f42e0545da2193` |
| ELF | 64-bit little-endian PIE, x86-64, not stripped | 64-bit little-endian PIE, aarch64, not stripped |
| Interpreter | `/lib64/ld-linux-x86-64.so.2` | `/lib/ld-linux-aarch64.so.1` |
| Build ID | `3e0dd87b3c0616e007710a46bc8612a0ae0415fe` | `bc99630cabe403db047afdd92d1b7ebdc670b62f` |
| ELF OS ABI note (`file`) | GNU/Linux 3.2.0 | GNU/Linux 3.7.0 |
| Highest GLIBC version need | **2.30** | **2.30** |
| GLIBCXX requirement | none observed | none observed |

Evidence: `file B64 BA`; `shasum -a 256 B64 BA`; `stat` via Python; each `objdump-p.txt`, `dynsyms.txt`, `comment.txt`.

Both `.comment` sections identify **rustc 1.94.1 (e408947bf 2026-03-25)** and **GCC (Debian 10.2.1-6) 10.2.1 20210110**. arm64 also contains **clang 21.1.0-rc2**. These prove compiler objects/toolchain strings present, not which compiler generated every component. Rust panic source paths include `/rustc/e408947bfd200af42db322daf0fadfe7e26d3bd1/library/...`; for example `B64@0x25fcc9`. No DWARF sections appear in `llvm-objdump -h` for these pins; named symbol tables remain. Evidence: `.comment` dump and section table.

**DT_NEEDED, both:** `libX11.so.6`, `libgcc_s.so.1`, `libpthread.so.0`, `libm.so.6`, `libdl.so.2`, `libc.so.6`. No libstdc++, libatspi, libdbus, libXtst, libXfixes or libXcomposite NEEDED entry. That does not imply those X protocols are unused: x11rb implements protocol requests without their C client libraries. Evidence: `llvm-objdump -p B64/BA`.

**ABI qualification:** `gettid@GLIBC_2.30`, `statx@GLIBC_2.28`, and `posix_spawn_file_actions_addchdir_np@GLIBC_2.29` are weak dynamic symbols. The highest non-weak GLIBC-tagged imported symbol in the pin is 2.17 on both architectures. Nevertheless `.gnu.version_r` includes GLIBC_2.30 with flags `0x00`, not a weak version requirement. The appropriate static deployment floor is therefore **glibc 2.30 on both**, not 2.17; a claim that weak symbols let this particular ELF load on older glibc would need an actual loader test. No such test was run. Evidence: `dynsyms.txt` weak `w DF` rows and `objdump-p.txt` version-reference flags.

The mirrored archives themselves hash to x64 `8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30`, arm64 `ab3eea138b767555aecb2b69f4aa553d843e6c5ef3037645e544aafc72d0f5cd`, matching release pins. Command: `shasum -a 256 /Users/new/cua-mirror/chatgpt_26.928.40906_{amd64,arm64}.deb`; pins `C/runtime/releases/26.928.40906-linux-{x64,arm64}.json:7-11`.

### 2.2 Rust crate evidence

Both pins expose the same versioned cargo source-path set. These are **observed linked source-path strings**, not a recovered Cargo.lock or complete dependency graph:

- Core: `anyhow 1.0.102`, `serde 1.0.228`, `serde_core 1.0.228`, `serde_json 1.0.149`, `itoa 1.0.18`, `once_cell 1.21.4`, `smallvec 1.15.1`, `rustix 1.1.4`.
- CLI: `clap_builder 4.6.0`, `clap_lex 1.1.0`, `anstream 1.0.0`, `anstyle 1.0.14`, `strsim 0.11.1`.
- X11: `x11rb 0.13.2`, `x11rb-protocol 0.13.2`.
- Imaging: `image 0.25.10`, `image-webp 0.2.4`, `zune-jpeg 0.5.15`, `zune-core 0.5.1`, `zune-inflate 0.2.54`, `png 0.18.1`, `gif 0.14.2`, `tiff 0.11.3`, `exr 1.74.0`, `fax 0.2.7`, `half 2.7.1`, `weezl 0.1.12`, `bytemuck 1.25.0`.
- Compression/concurrency: `fdeflate 0.3.7`, `flate2 1.1.9`, `miniz_oxide 0.8.9`, `crossbeam-deque 0.8.6`, `crossbeam-epoch 0.9.18`, `rayon-core 1.13.0`.

Reproducible command: regex `/registry/src/[^/]+/([^/ ]+)` over `D64/strings.txt` or `DA/strings.txt`, unique sorted results. Specific anchors: `B64@0x25f3ad image`, `0x25f411 x11rb`, `0x2671df x11rb-protocol`, `0x25f6c3 serde`, `0x260149 anyhow`. Rust stdlib dependencies also appear under `/rust/deps/` (e.g. addr2line 0.25.1 at `0x25fffd`); do not mistake them for application-declared dependencies.

### 2.3 Surviving wire/schema data

Pinned ELF serde literals include `struct ServerRequest`, `id`, `command`, `input`, `struct ServerRequest with 3 elements` (`B64@0x267d9e…0x267dea`). Command enum vocabulary agrees with the 20-method JS list, accounting for short strings emitted elsewhere: `key_down` and `duration` at `0x256cf7`, most command names at `0x267f3a…0x268014`; `get_window_state` and `clipboard_release` also at `0x2552a0`. `server` is an additional native CLI/command variant, not a setup method. `clipboard_owner` is an additional internal mode, not model API (`0x26863f`). Sources: raw bytes/strings at those offsets; `D64/rust-string-slices.json` includes exact command-name slices.

Serde also retains `struct Input`, `struct Target` (one field), `struct Point` (two fields), the method field-name vocabulary (`window,key,x,y,element_id,mouse_button,click_count,direction,pixels,app,dx,dy,handle,query,include_screenshot,action`), and drag variants `start,move_to,end`. `Input` has an internally tagged enum diagnostic at `B64@0x26a6b7` vicinity. Native serializer symbols remain for `AccessibilityNode`, `Window`, and deserializer `window::Target` (see `D64/nm.txt`, addresses `0xc0940`, `0xc1460`, `0xc1670`). These are useful tier-2 schema targets; they are not enough to prove every native default or integer width.

Response vocabulary `ok,output,restart` appears at `B64@0x268780` vicinity. Native diagnostics independently confirm line-server stages: failed to parse/read server request; failed to write/terminate/flush server response; `server command cannot be nested`; `failed to parse command input`. They also state that key_down/up and clipboard_read/write/release require server mode (`0x26a507…0x26a6b7`). The JS transport is the authoritative already-read framing contract.

Some wire keys are stored as code immediates or split strings: a plain ASCII search does not find `ax_tree_source`, `native_id` or `screenshots` in the pin despite those keys being proven by JS/types. Therefore absence of an identifier in `strings` is not proof it is absent from emitted JSON.

### 2.4 AT-SPI: direct D-Bus, identities and observation

**Observed implementation:** own symbols `sky_linux::client::x11::dbus::{Connection::connect,Connection::call,Reader::value,Reader::signature,write_header_string,decode_address_value,alignment}`. Source path `src/client/x11/dbus.rs` at `B64@0x25fd8a`. Strings `AUTH EXTERNAL`, `BEGIN`, `Hello`, Unix path/abstract socket errors, unsupported big-endian replies and message/signature parser diagnostics at `0x269ac7…0x269d1a`. This is strong positive evidence of a private direct D-Bus implementation, not merely absence of libatspi. No atspi/zbus/zvariant/libdbus crate/name was found. Evidence: `D64/nm.txt`, both NEEDED lists and byte search.

**Bus discovery vocabulary:** `AT_SPI_BUS`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, `org.a11y.Bus`, `/org/a11y/bus`, `GetAddress`; socket fallback fragments `unix:path=` and `/bus`. Sources: `B64@0x268cbd…0x268d3b`, `0x25f943`, `0x25f94f`. The exact precedence, activation/reconnect policy and timeouts still require decompilation/tracing. Note cua currently forwards the session bus variables but not ambient `AT_SPI_BUS`.

**Interfaces/methods/properties named in the pin:**

| Area | Vocabulary observed | `B64` offsets |
|---|---|---|
| Registry and identity | `org.a11y.atspi.Registry`, `/org/a11y/atspi/accessible/root`, `org.freedesktop.DBus.GetConnectionUnixProcessID` | `0x2691ca…0x269267` |
| Accessible | `org.a11y.atspi.Accessible`, `GetState`, `GetRoleName`, `GetChildren`, `GetInterfaces`, `ChildCount`, `Description` | `0x268a6e`, `0x256d30`, `0x268c32`, `0x26957c`, `0x268d6b`, `0x268a87`, `0x268b8b` |
| Properties | `org.freedesktop.DBus.Properties`, `Get` | `0x268a4c` vicinity |
| Component | `org.a11y.atspi.Component`, `GetExtents`, `GetSize`, `GetAccessibleAtPoint` | `0x268a91`, `0x268aa9`, `0x268d3b`, `0x268d78` |
| Action | `org.a11y.atspi.Action`, `NActions`, `GetName`, `DoAction` | `0x269479`, `0x256d48`, `0x26948e`, `0x256d58` |
| Text | `org.a11y.atspi.Text`, `GetText`, `CharacterCount`, `CaretOffset`, `SetCaretOffset`, `GetNSelections`, `GetSelection`, `AddSelection` | `0x26898d`, `0x268bc8`, `0x26895d`, `0x268fc3`, `0x2689a0`, `0x268fce`, `0x268fdc`, `0x26901f` |
| EditableText | `org.a11y.atspi.EditableText`, `CopyText`, `DeleteText`, `PasteText` | `0x269321`, `0x256d40`, `0x269369`, `0x269373` |
| Table-specific traversal | `Table`, table hit-test diagnostics, own functions `visible_table_cells`, `find_visible_table_cell` | diagnostics `0x268d8b…0x268f55`; symbols in §5 |

The binary checks GetState for two uint32 words/bitset, Action count for integer/variant/nonnegative, children for object references, bounds/size/selection offsets for validity. These are observed validation strings, not proof of their order or all fallback branches. Sources: `B64@0x2689ed…0x268bc8`, `0x268fdc…0x26916d`, `0x26949c…0x2695b8`.

No `GetItems`, `GetMatches`, `GetAttributes`, `SetTextContents`, `InsertText` or `RemoveSelection` ASCII strings were found in either **pinned** binary. This does not prove those operations impossible, but there is no positive evidence of Cache/Collection-based bulk traversal; do not describe the vendor as using them. The newest binary differs on text methods (§2.9).

Identity-related static evidence is unusually rich:
- `match_window`, `at_spi_window`, `element_in_window`, `element_with_ancestors_in_window` survive as symbols.
- Refusals name no usable `_NET_WM_PID`, multiple provider windows matching identity, equal title-and-size collisions, unavailable size, and an X11 identity changing while resolution occurs.
- `AT-SPI provider with process ID <…> is unavailable for X11 window <…>` and `element is not in this window's AT-SPI tree; refresh get_window_state()` appear.
- X11 fallback ID prefix includes `x11:0x`; these IDs identify windows only and are refused for AT-SPI element actions.

Sources: `B64@0x25f7a2…0x25f860,0x25f954…0x25fad6,0x25faf8,0x269267…0x269321`; symbols §5. **Inference:** identity matching uses process, title and size with ambiguity refusals, rather than choosing the first same-title window. Exact ordering and rechecks remain tier 2.

### 2.5 X11, background input and capture

Positive native evidence:

- `x11rb::protocol::xtest::fake_input` has a real symbol (`B64` VA `0x6a510`; `BA` VA `0x5bed4`). `XTEST` protocol name appears at `B64@0x2a5bf0`.
- `BackgroundWindow::send_event`, `BackgroundWindow::move_to`, `BackgroundSession::send_focus`, `InputTarget::send_event`, `focus_is_within` and `KeyboardState::{target,acquire,release,key_down,key_up}` are separate functions. Thus background targeting is not merely a coordinate adjustment around XTest. Exact event delivery/masks/synthetic focus behavior need tier 2.
- Background errors require an application window and position; reject outside-window positions; require an X11 timestamp; refuse unmapped windows before background input/screenshot. Sources: `B64@0x2687fc…0x26892c`, `0x25fb9d…0x25fbf6`; `D64/nm.txt`.
- Four Xlib imported functions are visible: `XOpenDisplay`, `XCloseDisplay`, `XKeycodeToKeysym`, `XKeysymToKeycode`; resolution errors explicitly mention synthesized Shift. Sources: both `dynsyms.txt`; `B64@0x268795…0x26880e`.
- Capture names `WindowBuffer::new`, `capture_screenshot`, `mouse_overlay`; Composite `NameWindowPixmap`/`RedirectWindow` vocabulary; exact error `window rendering requires the X Composite extension`; `GetImage`; XFIXES `GetCursorImage`; cursor pixel-count validation. Sources: `B64@0x2698a0,0x2a6390,0x2a62fb,0x256fd0,0x2a5c8e,0x25fb51…0x25fb9d`; symbols §5.
- JPEG file creation/geometry diagnostics and `.jpg` suffix appear at `B64@0x25fc18…0x25fcb2`. image/JPEG crates support the JS-declared JPEG path. Exact capture region, quality, cursor compositing, occlusion and minimized-window behavior require decompilation/live tests rather than guessing from the codecs present.

**Negative search results, both pinned ELFs:** zero exact byte matches for `uinput`, `/dev/input`, `wayland`, `Wayland`, `portal`, `libei`, `XInput`, `XINPUT`, `XInputExtension`, `MIT-SHM`, `XShm`, `RANDR`, `XINERAMA`, `xclip`, `xsel`. Together with positive x11rb/XTest/Composite/XFixes evidence, the supported static characterization is **X11-specific engine; no positive evidence of native Wayland, portal, libei, uinput, XI2 or XShm routes**. Do not elevate a negative string search into a universal proof. Reproduce with isolated Python `bytes.find` or inspect `term-offsets.json`; doctor independently requires exactly XTEST/Composite/XFIXES (`C/src/runtime/linux-desktop.mjs:21,75-83`).

### 2.6 Clipboard and text routing

The pin has its own X11 clipboard selection implementation, not an xclip/xsel subprocess route. Surviving names include `ClipboardState::restore`, `paste_owner`, `snapshot_bytes`, `selection::SelectionOwner::start`, `SelectionReader::{read,snapshot,current_state,lock}`, `set_selection_owner_if`, `Property::write`, and `persistent::preserve` closure. Sources: `D64/nm.txt`; source path `B64@0x25ff92`.

Protocol/format literals: `CLIPBOARD`, `TARGETS`, `INCR`, `UTF8_STRING`, `text/plain`, `text/plain;charset=utf-8`, private atoms `SKY_CLIPBOARD_PROPERTY`, `SKY_CLIPBOARD_STOP`, `SKY_CLIPBOARD_LOCK`, and `SKYCLIP1`. Sources: `B64@0x26a4ba…0x26a507`, `0x257878`, `0x269fe2…0x26a026`, `0x256d9f` vicinity. No `MULTIPLE`, `SAVE_TARGETS`, `CLIPBOARD_MANAGER` or `TIMESTAMP` ASCII string was found; do not promise those selection capabilities from this tier.

The helper stores immutable multi-format snapshots behind opaque handles, can restore an earlier clipboard, and has a private `clipboard_owner` subprocess/handoff mode. Positive diagnostics name owner readiness, input/output, restored-owner failure, duplicate formats, invalid TARGETS, INCR chunk/type/alignment failures, changed ownership while capture is underway, lock contention, transfer completion and restore failure. Sources: `T/ClipboardHandle.d.ts:1-8`; `B64@0x269ed0…0x26a507`; `0x25c5c0` (`clipboard_owner cannot be nested`). Exact lifetime/persistence after parent exit is not proven solely by a `persistent` symbol.

Text routing cannot be reduced to “press Ctrl+V”: static evidence contains `focused_editable`, editable clipboard operations, menu-action search, focused context actions, CopyText/DeleteText/PasteText, selection preservation, CharacterCount verification and SetCaretOffset. It also contains the exact failure `editable Paste did not insert text` (`B64@0x26896b`) and a post-Paste caret refusal. This matches recorded GTK failures but **does not prove the root-cause call order**. Trace/decompile the functions in §5 before selecting a replacement text strategy.

### 2.7 Validation, policy lists, grammar, limits and timing

**Native input refusal vocabulary** (pinned `B64@0x267dea…0x268014`, `0x2687fc…0x26892c`):
- `element click requires window`
- `element click supports one left or right click without key or duration; use coordinates for other mouse options`
- `provide element_id or x/y, not both`
- `window click requires coordinates or an element`
- `coordinate click requires both x and y`
- `element scroll requires window`
- `element typing requires window`
- `drag path must contain at least two points`
- `pixels must be non-zero`
- `x and y must be provided together`
- `key must be a non-empty string`
- `background pointer input requires a position`
- `background pointer position is outside the target window`

Action/element refusals include empty action name, no primary action, unsupported/ambiguous named action, element not visible before right click, element not editable, element outside the selected AT-SPI tree, and X11 fallback not actionable. Sources: `B64@0x268aa9…0x268bc8,0x268f78…0x26916d,0x269267…0x269321`; format fragments `0x25f8d2…0x25f943`.

**Policy:** no pinned binary strings `blocked`, `forbidden`, `password`, `secret` were found, and no app-deny-list implementation was identified in its own-crate symbols. This is only negative evidence. Current cua explicitly documents/implements Linux approvals with **no forbidden/risk lists**, all low risk; its macOS lists are not Linux policy. Source: `C/src/services/engine/policy.mjs:153-176`. Renderer role/action/state policy lists are fully visible and binding in §1.4.

**Application discovery:** native symbols `desktop_entries`, `expand_exec`, `executable_exists`; literals XDG_DATA_HOME, XDG_DATA_DIRS, applications, `.local/share/applications`, `/usr/local/share:/usr/share`, `.desktop`, Terminal, and desktop Exec quote/escape failure. Sources: `B64@0x269970…0x269a1f,0x256d60`; `D64/nm.txt`. No `OnlyShowIn`, `NotShowIn`, `TryExec`, `NoDisplay`, `Hidden`, `DBusActivatable`, `StartupWMClass`, `XDG_CURRENT_DESKTOP` ASCII strings were found. Small compiler-emitted constants make that an insufficient basis to assert those fields are ignored; inspect `desktop_entries` before implementing discovery parity.

**Confirmed numeric bounds/timing:**
- 100 ms default inter-action settle, configurable and clamped at zero: JS `L/action_settler.js:1`.
- Mouse size documented default 12 px, option 0 documented disable but not forwarded by wrapper: `T/Options.d.ts:7-8`; `L/sky_linux.js:1`.
- Relative pointer offsets signed −32768…32767 integers: `T/MoveRelative.d.ts:2-5`.
- Drag path minimum two points; element click exactly one left/right without key/duration: literals above and typed contracts.
- Native editable clipboard operations accept at most one selection: `B64@0x26940a` vicinity.
- Transport stderr tail 8192 string units; IDs start at 1; no JS timeout: `L/sky_linux_transport.js:1`.
- Optional audio 100…300000 ms/default 60000: §1.3.
- Long renderer label threshold >100 characters: renderer `:137`.

**Native boundedness is observed, but its numbers are not recovered in this tier:** AT-SPI depth/node/tree/traversal limits; X11 fallback depth/node limits; D-Bus maximum-message size; clipboard per-format/total bytes, number of formats, total handle storage and number of handles; clipboard lock/update/read/capture/paste/owner-readiness deadlines. Sources: `B64@0x26892c…0x26961a,0x269a1f…0x269ae1,0x269ed0…0x26a507`. CLI literals include `client`, `timeout_ms`, `mouse_size_px`, `--timeout-ms`, `--mouse-size-px`, `x11-full-desktop` (`0x26855a…0x2685b5`, `0x255100`), and `OAI_SKY_LINUX_BACKTRACE` (`0x268736`). Numeric native defaults, their scope, and cleanup semantics require §5 decompilation. Do not substitute the 100-ms JS settler for a native timeout or infer an arbitrary image-codec “255” string is a text-input limit.

**Text grammar:** the binary supplies raw role/state/action/label values; the model’s condensed grammar, action hiding, pruning, decimal numbering and `Accessibility source:` prefix are JS contracts (§1.4). No need to reverse-engineer a separate native formatted-tree grammar that is not the active architecture.

### 2.8 What remains unproven by static tier 1

Exact native execution serialization, request timeout/default; AT-SPI bus activation/reconnect; identity matching sequence; complete traversal bounds and visible-table sampling; query matching fields; background event masks and focus spoofing/restoration; held-button/key cleanup; screenshot geometry, quality and obscured/minimized semantics; clipboard size/deadline constants and persistent-owner shutdown; all text-input fallbacks and their safety checks. These are explicit tier-2 questions, not missing facts filled with inference.

### 2.9 Delta: 26.928 → 26.1013 → 26.1023

The pinned contract above remains authoritative for drop-in work.

| Build inspected | Binary | Bytes / SHA-256 | ABI / libraries | Observed change |
|---|---|---|---|---|
| 26.928.40906 | both, `B64`/`BA` | §2.1 | GLIBC max 2.30; no GLIBCXX; six NEEDED listed above | 20-method JS surface; pin’s native routes |
| 26.1013.31256 | arm64 `BM` | 3,540,120; `ad9279a6b3d63c41f0bdc88f99c15d22d3d6a969e36f81e644bff9c14dd4588a` | GLIBC max 2.30; no GLIBCXX; same NEEDED; adds strong `pow@GLIBC_2.29` | Same 27 Linux wrapper JS files byte-for-byte; native virtual-cursor subsystem |
| 26.1023.51421 | x64 `BN` | 3,926,760; `88ce5e0ae64290dd36dbb2942a33ece6a7222f7294fc66410f4e26c29e4b2991` | GLIBC max 2.30; no GLIBCXX; same NEEDED; strong `pow@GLIBC_2.29` | New native `type_characters` command and `follow_focused_modal` field; verified-paste machinery |

Evidence: each directory’s objdump/nm/strings files; `shasum`/file-size commands. Middle helper independently extracted from `/Users/new/codex-app-src/_dist/linux/chatgpt_26.1013.31256_arm64.deb`; its hash agrees with existing `/Users/new/codex-app-src/readable/chatgpt-26.1013.31256/cua-native/linux/sky_linux_arm64/info.txt:1-5`.

**Middle build:** readable `.../chatgpt-26.1013.31256/cua_node/@oai/sky/dist/project/cua/sky_js/src/targets/linux/create_client.js:31-55` advertises the same methods/audio gate. Byte comparison of the 27 unprettified `targets/linux/*.js` files extracted from both debs found no change. Native direct own-crate symbol names, normalized only by removing Rust hash suffixes, grow from 103 to 133 on arm64. Added families include `virtual_cursor::{Worker,VirtualCursor,motion,overlay,render}`, `get_screenshot::virtual_cursor_is_viewable`, `InputTarget::move_to_with_arrival`, `report_desktop_pointer`, and `windows::focused_window`. Cargo path inventory adds `tiny-skia 0.11.4`, `tiny-skia-path 0.11.4`, `arrayvec 0.7.6`. Evidence: `DA/nm.txt` vs `DM/nm.txt`; `DM/strings.txt`. Disappearing symbols can reflect inlining and do not prove functionality was removed.

**Newest build:** native serde command vocabulary includes `type_characters` at `BN@0x2cedff`; input field vocabulary includes `follow_focused_modal` at `0x2cefba`, neither present in the inspected pin or middle binary. New own families include `accessibility::verified_paste::{TextField,TextSelection,Expected,DesktopKeyboardFocus}`, `action_dialog::ActionDialog`, `observe_field_focus`, `element_click_position`, `perform_action_at_index`, `KeyboardState::type_characters`, `KeyPresser::type_character`, `literal_keycodes`, D-Bus `send_call` and `PendingReply::read_next`, and clipboard transfer-wait/observer machinery. Source: `DN/nm.txt`; `DN/strings.txt`.

Newest text vocabulary includes `InsertText` (`0x2cfed2`), `SetTextContents` (`0x2cffa3`), GrabFocus, SetSelection, and deliberate refusals such as `Paste was sent once; inspect the field before retrying`, `requested field or selection changed before dispatch; no Paste was sent`, and `window no longer has desktop focus; no Paste was sent` (large literal cluster beginning `0x2cfd18`). This is important prior-art evidence of safety/verification work, **not proof that the GTK3 defect is fixed**. Prioritize these routes in tier 2.

Newest direct own-crate name count is 169 under the same filter, but this comparison crosses arm64→x64 and compiler inlining affects symbol presence; counts are not a behavioral metric. **Newest JS was not available at the supplied extraction path and was not fetched. Its setup advertisement, argument declarations and service wrapper changes remain explicitly unverified**, assigned to the VM follow-up.

## 3. Measured bar and known vendor defects

### 3.1 Recorded operation baselines

Two environments must not be blended:

**M0, local cua-linux Tart VM, vendor host, gedit:** `N/README.md:11-39` records wall median / p95 / in-cell median in ms:

| Operation | Samples | Wall median | p95 | In-cell median |
|---|---:|---:|---:|---:|
| SSH pipe open | 15 | 189 | 246 | — |
| cold handshake absent total | 6 | 478 | 611 | — |
| cold handshake present total | 9 | 451 | 477 | — |
| warm no-op | 90 | 1.9 | 3.4 | 0.00 |
| getState | 90 | 7.4 | 13.4 | 5.1 |
| listApps | 90 | 7.0 | 10.1 | 5.0 |
| bind getApp | 3 | 509 | 513 | 506 |
| full getAXState (~10.9k chars, 399 elements) | 90 | 428 | 709 | 425 |
| window screenshot (910×756 JPEG, ~35.7 KB) | 90 | 532 | 710 | 527 |
| task, 43 keys + verify + clear | 30 | 19,223 | 19,410 | 19,211 |
| 43 pressKey calls alone | 30 | 17,351 | 17,545 | 17,347 |
| end_task | 3 | 2.7 | 2.7 | — |

All tasks succeeded; no approvals were requested in that historical sitting (`N/README.md:6-9,28`). This is not the current post-#117 approval path.

**M5, quiet GCE cua-bench, Ubuntu 24.04.5, arm64 Ampere Altra 4 vCPU/16 GiB, Xvfb 1440×900/openbox, gedit 46.2:** both host variants still used the same vendor helper. `N/m5-cua-bench/README.md:52-68`; `comparison.md:7-19`. Below, V/C are vendor-host/own-host medians; cold initialize/total wall figures are net of each side’s SSH median. All units ms.

| Operation | V judged wall | C judged wall | V in-cell | C in-cell |
|---|---:|---:|---:|---:|
| cold.miss.initialize | 553.3 | 491.9 | — | — |
| cold.miss.tools_list | 187.4 | 175.8 | — | — |
| cold.miss.first_js | 640.0 | 651.8 | 0.01 | 0.01 |
| cold.miss.total | 1368.7 | 1359.1 | — | — |
| cold.hit.initialize | 411.7 | 89.2 | — | — |
| cold.hit.tools_list | 160.0 | 172.2 | — | — |
| cold.hit.first_js | 755.3 | 769.1 | 0.01 | 0.01 |
| cold.hit.total | 1329.3 | 1047.2 | — | — |
| warm.noop | 176.0 | 173.1 | 0.01 | 0.01 |
| warm.getState | 174.2 | 179.8 | 2.50 | 2.67 |
| warm.listApps | 167.2 | 167.9 | 2.46 | 2.61 |
| bind.getApp | 521.3 | 529.4 | 351.4 | 362.0 |
| warm.getAXState | 497.8 | 518.6 | 328.1 | 333.6 |
| warm.getScreenshot | 617.0 | 620.3 | 446.8 | 447.9 |
| task.act, 43 pressKey | 16328.6 | 16318.5 | 16152.1 | 16142.5 |
| task.verify | 499.4 | 512.1 | 330.1 | 336.0 |
| task.clear | 1314.1 | 1318.1 | 1133.6 | 1138.8 |
| task.total | 18158.7 | 18159.3 | 17617.1 | 17616.9 |
| end_task | 159.7 | 189.6 | — | — |

Source for every row: `N/m5-cua-bench/comparison.md:24-43`. Sample plan: 6 cold misses, 9 hits, 90 per warm operation, 3 binds, 30 tasks per side; all successful samples. SSH medians 2149.5/2207.3, not judged (`:17,23`). WAN wall cost is substantial; native-engine speed comparisons should use in-cell/native timings with matched hardware rather than treat WAN variation as engine speed.

Method-case medians V/C: typeText 1634.5/1636.2, paste 1637.8/1662.3, nontext paste refusal 164.8/196.8, setValue refusal 179.3/165.3, selectText refusal 159.4/156.7, pages-scroll refusal 183.3/159.7. Source: comparison `:52-57`.

The old gate allowed median baseline + max(10%,500 ms), not a strict same-speed target (`comparison.md:19`). The owner’s #171 “same or faster” bar is stronger. Original raw verdict **FAIL** was one typeText error-sentence discrepancy, not latency; all 19 latency rows passed. Session ruling accepted the host’s performance because both hosts crashed the target and the vendor itself varied between NoReply/EAGAIN, while preserving raw FAIL. Sources: `N/m5-cua-bench/README.md:5-21`. These are host comparisons, not measurements of an own Linux engine.

### 3.2 The 19 native parity cases and recorded result

Definition: `C/test/repl-parity/scenarios/native.mjs:20-43`. Latest inspected recorded native assertions are all `{ok:true}` in `P:43-99`; the complete sandbox sitting says own-host assertions pass and zero unexpected diff (`C/docs/evidence/2026-10-17-own-sandbox/m3/README.md:58-59`). This is historical evidence, not a fresh run against inspected HEAD.

| Native case suffix | What it really checks | Passing assertion line in P |
|---|---|---:|
| `cua/computer` | namespace/getApp available | 45 |
| `cua/computer.target` | linux | 48 |
| `cua/computer.launch-app` | nonexistent-app error sentence, not a successful launch | 51 |
| `cua/getapp` | four invalid-target refusals + bind owned window | 54 |
| `cua/listapps` | selected window’s app row and shape | 57 |
| `cua/listwindows` | selected window and id/app/title shape | 60 |
| `target-app-decorated-tab/getaxstate` | full AT-SPI state regardless of diff flag | 63 |
| `target-app-decorated-tab/getscreenshot` | nonempty byte array and emitted JPEG | 66 |
| `target-app-decorated-tab/getaxstateandscreenshot` | full state plus nonempty image | 69 |
| `target-app-decorated-tab/click` | caret moved, one character deleted/restored | 72 |
| `target-app-decorated-tab/drag` | multiple contiguous characters selected/deleted/restored | 75 |
| `app/scroll` | visible text range changes; pages/invalid-pixels refusals | 78 |
| `target-app-decorated-tab/scroll` | same witness for second API contract row | 81 |
| `target-app-decorated-tab/selecttext` | unsupported sentence | 84 |
| `target-app-decorated-tab/setvalue` | unsupported sentence | 87 |
| `target-app-decorated-tab/performsecondaryaction` | unknown decimal ID sentence, not successful secondary action | 90 |
| `app/presskey` | type mfour, verify, clear | 93 |
| `app/typetext` | recognized GTK error AND target window exits | 96 |
| `app/paste` | html/md refusal, recognized GTK error AND target window exits | 99 |

Each case also checks clean `end_task`; screenshot cases assert JPEG MIME and >100 decoded bytes. Source: scenario `:11-17`. Fixtures are isolated harness-owned gedit windows (`C/scripts/repl-parity/native.mjs:8-25,34-44`).

**Coverage gap relevant to design:** these 19 do not establish successful secondary actions, rich clipboard handles, desktop controls, held keys/buttons, query-ID persistence, multi-window identity, Unicode text, background focus invariance, Wayland, or performance. Passing two crash-oracle cases is not success at text entry. An improved engine needs an explicit oracle departure/new positive cases, not intentional preservation of crashes. Separate secret scenarios use a recorder double and say so (`C/test/repl-parity/scenarios/native-secrets.mjs:11-14`); do not count them as native input proof.

### 3.3 Recorded defects and architecture differences

- **arm64 GTK3:** typeText/paste crashed gedit 46.2 and mousepad 0.6.1; three gedit trials included empty/nonempty buffers. Recorded cell error `Resource temporarily unavailable (os error 11)`; apport core SIGSEGV in `gtk_text_buffer_get_iter_at_offset`, reached through `gtk_main_do_event`/signal emission. `pressKey` worked. Source: `C/docs/evidence/2026-10-06-linux-acceptance.md:107-113`.
- **Later arm64 repetitions:** same target exit, with `D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying`. Source: `N/README.md:30-35,81`; M5 comparison `:52-53`.
- **x64 GTK3:** two typeText attempts threw **`editable Paste did not insert text`**, but gedit survived; no segfault/core evidence. The recorded packages matched the arm64 fixture. Do not say “GTK3 always crashes on Linux.” Source: `C/docs/evidence/2026-10-06-linux-agent-and-x64.md:193-197`.
- **arm64 GTK4 gnome-text-editor:** typeText/paste inserted text then threw `D-Bus org.a11y.atspi.Text.SetCaretOffset failed: org.freedesktop.DBus.Error.NotSupported`; pressKey did not reach the window. Source: Linux acceptance `:114-116`.
- **Causality boundary:** direct PasteText/selection/caret routes are strongly supported by static names and these recorded outcomes, but this research did not trace the crash. “GTK3 PasteText crash” is a useful case name, not proof of the entire failing call chain. The VM’s dbus-monitor/strace tracing should settle it.

## 4. Migration touchpoints and current cua assumptions

### 4.1 Distribution/path selection

| Touchpoint | Current assumption / implication |
|---|---|
| `C/runtime/releases/26.928.40906-linux-x64.json:14-29` and arm64 counterpart | Whole vendor `cua_node` component; layout requires `@oai/sky/bin/linux/sky_linux_<arch>` and vendor service.js. Retiring these dependencies requires an explicit manifest/distribution decision, not just renaming a binary. |
| `C/src/runtime/manifest.mjs:31,113,166` | `LINUX_LAYOUT_KEYS` requires skyLinuxBin/skyVendorService; derives runtime paths from every pin layout key. |
| `C/src/runtime/checks.mjs:12-14,40-47,62-69` | install/use/doctor verify all layout paths. Linux has no native IPC-version check; archive hash is trust root, no macOS codesign path. |
| `C/src/runtime/install.mjs:70-101,105-129,151` | Existing releases reverified; staged components verified before activation; `.deb` acquisition/extraction path. Replacing engine packaging must not leave validation requiring an unused helper forever. |
| `C/src/runtime/launch.mjs:293-299` | Linux always sets `OAI_SKY_LINUX_BIN=p.skyLinuxBin`, `CUA_SKY_SERVICE=p.skyVendorService`; owned engine selection currently macOS-only. |
| launch `:315-316,376-388` | `nativeEngine:null` on Linux; nativeEngineFor not selected for Linux; vendor **host** explicitly refused since #115. Do not confuse restoring a vendor-engine A/B option with reviving retired vendor REPL host. |
| `C/src/runtime/doctor-engine.mjs:46-58` | engine row skips non-darwin and says pinned Linux helper remains until #171. |
| `C/src/cli.mjs:803` | engine commands refuse with `engine_macos_only`. |
| `C/src/runtime/linux-desktop.mjs:21,27-43,75-95` | XTEST/Composite/XFIXES requirement; environment forwarding; session/AT-SPI bus health checks. Native Wayland support would require a separate capability/doctor decision. |

### 4.2 Trusted service, approvals, secrets and application launch

These are current facts absent from the older survey:

- Wrapper loads `CUA_SKY_SERVICE`, not the old `CUA_SKY_VENDOR_SERVICE` name in historical research. Source: `C/src/services/sky.mjs:245-255`; launch `:295`.
- Linux per-app approval already exists: window-sensitive methods resolve app identity from the engine’s own `list_windows`, **not the request’s `window.app`**. Desktop input/relative motion/drag start use the separate `(desktop)` approval key. Listing, desktop screenshots, clipboard release and drag move/end ask nothing. All Linux requests are low-risk policy; no forbidden list. Source: `C/src/services/engine/policy.mjs:153-223`.
- Approvals run before secret reads/native input. Linux secret expansion only admits exact `type_text({window,text})`, with window a plain primitive-field object containing positive safe-integer id; no concealed marker is added on Linux. Source: `C/src/services/sky.mjs:61-75,114-123,209-239`.
- Exact app-only launch shape is intercepted: validate ID against helper `list_apps`, resolve its trusted desktop entry, approve, then call `nodeRepl.launchServices.openApplication`. Helper-native launch is not used for this model-facing path. Sources: wrapper `:137-165,188-194,209-211`.
- Supervisor launches `.desktop` with `/usr/bin/gio launch`, detached, outside sandbox; checks real path under trusted XDG applications roots and outside writable roots. This avoids app failure when inheriting worker confinement. Source: `C/src/repl-host/launch-services.mjs:15-24,35-40,52-59,70-85`.
- Worker alone has desktop/session-bus network access, kernel does not; the current own-host/sandbox integration must be preserved. Sources: launch `:249-269,288`; supervisor `:9-20`; `C/src/runtime/doctor.mjs:302-321`.
- Current Linux wrapper does **not** emit macOS `cua/serviceMs`; handleRpc immediately delegates on non-darwin. Adding measured Linux engine timing must account for this. Source: wrapper `:196-204`.

### 4.3 Facade and harness dependencies

- Keep `C/src/cua-api/{sky,bind-linux-app,linux-accessibility-tree,create-tinysky-alt,get-state,display}.mjs` contracts described in §1; update tests/oracles only for approved departures, not to fit accidental output.
- `C/docs/cua-api/core.md:158-168,202-206` promises background-window behavior, full tree, fallback semantics and Linux unsupported operations.
- `C/scripts/native-baseline/linux.mjs:93-94` detects helper processes by `/sky_linux[A-Za-z0-9_]*( |$)`; replacement requires revised lifecycle attestation.
- `C/scripts/probe/lib.mjs:82` skips native-socket inspection on Linux specifically because sky_linux is a stdio child; new process model may change this.
- `C/scripts/sandbox-probe/linux-probes.mjs:94-102,438` directly speaks helper wire and reads `runtime.paths.skyLinuxBin`; capture/launch probes assume that binary.
- `C/scripts/repl-parity/native.mjs:8-44`, `C/test/repl-parity/scenarios/native.mjs:20-43`, native fixtures and the two GTK error variants are the current native regression surface (§3).
- Current own macOS service shape is reusable as a boundary pattern, not as Linux semantics: `C/src/services/engine/service.mjs:1-45,57-71` describes setup/execute, approvals, identity lineage, observation, result metadata. Its 11 methods, bundle-path ownership, macOS errors and AX renderer are not Linux’s 20-method contract.

A repository search for `sky_linux|OAI_SKY_LINUX_BIN|skyLinuxBin` across `src/`, `runtime/`, `scripts/` produced the touchpoints above plus explanatory comments in `src/runtime/sandbox.mjs`, `src/repl-host/supervisor.mjs`, and `scripts/accept/linux-native.mjs`. Historical evidence should remain historical rather than be mechanically renamed.

## 5. Tier-2 decompilation/tracing targets

All addresses below come from this session’s `llvm-nm --demangle --numeric-sort` dumps. They are **pinned build** virtual addresses, not newest-build addresses; use each ELF’s symbols when importing into Ghidra. Rust hash suffixes omitted for readability.

| Function / family | x64 VA | arm64 VA | Question it should answer |
|---|---:|---:|---|
| `sky_linux::run` | `0x220e0` | `0x1fc28` | CLI/server loop, timeout defaults, restart flag, request ordering, panic/cleanup boundaries |
| `Client::run_full_desktop_command` | `0xa7a20` | `0x8eb5c` | Complete native dispatch, per-command defaults, state ownership and serialization |
| `BackgroundWindow::send_event` | `0x7ad40` | `0x6bcb8` | Background event target/masks and whether desktop focus remains unchanged |
| `BackgroundWindow::move_to` | `0x7b2d0` | `0x6c204` | Target-relative coordinates without moving desktop pointer |
| `BackgroundSession::send_focus` | `0x7d2d0` | `0x6d6fc` | Synthetic focus enter/restore ordering and timestamp policy |
| `accessibility::match_window` | `0x7db80` | `0x6dd64` | PID/title/size matching, ambiguity and identity-race refusal |
| `accessibility::at_spi_window` | `0x7f2c0` | `0x6eec4` | Registry discovery, window association, fallback boundary |
| `accessibility::accessible_node` | `0x81d00` | `0x71138` | Field extraction, text/state/action handling, traversal limits |
| `accessibility::tree_children` | `0x80a90` | `0x701dc` | Child strategy and per-node D-Bus round trips |
| `accessibility::visible_table_cells` | `0x83db0` | `0x7284c` | Virtualized-table sampling, bounds, hit testing and limits |
| `accessibility::perform_action` | `0x81800` | `0x70d74` | Primary/secondary/right-click selection and ambiguous action rules |
| `accessibility::focused_context_action` | `0x852d0` | `0x73908` | Menu clipboard fallback and focus prerequisites |
| `accessibility::perform_editable_clipboard_action` (two instances) | `0x86a20`, `0x86dd0` | `0x74a54`, `0x74d9c` | Copy/Paste/DeleteText sequence, async PasteText/caret behavior, GTK crash route |
| `dbus::Connection::connect` | `0x92350` | `0x7dc60` | Bus address precedence, auth, Hello, deadlines/reconnection |
| `dbus::Connection::call` | `0x90bc0` | `0x7cb10` | Serialization, reply routing, size limits, timeout and error construction |
| `WindowBuffer::new` | `0x88930` | `0x76450` | Composite redirect/pixmap lifetime, unmapped/occluded windows |
| `get_screenshot::capture_screenshot` | `0x89140` | `0x76ab8` | GetImage route, cursor overlay, JPEG quality, capture/write timing |
| `KeyboardState::acquire` / `release` | `0x9ba90` / `0x9c190` | `0x858bc` / `0x85e5c` | Shared key reference counts, target differences, release on failure/exit |
| `X11FullDesktopClient::with_restored_clipboard_lifetime` | `0x7a4a0` | `0x6b658` | Clipboard restoration scope and error precedence |
| `clipboard::paste_owner` | `0x9cbf0` | `0x86818` | Text snapshot ownership, transfer completion and deadlines |
| `SelectionOwner::start` | `0x9fcc0` | `0x88bc0` | Selection-serving worker, INCR, cleanup/persistence |
| `SelectionReader::snapshot` | `0xa3be0` | `0x8ba50` | Format selection, byte/count caps, capture race checks |
| `apps::desktop_entries` / `expand_exec` | `0x8d8a0` / `0x8cae0` | `0x7a198` / `0x795b4` | Desktop-field filtering, recursive IDs, Exec substitutions, app-window association |

Additional x64 serializer targets: `AccessibilityNode::serialize 0xc0940`, `Window::serialize 0xc1460`, `window::Target::deserialize 0xc1670`; CLI command factory `0x1bdf0`. Sources: `D64/nm.txt`.

For **newest build**, search `DN/nm.txt` for `verified_paste`, `ActionDialog`, `type_characters`, `literal_keycodes`, `PendingReply`, and `SelectionOwner::wait_for_transfers`. These deserve side-by-side decompilation with the pin before selecting text behavior. The older build’s `virtual_cursor` paths deserve reading for background-pointer observability, but adding that UI is not required merely to reproduce the pinned API.

Suggested first VM traces are narrowly tied to unresolved design facts: a background gedit click/key/drag with independent desktop-focus/pointer witness; a typeText/paste on isolated GTK3/GTK4 fixtures with D-Bus method/reply timing; an observation showing each AT-SPI call and deadline; clipboard multi-format capture/paste/restore with X selection events; screenshots of covered and unmapped targets. No live tracing was performed here, and numerical tier-2 limits remain intentionally unclaimed.

## Research friction

`xcrun llvm-readelf` is unavailable in this Xcode toolchain; `llvm-objdump -p/-T`, `llvm-nm`, and static ELF reads covered the required evidence. One failed tool lookup, no blocked research. Recorded at `/Users/new/.claude/friction-tracker/general/conditional/xcode-missing-llvm-readelf.md`.

