# M9 evidence: the original OpenAI Chrome backend through the relocated runtime

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M9 (Phase C prototyping). Run on
2026-10-03 (UTC), macOS 26 arm64, host Node 22, pinned runtime `26.928.40906-darwin-arm64` from the retained scratch
install `/tmp/cua-m7.lxJbgf` (files unchanged), branch `feat/chrome-existing-profile`.

**tabOperations: 0.** The live layer sent exactly three cells: one `cua.listBrowsers({emit:false})` and one
`cua.listTabs({browser, emit:false})` per listed browser. No `getTab`, `createBrowserTab`, navigation, input,
screenshot, history, user-tab claim or `turn_ended`. No Chrome, ChatGPT, host or native-helper process was stopped,
started or signalled. No Chrome, registry, native-messaging or manifest file was written. No credential was copied, no
`codex login` ran, and `CODEX_HOME` was never the user's `~/.codex`. Neither host binary was executed by the static
layer.

## Commands and results

```sh
node scripts/probe-chrome-original.mjs --static --readable-source "$HOME/codex-app-src" --report /tmp/cua-chrome-original-static.json     # ~1 s
CUA_HOME=/tmp/cua-m7.lxJbgf node scripts/probe-chrome-original.mjs --live --report /tmp/cua-chrome-original-live.json   # ~13 s
node --test scripts/probe/chrome/original/test/   # prototype helper tests, outside npm test: 22/22
npm test                                           # 188/188
```

| Layer | Scenario | Result |
|---|---|---|
| live | live-prerequisites, live-launch, list-browsers, list-tabs-policy, elicitations-declined, read-only-cells, owned-teardown | 7 PASS |
| static | static-inputs, static-config-files, static-pid-symbols, static-gates | 4 PASS |

## Live layer

Path: our probe → owned anchor (`src/mcp/upstream.mjs`) → relocated vendor `node` / `cua-repl` → relocated
`node_repl` → the vendor's own `@oai/browser-desktop` service (no trusted-service override) →
`BROWSER_USE_BACKEND_PATHS` = the two live host sockets.

- **Selection.** Sockets came only from `lsof -U` on running `ChatGPT for Chrome` processes whose parent executable is
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. 2 hosts, 2 sockets, 0 hosts rejected, 0 `lsof`
  failures. The socket directory was not listed. Socket paths appear in no report; the report writer refuses to
  write a report containing a selected path or its basename.
- **Signatures.** Vendor `node`, `node_repl`, `codex` and the host executable each passed
  `codesign --verify --strict -R '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"'` before
  launch.
- **Environment.** Allowlisted ambient variables plus the launcher keys. `BROWSER_USE_DISABLE_AMBIENT_NETWORK`,
  `BROWSER_USE_SECURITY_MODE` and `NODE_REPL_TRUSTED_SERVICES` are absent. `NODE_REPL_DISABLE_ANALYTICS=1` is kept, as the
  production launcher sets it (node_repl analytics only). `CODEX_HOME` was a fresh, empty, 0700 directory under a
  `mkdtemp` scratch.
- **desktopRunning: true** (ChatGPT desktop present and running throughout).
- **Handshake.** `rmcp`, tools `js`, `js_add_node_module_dir`, `js_reset`, `turn_ended`. The `js` description documents
  the browser surface and not the computer surface.

| Cell | Outcome class | Vendor text (sanitized) |
|---|---|---|
| `listBrowsers` | ok | 2 browsers, both `type: extension`, `family: chrome`, numeric vendor ids, generic Chrome name, `metadata.extensionInstanceId` present, `codexSessionId` absent, `profileName` absent |
| `listTabs` (browser 1) | identity-or-auth | `Codex auth token is unavailable` |
| `listTabs` (browser 2) | identity-or-auth | `Codex auth token is unavailable` |

How the refusal arises. Tags: **source** = the pinned readable `browser-service.mjs` (`BS`); **string-evidence** =
`node_repl` strings; **observed** = this run.

1. With ambient network enabled, the service starts identity initialization when it starts up (`yv` → `jm`,
   `BS:66167`, `BS:17708-17735`). `jm` calls `DB`, which fetches `https://chatgpt.com/backend-api/aura/identity`
   through the host context's `fetch` (`BS:17655-17670`). (source)
