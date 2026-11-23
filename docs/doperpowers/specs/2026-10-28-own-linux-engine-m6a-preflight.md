# #171 M6a pre-flight (ruled 2026-11-23, ruling 1110)

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
  members were listed and one hashed (`~/.local/share/cua-171/m6a-preflight/`).
- **Revision 3.** The first draft is 06e3c3e0. Revision 2 (f7b9bcd9) folded in an adversarial review's eleven
  findings, each in the section it belongs to. This one folds in the four items its re-review left: the engine
  override's exclusion, the import witness, what an open binds of the engine (F2), and one ordering.
- Loop tasks continue M5's numbering, from task 140. "T" numbers are this document's rows. The build's branch is
  `feat/171-m6a` from main.
- The plan below is written on the recommendations of §7. Each task says what a different ruling changes.
- **Ruled (the design session, 2026-11-23, ruling 1110).** Every fork of §7 as recommended: F1 (cua's own fetch; the
  asset route, and with it any redistribution, is not taken), F2 (a minimum per part, not strict pins), F2a, F3 to F9,
  and F10, its credit checked against 0.4.4's reach. The refusal at the open of an explicit selection below the
  engine's minimum is accepted. Three additions, folded where they belong: doctor's warning for a part behind its pin
  names the same absolute installer the refusal names (§4.5); the README's update step lists the Linux homes the
  update touches (T7); and the version is allocated at merge (T7). Wave 0 may start at once, beside 0.4.4's reach on
  the hosted arm64 runner, which touches neither VM; the rest of the build waits for 0.4.4's release (ruling 1099).
  The third review round was skipped on the controller's own check of revision 3; the whole-branch review is the check.

## 0. What the reading found

Fifteen findings shape the plan.

1. **The vendor module tree has two users, not one.** Cells resolve package imports from it
   (`src/runtime/launch.mjs` L295; `src/repl-host/kernel.mjs` L299–303). cua itself loads `classic-level` from it, in
   the CLI process and outside every sandbox, to map Chrome profile directories for `cua profiles bind`
   (`src/cli.mjs` L742; `src/profiles/directory-map.mjs` L29–33). Nothing else of cua's imports from it (§1.3).
2. **With cua's engine, the module tree is the only vendor path a Linux launch names.** `buildLaunch` puts it in the
   trusted code paths and in `CUA_REPL_NODE_MODULE_DIRS` (launch.mjs L292, L295). Resolution reads the pointer, the
   release's install record and eight layout paths (`src/runtime/manifest.mjs` L188–201; `src/runtime/checks.mjs`
   L13).
3. **The vendor's Node can still run a default session.** `ownHostNode` takes the first executable at or above Node
   24 among `CUA_NODE`, the managed Node, the node running cua and `node` on `PATH` (launch.mjs L602–616). Nothing
   excludes a path under `runtimes/`, where the kept deb ships a Node 24.21.0 (`cua_node/manifest.json` L6, L10). The
   `PATH` lookup runs while the candidate list is built (L606–607), so it can stat the vendor tree even when the
   managed Node wins (F2, §3.5).
4. **Three parts accept something other than their pin without anyone asking.** L158 requires "each part present and
   matching its pin".
   - Node: with no managed Node, a session runs silently on the node running cua or the one on `PATH` (finding 3).
   - The engine: any recorded release at or above `MIN_ENGINE_VERSION` runs under the default, pinned or not
     (launch.mjs L527–531).
   - The module tree has no gate at all.
   Four departures are asked for by name: `CUA_NODE`, `CUA_LINUX_ENGINE_BIN`, a local build from `cua engine build`,
   and `CUA_SHIM_SANDBOX=disabled`, which needs no helper (F2, F2a).
5. **The managed Node carries no npm.** `cua install` keeps only `bin/node` and the licence of the Node tarball
   (`src/runtime/node-install.mjs` L4; `src/runtime/managed-node.mjs` L12). The design text installs the ModuleTree
   with `npm ci --omit=dev` (N L204). Nothing cua pins could run it (F1).
6. **The one authenticated statement of the packages is the vendor's lockfile.** `V/.pnpm/lock.yaml` gives a name, a
   version and a SHA-512 for every package of both architectures, inside an archive whose hash is pinned and whose
   signature was checked when the pin was written (the pin's `notes`). A lockfile that npm writes afresh is not
   authenticated by anything, and what it names runs in cells and, for `classic-level`, in the CLI (F1, §4.2).
7. **M5's fallback reads the vendor tree under the default.** With no usable engine of cua's, the default selection
   keeps the vendor's engine with a warning (launch.mjs L525, L529, L530), and the launch takes `skyLinuxBin` and the
   vendor service from the tree (L327). L161 says an explicit `CUA_NATIVE_ENGINE=vendor` is the only reader. The
   gate's `fallback` part asserts the fallback (`scripts/linux-engine-gate/suites.sh` L191–200) (F3).
8. **`cua install` starts with the vendor archive and stops if it fails** (`src/cli.mjs` L178), and the engine step
   is optional (L205–220). An empty home needs OpenAI's server to get a runtime that no longer uses it (F4).
9. **The update refuses every Linux session until an install runs, and the obvious install may be the wrong one.**
   L159 refuses `runtime_not_installed` when the own parts are absent. The plugin updates from the marketplace, and
   the README has the runtime installed from a separate checkout (README L104–109). A `cua` on `PATH` from a checkout
   still at 0.29.0 then runs: it succeeds, puts the vendor name back in the pointer (`src/runtime/install.mjs` L85,
   L179–188) and builds no ModuleTree (F9).
10. **On Linux the sandbox needs no change.** The kernel's deny list there is `state/`, `remote/`, `chrome/` and
    `run/` (`src/sandbox/policy.mjs` L121–124), so `$CUA_HOME/modules/` is readable as `runtimes/` is. On macOS the
    whole home is denied and `runtimes/` and `node/` are re-exposed (L127): adding `modules/` there is #117 M6's, and
    it moves a sandbox fingerprint. M6a changes no macOS launch.
11. **The arm64 venue is new ground.** ci-kit's lanes are `hosted`, `hosted-macos`, `pool` and `mac` (ci-kit
    `plan/config.mjs` L13). No cua session has run on a hosted Linux runner (`.github/ci-kit.yml` L1–7). A bare runner
    has no session bus, no `org.a11y.Status IsEnabled`, no sshd and no `$XDG_RUNTIME_DIR/bus`, and
    `scripts/accept/linux-native.mjs`'s confinement step counts any failed connect to those as confinement (L92–100)
    (F8, §5.2).
12. **`linux-native.mjs` is item 1's fixture, not item 6's.** It types one ASCII marker into gedit (L84). Item 6 is
    the combining-mark and multi-line string, Chrome's textarea and address bar, GTK 4 in `dedicated` mode, the paste
    safety cases and the bus trace (L199). M5 mapped it to V1 and V4, which drive the engine directly on `:0` (the M5
    pre-flight, §1.3) (F10).
13. **The harnesses read the vendor tree through `resolveRuntime` and the pointer.** On Linux:
    - repl-parity's provenance runs `runtime.paths.node` (`scripts/repl-parity/provenance.mjs` L14);
    - its engine judge takes `runtime().paths.skyLinuxBin` (`scripts/repl-parity/engine-answered.mjs` L128);
    - native-baseline builds the runtime root from the pointer (`scripts/native-baseline/remote.mjs` L147–152);
    - the parity preparation's archive cache has no module tree (`scripts/repl-parity/archive-cache.mjs` L29–38);
    - the capability home requires `runtimes/<pointer>` before it does anything, asserts it again on the fresh home,
      and copies only the vendor directory (`scripts/browser-parity/capability-home.mjs` L40–42, L63, L66–68) (T5).
14. **The cloud provisioner needs the vendor's deb before it calls cua.** It fetches or waits for the deb and can
    stop there (`deploy/cloud-vm/cua-provision.sh` L286–322), then always passes `--archive` (L325). `CUA_DEB` is
    required, and `render.sh` defaults it to `pin` (L26; `test/deploy-cloud-vm.test.mjs` L44) (§4.4).
15. **An open keeps the engine's pathname, not its bytes.** `cua install` renames a new engine over
    `engine/linux/cua-engine` (`placeLinuxEngine`, `src/runtime/linux-engine.mjs` L159–172). A connection resolves its
    selection once, at the open, and launches later and again after an idle stop (`src/mcp/connection.mjs` L104–112).
    The service checks only the version floor of what it starts (`src/services/engine/linux/client.mjs` L50–62). So
    an install between the open and a launch changes the engine that runs. The other three parts sit in directories
    named by their version, tag or lock and are never replaced in place (F2).

## 1. The module inventory

### 1.1 Who names the tree

| Reader | Where | What it takes |
|---|---|---|
| Every Linux launch | launch.mjs L295: `CUA_REPL_NODE_MODULE_DIRS: p.moduleDir`; `p.moduleDir` is the pin's `cua_node/lib/node_modules` (`runtime/releases/26.928.40906-linux-x64.json` L24, `…-arm64.json` L24) | the directory, as a search base |
| The kernel | `src/repl-host/kernel.mjs` L299–303 adds each entry as a module search base, and resolves a bare specifier with `require.resolve` from it (L471–489); `src/repl-host/supervisor.mjs` L152, L174 adds it to both children's read paths | any bare specifier a cell imports resolves there, so every package in `V/` is importable today |
| The `js` tool's description | `src/repl-host/tools.mjs` L23: "Use dynamic imports such as `await import("playwright")`" | the one package cua's own text names |
| The trusted worker | launch.mjs L292 lists the tree as a trusted code path | with the vendor's engine, the vendor service and its imports (L327). With cua's engine, nothing |
| `cua profiles bind` | `src/cli.mjs` L742 passes `runtime.paths.moduleDir`; `src/profiles/directory-map.mjs` L31–33 requires `classic-level` from it | `classic-level`, in the CLI process, outside every sandbox |
| Doctor's `sandbox` row | `src/runtime/doctor.mjs` L330 | the path, as a protected one |

