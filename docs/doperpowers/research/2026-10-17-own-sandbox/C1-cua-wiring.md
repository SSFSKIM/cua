# cua #115 map: Codex CLI, CODEX_HOME and the sandbox launcher

Repo `/Users/new/Developer/GitHub/cua` at main 76c3b84. Read-only. I never opened auth.json or any token or key file; I listed `auth.json` by name and size only.

**Two corrections to the ticket's premise**
- **Secret-store read-deny does not exist.** No sandbox profile and no acceptance item denies a cell the secret store. The shipped trust model is the opposite:
  - README.md:310-318 says cells read everything the account can, and "cua cannot deny the store to cells alone".
  - The own-REPL-host spec (`2026-10-14-own-repl-host-design.md`) line 122 says "The sandbox does not hide the secret store from authorized cell reads".
  - src/runtime/launch.mjs:48-49 (in the env header) says the same, and `NODE_REPL_DENIED_PATHS` is "deliberately never set".
  - A replacement meets "same or stricter policy" by reproducing read-everywhere, write-only-run-dir-and-TMPDIR, no network.
- **#79 is in progress.** Comments on #115 say the ChatGPT extension route is being removed ahead of it. Branch `feat/79-remove-chatgpt-route` exists. When it lands it takes `cua login`, `codex.login`, the vendor browser service and `src/runtime/login.mjs`. The ticket (#79) says `CODEX_CLI_PATH`, the CodexCLI.app relocation and `CODEX_HOME` stay for #115. Everything below describes main; items marked (#79) disappear first.

## 1. References by route

**The launcher argv (sole real use).**
- `sandboxArgs` (src/runtime/sandbox.mjs:~244-248) renders `sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl" -c permissions.node_repl={filesystem = {…}, network = {enabled = false}} -- <node> --experimental-vm-modules <script> …`.
- `sandboxPolicy` (sandbox.mjs:~216-238) builds the filesystem table from the call's `codex/sandbox-state-meta`. Keys are `:root`, `:tmpdir`, `:workspace_roots` and absolute paths, sorted in byte order. Network is always off.
- A disabled profile skips the launcher entirely.

**Own host (src/repl-host/supervisor.mjs)**
- **supervisor.mjs:123:** `hostSettings` reads `CODEX_CLI_PATH` (absolute only) into `codexCli`. `CODEX_HOME` goes to `codexHome` at :139.
- **supervisor.mjs:147-152:** `childLaunch` spawns `{command: settings.codexCli, args: sandboxArgs(policy, command)}` with `CODEX_HOME` set, for both the kernel (:154) and the trusted worker (:158). `key` = `[cwd, filesystem]`, so a policy change replaces both children.
- **supervisor.mjs:172, 508:** with no `CODEX_CLI_PATH`, non-disabled calls return `NO_SANDBOX_SENTENCE` (:97). The host also advertises `sandboxed` in `initialize` and `tools/list` (:615, 620; tools.mjs:59-104).
- **kernel-child.mjs:2-18, 179:** the child is the launcher, not Node. Linux uses FIFOs because the sandbox's network filter breaks socketpairs. Teardown is `killProcessTree`.
- **worker-runtime.mjs:19:** warms the time zone at load, because ICU's `tzset` hangs under `codex sandbox` on macOS (spec lines 1066-1070).
- **privileged-node-repl.mjs:6-12:** the app-server, config, fetch and telemetry bridges are deliberately not ported. The own route has no app-server.

**Vendor host (Node → cua-repl → Rust node_repl)**
- Receives `CODEX_CLI_PATH` and `CODEX_HOME` from launch.mjs:104, 124.
- node_repl spawns `$CODEX_CLI_PATH sandbox …` for the kernel and trusted worker. It also lazily runs `$CODEX_CLI_PATH app-server --listen stdio://` for auth, config, requirements and the privileged `config/*`, `getAuthStatus` and `fetch` APIs.
- Evidence is the recovered binary index, not cua code: `docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md:211` and `research-B-node-repl-host.txt:33-39`.
- The macOS computer surface must use this host (launch.mjs:~314-316, `macos_native_peer_requires_vendor`). The Linux vendor host fails open when the launcher fails at runtime (own-host spec 1085-1086).

