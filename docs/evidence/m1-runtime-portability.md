# M1 evidence: relocated runtime portability and trusted-wrapper seam

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M1. Probe: `scripts/probe-runtime.mjs`
(read-only; helpers in `scripts/probe/`). Run on 2026-10-02, macOS 26 arm64, host Node 22.23.2. Paths below use
`$CUA_HOME` for the scratch home (a `mktemp -d /tmp/cua-m1.XXXXXX` directory outside the repository) and `~` for the
user's home. Raw probe JSON stayed in the scratch home; this file keeps only the conclusions.

## Verdict: promote

| Question | Result | Evidence |
|---|---|---|
| Relocated vendor signatures stay valid | PASS | `codesign --verify --deep --strict` and team `2DC432GLL2`, hardened runtime, for `cua_node/bin/node`, `cua_node/bin/node_repl`, `CodexCLI.app`, `@oai/sky/Codex Computer Use.app`, after extraction and after three probe runs. |
| Relocated runtime serves MCP | PASS | `initialize` answered by `rmcp 1.5.0`, protocol `2025-06-18`; `tools/list`: `js`, `js_add_node_module_dir`, `js_reset`, `turn_ended`. |
| Native read-only request from relocated paths | PASS | First `js` cell: banner/API document, then `cua.getState()` returned a non-empty app list (count only recorded), no errors, no elicitations. |
| No-op trusted sky wrapper delegates without vendor edits | PASS | `NODE_REPL_TRUSTED_SERVICES={"sky":"<repo>/scripts/probe/sky-wrapper-fixture.mjs"}`; the wrapper saw and delegated `setup` (banner import) and `execute:list_apps` (`getState`) to the vendor `handleRpc`. |
| Hidden `turn_ended` works on the relocated runtime | PASS | `turn_ended {hook_event_name:"Stop", session_id, turn_id}` with the cell's IDs returned `{}`, `isError:false`. |
| No installed-desktop runtime path in the owned process tree | PASS | Every executable below the launcher is under `$CUA_HOME/runtimes/26.928.40906-darwin-arm64/`. |
| Helper actually contacted | Existing, reused | The native socket's only holder before and after each run was pid 34706, `~/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService`, a child of the running ChatGPT 26.928.31416. Not relocated, not independently launched. |
| Cold start of the relocated helper (`SKY_CUA_SERVICE_PATH`) | BLOCKED | The owner's helper is serving the fixed per-user socket; starting ours would require quitting it, which M1 must not do. Needs a machine or account with no running helper. |
| Fresh TCC onboarding / desktop absence | BLOCKED | This host has ChatGPT installed and running, and the helper already holds Accessibility and Screen Recording. The relocated helper has the same bundle id and the same CDHash as the installed copy, so this host cannot show a fresh-permission path. Needs a clean machine/VM (acceptance 9). |

## Process ancestry (allowance variant; the other variant is identical apart from the flag)

```
host node 22.23.2 (~/.nvm/..., team HX7739G8FX: Node.js Foundation, not OpenAI)   <- the probe, MCP client
└─ $R/cua_node/bin/node  @oai/cua-repl/bin/cua-repl.mjs        (OpenAI 2DC432GLL2: the trusted ancestor)
   └─ $R/cua_node/bin/node_repl                                 (relay; opens the native socket itself)
      ├─ $R/CodexCLI.app/Contents/MacOS/codex sandbox ... -- $R/cua_node/bin/node kernel.js         (untrusted cells)
      └─ $R/CodexCLI.app/Contents/MacOS/codex sandbox ... -- $R/cua_node/bin/node trusted-worker.js (trusted services)
```