### 1.2 The packages

The vendor's lockfile says which packages it chose and which only follow. Its root lists five public packages
(`V/.pnpm/lock.yaml` L27–41), `@oai/browser-desktop` lists `classic-level` (L43–47) and `@oai/sky` lists
`@statsig/js-client` (L55–59). N L204 names the same six for the ModuleTree. Versions are `V/`'s, each read from its
`package.json`. "Lock" is the line of the package's entry in that lockfile, where its SHA-512 stands: those lines are
the authenticated integrities T1 compares against (§4.2).

| Package | Version | Lock | Why it is there | Native code, x64 | Native code, arm64 |
|---|---|---|---|---|---|
| `playwright` | 1.57.0 | L317 | root dependency (L33–35); tools.mjs L23 | none; it ships no browser | none |
| `playwright-core` | 1.57.0 | L312 | `playwright`'s | none | none |
| `sharp` | 0.35.4 | L331 | root (L39–41) | none itself; no install script (registry) | none |
| `@img/sharp-linux-<arch>` | 0.35.4 | L180, L145 | `sharp`'s optional, one per target | `V/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.4.node`, 415,112 bytes | lock L145–150: `cpu: [arm64]`, `os: [linux]`, `libc: [glibc]`. Skipped on x64 (`V/.modules.yaml` L126) |
| `@img/sharp-libvips-linux-<arch>` | 1.3.3 | L127, L97 | the addon's library; LGPL-3.0-or-later | `V/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6`, 18,621,496 bytes | lock L97–101, glibc |
| `@img/colour`, `detect-libc`, `semver` | 1.1.0, 2.1.2, 7.8.5 | L66, L266, L326 | `sharp`'s | none | none |
| `pngjs` | 7.0.0 | L322 | root (L36–38) | none | none |
| `jpeg-js` | 0.4.4 | L282 | root (L27–29) | none | none |
| `pixelmatch` | 7.1.0 | L308 | root (L30–32); an ES module | none | none |
| `classic-level` | 3.0.0 | L262 | `@oai/browser-desktop`'s (L43–47); cua's profile map (§1.1) | `prebuilds/linux-x64/classic-level.node`, 480,800 bytes, sha256 `48843c73…`: `V/`'s file and the npm tarball's member are the same bytes | `prebuilds/linux-arm64/classic-level.armv8.node`, 452,056 bytes, in the same npm tarball. `V/` on x64 was pruned to its own target |
| `abstract-level`, `module-error`, `napi-macros`, `node-gyp-build` | 3.1.1, 1.0.2, 2.2.2, 4.8.4 | L252, L297, L301, L304 | `classic-level`'s | none | none |
| `buffer`, `base64-js`, `ieee754`, `is-buffer`, `level-supports`, `level-transcoder`, `maybe-combine-errors` | 6.0.3, 1.5.1, 1.2.1, 2.0.5, 6.2.0, 1.0.1, 1.0.0 | L259, L256, L275, L278, L285, L289, L293 | `abstract-level`'s, and `buffer`'s two | none | none |

- **The closure is 23 packages on each architecture,** 25 over both, about 40 MB unpacked (`V/` is 69 MB, of which
  `@oai` is 28 MB).
- **Native code is in three,** each with a published build for linux-x64 and linux-arm64 on glibc. Nothing compiles
  at install: `classic-level`'s `install: node-gyp-build` builds only where no prebuild fits, and no script is run.
- **The closure is not "every lock entry that fits the host".** The lock also holds `@img/sharp-wasm32`, whose own
  fields admit any host, with `@emnapi/runtime` and `tslib` under it, and `fsevents`. They are absent from `V/` only
  because the branch that leads to them is skipped (`V/.modules.yaml` L126–154). The closure is what is reachable from
  the six roots (§4.2).

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

**What the name means:** this cua's definition of the Linux runtime, which `cua install` places. A home may run a
Node or an engine behind its pin, at or above that part's minimum, or a part a named override put in its place.
Doctor tells each apart from the pin with a warning (§3.4, F2, F2a).

## 3. Resolution and launch

### 3.1 `src/runtime/manifest.mjs`

