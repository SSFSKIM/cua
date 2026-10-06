# cua over the network and on Linux: remote control of a user's Mac, and a cloud agent's own Linux VM

Parent: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` (the standalone server this document extends; its terms, components and acceptance items are referenced, not restated). Board: Phase E is issue #11, Phase F is issue #51; Phase F's basis is spike #12 (`docs/evidence/2026-10-06-spike-12-linux-runtime.md`). Approved by the owner on 2026-10-06 after the brainstorming round recorded in the Decision Log.

## Purpose

Today `cua serve` works only where the agent and the computer are the same Mac: a Claude Code session on a Mac starts `cua serve` over stdio and drives that Mac's apps and that Mac's Chrome. The owner's next use of cua is a **cloud-resident agent**: a Claude Code session (headless or SDK) living in a Linux VM. Two things must become possible that cannot happen now:

1. **The agent drives the user's own Mac on request** (Phase E, "remote control"). The user's Mac runs a resident cua process in the user's GUI login session; it dials out to a relay the owner hosts; the cloud agent registers that relay URL as an ordinary HTTP MCP server and gets exactly the `cua_repl` tool surface it has locally: `js`, `js_reset`, `end_task`, `secrets_list`, `profiles_list`, the same host notes, the same per-connection runtime and cleanup. Seen from the user's chair: after `cua agent install` once, a cloud agent asked "open my school calendar in Chrome and read tomorrow's events" does it on the user's screen, and `$CUA_HOME/run` is clean when the task ends.

2. **The agent drives its own Linux VM** (Phase F, "Linux"). One VM per user, with an X11 desktop, Google Chrome (deb) holding the user's Chrome profile with the ChatGPT extension signed in, and `cua install`/`cua serve` working there as they do on macOS. Seen from the agent: `cua doctor` passes on Linux, `cua serve` over stdio gives the same tools, and the browser route uses the ChatGPT extension exactly as on a Mac.

Both phases keep every rule of the parent: unmodified, pinned vendor runtime; one connection, one owned runtime, one random session; explicit `end_task`; no permission model of cua's own beyond who may connect (the owner's policy: the agent is trusted; app and site approvals are auto-accepted by the owner's Claude Code hooks).

## Progress

- [ ] E1 — HTTP server mode (`cua serve --http`): connection extracted from `serve`, Streamable HTTP endpoint, bearer and Origin checks, LAN proof MacBook → mini.
- [ ] E2 — `cua agent` launchd agent in the GUI session; doctor `agent.*` rows; launchd-started native action and Chrome bind proven on the mini.
- [ ] E3 — `cua-relay` and `cua agent --relay`: device enrollment, outbound WebSocket, HTTP tunnel over channels, reconnect and session survival.
- [ ] E4 — Phase E acceptance from a machine that is not the mini through the relay (acceptance items 1–7), README, retrospective entry.
- [ ] F1 — Linux pin: platform-branched pin schema, deb extraction, XDG home, Linux launch environment, doctor rows, Chrome registration paths, secrets unavailable, Linux host notes; tests with an injected `host`.
- [ ] F2 — Linux acceptance on a real x64 VM (acceptance items 8–12), settling the four unverified items from spike #12; README, retrospective entry.

## Orientation: what exists, and the seam each phase uses

`src/mcp/server.mjs` has two layers. `createServer({input, output, upstream, …})` is one MCP connection: it reads newline-delimited JSON-RPC from `input`, writes to `output`, owns one vendor runtime (`upstream`), and closes on `input` EOF, `output` loss or a signal through `close(reason)`, which runs the completion attempt, the runtime and secrets-broker teardown and the final flush. `serve({home, env, input, output, …})` is the stdio process around it: it sweeps `$CUA_HOME/run`, installs signal handlers, claims a run session (`src/runtime/run-dir.mjs` `claimRunSession`), opens the secrets broker, builds the launch (`src/runtime/launch.mjs` `buildLaunch`), spawns the upstream, and releases everything in `finally`. Phase E's seam is that `createServer` already takes any stream pair: a network session is a `PassThrough` pair fed from HTTP. What has to move is the per-connection half of `serve` (claim, broker, launch, spawn, release), so several connections can live in one process.

`$CUA_HOME/run` already supports several sessions per process: `claims` in `run-dir.mjs` is a map keyed by session id and the exit hook releases every unreleased claim.

Phase F's seam is the pin: `runtime/releases/<release>.json` is selected by `{platform, arch}` (`src/runtime/manifest.mjs` `selectPin`, `assertHostSupports`), and `install`, `doctor`, `launch` and the Chrome registration take `host` or read the pin's `layout`. Spike #12's table (d) names every darwin assumption behind that seam and the Linux value for each.

Terms used below. **Relay**: the small WebSocket server the owner hosts (`relay/` in this repository) that accepts one outbound connection per user Mac and exposes one HTTP MCP endpoint per device. **Device**: one enrolled user Mac, identified by a random id and a bearer token. **Agent** (in `cua agent`): the resident cua process on the user's Mac. **Channel**: one HTTP request tunnelled over the device's WebSocket. **Session**: one MCP session, `Mcp-Session-Id` → one `createServer` connection → one vendor runtime.

## Phase E design: remote control of a user's Mac

### Wire: MCP Streamable HTTP

The cloud side speaks **MCP Streamable HTTP, protocol revision 2025-03-26** (modelcontextprotocol.io, "Transports"), because Claude Code registers such a server with one command (`claude mcp add --transport http <name> <url> --header "Authorization: Bearer <token>"`) and any other MCP client can too. The alternative, an SSH reverse tunnel carrying stdio, is quicker to build but needs sshd and key management on every user Mac; it is not offered. Clients on the 2025-06-18 revision send an `MCP-Protocol-Version` header and no batches; the server accepts that header without acting on it and accepts single messages and batches both.

The endpoint, exposed by E1 as `cua serve --http <host:port>` and by E3 behind the relay as `https://<relay>/d/<device>/mcp`, behaves as the revision says:

