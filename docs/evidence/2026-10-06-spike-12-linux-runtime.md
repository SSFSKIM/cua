# Spike #12: can cua use the vendor's Linux code paths?

Date: 2026-10-06. Read-only research: nothing in the cua repo was changed, and the runtime, Chrome and `codex login` were not run. No credentials, `auth.json` or Keychain items were read. Downloads were anonymous GETs of public URLs.

Abbreviations used below:
- `RT` = `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64` (the installed darwin release)
- `OAI` = `RT/cua_node/lib/node_modules/@oai`
- `DEB` = OpenAI's official Linux package `chatgpt_26.928.40906_amd64.deb` (see (b)). Excerpts are under `/Users/new/.claude/jobs/1ea561bc/tmp/deb/` (the `x/` tree, `postinst`, `data.list`).

## Headline

**OpenAI publishes an official, signed Linux build of the same ChatGPT desktop release cua already pins, 26.928.40906, as a `.deb` for amd64 and arm64.** It contains a complete Linux computer-use runtime:
- a Linux `node_repl`;
- the Linux helper `sky_linux_x64`;
- the Linux Chrome native-messaging `extension-host`;
- a Linux `codex`.

All `@oai/*` JavaScript is byte-identical to the darwin release; only the platform binaries differ. The verdict is **feasible with changes** (see (d)). The missing piece is cua's installer and launcher, not the vendor side.

---

## (a) What exists in source

### Computer surface (`@oai/sky` Linux target)
- **Target selection is by `process.platform`.** `OAI/sky/dist/project/cua/sky_js/src/load_options.js` maps `darwin→mac`, `linux→linux`, `win32→windows`. `.../src/create_client.js` dispatches to `targets/linux/create_client.js`.
- **The Linux client is a thin JS adapter over a native helper.** `targets/linux/sky_linux.js:1` resolves `bin/linux/sky_linux_${process.arch}` through `core/package_bin.js`; the env override is `OAI_SKY_LINUX_BIN`. It spawns that binary with `server` (plus optional `--mouse-size-px`). `targets/linux/sky_linux_transport.js:1` speaks line-delimited JSON `{id, command, input}` over stdio.
- **Linux commands** (`targets/linux/create_client.js:1`): `list_apps`, `launch_app`, `list_windows`, `activate_window`, `get_window_state`, `get_screenshot`, `click`, `drag`, `drag_handle`, `move`, `move_relative`, `press_key`, `key_down`/`key_up`, `scroll`, `type_text`, `perform_secondary_action`, `clipboard_read`/`write`/`release`. `audio_recording` is added only when `SKY_ENABLE_AUDIO=1`.
- **The API contract is documented** in `OAI/sky/docs/skills/oai_sky_lib/linux/SKILL.md` and `OAI/sky/docs/sky-full-desktop-api.md`:
  - windows are X11 window ids, with `window_type` values that are X11 window types;
  - `ax_tree_source: "at_spi" | "x11"`, described as "AT-SPI or the dependency-free X11 fallback";
  - keys are X keysym names.
  - The accessibility tree post-processing in `targets/linux/accessibility_tree.js` handles AT-SPI action names (`dodefault`, `clickancestor`, `showcontextmenu`) and `x11:` native ids.
- **The `cua` API layer has Linux bindings.**
  - `OAI/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_tinysky_alt.js:1`: on Linux, `getApp` requires `{windowId}` from `listApps()`/`listWindows()` rather than an app name or bundle id, and `listWindows` is added.
  - `tinysky_alt/bind_linux_app.js:1`: `selectText` and `setValue` throw "unavailable on Linux"; `paste` becomes `type_text`; `scroll` takes `{pixels}`, not pages.
  - `get_apps.js:1` has the Linux mapping.
- **`cua-repl` launcher.** `OAI/cua-repl/dist/lib/js/oai_js_cua_repl/src/instructions.js:1` maps `linux→instructions/linux/*.md`; those files exist. `launch.js:1` is platform-neutral: it needs `CUA_REPL_NODE_REPL_PATH` and `CUA_REPL_ENABLED_SURFACES`. `OAI/cua-repl/README.md:57-78` says "TinySky variants use `cua_repl` on Linux and macOS".
- **No per-app approval on Linux.** `targets/mac/computer-use-policy.js` exists only for the mac target, and `targets/linux/*` has no policy or approval step. Approval on macOS comes from the native service. Inference: on Linux, nothing provides the "each app asks once per connection" guarantee.
- **Audio** (`targets/linux/audio_recording.js:1`) shells out to `pactl get-default-sink` and `ffmpeg -f pulse`.