| Change | Detail |
|---|---|
| New exports | `LINUX_RUNTIME_FILE`, `parseLinuxRuntime`, `loadLinuxRuntime`, `linuxRelease`, `vendorLinuxRuntime`, `ownInstaller` |
| `locateRuntime` (L186–195) | A Linux host takes a new branch before `readPointer` (L188). It loads the record, derives the release, and reads the module tree's install record (`readModuleTree`, T1). Absent or not this lock's: `runtime_not_installed`, "cua's Linux runtime `<release>` is not installed in `<home>`: its module tree `<dir>` is missing", with `ownInstaller`'s hint. **The pointer is not read**: on Linux it records what `cua install` last completed and selects nothing (§4.3). A `release` argument other than the derived name is `unknown_release` |
| `resolveRuntime` (L199–204) | On Linux, `locateRuntime`, then `checkModuleTree` (T1): every package's `package.json` is there, and every native file is there at its recorded size (§4.2). A gap is `layout_invalid` with the recovery hint (stop the sessions using it, remove `modules/<lock>`, run the installer). The full check of every file's hash is the installer's and doctor's, not a connection's (L197–198 says the same of an archive) |
| What both return on Linux | `{release, home, root: <home>/modules/<lock>, paths: {moduleDir: <root>/node_modules}, manifest: {platform: 'linux', arch, release, parts: <the record>}, record: <the tree's install record>}`. `manifest.platform` and `manifest.arch` keep their readers unchanged: launch.mjs L267, L273, L286, L297, L314; connection.mjs L112, L123; `src/profiles/inventory.mjs` L149 |
| `vendorLinuxRuntime({home, pins, host})` | The vendor tree, for the vendor selection only: `selectPin` (L150), the release's directory, `readInstalledRecord` (L173), `checkLayout`. It returns `{release, root, paths}` as `runtimeFor` does today (L167), or throws `release_not_installed`. Never reached through the pointer |
| `ownInstaller()` and `installHint` (L37) | On Linux every remedy names **this cua's own installer by its absolute path**: "run `node <this cua>/bin/cua.mjs install`; a `cua` from another checkout installs that checkout's runtime, which may not be `<release>`" (F9). The path is this module's own checkout or plugin copy. The `--archive <ChatGPT deb>` hint stays for the vendor tree's own errors |
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
| `ownHostNode` (L602–616), on Linux | the first Node 24 among `CUA_NODE`, the managed Node, the node running cua and `PATH`; the `PATH` lookup is eager (L606–607) | two candidates, each asked for only when its turn comes. `CUA_NODE`, the named override. Else the managed Node: one cua installed, its bytes the ones its install record names (`managedNode`, managed-node.mjs L165–175), at or above `NODE_FLOOR`. It runs at the record's version or behind it, and doctor warns when it is behind (F2). Without either: `runtime_not_installed`, "its Node is not installed", with `ownInstaller`'s hint. The node running cua and `PATH` are no longer candidates on Linux (F2a). darwin unchanged |
| The vendor tree as a source of a Node or an engine | nothing excludes it: `CUA_NODE` and `CUA_LINUX_ENGINE_BIN` take any executable (L603, L513–518), and the installed engine's path is followed wherever its links lead (`installedLinuxEngine`, linux-engine.mjs L131) | one rule for the Node lookup and the engine lookup: a path that as given, or by its real path, lies under `<home>/runtimes/` is refused before it is stat-ed, run or probed. `invalid_setting` for `CUA_NODE` and for `CUA_LINUX_ENGINE_BIN`, naming the path and why; `engine_not_installed` for an installed engine whose path leads there. An override may replace a pinned part; it never makes `runtimes/` a dependency of an own lane |
| `linuxEngineFor` (L510–533), cua's engine | an explicit selection takes whatever is installed; the default takes any recorded release at or above `MIN_ENGINE_VERSION` | either selection takes a recorded release at or above `MIN_ENGINE_VERSION`, by the version its bytes bear out (`verifiedLinuxEngineVersion`, linux-engine.mjs L199): the pinned one, or one behind or ahead of the pin, of which doctor warns. Or a named override: `CUA_LINUX_ENGINE_BIN`, or a recorded local build. Otherwise refused at the open: `engine_not_installed`, `engine_outdated` (below the minimum) or `engine_unrecorded`, each with the installer's hint and `--engine` (F2, F3). An explicit selection of an engine below the minimum is refused at the open too, where today its first request is |
| `linuxEngineFor`, vendor selected (L512) | returns `{engine: 'vendor'}` and checks nothing | resolves the tree through a `vendor` seam (default `vendorLinuxRuntime` for `home` and the host's architecture) and carries `vendor: {release, bin, service, moduleDir}`. Tree absent or damaged: `engine_not_installed`, "`CUA_NATIVE_ENGINE=vendor` selects the vendor's engine, and its release `<release>` is not installed in `<home>`", with the installer's hint (the `engine.json` wording for a `settings` selection) |
| `linuxEngineFor`, the default with no usable engine (L525, L529, L530) | the vendor's engine, status `warn` | the refusals of the row above (F3) |
| `buildLaunch`, the trusted code paths (L292) | the vendor module tree, on every launch | on Linux: cua's own code only. With the vendor's engine, also `vendor.moduleDir`, which that service imports from. The ModuleTree is not trusted code: nothing trusted imports from it. darwin unchanged |
| `buildLaunch`, `CUA_REPL_NODE_MODULE_DIRS` (L295) | `p.moduleDir`, the vendor's | the same expression, now the ModuleTree's, under either engine (F5) |
| `buildLaunch`, the vendor engine's environment (L327) | `p.skyLinuxBin`, `p.skyVendorService` | `replHost.engine.vendor.bin`, `.service`. A vendor selection without `vendor` is a `TypeError`, as a `cua` host without its Node is (L270) |
| The launch record (L347–352) | `managedNodeRoot`, `stagingRoot`, `sandboxHelperRoot`, `engineRoot` | also `modulesRoot`, `<home>/modules`, which `protectedPaths` guards (`src/runtime/sandbox.mjs` L104, L241–243; doctor.mjs L330) |
| `nativeEngineFor` (L490) | – | takes `arch` (default `process.arch`) for the vendor pin |
| The header (L1–3, L59–61, L151–152) | describes the vendor tree | describes both |

Unchanged: `replHostFor` (L412), `linuxSandboxEnv` (L381), `desktopModeFor` (L551), and every darwin branch.

**What an open binds of the engine** (finding 15). A pathname, as today. Under F2's minimum the guarantee is "a
compatible engine", not "these bytes":

- an install that replaces the engine between a connection's open and its first launch, or while it is idle, swaps
  one recorded release for another, and the relaunch runs the newer file. That is today's behaviour;
- the service asks whatever it starts for its version before the first request, at every start, and refuses one
  below the minimum (client.mjs L50–62), so the minimum holds for the executable that runs, whatever the open saw;
- this is stated in the README's Linux part and logged in `tech-debt-tracker.md` (T7, T9).

A strict ruling of F2 could not leave it so, and F2 says what it would then take.

**Browser-only sessions.** `replHostFor` asks for an engine only with the computer surface (L421), so a browser-only
launch resolves the record, the Node and the helper's path, and names the ModuleTree (L160). It needs no engine and no
vendor tree, and it opens with `CUA_NATIVE_ENGINE=vendor` set and the tree absent.

### 3.4 What a session requires, and what may stand in for it (F2, F2a)

The ordinary path is a part cua installed, its bytes the recorded ones, at or above that part's minimum. Below the
minimum, or without the part, the session is refused. Behind the pin and at or above the minimum, it runs and doctor
warns. An override is a setting the user or the harness names; nothing else stands in.

| Part | Needed by | Its minimum | Behind the pin | Named overrides | Refusal |
|---|---|---|---|---|---|
| The module tree | every session | the tree of this cua's lock, installed and structurally whole (`resolveRuntime`). It is addressed by the lock, so the minimum is the pin | – | none | `runtime_not_installed`; `layout_invalid` |
| Node | every session | a managed Node at or above `NODE_FLOOR`, its bytes the recorded ones (`ownHostNode`) | runs; `runtime.node` warns | `CUA_NODE` | `runtime_not_installed`; `repl_host_node` for a `CUA_NODE` that is absent or below 24 |
| The sandbox helper | every session but a `disabled` one | the pinned helper's bytes at its pinned path, checked at every launch (`assertSandboxConfines`, sandbox.mjs L280; `verifyHelper`, linux.mjs L88; unchanged). It is what confines, so the minimum is the pin | – | `CUA_SHIM_SANDBOX=disabled`, which runs no helper | `sandbox_unavailable` |
| cua's engine | computer sessions on cua's engine | a recorded release at or above `MIN_ENGINE_VERSION` (`linuxEngineFor`; the service again at each start) | runs; `engine` warns | `CUA_LINUX_ENGINE_BIN`; a recorded local build | `engine_not_installed`, `engine_outdated`, `engine_unrecorded` |
| The vendor tree | computer sessions with the vendor selection | the pinned release, installed (`vendorLinuxRuntime`) | – | none | `engine_not_installed` |

- No override may be, or lead to, a path under `runtimes/` (§3.3).
- Every refusal names `ownInstaller`'s command. Doctor reports an override in force, and a part behind its pin, as
  `warn`, naming it (§4.5).
- A minimum moves as `MIN_ENGINE_VERSION` moves today: the pull request that makes cua rely on a newer part raises
  it (L140).

### 3.5 "No vendor tree read", and how it is shown

**What is guaranteed.** On a session's open and launch, with any selection but `vendor`, cua opens, stats, lists and
runs nothing under `<home>/runtimes/`, and names no such path to its children. No override brings it back: a
`CUA_NODE` or a `CUA_LINUX_ENGINE_BIN` that is, or leads, under `runtimes/` is refused by its spelling and by its real
path, before anything there is touched (§3.3). `cua profiles list`, `bind` and `open` are covered, since they launch
through the same code. `cua install` and `cua doctor` read the tree by design until M6b: they place it and report it.

**Shown with the tree present, not only with it gone.** A removed tree shows that no read is needed. It does not show
that none is attempted, and a read inside a `try` would pass unseen.

- **Unit.** A recorder over `node:fs` and `node:child_process` (their functions wrapped, the bindings refreshed with
  `syncBuiltinESMExports`) runs `resolveRuntime`, `replHostFor`, `buildLaunch` and `assertSandboxFits` for a default
  computer session and a browser-only one, in a home whose vendor tree is present and whose `PATH` holds the vendor
  tree's `bin`. No recorded path may lie under `runtimes/`. Its negative control is today's `ownHostNode`, which must
  be recorded stat-ing the vendor `bin/node`.
- **Live** (§5.2, cell E1): the session runs under `strace -f` for file and exec calls, with the tree present. No
  call of the serve's process tree may name a path under `runtimes/`.

## 4. Install and migration

### 4.1 `cua install` on Linux

The common parts come first, so a browser-only session needs nothing from either engine's server. Each lane is then
installed on its own, and the exit status follows the lane the home asks for (F4).

| # | Step | Kind | Today (cli.mjs) | After |
|---|---|---|---|---|
| 1 | The record | – | – | `loadLinuxRuntime`, first. A checkout whose record and pins disagree refuses before anything is fetched |
| 2 | The module tree | common | – | `installModuleTree` (§4.2) into `modules/<lock>/` |
| 3 | The sandbox helper | common | L195 | unchanged |
| 4 | Node | common | L236, unless `--no-node` | unchanged. With `--no-node` the home is complete as asked, and its sessions need `CUA_NODE` |
| 5 | The pointer | – | written by the vendor step (`activate`, `src/runtime/install.mjs` L179) | written here, to the derived name, once steps 2 to 4 are in place. Otherwise left as it was |
| 6 | cua's engine | lane | L211; fatal only with `--engine` | attempted whatever happened before |
| 7 | The vendor tree | lane | L178, first, and fatal | attempted whatever happened before. `installRuntime` takes an option not to activate. Kept for `CUA_NATIVE_ENGINE=vendor` until M6b |
| 8 | The Codex CLI's leftovers | – | L183–190 | unchanged, after step 7 |

- **Every step is attempted.** A failed module download does not stop the Node, and a failed engine download does not
  stop the vendor tree.
- **The exit status.** The command fails when a common part failed, or when a **requested lane** failed. A lane is
  requested when the home's effective engine setting names it (`nativeEngineSetting`, launch.mjs L570: the
  environment, else `engine.json`, else the default, cua's) or a flag does (`--engine`; `--archive` or `--release` for
  the vendor tree). A lane nobody requested that fails is said in one line and in `--json`, and the command succeeds.
- **The last lines say what now opens:** browser-only sessions, computer sessions on cua's engine, computer sessions
  on the vendor's.
- `--json` on Linux: `{ok, release: <derived>, changed, modules, sandboxHelper, node, engine, vendor: {release, root,
  changed, source} | {failed}, sessions: {browser, cua, vendor}}`.
- macOS: `cua install` is unchanged, by test.

| What fails | Effective setting | Exit | What opens afterwards |
|---|---|---|---|
| The engine | default (cua) | nonzero | browser-only; computer with `CUA_NATIVE_ENGINE=vendor` once step 7 has placed the tree |
| The engine | `vendor` | 0, said | browser-only; computer on the vendor's engine |
| The vendor tree | default | 0, said | browser-only; computer on cua's engine |
| The vendor tree | `vendor` | nonzero | browser-only. The vendor refusal names this installer, and running it again, with the server reachable, opens the vendor session |
| A common part | any | nonzero | whatever does not need it; the pointer is as it was |

### 4.2 The module tree's install (T1; F1)

**The pin, and who vouches for it.**

- `runtime/modules/package.json` names the six packages at exact versions and holds the rest with `overrides`.
  `package-lock.json` is version 3, and each entry's `resolved` must be the canonical registry URL for its name and
  version, `https://registry.npmjs.org/<name>/-/<file>-<version>.tgz`. Anything else is `invalid_pin`.
- `runtime/modules/provenance.json`, strictly parsed, holds for each architecture the closure: every package's path,
  name, version, SHA-512 and tarball length. It also names the vendor archive it was checked against: the release, the
  archive's SHA-256 and the lockfile's SHA-256.
- `scripts/modules-pin.mjs <the pinned deb>` writes it, and writes nothing unless every check passes:
  1. the deb's length and SHA-256 are the pin's (`runtime/releases/26.928.40906-linux-x64.json`);
  2. `.pnpm/lock.yaml` is taken from the deb, and nothing else is unpacked;
  3. both architectures' closures are computed from `package-lock.json` (below);
  4. every closure entry's name, version and SHA-512 equal the vendor lockfile's entry for that package. That lockfile
     lists every platform's packages, so the x64 archive vouches for the arm64 closure too. Given the arm64 deb as
     well, the script compares against its lockfile and records that it did;
  5. each tarball is fetched once, its SHA-512 checked and its length recorded.
  Run twice, it writes the same bytes. It is run when the lock is written and whenever the lock changes, on a machine
  that holds the deb, and its output is reviewed like any pin.

**The closure.** Reachable entries, not eligible ones (§1.2):

- start from the root entry's dependencies; resolve each name to the nearest `node_modules/<name>` above the dependent;
- follow `dependencies` always; follow an `optionalDependencies` edge only when the target's `os`, `cpu` and `libc`
  admit the host; follow no peer or development edge;
- the result for a host must equal `provenance.json`'s closure for its architecture, or the install is `invalid_pin`.
  The lock must therefore carry `libc` on the `@img` entries: an npm that drops it yields a closure the vendor's
  lockfile does not match, and the pin script refuses it.