| Request | Behaviour |
|---|---|
| `POST` with an `initialize` request and no session header | Opens a session: a new connection (claim, broker, launch, spawn, `createServer`), the `InitializeResult` answered on this response with `Mcp-Session-Id: <connection's session id>` (the same random UUID the connection uses for `run/<session>` and turn metadata). |
| `POST` carrying one or more requests, with a session header | Written to the connection's `input`. The response is `Content-Type: text/event-stream`; every message the connection writes to `output` while this request is unanswered goes on this stream (the vendor's `elicitation/create` requests and notifications included), the response to each request in the body ends the stream once all are answered. |
| `POST` carrying only notifications or responses | Written to `input`; `202 Accepted`, no body. This is how elicitation answers and `notifications/cancelled` arrive. |
| `GET` with a session header | Opens the session's standing SSE stream; server messages not attributable to an open POST go here. |
| `DELETE` with a session header | Ends the session: `close('eof')` on the connection, `200` once `closed` settles (its code is logged, not returned). |
| Session header missing (not `initialize`) | `400`. Unknown or ended session id: `404` (the client re-initializes, per the revision). |
| Any method without a valid bearer | `401`, before anything else is read. `Origin` present and not `null`/an allowlisted origin (`CUA_AGENT_ALLOWED_ORIGINS`, comma-separated, empty by default): `403`. Requests without `Origin` (non-browser clients) pass. |
| `initialize` when the session cap is reached | `503` with a JSON-RPC error body, code `-32000`, message `cua: session limit reached (<n>)`. |

Message routing rule, stated once: every message the connection emits goes to exactly one stream, the oldest open POST stream of that session if any, else the GET stream, else a per-session buffer drained into the next stream that opens. Nothing is broadcast. Stream ids and `Last-Event-ID` resumption are not implemented (the revision makes them optional); a dropped stream loses what was in flight, and the host notes already tell the agent what a lost call means.

A session ends by `DELETE`, by the connection closing on its own (runtime exit, failure), by a signal to the process (every session closes as `signal`), or by idling: **15 minutes** without any request closes it as `eof`, because a cloud client that vanished would otherwise hold a vendor runtime forever. The cap is **4 concurrent sessions** per process (`CUA_AGENT_MAX_SESSIONS` overrides), one runtime each. Both numbers are limits on resource use, not product behaviour; they are environment-overridable and documented.

### Connections inside one process

`serve()`'s per-connection half becomes `openConnection({home, env, sessionId, input, output, …})` in `src/mcp/connection.mjs`, returning `{sessionId, closed, close}` and releasing its claim, broker, approval file and run entries itself when `closed` settles. The stdio `serve` is then: sweep, signal handlers, one `openConnection` on `process.stdin`/`stdout`, exit code. The HTTP mode is: sweep, signal handlers, a listener, one `openConnection` per session. The sweep runs once per process start, never per session (a sweep removes only dead owners, but it is a directory walk the listener need not repeat). Everything `serve` exposes for tests today (`keychainHelper`, `prepareLaunch`, `chrome`, `listBackends`) moves to `openConnection` so `test/serve-cli.test.mjs` and the probes keep working.