**cua-side env and preflight (both hosts)**
- **launch.mjs:104** sets `CODEX_HOME: owned.codexHome`.
- **launch.mjs:124** sets `CODEX_CLI_PATH: p.codexCli` for every launch.
- **sandbox.mjs:188** (`assertSandboxFits`) refuses a scoped launch whose write roots overlap `CODEX_HOME`, trusted code, `$CUA_HOME/node` or `$CUA_HOME/staging`. The same check runs at src/mcp/connection.mjs:113, 121 and src/profiles/inventory.mjs:148, and in doctor (doctor.mjs:285-289).
- **Linux preflight:** `assertSandboxConfines` (sandbox.mjs:~169-178), `bwrapUserns` (linux-desktop.mjs:~110-118) and doctor's `sandbox.userns` refuse scoped launches where bwrap cannot create a user namespace, because the vendor sandbox then fails open.
- **Mode selection:** `defaultSandboxMode` (sandbox.mjs:~25) makes the default `disabled` on Linux with the computer surface and `scoped` otherwise. The `sandboxModeFrom` call sites are src/cli.mjs:650, src/mcp/server.mjs:446, doctor.mjs:267, inventory.mjs:135 and scripts/native-baseline/remote.mjs:98.
- **Metadata path:** the proxy sends the state through `sandboxState` and `withSandbox` (src/mcp/server.mjs:112-115, inventory.mjs:103).

**By surface, route and platform**