**The install.**

- Each tarball of the host's closure is fetched from its canonical URL with its pinned length (`download`,
  install.mjs L226, which refuses a longer body) into staging, and its SHA-512 is checked before anything reads it.
- cua reads the tarball itself (`src/runtime/tarball.mjs`: gzip through `node:zlib`, then the tar headers). It writes
  regular files and directories only. A member that is a link, a device or a FIFO, an absolute path, a path with `..`
  or an empty part, a path outside the package's one top directory, a duplicate, or a body past a size bound refuses
  the whole package. Nothing is followed, since nothing but files and directories was ever written. No npm runs, no
  `tar` runs, and no package script runs.
- **The payload is recorded as it is written.** `install.json` holds `{schema, lock, platform, arch, packages,
  natives, source, installedAt}`:
  - `packages`: for each, its path, name, version, file count, and a digest over every file it unpacked (the sorted
    list of relative path, size and SHA-256);
  - `natives`: every `.node` and `.so` file, with its size and SHA-256.
- The tree moves into place with one rename (`moveIntoPlace`, install.mjs L193).
- **Two checks read that record.** `checkModuleTree`, at every connection, stats each `package.json` and each native
  file against its size. `verifyModuleTree` recomputes every digest; the installer runs it before it calls a tree
  already there verified, and doctor runs it for `runtime.modules`.
- A tree that verifies makes the step a no-op. One that does not is refused with the recovery hint and never repaired
  in place, since a running session may be importing from it. A path cua did not install is `target_occupied`.
- `--modules-dir <dir>` takes local copies of the tarballs, each still checked, as `--node-archive` and
  `--sandbox-helper` do for their parts. The parity preparation's cache uses it (T5).

### 4.3 The pointer, and the upgrade

- **The pointer records; it does not select.** Linux has one runtime per cua, the one its record derives. Resolution
  never reads `current.json` (§3.1), so a pointer that names a vendor release, another cua's own release or nothing
  changes no session.
- **Migration.** `cua install` rewrites a pointer that names a vendor Linux release to the derived name (step 5). The
  vendor tree is left as it is.
- **Until then** (L159): a home whose own parts are installed resolves the own record. One whose parts are not is
  refused `runtime_not_installed`, with the vendor tree intact or not.
- **The remedy names the installer that fixes it** (finding 9; F9). The refusal, doctor's row and the README all give
  `node <this cua>/bin/cua.mjs install`, by absolute path, and the release it installs. A plugin copy carries its own
  `bin/cua.mjs` and needs no `npm ci` for it (README L107–108; §4.2 runs no npm). The README's Linux update step
  becomes: update the plugin, then run the command the refusal prints, or update the checkout first.
- **An older cua's `cua install` on the same home** succeeds and changes nothing the M6a cua reads: it puts the vendor
  name back in the pointer, which M6a does not read, and builds no ModuleTree. The refusal stays, with the same named
  installer. An older cua's own sessions fail `unknown_release` on a derived pointer until its own install runs (C5).
- **`cua runtime use <release>` on Linux** (cli.mjs L266; install.mjs L150): the derived name verifies the tree again
  and rewrites the pointer. A vendor release is refused, naming `CUA_NATIVE_ENGINE=vendor` as the way to that engine.

### 4.4 The cloud provisioner

`deploy/cloud-vm/cua-provision.sh` must reach a working device with no deb (finding 14).

- `CUA_DEB` gains `none`, and `render.sh` defaults to it. The script then fetches and waits for nothing, and runs `cua
  install` with no `--archive`. cua's own vendor step still tries the pin's URL, and its failure leaves a working
  device (§4.1).
- `pin`, a URL or `upload` mean the operator asked for the vendor tree. The script first installs and registers the
  own runtime, as under `none`: `cua install`, `cua chrome register`, the profile. Only then does it fetch or wait for
  the deb, and run `cua install --archive "$deb"`, where the tree is mandatory.
- Its `jq` line (L325) prints `{ok, release, changed, sessions}`.
- The install block becomes functions a test can run with stub `cua` and `curl`.

### 4.5 Doctor and checks rows

`src/runtime/checks.mjs` gains the two module-tree checks. Doctor's Linux rows (`src/runtime/doctor.mjs` L128–165):

| Row | Today on Linux | After |
|---|---|---|
| `platform` | the vendor pin for the host (L132–133) | "linux-`<arch>`: cua's own runtime `<release>`", from the record. An `invalid_pin` fails it |
| `runtime.installed` | the pointer's vendor release and its root (L142–143) | `pass`: the common parts are installed and the pointer names this release. `warn`: sessions resolve, and the pointer names a vendor release or another own release. `fail`: `runtime_not_installed`. Each names `ownInstaller`'s command |
| `runtime.modules` (new) | – | `verifyModuleTree`: every package's digest and every native file's hash. `fail` names the first few that differ |
| `runtime.node` (new) | – | `pass`: the pinned Node is installed and active. `warn`: a managed Node behind the pin runs, naming both versions; or `CUA_NODE` stands in. `fail`: neither |
| `sandbox.launcher` | the pinned helper (L108–116) | unchanged: it is the helper part's row |
| `engine` | cua's engine against its pin; the fallback as `warn` (`src/runtime/doctor-engine.mjs` L228–230) | `pass`: the pinned engine. `warn`: a recorded release behind or ahead of the pin, at or above the minimum, naming both versions; a local build; `CUA_LINUX_ENGINE_BIN`. `fail`: the refusals of §3.3, and a vendor selection whose tree is absent |
| `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc`, `runtime.signatures` | the vendor tree (L149–165) | one row, `runtime.vendor`: `pass` when the tree is installed and verifies ("kept for `CUA_NATIVE_ENGINE=vendor`"), `skip` when it is absent, `fail` when it is damaged. M6b deletes it (L206) |
| `sandbox` | protects the vendor module tree (L330) | protects the ModuleTree and `modules/` |

Every `warn` for a part behind its pin, and every `fail`, names `ownInstaller`'s command, the same absolute path the
refusal names, so the remedy is one copy and paste (ruling 1110).

`report.runtime` becomes `{release, root, paths, parts}`. macOS's rows are unchanged.

## 5. Tests and acceptance 12

### 5.1 Unit tests

They run in the `test` gate on hosted macOS, with a Linux host injected, as today's Linux tests do. Every installer
takes a fake `fetch`. `fakeInstalledHome` (`test/fixtures/installed-home.mjs` L25) lays down the own parts for a Linux
host, so the existing Linux-host tests keep resolving.