### Authentication and the device record

The bearer token is the **device token**: 32 random bytes, base64url. `cua remote enroll [--relay <wss url>] [--json]` writes `$CUA_HOME/remote/device.json` (mode 0600, directory 0700): `{schema: 1, deviceId, token, relayUrl?, enrolledAt}`, and prints the device id and the token once (the token is never printed again; `cua remote show` prints everything but the token). The same token authenticates the agent to the relay (E3) and the cloud client to the endpoint, because v1 has exactly one trusting party per device, the owner; a second token class (per-client, revocable) is the first thing to add when devices are shared, and is out of scope. Comparison is constant-time (`crypto.timingSafeEqual` on equal-length buffers; unequal length is a mismatch without comparing). `--http` without an enrolled device refuses to start (`remote_not_enrolled`, hint: run `cua remote enroll`).

### The relay and the agent

The relay keeps one map, device id → the device's WebSocket, plus the device table it was started with (`relay/devices.json`: `{deviceId: {tokenSha256}}`, edited by hand in v1; the enrolment output is what the owner copies in). It has no session state. Each HTTP request to `/d/<device>/mcp` is a **channel** on that device's WebSocket, and the agent answers it with its E1 handler unchanged. The envelope, JSON text frames:

```
relay → agent   {ch, t: "open", method, path, headers}     headers: lower-cased names; Authorization is NOT forwarded (the relay checked it)
relay → agent   {ch, t: "body", data}                      data: base64 chunk
relay → agent   {ch, t: "end"}
agent → relay   {ch, t: "head", status, headers}
agent → relay   {ch, t: "data", data}                      one SSE event or JSON body chunk, base64
agent → relay   {ch, t: "end"}
either          {ch, t: "abort"}                           the HTTP client went away / the handler failed
agent → relay   {t: "hello", deviceId}                     first frame after the WebSocket opens (the token is in the connect request's Authorization header)
```

A channel id is an integer the relay allocates per device, unique while the WebSocket lives. The relay translates between HTTP and frames and nothing else; a device with no live WebSocket answers `503 device offline`. Two WebSockets for one device: the newer wins and the older is closed with code 4001 (`replaced`).