### `node_repl`
- The darwin binary already contains cross-platform sandbox plumbing (`strings RT/cua_node/bin/node_repl`): `useLegacyLandlock`, `features.use_legacy_landlock=true`, `windows_sandbox_failed`, `macos_sandbox_failed`, `CODEX_CLI_PATH`, `--allow-unix-socket`.
- The Linux `node_repl` in DEB is a static-pie x86-64 ELF and also contains `features.use_legacy_landlock=true`.
- Its sandbox is the `codex` binary named by `CODEX_CLI_PATH`. DEB's `usr/lib/chatgpt/resources/codex` (static-pie ELF) contains `codex-linux-sandbox`, "failed to exec system bubblewrap" and "bundled bubblewrap digest mismatch". DEB ships no `bwrap` file (`data.list`), so it relies on system bubblewrap or Landlock.

### Browser service and Chrome plugin
- **Linux browser tables.** `OAI/browser-desktop/scripts/browser-service.mjs` has per-browser `linux` tables: commands, user-data dirs, and `nativeMessagingManifestDirectories` such as `.config/google-chrome/NativeMessagingHosts`. It honours `CHROME_CONFIG_HOME` / `XDG_CONFIG_HOME`.
- **Backend socket directory.** The function `Va` returns `/tmp/codex-browser-use` on every non-Windows platform. That one fixed directory is used on Linux too, and the service connects to every entry in it (`Ste`).
- **Host installer.** `RT/chrome-plugin/scripts/installManifest.mjs:1` picks the host as `extension-host/{macos|linux|windows}/{arm64|x64}/{ChatGPT for Chrome|extension-host|extension-host.exe}`. It writes `extension-host-config.json` beside the host and resolves Linux manifest paths through `XDG_CONFIG_HOME`/`CHROME_CONFIG_HOME`. The DEB copy is byte-identical.

### Readable sources
`~/codex-app-src/readable/cua-node-0.0.24/README.md` notes that "linux binaries ... were not copied". So the Linux helpers were already in some bundles, and the readable tree omits them.

## (b) What archives exist

The darwin pin is `runtime/releases/26.928.40906-darwin-arm64.json`: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip`, length 687457051, sha256 `93bf16b3…f857`.

| URL | HTTP | Size |
|---|---|---|
| `…/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip` | 200 | 687457051 |
| `…/codex-app-prod/ChatGPT-darwin-x64-26.928.40906.zip` (positive control for the naming pattern) | 200 | 674849370 |
| `…/codex-app-prod/ChatGPT-linux-{x64,arm64}-26.928.40906.{zip,tar.gz,AppImage,deb}` | 404 | — |
| `cua-node-0.0.27-…-{darwin-arm64,linux-x64,linux-arm64}.tar.gz` under `persistent.oaistatic.com/{,codex-app-prod/,cua-node/,cua/,codex-app-prod/cua-node/}` | 404 (darwin too: the standalone runtime archive store is not public) | — |
| npm `@oai/sky`, `@oai/cua-repl`, `@oai/cua`, `@oai/browser-desktop` | 404 (not on public npm) | — |
| npm `@openai/codex` 0.160.1-linux-x64 | 200; contains `codex` and `bwrap` but **no** `node_repl`, sky or extension host (`tar tz` listing) | 446758666 unpacked |
| **`https://persistent.oaistatic.com/codex-app-prod/linux/deb/dists/stable/InRelease`** | 200, OpenPGP clear-signed. Key fingerprint `3BFA 0E4A E8B8 CC16 A2D9 BA68 4A3B 4A56 6C46 60E4`, "Codex Linux Repository" (key embedded in DEB `postinst`) | — |
| `…/linux/deb/dists/stable/main/binary-{amd64,arm64}/Packages` | 200. Lists only the latest version: `chatgpt` 26.930.61225, amd64 sha256 `b90a80f9…bb8`, arm64 sha256 `541b4744…6bd` | 1651 |
| `…/linux/deb/pool/main/c/chatgpt/chatgpt_26.930.61225_{amd64,arm64}.deb` | 200 | 476232806 / 454685182 |
| **`…/linux/deb/pool/main/c/chatgpt/chatgpt_26.928.40906_amd64.deb`** | 200. Downloaded; sha256 `8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30` | 474898954 |
| `…/linux/deb/pool/main/c/chatgpt/chatgpt_26.928.40906_arm64.deb` | 200 (not downloaded) | 453477698 |
| `…/linux/deb/pool/main/c/chatgpt/chatgpt_26.908.40834_{amd64,arm64}.deb` | 200 (the pool keeps older versions) | 399596414 / 379218726 |