| Route | macOS | Linux |
|---|---|---|
| Browser, cua route (default) | Own host: launcher for kernel and worker, scoped by default, CODEX_HOME unused except approval cleanup | Own host: same, bwrap via `codex-linux-sandbox`, userns preflight |
| Computer | Vendor host only. Launcher for kernel and worker. Sky helper reads CODEX_HOME. Approvals written there. | Own host: default `disabled`, so no launcher runs. `scoped` is refused by doctor because X11 and the bus get EPERM. |
| Browser, ChatGPT extension route (#79) | Vendor host only. Adds app-server and login. | Same |

**CODEX_HOME sites**
- layout.mjs:6, 24 (`state/codex`).
- install.mjs:~169 (`ensureCodexHome`, called at :111 and :135).
- src/mcp/connection.mjs:122 (mkdir) and :82 (approval-file removal, below).
- src/profiles/inventory.mjs:151, 158 (the same mkdir and removal for the listing launch).
- chrome-component.mjs:~45-47, 118-121, 160-170 and hostConfigFor, which writes `codexCliPath` and `codexHome` into `extension-host-config.json`, so the vendor native host runs the CLI (#79).
- doctor.mjs:~160 (`codex.login`, #79).
- login.mjs, whole file, and cli.mjs:506-530 (#79).

**Test and probe-only**
- scripts/probe/lib.mjs:19-41.
- probe-runtime.mjs:48, 203.
- scripts/probe/chrome/{vendor-layer,host-layer,no-header}.mjs and original/*.
- probe-chrome-original.mjs.
- browser-parity/capability-home.mjs.
- accept-native.mjs:231.

**connection.mjs:82** removes `$CODEX_HOME/computer-use/sessions/<session>.toml` at connection close, host-independently. The evidence is m6-acceptance.md:98 (before M6 these files accumulated, per the spec's tracker at tech-debt-tracker.md:271). The directory currently has 0 files. cua never writes it.

## 2. Install, manifest, doctor, packaging

**Pins** (`runtime/releases/*.json`, four files, three pins plus a `node/` directory):
- **darwin-arm64:** `archive` is a ~687 MB zip with SHA-256 pinned. `components` are `cua_node` and `CodexCLI.app`. `layout.codexCli` is `CodexCLI.app/Contents/MacOS/codex`. `signing.components` includes `CodexCLI.app` (team 2DC432GLL2).
- **linux-x64 and linux-arm64:** `archive.format: "deb"`, ~475/453 MB, hash is the whole trust root, with a gpg provenance note. `components.codex` is `usr/lib/chatgpt/resources/codex`, a single file. There is no signing, no IPC and no helper app.

**Code that has to change to drop `codex`**
- **manifest.mjs:22-23:** `LAYOUT_KEYS` and `LINUX_LAYOUT_KEYS` both require `codexCli`, and `parsePin` uses `exactKeys`. The key and the `CodexCLI.app` and `codex` components must be removed in the parser and all three pins together, and `signing.components` shrinks.
- **install.mjs:** extracts the whole archive, then `renameSync`s each pinned component into place (:80-86). `verifyRuntimeTree` runs `checkLayout`, `checkVendorManifest`, `checkIpc` and `verifyCodeSignatures` (checks.mjs). Signature checking uses `codesign --verify --deep --strict -R "anchor apple generic and certificate leaf[subject.OU]=…"`.
- **doctor.mjs:117-135:** `runtime.files` (checkLayout) and `runtime.signatures` cover the CLI. A comment at :132 says Linux trusts the archive hash.
- **doctor.mjs:285-290** (`sandbox` row): wording mentions node_repl. Row text must be updated if a cua launcher replaces it.
- **Tests that bind to the CLI:** runtime-manifest.test.mjs:91, 110, 140; runtime-doctor.test.mjs:131, 135 (damaged CLI → `runtime.files`).
- **Linux install tools:** `DEB_TOOLS = {ar, tar, xz}` unpack the deb. After #115, `codex` is the one component whose removal changes nothing about what is unpacked, because `cua_node` still needs the deb. Linux still needs system `bwrap` (doctor installs it in deploy/cloud-vm/cua-provision.sh:56). Vendor `codex` calls `codex-linux-sandbox`, which execs `/usr/bin/bwrap --as-pid-1 --new-session --die-with-parent --ro-bind / / … --unshare-user --unshare-pid --unshare-ipc --unshare-net --cap-drop ALL` (2026-10-06-linux-acceptance.md:185-188). A "built Linux sandbox helper" would replace `codex` plus `codex-linux-sandbox`, not bwrap.
- **macOS seatbelt** is the system `sandbox-exec` / libsandbox, so a cua launcher there needs no extra binary. None of this was run.

**What cua already distributes: only `peer-auth`.**
- Source is `native/peer-auth/peer-auth.c`. The build is `scripts/build-peer-auth.sh`: `xcrun clang -shared -fPIC -O2 … -install_name @rpath/peer-auth.node -target arm64-apple-macosx13.0`, with headers from the `node-api-headers` devDependency. It refuses off Apple-silicon macOS.
- The artifact `native/peer-auth/prebuilds/darwin-arm64/peer-auth.node` is committed to git (51 KB). `package.json` `files` includes `native/`. I checked: it is only linker-signed ad hoc (`codesign -dv`: adhoc,linker-signed).
- `cua install` does not obtain it. `src/chrome/peer.mjs:21-34` loads it by path with `process.dlopen` and checks an exported version.
- Verification is by source hash. test/chrome-peer.test.mjs:18, 99 pins the SHA-256 of `peer-auth.c`; nothing checks the binary's hash at run time.
- No release signing or notarization exists. The same file is kept byte-identical in MAWS by hand (native/peer-auth/README.md).
- A Linux sandbox helper has no equivalent today: no Linux prebuild directory, no Linux build script and no install step. A built-in-repo pattern (commit the prebuild beside the source, pin the source hash in a test) would extend to a `darwin`+`linux-{x64,arm64}` set, but the Linux builds need a Linux toolchain. CI is `.github/workflows/ci.yml`, a call into `SSFSKIM/ci-kit` gates; I did not read what the gates build.

## 3. `$CUA_HOME/state/codex` on this Mac

Path: `~/Library/Application Support/cua/state/codex`. Sizes in KB are `du -sk`; file sizes are bytes. Writer attributions marked "inferred" have no direct evidence in the repo.

| Entry | Size | Writer / reader, with evidence |
|---|---|---|
| `auth.json` | 4185 B | The CLI's login (README.md:687; m10 evidence "seen by name in the listing only"). Read by the vendor app-server (`getAuthStatus`, m9-original-chrome.md:63, 126-131). #79 removes the only reason it exists. |
| `config.toml` | 247 B (10-03) | I read it: one `notify = ["<…/SkyComputerUseClient>", "turn-ended"]` line, no credential. SkyComputerUseClient contains the strings "Handles a Codex turn-ended notification" and `CODEX_HOME`; SkyComputerUseService contains `--previous-notify`, `notifyDispatch`, `turn-ended`. The writer is therefore the sky helper (inferred, from strings in the binaries). Reader is `codex` core/app-server (inferred). |
| `installation_id` | 36 B (10-02) | The Codex CLI (m9-original-chrome.md:82-85, "Codex-CLI behaviour"). |
| `goals_1.sqlite` 32768, `memories_1.sqlite` 45056, `queue_1.sqlite` 40960 (+`-shm` 32768, `-wal` 688072), `state_5.sqlite` 253952, `logs_2.sqlite` 7548928 | ~8.7 MB total | `codex app-server` (m10-original-chrome-tabs.md:106-109: "what `codex app-server` and node_repl wrote"; m9:82-85). Last written 10-14 07:07 to 16:39. |
| `models_cache.json` | 399519 B (10-14 16:39) | Appeared in the same m10 batch; attributed to app-server (inferred, not named individually in the evidence). |
| `cache/` (`remote_plugin_catalog/…json`) | 34372 | App-server (m10 run 3: "gained `cache`"). |
| `plugins/` (`cache/openai-curated-remote/…`, 15 plugin directories, plus `.remote-plugin-install-staging`) | 53848 | App-server (m10 run 2 added `plugins`). |
| `skills/` (`.system/{review-agent,skill-creator,skill-installer,openai-docs,imagegen}`) | 408 | App-server (m9:82; m10). |
| `browser/sessions/` | 76 (19 `.toml`, newest 10-13 06:27) | Vendor browser service via node_repl's privileged `writeToml` (privileged-node-repl.mjs:10-12, "browser/sessions/<id>.toml"). Nothing in cua writes or removes them; the own browser service writes nothing under CODEX_HOME (README.md:614). Dead weight on the cua route. |
| `computer-use/sessions/` | 0 (empty) | The vendor/sky approval (README.md:114, m6-acceptance.md:98). Written by node_repl/sky while a connection is open; cua removes the file at close (connection.mjs:82). |
| `node_repl/active_execs/` | 0 (empty) | node_repl writes and removes (m3-mcp-lifecycle.md:84, "no reader was found"; m1-runtime-portability.md:81). A killed runtime leaves records (tech-debt-tracker.md:192). |
| `tmp/arg0/codex-arg0*` | 0 (4 symlink dirs) | One per `codex sandbox` launch, left behind (m1-runtime-portability.md:81-83; m5:62 "symlinks not followed"). Written by the CLI's arg0 dispatch. |
| `log/codex-login.log` | 544 B (10-02) | `codex login` (the one login on 10-02 20:45). |

Consumers in summary:
- **cua:** mkdir 0700, approval-file removal (connection.mjs:82, 122; inventory.mjs:151, 158), install (`ensureCodexHome`), the scoped-write-root overlap guard (sandbox.mjs:188, doctor:285), and the hostConfigFor entry (#79).
- **CLI sandbox launcher only:** `tmp/arg0` (a scratch for the CLI's multi-call dispatch). A cua launcher needs no CODEX_HOME.
- **node_repl:** `node_repl/active_execs`, `computer-use/sessions`, `browser/sessions` (the last only on the vendor browser route).
- **Sky helper:** `config.toml` notify hook (inferred); reads `CODEX_HOME` (the string appears in SkyComputerUseClient). m5-secret-substitution.md:43-46 recorded the earlier finding that the vendor sky service "reads CODEX_HOME only as a path to look for a helper app". The macOS computer route therefore still needs a CODEX_HOME value until #117 replaces the helper; whether it needs the contents is untested.
- **`codex app-server`/login:** everything else. Nothing here is a standing process (the ticket says no app-server was alive on 10-13).

## 4. Spec and README text a sandbox replacement must revise

**`2026-10-02-standalone-cua-design.md` (659 lines)**
- :84 — Scope: "The pinned runtime still supplies the native engine, Codex sandbox and vendor routes."
- :100 — Acquisition: extracts `CodexCLI.app` into the runtime tree.
- :107 — Env contract: "Both keep `CODEX_CLI_PATH`, CUA-owned `CODEX_HOME`…"; "Keep the vendor CLI's `codex sandbox` for both confined children until #115".
- :233 — Constraint "preserve unmodified vendor bytes/sandbox".
- :350-359 (M10) — The standalone server's own Codex login in `CODEX_HOME`; `cua login`, `codex.login` (#79 handles).
- :508, :524 — Observations: `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS`; managed profiles deny all kernel network and refuse a writable trusted root (measured behaviour any replacement must match or knowingly change).
- :544 — #116 revision, naming the retained sandbox.
- :559 — Decision, issue #36: `scoped` is the default, with the exact profile JSON.
- :566 — Decision, issue #34: `disabled` consequence stated.
- :572 — Decision, issue #20: sends `codex/sandbox-state-meta`.
- :596-600 — M10/Phase C production plan on the login and the original route (#79).
- :620 — M2 fold-back: pin includes `CodexCLI.app` as a signature-checked component.
- :618 — M1 fold-back: never set `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS`.
- :633 — Independence composite entry (#113/#114).

**`2026-10-14-own-repl-host-design.md` (1157 lines)**
- :6 — Purpose: sandbox launcher out of scope.
- :28, :267 — "#115 owns replacement of the retained sandbox launcher".
- :97-122 — "Kernel and sandbox": the recovered argv template, the policy mapping, "No silent unsandboxed fallback", "does not hide the secret store". This is the section to rewrite.
- :173 — Drop privileged fetch, telemetry, app-server and `CODEX_HOME` RPCs.
- :249, :358-360, :378 — acceptance and milestone text ("replace Codex sandbox" explicitly deferred).
- :523, :537-538 — ApprovalStorage interface row (no callers) and "retained sandbox/native" dependencies.
- :927-928 — Decision: time-zone warm at load. :933, :937, :970-972, :988-989 — decisions on sandbox policy changes, trusted-root refusal, fail-closed/no-fallback, `CODEX_CLI_PATH` refusal.
- :1066-1070 — Observation: macOS ICU/`tzset` hang under `codex sandbox` (4/30 vendor, 15/80 sandboxed probe, 0/280 warmed). A replacement profile must be re-checked for this.
- :1085-1086 — Observation: Linux vendor fails open; the own host refuses.
- :1102 — Observation on `NODE_REPL_TRUSTED_CODE_PATHS` read.

**README.md (1566 lines)**
- :7 and :33 — intro (native engine, sandbox, vendor routes) and "empty CODEX_HOME".
- :108-122 — App approvals: `CODEX_HOME/computer-use/sessions/<id>.toml`.
- :194 — "Confined children of both hosts still use Codex's sandbox".
- :310-318 — secret store, sandbox and cells.
- :537 — scoped needs write temp.
- :606-629 — "What the browser service does on the network and on disk" (:614, 619, 621-627: CODEX_HOME, `codex sandbox` and app-server text).
- :658-692 — ChatGPT route and "The server's Codex login" (#79).
- :726-727 — registry gating the app-server.
- :1060-1068 — Linux intro (retained sandbox, `codex` in the deb).
- :1097-1100 — Linux packages ("`bwrap` is the sandbox").
- :1121-1135, :1148 — "The sandbox" (Linux): retained until #115, userns, fail-open.
- :1229-1231 — cells have no network.
- :1319-1320 — acceptance rows.
- :1397 — `CUA_HOME` row mentions `state/codex`.
- :1408-1448 — Configuration: `CUA_SHIM_SANDBOX` row and the subsequent sandbox paragraphs (:1413 "retained until #115"); :1446 removed `CUA_SHIM_CODEX_HOME`.
- :1451-1455 — Licences: "the sandbox, native engine and vendor routes still use it".
- :1534 — inspector can't listen under scoped.

## 5. Tests and evidence

**Unit tests that touch the launcher or `CODEX_CLI_PATH`**
- **test/repl-host/sandbox.test.mjs:13-48** asserts the exact argv from `sandboxArgs` for scoped, default and disabled; `SandboxStateError` for unrenderable states; `trustedCodePathsOf` per host.
- **test/repl-host/supervisor.test.mjs:38, 75, 135, 148, 156, 294** — real supervisor and kernel with a script double for the launcher (`sandboxDouble`, supervisor-harness.mjs:18) asserting:
  - the recorded argv equals the recovered template;
  - `CODEX_CLI_PATH` never reaches the kernel;
  - a launcher exiting 73 gives a refusal, never an unconfined run;
  - with no launcher, `NO_SANDBOX_SENTENCE` for scoped and default;
  - a policy change gives a fresh kernel.
- **test/mcp-sandbox.test.mjs:29-176** — mode parsing and defaults, the scoped/disabled/default state shapes, `sandboxConflicts` (case-insensitive volume, dangling symlink), `assertSandboxFits`, `withSandbox` override, and that `js`/`js_reset`/`turn_ended` carry the state.
- **test/linux-sandbox-refusal.test.mjs:24-91** — `bwrapUserns`, the Linux scoped refusal, and the listing preflight.
- **test/runtime-launch.test.mjs:27-195, 543-556; runtime-linux-launch.test.mjs:33-84** assert the `CODEX_CLI_PATH`/`CODEX_HOME` env on both hosts and platforms.
- **test/serve-cli.test.mjs:113-116; repl-host/serve-own-host.test.mjs:29; repl-host/linux-native.test.mjs:46; profiles-inventory.test.mjs** assert `CODEX_HOME` in the launch and use the double.
- **test/runtime-manifest.test.mjs:91, 110, 140; runtime-doctor.test.mjs:131, 255-297; runtime-install/linux-install.test.mjs:34-36; runtime-chrome-component.test.mjs:104-112** assert the pin, the install tree, doctor and login.
- **test/runtime-login.test.mjs** (32 matches) covers `login.mjs`, which #79 removes.
- **test/fixtures/runtime-fixture.mjs:131-148** — `fakeCodexScript` is a double for the CLI.

**test/repl-parity**
- Inventory ids at inventory.json:5722-5795 (all M1, pin `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md#verification-and-acceptance`): `cell/confinement/{default,scoped,disabled,trusted-write-root-overlap,linux-fail-closed,no-unsandboxed-fallback}`.
- Probe code is `probe-boundary.mjs:54-67`, with `scenarios/boundaries.mjs:5-17`. The three mode probes run one cell that writes into `cwd` and to an outside path and connects to a local TCP port. They assert `{cwdWrite: mode!=='default', outsideWrite: mode==='disabled', network: mode==='disabled'}`.
- `trusted-write-root-overlap` expects `sandbox_conflict`. `linux-fail-closed` expects `sandbox_unavailable`, both with `launched=false`. `no-unsandboxed-fallback` uses a launcher that fails and expects the marker was not written.
- Related: security-departure.test.mjs and vendor-defects.test.mjs (the vendor's fail-open recorded as a departure), lifeline-sandbox-verdict.test.mjs, lifeline-linux-verdict.test.mjs.

**Native acceptance scripts (scripts/accept-native.mjs, scripts/probe-secrets.mjs, scripts/probe/trusted-roots.mjs, scripts/accept/linux-native.mjs)**
- **Item 7**, step `SANDBOX_SCOPED_STEP`, "sandbox scoped (default): trusted roots unwritable, run directory and $TMPDIR writable" (accept/lib.mjs:217). A cell tries `writeFileSync(root + '/<name>', …, {flag: 'wx'})` into each trusted root (`src/services`, `src/secrets`, `state/codex`, vendor modules), its run dir and `$TMPDIR`. PASS requires every root refused, the run dir written, `$TMPDIR` written (when granted), and no survivor files.
- `SANDBOX_DISABLED_STEP` (:218) is informational (INFO, never FAIL): records which roots a cell could write under `CUA_SHIM_SANDBOX=disabled`.
- Phase :220 includes "real serve (sandbox disabled): close".
- **There is no secret-store read-deny item in accept-native or probe-secrets.** Item 6/7 secret items concern substitution, fail-closed and value-leak scans. probe-secrets.mjs:28, 353-356 makes a store unreadable (mode 0000) only to test `secret_unreadable`, not sandbox denial.
- **No network assertion in accept-native.** Network denial is asserted only by repl-parity `probe-boundary` (above), mcp-sandbox/`README.md:1229`, and the 2026-10-06 Linux measurement. Linux acceptance runs `scripts/accept/linux-native.mjs` "with `CUA_SHIM_SANDBOX=scoped`" only as acceptance 11, where it is expected to fail.
- accept-native.mjs:231-232 (item 4) separately asserts the runtime's CODEX_HOME holds no auth file.

**Evidence documents**
- `docs/evidence/2026-10-06-linux-acceptance.md:174-200` (item 11): table of cell writes, TCP and unix connect under `scoped` with userns allowed (EROFS, EPERM, EPERM×3), `scoped` with userns restricted (written / connected: fail-open), and `disabled`.
- `docs/evidence/2026-10-14-own-repl-host-parity/m0..m5/` — oracle runs with the sandbox attested.
- m5-secret-substitution.md:43-46 — planting probe, live EPERM.
- 2026-10-05-browser-strategy-inputs.md:63.
- Spec Surprises at standalone spec :524.

**Latency measurements (no dedicated kernel-ready or sandbox-launch measurement exists)**
- `scripts/native-baseline*` — `scripts/native-baseline.mjs` plus scripts/native-baseline/*.mjs — records `cold.{miss,hit}.{initialize,tools_list,first_js,total}` and warm cells.
- **macOS vendor host, scoped (env has no `CUA_SHIM_SANDBOX`, so the default scoped applies), mini over ssh:** `docs/evidence/2026-10-14-native-baseline/summary.md` — `cold.miss.first_js` wall median 272.3 ms (p95 356.5), `cold.hit.first_js` 470.2 ms (530.1), `cold.hit.total` 1165 ms, `warm.noop` 21.5 ms, in-cell ≈0.02 ms. first_js there includes the first sandboxed kernel launch. The meta.json files do not record the sandbox mode, so this is inferred from the env and the default.
- **Linux, disabled (no launcher runs):** `docs/evidence/2026-10-14-own-repl-host-native/README.md:16-18` (vendor) and `m5-cua-bench/comparison.md` (vendor vs cua, 5 cold / 30 warm): `cold.miss.first_js` 640 vs 651.8 ms judged, `cold.hit.first_js` 755.3 vs 769.1 ms; limit is baseline + max(10%, 500 ms).
- **Comparison rule and harness** (native-baseline `compare.mjs`) are reusable for "before and after on the same Mac"; both use `CUA_REPL_HOST` explicitly.
- **Gap:** the M1 time-zone-hang rates are the only sandbox-start datum on macOS, and those measure a hang, not start time.