The agent (`cua agent run`, the process the launchd job keeps alive) connects to `relayUrl` with `Authorization: Bearer <token>`, sends `hello`, serves channels through a request/response adapter over the E1 handler, and reconnects on loss with backoff 1 s doubling to 30 s, forever. Sessions belong to the agent process, not to the WebSocket: a reconnect keeps every session; channels open at the moment of loss are aborted (their SSE streams end; the connection's `output` messages queue in the session buffer until the next stream). The idle timeout still applies, so a cloud client that never returns releases the runtime.

`cua agent run --http <host:port>` (no relay) is E1's local mode under the same process; `--relay` is E3's. Both may be given.

### launchd

`cua agent install` writes `~/Library/LaunchAgents/com.ssfskim.cua.agent.plist`: `ProgramArguments` = the resolved `node` and `bin/cua.mjs agent run --relay` (plus `--http` when enrolled with one), `KeepAlive` true, `RunAtLoad` true, `StandardOutPath`/`StandardErrorPath` = `$CUA_HOME/state/agent.log`, `EnvironmentVariables` carrying `CUA_HOME` when set and the `CUA_SHIM_*` settings the owner passes to install (`--surfaces computer,browser` is the default for the agent, since remote use is for the browser as much as the desktop). It loads with `launchctl bootstrap gui/$UID <plist>`; `uninstall` runs `launchctl bootout gui/$UID/com.ssfskim.cua.agent` then removes the plist; `status` reports the job's pid or absence from `launchctl print gui/$UID/com.ssfskim.cua.agent`. A GUI-session job is the point: `docs/evidence/second-mac-acceptance.md` records that TCC prompts and Keychain access need the console session, and `launchctl bootstrap gui/` is how a process gets one without a terminal.

`cua doctor` gains three rows: `agent.installed` (plist present and parseable, naming its program path), `agent.running` (launchd reports a pid), `agent.enrolled` (`remote/device.json` present, mode 0600, naming the relay URL or "local only"). None is `fail` on a Mac that never enrolled: they read `skip` with "run cua remote enroll / cua agent install".

### What Phase E does not do

No TLS termination in the relay (it sits behind a reverse proxy); no accounts, device lists or token rotation; no per-client tokens; no change to the vendor runtime, the host notes' content (except the one README paragraph on remote use), the profile registry or secrets. Secrets work remotely exactly as locally, because substitution happens in the agent process on the user's Mac.

## Phase F design: a Linux pin

Spike #12 established the facts (evidence doc, sections (a)–(e)); the design is the set of decisions on top of them.

**Source and trust.** The Linux pin is `runtime/releases/26.928.40906-linux-x64.json`: the `.deb` from the owner's APT pool, `https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/chatgpt_26.928.40906_amd64.deb`, length 474898954, sha256 `8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30`. Trust is the archive hash: the pin has no `signing` section, and `runtime.signatures` reads `pass` with "archive hash is the trust root on linux" while `install` and `runtime use` skip `codesign`. The alternative, checking the APT repository's GPG signature chain at install time, was rejected: the pool file is pinned by hash, which is a stronger statement about this exact file than a repository signature. `runtime.ipc` and `layout.ipcClient` are darwin-only and absent from the Linux pin; `checkIpc` reads `pass` "not applicable on linux".

**Pin schema.** `parsePin` branches on `platform`: `darwin` keeps schema 1 as is; `linux` requires `archive`, `components` (`cua_node`, `codex`, the Chrome plugin source), `layout` with `node`, `nodeRepl`, `moduleDir`, `cuaRepl`, `codexCli`, `skyLinuxBin` (`cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`), `skyVendorService`, `browserVendorService`, `vendorManifest`, and `chromePlugin.layout.host = extension-host/linux/x64/extension-host` with `chromePlugin.signing: []`. `LAYOUT_KEYS` becomes per-platform.

**Extraction.** `install` recognises the archive by the pin: a `.deb` is `ar`'s `data.tar.xz` member, extracted with `tar` into staging, and the components are taken from `usr/lib/chatgpt/resources/{cua_node,codex,plugins/openai-bundled/plugins/chrome}`. The verified tree, record and pointer are unchanged.

**Home, environment, launch.** Default home on Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/cua`. `buildLaunch` on Linux passes `DISPLAY`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, `XDG_DATA_DIRS` through the ambient allowlist, does not set `SKY_CUA_SERVICE_PATH`, sets `OAI_SKY_LINUX_BIN` to the pinned helper and `CODEX_CLI_PATH` to `<release>/codex`. `cua login` prints the URL when `xdg-open` is absent.

**Doctor on Linux.** `helper.live` and `helper.permissions` are replaced by `display` (DISPLAY set and the X server answers, XTEST/Composite/XFIXES present), `accessibility.bus` (session D-Bus reachable, AT-SPI registry present), `sandbox.userns` (bubblewrap or Landlock usable); the darwin group-container socket and `plutil` paths are never consulted.

**Chrome.** Registration writes the vendor's Linux table: `${CHROME_CONFIG_HOME:-${XDG_CONFIG_HOME:-~/.config}}/google-chrome/NativeMessagingHosts/com.openai.codexextension.json` plus `chromium`, `google-chrome-beta`, `google-chrome-unstable`, `microsoft-edge`, `BraveSoftware/Brave-Browser`, `opera`, `vivaldi`; the manifest body is unchanged. Profile discovery reads `~/.config/google-chrome`. The desktop-presence probe looks for `/usr/lib/chatgpt` and `~/.codex`. The README says: deb or rpm Chrome, never Flatpak or snap.

**Secrets.** No Linux secrets backend: `openSecrets` reports `unavailable` with code `secrets_unsupported_platform`; `secrets_list` returns that; a `{{secret:…}}` reference in any input refuses before dispatch with the same code; `cua secrets set|list|remove` print it and exit 1. A libsecret backend is a later initiative.

**Surface text.** Host notes on Linux replace the macOS-only sentences: apps are bound by window (`cua.getApp({windowId})`, `listWindows`), `setValue`/`selectText` do not exist, `paste` types, key names are X keysyms, and there is no per-app approval: one connection can drive every window of the session. The last sentence is the owner's decision (allow-all policy; no allowlist in the sky wrapper).

**What Phase F does not do.** Wayland, arm64 as a gate (the arm64 deb exists but is only verified if F2's VM happens to be arm64), multi-user VMs (shared `/tmp/codex-browser-use`, spike (e)), a Linux secrets backend, Flatpak Chrome.

## Acceptance

Phase E (items 1–7) is proven on the owner's two Macs: the MacBook as client, the Mac mini (`mini` over Tailscale SSH for non-interactive steps; the owner at its console for anything TCC asks) as the controlled device, and for item 6 a client that is not on the mini's LAN. Phase F (items 8–12) is proven on a Linux x64 VM the owner provides (Ubuntu 24.04, Xorg with a lightweight EWMH window manager, deb Google Chrome with the owner's profile and the ChatGPT extension signed in).

1. **HTTP session lifecycle.** With the mini enrolled and `cua agent run --http 0.0.0.0:7801` started from a terminal on the mini, a `curl` `initialize` POST from the MacBook with the bearer returns the `InitializeResult` with an `Mcp-Session-Id`; `tools/list` on that session returns the five tools; a POST without the bearer is `401`; a POST without the session header is `400`; after `DELETE` the same id is `404`, and `ls $CUA_HOME/run` on the mini shows no entry for it.
2. **Remote native action over HTTP.** The MacBook's Claude Code, with `claude mcp add --transport http mini-cua http://<mini>:7801/mcp --header "Authorization: Bearer …"`, runs a `js` cell that opens the mini's TextEdit, types a marker into a new document, reads it back through the accessibility tree, closes without saving, and `end_task`; the mini's screen shows it; the transcript contains no token.
3. **Remote Chrome over HTTP.** The same session calls `profiles_list`, binds the `school` profile's instance id with `cua.getBrowser`, opens a tab on an owner-controlled page, reads its title, closes the tab, `end_task`.
4. **Elicitation crosses the wire.** With the owner's auto-accept hook disabled for the test, a first-use app approval raised by the mini's runtime appears as an elicitation in the MacBook's Claude Code, and the answer reaches the runtime (the action proceeds after acceptance).
5. **launchd session.** After `cua agent install` on the mini and a reboot or `bootout`/`bootstrap` cycle, with no terminal involved, items 2 and 3 pass through the launchd-started agent (`cua doctor` reads `agent.running pass`), and the agent survives the client closing the session (`agent.running` still pass; `run/` empty).
6. **Through the relay.** With `cua-relay` running on a host outside the mini's LAN and the mini's agent enrolled against it, a Claude Code session on a machine that is not the mini (the MacBook on another network, or a cloud session) registers `https://<relay>/d/<device>/mcp` and passes items 2 and 3. Stopping the relay and restarting it mid-session: the next `js` call succeeds on the same session id without re-initializing.
7. **Idle and cap.** A session left alone for 15 minutes is gone (`404`, `run/` entry removed); a fifth concurrent `initialize` is `503`.
8. **Linux install and doctor.** On the VM, `cua install` downloads the pinned deb, verifies its length and hash, extracts the components, and `cua doctor --json` passes `platform`, `runtime.*`, `chrome.host.config`, `display`, `accessibility.bus`, `sandbox.userns`, with `secrets.*` reading `skip` (unsupported platform).
9. **Linux native action.** Over stdio on the VM, `js` binds a window (`getApp({windowId})` from `listWindows`), types a marker into a text editor (gedit or xed), reads it back, and the screenshot shows it; `end_task` leaves `run/` empty.
10. **Linux Chrome.** `cua chrome register` writes the Linux manifest; the ChatGPT extension in the owner's VM profile launches cua's Linux host (process path under `$CUA_HOME/runtimes/`); `profiles add/bind` work; a `js` cell opens a tab, reads a title, closes it.
11. **Sandbox and bus from inside.** Item 9 passes with `CUA_SHIM_SANDBOX` at its default (`scoped`); if it fails only there, the `disabled` result and the failing sandbox detail are both recorded (this is spike #12's unverified item 2).
12. **Tests.** `npm test` on macOS passes with the Linux pin loaded (tests inject `host = {platform: 'linux', arch: 'x64'}` for selection, install classification, launch environment, doctor rows and registration paths) and on the VM itself.

## Interfaces and Dependencies

Node ≥ 22 as today; the `ws` package (relay and agent; the only new dependency, in both `package.json` and `relay/package.json`); no HTTP framework (`node:http`).

In `src/mcp/connection.mjs`:

```js
export async function openConnection({home, env, sessionId, input, output, runtime, settings, diagnostics,
  keychainHelper, prepareLaunch, chrome, listBackends})
  // → {sessionId, closed: Promise<{code, reason, completion, teardown, secrets}>, close(reason)}
  // claims run/<sessionId>, opens the broker, builds and spawns the launch, createServer; releases all when closed settles.
```

In `src/mcp/http.mjs` (E1), the handler over an abstract request so E3 can drive it from a WebSocket frame as well as `node:http`:

```js
export function createMcpHttp({home, env, token, allowedOrigins = [], maxSessions = 4, idleMs = 15 * 60_000, diagnostics})
  // → {handle(req, res), sessions: Map<sessionId, Session>, close(reason): Promise<void>}
  // req: {method, url, headers, body: AsyncIterable<Buffer>}; res: {writeHead(status, headers), write(chunk), end()}; node:http's objects satisfy both.
```

In `src/remote/device.mjs`: `enrollDevice({home, relayUrl}) → {deviceId, token, relayUrl}`, `readDevice(home) → record | null`, `tokenMatches(record, presented) → boolean` (constant-time).

In `src/remote/agent.mjs` (E3): `runAgent({home, env, http: 'host:port' | null, relay: boolean, diagnostics}) → Promise<exitCode>`; `connectRelay({url, token, deviceId, handle, diagnostics}) → {close()}` with the frame grammar above; `src/remote/launchd.mjs`: `installAgent`, `uninstallAgent`, `agentStatus`.

`relay/`: `relay/server.mjs` (`startRelay({port, devicesFile}) → {close()}`), `relay/package.json` (`"start": "node server.mjs"`), `relay/README.md` (one page: run it behind a TLS proxy, how to add a device line).

CLI additions in `src/cli.mjs` `USAGE`: `remote enroll [--relay <wss url>] [--json]`, `remote show [--json]`, `agent run [--http <host:port>] [--relay]`, `agent install [--surfaces <list>] [--json]`, `agent uninstall [--json]`, `agent status [--json]`; `serve --http <host:port>` is an alias of `agent run --http` kept for the README's symmetry.

Phase F touches no new interface: `parsePin`/`selectPin`/`assertHostSupports` (`src/runtime/manifest.mjs`), `installRuntime` (`src/runtime/install.mjs`), `buildLaunch` (`src/runtime/launch.mjs`), `defaultHome` (`src/runtime/layout.mjs`), `inspectRuntime` (`src/runtime/doctor.mjs`), `BROWSERS`/`registerHost` (`src/chrome/registration.mjs`), `chromeFacts` (`src/profiles/chrome.mjs`), `openSecrets` (`src/secrets/broker.mjs`), `hostNotesFor` (`src/mcp/surface.mjs`) each gain a platform branch keyed on the pin's `platform` or the injected `host`.

## Plan of Work

Constraints binding every milestone: the parent's rules (unmodified vendor runtime, pinned archives verified before activation, one connection one runtime, `end_task` semantics, no attribution footers in commits or PRs, board writes through the issue-tracker scripts only, `main` stays checked out in the owner's working checkout so worktrees are used for branches). Tests are Node-only and pass without the GUI, the network or credentials (parent acceptance 1). Nothing prints a token: not `remote enroll` after the first time, not logs, not `--json` outputs other than enrol's. The owner's Macs are the only live targets; the owner runs anything TCC or Keychain asks at the console.

### E1 — HTTP server mode

At the end: `cua remote enroll` exists; `cua agent run --http 127.0.0.1:7801` serves MCP Streamable HTTP with the bearer and Origin rules; `cua serve` is unchanged in behaviour but implemented over `openConnection`. Touches `src/mcp/server.mjs` (split), new `src/mcp/connection.mjs`, `src/mcp/http.mjs`, `src/remote/device.mjs`, `src/cli.mjs`, tests `test/mcp-http.test.mjs`, `test/remote-device.test.mjs`, and `test/serve-cli.test.mjs` adjusted to the split. Decisions here alone: the SSE event format is `data: <one JSON-RPC message>\n\n` per message, no `id` lines; the idle timer resets on every request of the session; a POST whose body is not valid JSON is `400` with a JSON-RPC parse error body and no session effect; the listener binds exactly what `--http` names (the revision's "bind localhost" advice is satisfied by the default shown in USAGE being `127.0.0.1:7801`; `0.0.0.0` is the owner's explicit choice for the LAN proof). Consumes nothing; exposes `openConnection`, `createMcpHttp`, the device record. Does not touch launchd, the relay, or the README beyond USAGE. Proves acceptance 1, 2, 3, 4 and 7 over the LAN (the executor runs 1 and 7 itself from the MacBook against the mini; 2–4 are the owner's console steps when a prompt appears, otherwise the executor's). Tests pin: session creation only on `initialize`; 400/401/403/404/503 as tabled; routing of a server-initiated request to the open POST stream and, with none, to the GET stream and, with none, the buffer; DELETE releases `run/`; idle close; two sessions in one process have different run entries and both close on SIGTERM.

### E2 — launchd agent and doctor rows

At the end: `cua agent install|uninstall|status`, the three doctor rows, and the proof that a launchd-started agent (no terminal) can do a native action and a Chrome bind on the mini. Touches `src/remote/launchd.mjs`, `src/runtime/doctor.mjs`, `src/cli.mjs`, `test/remote-launchd.test.mjs`, `test/runtime-doctor.test.mjs`. Decisions here alone: plist written with `plutil`-free string templating and validated by parsing it back; `install` on an already-installed job replaces the plist and does `bootout` then `bootstrap`; the log file is opened append by launchd, so the agent writes its diagnostics to stderr as today. Consumes E1's `runAgent --http`. Does not touch the relay. Proves acceptance 5. This milestone's delegated unknown: whether a `gui/$UID` launchd job started at login reaches TCC-granted Accessibility/Screen Recording and the Keychain helper without a prompt; if a prompt appears, the owner answers it at the console once and the spec records what was asked in Surprises.

### E3 — relay and agent

At the end: `relay/` runs, the mini's agent dials it, and a client reaches the mini through the relay URL; reconnect keeps sessions. Touches `relay/`, `src/remote/agent.mjs`, `src/cli.mjs`, `package.json` (`ws`), `test/remote-agent.test.mjs`, `test/relay.test.mjs` (the relay tested in-process with a fake agent and a fake device, over real WebSockets on an ephemeral port). Decisions here alone: the relay validates the bearer against `devices.json` by sha256 before touching the device map; `hello` with a device id that does not match the authenticated device closes with 4003; frames for an unknown channel are dropped and logged, never fatal; the agent's adapter buffers a request body entirely (MCP POST bodies are small) but streams the response; relay request headers forwarded to the agent are `mcp-session-id`, `accept`, `content-type`, `last-event-id`, `mcp-protocol-version`, `origin` only. Consumes `createMcpHttp.handle` and the device record. Does not touch TLS, accounts or the vendor runtime. Proves acceptance 6 and, again, 1 through the relay (tests pin: channel multiplexing of two concurrent POSTs, abort on client disconnect, device replacement, reconnect with an open session and a queued server message delivered on the next stream, backoff ceiling).

### E4 — Phase E acceptance, README, retrospective

At the end: acceptance 1–7 recorded with evidence in `docs/evidence/2026-10-xx-phase-e-remote-acceptance.md`, README sections "Remote control" (enrol, agent install, relay, Claude Code registration, what to expect when the relay or device is offline, the idle and cap numbers), the parent's README cross-link, the Outcomes & Retrospective entry for Phase E, and the whole-branch review of E1–E4 at the rung in the Decision Log. Touches docs and `README.md` only, plus fixes the review requires. Consumes everything above. Proves nothing new: it executes the acceptance section as written.

### F1 — Linux pin

At the end: the Linux pin file, every platform branch in the Phase F design, Linux host notes, and tests with an injected Linux host; macOS behaviour byte-identical (the existing suite is the regression). Touches `runtime/releases/26.928.40906-linux-x64.json`, `src/runtime/{manifest,checks,install,layout,launch,doctor,login,chrome-component}.mjs`, `src/chrome/registration.mjs`, `src/profiles/chrome.mjs`, `src/secrets/broker.mjs`, `src/services/sky.mjs` (Linux `type_text` shape refused with `secrets_unsupported_platform`), `src/mcp/surface.mjs`, `src/cli.mjs` USAGE (environment line per platform), and their tests. Decisions here alone: the deb is extracted with `ar` (`binutils`) and `tar`, both required on the Linux host and checked by `install` before download (`missing_tool` naming the tool); a Linux pin loaded on macOS is simply not selected (`selectPin` is by host), so the pin file ships in the package without affecting macOS installs; the Linux host notes are a second string constant beside the macOS one and the 2,048-character budget test (`test/mcp-browser-surface.test.mjs`) covers both. Consumes nothing from Phase E. Does not touch the relay or agent (they are platform-neutral Node and are expected to work on Linux untested until a later initiative). Proves acceptance 12 on macOS; items 8–11 wait for F2.

### F2 — Linux acceptance

At the end: acceptance 8–12 recorded in `docs/evidence/2026-10-xx-linux-acceptance.md` with the VM's distro, kernel, Chrome version and the four spike #12 unknowns each answered (arm64 deb: only if the VM is arm64; bubblewrap/userns; D-Bus and X from inside the sandbox; Chrome's AT-SPI exposure, with the flag needed if any), README "Linux" section, Outcomes & Retrospective for Phase F, whole-branch review of F1–F2. Touches docs, `README.md`, and whatever F1 got wrong on real hardware. The VM is the owner's to provide (a cloud x64 VM is the production shape; a Tart Linux VM on the mini is arm64 and a fallback); the executor reports `BLOCKED` naming this paragraph if none is reachable over SSH with a display.