The repository was located through the community wrapper `ilysenko/codex-desktop-linux`: `scripts/lib/upstream-linux-package.js:10` has `DEFAULT_REPOSITORY = "https://persistent.oaistatic.com/codex-app-prod/linux/deb"`.

### Contents of the 26.928.40906 amd64 deb
From `data.list` and `file` output:
- `usr/lib/chatgpt/resources/cua_node/manifest.json`: `platform: linux`, `arch: x64`, `target: linux-x64`, `node_version 24.21.0-cua.1`, `runtime_archive_version 0.0.27/20260927214556-b77d38801cca`. These are the same node and runtime versions as the darwin pin.
- `cua_node/bin/node`: ELF x86-64, dynamically linked.
- `cua_node/bin/node_repl`: ELF static-pie.
- `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`: ELF, 3.4 MB. The same binary is also at `@oai/cua/bin/linux/`.
- `resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host`: ELF, 1.1 MB.
- `resources/codex`: ELF static-pie, 287 MB.
- `etc/apparmor.d/chatgpt`: grants `userns` only to `/usr/lib/chatgpt/ChatGPT`.
- `diff -rq` against `RT`: all `@oai/*` JS and the chrome plugin `scripts/` are identical. The only differences are the platform binaries and the `classic-level` prebuild set.

### Trust chain
- The darwin pin trusts codesign with Apple anchor and team 2DC432GLL2.
- The Linux chain is: InRelease signed by key `3BFA…60E4` → Packages SHA-256 → .deb SHA-256. The deb also carries a `_gpgorigin` member.
- **A cua pin needs only the deb's length and SHA-256**, the same model as the darwin zip pin. Pins stay checked in, so a changing `Packages` file does not matter, provided the pool keeps the pinned file (older versions are retained today; that is not guaranteed).

## (c) Runtime requirements on Linux

### Display: X11 only
- `sky_linux_x64` links `libX11.so.6` (`objdump -p` NEEDED) and uses x11rb.
- It needs these X extensions: BIG-REQUESTS, Composite ("background window rendering requires the X Composite extension"), XFIXES (cursor image) and XTEST (`Test::FakeInput`).
- It needs EWMH from the window manager: `_NET_CLIENT_LIST_STACKING`, `_NET_ACTIVE_WINDOW`, `_NET_WM_PID`, `_NET_WM_WINDOW_TYPE`.
- It reads `DISPLAY` and `XAUTHORITY`. Without `DISPLAY` it searches `/tmp/.X11-unix/X*` ("No candidate DISPLAY values found under").
- **The binary contains no Wayland strings.** A Wayland-only session therefore needs XWayland, and even then it reaches only XWayland clients.
- On a cloud VM this means Xvfb or Xorg plus an EWMH window manager, or a VNC/xrdp X session.

### Accessibility: AT-SPI over the session D-Bus, with an X11 fallback
- Strings: `org.a11y.atspi.*`, "AT-SPI accessibility tree exceeded its depth limit", "D-Bus EXTERNAL authentication failed", "failed to connect to the abstract D-Bus socket".
- Required: `at-spi2-core` (the deb already Depends on `libatspi2.0-0`) and a session bus reachable through `DBUS_SESSION_BUS_ADDRESS` (or `XDG_RUNTIME_DIR`).
- Without AT-SPI, trees fall back to `ax_tree_source: "x11"` (window-level only).
- Unverified: whether Chrome and Electron apps expose AT-SPI trees without an assistive-technology flag.

### Input, screenshots and clipboard
All go through X: XTEST for input, Composite and window buffers for capture, X selections for the clipboard (`sky_linux::client::x11::clipboard`). There is no `xdotool` or `ydotool` dependency.

