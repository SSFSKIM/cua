# #171 M6a pre-flight (draft for the design session)

- Spec: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, cited as `L<n>` (the spec at da7585c3).
  #117's spec, `…/2026-10-18-own-native-engine-design.md`, is cited as `N L<n>`. Code is cited as `file L<n>`, at
  da7585c3.
- Base: main da7585c3 (M5's squash, #489). Plugin 0.29.0. Engine 0.4.3 (`runtime/engine/linux-engine.json`),
  `MIN_ENGINE_VERSION` 0.4.3 (`src/services/engine/linux/client.mjs` L30). The Linux default is cua's engine
  (`src/runtime/launch.mjs` L461). main has no `runtime/modules/`, and #117's M4 to M6 are open (N L77–79), so M6a
  builds the ModuleTree.
- `V/` is the pinned vendor tree's module directory,
  `runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/`, as `cua install` placed it in the x64 VM's default home.
- This pre-flight ran no cua code, wrote to no cua home and touched no ticket. It read the code, read `V/`, and made
  read-only requests to the npm registry: metadata for seven packages, and the `classic-level` 3.0.0 tarball, whose
  members were listed and one hashed (`~/.local/share/cua-171/m6a-preflight/`). It has had no adversarial review.
- Loop tasks continue M5's numbering, from task 140. "T" numbers are this document's rows. The build's branch is
  `feat/171-m6a` from main.
- The plan below is written on the recommendations of §7. Each task says what a different ruling changes.

## 0. What the reading found

Ten findings shape the plan.

1. **The vendor module tree has two users, not one.** Cells resolve package imports from it
   (`src/runtime/launch.mjs` L295; `src/repl-host/kernel.mjs` L299–303). cua itself loads `classic-level` from it, in
   the CLI process, to map Chrome profile directories for `cua profiles bind` (`src/cli.mjs` L742;
   `src/profiles/directory-map.mjs` L31–33). Nothing else of cua's imports from it: the facade, the services and the
   host import no package (§1.3).
2. **With cua's engine, the module tree is the only vendor path a Linux launch names.** `buildLaunch` puts it in the
   trusted code paths and in `CUA_REPL_NODE_MODULE_DIRS` (launch.mjs L292, L295). The Node, the sandbox helper and the
   engine already come from cua's own resolvers (L602, L381, L510). The other vendor reads are in resolution: the
   pointer, the release's install record and eight `existsSync` calls (`src/runtime/manifest.mjs` L188–201;
   `src/runtime/checks.mjs` L13).
3. **The managed Node carries no npm.** `cua install` keeps only `bin/node` and the licence of the Node tarball
   (`src/runtime/node-install.mjs` L4; `src/runtime/managed-node.mjs` L12). The design text installs the ModuleTree
   with `npm ci --omit=dev` (N L204). Nothing cua pins could run it (F1).