## Concrete Steps

All commands from the repository root unless stated; `npm test` is the suite (expect `# fail 0`).

E1, LAN proof (mini over SSH, then MacBook):

```
ssh mini 'cd ~/cua && git pull -q && node bin/cua.mjs remote enroll --json'        # prints {deviceId, token, …} once; copy the token
ssh mini 'cd ~/cua && node bin/cua.mjs agent run --http 0.0.0.0:7801'              # keep running (CUA_SHIM_SURFACES=computer,browser)
curl -s -D- http://mini:7801/mcp -H "Authorization: Bearer $T" -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# expect: HTTP/1.1 200, Mcp-Session-Id: <uuid>, body with serverInfo and the host notes in instructions
curl -s -o /dev/null -w '%{http_code}\n' http://mini:7801/mcp -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'   # 401
claude mcp add --transport http mini-cua http://mini:7801/mcp --header "Authorization: Bearer $T"
```

E2 (mini console or SSH; the owner at the console for any prompt):

```
node bin/cua.mjs agent install --surfaces computer,browser && node bin/cua.mjs agent status      # pid …
node bin/cua.mjs doctor | grep '^agent\.'                                                        # three pass rows
```

E3 (relay host, then mini):

```
cd relay && npm ci && node server.mjs --port 7800 --devices devices.json      # behind a TLS proxy for the real run
ssh mini 'cd ~/cua && node bin/cua.mjs remote enroll --relay wss://relay.example/ws --json && node bin/cua.mjs agent install'
claude mcp add --transport http mini-cua https://relay.example/d/<deviceId>/mcp --header "Authorization: Bearer $T"
```

