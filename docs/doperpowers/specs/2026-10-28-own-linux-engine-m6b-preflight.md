# #171 M6b pre-flight (draft for the design session)

- Spec: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, cited as `L<n>` (the spec at 84216c0fe).
  M6a's pre-flight, `…-m6a-preflight.md`, is cited as `M6a §<n>`. Code is cited as `file L<n>`, at 84216c0fe.
- Base: `feat/171-m6b` = main 854103aa5 (0.4.5's merge, #585) plus the Decision Log entry of M6b's start (L2938–2950).
  Plugin 0.29.21. Engine 0.4.5 pinned, `MIN_ENGINE_VERSION` 0.4.5 (`src/services/engine/linux/client.mjs` L37). The
  Linux runtime is `cua-linux-<arch>-e0.4.5-n24.22.0-s0.163.0-mb71dc1f8185d` (`runtime/linux-runtime.json`).
- **Ruled before this pre-flight,** and folded in as constraints, not forks: 1193 (a) to (c) (L2898–2903), 1212 and
  #570 (L2943–2948), the Linux vendor lanes deleted with M5's sitting cited (the brief; L206, L3040), and 1211:
  nothing in M6b installs or updates an engine by itself (L2949).
- Two names stand for values the build fills in. `<R>` is the cua release that carries M6b, by its plugin version
  (F1). `<installer>` is `node <this checkout>/bin/cua.mjs install` (`ownInstaller`, `src/runtime/installer.mjs`
  L13–16).
- Dispositions in §1: **D** deleted, **M** moved to cua's own parts, **K** kept.
- This pre-flight ran no cua code, wrote to no cua home and touched no ticket. It read the code, the two specs and
  M6a's evidence, and this VM's default home: a listing of its `runtimes/`, the release's `install.json`, its size
  and one file's hash. It has had no adversarial review.
- Loop tasks continue from task 165. "T" numbers are this document's rows. The build's branch is `feat/171-m6b`.
- The plan below is written on the recommendations of §7. Each task says what a different ruling changes.

## 0. What the reading found

1. **Three things still reach the vendor's package on Linux.** The vendor selection resolves its tree
   (`src/runtime/launch.mjs` L555, L607–616). `cua install` places it as its last lane
   (`src/runtime/linux-install.mjs` L129–141). Doctor reports it in one row (`src/runtime/doctor-linux-runtime.mjs`
   L140–155). The rest of `src/` is what serves those three: the deb pins and their parser, the deb's unpacking, and
   the sentences that offer the vendor engine as a way out.
2. **M6b moves no pin, so no home needs an install to keep its sessions.** The derived release is the one main
   installs today. A home's vendor tree therefore stays on disk, read by nothing, until that home's next `cua install`.
   One kind of home is met by the update at once: one whose environment or `engine.json` selects `vendor` is refused.
3. **The install record cannot vouch for the tree's bytes.** `cua install` writes `{schema, release, archive:
   {sha256, length}, source, installedAt}` beside the release (`src/runtime/install.mjs` L116). It names the archive,
   not what was unpacked, and the deb is not there to compare with. So 1193 (b)'s "verified against that record" needs
   a stated meaning (§3.2, F4).
4. **The removal cannot take its facts from the deb records.** 1193 (a) keeps those records out of install's reach,
   and install is where the removal runs. It needs the two releases' names, hashes and lengths as its own constants
   (§3.1).
5. **cua has removed from a release tree before, and wrote down why it was careful.** `cua install
   --prune-leftovers` renames the Codex CLI aside before deleting it, and defers while a session may run
   (`src/runtime/codex-leftovers.mjs` L123–130, L142–156). Its reason: an older cua on Linux's vendor host may run
   its kernel unconfined after that CLI fails to launch (#135). Deleting a whole tree in place can pass through a
   state where the launcher is gone and the Node is not; renaming the tree away in one step cannot (§3.3, F3).
6. **The engine's gate takes the pinned vendor build from the run home's `runtimes/`**
   (`scripts/linux-engine-gate/gate.mjs` L76, L85–87). After M6b no fresh home holds one, so every gate step that
   compares against the vendor loses its path. The next engine release needs those steps (F7).
7. **`sky_linux` must stay nameable in one role.** Acceptance item 1 is "no vendor process" (L192), and the watches
   that prove it look for that name (`scripts/linux-engine-gate/engine-watch.mjs` L19;
   `scripts/accept/linux-runtime-watch.mjs` L15, L73; `scripts/accept/linux-trace.mjs` L304). The spec's "the
   `sky_linux` patterns are removed" (L164) is read as: nothing expects that process, and something still detects it.
8. **The last vendor lane that ran is M6a's, not M5's.** R1 ran both engine lanes at f41546d08 on 0.4.4, with a diff
   of 0 and the three declared defects, and its vendor lane is stored
   (`docs/evidence/2026-10-28-own-linux-engine/m6a/x64/regression/parity/vendor/`). R2's vendor lanes last ran in M5.
9. **Four shared harness sites select the vendor engine for `cua install`,** so that a macOS install builds no
   engine (#117 M4): `scripts/repl-parity/remote-device.mjs` L35, `scripts/repl-parity/selection-device.mjs` L76,
   `scripts/native-baseline/prepare.mjs` L167, `scripts/browser-parity/capability-home.mjs` L38. They run on Linux
   devices too, where that selection becomes a refusal.
10. **Practice and the spec disagree on the bump, and the sentence must name the release.** L218 says a minor bump.
    Since 0.29.0 every initiative has taken the next patch at merge (M6a took 0.29.19; ruling 1110, "the version is
    allocated at merge"). 1193 (c) puts the release's name into a sentence that stays (F1).
11. **The tree is about 211 MB in this home.** `runtimes/26.928.40906-linux-x64/` holds `cua_node/` and
    `install.json`, 211,063,820 bytes by `du -sb`. Over its history the Linux pin also listed `codex` (until #115 M3,
    ef127143d) and a `chrome-plugin` directory (until #79, 7ae266b08), so an old home's tree may hold those too.
12. **The arm64 VM ends on 2026-11-26T01:00Z,** and with it the only arm64 home holding the pinned vendor build
    outside OpenAI's pool. M6b's own acceptance does not need it. F7 says what a later engine release would.

## 1. The inventory

### 1.1 `runtime/`

| Place | What it is | After | Why |
|---|---|---|---|
| `runtime/releases/26.928.40906-linux-x64.json`, `…-linux-arm64.json` | the deb pins: URL, length, SHA-256, `notes` (how the hash was checked), and what to unpack and where (`components`, `runtime`, `layout`, L13–31 of each) | **M** to `runtime/provenance/`, trimmed to what names an archive (§4) | 1193 (a) |
| `runtime/releases/26.928.40906-darwin-arm64.json` | the macOS pin | **K** | macOS |
| `runtime/releases/node/`, `runtime/sandbox/`, `runtime/engine/`, `runtime/linux-runtime.json`, `runtime/modules/package.json`, `package-lock.json` | cua's own pins | **K** | – |
| `runtime/modules/provenance.json`, its `vendor` list: for each deb its release, archive SHA-256 and lockfile SHA-256 (parsed at `src/runtime/module-tree.mjs` L191–198) | what the lock was checked against | **K** | A fact inside the module pin, with no URL. Install parses it today and nothing can install from it |
| `package.json` L25, `files`: `runtime/releases/` | what the npm package ships | **K**; `runtime/provenance/` is not added | the records are a checkout's, for `scripts/modules-pin.mjs` |

### 1.2 `src/`

| Place | What it does with the vendor's Linux package | After | Why |
|---|---|---|---|
| `runtime/manifest.mjs` L53 `LINUX_LAYOUT_KEYS`; `parsePin`'s Linux branches (L109–111, L118, L120–121, L135, L139, L142, L147, L156–157); header L8–12 | parses a deb pin | **D**. `parsePin` refuses `platform: "linux"` as `invalid_pin`, naming `runtime/linux-runtime.json` as Linux's record | L164. A deb record put back into `runtime/releases/` then cannot load |
| `manifest.mjs` L57–60 `installHint`, its Linux half (`--archive <ChatGPT deb>`) | the vendor tree's remedy | **D** | no vendor tree has a remedy |
| `manifest.mjs` L174–181 `vendorPinsOf`, `RESTORE_PINS` | keeps a pin error inside the vendor's lane | **D** | no lane |
| `manifest.mjs` L316, `unknown_release`'s hint: "CUA_NATIVE_ENGINE=vendor selects the vendor's engine" | names the vendor engine | reworded: "on Linux this cua resolves only its own runtime" | 1212's rule, applied to every sentence |
| `manifest.mjs` L338–363 `vendorLinuxRuntime` | finds the vendor tree for the vendor selection | **D** | L164 |
| `manifest.mjs` `loadPins` L160, `selectPin` L201, `findPin` L211, `runtimeFor` L218, `readInstalledRecord` L224, the darwin half of `locateRuntime` and `resolveRuntime` (L374–381, L394–396) | macOS's resolution | **K** | macOS |
| `manifest.mjs` L187–194, L236–329: the pointer's rule, the Linux record, `locateOwnLinuxRuntime` | cua's own runtime | **K** | – |
| `runtime/launch.mjs` L552–555, the vendor selection; L607–616 `vendorEngineTree`; the `vendor` seam (L532, L552) | resolves the tree | **D**; `vendor` set on Linux is refused `engine_retired` (§2.1) | L164, 1193 (c) |
| `launch.mjs` L290–297, L315, L349: `vendorEngine` in `buildLaunch`, its trusted path, `OAI_SKY_LINUX_BIN` and the vendor service; header L62–65 | launches the vendor engine | **D**. A Linux computer launch requires `replHost.engine.bin` | L164 |
| `launch.mjs` L579, the refusal's tail: "(or a local build with `cua engine build`), or set CUA_NATIVE_ENGINE=vendor for the vendor engine" | offers the vendor engine | the one remedy (§2.2) | 1212 |
| `launch.mjs` L490–493: the defaults and `['vendor', 'cua']` | the setting's values, for both platforms | **K** | macOS's default is `vendor`; on Linux `vendor` stays a known value, so that it is refused by name |
| `runtime/vendor-tree.mjs`, whole; its callers `launch.mjs` L564, L585, L728, L744, `runtime/sandbox.mjs` L267–313, `runtime/linux-engine.mjs` L145, `secrets/project.mjs` L37, `runtime/doctor-engine.mjs` L77 | keeps every own lookup out of `<home>/runtimes/` (M6a's F2a) | **K**, unchanged | A home may still hold a tree: before its next install, or one the removal left in place |
| `runtime/install.mjs` L69–70 `DEB_TOOLS`, `DEB_PAYLOAD`; L84; the deb halves of `withStage` (L129–130, L141) and `snapshotArchive` (L259); `extractDeb` L155–160; the `activate` option (L79), which only Linux passed; header L18–24 | acquires and unpacks the deb | **D** | L164 |
| `install.mjs` L184–187, `release_refused` and its hint naming `CUA_NATIVE_ENGINE=vendor` | `cua runtime use <vendor release>` | **D**; the name is `unknown_release` like any other | no pin recognises it |
| `install.mjs` `installRuntime`'s zip path, `download`, `verifyArchive`, `installSandboxHelper`, `installLinuxEngine`, `installMacosEngine` | macOS's install; cua's own parts | **K** | – |
| `runtime/linux-install.mjs` L129–141, lane 7; L68–72 `requestedLanes`' vendor half; L85–86 `--release`; L153–154; L162–163; the "other engine" of `readiness` and `opensNow` (L215–216, L257–258) | installs the tree and reports the vendor engine as an alternative | **D**; step 7 becomes the removal (§3) | acceptance 13, 1193 (b) |
| `runtime/vendor-removal.mjs` | – | **new** (§3) | 1193 (b) |
| `runtime/doctor-linux-runtime.mjs` L140–155 `vendorRow`, L69; header L19–23 | the `runtime.vendor` row | **D** | acceptance 13 |
| `doctor-linux-runtime.mjs` L91: a pointer naming a vendor release, told by the pins or by its leading digit | words of `runtime.installed`'s warning | **K**, by the name's form alone | it describes `current.json`, not the tree |
| `runtime/doctor.mjs` L133–141 (the vendor pins and `pinsError`), L214 (the `vendor` seam); header L52–55 | feeds `runtime.vendor` and the vendor selection | **D** on Linux | – |
| `doctor.mjs` L199 `leftoversCheck`, and `runtime/codex-leftovers.mjs` L36 (`codex`), L83–107 (the scan of release trees) | names the Codex CLI's `codex` file inside a Linux release | **D** on Linux: there the row reads the home's `state/codex` only | the whole release goes (§3), and doctor then lists nothing under `runtimes/` |
| `doctor.mjs` L173–187, `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc`, `runtime.signatures`; `runtime/checks.mjs` | macOS's rows and checks | **K**; the branches for a pin with no IPC or no signing (`checks.mjs` L42, L69; `doctor.mjs` L188–190) go, dead once no Linux pin parses | macOS |
| `runtime/doctor-engine.mjs` L237–244, the vendor engine preferred on Linux (`skip`, or `fail` without its tree); L219–221 `SETTING_FIX.engine` ("name vendor or cua"); L192–193 | the `engine` row | `fail` with the `engine_retired` sentence (§2.3) | 1193 (c) |
| `src/cli.mjs` L48, L77–85, L86–89, L114 (usage); L189, L204 (`--archive`, `--release` on Linux) | the flags and their text | on Linux both flags are a usage error (§3.5) | no deb to take |
| `mcp/surface.mjs` L279 `LINUX_COMPUTER_RULES.vendor`, L291; note L267–270 | the `js` tool's rule for the vendor engine on Linux | **D** for Linux; macOS keeps both sets | no Linux session can select it |
| `mcp/connection.mjs` L5–8, L135; `runtime/layout.mjs` L2 | comments | reworded | – |
| `services/engine/linux/client.mjs` L47, L71: "cua-engine `<found>` is older than `<min>`, which this cua needs; run `<installer> --engine`" | the service's own refusal | **K**: already the one remedy; a test pins it | 1212 |
| `services/sky.mjs` L23–52, `repl-host/supervisor.mjs` L11, L18–19, `runtime/sandbox.mjs` L9, L32, `runtime/linux-desktop.mjs` L4, `services/engine/linux/*.mjs` | comments that name `sky_linux` or the vendor as where a ported behaviour came from | **K**, untouched | Provenance of ported code. And leaving the service, the facade and the host byte-identical is what §5.3's credit rests on |

### 1.3 Scripts and harnesses

| Place | What it does | After | Why |
|---|---|---|---|
| `scripts/modules-pin.mjs` L32, L59, L286: `loadPins()` filtered to Linux, matched to a deb by length and SHA-256 | the authenticator | **K**; reads `runtime/provenance/` through its own strict reader (§4) | 1193 (a) |
| `scripts/sandbox-probe/linux-probes.mjs` (460 lines; L416–438 read `codexCli` and `skyLinuxBin` off the resolved runtime) | #115 M0c's probes; no caller | **D**, with `test/sandbox-probe/linux-probes.test.mjs`; its evidence stays (F8) | #570 |
| `scripts/repl-parity.mjs` L50–55, L67; `scripts/repl-parity/native.mjs` L15–16: a Linux native run names `--engine`, vendor or cua | the engine lanes of the native suite | the vendor lane **D**: on Linux `--engine vendor` is refused, citing where its last run is stored | ruled |
| `scripts/repl-parity/native-linux.mjs` (the diff of a vendor run and a cua run, L49–65), `scripts/repl-parity/expected/native-linux.json`, `scripts/repl-parity/vendor-defects.mjs`, `vendor-release.mjs`, and the 6 Linux engine entries of `test/repl-parity/vendor-defects.json` | judge two stored runs | **K** (F6) | They read run directories, not engines. M5's and M6a's stored lanes are re-judged through them, as task 139 did |
| `scripts/repl-parity/engine-answered.mjs` L12, L129–131: the vendor lane's expected engine, from `vendorLinuxRuntime` | says which engine a lane must have run | the vendor expectation **D**. `engineKind` and `serviceKind` (L27–37) **K**: a `sky_linux` under the worker still fails a cua lane | finding 7; ruling 1175's exported shape is kept |
| `scripts/repl-parity/provenance.mjs` L28, `vendorRelease` from `selectPin` on Linux | records the vendor release a run could use | **D** on Linux | no Linux pin |
| `scripts/repl-parity/archive-cache.mjs` L37–40, L62: the vendor archive in the parity cache, and `--archive` in `installArgs` | prepares scratch homes | **D** on Linux | – |
| `remote-device.mjs` L35, `selection-device.mjs` L76, `native-baseline/prepare.mjs` L167, `browser-parity/capability-home.mjs` L38 | `CUA_NATIVE_ENGINE=vendor` on `cua install` | set on macOS only | finding 9 |
| `scripts/repl-parity/selection.mjs` L50–57, the oracle's Linux table: `vendor` passes with its tree, else `engine_not_installed` | the independent table of the selection | `vendor` is `engine_retired`; the `vendorTree` input goes | mirrors §2.1 |
| `scripts/native-baseline/engine.mjs` L60; `scripts/native-baseline.mjs` L38: a Linux run names its engine | the lanes of the native baseline | the vendor lane **D**, refused as above | ruled |
| `scripts/native-baseline/compare.mjs` (`compare --engines`), `summary.mjs` L78–82 | judge stored runs | **K** (F6) | as `native-linux.mjs` |
| `scripts/native-baseline/remote.mjs` L12, L122–131 (`runtimeRoot` from `vendorLinuxRuntime`), L239; `linux.mjs` L94–95 (`ps` for `sky_linux`, classified by that root), L172–176; `linux-cells.mjs` L1 | list the helpers a run met | **M**: they list `cua-engine` by the run home's engine; a `sky_linux` seen is recorded as foreign | L164 |
| `scripts/probe/lib.mjs` L82, the reason `verify.mjs` skips its socket step on Linux: "the computer-use helper (sky_linux) is a child process…" | wording | **M**: names `cua-engine` | L164 |
| `scripts/linux-engine-gate/suites.sh` L135–137 (R1's vendor run and the diff), L150 (R2's vendor runs); `steps.mjs` L109, L114 | the facade suites in the gate | R1 is the cua lane alone; R2 **D** as a step | ruled; R2 is a comparison of two lanes |
| `scripts/linux-engine-gate/gate.mjs` L76, L85–88 `defaultsFor`: the pinned vendor build and the vendor's client from the run home's `runtimes/` | feeds `--vendor` and `--vendor-js` to every differential step | **M**: from a harness directory outside any cua home, by a recorded hash (F7) | finding 6 |
| `scripts/linux-engine-diff.mjs` and `scripts/linux-engine-diff/` (`vendor-js.mjs`, `wire-check.mjs`, `services.mjs`, `scene-ended.mjs`, `xprobe/`), the gate's differential steps | drive vendor binaries given by path, beside cua's | **K** (F7) | The engine's instrument. It never went through selection or install, and the spec's M6b names none of it (L348) |
| `scripts/linux-engine-gate/engine-watch.mjs` L19; `scripts/accept/linux-runtime-watch.mjs` L15, L73; `scripts/accept/linux-trace.mjs` L304 | detect a `sky_linux` | **K** | finding 7 |
| `scripts/accept/linux-runtime-watch.mjs` L88–92 `vendorEngineProblems`; `scripts/accept/linux-text.mjs` L11, L96 (`--read-only`, E5's rollback); `linux-runtime-cells.mjs` L18–19, L112–121; `linux-runtime.mjs` L304–329, L370–375, L430–460 | acceptance 12's vendor cells | **D**; the driver becomes acceptance 13's (§5.2) | the rollback is what M6b retires |
| `scripts/accept/linux-fallback.mjs`, `linux-selection.mjs`, `scripts/linux-engine-gate/fallback-home.mjs` | the five homes with no usable engine of cua's | **K**; their expected sentences follow 1212 | – |
| `scripts/accept-native.mjs`, `scripts/accept/{engine-lane,compat-route,own-sandbox,reinstall,install-item}.mjs`, `scripts/native-matrix*`, `scripts/cursor-sitting*`, `scripts/probe-lifecycle.mjs`, `scripts/sandbox-probe/{experiment.mjs,hosted-gate.sh}`, `scripts/repl-parity/native-mac*.mjs`, `verify.mjs` L48 | name the vendor engine or host on macOS | **K** | macOS |

### 1.4 Tests

| Tests | After |
|---|---|
| `test/runtime-linux-install.test.mjs`, whole (the deb's install, L27–108); `test/sandbox-probe/linux-probes.test.mjs` | **D** with their subjects |
| `test/runtime-manifest.test.mjs` L88, L96, L119 (the Linux pins), L198 (the deb hint), L381, L398 (`vendorLinuxRuntime`) | **D**; in their place: a Linux pin is `invalid_pin`, and the two records load from `runtime/provenance/` only through the script's reader |
| `test/runtime-linux-engine-selection.test.mjs` L267, L281; `test/runtime-linux-launch.test.mjs` L171, L191; `test/serve-lazy.test.mjs` L548; `test/doctor-engine-linux.test.mjs` L140, L195, L208 | **D**; in their place the rows of §5.1 for `engine_retired` and 1212 |
| `test/cli-linux-install.test.mjs` L155, L204, L226, L240, L253, L295, L312, L391, L444, L543 | the vendor lane's cases **D**; the removal's and the flags' cases in their place |
| `test/runtime-linux-doctor.test.mjs` L94, L118, L309, L336, L347 | `runtime.vendor`'s cases **D**; the healthy home asserts no vendor row |
| `test/runtime-codex-leftovers.test.mjs` L195 (Linux's `codex` file) | **D**; in its place: on Linux the scan lists nothing under `runtimes/` |
| `test/fixtures/runtime-fixture.mjs` L158–170, L223 (`linuxDebFixture`, `linuxFixturePin`); `test/fixtures/installed-home.mjs`; `test/fixtures/linux-native-runtime.mjs` (a fake vendor service and a fake `sky_linux`) | **M**: a Linux fixture home holds cua's own parts and an engine double behind cua's real service |
| `test/repl-host/linux-native.test.mjs` L132, L179; `test/repl-host/linux-native-runtime-fixture.test.mjs`; `test/linux-secrets.test.mjs` L56–73; `test/linux-sandbox-refusal.test.mjs` L171; `test/mcp-browser-surface.test.mjs` L542 | **M**: the same assertions about the host, the wrapper and the sandbox, on that fixture. `linux-native.test.mjs` L227 already runs so |
| `test/runtime-linux-no-vendor-read.test.mjs` | **K**, and extended: doctor joins the recorded entry points (§4.3) |
| `test/services-sky-linux-launch.test.mjs`, `test/services-sky-linux-policy.test.mjs`, `test/services-sky.test.mjs` | **K**: the wrapper against a delegate double, whatever service it stands for |
| `test/repl-parity/{engine-answered,native-linux-selection,provenance,selection-oracle}.test.mjs`, `serve-native.mjs`; `test/native-baseline/{engine,linux,linux-engine,remote,run}.test.mjs`; `test/linux-engine-diff/gate-runner.test.mjs` L266–271; `test/browser-parity/capability-host.test.mjs` L122–143; `test/probe-lib.test.mjs` L59; `test/accept-linux-{runtime,runtime-cells,selection}.test.mjs` | follow their scripts (§1.3) |
| `test/repl-parity/{native-linux-expected,native-linux-arm64,vendor-defects}.test.mjs`; `test/native-baseline/compare*.test.mjs` | **K** with their judges (F6) |
| `test/cua-api/linux-engine-document.test.mjs` L158 | **K**: the Linux document already names no engine |
| `test/deploy-cloud-vm.test.mjs` L40–46, L94–98 | follow the provisioner (§3.6) |

### 1.5 Docs, deploy, skills and the plugin's text

| Place | Says today | After |
|---|---|---|
| `README.md` L33, L68 (Install) | OpenAI's Linux package "only for `CUA_NATIVE_ENGINE=vendor`"; install tries it | no OpenAI package on Linux |
| `README.md` L125–144, "Updating on Linux" | one install per home since M6a | adds `<R>`: sessions need no install; a home that selects `vendor` is refused; the next install removes OpenAI's package and says so, and the installer run now removes it now |
| `README.md` L1275–1287 | the vendor engine as the second of two, "the rollback" | one engine; a sentence that the vendor's was removed in `<R>`, with M5's and M6a's evidence cited for what it was measured against |
| `README.md` L1301–1308 (the cloud template), L1330 (`ar`, `tar`, `xz`), L1342, L1347–1352 ("OpenAI's deb, for the vendor engine only") | the deb, its tools, a mirror, `--archive` | **D** |
| `README.md` L1373, L1436–1442 | `sky_linux`'s `list_apps`; the vendor engine's typing caveats | the engine's inventory; the caveats **D** |
| `README.md` L1449–1450 (doctor), L1466–1483, L1504–1511 (install's steps), L1532–1538 (selection), L1557–1568, L1580 | `runtime.vendor`; step 7; "`vendor` in either selects the vendor engine"; "what a session sees that the vendor engine does not answer" | the rows of §2.3; the removal step; the refusal; the same list, said of cua's engine alone |
| `README.md` L1842, L1847 (Configuration), L1934 (Licences) | `runtimes/` "on Linux only for `CUA_NATIVE_ENGINE=vendor`"; `CUA_NATIVE_ENGINE` "`vendor` or `cua`" | macOS only; on Linux `cua`, with `vendor` refused since `<R>`; the vendor runtime is macOS's |
| `deploy/cloud-vm/render.sh` L5, L8–12, L22–31, L45–49, L61; `create-hetzner.sh` L8–13, L28, L52–62, L104–105; `cua-provision.sh` L10–15, L31–50, L82–143, L153, L174; `deploy/cloud-vm/README.md` L21–24, L43, L82–91, L127, L147 | `--deb` and `CUA_DEB`; the fetch, the wait and `--archive` | **D** (§3.6, F9) |
| `skills/cua-remote/SKILL.md` L27 | "keep a copy of the deb for `--archive`" | **D** |
| `.claude-plugin/plugin.json` L3 | "(OpenAI's with CUA_NATIVE_ENGINE=vendor)" | **D**; and the version (F1) |
| `package.json` L5; `CLAUDE.md` L3–4, L20 | "for OpenAI's computer-use runtime on macOS and Linux"; "the pinned vendor release relocated under `CUA_HOME`" | macOS's vendor runtime, Linux's own |
| `docs/cua-api/linux-engine.md`, `core.md` | nothing of the vendor engine | **K**, unchanged |
| `tech-debt-tracker.md` L6 | #570 | removed at close-out |
| the spec L155–164, L206, L346–348 | "Retirement (M6b)" | folded with what was built (T8) |

### 1.6 CI

| Place | What | After |
|---|---|---|
| `.github/workflows/linux-runtime.yml` L1–13, L31, L35, L129, L149, L186–195: acceptance 12's suite, the `older` input "the cua before M6a" | the hosted venue | the suite runs acceptance 13's driver; `older` is the cua before M6b (§5.2) |
| `linux-runtime.yml` L85, L179: `binutils xz-utils`, "the deb's tools" | for the older cua's install | **K**: the upgraded home is made by the older cua's real install (F11) |
| `.github/ci-kit.yml` L197 (`sandbox-live`: `runtime/**`), L283 (`parity-browser`: `runtime/releases/**`), L254 | hosted macOS gates over the vendor's macOS archive | **K**. Moving the records touches `runtime/**`, so `sandbox-live` runs on the pull request, which L218 wants in any case |
| `.github/ci-kit.yml` L98, L105–153 (`engine-linux`), L155–174 (`harness-dbus`) | cua's engine and its harness; no vendor package | **K** |
| `.github/workflows/linux-engine.yml`, `linux-sandbox-helper.yml` | cua's own releases | **K** |

### 1.7 Where the line falls in shared files

- **`manifest.mjs`.** `parsePin` keeps one schema, the darwin one: `signing` and `runtime.ipc` required, no
  `archive.format`, no `notes`. `loadPins`, `selectPin`, `findPin`, `runtimeFor`, `readInstalledRecord` and the
  pointer's selection serve macOS as today. A Linux host never calls them.
- **`install.mjs`.** `installRuntime` is the zip's install, with `ditto` and code signatures, and always activates.
  On Linux nothing calls it.
- **`launch.mjs`.** The setting's two values and `engineSetting` are shared. `nativeEngineFor` branches by platform at
  its first line (L533), and only `linuxEngineFor` changes. `SKY_CUA_SERVICE_PATH`, the vendor host and the compat
  executable are macOS's and untouched.
- **`doctor.mjs`, `checks.mjs`.** The four vendor rows and their checks run for a darwin host only, as today
  (doctor.mjs L173).
- **`codex-leftovers.mjs`.** The release-tree scan and its session rule stay for macOS's `CodexCLI.app`. Linux keeps
  the `state/codex` half.
- **`surface.mjs`.** macOS's two rule sets stay keyed by the selected engine.
- **Harnesses.** `--host vendor`, `--engine vendor` and `CUA_NATIVE_ENGINE=vendor` stay wherever the device is a Mac.
- **Proof.** Every darwin row of `test/runtime-launch.test.mjs`, `test/runtime-install.test.mjs`,
  `test/runtime-doctor.test.mjs` and `test/cli.test.mjs` passes unchanged, and the pull request lists the macOS-visible
  changes: none in behaviour; the usage text, the README and the plugin's description.

## 2. The refusals and the doctor rows

### 2.1 `engine_retired`

Raised by `linuxEngineFor` as its first act when the setting names `vendor`. It looks for no tree and reads no pin,
so it reads the same with the tree present, absent or damaged.

By the environment:

> `CUA_NATIVE_ENGINE=vendor` selects the vendor's engine, which cua `<R>` removed from Linux: set
> `CUA_NATIVE_ENGINE=cua`, or leave it unset, for cua's own engine, which `` `<installer> --engine` `` installs

By `engine.json`:

> `"engine": "vendor"` in `~/.config/cua/engine.json` selects the vendor's engine, which cua `<R>` removed from Linux:
> set `CUA_NATIVE_ENGINE=cua`, or remove that setting, for cua's own engine, which `` `<installer> --engine` ``
> installs

- It names the release (1193 (c)), `CUA_NATIVE_ENGINE=cua` (1193 (c)) and one command (1212).
- Its hint carries no second command (F2): "a `cua` from another checkout installs that checkout's engine, not this
  one's".
- `<R>` is one exported constant beside the selection. A test holds it to a version no later than
  `.claude-plugin/plugin.json`'s.
- A browser-only session asks for no engine (`replHostFor`, launch.mjs L450, unchanged), so it opens with the
  variable set, as M6a's C7 had it.

### 2.2 The engine's other refusals (1212)

The tail of `launch.mjs` L579 becomes one remedy. `<source>` is as today: `CUA_NATIVE_ENGINE=cua`, the `engine.json`
wording, or "the default engine (cua)".

> `<source>` selects cua's own engine, and the engine installed in this cua home (`<path>`) is 0.4.4, older than
> 0.4.5, which this cua needs: install this cua's engine with `` `<installer> --engine` ``

- `engine_not_installed` ("…and none is installed in this cua home (`<path>`): install this cua's engine with…") and
  `engine_unrecorded` share the tail, since one line of code writes all three.
- The service's own sentence already has it (`client.mjs` L71) and is unchanged.
- An override's refusals (L558–573) keep the override's own fix first, then the installer, as ruling 1110 set them.
  They never named the vendor engine.
- Where a value is not an engine at all, Linux's sentence stops offering one that is refused: "`CUA_NATIVE_ENGINE`
  must be cua (cua `<R>` removed the vendor's engine from Linux)". macOS keeps "must be vendor or cua".

### 2.3 Doctor on Linux

The rows, in order: `platform`, `runtime.installed`, `runtime.modules`, `runtime.node`, `sandbox`,
`sandbox.launcher`, `run.stale`, `runtime.leftovers`, `display`, `accessibility.bus`, `accessibility.enabled`,
`sandbox.userns`, `secrets.store`, `repl.host`, `engine`, the Chrome rows and the `agent.*` rows.

| Row | After M6b |
|---|---|
| `runtime.vendor` | gone. No row is named for the vendor's release, and none names a path under `runtimes/` |
| `runtime.installed`, the pointer naming an older cua's release | unchanged: "…but current.json names the vendor's release `<name>`, which an older cua's install wrote: no install of this cua has completed here…; run `` `<installer>` ``" |
| `runtime.leftovers` | on Linux: the Codex CLI's files in `<home>/state/codex`, or `pass`. It lists nothing under `runtimes/` |
| `repl.host`, the home selecting `vendor` | `fail`: "refused (engine_retired): `<the sentence>`; `<its hint>`. The profile listing (browser only): cua host (linux) on Node …" |
| `engine`, the home selecting `vendor` | `fail`: "the vendor's engine is selected (`CUA_NATIVE_ENGINE=vendor`), and every Linux computer session is refused (engine_retired; see repl.host): `<the sentence>`; in this home: `<what it holds, as today>`" |
| `engine`, cua's engine refused | `fail`, with §2.2's sentence, as today |
| every other row | unchanged |

`report.engine.service` is `cua` or null. Doctor opens, stats and lists nothing under `<home>/runtimes/` on Linux:
what M6a guaranteed of a session now holds of doctor too (§4.3 tests it).

## 3. The removal in install (1193 (b))

### 3.1 What the removal knows

`src/runtime/vendor-removal.mjs` holds the two releases cua's install ever placed on Linux, as constants:

| Release | Archive SHA-256 | Length |
|---|---|---|
| `26.928.40906-linux-x64` | `8094004f…8ad30` | 474,898,954 |
| `26.928.40906-linux-arm64` | `ab3eea13…0f5cd` | 453,477,698 |

- They carry no URL, so nothing in `src/` can fetch a deb with them.
- A test ties each to its provenance record and to `runtime/modules/provenance.json`'s `vendor` entry. Tests may read
  the records; install may not (§4).
- No other Linux release was ever pinned (`git log -- runtime/releases`: fe09732c8 added these two).

### 3.2 What it trusts, and how it verifies

Under the real home, `runtimes/` must be a real directory; a link there is never followed. For each entry whose name
is one of the two releases, every one of these must hold, or the entry is left and named:

1. **The directory.** A real directory, not a link.
2. **The record.** `install.json` is a regular file, not a link, under 64 KiB, and parses to exactly `{schema: 1,
   release, archive: {sha256, length}, source, installedAt}`: `release` the directory's name, the archive's hash and
   length that release's, `source` `archive` or `download`, `installedAt` a date. This is the record of
   `install.mjs` L116, read more strictly than `readInstalledRecord` reads it (manifest.mjs L224–232).
3. **Only what an install placed.** Its top-level names are among `install.json`, `cua_node`, `codex`,
   `chrome-plugin` and a prune's tombstone, `.codex.pruning-<hex>` (finding 11; codex-leftovers.mjs L39–40).
4. **The vendor's own manifest agrees.** `cua_node/manifest.json` is a regular file naming `platform` linux, the
   release's `arch`, and `target` `linux-<arch>`, as `checkVendorManifest` reads it (checks.mjs L17–31).

What is not verified: the bytes below `cua_node/`. The record names an archive, not a tree, and no listing of the
tree was ever kept (finding 3). F4 asks the design session to confirm this depth.

### 3.3 How it removes

1. **Measure.** Walk the tree with `lstat`, following nothing: the count of entries, and the bytes of regular files
   and links, a hard-linked file once.
2. **Rename.** One `rename` to `.<release>.removing-<8 hex>` in `runtimes/` itself, so it never crosses a volume.
   From that instant no path of the release exists.
3. **Verify again,** at the new name, by the same four checks, the record's release being the one the new name
   carries. What was verified is then what is deleted. If it no longer verifies, it is renamed back and left.
4. **Delete,** `install.json` last. A delete that fails part-way leaves a tombstone that still holds its record.
5. **A tombstone found by a later install** (its exact name, a valid record of the release it names) is deleted
   without the manifest check: only step 2 makes that name, after a full verification.

- **Never a recursive delete in place.** Between the first unlink and the last, an older cua's session could find its
  launcher gone and its Node still there, which is the state #135 describes (finding 5). After one rename both are
  gone together, and the session fails instead.
- **A session that may be running does not defer it** (F3). No cua from M6a on reads the tree by default, and the one
  lane that did is what the owner retired.
- **Nothing else is touched.** `runtimes/` itself stays, empty or not. Every other entry is named and left: a
  directory or file cua did not place, a darwin release, a link.
- **It never fails the install.** A removal that could not finish is reported, and the next install meets the
  tombstone.
- **macOS never runs it.** There `runtimes/` holds the runtime sessions run from.

### 3.4 What it prints

In the human output, after the engine's line:

> removed the vendor's release 26.928.40906-linux-x64 from `<home>`/runtimes: 211.1 MB in 4,812 entries, which `cua
> install` placed here on 2026-10-28; cua `<R>` removed the vendor's engine from Linux

> left `<path>` in place: it is not a release `cua install` placed (`<reason>`)

> `<path>` could not be removed (`<code>`); the next install tries again

Nothing is printed for a home with no `runtimes/`, or an empty one. The reasons are fixed words: `not_a_release`,
`link`, `no_record`, `record_invalid` (with the field), `foreign_entry` (with the name), `manifest_mismatch`.

In `--json`, `vendor` gives way to:

    "retired": {"removed": [{"release", "path", "bytes", "entries", "installedAt", "source"}],
                "left": [{"path", "reason"}], "failed": [{"path", "code"}]}

`changed` is true when anything was removed. The entry counts above are examples; the bytes are this VM's.

### 3.5 The rest of `cua install` on Linux

| # | Step | After M6b |
|---|---|---|
| 1–5 | the record, the module tree, the helper, Node, the pointer | unchanged |
| 6 | cua's engine | unchanged |
| 7 | the vendor's tree | the removal. Nothing is fetched, and `ar` and `xz` are never run |
| 8 | the Codex CLI's leftovers | `state/codex` only |

- **`--archive` and `--release`** are a usage error on Linux, before anything is installed: "install takes --archive
  and --release on macOS only: on Linux cua installs its own runtime and, since cua `<R>`, no ChatGPT package".
- **The last line** says which sessions open, as today, without the other engine's clause.
- **The exit status** (F10). The command fails when a common part failed, or the engine did while the home asks for
  it, as today. It also fails, after doing everything else, when the home's setting selects `vendor`: the error is
  `engine_retired`, with §2.1's sentence. No computer session opens in that home as it is set, and M6a's rule is that
  the status follows the lane the home asks for.
- **`cua runtime use <name>`** on Linux knows one name, as today. Any other is `unknown_release`, a vendor release's
  included.

### 3.6 The cloud provisioner (F9)

- `render.sh` and `create-hetzner.sh` lose `--deb`: given, it is refused with one sentence.
- `cua-provision.sh` loses `fetch_deb`, its wait and the `--archive` install (L82–143). It runs `cua install`, the
  registration and the profile, as its `CUA_DEB=none` path does today.
- A conf written by an earlier template still sets `CUA_DEB`. The script says in one log line that the value is no
  longer used, and goes on. A re-run must not fail on a setting the VM cannot change by itself.
- `binutils` and `xz-utils` leave its package list (L174).
- A `CUA_REF` older than M6b still provisions: its own `cua install` fetches what it needs from its own pins.

### 3.7 What a user meets

- **The update itself asks for nothing** (finding 2), unless the home selects `vendor`.
- **The next install,** whenever it comes, removes about 200 MB and says so. Engine installs stay a person's to run
  (1211), so that is the next time someone runs the installer.
- **An older cua sharing the home.** One from M6a on (0.29.19 to 0.29.21) loses only its vendor selection, which then
  refuses and names its own installer. One from before M6a loses its runtime, which the pointer's move had already
  taken (M6a's C5). Either one's own `cua install` fetches the deb again, and this cua's next install removes it
  again. The README says so.

## 4. The provenance move (1193 (a))

### 4.1 Where, and in what shape

`runtime/provenance/26.928.40906-linux-x64.json` and `…-linux-arm64.json`: a sibling of `runtime/modules/`, outside
`package.json`'s `files`.

    {"schema": 1, "release": "26.928.40906-linux-x64", "platform": "linux", "arch": "x64",
     "archive": {"format": "deb", "url": "https://…/chatgpt_26.928.40906_amd64.deb",
                 "length": 474898954, "sha256": "8094004f…"},
     "notes": "Provenance of the archive hash, checked once at authoring (2026-10-06, …)"}

- **Kept:** the release, the archive's URL as where it was published, its length and SHA-256, and `notes`, byte for
  byte: the record of the signature check.
- **Dropped:** `appVersion`, `components`, `runtime` and `layout`. They said what to unpack and what the tree must
  look like. Without them a record names an archive and nothing an installer could act on (F5).
- **Moved with `git mv`,** then trimmed in the same commit, so the history follows the file.

### 4.2 Who reads them

One reader: `scripts/modules-pin.mjs`, through a strict parser of its own (exactly these keys). It needs what it
needs today: a deb's length and SHA-256, to match the file it is handed to a release (L59). Its tests read them too.
Nothing under `src/` or `bin/` names the directory.

### 4.3 The unreachability test

Three layers, in `test/runtime-linux-provenance-unreachable.test.mjs` and the recorder M6a built
(`test/runtime-linux-no-vendor-read.test.mjs`):

1. **Static.** No file under `src/`, `bin/` or `cua-shim.mjs` contains `runtime/provenance`, `chatgpt_` or
   `/linux/deb/`. `package.json`'s `files` does not list the directory.
2. **No pin, and no parser for one.** `loadPins()` holds no Linux pin. `selectPin` for linux-x64 and linux-arm64 is
   `unsupported_platform`. `parsePin` of each record, as it is and as it was before the trim, is `invalid_pin`.
3. **Recorded.** With `node:fs` and `node:child_process` wrapped as M6a's recorder wraps them, and a `fetch` that
   records every URL, three entry points run for a Linux host, each under no setting, `cua` and `vendor`:
   - install: `installLinux`, in an empty home and in one holding a placed release;
   - doctor: `inspectRuntime`;
   - launch: `resolveRuntime`, `replHostFor`, `buildLaunch` and `assertSandboxFits`, for a computer session and a
     browser-only one.
   No recorded path lies under `runtime/provenance/`, and no URL is a record's.
   - Doctor and launch also record no path under `<home>/runtimes/`. Install's are all the removal's.
   - **Its negative control:** `scripts/modules-pin.mjs`'s reader, under the same recorder, is recorded opening both
     records. A recorder that saw nothing would otherwise pass.

## 5. Tests and acceptance 13

### 5.1 Unit tests

They run in the `test` gate on hosted macOS with a Linux host injected, as M6a's do.

| Row | Expect | File |
|---|---|---|
| `vendor` by the environment and by `engine.json`; the tree present, absent, damaged | `engine_retired`, the sentence word for word against a literal; nothing under `runtimes/` recorded | `test/runtime-linux-engine-selection.test.mjs` |
| The sentence | holds `<R>`, `CUA_NATIVE_ENGINE=cua` and `<installer> --engine`; holds no "vendor" after its first clause, no `cua engine build`, no second command; its hint holds no command | same |
| `<R>` | a version no later than the plugin's | same |
| `engine_not_installed`, `engine_outdated`, `engine_unrecorded`, under the default and an explicit `cua` | each a literal, ending in the one remedy (1212) | same |
| The service's sentence | the literal of `client.mjs` L71, and its installer the selection's (M6a's drift test) | `test/services-engine-linux/client.test.mjs` |
| A value that is no engine, on Linux and on macOS | Linux names `cua`; macOS is unchanged | `test/runtime-linux-engine-selection.test.mjs` |
| `buildLaunch` for a Linux computer session with no `bin` | a `TypeError`; no environment names `OAI_SKY_LINUX_BIN` or a module of `@oai/sky` | `test/runtime-linux-launch.test.mjs` |
| A browser-only launch with `CUA_NATIVE_ENGINE=vendor` | builds | same |
| The `js` rules for a Linux computer session, whatever `engine` is passed | cua's | `test/mcp-browser-surface.test.mjs` |
| The oracle's Linux table | `vendor` is `engine_retired` in every row | `test/repl-parity/selection-oracle.test.mjs` |
| Doctor, a healthy home, one with a placed release, one with a damaged one | the same rows in all three; none named `runtime.vendor`; no detail names a path under `runtimes/` | `test/runtime-linux-doctor.test.mjs` |
| Doctor, the home selecting `vendor` | `repl.host` and `engine` fail with the sentence | `test/doctor-engine-linux.test.mjs` |
| **A placed release** (1193 (b)), x64 and arm64 | removed; the report's bytes and entries equal the fixture's; `installedAt` the record's; `runtimes/` left, empty | `test/runtime-linux-vendor-removal.test.mjs` (new) |
| **A release it did not place:** a directory of another name, a file, a darwin release | each left, byte for byte, and named `not_a_release` | same |
| **A tampered record:** the hash, the length, the release, `schema`, an extra key, not JSON, a link, a directory | each left, named `record_invalid` or `link` | same |
| **No record** | left, named `no_record` | same |
| A foreign top-level name; a manifest for another arch; `cua_node` a link | left: `foreign_entry`, `manifest_mismatch`, `link` | same |
| `runtimes/` a link, a file, absent | nothing followed, nothing printed for absent | same |
| An old tree holding `codex`, `chrome-plugin` and a prune's tombstone | removed | same |
| The order of what it does | the first change under `runtimes/` is the one rename; no unlink names the release's own path | same |
| The tree changed between the rename and the second check | renamed back and left | same |
| A delete that fails part-way; the next run | reported `failed`; the tombstone holds its record; the next run removes it | same |
| A live session's record in `run/` | the removal still runs (F3) | same |
| The four constants | equal the provenance records' and `provenance.json`'s | same |
| `cua install` in an empty home | no `runtimes/` made; the `fetch` log is this arch's pinned assets and no other URL; no `ar` or `xz` looked up | `test/cli-linux-install.test.mjs` |
| `cua install` over a placed release, then again | removed, `changed` true; then nothing to remove, `changed` false | same |
| `--archive`, `--release` on Linux | usage error, exit 2, nothing installed | same |
| `cua install` under a `vendor` setting | every part placed, the release removed, exit nonzero with `engine_retired` (F10) | same |
| `cua runtime use` with a vendor release's name | `unknown_release`; its hint names no engine | same |
| macOS: `cua install`, `cua doctor`, the selection | unchanged; the removal is never called | `test/runtime-install.test.mjs`, `test/cli.test.mjs`, `test/runtime-doctor.test.mjs` |
| §4.3's three layers | pass | `test/runtime-linux-provenance-unreachable.test.mjs` (new) |
| `modules-pin.mjs` on its fixture debs, reading `runtime/provenance/` | as today | `test/modules-pin.test.mjs` |
| The provisioner: a conf with `CUA_DEB=pin`; `render.sh --deb` | installs and registers, with one log line, no fetch; refused | `test/deploy-cloud-vm.test.mjs` |
| The harness rows of §1.3 | each by its own test | §1.4 |

### 5.2 Acceptance 13, live

One driver, M6a's, with its cells replaced: `scripts/accept/linux-runtime.mjs`, inside
`scripts/accept/linux-runtime-env.sh`'s environment (a private X server, a private session bus, accessibility on,
the run's own homes, the sandbox scoped), with M6a's watch, trace and confinement step.

**Two witnesses are new.**

- **The fetch log.** The install runs as `node --import <preload> bin/cua.mjs install`. The preload wraps
  `globalThis.fetch` and writes every URL asked for, the URL that answered and the bytes. cua's code is not changed
  by it. Its control is the older cua's install under the same preload, whose log must hold the deb's URL.
- **The traced install.** M6a's `strace -f` wrapper around the install: every program executed and every path under
  `runtimes/`.

**The older cua** is main 854103aa5, the cua before M6b. Its install places its own runtime and the vendor's
release, as every home updated from main holds them.

| Cell | Home | Step | Passing means |
|---|---|---|---|
| E0 | empty | `cua install` at the head, under the fetch log and the trace | Exit 0. The module tree, helper, Node and engine placed; the pointer the derived name. The URLs the log shows asked for are exactly this architecture's pinned assets (23 tarballs, the helper, Node, the engine); none asked for, and none that answered, is OpenAI's. No `ar` and no `xz` was executed. The home has no `runtimes/`. Doctor is ok, with no row named `runtime.vendor`, `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc` or `runtime.signatures`; its `engine` row shows the pinned version and hash behind service `cua`. `file` says the engine is statically linked (item 9) |
| E1 | E | the item 1 smoke and the item 6 witness, plain and traced | As M6a's E1: every step passes; no `sky_linux` at any sample; the engine child is the home's `cua-engine` under the trusted worker; no traced call names a path under `runtimes/` |
| E2 | E | the browser-only session, plain and traced; the profile map's loader | As M6a's E2 |
| E3 | E | a computer session with `CUA_NATIVE_ENGINE=vendor`, then with `"engine": "vendor"`; doctor; a browser-only session with the variable; `cua install` under the setting | The open is refused `engine_retired`, the sentence equal to §2.1's with this head's installer and `<R>`. Nothing is launched. Doctor's `engine` and `repl.host` rows fail with it. The browser-only session passes. The install exits nonzero with it, and has changed nothing |
| U0 | upgraded: installed by the older cua, whose doctor passes its `runtime.vendor` | at the head, before any install: the item 1 smoke, traced; then the vendor selection | The default session passes with the tree present and whole, and no traced call names a path under `runtimes/`. The vendor selection is refused as in E3, though its tree is there |
| U1 | U | `cua doctor --json`, plain and traced | The rows are E0's. No detail names the release or a path under `runtimes/`. No traced call names one |
| U2 | U, with a directory and a file of the run's added to `runtimes/` | `cua install` at the head, under the fetch log and the trace | Exit 0. `retired.removed` is the one release: its bytes and entries equal what the driver counted before, its `installedAt` the record's. `retired.left` names the two added entries, which are byte for byte as they were. The release's path and every tombstone are gone. Nothing was fetched: every part is `changed: false`. The trace shows one rename of the release before any unlink |
| U3 | U | doctor; E1 and E2, plain; `cua install` again | Doctor as E0's. The sessions pass. The second install removes nothing and leaves the two entries, `changed: false` |
| U4 | a new home holding a copy of U's release whose record has one digit of its hash changed | `cua install` | The release is left, named `record_invalid`; its listing and every file's hash are as before. Doctor says nothing of it |
| U5 | a new home holding a copy with no `install.json` | `cua install` | Left, named `no_record`; unchanged |

**Measured and reported, not judged:**

- E0's time and bytes fetched, beside the older cua's install on the same leg, which fetches the deb;
- U2's bytes removed and its time;
- serve start to a first cell's answer, 20 samples at the head against 20 under the older cua. M6b removes a branch
  from the selection; a difference above about 50 ms is a finding.

**Venues.**

- **x64: this machine's private displays,** under the host lock, at the frozen head. The counted x64 evidence is this
  run.
- **arm64: GitHub's hosted `ubuntu-24.04-arm` runner,** through `.github/workflows/linux-runtime.yml`'s acceptance
  suite, with its x64 leg as the control. Dispatched on the head, with `older` 854103aa5.
- No VM, and no `:0` sitting.

**The regression on x64, at the same head.** `launch.mjs` is what every facade suite launches through:

- R1, repl-parity's native suite on the cua lane: 34 of 34, both text cases positive, the engine the home's
  `cua-engine` under the worker;
- R3, `linux-native.mjs`, in the default selection and with `CUA_NATIVE_ENGINE=cua`;
- R4, `linux-device-mode.mjs`, in the default selection;
- the `fallback` part: its five homes, each refused with 1212's sentence.

**Gates.** `ci-gate` on the head, GREEN, with `test` and `sandbox-live` among those that ran (L217–218).

**Evidence:** `docs/evidence/2026-10-28-own-linux-engine/m6b/{x64,arm64,x64-hosted}/`, each cell's report, the head,
the hosted run's id, and `m6b/credit.txt`.

### 5.3 Items 1 to 10: what reruns, what is cited

M6b changes the selection, the launch's vendor branch, install, doctor and the harness. It changes no byte of the
engine, of cua's Linux service, of the facade or of the REPL host.

| Item | M6b | From | The argument |
|---|---|---|---|
| 1, no vendor process | **reruns**, both arches | E1, U0, U3; R3 on x64 | M6b changes the launch and doctor, which this item reads |
| 2, the same answers | cited | M5's sitting at H8 = 048140a2 on 0.4.3, both arches (`m5/x64/`, `m5/arm64/`); 0.4.4's and 0.4.5's reaches (`engine-044/`, `engine-045/reach/`) | The differential harness drives the engines by path. It never passed through the selection or install, so M6b cannot move its result. The credit check below holds it to the accepted bytes |
| 3, at or below the bar | cited | the same; 0.4.5's H1, H2, L4a and L4d at H10 = 2c66966bd for the drop path | as item 2 |
| 4, same elements | cited | M5 | as item 2 |
| 5, background left alone | cited | M5 | as item 2 |
| 6, text arrives once | cited, with a witness that **reruns** | M5; `linux-text.mjs` in E1 and U3 on both arches; R4 on x64 | F10 of M6a (ruling 1110): the suites are the engine's, and what M6b can break is the path from the own parts to the engine |
| 7, identity and minimized | cited; R1's minimized case **reruns** on x64 | M5 | as item 2 |
| 8, device mode | cited; R4 **reruns** on x64 | M5 | as item 2 |
| 9, install | **reruns**, both arches | E0 | install is what M6b changes |
| 10, suites | the cua lane **reruns** on x64 (R1, R3); `npm test` and `engine-linux` by `ci-gate` | its diff against the vendor lane: M6a's R1 at f41546d08, a diff of 0 with the 3 declared defects (`m6a/x64/regression/parity/`), and M5's at H8. `compare --engines`: M5's R2 at H8 | Acceptance 13 cites the vendor lanes (L206). R2 judges the engine's in-cell time, which M6b does not touch |

**The credit check,** recorded with its output in `m6b/credit.txt` at the frozen head H:

- `git diff --stat linux-engine-v0.4.5 H -- native/linux-engine` prints nothing;
- the two hashes of `runtime/engine/linux-engine.json` are the release's assets' (`gh release view
  linux-engine-v0.4.5`);
- `git diff 854103aa5 H -- src/services/engine/linux src/services/engine/policy.mjs src/services/sky.mjs src/cua-api
  src/repl-host docs/cua-api` prints nothing.

A check that prints something is read. A change that is not plainly neutral fails the credit for the items it
reaches, and their steps then run, which needs the vendor builds (F7).

**What could cut it,** most likely first:

1. A harness or test path that still reaches a Linux pin or the vendor tree (§1.3, §1.4). The recorder and R1 find it.
2. The fetch log seeing less than the install fetched. Its control, the older cua's log, shows the deb or the witness
   does not count.
3. The hosted leg's time: the older cua's install fetches about 450 MB on arm64, as it did in M6a.
4. A sentence a harness judge still expects in its old words (the `fallback` part, the driver's refusal judge).

## 6. The tasks

An export is deleted by the task that removes its last reader, never before. So the selection goes first, the
harnesses' readers next, and the pins and their parser last.

| T | Scope | Touches | Consumes | Produces, and its proof |
|---|---|---|---|---|
| T1 | **Nothing offers the vendor's engine** (§2; §3.5's flags, last line, exit status and `runtime use`). The selection and the launch; doctor's rows; the `js` rules; install's vendor lane and its "other engine"; the usage text; the oracle. The Linux test fixtures move to cua's own parts | `src/runtime/{launch,doctor,doctor-linux-runtime,doctor-engine,linux-install}.mjs`, `src/runtime/install.mjs` (`useOwnLinuxRuntime`), `src/cli.mjs`, `src/mcp/{surface,connection}.mjs`, `scripts/repl-parity/selection.mjs`, `test/fixtures/{installed-home,linux-native-runtime}.mjs`, `test/runtime-linux-{launch,engine-selection,doctor,no-vendor-read}.test.mjs`, `test/doctor-engine-linux.test.mjs`, `test/cli-linux-install.test.mjs`, `test/serve-lazy.test.mjs`, `test/mcp-browser-surface.test.mjs`, `test/repl-host/linux-native*.test.mjs`, `test/linux-{secrets,sandbox-refusal}.test.mjs`, `test/repl-parity/selection-oracle.test.mjs` | – | `engine_retired`, `<R>`, 1212's sentences. §5.1's rows for the selection, the launch, doctor, the `js` rules, the flags and the exit status. Every darwin row unchanged. `vendorLinuxRuntime`, `vendorPinsOf` and the pins stay: scripts still read them. **If F2 is ruled narrowly:** only the vendor clause leaves L579, and the literals follow. **If F10 is ruled the other way:** exit 0, the refusal in the last line only |
| T2 | **The removal** (§3.1–3.4, §3.6): the new module, step 7 and the report; the deb's code out of `install.mjs`; Linux's leftovers scan; the provisioner | `src/runtime/{vendor-removal,linux-install,install,codex-leftovers}.mjs`, `deploy/cloud-vm/{cua-provision.sh,render.sh,create-hetzner.sh}`, `test/runtime-linux-vendor-removal.test.mjs`, `test/cli-linux-install.test.mjs`, `test/runtime-codex-leftovers.test.mjs`, `test/runtime-linux-install.test.mjs` (deleted), `test/deploy-cloud-vm.test.mjs` | T1 | §5.1's rows for the removal, install over a placed release and the provisioner. macOS's install unchanged. **If F3 is ruled to defer:** the removal first asks `sessionsInUse` (codex-leftovers.mjs L110), before and after the rename, and reports a deferral. **If F4 is ruled stricter or looser:** the checks of §3.2 change, and their rows with them |
| T3 | **The harnesses** (§1.3): the Linux vendor lanes out, the judges kept; `engine-answered`; the parity cache and provenance; the four install sites; native-baseline's helper listing; `probe/lib.mjs`; the gate's R1, R2 and vendor builds (F7); the `fallback` part's sentences; acceptance 12's vendor cells out of the driver; #570. Then, with no reader left, `vendorLinuxRuntime`, `vendorPinsOf`, `RESTORE_PINS` and `installHint`'s Linux half | `scripts/repl-parity.mjs`, `scripts/repl-parity/*`, `scripts/native-baseline.mjs`, `scripts/native-baseline/*`, `scripts/browser-parity/capability-home.mjs`, `scripts/linux-engine-gate/{gate,steps}.mjs`, `suites.sh`, `scripts/accept/{linux-fallback,linux-selection,linux-runtime,linux-runtime-cells,linux-runtime-watch,linux-text}.mjs`, `scripts/probe/lib.mjs`, `scripts/sandbox-probe/linux-probes.mjs` (deleted), `src/runtime/manifest.mjs`, `test/runtime-manifest.test.mjs`, their tests (§1.4) | T1 | Each by its test. R1's cua lane and the `fallback` part run once on x64 as development runs. Reviewed for false greens first, as every harness change since M4. **If F6 is ruled for the whole deletion:** the Linux diff, its expected file and the Linux defects go too. **If F7 is ruled to retire the differential lanes:** `--vendor` and `--newest` leave the gate's steps, a larger change with its own review |
| T4 | **The provenance move, and the parser's end** (§4): the two records moved and trimmed; the script's reader; `parsePin`'s Linux branch and `LINUX_LAYOUT_KEYS`; the dead branches of `checks.mjs` and `doctor.mjs`; the fixtures' Linux pin helpers; §4.3's three layers | `runtime/provenance/` (new), `scripts/modules-pin.mjs`, `src/runtime/{manifest,checks,doctor}.mjs`, `test/fixtures/runtime-fixture.mjs`, `test/runtime-manifest.test.mjs`, `test/modules-pin.test.mjs`, `test/runtime-linux-provenance-unreachable.test.mjs` | T2, T3 | `modules-pin.mjs` writes the same `provenance.json` bytes as today from the same debs. `loadPins()` holds no Linux pin, and no parser reads one. §4.3 passes, its negative control included. **If F5 keeps the records whole:** the reader accepts the old keys and reads the same three values |
| T5 | **Acceptance 13's driver** (§5.2): the new cells and their judges, the fetch log's preload, the traced install, the older cua, the workflow | `scripts/accept/{linux-runtime,linux-runtime-cells}.mjs`, `scripts/accept/fetch-log.mjs` (new), `.github/workflows/linux-runtime.yml`, `test/accept-linux-{runtime,runtime-cells}.test.mjs` | T2, T3 | Each judge's negative control by test: a log with the deb's URL, a trace with `ar`, a report with a wrong byte count, a left entry that changed, a sentence one word off. A pilot of every cell on both venues, at the tip that holds T4. Reviewed for false greens first |
| T6 | **Docs and the bump** (§1.5): the README, `deploy/cloud-vm/README.md`, the skill, `CLAUDE.md`, `package.json`'s description, the plugin's description and version | those files | – | Each sentence checked against the code at the head. The bump under L218's conditions, its version as F1 rules |
| T7 | **Acceptance 13, counted** (§5.2, §5.3), at the frozen head on both venues, with the x64 regression and the credit check | evidence `m6b/` | the frozen head: T1–T5 | Every cell passes by the driver's own judge. `m6b/README.md` with the cell table, the head, the hosted run's id, §5.3's table with each citation resolved to a path, and `credit.txt` |
| T8 | **Close-out.** The spec folded: Progress, a Decision Log entry for each ruling of §7, Outcomes, and "Retirement (M6b)" as built. The tracker's #570 line. The whole-branch review by `doperpowers:reviewer-high` (L217). `ci-gate`. The pull request, its body listing every macOS-visible change, the homes that selected `vendor`, and what the next install removes | the spec, the report, `tech-debt-tracker.md` | T6, T7 | The review clean. `ci-gate` GREEN with `test` and `sandbox-live` among those that ran. `MERGEABLE` |

**Order.** Each task is reviewed clean before what consumes it runs.

| Wave | Tasks | Notes |
|---|---|---|
| 0 | T1; T6's draft; F7's copy of the vendor builds | The copy is the one step with a deadline: the arm64 VM ends on 2026-11-26T01:00Z |
| 1 | T2 and T3, each in its own worktree | They share no file. T2 merges first |
| 2 | T4 and T5, each in its own worktree; then T5's pilots on both venues | The pilots run at the tip that holds both |
| 3 | the pilots' fixes, reviewed; the head frozen as H and pushed | |
| 4 | T7 at H: x64 here, arm64 by dispatch | A fix after the freeze follows the M5 pre-flight's §8.1 |
| 5 | T8 | `<R>` and the plugin's version are set at merge |

**Timeline,** from the approval of this pre-flight, on M6a's costs for tasks of these sizes:

| Task | Hours |
|---|---|
| T1 | 12–16 |
| T2 | 8–12 |
| T3 | 10–14 |
| T4 | 4–6 |
| T5 | 8–12, with the pilots |
| T6 | 4–6 |
| T7 | about 2 of machine time on x64 (the cells about 30 minutes; R1, R3 and R4 planned at 40, 5 and 3); about 45 minutes for the dispatched run |
| T8 | 6–10 |

About three days to the pull request with no cut. Plan for one fix round from the pilots: three and a half. Not
counted: usage stops, and the hosted macOS queue for `ci-gate`.

## 7. Design forks, for the design session to rule

F1, F2 and F10 are needed first: T1 writes the sentences and the exit status. F3, F4 and F9 are needed before wave 1,
with F6, F7 and F8. F7's copy has a deadline of its own. F5 and F11 can wait for wave 2.

| F | Question | Recommendation | Why, and what the other choice costs |
|---|---|---|---|
| **F1** | Which release does the sentence name, and what is the bump? L218 says minor; practice since 0.29.0 is the next patch, allocated at merge | **A minor bump, 0.30.0, allocated at merge; `<R>` is that version** | The sentence carries this number for as long as anyone sets `vendor`. A release that removes a selectable engine is the kind L218 meant. The next patch (0.29.22 today) keeps the practice, and the sentence then names a number nobody will remember; if another pull request merges first it also has to be edited at merge, which a constant with a test makes safe either way |
| **F2** | 1212 says `<installer> --engine` is the only remedy, and that the vendor clause goes. Does the rest of the tail go too? | **Yes: the sentence gives one command.** The parenthesis "(or a local build with `cua engine build`)" goes, and the hint drops its second command, `<installer>` without `--engine`, keeping only its warning about another checkout | "Only" read plainly. Today a refused user reads three ways out, two of them commands that differ by a flag. `cua engine build` stays in the README and in an override's own refusal, where a developer meets it. The narrow reading removes the vendor clause alone and costs nothing to build |
| **F3** | Does a session that may be running defer the removal, as it defers the Codex CLI's prune? | **No. Remove by one rename, whatever runs** | No cua from M6a on reads the tree unless it selects `vendor`, which the owner retired knowing there is no way back. The prune's reason was a launcher gone while its Node stayed (#135), which one rename cannot produce (finding 5; by reading, not by a run). Deferring keeps the precedent, and then a machine with long-lived sessions keeps OpenAI's package until someone installs with every session closed, while doctor says nothing of it |
| **F4** | What does "verified against that record" require, given what the record holds? | **§3.2's four checks,** and a second pass after the rename. The tree's bytes are not verified. Both architectures' releases count. `runtimes/` is left even when empty. Doctor is silent about an entry left in place, as about one removed | The record names an archive (finding 3). The checks ask that the directory, its record, its top-level names and the vendor's own manifest all say "this release, placed by cua". A stricter rule, the layout's eight paths present, would leave a damaged tree that cua did place. A looser one, the record alone, would delete a directory that merely holds a copy of one |
| **F5** | Where do the deb records go, and how much of them? | **`runtime/provenance/`, trimmed** to the release, the archive's URL, length and SHA-256, and `notes`; out of the npm package | "Beside `runtime/modules/`" (1193 (a)). Without `components` and `layout` a record cannot say how to install. Moving the files whole is the other choice: nothing is edited, and the reader must then accept keys whose parser M6b deletes |
| **F6** | How far does "the vendor lanes are deleted" go in the facade suites? | **The lanes that run a vendor engine go. The judges that read two stored runs stay:** `native-linux.mjs`'s diff with its expected file and the Linux defects, and `compare --engines` | M5's evidence keeps every vendor series so that it can be read again (L3040), and task 139 re-judged H8's rows through these judges. They start no engine. Deleting them too is tidier, and M5's and M6a's lanes then become numbers nobody can re-judge |
| **F7** | The differential harness and the gate compare cua's engine with vendor builds given by path, and the gate takes the pinned build from the run home's `runtimes/` (finding 6). What becomes of them? | **They stay, as the engine's instrument. M6b moves the gate's default for the pinned build and the vendor's client** to a harness directory outside any cua home (`~/.local/share/cua-171/vendor/`, where the newest build already is), **checked against a recorded SHA-256** (x64's is `7ac3c2ae…f1cd`, R/A L224). M6b adds no code that fetches a deb. **Now, before the arm64 VM ends:** copy its pinned build and client to the x64 VM, with their hashes | The spec's M6b names none of the differential harness (L348), and the next engine release (#580) is judged by gate steps that have vendor lanes. Without the move those steps point at a path no fresh home has. How a later arm64 reach gets vendor lanes with no VM is that release's pre-flight: the hosted runner and a harness step that fetches the deb by its provenance record, or citations. Retiring the vendor lanes of the gate as well is the other choice: every bar then becomes a stored number, which the spec's rule of one machine and one sitting does not allow (L48) |
| **F8** | #570: remove `linux-probes.mjs`, or move it to cua's runtime? | **Remove it, with its test** | It has no caller and fails at its first use (the tracker's L6). Its findings are #115 M0c's evidence, which stays. Moving it means rewriting three probes around `cua-engine` to answer a question #115 closed |
| **F9** | The cloud template's `--deb` and `CUA_DEB` | **Removed; a conf that still sets `CUA_DEB` is tolerated with one log line** (§3.6) | The flag asks for something no install can use. A re-run on an existing VM reads the conf that VM was made with, so failing on it would break the documented update. An older `CUA_REF` still installs from its own pins |
| **F10** | A home whose setting selects `vendor`: what is `cua install`'s exit status? | **Nonzero, `engine_retired`, after every step has run** | M6a's F4: the status follows the lane the home asks for, and this home asks for one that cannot be had. Exit 0 with the refusal in the last line is the other choice; a provisioning script then reports success for a home where no computer session opens |
| **F11** | The hosted leg's upgraded home is made by the older cua's real install, which fetches the deb on the runner. M6a's F8 (ii) allowed that on this dispatch-only lane. Again? | **Yes** | It is the home a user has, with the record a real install wrote. The other choice is a fixture tree with a hand-written record: no vendor fetch, and the cell then proves the removal against a tree cua's own tests already cover |

## 8. Conflicts and ambiguities

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| C1 | "The `sky_linux` patterns … are removed or moved to cua's engine", and acceptance item 1 needs something that detects one | L164 against L192 | Nothing expects a `sky_linux`; the watches that prove none ran keep the name (finding 7) |
| C2 | "Items 1–10 still hold", and items 2 to 8 are comparisons with the vendor | L206 | §5.3: cited under a credit check, as ruling 1110 took F10. L206's parenthesis already says the vendor engine is no longer selectable |
| C3 | "The facade suites' vendor lanes cited from M5's sitting"; R1's vendor lane ran again in M6a | L206; finding 8 | Both are cited, M6a's as the later |
| C4 | The spec's Touches for M6b omit `linux-install.mjs`, the doctor modules, `surface.mjs`, `codex-leftovers.mjs`, the provisioner, the workflow, the gate and the acceptance driver | L348 | Each task's list here supersedes it, as M6a's C8 did |
| C5 | "`cua doctor` lists no vendor runtime rows", and two rows still say "vendor" | L206; doctor-linux-runtime.mjs L91; `runtime.leftovers` | Neither is a row about the vendor's runtime. One describes `current.json`; the other the Codex CLI's files in `state/codex` |
| C6 | 1193 (b) says "its own install record", and 1193 (a) keeps the deb records from install | L2899–2900 | The removal's own four constants (§3.1), tied to the records by test |
| C7 | The brief places the refusal's tail "around 579"; the same line writes `engine_not_installed` and `engine_unrecorded` | launch.mjs L579 | All three change together (§2.2) |
| C8 | L218's minor bump against the practice of patches | L218; ruling 1110 | F1 |
| C9 | M6a's README text says a later update "asks for the install again" only when a part moves; M6b moves none and still changes what install does | README L132–134 | The update step says what M6b's install removes, and that sessions do not wait for it (§1.5) |
| C10 | The acceptance says `cua install` "downloads no ChatGPT package"; an older cua sharing the home still does | L206; §3.7 | The claim is this cua's. The README says what an older one does |

## 9. Sources, and what was not verified

**Sources** (read 2026-11-24).

- The code, the spec and M6a's pre-flight at 84216c0fe; #117's spec for ruling 1175.
- M6a's evidence (`docs/evidence/2026-10-28-own-linux-engine/m6a/README.md`, `f10-credit.txt`, the listing of
  `x64/regression/parity/`).
- This VM's default home: `runtimes/` (one release; `cua_node/` and `install.json`), the record's text, `du -sb`
  (211,063,820), and the SHA-256 of its `sky_linux_x64` (`7ac3c2ae…f1cd`, which is R/A L224's).
- `git log` for `runtime/releases/` and for the Linux pin's components (fe09732c8, 7ae266b08, ef127143d).
- `~/.local/share/cua-171/vendor/` on this VM: the newest builds' debs and one extraction; no copy of the pinned
  build outside a cua home.

**Not verified.**

- Nothing was run. Every statement about behaviour after the change is design, and every statement about today's is
  from reading the code.
- That one rename leaves an older cua's running session failing and never unconfined. It is argued from #135's
  description and the prune's comment, not shown on a pre-#115 cua.
- The tree's entry count; 4,812 in §3.4 is a placeholder. Whether any real home holds `codex` or `chrome-plugin`
  beside `cua_node`: the names are from the pin's history, and this VM's tree holds neither.
- The arm64 tree: its top-level names and its `manifest.json` are assumed to mirror x64's.
- That every installer's `fetch` is the global one at call time, so that a preload's wrapper sees it. They take it as
  a default parameter; the older cua's log is the check.
- That `strace -f` follows `cua install` as it followed `cua serve` on both venues.
- That `renameSync` then `rmSync` behave as §3.3 says where `runtimes/` is on another filesystem than the home. The
  tombstone stays inside `runtimes/` for that reason.
- That no script or test outside §1.3 and §1.4 reads a Linux pin, `vendorLinuxRuntime` or `runtime.vendor`. The list
  is from one search of the tree for those names and for `sky_linux`, read by file.
- The four harness install sites on a Linux device after F10: they are read, not run.
- Whether any home besides this VM's selects `vendor` today. The soak's record says none needed it (L2941).
- That the arm64 VM still holds the pinned build where the gate found it, and that it can be copied before its lease
  ends.
- The hosted runner's time for the older cua's install on arm64 at 854103aa5; M6a's was at 0d19fdfa.