### App discovery
`.desktop` entries from `XDG_DATA_HOME`, `~/.local/share/applications` and `XDG_DATA_DIRS` (default `/usr/local/share:/usr/share`).

### Permissions
- There is no TCC, Accessibility or Screen Recording grant.
- **Any X client with the display's cookie gets full input and capture.** There is also no per-app approval in the Linux target (see (a)). This is a policy gap compared with macOS.
- There is no native helper app, no LaunchServices, no group-container socket and no launchd. The helper is a plain child process of the trusted worker over stdio.

### Sandbox
- `node_repl` sandboxes through `CODEX_CLI_PATH=<linux codex>`, which uses bubblewrap (system `bwrap`) or legacy Landlock.
- On Ubuntu ≥ 23.10, `kernel.apparmor_restrict_unprivileged_userns` can deny `bwrap` user namespaces. The deb's AppArmor profile covers only the Electron binary.
- **Not verified live.** It needs a probe on the target distribution.

### Optional pieces
- Audio: `pactl` and `ffmpeg` with PulseAudio or PipeWire-pulse.
- Login: cua's `login.mjs` opens a browser with `/usr/bin/open`; Linux would need `xdg-open` or a printed URL.

## (d) Feasibility verdict

**A Linux pin is feasible with changes, from an official, public, versioned source with the same release number as the current pin.** It is not feasible as-is: cua's runtime layer assumes darwin throughout.

### darwin assumptions in cua and the change each needs

| Where | Assumption | Change |
|---|---|---|
| `src/runtime/manifest.mjs:64-105`; `runtime/releases/*.json` | Pin schema requires `signing.team` (10-char Apple team) and `layout.codexCli`/`skyServiceApp`; `chromePlugin.signing` must list the host | Add a platform-specific schema branch: Linux pins drop `signing` (trust = archive SHA-256) and `skyServiceApp`, and add `skyLinuxBin`. Add `26.928.40906-linux-x64.json` (and `-arm64`) with the deb URL, length and sha256 from (b) |
| `src/runtime/checks.mjs:46-56` | `codesign` with `anchor apple generic` | Skip on Linux. Optionally check ELF type and arch, and the vendor `manifest.json` (already pin-checked by `checkVendorManifest`, which works unchanged) |
| `src/runtime/checks.mjs` `checkIpc` / pin `runtime.ipc` + `layout.ipcClient` (mac `client.js`) | mac native IPC version | Not meaningful on Linux; drop it for Linux pins |
| `src/runtime/install.mjs:135` | `/usr/bin/ditto -x -k` on a zip | Extract a `.deb` (`ar` member `data.tar.xz` → tar), then take components from `usr/lib/chatgpt/resources/{cua_node,codex,plugins/openai-bundled/plugins/chrome}` |
| `src/runtime/layout.mjs:14-17`, `src/cli.mjs:2,42` | Default home `~/Library/Application Support/cua` | `$XDG_DATA_HOME/cua` (or `~/.local/share/cua`) on Linux |
| `src/runtime/launch.mjs:53,97` | Ambient allowlist lacks `DISPLAY`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, `XDG_DATA_DIRS`; sets `SKY_CUA_SERVICE_PATH` to a `.app` | Allow those variables on Linux. Do not set `SKY_CUA_SERVICE_PATH`; `sky_linux` resolves inside the package (or pin `OAI_SKY_LINUX_BIN`). `CODEX_CLI_PATH` → `<release>/codex` |
| `src/runtime/doctor.mjs:46,166,186-191` | Group-container socket, LaunchServices, `lsof`, `plutil` | Linux checks instead: DISPLAY reachable, X extensions present, AT-SPI bus present, `bwrap`/userns usable |
| `src/services/sky.mjs:6-36` | Secret substitution shapes are mac (`{app, text}`, `set_value`, `paste`) | Linux `type_text` is `{window, text}` (`bind_linux_app.js`), and `paste` maps to `type_text`. Add Linux shapes, or refuse secrets on Linux |
| `src/secrets/*`, `native/keychain` | Swift Keychain helper | No Linux backend. Secrets stay unavailable (the `secretsUnavailable` path exists), or add a libsecret / Secret Service helper later |
| `src/chrome/registration.mjs:44-49,72` | macOS `Library/Application Support/...` manifest dirs | Linux table from the vendor (see (e)) |
| `src/profiles/chrome.mjs:20,64` | macOS Chrome user-data dir; desktop-presence probes `/Applications/*.app` | `~/.config/google-chrome` (honouring `CHROME_CONFIG_HOME`/`XDG_CONFIG_HOME`); the desktop probe becomes `/usr/lib/chatgpt`, `~/.codex` |
| `src/runtime/chrome-component.mjs:4-5` | Host path `extension-host/macos/arm64/ChatGPT for Chrome`, signature-checked | Linux pin `chromePlugin.layout.host = extension-host/linux/x64/extension-host` with `signing: []`. Config keys are unchanged: the Linux host reads `extension-host-config.json` with the same keys (strings) |
| `src/mcp/surface.mjs:8-27`, MCP server instructions | Say "macos", bundle IDs, one approval per app | Linux wording: `getApp({windowId})`, X keysyms, no `setValue`/`selectText`, and no per-app approval (policy decision below) |
| `src/runtime/login.mjs:14` | `/usr/bin/open` | `xdg-open`, or print the URL (a headless VM) |
| `src/runtime/sandbox.mjs:49-52` | APFS / `/private/var` realpath comments | Logic is portable; only comments and hints change |