F1/F2 (the VM over SSH, `DISPLAY=:0` exported by the session):

```
sudo apt-get install -y binutils xz-utils && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google.gpg   # deb Chrome, not Flatpak
node bin/cua.mjs install && node bin/cua.mjs doctor --json | jq '.checks[] | select(.status=="fail")'    # expect no output
node bin/cua.mjs chrome register && node bin/cua.mjs profiles add me --chrome-profile Default && node bin/cua.mjs profiles bind me
node verify.mjs           # the stdio smoke the parent ships
```

## Surprises & Discoveries

(none yet)

## Decision Log

- Decision (2026-10-06, owner, this document's authoring): verification. The spec gets one independent review by a general-purpose subagent on the frontier model and the `doperpowers:adversarial-reviewer` buildability review of the execution section; each milestone's PR gets `doperpowers:reviewer-high` through doperpowers:review-code, with fix waves by subagent; the E4 and F2 whole-branch reviews are at the same rung. Minor findings go to `tech-debt-tracker.md`.
  Rationale: six milestones, two live machines and a relay make this the largest execution since Phase C; the parent used the same rungs.
  Date/Author: 2026-10-06, the owner's session.
- Decision (2026-10-06, owner, brainstorming): the cloud agent's own machine is a Linux VM, one per user, running headless Claude Code; the user's Mac keeps a resident GUI-session daemon that dials out to an owner-hosted relay; the wire is MCP Streamable HTTP; v1 authenticates with one device token; cua adds no permission model (the owner's Claude Code allow-list and elicitation auto-accept hook decide); Phase E before Phase F, F starting while E1 is in review. Rejected: a macOS VM for scene 1 (cost and supply; and the Linux build turned out to exist), SSH-only transport (needs sshd on every user Mac), Tailscale (an installation the user must do; still the right answer for the owner's own LAN tests), per-task approval on the user's screen (contradicts the allow-all policy), a Linux app allowlist in the sky wrapper (same).
  Rationale: the owner's answers in the grill; spike #12's finding that the official deb carries the Linux runtime at the pinned release.
  Date/Author: 2026-10-06, owner and the session.
- Decision (2026-10-06, authoring): the relay tunnels HTTP requests, one channel per request, rather than one channel per MCP session. The agent's E1 handler then serves both the LAN mode and the relay unchanged, the relay keeps no session state, and session survival across a relay restart falls out of the sessions living in the agent process.
  Rationale: one HTTP implementation instead of two; a stateless relay is the simplest thing to host.
  Date/Author: 2026-10-06, the session.

## Outcomes & Retrospective

Pending — written at finish.