| Row | Expect | File |
|---|---|---|
| The lock: version 3; every `resolved` the canonical URL | pass; any other URL `invalid_pin` | `test/runtime-module-tree.test.mjs` (new) |
| The closure from the checked-in lock, x64 and arm64 | exactly `provenance.json`'s 23 each, which are §1.2's; `@img/sharp-wasm32`, `@emnapi/runtime`, `tslib` and `fsevents` absent | same |
| A lock whose `@img` entries lack `libc`; a closure that differs from the provenance by one entry | `invalid_pin` | same |
| `modules-pin.mjs` on a fixture archive: a version, an integrity or a name that differs from the vendor lockfile; a deb that is not the pin's | refused, nothing written; the same input twice writes the same bytes | `test/modules-pin.test.mjs` (new) |
| Install into an empty home, x64 and arm64 | the closure placed and recorded, `changed: true`; `classic-level` holds both prebuilds | `test/runtime-module-tree.test.mjs` |
| A tarball whose bytes differ from its SHA-512; one longer than its pinned length | refused before unpacking; nothing placed; staging removed | same |
| A tarball with a symlink, a hard link, a device, an absolute path, a `..` path, a second top directory, a duplicate member, an oversized member | each refuses the package; nothing outside the package directory is written | `test/runtime-tarball.test.mjs` (new) |
| A native file removed, truncated or altered, every `package.json` intact | the connection's check: `layout_invalid` for the removed and the truncated one. `verifyModuleTree`, doctor and a reinstall: all three caught; the reinstall refuses and repairs nothing | `test/runtime-module-tree.test.mjs`, `test/runtime-linux-doctor.test.mjs` |
| A JavaScript file altered inside a package | `verifyModuleTree` and doctor fail; the reinstall refuses | same |
| A second install; a foreign directory at the path | no-op; `target_occupied` | same |
| The record: each unknown, missing or malformed field | `invalid_pin` | `test/runtime-linux-record.test.mjs` (new) |
| The record against each of the four pins, one moved at a time | `invalid_pin` naming both | same |
| The checked-in record equals the checked-in pins | pass | same |
| The release name: stable; changes with each field; carries the architecture; one safe path segment | pass | same |
| `linux-engine-pin.mjs` rewrites the record's engine version with the pin | pass | `test/linux-engine-pin.test.mjs` |
| No pointer, no tree | `runtime_not_installed`; the hint is `node <absolute path>/bin/cua.mjs install` and the derived release | `test/runtime-manifest.test.mjs` |
| Pointer names the vendor release, vendor tree intact, no module tree: the home an older cua's `cua install` leaves | `runtime_not_installed` with the same hint; nothing under `runtimes/` is read | same |
| Pointer names the vendor release, vendor tree gone, own parts installed (L162) | resolves the own record | same |
| Pointer absent, unreadable, or another own name; parts installed | resolves | same |
| darwin: locate and resolve | as before | same |
| **The recorder** (§3.5): a default computer session and a browser-only one, the vendor tree present, the vendor `bin` on `PATH` | no path under `runtimes/` opened, stat-ed, listed or run; today's `ownHostNode` fails the same test | `test/runtime-linux-no-vendor-read.test.mjs` (new) |
| The Node: the managed one at the record's version; a managed one behind it; one whose bytes are not its record's; none | used; used, and doctor warns; `runtime_not_installed` twice. The node running cua and `PATH` are never tried | `test/runtime-linux-launch.test.mjs` |
| `CUA_NODE`: a good Node; one under `runtimes/`; a symlink outside that leads there | used, and doctor warns; `invalid_setting` for both, with no probe run | same |
| `CUA_LINUX_ENGINE_BIN`: a good engine; a path under `runtimes/`; a symlink outside that leads there. And an installed `engine/linux/cua-engine` that is a link into `runtimes/` | used, and doctor warns; `invalid_setting` for both, with nothing there stat-ed or run; `engine_not_installed` for the installed link | `test/runtime-linux-engine-selection.test.mjs`; the recorder's test |
| A Linux computer launch on cua's engine | no value of its environment, no trusted code path and no root in the launch record lies under `runtimes/`; the module base is the ModuleTree | same |
| A browser-only launch with no engine installed and no vendor tree | builds; names Node, the ModuleTree and the helper only | same |
| The engine: the pinned bytes; a recorded release behind the pin and at or above the minimum; one ahead of the pin; one below the minimum; a local build; unrecorded bytes; none. Under the default and under an explicit `cua` | selected; selected and doctor warns, twice; `engine_outdated` at the open; selected and doctor warns; `engine_unrecorded`; `engine_not_installed` | `test/runtime-linux-engine-selection.test.mjs`; the oracle, `scripts/repl-parity/selection.mjs` L51–57 and its test |
| The engine replaced after the open, before the first launch and again between an idle stop and the relaunch: by another release at or above the minimum; by one below it | the launch runs the file now at the path; the service refuses the one below the minimum before any request. The stated behaviour of §3.3, held by test | `test/services-engine-linux/`, `test/serve-lazy.test.mjs` |
| The vendor selection, tree installed | `OAI_SKY_LINUX_BIN`, the vendor service, the vendor `node_modules` trusted; the module base still the ModuleTree | `test/runtime-linux-launch.test.mjs`; `test/linux-secrets.test.mjs` |
| The vendor selection, tree absent, by environment and by `engine.json` | `engine_not_installed`, naming the installer | `test/runtime-linux-engine-selection.test.mjs` |
| A scoped launch whose run directory overlaps `modules/` | `sandbox_conflict` | `test/mcp-sandbox.test.mjs` |
| `cua install` in an empty home | steps in §4.1's order; pointer the derived name | `test/cli.test.mjs`, `test/runtime-linux-install.test.mjs` |
| `cua install` over a vendor pointer | pointer rewritten; vendor tree untouched | same |
| **Failure injection:** each row of §4.1's second table | the exit status; then the surviving session is opened (`openConnection` plans its launch), and the blocked one is refused with the installer's hint | same |
| The vendor step fails under the `vendor` setting; the install is run again with the server reachable | nonzero, then 0; the vendor session then opens | same |
| The module download fails | nonzero; the helper, Node and both lanes were still attempted; the pointer is as it was | same |
| macOS `cua install` | unchanged | `test/runtime-install.test.mjs` |
| The provisioner with no reachable deb: `CUA_DEB=none`; `CUA_DEB=pin` with `curl` failing | `none`: the own runtime installed and registered, no fetch tried. `pin`: the same before the fetch, then the stop | `test/deploy-cloud-vm.test.mjs` |
| Doctor: each row of §4.5 in each status | pass | `test/runtime-linux-doctor.test.mjs`, `test/doctor-engine-linux.test.mjs` |
| `cua profiles bind` loads `classic-level` from the ModuleTree | pass | `test/profiles-commands.test.mjs` |
| The capability home from a source whose pointer is the derived name: managed and local | prepared from the resolved own parts; the fresh home resolves | `test/harness-home.test.mjs`, `test/browser-parity/capability-host.test.mjs`, `test/repl-parity/managed-fixtures.test.mjs` |
| `npm pack` carries `runtime/modules/` and the record | pass | `test/package-contents.test.mjs` |

### 5.2 Acceptance 12, live

One driver runs it on either venue: `scripts/accept/linux-runtime.mjs` (T6). Every home is the run's: `HOME`, the XDG
directories, an empty `claude-secrets` and `CUA_HOME`, as M5 ran (its pre-flight, §1.1). Every window is a harness
window.

**The environment,** the same on both venues, made by the driver's wrapper and shared by doctor, the applications and
the serve:

- `XDG_RUNTIME_DIR`, a directory of the run's, mode 0700;
- a private X server with Openbox: `DISPLAY` and `XAUTHORITY`;
- a private session bus inside it, `dbus-run-session`, whose address is `DBUS_SESSION_BUS_ADDRESS`. Installing D-Bus
  and AT-SPI starts none;
- accessibility turned on before any application starts, with doctor's own command (`A11Y_ENABLE_COMMAND`,
  `src/runtime/linux-desktop.mjs` L107);
- `CUA_SHIM_SANDBOX` unset, so the mode is `scoped`. The driver refuses to start under any other.

Before any cell, `cua doctor --json` must show the four rows of the environment as `pass`: `display`,
`accessibility.bus`, `accessibility.enabled` and `sandbox.userns`. `accessibility.enabled` is `warn` when the property
is false or unread (L121–123 of that file), and a `warn` stops the run. A launch copies exactly these variables to the
runtime (`desktopSessionEnv`, L37–44). `sandbox.launcher` is not among them: an empty home has no helper until E0
installs one. It is checked after each home's install (E0, U2), and no session cell starts in a home where it does not
pass.

**The fixtures.**

- **The item 1 smoke:** `scripts/accept/linux-native.mjs --selection default` (L192). It binds a harness gedit, types
  an ASCII marker, reads it back and takes a screenshot, under the 50 ms sampler
  (`scripts/linux-engine-gate/engine-watch.mjs`). It is not item 6 (finding 12).
- **The item 6 witness** (F10), new, `scripts/accept/linux-text.mjs`: through `cua serve` launched from the own
  parts, in `shared` mode, `typeText` of acceptance 6's own string (`TEXT`, `scripts/linux-engine-diff/text.mjs` L24)
  into the harness gedit. The call must answer success. The field must hold the string exactly, once, read by the
  fixture's own accessibility read (`scripts/linux-engine-diff/oracle.mjs`), never through the engine. Its judge fails
  a field that holds the text twice or with one character changed, by test.
- **The browser-only session,** new, `scripts/accept/linux-browser-only.mjs` (F7), over `cua serve` with
  `CUA_SHIM_SURFACES=browser`:
  - the handshake and the tool list;
  - **the browser service answers:** a cell runs `cua.listBrowsers({emit: false})` and must get a list, empty or
    not (the liveness call, `src/profiles/inventory.mjs` L38). `profiles_list` does not show this: with no ready
    profile it returns before any listing (`src/profiles/commands.mjs` L30–32);
  - a cell imports each of the six packages by name;
  - `sharp` resizes an image `pngjs` made, and `classic-level` writes and reads a key in the session's temp, which
    load each architecture's native code inside the sandbox;
  - **where each import really loaded from.** `import.meta.resolve` gives back the specifier for a package
    (kernel.mjs L345–347), so it shows nothing. The kernel resolves with the conditions `node` and `import` (L309,
    L482–484). By each package's `package.json` in `V/`, three of the six entries are then ES modules,
    `playwright/index.mjs`, `sharp/dist/index.mjs` and `pixelmatch/index.js`, and three are CommonJS,
    `pngjs/lib/png.js`, `jpeg-js/index.js` and `classic-level/index.js`. A CommonJS dependency or a mapped library
    does not identify the entry that imported it, so the entry itself is witnessed, twice:
    - *selected:* the cell makes the kernel's own call for each specifier, `createRequire` from
      `<base>/__node_repl__.cjs` and `resolve` with those conditions (L363–370, L482–484), over the base it reads from
      its own environment. Each selected path is reported. It must be the entry named above and lie under
      `modules/<lock>/`;
    - *opened:* in the traced run, the kernel's process must open each of those six paths, and nothing under
      `runtimes/`.
    `/proc/self/maps` is read for the native `.node` and `libvips` files only, which it does identify;
  - `end_task`; no run entry left.
- **The confinement step,** shared by the smoke and the browser-only fixture, replaces the smoke's present one for
  these runs (finding 11). Its targets are the X server's socket, the session bus's actual socket (parsed from
  `DBUS_SESSION_BUS_ADDRESS`), a TCP listener and a Unix listener the fixture itself opens, as
  `scripts/accept/own-sandbox.mjs` does (L238–239).
  - Positive controls first: the fixture, outside the kernel, connects to each of the four and must succeed.
  - Then the kernel's cell must be refused on each, and the fixture's two listeners must have accepted nothing but
    the controls.
  - The kernel's parents, by the sampler, must include the pinned helper.
- **The profile map's loader,** outside any session: `loadClassicLevel` on the resolved module directory opens a
  store, writes a key and reads it back, as `test/fixtures/classic-level.mjs` does.