### Estimate
- About **one focused milestone** of cua work, mostly mechanical:
  - pin schema and Linux pin files;
  - deb extraction;
  - platform-keyed layout, home and env allowlist;
  - Linux doctor checks;
  - Chrome registration paths;
  - surface text;
  - tests that inject `host = {platform: 'linux', arch: 'x64'}`, which the code already takes as a parameter.
- The **acceptance gate needs a real Linux machine or VM** with X11, AT-SPI and Chrome. That cannot be exercised from this Mac.
- **Product decision for the owner:** what replaces macOS's per-app approval on Linux. Options:
  - cua enforces an allowlist in its trusted `sky` wrapper, keyed on `window.app`;
  - or the docs state plainly that a connection can drive every window.

### Risks to probe before committing
1. `bwrap` / userns under AppArmor on the target distribution: the sandbox and `CUA_SHIM_SANDBOX=scoped` depend on it.
2. Whether `sky_linux` can reach the session D-Bus and X socket from inside the node_repl sandbox. The community wrapper's issue #1477 reports "native control blocked by node_repl sandbox (session bus/Wayland)".
3. Pool retention of the pinned `.deb`: older versions exist today but are not listed in `Packages`.
4. arm64 deb contents: inferred from `package.json` `bin` (`sky_linux_arm64`) and installManifest's arch table; the archive itself was not inspected.

## (e) Chrome extension, native host, and transport on Linux (scope extension)

### A Linux native host exists in an obtainable archive
- DEB `usr/lib/chatgpt/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host`: ELF x86-64 PIE, 1.1 MB. It links only libc, libpthread, libgcc_s, libdl and ld-linux.
- It is the same Rust host family as darwin's `ChatGPT for Chrome`. Shared strings include `extension-host-config.json`, `browserClientPath`, `browserServicePath`, `codexCliPath`, `codexHome`, `nodeReplPath`, `proxyHost`, `proxyPort` and `/tmp/codex-browser-use`.
- **The cua host config therefore carries over unchanged**, with Linux paths.
- Its fallback discovery file is `$XDG_STATE_HOME/openai-codex/chrome-native-hosts-v2.json`. On darwin it is `~/Library/Application Support/OpenAI/Codex/...`.
- The darwin host's peer-audit-token and team-id strings (`2DC432GLL2`, "unexpected peer audit token length") do not appear in the Linux host's strings.
- Arm64: installManifest expects `extension-host/linux/arm64/extension-host`. Unverified (arm64 deb not downloaded).

### The ChatGPT desktop app does have a Linux build
The `chatgpt` .deb above (Homepage `https://developers.openai.com/codex/app`) contradicts the premise that no Linux build exists. The extension side is ordinary MV3 and platform-neutral:
- installed copy: `~/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.901.11451_0/manifest.json`;
- permissions include `nativeMessaging` and `debugger`; `minimum_chrome_version` is 116.