`$R` = `$CUA_HOME/runtimes/26.928.40906-darwin-arm64`. No ChatGPT or Codex app process is an ancestor; the service
accepted `node_repl` under the relocated OpenAI `node` with an HX7739G8FX `node` above it. Both sandbox children run
`codex sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl"` with
`filesystem = {<cua_node/bin>, <node_modules>, <node_repl tmp>, ":root"} = read` and `network = {enabled = false}`;
the trusted worker's profile also lists the wrapper's trusted directory (here `scripts/probe`). Every listed entry is
read-only. Kernel and worker run in the launcher's working directory (`--working-dir`), here `$CUA_HOME`. The
launcher, `node_repl` and both sandboxed children exited on stdin EOF with code 0; no owned process outlived the
launcher.

## Trusted-wrapper facts for M2 and M5

- The pinned `node_repl` embeds the same `trusted-worker.js` as 0.0.24: services named by absolute path are accepted;
  every `file:` module the worker imports (the wrapper itself, its imports, and the vendor module it delegates to)
  must have its realpath under `NODE_REPL_TRUSTED_CODE_PATHS`; the module must export `handleRpc`.
- The vendor `@oai/sky/service` exports only `handleRpc`; sky registers no turn-ended or after-code hooks (only the
  browser service does). Delegating `handleRpc` therefore keeps everything sky does.
- The trusted worker sees the launcher's full environment, so the launcher can hand the wrapper the absolute vendor
  service path (`CUA_SKY_VENDOR_SERVICE` in the probe). Untrusted cells see only
  `NODE_REPL_UNTRUSTED_ENV_ALLOWLIST` (`CUA_REPL_ENABLED_SURFACES`).
- Pinned input shapes (`@oai/sky` 0.7.5 mac targets and `@oai/cua` `bind_mac_app.js`), all
  `nodeRepl.rpc("sky", {type:"execute", method, args:[input]})`:
  `paste` `{app, text, format}`, `type_text` `{app, text}`, `set_value` `{app, element_index, value}`. These match the
  spec's table (`input.text`, `input.text`, `input.value`). Untrusted cells can call `nodeRepl.rpc("sky", ...)` directly
  with any such shape, so the wrapper must not trust the `cua` API to have built it.
- Sky's per-call telemetry records bundle id, tool name, duration and status, not input text.

## Broker endpoint reachability (the sandbox socket question)

A probe-owned unix socket under `$CUA_HOME/run/` (mode 0700 directory) answered a per-side nonce:

| Route | No allowance | `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS=<socket>` |
|---|---|---|
| Trusted worker, `node:net` connect | EPERM | connects |
| Trusted worker, `nodeRepl.nativePipe.createConnection` | connects | connects |
| Untrusted cell, `node:net` connect | EPERM | **connects** |
| Untrusted cell, `nodeRepl.nativePipe` | not present | not present |
| Untrusted cell reading the worker's environment via `ps -E` | EPERM | EPERM |

`node_repl` passes the allowance as `--allow-unix-socket <path>` to *both* sandbox profiles, kernel included. An
explicit allowance therefore exposes the broker endpoint to model-written code as well, leaving the capability token
as the only barrier. `nodeRepl.nativePipe` reaches the socket with no allowance because `node_repl` itself opens it
outside the sandbox, and only the trusted worker has that API.

## Other observations

- The pinned 26.928.40906 `node`, `node_repl` and `Codex Computer Use.app` (26.924.1001281, IPC
  `CodexComputerUseIPC-5`) have the same CDHashes as the installed 26.928.31416 copies, so the running helper is
  compatible. Identity was confirmed by path, not by hash.
- The upstream tool list includes `js_add_node_module_dir`, which the spec's four-tool surface does not.
- With an owned empty `CODEX_HOME`, the runtime wrote only `node_repl/active_execs` and `tmp/arg0/codex-arg0*`
  (the latter one directory per sandbox launch, left behind); no account, auth file or app-server child was needed for
  this read-only path.
- The archive extracts with `com.apple.provenance` only (no quarantine on this downloaded copy); extraction used
  `ditto -x -k` and same-volume moves, preserving modes, symlinks, xattrs and signatures.