4. **Three of the four parts already have a gate of their own, each naming `cua install`,** and each with a tolerance
   a strict "every part matches its pin" rule (L158) would end:
   - Node: `repl_host_node` (launch.mjs L615). Tolerates `CUA_NODE`, the user's own Node 24 and `cua install
     --no-node`.
   - Helper: `sandbox_unavailable` (`src/sandbox/linux.mjs` L88–103). Not asked for under `CUA_SHIM_SANDBOX=disabled`.
   - Engine: `engine_not_installed` (launch.mjs L524). Tolerates a local build (`cua engine build`),
     `CUA_LINUX_ENGINE_BIN` and any engine at or above `MIN_ENGINE_VERSION`.
   Only the module tree has no gate (F2).
5. **M5's fallback reads the vendor tree under the default.** With no usable engine of cua's, the default selection
   keeps the vendor's engine with a warning (launch.mjs L525, L529, L530; F5 and F5a of the M5 pre-flight), and the
   launch then takes `skyLinuxBin` and the vendor service from the tree (L327). L161 says an explicit
   `CUA_NATIVE_ENGINE=vendor` is the only thing that reads it. The gate's `fallback` part asserts the fallback
   (`scripts/linux-engine-gate/suites.sh` L191–200) (F3).
6. **`cua install` starts with the vendor archive and stops if it fails** (`src/cli.mjs` L178). An empty home would
   still need OpenAI's server to get a runtime that no longer uses it (F4).
7. **The update refuses every Linux session until `cua install` runs.** L159 says so: with the own parts absent,
   resolution refuses `runtime_not_installed` and never launches from the vendor tree, though that tree is intact.
   The plugin has no install step (`cua-shim.mjs` runs `cua serve` and nothing else) (F9).
8. **On Linux the sandbox needs no change.** The kernel's deny list there is `state/`, `remote/`, `chrome/` and
   `run/` (`src/sandbox/policy.mjs` L121–124), so `$CUA_HOME/modules/` is readable as `runtimes/` is. On macOS the
   whole home is denied and `runtimes/` and `node/` are re-exposed (L127): adding `modules/` there is #117 M6's, and it
   moves a sandbox fingerprint. M6a changes no macOS launch.
9. **ci-kit has no arm64 lane.** Its lanes are `hosted`, `hosted-macos`, `pool` and `mac` (ci-kit `plan/config.mjs`
   L13). No cua session has run on a hosted Linux runner: `.github/ci-kit.yml` L1–7 says the Ubuntu leg waits for
   #142. The arm64 acceptance needs a workflow of cua's own, as `linux-engine.yml` is (F8).
10. **The harnesses read the vendor tree through `resolveRuntime`.** On Linux: repl-parity's provenance runs
    `runtime.paths.node` (`scripts/repl-parity/provenance.mjs` L14), its engine judge takes
    `runtime().paths.skyLinuxBin` (`scripts/repl-parity/engine-answered.mjs` L128), native-baseline builds the
    runtime root from the pointer (`scripts/native-baseline/remote.mjs` L147–152), and the parity preparation's archive
    cache has no module tree (`scripts/repl-parity/archive-cache.mjs` L29–38) (T5).

## 1. The module inventory

### 1.1 Who names the tree

| Reader | Where | What it takes |
|---|---|---|
| Every Linux launch | launch.mjs L295: `CUA_REPL_NODE_MODULE_DIRS: p.moduleDir`; `p.moduleDir` is the pin's `cua_node/lib/node_modules` (`runtime/releases/26.928.40906-linux-x64.json` L24, `…-arm64.json` L24) | the directory, as a search base |
| The kernel | `src/repl-host/kernel.mjs` L299–303 adds each entry as a module search base; `src/repl-host/supervisor.mjs` L152, L174 adds it to both children's read paths | any bare specifier a cell imports resolves there, so every package in `V/` is importable today |
| The `js` tool's description | `src/repl-host/tools.mjs` L23: "Use dynamic imports such as `await import("playwright")`" | the one package cua's own text names |
| The trusted worker | launch.mjs L292 lists the tree as a trusted code path | with the vendor's engine, the vendor service and its imports (L327). With cua's engine, nothing |
| `cua profiles bind` | `src/cli.mjs` L742 passes `runtime.paths.moduleDir`; `src/profiles/directory-map.mjs` L31–33 requires `classic-level` from it | `classic-level`, in the CLI process, outside every sandbox |
| Doctor's `sandbox` row | `src/runtime/doctor.mjs` L330 | the path, as a protected one |

### 1.2 The packages

The vendor's own lockfile says which packages it chose and which only follow. Its root lists five public packages
(`V/.pnpm/lock.yaml` L27–41), `@oai/browser-desktop` lists `classic-level` (L43–47) and `@oai/sky` lists
`@statsig/js-client` (L55–59). N L204 names the same six for the ModuleTree. Versions below are `V/`'s, each read from
its `package.json`.

| Package | Version | Why it is there | Native code | x64 | arm64 |
|---|---|---|---|---|---|
| `playwright` | 1.57.0 | root dependency (lock L33–35); tools.mjs L23 | none; it ships no browser | – | – |
| `playwright-core` | 1.57.0 | `playwright`'s (L312) | none | – | – |
| `sharp` | 0.35.4 | root (L39–41) | none itself; no install script (registry) | – | – |
| `@img/sharp-linux-<arch>` | 0.35.4 | `sharp`'s optional, one per target | a `.node` addon | `V/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.4.node`, 415,112 bytes | lock L145–150: `cpu: [arm64]`, `os: [linux]`, `libc: [glibc]`; the registry has it, with the lock's integrity. Skipped on x64 (`V/.modules.yaml` L126) |
| `@img/sharp-libvips-linux-<arch>` | 1.3.3 | the addon's library; LGPL-3.0-or-later | `libvips-cpp.so` | `V/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6`, 18,621,496 bytes | lock L97–101, glibc; the registry has it, with the lock's integrity |
| `@img/colour`, `detect-libc`, `semver` | 1.1.0, 2.1.2, 7.8.5 | `sharp`'s | none | – | – |
| `pngjs` | 7.0.0 | root (L36–38) | none | – | – |
| `jpeg-js` | 0.4.4 | root (L27–29) | none | – | – |
| `pixelmatch` | 7.1.0 | root (L30–32) | none | – | – |
| `classic-level` | 3.0.0 | `@oai/browser-desktop`'s (L43–47); cua's profile map (§1.1) | N-API prebuilds in the one tarball; `install: node-gyp-build`, which builds only where no prebuild fits | `prebuilds/linux-x64/classic-level.node`, 480,800 bytes, sha256 `48843c73…`: `V/`'s file and the npm tarball's member are the same bytes | `prebuilds/linux-arm64/classic-level.armv8.node`, 452,056 bytes, in the npm tarball. `V/` on x64 was pruned to its own target |
| `abstract-level`, `module-error`, `napi-macros`, `node-gyp-build` | 3.1.1, 1.0.2, 2.2.2, 4.8.4 | `classic-level`'s | none | – | – |
| `buffer`, `base64-js`, `ieee754`, `is-buffer`, `level-supports`, `level-transcoder`, `maybe-combine-errors` | 6.0.3, 1.5.1, 1.2.1, 2.0.5, 6.2.0, 1.0.1, 1.0.0 | `abstract-level`'s, and `buffer`'s two | none | – | – |

That is 23 packages on one architecture, about 40 MB unpacked (`V/` is 69 MB, of which `@oai` is 28 MB). Native code
is in three of them, and each has a published build for linux-x64 and linux-arm64 on glibc. Nothing compiles at
install on either.

**Not carried into the ModuleTree** (F6):

| Package | Version | Why not |
|---|---|---|
| `@oai/browser-desktop`, `@oai/cua`, `@oai/cua-repl`, `@oai/sky` | 0.1.1, 0.2.5, 0.1.0, 0.7.5 | OpenAI's own code, workspace packages of its build (lock L12–26). The lock also names `@oai/cdp-browser-backend`, which is not in `V/` |
| `@statsig/js-client`, `@statsig/client-core` | 3.33.3 | the vendor service's telemetry client (lock L55–59) |
| `corepack` | 0.36.0 | the vendor Node's own tool |

### 1.3 What cua's own code imports

Nothing but `classic-level`. The bare imports in `src/`, outside the vendored parsers, are `ws`
(`src/remote/relay-link.mjs`, from the checkout's own `node_modules`) and the sentence in tools.mjs L23. The dynamic
imports in `src/cua-api/`, `src/repl-host/`, `src/services/` and `src/browser-service/` are `node:` built-ins and
relative files (`src/cua-api/display.mjs` L34–35; `src/cua-api/create-tinysky-alt.mjs` L106).

## 2. The Linux runtime record

**Where it lives:** `runtime/linux-runtime.json`, beside `runtime/releases/` (L342), named in `package.json`'s
`files` with `runtime/modules/`. It cannot sit inside `runtime/releases/`: `loadPins` parses every `.json` there as an
archive pin (manifest.mjs L134–143).

```json
{
  "schema": 1,
  "platform": "linux",
  "modules": {"lock": "<sha256 of runtime/modules/package-lock.json, 64 hex>"},
  "node": {"version": "24.22.0"},
  "sandbox": {"upstreamTag": "rust-v0.163.0"},
  "engine": {"version": "0.4.3"}
}
```

**How it is parsed** (`parseLinuxRuntime`, in manifest.mjs, as strictly as `parsePin`, L81):

- exactly these keys at each level; an unknown or missing one is `invalid_pin`;
- `schema` 1, `platform` `linux`;
- `modules.lock` 64 lowercase hex; `node.version` `<n>.<n>.<n>` at or above `NODE_FLOOR`; `sandbox.upstreamTag`
  `rust-v<n>.<n>.<n>` (the helper pin's form, `src/sandbox/linux.mjs` L42); `engine.version` the engine pin's form
  (`src/runtime/linux-engine.mjs` L30).

**How it is bound to the four pins** (`loadLinuxRuntime`, for a host's architecture). Each field must equal its pin, or
the load is `invalid_pin` naming both files and both values:

| Field | Its pin |
|---|---|
| `modules.lock` | the SHA-256 of `runtime/modules/package-lock.json`'s bytes |
| `node.version` | `selectNodePin(loadNodePins(), host).version` (`runtime/releases/node/`) |
| `sandbox.upstreamTag` | `loadHelperPin().upstreamTag` (`runtime/sandbox/linux-sandbox.json`) |
| `engine.version` | `loadEnginePin().version` (`runtime/engine/linux-engine.json`) |

The four values repeat what the pins say, so two things keep them from drifting: a unit test over the checked-in
files, and `scripts/linux-engine-pin.mjs`, which rewrites `engine.version` in the record when it rewrites the pin
(L95 of the script), so an engine release stays one command (C2).

**The derived release name** (`linuxRelease(record, arch)`):

    cua-linux-<arch>-e<engine.version>-n<node.version>-s<upstreamTag without "rust-v">-m<first 12 hex of modules.lock>

Today: `cua-linux-x64-e0.4.3-n24.22.0-s0.163.0-m<12 hex>`. It is one path segment of letters, digits, dots and
dashes, since it names the handshake directory (`src/mcp/connection.mjs` L145). It cannot be mistaken for a vendor
name, which starts with digits (manifest.mjs L87–91). It is read at sight in `current.json`, in doctor and in evidence,
where a digest would need a lookup. A change to any of the four fields changes it (L157).

**What the name means:** this cua's definition of the Linux runtime. What a home holds is told apart from it by doctor
(§4.3), since a session may run on a part that is not the pin (F2).

## 3. Resolution and launch

### 3.1 `src/runtime/manifest.mjs`

| Change | Detail |
|---|---|
| New exports | `LINUX_RUNTIME_FILE`, `parseLinuxRuntime`, `loadLinuxRuntime`, `linuxRelease`, `vendorLinuxRuntime` |
| `locateRuntime` (L186–195) | A Linux host takes a new branch before `readPointer` (L188). It loads the record, derives the release, and reads the module tree's install record (`readModuleTree`, T1). Absent or not this lock's: `runtime_not_installed`, "cua's Linux runtime `<release>` is not installed in `<home>`: its module tree `<dir>` is missing", hint "run `cua install`". **The pointer is not read**: on Linux it records what `cua install` last completed and selects nothing (§4.2). A `release` argument other than the derived name is `unknown_release` |
| `resolveRuntime` (L199–204) | On Linux, `locateRuntime`, then `checkModuleTree` (T1): each package the lock names for this host has its `package.json`. A gap is `layout_invalid` with the recovery hint (stop the sessions using it, remove `modules/<lock>`, run `cua install`). Structure only, as `checkLayout` is for an archive (L197–198) |
| What both return on Linux | `{release, home, root: <home>/modules/<lock>, paths: {moduleDir: <root>/node_modules}, manifest: {platform: 'linux', arch, release, parts: <the record>}, record: <the tree's install record>}`. `manifest.platform` and `manifest.arch` keep their readers unchanged: launch.mjs L267, L273, L286, L297, L314; connection.mjs L112, L123; `src/profiles/inventory.mjs` L149 |
| `vendorLinuxRuntime({home, pins, host})` | The vendor tree, for the vendor selection only: `selectPin` (L150), the release's directory, `readInstalledRecord` (L173), `checkLayout`. It returns `{release, root, paths}` as `runtimeFor` does today (L167), or throws `release_not_installed`. Never reached through the pointer |
| `installHint` (L37) | On Linux: "run `cua install`". The `--archive <ChatGPT deb>` hint stays for the vendor tree's own errors |
| The darwin path | Unchanged, by test: the same pin, pointer, record and layout checks |

`LINUX_LAYOUT_KEYS` (L34) and the Linux archive pins stay until M6b (L164).

### 3.2 `src/mcp/connection.mjs`

No functional change. `resolveRuntime({home, host})` (L73) now returns the own record on Linux. `runtime.release`
(L145–146) is the derived name, so the first connection after any part changes records its handshake afresh. The
vendor tree reaches a launch only inside the connection's selection (`replHostFor`, L112), resolved once at the open,
so an idle relaunch uses the same tree. The header's first paragraph (L4–5) is reworded.

### 3.3 `src/runtime/launch.mjs`

| Where | Today | After |
|---|---|---|
| `linuxEngineFor` (L510–533), vendor selected (L512) | returns `{engine: 'vendor'}` and checks nothing | resolves the tree through a `vendor` seam (default `vendorLinuxRuntime` for `home` and the host's architecture) and carries `vendor: {release, bin, service, moduleDir}`. Tree absent or damaged: `engine_not_installed`, "`CUA_NATIVE_ENGINE=vendor` selects the vendor's engine, and its release `<release>` is not installed in `<home>`: run `cua install`, or unset `CUA_NATIVE_ENGINE` for cua's own engine" (the `engine.json` wording for a `settings` selection) |
| `linuxEngineFor`, the default with no usable engine (L525, L529, L530) | the vendor's engine, status `warn` | refused: `engine_not_installed`, `engine_unrecorded` or `engine_outdated`, each naming `cua install --engine` (F3). An explicit selection is unchanged |
| `buildLaunch`, the trusted code paths (L292) | the vendor module tree, on every launch | on Linux: cua's own code only. With the vendor's engine, also `vendor.moduleDir`, which that service imports from. The ModuleTree is not trusted code: nothing trusted imports from it. darwin unchanged |
| `buildLaunch`, `CUA_REPL_NODE_MODULE_DIRS` (L295) | `p.moduleDir`, the vendor's | the same expression, now the ModuleTree's, under either engine (F5) |
| `buildLaunch`, the vendor engine's environment (L327) | `p.skyLinuxBin`, `p.skyVendorService` | `replHost.engine.vendor.bin`, `.service`. A vendor selection without `vendor` is a `TypeError`, as a `cua` host without its Node is (L270) |
| The launch record (L347–352) | `managedNodeRoot`, `stagingRoot`, `sandboxHelperRoot`, `engineRoot` | also `modulesRoot`, `<home>/modules`, which `protectedPaths` guards (`src/runtime/sandbox.mjs` L104, L241–243; doctor.mjs L330) |
| `nativeEngineFor` (L490) | – | takes `arch` (default `process.arch`) for the vendor pin |
| The header (L1–3, L59–61, L151–152) | describes the vendor tree | describes both |

Unchanged: `replHostFor` (L412), `ownHostNode` (L602), `linuxSandboxEnv` (L381), `desktopModeFor` (L551), and every
darwin branch.

**Browser-only sessions.** `replHostFor` asks for an engine only with the computer surface (L421), so a browser-only
launch resolves the record, the Node and the helper's path, and names the ModuleTree. It needs no engine and no vendor
tree, and it opens with `CUA_NATIVE_ENGINE=vendor` set and the tree absent.

**What a Linux launch names, before and after:**

| Input | Today | After M6a |
|---|---|---|
| The release | the pointer's vendor release (manifest.mjs L188) | derived from the record |
| The module search base | `runtimes/<release>/cua_node/lib/node_modules` | `modules/<lock>/node_modules` |
| Trusted code | cua's, and the vendor tree | cua's; the vendor tree only with the vendor's engine |
| Node, helper | cua's resolvers | unchanged |
| The engine | cua's; the vendor's when selected, or when the default finds none usable | cua's; the vendor's only when selected |
| `classic-level` for `cua profiles bind` | the vendor tree | the ModuleTree (cli.mjs L742, the same expression) |

### 3.4 Which part refuses what (F2)

| Part | Checked by | When it is missing | Names |
|---|---|---|---|
| The module tree | `resolveRuntime` (new) | `runtime_not_installed` | `cua install` |
| Node | `ownHostNode`, launch.mjs L602–616 (unchanged) | `repl_host_node` | `cua install`, `CUA_NODE` |
| The sandbox helper | `assertSandboxConfines`, sandbox.mjs L280; `verifyHelper`, linux.mjs L88 (unchanged) | `sandbox_unavailable` | `cua install` |
| cua's engine, computer sessions | `linuxEngineFor` (§3.3) | `engine_not_installed`, `engine_outdated`, `engine_unrecorded` | `cua install --engine` |
| The vendor tree, vendor selection only | `linuxEngineFor` (§3.3) | `engine_not_installed` | `cua install` |

## 4. Install and migration

### 4.1 `cua install` on Linux

The order changes so that an empty home reaches a working runtime without the vendor's server (F4).

| # | Step | Today (cli.mjs) | After |
|---|---|---|---|
| 1 | The record | – | `loadLinuxRuntime`, first. A checkout whose record and pins disagree refuses before anything is fetched |
| 2 | The module tree | – | `installModuleTree` (T1) into `modules/<lock>/`. Required |
| 3 | The sandbox helper | L195, required | unchanged |
| 4 | The engine | L211; required only with `--engine` | required: the default computer session needs it. `--engine` keeps its meaning |
| 5 | Node | L236, required unless `--no-node` | unchanged |
| 6 | The pointer | written by the vendor step (`activate`, `src/runtime/install.mjs` L179) | written here, to the derived name, once steps 2 to 5 have finished. A failed step leaves it as it was |
| 7 | The vendor tree | L178, first, and fatal | last, kept for `CUA_NATIVE_ENGINE=vendor` until M6b. `installRuntime` takes an option not to activate. A failure is said in one line and does not fail the command, unless `--archive` or `--release` asked for the tree |
| 8 | The Codex CLI's leftovers | L183–190 | unchanged, after step 7 |

- `--json` on Linux: `{ok, release: <derived>, changed, modules, sandboxHelper, engine, node, vendor: {release, root,
  changed, source} | {failed}}`. `deploy/cloud-vm/cua-provision.sh` L325 prints `source`, which moves under `vendor`:
  its `jq` line and `test/deploy-cloud-vm.test.mjs` follow.
- macOS: `cua install` is unchanged, by test.

**The module tree's install** (T1; F1). The lockfile is the pin: each package entry carries its registry URL and its
SHA-512.

- Each tarball the lock names for this host (`os`, `cpu`, and `libc` where the lock has it) is fetched from its
  `resolved` URL into staging and checked against its `integrity` before anything reads it.
- It is unpacked with `tar` to the path the lock's key names. `tar` and `gzip` are what the Node step already needs
  (node-install.mjs L32). No npm runs and no package script runs.
- `install.json` is written (`{schema, lock, platform, arch, packages, source, installedAt}`), and the tree moves into
  place with one rename (`moveIntoPlace`, install.mjs L193).
- A verified tree makes the step a no-op. A damaged one is refused with the recovery hint and never repaired in
  place, since a running session may be importing from it. A path cua did not install is `target_occupied`.
- `--modules-dir <dir>` takes local copies of the tarballs, each still checked, as `--node-archive` and
  `--sandbox-helper` do for their parts. The parity preparation's cache uses it (T5).

### 4.2 The pointer

- **It records; it does not select.** Linux has one runtime per cua, the one its record derives. Resolution never
  reads `current.json` (§3.1), so a pointer that names a vendor release, another cua's own release or nothing at all
  changes no session.
- **Migration.** `cua install` rewrites a pointer that names a vendor Linux release to the derived name (step 6). The
  vendor tree is left as it is.
- **Until then** (L159): a home whose module tree is installed resolves the own record. One whose tree is not is
  refused `runtime_not_installed` naming `cua install`, with the vendor tree intact or not.
- **`cua runtime use <release>` on Linux** (cli.mjs L266; install.mjs L150): the derived name checks the tree again and
  rewrites the pointer. A vendor release is refused, naming `CUA_NATIVE_ENGINE=vendor` as the way to that engine.
- **An older cua on the same home** reads the pointer as a vendor release and fails `unknown_release` on the derived
  name. Its own `cua install` puts its name back (install.mjs L85, L179–188), and the M6a cua is not affected, since it
  does not read the pointer. The pull request says so (C5).

### 4.3 Doctor and checks rows

`src/runtime/checks.mjs` gains `checkModuleTree`. Doctor's Linux rows (`src/runtime/doctor.mjs` L128–165):

| Row | Today on Linux | After |
|---|---|---|
| `platform` | the vendor pin for the host (L132–133) | "linux-`<arch>`: cua's own runtime `<release>`", from the record. An `invalid_pin` fails it |
| `runtime.installed` | the pointer's vendor release and its root (L142–143) | `pass`: the tree is installed and the pointer names this release. `warn`: sessions resolve, and the pointer names a vendor release or another own release ("run `cua install`"). `fail`: `runtime_not_installed` |
| `runtime.modules` (new) | – | the tree against the lock: every package present at its locked version. `fail` names the first few that are not |
| `runtime.node` (new) | – | the record's Node against `$CUA_HOME/node`: `pass` when the pinned one is installed and active, `warn` when sessions run on another (`repl.host` says which) |
| `sandbox.launcher` | the pinned helper (L108–116) | unchanged: it is the helper part's row |
| `engine` | cua's engine against its pin; the fallback as `warn` (`src/runtime/doctor-engine.mjs` L228–230) | the same facts; the three default cases are `fail` with the refusal's sentence (F3); a vendor selection whose tree is absent is `fail` |
| `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc`, `runtime.signatures` | the vendor tree (L149–165) | one row, `runtime.vendor`: `pass` when the tree is installed and verifies ("kept for `CUA_NATIVE_ENGINE=vendor`"), `skip` when it is absent, `fail` when it is damaged. M6b deletes it (L206) |
| `sandbox` | protects the vendor module tree (L330) | protects the ModuleTree and `modules/` |

`report.runtime` becomes `{release, root, paths, parts}`. macOS's rows are unchanged.

## 5. Tests and acceptance 12

### 5.1 Unit tests

They run in the `test` gate on hosted macOS, with a Linux host injected, as today's Linux tests do. Every installer
takes a fake `fetch`. `fakeInstalledHome` (`test/fixtures/installed-home.mjs` L25) lays down a module tree and its
record for a Linux host, so the existing Linux-host tests keep resolving.

| Row | Expect | File |
|---|---|---|
| The lock: version 3; every entry's version and integrity equal §1.2's table; each `@img` Linux entry carries what the host filter reads | pass | `test/runtime-module-tree.test.mjs` (new) |
| Install into an empty home, x64 and arm64: the right `@img` pair, `classic-level` with both prebuilds, 23 packages | placed, recorded, `changed: true` | same |
| A tarball whose bytes differ from its integrity | refused before unpacking; nothing placed; staging removed | same |
| A second install; a damaged tree; a foreign directory at the path | no-op; refused, not repaired; `target_occupied` | same |
| The record: each unknown, missing or malformed field | `invalid_pin` | `test/runtime-linux-record.test.mjs` (new) |
| The record against each of the four pins, one moved at a time | `invalid_pin` naming both | same |
| The checked-in record equals the checked-in pins | pass | same |
| The release name: stable; changes with each field; carries the architecture; one safe path segment | pass | same |
| `linux-engine-pin.mjs` rewrites the record's engine version with the pin | pass | `test/linux-engine-pin.test.mjs` |
| No pointer, no tree | `runtime_not_installed` naming `cua install` | `test/runtime-manifest.test.mjs` |
| Pointer names the vendor release, vendor tree intact, no module tree | `runtime_not_installed`; nothing under `runtimes/` is read | same |
| Pointer names the vendor release, vendor tree gone, own parts installed (L162) | resolves the own record | same |
| Pointer absent, unreadable, or another own name; tree installed | resolves | same |
| A package missing from the tree | `layout_invalid` with the recovery hint | same |
| darwin: locate and resolve | as before | same |
| A Linux computer launch on cua's engine | no value of its environment, no trusted code path and no root in the launch record lies under `runtimes/`; the module base is the ModuleTree | `test/runtime-linux-launch.test.mjs` |
| A browser-only launch with no engine installed and no vendor tree | builds; names Node, the ModuleTree and the helper only | same |
| The vendor selection, tree installed | `OAI_SKY_LINUX_BIN`, the vendor service, the vendor `node_modules` trusted; the module base still the ModuleTree | same; `test/linux-secrets.test.mjs` |
| The vendor selection, tree absent, by environment and by `engine.json` | `engine_not_installed` naming `cua install` | `test/runtime-linux-engine-selection.test.mjs` |
| The default with no engine, an older one, an unrecorded one | each refused, naming `cua install --engine` (F3) | same; the oracle, `scripts/repl-parity/selection.mjs` L51–57 and its test |
| A scoped launch whose run directory overlaps `modules/` | `sandbox_conflict` | `test/mcp-sandbox.test.mjs` |
| `cua install` in an empty home | steps in §4.1's order; pointer the derived name | `test/cli.test.mjs`, `test/runtime-linux-install.test.mjs` |
| `cua install` over a vendor pointer | pointer rewritten; vendor tree untouched | same |
| The vendor step fails | exit 0, the line said, own runtime active; with `--archive`, the command fails | same |
| The module step fails | the command fails; the pointer is as it was | same |
| macOS `cua install` | unchanged | `test/runtime-install.test.mjs` |
| Doctor: each row of §4.3 in each status | pass | `test/runtime-linux-doctor.test.mjs`, `test/doctor-engine-linux.test.mjs` |
| `cua profiles bind` loads `classic-level` from the ModuleTree | pass | `test/profiles-commands.test.mjs` |
| `npm pack` carries `runtime/modules/` and the record | pass | `test/package-contents.test.mjs` |

### 5.2 Acceptance 12, live

One driver runs it on either venue: `scripts/accept/linux-runtime.mjs` (T6). Every home is the run's: `HOME`, the XDG
directories, an empty `claude-secrets` and `CUA_HOME`, as M5 ran (its pre-flight, §1.1). Every window is a harness
window.

- **The computer session** is `scripts/accept/linux-native.mjs --selection default`, which is items 1 and 6 (L192,
  L199): it binds a harness gedit, types, reads the text back and takes a screenshot, under the 50 ms sampler
  (`scripts/linux-engine-gate/engine-watch.mjs`).
- **The browser-only session** is a new fixture, `scripts/accept/linux-browser-only.mjs` (F7), over `cua serve` with
  `CUA_SHIM_SURFACES=browser`:
  - the handshake and the tool list;
  - a cell that imports each of the six packages by name and reports its version and where it resolved;
  - `sharp` resizing an image `pngjs` made, and `classic-level` writing and reading a key in the session's temp, which
    load each architecture's native code inside the sandbox;
  - `profiles_list` answering; the kernel confined; `end_task`; no run entry left.
- **The profile map's loader**, outside any session: `loadClassicLevel` on the resolved module directory opens a
  store, writes a key and reads it back, as `test/fixtures/classic-level.mjs` does.

| Cell | Home | State | Step | Passing means |
|---|---|---|---|---|
| E0 | empty | – | `cua install` at the head | Exit 0. The tree, helper, engine and Node placed. The pointer is the derived name. `cua doctor --json` is ok: `runtime.installed`, `runtime.modules` and `runtime.node` pass; `engine` shows the pinned version, the pin's hash and service `cua` |
| E1 | E | vendor tree present | the computer session | Every step passes. No `sky_linux` at any sample. The engine child is the home's `cua-engine`. No value in the supervisor's environment (`/proc/<pid>/environ`) lies under `runtimes/` |
| E2 | E | present | the browser-only session; the loader | Every step passes. Each import resolved under `modules/<lock>/`. No engine process at any sample |
| E3 | E | `runtimes/` moved out of the home | E1 and E2 again | as E1 and E2 |
| E4 | E | moved out | a computer session with `CUA_NATIVE_ENGINE=vendor`, then with `"engine": "vendor"` | The open is refused `engine_not_installed`, naming `cua install`. Nothing is launched. Doctor's `engine` row fails with the sentence. A browser-only session with the variable set still passes |
| E5 | E | moved back | the vendor selection: list the apps, bind a harness gedit, read its tree; no input (M5's fallback observation) | The engine child is this home's `sky_linux_<arch>`, behind the vendor service, and no `cua-engine` runs. A cell's import still resolves under `modules/<lock>/`. This is the rollback (L340) |
| U0 | upgraded | installed by the cua before M6a (da7585c3) | at the head, before `cua install`: a session | Refused `runtime_not_installed` naming `cua install`, with the vendor tree intact. Doctor says the same |
| U1 | U | – | `cua install` at the head | The pointer goes from the vendor name to the derived one, both recorded. The tree is placed; helper, engine and Node are `changed: false`. The vendor tree's `install.json` is the same file |
| U2 | U | `runtimes/` removed | E1 and E2 | as E1 and E2 |
| U3 | U | removed | E4 | as E4 |
| U4 | U | removed, and the pointer set back to the vendor name | E1 and E2 | as E1 and E2: L162's state, live |

**Measured and reported, not judged:** the module step's time and bytes on each architecture; `modules/<lock>`'s size;
and the time from `cua serve`'s start to the first cell's answer, 20 samples in E against 20 in a home of the cua
before M6a. Resolution now reads one record, four pins and a lockfile's hash where it read one pin directory: a
difference above about 50 ms is a finding for the design session.

**Venues.**

- **x64: this machine's private displays** (`scripts/linux-engine-gate/display.mjs`: Xvfb, Openbox), each step under
  the host lock, at the frozen head. The counted x64 evidence is this run.
- **arm64: GitHub's hosted `ubuntu-24.04-arm` runner, under Xvfb,** in a workflow of cua's own,
  `.github/workflows/linux-runtime.yml` (T6; F8):
  - `workflow_dispatch` with the commit, which must be the head of the ref it is dispatched on, as `linux-engine.yml`
    requires. A push of the file registers it from the branch.
  - Two legs, `ubuntu-24.04` and `ubuntu-24.04-arm`. The x64 leg is the arm64 leg's control: one recipe on both, so a
    failure on arm64 alone is the architecture's and a failure on both is the recipe's.
  - Setup: `xvfb`, `dbus`, `at-spi2-core`, `openbox`, `gedit`, `zenity`, `bubblewrap`, and `binutils` with `xz-utils`
    for the deb. Then the user-namespace remedy doctor names (`src/runtime/linux-desktop.mjs` L130).
  - Before any cell: `cua doctor`'s `display`, `accessibility.bus`, `accessibility.enabled` and `sandbox.userns` rows
    must pass (L64–71 of that file).
  - The upgraded home is installed by a second worktree at da7585c3, which fetches the pinned arm64 deb from the
    vendor's URL (F8).
  - The log and the artifact carry labels, outcomes, counts and scratch paths, as `sandbox-live`'s do.
- Neither venue needs a `:0` sitting.

**Regression on x64, at the same head.** `launch.mjs` is what every facade suite launches through (the M5
pre-flight, §8.1), so:

- R1 (repl-parity's native suite on both engine lanes; its vendor lane runs the rollback through the real facade);
- R3 and R4 in the default selection;
- the `fallback` part in its new form (T5).

R2 is not rerun: it judges the engine's in-cell time, and M6a changes neither the engine nor the service.

**Gates.** `ci-gate` on the head: `test`, `plugin`, `sandbox-live` and the rest GREEN (L217–218).

**Evidence:** `docs/evidence/2026-10-28-own-linux-engine/m6a/{x64,arm64}/`, each cell's report, the head's SHA, and for
arm64 the run's id and its artifact.

**What could cut it,** most likely first:

1. The hosted runner: bubblewrap's user namespace under Ubuntu 24.04's AppArmor rule, or gedit's tree under Xvfb with
   a bare session bus. The venue is piloted in wave 0, on main, before any M6a code exists (§6).
2. A native package that loads from the vendor tree and not from the ModuleTree inside the sandbox. By reading, the
   rules are the same (§0, finding 8).
3. A harness path that still reaches the vendor tree through `resolveRuntime` (finding 10), found by R1.
4. The registry: 23 requests an install, where the other parts make one each.

## 6. The tasks

| T | Scope | Touches | Consumes | Produces, and its proof |
|---|---|---|---|---|
| T1 | **The ModuleTree.** `runtime/modules/package.json` with the six packages at exact versions and `overrides` holding the rest at §1.2's; its lockfile, version 3, written by an npm that records `libc`. The lock's reader, the host filter, the installer, the tree's record and its structure check (§4.1). `homeLayout` gains `modules` | `runtime/modules/`, `src/runtime/module-tree.mjs` (new), `src/runtime/layout.mjs`, `src/runtime/install.mjs` (the SHA-512 check), `package.json` (`files`), `test/runtime-module-tree.test.mjs`, `test/package-contents.test.mjs` | – | **ModuleTree**, which #117 M6 reuses: `loadModuleLock() → {hash, packages}`, `installModuleTree({home, lock, host, fetch, tools, dir}) → {root, moduleDir, lock, changed}`, `readModuleTree(home, lock, host)`, `checkModuleTree(root, lock, host)`. Failing-first tests for §5.1's first four rows, on a fixture registry. **If F1 is ruled for `npm ci`:** the installer's body runs it with `--ignore-scripts` through an injected `run`, and the tarball rows become rows about its arguments and a missing npm |
| T2 | **The record and resolution** (§2, §3.1). `fakeInstalledHome` for a Linux host. `linux-engine-pin.mjs` writes the record's engine version | `runtime/linux-runtime.json`, `src/runtime/manifest.mjs`, `src/runtime/checks.mjs`, `scripts/linux-engine-pin.mjs`, `test/runtime-linux-record.test.mjs`, `test/runtime-manifest.test.mjs`, `test/linux-engine-pin.test.mjs`, `test/fixtures/` | T1 | `loadLinuxRuntime`, `linuxRelease`, `vendorLinuxRuntime`; Linux `locateRuntime` and `resolveRuntime`. §5.1's record, name and resolution rows; darwin unchanged. **If F2 is ruled strict:** resolution also requires the pinned Node, helper and engine, with the exemptions the ruling names |
| T3 | **Launch and selection** (§3.2–3.4) | `src/runtime/launch.mjs`, `src/runtime/sandbox.mjs`, `src/mcp/connection.mjs` (its header), `scripts/repl-parity/selection.mjs`, `test/runtime-linux-launch.test.mjs`, `test/runtime-linux-engine-selection.test.mjs`, `test/linux-secrets.test.mjs`, `test/services-sky-linux-launch.test.mjs`, `test/mcp-sandbox.test.mjs`, `test/repl-parity/selection-oracle.test.mjs` | T2 | §5.1's launch and selection rows. Every darwin row of `test/runtime-launch.test.mjs` unchanged. **If F3 is ruled to keep the fallback:** the three default cases take the vendor tree when it is installed and refuse when it is not |
| T4 | **Install, migration, doctor** (§4) | `src/cli.mjs` (install, `runtime use`), `src/runtime/install.mjs`, `src/runtime/doctor.mjs`, `src/runtime/doctor-engine.mjs`, `deploy/cloud-vm/cua-provision.sh`, `test/cli.test.mjs`, `test/runtime-linux-install.test.mjs`, `test/runtime-linux-doctor.test.mjs`, `test/doctor-engine-linux.test.mjs`, `test/deploy-cloud-vm.test.mjs`, `test/profiles-commands.test.mjs` | T1, T2; §3.3's refusal codes, which T3 builds beside it | §5.1's install and doctor rows. macOS install and doctor unchanged |
| T5 | **The harnesses follow.** repl-parity: the provenance's Node (the managed one on Linux), the engine judge's vendor path through `vendorLinuxRuntime`, the archive cache's module tarballs and `--modules-dir`. native-baseline: the runtime root. The `fallback` part: the five shaped homes now expect the refusal, by doctor and by a refused open, with no session. Whatever reads `cua install --json`'s `release`, `root` or `source` | `scripts/repl-parity/{provenance,engine-answered,archive-cache}.mjs`, `scripts/native-baseline/remote.mjs`, `scripts/linux-engine-gate/suites.sh`, `scripts/accept/{linux-fallback,linux-selection}.mjs`, `scripts/probe-secrets.mjs` (a label), `test/repl-parity/`, `test/native-baseline/`, `test/accept-linux-selection.test.mjs` | T3, T4 | Tests for each. R1 run once on x64 as a development run. Reviewed for false greens first, as every harness change since M4 |
| T6 | **The driver, the fixture and the workflow** (§5.2). In wave 0: the workflow and the venue pilot, on main, with today's `cua install` and `linux-native.mjs --selection default` on both legs. Then the driver and the browser-only fixture, piloted on both venues | `scripts/accept/{linux-runtime,linux-browser-only}.mjs`, `.github/workflows/linux-runtime.yml`, `test/accept-linux-runtime.test.mjs`, `test/accept-scripts-load.test.mjs` | F8's ruling for the pilot; T4 for the driver | The venue pilot's report: which of doctor's four rows pass on each leg, and what the recipe needed. The driver's pure parts by test. A pilot of every cell on both venues |
| T7 | **Docs and the bump.** README's Linux part (L1086–1110 of the README: the two engines, what `cua install` places, that the update needs one `cua install`), its Install and Configuration parts and its licence note; `deploy/cloud-vm/README.md`; the plugin's description and 0.29.0 to 0.30.0 | `README.md`, `deploy/cloud-vm/README.md`, `.claude-plugin/plugin.json` | – | Each sentence checked against the code at the head. The bump under L218's conditions |
| T8 | **Acceptance 12, counted** (§5.2), at the frozen head on both venues, with the x64 regression | evidence `m6a/` | the frozen head: T1–T6 | Every cell passes by the driver's own judge. `m6a/README.md` with the cell table, the SHA and the arm64 run's id |
| T9 | **Close-out.** The spec folded: Progress, a Decision Log entry for each ruling of §7, Surprises, Outcomes. A line in #117's spec that the ModuleTree landed here, with any departure from N L204. The whole-branch review by `doperpowers:reviewer-high` (L217). `ci-gate`. The pull request, its body listing every macOS-visible change and the one-time `cua install` | the two specs, the report | T7, T8 | The review clean. `ci-gate` GREEN with `test` and `sandbox-live` among those that ran. `MERGEABLE` |

**Order.** Each task is reviewed clean before what consumes it runs.

| Wave | Tasks | Notes |
|---|---|---|
| 0 | T1; T6's workflow and venue pilot; T7's draft | The pilot needs F8's ruling, since today's install fetches the deb. It tells on day one whether a computer session runs on the hosted runner at all |
| 1 | T2 | |
| 2 | T3 and T4, each in its own worktree | They share no file. T3 merges first |
| 3 | T5; T6's driver and its pilots | at wave 2's reviewed tip |
| 4 | the pilots' fixes, reviewed; the head frozen as H and pushed | |
| 5 | T8 at H: x64 here, arm64 by dispatch | A fix after the freeze follows the M5 pre-flight's §8.1 |
| 6 | T9 | |

**Timeline,** from the approval of this pre-flight, on M5's costs for tasks of these sizes:

| Task | Hours |
|---|---|
| T1 | 6–10 |
| T2 | 5–8 |
| T3 | 6–10 |
| T4 | 8–12 |
| T5 | 6–10 |
| T6 | 8–12, with the pilots |
| T7 | 3–5 |
| T8 | about 2 of machine time on x64 (the cells about 30 minutes; R1, R3 and R4 are planned at 40, 5 and 3); about 30 minutes for the dispatched run |
| T9 | 6–10 |

About two and a half days to the pull request with no cut. Plan for one fix round from the hosted pilot: three to
three and a half. Not counted: usage stops, and the hosted macOS queue for `ci-gate`.

## 7. Design forks, for the design session to rule

F1 to F3 shape the build. F1 decides T1's installer and is needed first; T1's lockfile and its reader do not wait
for it. F2 is needed before wave 1 and F3 before wave 2. F8 is needed before the venue pilot. The rest can be confirmed
while wave 0 runs.

| F | Question | Recommendation | Why, and what the other choice costs |
|---|---|---|---|
| **F1** | How is the ModuleTree installed? (a) `npm ci --omit=dev`, the design text (N L204). (b) cua fetches each tarball the lock names, checks its SHA-512 and unpacks it. (c) A prebuilt tree per architecture, published and attested by this repository as the helper and the engine are | **(b)** | Finding 3: the managed Node has no npm, so (a) runs whatever npm the machine has, under the user's npm settings, and needs `--ignore-scripts` to keep `classic-level`'s install script from running. A machine without npm cannot install. Its real path cannot be unit-tested, where (b) takes a fake `fetch` like every other installer. (b) keeps one discipline for all four parts: a pinned URL, a pinned hash checked before anything reads the bytes, staging, one rename. It needs no system tool `cua install` does not already use. It costs about 150 lines and a departure from N L204, which #117 M6 inherits. (c) is the most hermetic, one download and the same bytes everywhere, but cua would redistribute third-party packages, among them libvips under the LGPL: an owner's decision, with #120 |
| **F2** | What must be installed for a session to resolve? L158 says "each part present and matching its pin" | **The module tree only. The Node, the helper and the engine keep the gates they have** (§3.4). `cua install` places all four at their pins, and doctor reports each against its pin | Finding 4. Read strictly, L158 refuses every session, browser-only included, after any pin moves, until `cua install` runs again: the engine's pin moved three times during M5. It also ends `--no-node`, `CUA_NODE`, `cua engine build`, `CUA_LINUX_ENGINE_BIN` and `CUA_SHIM_SANDBOX=disabled` without a helper, unless each is exempted. The cost of the recommendation: the release name states this cua's pins, and a home may run an engine at or above `MIN_ENGINE_VERSION` that is not the pinned one, as it may today. Doctor says so |
| **F3** | M5's F5 and F5a: the default with no usable engine keeps the vendor's engine | **It becomes a refusal** naming `cua install --engine`: `engine_not_installed`, `engine_outdated`, `engine_unrecorded` | Finding 5: the fallback reads the vendor tree under the default, which L161 excludes. #117 does the same at its M6 (N L192, "from M6: refused"). F5 existed so that an update would not break a home that had not installed; M6a requires one `cua install` in any case (F9), and that install places the engine. A sentence naming the fix is better than a silent move to an engine whose text input fails. Keeping the fallback while the tree is present is the other choice: it leaves a second reader of the vendor tree for M6b to remove, and the `fallback` part stays as it is |
| **F4** | `cua install`'s order, and what a failed step does | **Own parts first and required, the engine among them. The vendor tree last, and its failure does not fail the command unless `--archive` or `--release` asked for it** | Finding 6. Today a failed vendor download leaves an empty home with nothing. The engine step is optional today because the default was the vendor's when it was written |
| **F5** | Under `CUA_NATIVE_ENGINE=vendor`, which module tree do cells import from? | **cua's ModuleTree, as under the default.** The vendor tree gives the engine, its service and that service's own imports | One variable between the two engine lanes of R1, and the ModuleTree exercised on both. The other choice, today's launch whole, also keeps `@oai/*` importable there |
| **F6** | `@oai/*`, `@statsig/*` and `corepack` stop being importable in cells | **A declared difference,** stated in the README | They are the vendor's code, its telemetry client and its Node's tool. cua's text names none. The ModuleTree could carry the two public ones at no risk if the design session wants the importable set unchanged |
| **F7** | How deep is the browser-only check? | **The session, the six imports with `sharp` and `classic-level` run natively, `profiles_list`, the confinement, and the profile map's loader. No tab** | M6a changes what a browser-only launch resolves and imports, not the browser route. A tab needs a harness Chrome with cua's extension and a bound profile on each venue, which no Linux harness has yet, and on x64 the VM's Chrome is on `:0` |
| **F8** | The arm64 venue. (i) A workflow of cua's own, or a ci-kit lane? (ii) May its upgraded home fetch the vendor deb on the runner? L186 says the vendor package is not fetched in CI | **(i) cua's own dispatch-only workflow, both legs.** A lasting gate is the M5 pre-flight's F7 ticket and CI-opt's. **(ii) Yes, on this dispatch-only lane** | (i) Finding 9. (ii) The upgrade through the older cua's real install is what a user meets, and arm64 has no other venue. L186 was written for comparisons against the vendor, and the hosted macOS gates already install from the vendor's macOS archive (`.github/ci-kit.yml`, `sandbox-live` and `parity-browser`). If no: the upgraded home is built without the vendor step, as L162 states it (the pointer names the vendor release, its tree is gone), and the venue pilot waits for T4 |
| **F9** | To confirm: after the update, every Linux home needs one `cua install`, and until then every session is refused (L159) | **As the spec says.** The refusal names the command; the README and the pull request say it; a provisioned VM gets it from `cua-provision.sh` | The plugin runs no install. The other choice, launching from an intact vendor tree until the install, is what L159 rules out |

## 8. Conflicts and ambiguities

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| C1 | `classic-level` goes "into cua's own dependencies" and the Touches name `package.json`; the Interfaces put it in the ModuleTree | N L204, L342 against N L640, L511 | The ModuleTree. A plugin checkout has no `node_modules`, so a root dependency would not load there, and the loader's call is unchanged. `package.json` changes only its `files` |
| C2 | The record's four values repeat the four pins | L157, L511 | Kept as the spec says, bound at load and by test, and written by the pin script (§2). Deriving the record from the pins with no file would also work; it is simpler and cannot drift, and loses the one reviewable statement of the runtime |
| C3 | "Its parts are installed" is not defined per part | L158, L159 | F2 |
| C4 | The spec does not say whether the pointer still selects | L157, L159 | It records (§4.2) |
| C5 | An older cua sharing a home fails on the derived name | manifest.mjs L160–164 | Its own `cua install` restores it. Said in the pull request and the README |
| C6 | `cua install --engine` is described as installing the engine on its own; the code runs every step and only makes the engine required | README L1094 against cli.mjs L170–172 | T7 words it as the code does |
| C7 | "With the vendor tree unavailable, only `CUA_NATIVE_ENGINE=vendor` is refused" | L205 | True of the acceptance homes, whose own parts are installed. A browser-only session is not refused even with the variable set (§3.3) |
| C8 | M6a's Touches omit the harnesses, `doctor-engine.mjs`, `sandbox.mjs`, the workflow and `cua-provision.sh` | L342 | Each task's list here supersedes it, as M5's C1 did |
| C9 | The macOS deny list does not re-expose `modules/` | policy.mjs L127 | #117 M6's, with its baseline. M6a touches no macOS launch |
| C10 | `verify.mjs` on Linux judges the process tree by the release's root, a rule from before cua's own host there | `verify.mjs` L273, L289 | Not M6a's proof and not changed. T9 adds a line to `tech-debt-tracker.md` |

## 9. Sources, and what was not verified

**Sources** (read 2026-11-22).

- The code and the two specs at da7585c3.
- `V/` on the x64 VM: each package's `package.json`, `.pnpm/lock.yaml`, `.modules.yaml`, and the native files' sizes
  and one hash.
- The npm registry: `https://registry.npmjs.org/<package>/<version>` for `classic-level` 3.0.0, `sharp` 0.35.4,
  `playwright` and `playwright-core` 1.57.0, `@img/sharp-linux-x64` and `-arm64` 0.35.4 and
  `@img/sharp-libvips-linux-arm64` 1.3.3. All seven carry the integrity the vendor lock records.
  `classic-level-3.0.0.tgz`: its SHA-512 is the lock's, and its member list holds both Linux prebuilds.
- ci-kit's lanes: the plugin's copy, `plan/config.mjs` L13.
- npm writing `libc` into a lockfile from 11.11.0: `https://github.com/dependabot/dependabot-core/issues/15318`.
- Ubuntu 24.04 and bubblewrap's user namespace:
  `https://github.com/anthropic-experimental/sandbox-runtime/issues/74`.

**Not verified.**

- The arm64 vendor tree. This machine is x64 and the arm64 deb was not fetched: its packages are read off the x64
  tree's lockfile.
- That a hosted `ubuntu-24.04` or `ubuntu-24.04-arm` runner lets bubblewrap create a user namespace, with or without
  the sysctl, and that gedit's accessibility tree is served there under Xvfb. The venue pilot checks both first.
- The other 18 packages' integrity against the registry, of the 25 over both architectures: they are the vendor
  lock's values.
- Which npm versions write `libc` for the `@img` entries, beyond the report above. T1's test fixes what the lock must
  carry.
- `sharp` and `classic-level` loading inside the sandbox from `modules/`. They load today from `runtimes/`, and the
  Linux deny list treats the two alike by reading.
- How R1's prepared homes behave with a module step. The cache has none today.
- The session's open time with the record's binding in it.
- That no script outside §0's finding 10 and T5's list reads `cua install --json`'s `source` or `root` on Linux.
- Nothing was run. Every statement about behaviour after the change is design, and every statement about today's is
  from reading the code.