### No alternative transport replaces the native host
- In `background.js`, the extension reaches a local agent only through `chrome.runtime.connectNative("com.openai.codexextension")`, with `.dev` and `.internal` variants for other channels. The connection retries on an alarm.
- The extension's WebSockets belong to its own side panel and do not serve a local agent:
  - `codex-sidepanel/assets/chrome-extension-app-server-transport-*.js` connects to the **local** Codex app-server that the native host proxies (`localAppServerUrl`);
  - `vscode-singleton.browser-*.js` uses `wss://codex-cloud-backend.chatgpt.com/` (and `ws://localhost:8098/` for dev) for cloud Codex with the user's ChatGPT token.
- Neither is a relay a third-party local agent could use instead of the native host.
- The vendor's other browser route is a cloud CDP browser (`cua-repl/instructions/*/browser-cloud.md`, `"cdp"`), which does not use the user's own Chrome profile.

### Native-messaging manifest paths

| | Path |
|---|---|
| macOS (cua writes today, `src/chrome/registration.mjs:44-49,72`) | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.openai.codexextension.json` (plus Edge, Brave, Opera, Vivaldi equivalents) |
| Linux, user level (vendor table in `installManifest.mjs` / `browser-service.mjs`) | `~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json`. The base is `$CHROME_CONFIG_HOME` for Chrome, else `$XDG_CONFIG_HOME`, else `~/.config`. The vendor also writes `chromium`, `google-chrome-beta`, `google-chrome-unstable` and `google-chrome-for-testing`, plus Edge `.config/microsoft-edge`, Brave `.config/BraveSoftware/Brave-Browser`, Opera `.config/opera` and Vivaldi `.config/vivaldi` |
| Linux, system-wide (Chrome docs) | `/etc/opt/chrome/native-messaging-hosts/` |
| Linux, Flatpak Chrome | `~/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/`. Even there the sandbox cannot exec a host outside the Flatpak without a bridge ([openai/codex#42953](https://github.com/openai/codex/issues/42953), [rulin132/chatgpt-flatpak#45](https://github.com/rulin132/chatgpt-flatpak/issues/45)). **Use the .deb or .rpm Google Chrome on the VM, not Flatpak or snap.** |

The manifest body is unchanged: `type: stdio`, `allowed_origins` `chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/` (plus the Edge id), and `path` set to the Linux host.

### Multi-user cloud VM concerns (not verified)
- **Shared socket directory.** The browser service and host share the fixed directory `/tmp/codex-browser-use` (browser-service `Va`; host strings), and the service connects to every socket in it. With several users on one VM, who creates the directory and with what mode decides whether one user's host blocks or exposes another's. **This needs a live two-user probe before a multi-tenant design.** Per-user VMs or containers avoid it.
- **Per-user state.** Each user needs their own Chrome profile with the ChatGPT extension signed in, their own X display, and their own `cua login` (Codex auth in cua's `CODEX_HOME`). The cua state is already per-user under the home dir.
- **Host lifetime.** The darwin residue item 10 (the host exits about a minute after the extension wakes) applies here too, and is unexamined on Linux.

## Sources
- `/Users/new/Developer/GitHub/cua/runtime/releases/26.928.40906-darwin-arm64.json`
- `/Users/new/Developer/GitHub/cua/src/runtime/{manifest,checks,install,launch,layout,doctor,sandbox,chrome-component,login}.mjs`
- `/Users/new/Developer/GitHub/cua/src/chrome/registration.mjs`, `src/profiles/chrome.mjs`, `src/services/sky.mjs`, `src/mcp/surface.mjs`
- `/Users/new/Developer/GitHub/cua/docs/doperpowers/specs/2026-10-03-phase-c-execution-report.md:105-107`; `2026-10-02-standalone-cua-design.md:550`
- `RT/cua_node/{manifest.json,bin/setup.sh,bin/setup.ps1}` and `OAI/{sky,cua,cua-repl,browser-desktop}` (paths as cited above)
- `~/codex-app-src/readable/cua-node-0.0.24/README.md`
- https://persistent.oaistatic.com/codex-app-prod/linux/deb/dists/stable/InRelease and `.../pool/main/c/chatgpt/`
- https://github.com/ilysenko/codex-desktop-linux (`scripts/lib/upstream-linux-package.js`), [PR #1475](https://github.com/ilysenko/codex-desktop-linux/pull/1475)
- https://registry.npmjs.org/@openai/codex
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