2. `node_repl` provides that fetch as an *authenticated* fetch. Its strings include `struct AuthenticatedFetchRequest`,
   `getAuthStatus`, `authToken`, `Codex auth token is unavailable` and `codex app-server auth fetch failed`. It asks
   `codex app-server` (`CODEX_CLI_PATH`, under the runtime's `CODEX_HOME`) for the auth token. (string-evidence)
   During the run a `codex` process appeared in the owned process group. (observed)
3. The hosts report `agentRequestHeaderEnabled` as a boolean (the earlier metadata probe saw `false`). So every
   session request except `getInfo` first runs the request-header check, which awaits the identity promise in `wv()`
   (`BS:68066-68092`, `BS:17686-17692`). (source) The identity promise rejected with the node_repl error above, so
   `listTabs` was refused inside the vendor before any `getTabs` reached a host. (observed: the exact text, and no tab
   count was returned)
4. `listBrowsers` does not go through that check: `getInfo` is exempt. So the metadata path works without any login,
   as the earlier handshake predicted. (source + observed)

Other observations:

- **Enrichment.** `profileName` is absent on both entries, so profile enrichment either did not match or did not run.
  The normalized entry cannot show whether raw `getInfo` carried `metadata.extensionId`, enrichment's precondition
  (`BS:67416-67444`). Recorded as "attempted: unknown, profileName present: false". No enrichment temp directory was
  left in the scratch tree.
- **Network.** The vendor's default network behaviour was in effect. The owned group held 4 distinct remote TCP
  endpoints, all on port 443 (counts only; hosts were not recorded). Executables seen in the group: `node`,
  `node_repl`, `codex`, and `git` / `git-remote-https`. So the `codex app-server` started for the authenticated fetch
  also ran git over HTTPS. The owned `CODEX_HOME` afterwards held `skills/`, `node_repl/`, `tmp/`, `.tmp/`,
  `installation_id` and Codex sqlite state files (`state_5`, `logs_2`, `goals_1`, `memories_1`, `queue_1`). No
  `auth.json` was created. File contents were not inspected. The git traffic and `installation_id` are
  Codex-CLI behaviour that a standalone product will inherit whenever the browser surface starts identity
  initialization.
- **Elicitations: 0.** None were requested, so none had to be declined.
- **Teardown.** Confirmed through the anchor (`eof`, then `SIGTERM` inside the 5 s budget, since EOF alone did not empty
  the group in time). Group empty, 0 leftover runtime processes. Both host pids were still running afterwards, and
  the scratch directory (including the owned `CODEX_HOME`) was removed. The runtime wrote 0 bytes of stderr.
- **Extension version from getInfo:** not observable here. The normalized `listBrowsers` entry omits it and cells
  cannot see raw `getInfo`. The installed manifest version recorded earlier (`1.26.901.11451`) is unchanged evidence
  from `original-chrome-host-reuse.md`, not from this run.

## Static layer

The installed host (`chrome/latest`, sha256 `59913129…0928`) and the archived 26.928.40906 host (`28a658af…2ce0`) were
both examined. Both pass the strict team requirement, both are Rust, unstripped (1387 functions), link only system
frameworks, and have identical imports. Every conclusion below holds for **both** binaries.

| Question | Conclusion | Evidence |
|---|---|---|
| Config file names | `extension-host-config.json`, `chrome-native-hosts-v2.json`, `.codex-global-state.json` | string-evidence |
| Who reads them | `extension_host::app_server::AppServerHostConfig::load` materialises both `extension-host-config.json` and `chrome-native-hosts-v2.json`. It directly calls `current_exe`, `Path::parent`, `var_os`, `read_to_string`, `canonicalize` and `required_manifest_path_exists`. The `current_exe`/`parent` calls are consistent with the config file sitting next to the host executable, but the exact join was not reconstructed. | disassembly-evidence |
| Registry location | The literals `OpenAI`, `Codex`, `Library`, `Application Support` and `HOME` sit next to `chrome-native-hosts-v2.json` and are referenced by `load`. That is consistent with `$HOME/Library/Application Support/OpenAI/Codex/chrome-native-hosts-v2.json`; segment order is not proven. | string-evidence |
| Config / env keys | `load` references the config keys `browserClientPath`, `browserServicePath`, `codexCliPath`, `codexHome`, `nodeReplPath`, `nodePath`, `proxyHost`, `proxyPort`, the env names `CODEX_CLI_PATH`, `CODEX_EXTENSION_ID`, `CODEX_BROWSER_USE_NODE_PATH`, `CODEX_BROWSER_CLIENT_PATH`, `CODEX_NODE_REPL_PATH`, `CODEX_APP_SERVER_PROXY_HOST/PORT`, and `CODEX_HOME` | disassembly-evidence |
| Registry fields read | `load` references `schemaVersion`, `entries`, `updatedAt`, `presence`, `pid`, `paths`, `nativeHostNames`, `extensionIds`, `extensionBuildChannels`, `resourcesPath`, `extensionHostPath` | disassembly-evidence |
| proc_pidinfo / kill | Both are imported. The **only** `proc_pidinfo` call site is `extension_host_copy_code_identity_for_audit_token_at_depth` (PROC_PIDTBSDINFO walk of the socket peer's parent chain), reached as `authorize_unix_stream` ← `main`: it is the peer-ancestry signature gate. The **only** `kill` call site is `std::process::Child::kill` (SIGKILL to the host's own child), reached from `stop_app_server_child`. `load` reaches neither through direct calls. `getppid`, `sysctl` and `proc_listpids` are not imported. | disassembly-evidence (direct calls; 274 indirect branches binary-wide are not followed) |
| Registry liveness | No PID-probe path for `presence`/`pid` exists. Whether `presence` affects entry selection in some other way (time-based via `updatedAt`, value checks) is not established. | disassembly-evidence for "no pid probe"; **unknown** for presence semantics |
| Socket vs app-server gating | The socket is created on main's own path: `main` → `UnixSocketServer::bind` → `bind_owner_only_socket`. `main` references `/tmp/codex-browser-use` and `unix socket directory path is not a directory`. `load` is reached only via `AppServerManager::ensure` ← `handle_native_host_control_message` (one native-messaging control message on the transport thread), never from `main` directly. | disassembly-evidence |
| Error codes | `app_server_runtime_error`, `chrome_extension_update_required`, `codex_app_update_required`, `manifest_invalid`, `manifest_missing`, `no_matching_codex_install` and `required_path_missing` sit in one enum→&str pointer table. Its only reader is `codex_runtime_error_response`, whose only caller is `handle_native_host_control_message`. The manifest messages (`Codex Chrome native host v2 manifest is missing`, `No compatible Codex app-server entry was found`, `…schemaVersion 2`, `Matching manifest entry is malformed`) are built in `load`. So these codes gate **app-server spawning after the socket exists**, not socket creation. | disassembly-evidence |

Implication for independent registration (a reading of the evidence, not a measurement): a host whose registry or
config lookup fails should still create its socket and pass the peer gate. Only the app-server/side-panel path
should fail, with one of the codes above. That matches the live finding that `getInfo`/`listBrowsers` works without
any CUA-side registration. Registration precedence and presence semantics stay later gates.

## Verdict against the M9 criteria: PROMOTE

- *The real browser service lists the existing hosts as `extension` backends with Chrome family*: yes, 2 of 2.
- *The policy refusal is identified by its exact class*: identity-or-auth. The vendor text is
  `Codex auth token is unavailable`, raised by node_repl's authenticated fetch (via `codex app-server getAuthStatus`)
  inside the request-header identity check.
- *The static layer names where the host reads its configuration*: `AppServerHostConfig::load` reads
  `extension-host-config.json` and `chrome-native-hosts-v2.json`, on the app-server path only.
- Discard condition not met: the refusal is a missing Codex login in the runtime's `CODEX_HOME`, which a legitimate
  login can satisfy.

**The fact the next product decision needs:** the original route's session requests need a Codex auth token, which
`codex app-server` reports from the runtime's `CODEX_HOME`. The choice is which login the standalone server's
`CODEX_HOME` holds: its own (`codex login` against CUA's owned home) or the desktop's. That choice belongs to the
owner. Starting identity initialization also starts `codex app-server`, which here also ran git over HTTPS and wrote
Codex state into that home. That cost comes with any identity-enabled run.

## Limits

Not established here, and still later gates:

- what a *signed-in* identity gets next: the `codex_browser_use_agent_request_header` Statsig gate, and whether origin
  elicitations appear for user tabs;
- desktop absence (the desktop ran throughout and the hosts were its registration's children);
- host relocation, registration precedence, and `presence` semantics;
- any actual browser operation.

The run reused the M7 scratch runtime. Live results depend on the current installed host (26.930.21537 desktop), not
the archived host binary.

## Files

`scripts/probe-chrome-original.mjs` (entry), `scripts/probe/chrome/original/hosts.mjs` (process/socket selection,
signatures), `classify.mjs` (outcome classes, sanitizer), `live-layer.mjs`, `static-layer.mjs`, `disasm.mjs`
(otool -tV parsing, literal/table cross-references), and `test/` (prototype helper tests, run explicitly with
`node --test scripts/probe/chrome/original/test/`, deliberately outside `npm test`).