| Cell | Home | State | Step | Passing means |
|---|---|---|---|---|
| E0 | empty | – | `cua install` at the head | Exit 0. The tree, helper, Node and engine placed. The pointer is the derived name. `cua doctor --json` is ok: `runtime.installed`, `runtime.modules`, `runtime.node` and `sandbox.launcher` pass; `engine` shows the pinned version, the pin's hash and service `cua` |
| E1 | E | vendor tree present | the item 1 smoke and the item 6 witness, once plain and once under `strace -f` for file and exec calls | Every step passes. No `sky_linux` at any sample. The engine child is the home's `cua-engine`. In the traced run, no call of the serve's process tree names a path under `runtimes/`; the processes traced are listed, and a run whose trace lacks the kernel or the worker does not pass this cell |
| E2 | E | present | the browser-only session, plain and traced; the loader | Every step passes. Each of the six selected entries is the one named, under `modules/<lock>/`, and in the traced run the kernel opened each. The native files mapped are under `modules/<lock>/`. No engine process at any sample |
| E3 | E | `runtimes/` moved out of the home | E1 and E2, plain | as E1 and E2 |
| E4 | E | moved out | a computer session with `CUA_NATIVE_ENGINE=vendor`, then with `"engine": "vendor"` | The open is refused `engine_not_installed`, naming the installer. Nothing is launched. Doctor's `engine` row fails with the sentence. A browser-only session with the variable set still passes |
| E5 | E | moved back | the vendor selection: list the apps, bind a harness gedit, read its tree; no input (M5's fallback observation) | The engine child is this home's `sky_linux_<arch>`, behind the vendor service, and no `cua-engine` runs. A cell's import still loads from `modules/<lock>/`. This is the rollback (L340) |
| U0 | upgraded | installed by the cua before M6a (da7585c3) | at the head, before any install: a session | Refused `runtime_not_installed`, with the vendor tree intact. The sentence names the head's own installer by absolute path and the derived release. Doctor says the same |
| U1 | U | – | the older cua's `cua install` again, as a `cua` on `PATH` would run it | It exits 0 and builds nothing. The session at the head is refused as in U0, word for word. Nothing is launched from the vendor tree |
| U2 | U | – | the command U0 printed | The pointer goes from the vendor name to the derived one, both recorded. The tree is placed; helper, Node and engine are `changed: false`. The vendor tree's `install.json` is the same file |
| U3 | U | `runtimes/` removed | E1 and E2, plain | as E1 and E2 |
| U4 | U | removed | E4 | as E4 |
| U5 | U | removed, and the pointer set back to the vendor name | E1 and E2, plain | as E1 and E2: L162's state, live |

**What each cell does and does not show of item 6** is F10's subject: the witness shows text arriving through the
real facade from the own parts on both architectures; the rest of item 6 is credited from M5.

**Measured and reported, not judged:** the module step's time and bytes on each architecture; `modules/<lock>`'s size;
and the time from `cua serve`'s start to the first cell's answer, 20 samples in E against 20 in a home of the cua
before M6a. A difference above about 50 ms is a finding for the design session.

**Venues.**

- **x64: this machine's private displays** (`scripts/linux-engine-gate/display.mjs`: Xvfb, Openbox), with the
  wrapper's bus inside, each step under the host lock, at the frozen head. The counted x64 evidence is this run.
- **arm64: GitHub's hosted `ubuntu-24.04-arm` runner, under Xvfb,** in a workflow of cua's own,
  `.github/workflows/linux-runtime.yml` (T6; F8). **This venue is plausible, not established:** no cua session has
  run there, and the venue pilot decides it (below).
  - `workflow_dispatch` with the commit, which must be the head of the ref it is dispatched on, as `linux-engine.yml`
    requires. A push of the file registers it from the branch.
  - Two legs, `ubuntu-24.04` and `ubuntu-24.04-arm`. The x64 leg is the arm64 leg's control: one recipe on both, so a
    failure on arm64 alone is the architecture's and a failure on both is the recipe's.
  - Setup: `xvfb`, `dbus`, `at-spi2-core`, `openbox`, `gedit`, `zenity`, `bubblewrap`, `strace`, and `binutils` with
    `xz-utils` for the deb. Then the user-namespace remedy doctor names (`src/runtime/linux-desktop.mjs` L130).
  - The upgraded home is installed by a second worktree at da7585c3, which fetches the pinned arm64 deb from the
    vendor's URL (F8).
  - The log and the artifact carry labels, outcomes, counts and scratch paths, as `sandbox-live`'s do.
- Neither venue needs a `:0` sitting.

**The venue pilot,** in wave 0, on main, before any M6a code exists: the wrapper, doctor's four environment rows,
today's install, then `sandbox.launcher`, the item 1 smoke with the new confinement step, and a traced run, on both
legs. It answers four questions: whether bubblewrap gets its
user namespace there; whether gedit's tree is served on the private bus; whether the positive controls connect and the
kernel is refused; whether `strace -f` follows the helper's children. A no on the first three that the recipe cannot
fix sends arm64 back to a VM, which is the design session's call and cost. A no on the fourth means the traced cells
cannot pass there, and what stands in for them is the design session's too.

**Regression on x64, at the same head.** `launch.mjs` is what every facade suite launches through (the M5
pre-flight, §8.1), so:

- R1 (repl-parity's native suite on both engine lanes; its vendor lane runs the rollback through the real facade,
  and its two text cases run through it too);
- R3 and R4 in the default selection. R4 types acceptance 6's string into gnome-text-editor in `dedicated` mode
  through the real facade (`scripts/accept/linux-device-mode.mjs` L50);
- the `fallback` part in its new form (T5).

R2 is not rerun: it judges the engine's in-cell time, and M6a changes neither the engine nor the service.

**Gates.** `ci-gate` on the head: `test`, `plugin`, `sandbox-live` and the rest GREEN (L217–218).

**Evidence:** `docs/evidence/2026-10-28-own-linux-engine/m6a/{x64,arm64}/`, each cell's report, the head's SHA, and for
arm64 the run's id and its artifact.

**What could cut it,** most likely first:

1. The hosted runner (the venue pilot's four questions).
2. A native package that loads from the vendor tree and not from the ModuleTree inside the sandbox. By reading, the
   rules are the same (finding 10).
3. A harness path that still reaches the vendor tree or the pointer (finding 13), found by R1 and the capability
   home's test.
4. The registry: 23 requests an install, where the other parts make one each.

## 6. The tasks

| T | Scope | Touches | Consumes | Produces, and its proof |
|---|---|---|---|---|
| T1 | **The ModuleTree** (§4.2). The package file, the lock, the provenance and the pin-time script. The closure. The tarball reader. The installer, the payload record and the two checks. `homeLayout` gains `modules` | `runtime/modules/` (`package.json`, `package-lock.json`, `provenance.json`), `scripts/modules-pin.mjs`, `src/runtime/module-tree.mjs` (new), `src/runtime/tarball.mjs` (new), `src/runtime/layout.mjs`, `src/runtime/install.mjs` (the SHA-512 check), `package.json` (`files`), `test/runtime-module-tree.test.mjs`, `test/runtime-tarball.test.mjs`, `test/modules-pin.test.mjs`, `test/package-contents.test.mjs` | the pinned x64 deb, for the pin-time run | **ModuleTree**, which #117 M6 reuses: `loadModuleLock() → {hash, packages}`, `moduleClosure(lock, host)`, `installModuleTree({home, lock, host, fetch, dir}) → {root, moduleDir, lock, changed}`, `readModuleTree(home, lock, host)`, `checkModuleTree(root, record)`, `verifyModuleTree(root, record)`. Failing-first tests for §5.1's first ten rows, on a fixture registry. `provenance.json` as the script wrote it against the real deb, reviewed. **If F1 is ruled for `npm ci`:** the provenance, the closure test and the payload record stay; the installer's body runs npm with `--ignore-scripts` through an injected `run` and then checks the tree against the provenance; the tarball reader goes |
| T2 | **The record and resolution** (§2, §3.1), with `ownInstaller`. `fakeInstalledHome` for a Linux host. `linux-engine-pin.mjs` writes the record's engine version | `runtime/linux-runtime.json`, `src/runtime/manifest.mjs`, `src/runtime/checks.mjs`, `scripts/linux-engine-pin.mjs`, `test/runtime-linux-record.test.mjs`, `test/runtime-manifest.test.mjs`, `test/linux-engine-pin.test.mjs`, `test/fixtures/` | T1 | `loadLinuxRuntime`, `linuxRelease`, `vendorLinuxRuntime`, `ownInstaller`; Linux `locateRuntime` and `resolveRuntime`. §5.1's record, name and resolution rows; darwin unchanged |
| T3 | **Launch and selection** (§3.2–3.5): the Linux Node, the vendor exclusion for both lookups, the engine's minimum at the open, the vendor selection, the trusted paths, the recorder test | `src/runtime/launch.mjs`, `src/runtime/sandbox.mjs`, `src/mcp/connection.mjs` (its header), `scripts/repl-parity/selection.mjs`, `test/runtime-linux-launch.test.mjs`, `test/runtime-linux-engine-selection.test.mjs`, `test/runtime-linux-no-vendor-read.test.mjs`, `test/linux-secrets.test.mjs`, `test/services-sky-linux-launch.test.mjs`, `test/mcp-sandbox.test.mjs`, `test/repl-parity/selection-oracle.test.mjs` | T2 | §5.1's recorder, Node, override, launch, selection and engine-swap rows. Every darwin row of `test/runtime-launch.test.mjs` unchanged. **If F2 is ruled strict:** the Node and the engine must be the pinned ones; the engine moves to an immutable directory per digest, its digest is named to the service and checked before each start, and the swap row becomes two tests that must run the original bytes or refuse (F2 has the cost; T4 and T5 follow the new path). **If F2a keeps the node running cua:** that candidate stays, behind the vendor exclusion, and doctor warns. **If F3 keeps the fallback:** the default cases take the vendor tree when it is installed and refuse when it is not |
| T4 | **Install, migration, doctor, the provisioner** (§4.1, §4.3–4.5) | `src/cli.mjs` (install, `runtime use`), `src/runtime/install.mjs`, `src/runtime/doctor.mjs`, `src/runtime/doctor-engine.mjs`, `deploy/cloud-vm/{cua-provision.sh,render.sh,create-hetzner.sh}`, `test/cli.test.mjs`, `test/runtime-linux-install.test.mjs`, `test/runtime-linux-doctor.test.mjs`, `test/doctor-engine-linux.test.mjs`, `test/deploy-cloud-vm.test.mjs`, `test/profiles-commands.test.mjs` | T1, T2; §3.3's refusal codes, which T3 builds beside it | §5.1's install, failure-injection, provisioner and doctor rows. macOS install and doctor unchanged |
| T5 | **The harnesses follow** (finding 13). repl-parity: the provenance's Node (the managed one on Linux), the engine judge's vendor path through `vendorLinuxRuntime`, the archive cache's module tarballs and `--modules-dir`. native-baseline: the runtime root. **The capability home:** its source is the resolved own parts, not `runtimes/<pointer>`; a managed home is installed from the cache, a local one copies the own parts; the fresh home is checked by resolving it. The `fallback` part: the five shaped homes now expect the refusal, by doctor and by a refused open, with no session. Whatever reads `cua install --json`'s `release`, `root` or `source` | `scripts/repl-parity/{provenance,engine-answered,archive-cache}.mjs`, `scripts/native-baseline/remote.mjs`, `scripts/browser-parity/capability-home.mjs`, `scripts/linux-engine-gate/suites.sh`, `scripts/accept/{linux-fallback,linux-selection}.mjs`, `scripts/probe-secrets.mjs` (a label), `test/repl-parity/`, `test/native-baseline/`, `test/browser-parity/`, `test/harness-home.test.mjs`, `test/accept-linux-selection.test.mjs` | T3, T4 | Tests for each, the capability home's whole preparation among them. R1 run once on x64 as a development run. Reviewed for false greens first, as every harness change since M4 |
| T6 | **The driver, the fixtures and the workflow** (§5.2). In wave 0: the wrapper, the confinement step, the workflow and the venue pilot, on main. Then the item 6 witness, the browser-only fixture and the driver, piloted on both venues | `scripts/accept/{linux-runtime,linux-browser-only,linux-text,linux-confinement}.mjs`, `scripts/accept/linux-native.mjs` (its confinement step), `.github/workflows/linux-runtime.yml`, `test/accept-linux-runtime.test.mjs`, `test/accept-linux-native.test.mjs`, `test/accept-scripts-load.test.mjs` | F8's ruling for the pilot; T4 for the driver | The venue pilot's report on its four questions. Each judge's negative control by test: a doubled or altered text, a kernel that connects, a listener that accepted, a path under `runtimes/` in a trace or a witness. A pilot of every cell on both venues. Reviewed for false greens first |
| T7 | **Docs and the bump.** README's Linux part (L1086–1110 of the README: the two engines, what `cua install` places, the parts with their minimums and overrides, and that an install during a session changes the engine its next launch runs); its Install part and the plugin's update step (L104–109), with the installer the refusal names; its Configuration part and its licence note; `deploy/cloud-vm/README.md` (`CUA_DEB`); the plugin's description and the version. The update step lists the Linux homes the update touches (devcloud VMs, Linux cua devices, the cloud provisioner's devices), each of which needs one install after the M6a release (ruling 1110). The version is allocated at merge: #117's macOS default flip also planned 0.30.0, so whichever lands first takes it and the other rebases to the next minor; T7 writes the bump last, against `main` at that time | `README.md`, `deploy/cloud-vm/README.md`, `.claude-plugin/plugin.json` | – | Each sentence checked against the code at the head. The bump under L218's conditions, written last against `main` |
| T8 | **Acceptance 12, counted** (§5.2), at the frozen head on both venues, with the x64 regression | evidence `m6a/` | the frozen head: T1–T6 | Every cell passes by the driver's own judge. `m6a/README.md` with the cell table, the SHA, the arm64 run's id, and F10's credit stated with its check |
| T9 | **Close-out.** The spec folded: Progress, a Decision Log entry for each ruling of §7, Surprises, Outcomes. A line in #117's spec that the ModuleTree landed here, with any departure from N L204. The whole-branch review by `doperpowers:reviewer-high` (L217). `ci-gate`. The pull request, its body listing every macOS-visible change, the one install every Linux home needs and the command for it | the two specs, the report, `tech-debt-tracker.md` (the engine swap of §3.3; C10) | T7, T8 | The review clean. `ci-gate` GREEN with `test` and `sandbox-live` among those that ran. `MERGEABLE` |

**Order.** Each task is reviewed clean before what consumes it runs.

| Wave | Tasks | Notes |
|---|---|---|
| 0 | T1; T6's wrapper, confinement step, workflow and venue pilot; T7's draft | F8 is ruled (1110), and wave 0 may start beside 0.4.4's reach. The pilot tells on day one whether the hosted runner can be the venue |
| 1 | T2 | |
| 2 | T3 and T4, each in its own worktree | They share no file. T3 merges first |
| 3 | T5; T6's fixtures and driver, and their pilots | at wave 2's reviewed tip |
| 4 | the pilots' fixes, reviewed; the head frozen as H and pushed | |
| 5 | T8 at H: x64 here, arm64 by dispatch | A fix after the freeze follows the M5 pre-flight's §8.1 |
| 6 | T9 | |

**Timeline,** from the approval of this pre-flight, on M5's costs for tasks of these sizes:

| Task | Hours |
|---|---|
| T1 | 12–18 |
| T2 | 5–8 |
| T3 | 8–12 |
| T4 | 12–16 |
| T5 | 8–12 |
| T6 | 12–18, with the pilots |
| T7 | 4–6 |
| T8 | about 3 of machine time on x64 (the cells about an hour with the traced runs; R1, R3 and R4 are planned at 40, 5 and 3); about 45 minutes for the dispatched run |
| T9 | 6–10 |

About three and a half days to the pull request with no cut. Plan for one fix round from the hosted pilot: four to
four and a half. A venue that falls back to a VM adds the VM's day, and a strict ruling of F2 adds about a day for
the engine's new layout. Not counted: usage stops, and the hosted macOS queue for `ci-gate`.

## 7. Design forks, for the design session to rule

Ruled 2026-11-23 (ruling 1110): every fork as recommended.

F1 to F3 and F2a shape the build. F1 decides T1's installer and is needed first; T1's lock, provenance and closure do
not wait for it. F2 and F2a are needed before wave 1, and F3 before wave 2. F8 is needed before the venue pilot. The
rest can be confirmed while wave 0 runs.

| F | Question | Recommendation | Why, and what the other choice costs |
|---|---|---|---|
| **F1** | How is the ModuleTree installed? (a) `npm ci --omit=dev`, the design text (N L204). (b) cua fetches each tarball of the closure, checks its length and SHA-512 and unpacks it itself. (c) A prebuilt tree per architecture, published and attested by this repository as the helper and the engine are | **(b)** | Whichever is ruled, the lock is authenticated at pin time against the vendor archive's lockfile (§4.2; finding 6). Finding 5: the managed Node has no npm, so (a) runs whatever npm the machine has, under the user's npm settings, and needs `--ignore-scripts` to keep `classic-level`'s install script from running. A machine without npm cannot install, and a plugin copy could not install its own runtime (F9). Its real path cannot be unit-tested, where (b) takes a fake `fetch` like every other installer and controls what a tarball may write. (b) keeps one discipline for all four parts: a pinned URL, a pinned length and hash checked before anything reads the bytes, staging, one rename. It costs about 400 lines with the reader and the pin-time script, and a departure from N L204, which #117 M6 inherits. (c) is the most hermetic, one download and the same bytes everywhere, but cua would redistribute third-party packages, among them libvips under the LGPL: an owner's decision, with #120 |
| **F2** | What must be installed for a session to resolve, and how close to its pin must each part be? L158 says "each part present and matching its pin" | **A minimum for each part** (§3.4). Each part a session needs must be one cua installed, with the bytes its record names, at or above that part's minimum: refused below it or without it; run, with a doctor warning, when behind the pin. The minimum is the pin for the module tree and the helper, `NODE_FLOOR` for the managed Node, and `MIN_ENGINE_VERSION` for the engine. Only a named override stands in for a part (F2a). L158's words are amended at the fold (C3) | **Three views.** The adversarial review read L158 as written, every part at its pin, and revision 2 recommended that. The coordinator's view: a pin move that refuses every session needing the moved part, until a manual install the plugin never runs, is a heavy recurring cost, and a per-part minimum, refusing below it and warning in doctor when behind the pin, keeps the vendor-free guarantee without that cost. **Mine is now the coordinator's, and it is the recommendation.** The engine's pin moved three times during M5, and the plugin follows `main` and installs nothing (README L104–109), so strict pins turn each engine release into refused computer sessions on every Linux home. `MIN_ENGINE_VERSION` already states what must not run, and the pull request that makes the service rely on a newer engine raises it (L140). What the review's findings needed holds either way (findings 3 and 4): nothing unrecorded runs, the node running cua and `PATH` are gone, a missing part refuses, and no path under `runtimes/` serves an own lane. **What the minimum costs.** A home can run a Node or an engine behind the pin until its next install, so acceptance speaks for the pin and doctor for the home. And the engine's guarantee is a compatible engine, not these bytes: an install between a connection's open and a launch swaps one for another, as today (finding 15; §3.3), which is said in the README and logged. **If strict is ruled.** Every session runs the pinned bytes or a named override, and the engine must then be bound to them, since a pathname replaced in place is not: an immutable directory per digest under `engine/linux/`, never written twice; the digest named to the service and checked before each start; and tests for open, an install, first use, and for open, idle, relaunch, each of which must run the original bytes or refuse before any other engine runs. Its cost is the recurring refusals above, a new engine layout that the installer, `cua engine build`, doctor, the README, acceptance item 9's path and the harness's readers of the engine's path all follow, a prune for superseded engines, and about a day |
| **F2a** | Which named overrides stand? | **Stand:** `CUA_NODE` and `CUA_LINUX_ENGINE_BIN`, neither ever a path that is, or leads, under `runtimes/`; a recorded local build from `cua engine build`; `CUA_SHIM_SANDBOX=disabled`. Doctor warns of each. **End on Linux:** the node running cua and `node` on `PATH` as Node candidates. `cua install --no-node` stays, and its sessions then need `CUA_NODE` | The four that stand are asked for by name, and the harness and the engine's development use them. An override may replace a pinned part; it may not make the vendor tree a dependency of an own lane, so the Node lookup and the engine lookup carry the same exclusion (§3.3). The two that end are asked for by no one and are the silent path the review found. Keeping the node running cua would let `--no-node` homes run without `CUA_NODE`, behind the exclusion: a part nobody installed and no record names |
| **F3** | M5's F5 and F5a: the default with no usable engine keeps the vendor's engine | **It becomes a refusal** naming the installer and `--engine`: `engine_not_installed`, `engine_outdated`, `engine_unrecorded` | Finding 7: the fallback reads the vendor tree under the default, which L161 excludes. #117 does the same at its M6 (N L192, "from M6: refused"). F5 existed so that an update would not break a home that had not installed; M6a requires an install in any case (F9), and that install places the engine. A sentence naming the fix is better than a silent move to an engine whose text input fails. Keeping the fallback while the tree is present leaves a second reader of the vendor tree for M6b to remove |
| **F4** | `cua install`'s order, and what a failed step does | **Common parts first; each lane on its own; every step attempted; the exit status follows the requested lane** (§4.1) | Finding 8. A failed engine download must not leave a home without its Node or without the rollback. A failed vendor download must fail the command for a home set to `vendor`, whose refusal names that command, and must not fail it for a home that never asked. The simpler rule, every step fatal, makes both servers a dependency of every install |
| **F5** | Under `CUA_NATIVE_ENGINE=vendor`, which module tree do cells import from? | **cua's ModuleTree, as under the default.** The vendor tree gives the engine, its service and that service's own imports | One variable between the two engine lanes of R1, and the ModuleTree exercised on both. The other choice, today's launch whole, also keeps `@oai/*` importable there |
| **F6** | `@oai/*`, `@statsig/*` and `corepack` stop being importable in cells | **A declared difference,** stated in the README | They are the vendor's code, its telemetry client and its Node's tool. cua's text names none. The ModuleTree could carry the two public ones if the design session wants the importable set unchanged; each would then need its own line in the provenance |
| **F7** | How deep is the browser-only check? | **The session; a `cua.listBrowsers` call the browser service answers; the six imports, each entry witnessed as selected and as opened, with `sharp` and `classic-level` run natively; the confinement step with its controls; the profile map's loader. No tab** | M6a changes what a browser-only launch resolves and imports, not the browser route, and the liveness call shows the service is loaded and answering from the own parts. A tab needs a harness Chrome with cua's extension and a bound profile on each venue, which no Linux harness has yet, and on x64 the VM's Chrome is on `:0` |
| **F8** | The arm64 venue. (i) A workflow of cua's own, or a ci-kit lane? (ii) May its upgraded home fetch the vendor deb on the runner? L186 says the vendor package is not fetched in CI. (iii) What if the venue pilot fails? | **(i) cua's own dispatch-only workflow, both legs.** A lasting gate is the M5 pre-flight's F7 ticket and CI-opt's. **(ii) Yes, on this dispatch-only lane. (iii) An arm64 VM, as M5 used, on the design session's word** | (i) Finding 11. The venue is plausible and not established until the pilot passes. (ii) The upgrade through the older cua's real install is what a user meets (U0 to U2), and arm64 has no other venue. L186 was written for comparisons against the vendor, and the hosted macOS gates already install from the vendor's macOS archive (`.github/ci-kit.yml`, `sandbox-live` and `parity-browser`). If no: the upgraded home is built without the vendor step, as L162 states it, U1 cannot run there, and the venue pilot waits for T4 |
| **F9** | The upgrade. After the update every Linux home needs one install, and until then every session is refused (L159). Which command does the refusal name? | **This cua's own installer, by absolute path, with the release it installs** (§3.1, §4.3). The README's update step says the same. `cua install`, unqualified, is named nowhere on Linux | Finding 9: a `cua` on `PATH` from an older checkout succeeds and fixes nothing. The plugin copy can install its own runtime, since the install needs no npm (F1). The other choices: tell the user to update the checkout first, which leaves two versions to keep in step; or have `cua serve` install at start, which puts downloads in a session's open and was not asked for |
| **F10** | Acceptance 12's computer session is "items 1 and 6" (L205). Item 6's own suites are V1 and V4, on `:0`, against the engine directly. What does M6a run? | **Credit M5's item 6 evidence, and repeat a named witness.** The credit holds only while the engine and its service are the bytes M5 accepted: at the frozen head, the engine pin's two hashes are M5's, and `native/linux-engine/` and `src/services/engine/linux/` do not differ from da7585c3. T8 records the command and its output. The witness is `linux-text.mjs` on both architectures in every home state, with R4 and R1's two text cases on x64 (§5.2). The ASCII smoke is never called item 6 | Finding 12. V1 and V4 never pass through resolution or launch, so rerunning them would re-prove the engine and show nothing of M6a. What M6a can break is the path from the own parts to the engine: the launch, the service's module, the binary the install placed. The witness covers that with item 6's own string. It does not cover Chrome's textarea and address bar, the paste safety cases or the bus trace, which are credited. Running V1 and V4 instead needs a `:0` sitting on x64 and has no arm64 machine. If the engine pin has moved by the freeze, the credit is to that release's own acceptance, or it fails and the suites run. Ruled with 0.4.4 in view (1110): 0.4.4 changes only the drop settle and the handle end (`pointer.rs`, `handle.rs`, `drop_settle.rs`), and its reach (ruling 1102) left the text path out as untouched, so with 0.4.4 pinned the credit is to M5's item 6 evidence through that diff; T8 records `git diff --stat linux-engine-v0.4.3 <tag of the pin> -- native/linux-engine` and the service's diff from da7585c3 |

## 8. Conflicts and ambiguities

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| C1 | `classic-level` goes "into cua's own dependencies" and the Touches name `package.json`; the Interfaces put it in the ModuleTree | N L204, L342 against N L640, L511 | The ModuleTree. A plugin checkout has no `node_modules`, so a root dependency would not load there, and the loader's call is unchanged. `package.json` changes only its `files` |
| C2 | The record's four values repeat the four pins | L157, L511 | Kept as the spec says, bound at load and by test, and written by the pin script (§2). Deriving the record from the pins with no file would also work; it is simpler and cannot drift, and loses the one reviewable statement of the runtime |
| C3 | L158 requires every part, at its pin; L160 says a browser-only session needs no engine; F2 recommends a minimum where L158 says the pin | L158, L160 | "Each part the session needs", at or above its minimum (§3.4). The fold rewords L158 to F2's ruling: the minimum, or the pin with the engine bound to its bytes |
| C4 | The spec does not say whether the pointer still selects | L157, L159 | It records (§4.3) |
| C5 | An older cua sharing a home fails on the derived name, and its `cua install` does not serve the newer one | manifest.mjs L160–164; README L104–109 | The named installer (F9). Said in the pull request and the README |
| C6 | `cua install --engine` is described as installing the engine on its own; the code runs every step and only makes the engine required | README L1094 against cli.mjs L170–172 | T7 words it as §4.1 does: it requests the engine's lane |
| C7 | "With the vendor tree unavailable, only `CUA_NATIVE_ENGINE=vendor` is refused" | L205 | True of the acceptance homes, whose own parts are installed. A browser-only session is not refused even with the variable set (§3.3) |
| C8 | M6a's Touches omit the harnesses, `doctor-engine.mjs`, `sandbox.mjs`, the workflow and the provisioner | L342 | Each task's list here supersedes it, as M5's C1 did |
| C9 | The macOS deny list does not re-expose `modules/` | policy.mjs L127 | #117 M6's, with its baseline. M6a touches no macOS launch |
| C10 | `verify.mjs` on Linux judges the process tree by the release's root, a rule from before cua's own host there | `verify.mjs` L273, L289 | Not M6a's proof and not changed. T9 adds a line to `tech-debt-tracker.md` |
| C11 | A missing Node is `repl_host_node` today, and a missing helper `sandbox_unavailable`; L159 names `runtime_not_installed` | launch.mjs L615; linux.mjs L93–95 | The Node's absence becomes `runtime_not_installed`. The helper keeps its code, which every confined launch already meets, with the installer's hint |
| C12 | "A computer session (items 1 and 6)" reads as if one fixture showed both | L205 against L199 | F10 |

## 9. Sources, and what was not verified

**Sources** (read 2026-11-22).

- The code and the two specs at da7585c3.
- `V/` on the x64 VM: each package's `package.json`, `.pnpm/lock.yaml`, `.modules.yaml`, `cua_node/manifest.json`,
  and the native files' sizes and one hash.
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
  tree's lockfile, and that the arm64 archive's lockfile is the same is for `modules-pin.mjs` to show.
- The hosted venue, whole: bubblewrap's user namespace there, gedit's tree on a private bus under Xvfb, the positive
  controls, and `strace -f` following the helper's children. The venue pilot checks all four first.
- The other 18 packages' integrity against the registry, of the 25 over both architectures: they are the vendor
  lock's values, and the pin-time script fetches each.
- That an npm lockfile's traversal yields the vendor's closure on both architectures. T1's test and the pin script
  decide it.
- The tarballs' lengths, and that every one of them holds only files and directories under one top directory.
- That the recorder sees every read these modules make. It wraps the synchronous and callback functions and
  `fs.promises`; a read through another route would escape it, and the traced live cell is the check on that.
- The import witness. The six entries are read off each package's `exports`, `main` and `type` in `V/`; no
  resolution was run. That a cell can make the kernel's call is by `own-sandbox.mjs`'s probe, which reaches
  `createRequire` and `/proc/self/environ` (L101, L106, L116); that `/proc/self/maps` is as readable is assumed. The
  "opened" half depends on the trace reaching the kernel's process.
- That `oracle.mjs` reads gedit's field on the runner with `busctl` alone.
- `sharp` and `classic-level` loading inside the sandbox from `modules/`. They load today from `runtimes/`, and the
  Linux deny list treats the two alike by reading.
- How R1's prepared homes and the capability home behave with a module step. Neither has one today.
- The session's open time with the record's binding and the tree's check in it.
- That no script outside finding 13 and T5's list reads the pointer, or `cua install --json`'s `source` or `root`, on
  Linux.
- Nothing was run. Every statement about behaviour after the change is design, and every statement about today's is
  from reading the code.
