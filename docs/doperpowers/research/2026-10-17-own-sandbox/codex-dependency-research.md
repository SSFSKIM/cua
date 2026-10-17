# Codex dependency research

(Research subagent report, 2026-10-13, persisted by the session; read-only investigation. Citation prefixes: C = /Users/new/Developer/GitHub/cua; R = the installed runtime 26.928.40906-darwin-arm64; O = R/cua_node/lib/node_modules/@oai; U = the shallow clone of openai/codex at rust-v0.159.2 (ff6aec96948b70d94983af2641a6b67c94faeff5) under this tmp dir as codex-src; T = this tmp dir (static extraction artifacts: node_repl.strings, codex.strings, sandbox-disassembly.txt, sandbox-config-disassembly.txt, app-server-spawn-disassembly.txt, app-server-request-disassembly.txt, auth-request-disassembly.txt); H = $CUA_HOME/state/codex.)

## Evidence and revision

The installed CodexCLI.app executable's strings identify 0.159.2 (T/codex.strings:453136,481045,483039); Info.plist names com.openai.codex.cli with CFBundleVersion 1. Public tag rust-v0.159.2 = ff6aec96948b70d94983af2641a6b67c94faeff5 (2026-09-29); U/codex-rs/Cargo.toml:161,167 declares 0.159.2 and Apache-2.0. Version matching identifies the public release to consult, not bit-for-bit equivalence with the signed ChatGPT distribution. No process was executed; auth.json never opened.

## 1. Invocation

- cua's buildLaunch starts the relocated vendor Node with @oai/cua-repl/bin/cua-repl.mjs, cwd `<CUA_HOME>/run/<sessionId>`, lazily (C/src/runtime/launch.mjs:93–140; C/src/mcp/connection.mjs:100–122). The vendor `launch` (O/cua-repl/dist/lib/js/oai_js_cua_repl/src/launch.js, function E) spawns CUA_REPL_NODE_REPL_PATH with stdio inherit; it does not spawn Codex.
- The Rust node_repl supervisor spawns Codex: symbols `sandbox::SandboxConfig::build_command_spec`, `codex_app_server::CodexAppServerConnection::spawn`, `CodexAppServerClient::send_request`. Dependency is subprocess/CLI and RPC, not a linked library (otool -L: Security, CoreFoundation, libiconv, libSystem).
- cua's child env: CODEX_CLI_PATH=R/CodexCLI.app/Contents/MacOS/codex (Linux: the release's codex), CODEX_HOME=H, fixed PATH, relocated NODE_REPL_* paths, NODE_REPL_TRUSTED_SERVICES (cua's sky/browser wrappers), NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000, NODE_REPL_DISABLE_ANALYTICS=1 (C/src/runtime/launch.mjs:5–66,76–89,103–139).

### A. Sandbox invocation (recovered argv template)
```
$CODEX_CLI_PATH sandbox
  -c 'shell_environment_policy.inherit="all"'
  -c 'default_permissions="node_repl"'
  -c 'permissions.node_repl={filesystem={...},network={enabled=false}}'
  [-c 'features.use_legacy_landlock=true']
  [--allow-unix-socket <path>]...
  -- $NODE_REPL_NODE_PATH --experimental-vm-modules <script> <args>...
```
Evidence: T/sandbox-disassembly.txt `SandboxConfig::build_command_spec` at 0x1002331fc (constructs `sandbox`, loops `-c` overrides, optional `--allow-unix-socket`, appends `--`, Node, `--experimental-vm-modules`); T/sandbox-config-disassembly.txt `SandboxState::config_overrides` at 0x100259578 (network enabled=false constructed at 0x10025991c–0x10025998c); literals T/node_repl.strings:32076–32078,32099,40235–40236.
Two persistent children per runtime when trusted services are used: `kernel.js --session-id <id> --working-dir <cwd>` and `trusted-worker.js <cwd>` (`--working-dir` is the kernel's own argument, parsed by parseKernelBootstrapArgs: T/node_repl.strings:21066–21125,25843–25856). Cells run in the persistent kernel; replacement on reset/timeout/failure/sandbox-state change (C/docs/evidence/m1-runtime-portability.md "Process ancestry"; m3-mcp-lifecycle.md).

### B. App-server invocation
`$CODEX_CLI_PATH app-server --listen stdio://` (fallback `codex` if CODEX_CLI_PATH absent); inherits supervisor env and cwd; stdin/stdout piped, stderr inherited; not a socket to a running desktop app-server (T/app-server-spawn-disassembly.txt `CodexAppServerConnection::spawn` at 0x1002348e4; T/node_repl.strings:32078,39950). Started lazily when an auth/config request needs it, cached optional connection, discardable on error (`CodexAppServerClient::send_request`, T/app-server-request-disassembly.txt 0x1002164c0–0x1002164e0). Not a dependency of MCP initialization or of every cell. M1 demonstrated native read-only operation with an empty CODEX_HOME and no app-server child.

### C. Explicit login commands (outside cells)
`codex login`, `codex login --device-auth`, `codex login status` from C/src/runtime/login.mjs:10–18,29–36,51–58,65–79,88–104 (owned CODEX_HOME, allowlisted env, TTY). Only the ChatGPT extension route needs them.

No direct Codex spawn site exists in the @oai JS or cua's trusted services.

## 2. The sandbox

### macOS
`codex sandbox … -- command` (host platform chosen inside the CLI; no `macos` subcommand, no `codex debug seatbelt` on this route): U/codex-rs/cli/src/main.rs:185–192,459–464,1652–1705. U/codex-rs/cli/src/debug_sandbox.rs:394–434 converts the permission profile into filesystem/network policies and launches `/usr/bin/sandbox-exec -p <generated profile> -D… -- <command>` (U/codex-rs/sandboxing/src/seatbelt.rs:1042–1108; base policy seatbelt_base_policy.sbpl:1–16 starts with `(deny default)`; Unix-socket exceptions seatbelt.rs:288–300). Path correction: `codex-rs/sandboxing/src/seatbelt*` at this revision, not `core/src/seatbelt*`. Codex, not node_repl, generates the OS profile.

### Policies cua supplies
`_meta["codex/sandbox-state-meta"]` on upstream calls; sandboxCwd = file URI of the session run dir (C/src/runtime/sandbox.mjs:22–55; C/src/mcp/connection.mjs:132–133). Scoped profile:
```json
{"type":"managed","file_system":{"type":"restricted","entries":[
 {"path":{"type":"special","value":{"kind":"root"}},"access":"read"},
 {"path":{"type":"special","value":{"kind":"project_roots"}},"access":"write"},
 {"path":{"type":"special","value":{"kind":"tmpdir"}},"access":"write"}]},
 "network":"restricted"}
```
scoped: whole-disk read per OS rights, write only the run dir and TMPDIR, no kernel network. default (no state sent): node_repl's fallback, whole-disk read, no ordinary writes, no network. disabled: no OS restriction. Both kernel and trusted worker are under the same restrictions ("trusted" = privileged RPC/import, not unsandboxed), so denying the secret directory cannot separate the trusted reader from cell reads (C/README.md:1260–1292; spec Surprises 503,519; Decision Log 552–565). The managed-profile builder hardcodes network enabled=false; `network:"enabled"` metadata does not open it on this pin. cua deliberately does not set NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS / NODE_REPL_WORKER_WRAPPER / NODE_REPL_DENIED_PATHS (launch.mjs:61–63); a socket allowance applies to both children (M1). Binary also carries NODE_REPL_ENABLE_NETWORK_ISOLATION and `--disable-sandbox` (vendor controls cua does not pass). The trusted service reaches native/browser sockets via `nodeRepl.nativePipe`, opened by the supervisor outside the sandbox.

### Linux
The CLI's `LandlockCommand` backend normally runs bubblewrap, invoked as helper arg0 `codex-linux-sandbox` (U/codex-rs/cli/src/debug_sandbox.rs:436–465; arg0/src/lib.rs:97–99; linux-sandbox/README.md:3–16). Generated argv: `codex-linux-sandbox --sandbox-policy-cwd … --command-cwd … --permission-profile <JSON> [--use-legacy-landlock] [--managed-network <JSON>] -- <command>` (sandboxing/src/landlock.rs:45–66; linux-sandbox/src/linux_run_main.rs:85–125). Read-only root view with writable overlays, user/PID/IPC/net namespaces, PR_SET_NO_NEW_PRIVS, seccomp (restricted network denies connect, including Unix sockets) (linux_run_main.rs:195–240,295–355; landlock.rs:40–83,129–169,175–231). Legacy Landlock is an explicit non-default and rejected for filesystem-restricted policies (README.md:40–45; linux_run_main.rs:412–418). Prior Linux acceptance observed `codex sandbox` → `codex-linux-sandbox` → `/usr/bin/bwrap --as-pid-1 --new-session --die-with-parent --ro-bind / / … --unshare-user --unshare-pid --unshare-ipc --unshare-net --cap-drop ALL`; under scoped the helper could not reach X11/D-Bus; when Ubuntu blocked user namespaces the vendor runtime fell back to unconfined children (cua now preflights and refuses that state) (C/docs/evidence/2026-10-06-linux-acceptance.md:174–220; the public bubblewrap path says it does not fall back, linux_run_main.rs:295–298).

### Public policy types
`PermissionProfile::{Managed,Disabled,External}` (U/codex-rs/protocol/src/models.rs:420–435), filesystem entries and NetworkSandboxPolicy (permissions.rs:86,120–202); older `SandboxPolicy` at protocol.rs:1072–1119. cua sends the new PermissionProfile metadata.

## 3. App-server: protocol, state and network

Transport: newline-delimited JSON over stdin/stdout (U/codex-rs/app-server-transport/src/transport/stdio.rs:73–89,98–116,141,185). No app-server method literals exist in cua-repl or sky JS; cua/browser-desktop's only literal intersection, `initialize`, belongs to bundled Statsig. The app-server client is inside node_repl; JS calls abstract privileged APIs.

| Method | Runtime evidence | Public definition |
|---|---|---|
| initialize | node_repl client; clientInfo `codex-browser-use` / "Codex Browser Use", experimentalApi, optOutNotificationMethods (T/node_repl.strings:32147–32148) | app-server-protocol/src/protocol/common.rs:499; v1.rs:29–51 |
| getAuthStatus | `CodexAppServerAccessTokenFetcher::fetch_access_token`, includeToken:true, refreshToken caller-controlled (T/auth-request-disassembly.txt:43–87; strings 32148,32156) | common.rs:1461–1464; v1.rs:190–209 |
| config/read | trusted `nodeRepl.config.read`; browser-service `tL.readAll` (cwd, includeLayers:false) | strings 23449–23462,26461; browser-service.mjs line 9845; common.rs:1399–1402 |
| configRequirements/read | trusted `config.readRequirements`; browser history/full-CDP/auto-review policy checks | strings 23463–23470,26461; browser-service.mjs 9845, 9826; common.rs:1437–1440 |
| config/value/write | trusted `config.writeValue` | strings 23471–23496,26461; common.rs:1424–1428 |
| config/batchWrite | trusted `config.batchWrite` | strings 23497–23536,26462; common.rs:1430–1434 |

The last two are capabilities with no evidence a basic cell or the browser route invokes them. `readToml`/`writeToml` are node_repl's own constrained CODEX_HOME TOML storage (browser/config.toml, browser/sessions/<id>.toml), not RPCs (strings 23334,23431–23448,32151–32152). No agent-thread, turn/start or command/exec usage found; `turn_ended` is a node_repl MCP tool. Verified handshake request is `initialize` only.

Why browser work can start it without a login requirement: browser-service setup `VN` → `yv` → Statsig init `SB` and telemetry identity `jm` → `DB` fetching `https://chatgpt.com/backend-api/aura/identity` (errors swallowed), via privileged nodeRepl.fetch = `authenticated_fetch` (strings 22820–22875). The suppression check `cn` reads BROWSER_USE_DISABLE_AMBIENT_NETWORK, which cua does not set; sky's telemetry respects NODE_REPL_DISABLE_ANALYTICS=1, the browser service does not (browser-service.mjs cn/gv/SB/DB/yv/jm, lines 6432, 9845; sky computer-use-telemetry.js; launch.mjs:120–128). The identity gate in `uh.sendSessionRequest` applies only to backends with `agentRequestHeaderEnabled` present; cua's host omits it, removing the gate but not the setup telemetry attempt or configRequirements/read checks. README's "no such lookup" on the cua route means no mandatory per-request identity lookup, not zero attempted identity traffic.

CODEX_HOME contents (names/sizes): state_5.sqlite 253952; logs_2.sqlite 6811648 (+wal/shm); queue_1.sqlite 40960 (+wal/shm); goals_1.sqlite 32768; memories_1.sqlite 45056; models_cache.json 423794; installation_id 36; config.toml 247 (only a `notify` command to the relocated SkyComputerUseClient `turn-ended`); log/codex-login.log 544; auth.json 4170 (never opened); dirs cache/remote_plugin_catalog, plugins/cache, skills/.system, browser/sessions, computer-use/sessions, node_repl/active_execs, tmp/arg0. Public app-server startup initializes SQLite and DB logging (app-server/src/lib.rs:650–659,727–729; state/src/sqlite.rs:29–34); models cache (models-manager/src/manager.rs:31) refreshed by a worker every 270 s (message_processor.rs:382; models_refresh_worker.rs:10,30–59). node_repl itself writes active_execs and computer-use approval state (strings 32050, 32084–32087, 40198–40202); arg0 creates tmp/arg0 (arg0/src/lib.rs:363–379).

Network routes (capability vs verified traffic; none captured here): (1) auth refresh via getAuthStatus → AuthManager, `https://auth.openai.com/oauth/token` only with saved credentials (account_processor.rs:1041–1089; login/src/auth/manager.rs:212,2848–2931); (2) model catalog refresh gated by provider/auth (models-manager/src/manager.rs:480–503,565–568); (3) Codex analytics events to `<chatgpt-base>/codex/analytics-events/events`, skipped without usable auth (analytics/src/client.rs:140–143,240–249,860–883); (4) OTEL metrics `https://ab.chatgpt.com/otlp/v1/metrics` default off unless flag/config (cli/src/main.rs:586–602; core/src/otel_init.rs:68–77; node_repl's argv passes no `--analytics-default-enabled`, config has no opt-in); (5) browser service's Statsig/identity endpoints (`https://ab.chatgpt.com/v1`, `https://api.oaistatsig.com/v1`, `https://statsigcdn.openai.com/v1`, gate `codex_browser_use_agent_request_header`) transported via nodeRepl.fetch, not app-server RPC.

## 4. Replacement sizing

Recommendation: split into sandbox-launch compatibility and privileged browser services; do not reimplement the Codex agent engine (no agent-turn protocol is in this path). Lowest-disruption first experiment: build the version-pinned public CLI and test it as CODEX_CLI_PATH in a disposable home (not yet verified as drop-in: signing and private-distribution behaviour untested).

| Piece | What must be supplied | Necessity |
|---|---|---|
| macOS sandbox | Accept `sandbox -c … [--allow-unix-socket] -- command`, parse the generated permission table, launch a correct Seatbelt profile, preserve cwd/env/stdio/signals/exits | Essential to keep scoped/default containment with unmodified node_repl |
| Linux sandbox | Same contract onto a built codex-linux-sandbox or equivalent namespace+seccomp; package bwrap; fail-closed preflight | Essential for confined Linux browser-only operation (Linux computer route is deliberately disabled-sandbox) |
| Minimal app-server endpoint | JSONL stdio initialize, real config/read and configRequirements/read behaviour, optional writes, explicit no-auth responses | Needed while unchanged browser-service paths reach those ops; not needed for basic native operation |
| Browser auth/infra | Keep real Codex auth for the ChatGPT-extension route, or remove that route and own the browser service/telemetry/config | A no-auth stub cannot satisfy the vendor extension's identity contract |
| Login wrapper | Keep or retire with the route needing it | Not needed for cua's own route |

A Seatbelt launcher is bounded but must reproduce roots, carveouts, normalization, socket allowances, Node bootstrap access and signal behaviour; reusing the public sandboxing implementation reduces security-sensitive reinvention. Do not delete app-server while retaining the vendor browser service and call the dependency removed; its config calls affect policy and feature availability. `--disable-sandbox` would remove Codex from JS evaluation but abandons cua's scoped contract (a product decision). The macOS native service's trusted-ancestor chain (vendor Node → node_repl) was proven in M1; replacement executable signatures were not validated here. The public workspace has no node_repl/cua/sky crates.

Licence facts: public Codex is Apache-2.0 (U/LICENSE; Cargo.toml:167); codex-linux-sandbox inherits it; bundled bubblewrap is LGPL v2 (U/codex-rs/vendor/bubblewrap/LICENSE); R/CodexCLI.app is the signed binary inside the proprietary ChatGPT distribution (spec lines 87–102). Public source licensing grants nothing for ChatGPT.app, node_repl, @oai packages or native helpers.

Ambiguities: (1) why no app-server among six runtimes: most likely no app-server-requiring op exercised (computer-only, analytics disabled); resolvable by a fresh-home trace. (2) which requests run login-free: attempts are established statically, packets are not; a disposable no-login browser trace resolves it. (3) drop-in compatibility of a public build or facade needs conformance tests (generated roots, resets, disabled behaviour, failure paths).

## 5. Ten-line summary
1. Installed Codex CLI 0.159.2 = public rust-v0.159.2 (ff6aec96948b70d94983af2641a6b67c94faeff5).
2. node_repl, not the JS browser worker, spawns Codex for the sandboxed persistent kernel and trusted worker.
3. Launcher: `codex sandbox -c … -- node …`; platform chosen inside the CLI.
4. macOS containment is a Codex-generated Seatbelt profile run by /usr/bin/sandbox-exec.
5. Linux normally uses codex-linux-sandbox + bubblewrap + namespaces + seccomp; legacy Landlock is not the default.
6. scoped: whole-disk read, session/TMPDIR writes, no network; disabled: no OS restrictions.
7. `codex app-server --listen stdio://` starts lazily for initialize, getAuthStatus and config RPCs, not per cell.
8. Six runtimes without app-server is consistent with native operation; the login-free browser route still has telemetry/config dependencies.
9. Replacing Codex = sandbox-launch compatibility plus any retained auth/config services, not an agent engine.
10. Public Codex is Apache-2.0, bubblewrap LGPL; neither licenses the proprietary ChatGPT runtime bundle.
