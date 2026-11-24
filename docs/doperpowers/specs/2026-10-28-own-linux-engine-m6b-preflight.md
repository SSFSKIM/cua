# #171 M6b pre-flight (revision 2)

- Spec: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, cited as `L<n>` (the spec at 8f4df73a4).
  M6a's pre-flight, `…-m6a-preflight.md`, is cited as `M6a §<n>`. Code is cited as `file L<n>`, at 84216c0fe: the
  branch has changed no code since.
- Base: `feat/171-m6b` = main 854103aa5 (0.4.5's merge, #585) plus the Decision Log entries of M6b's start
  (L2938–2950) and of this pre-flight's review (L2952–2972). Plugin 0.29.21. Engine 0.4.5 pinned,
  `MIN_ENGINE_VERSION` 0.4.5 (`src/services/engine/linux/client.mjs` L37). The Linux runtime is
  `cua-linux-<arch>-e0.4.5-n24.22.0-s0.163.0-mb71dc1f8185d` (`runtime/linux-runtime.json`).
- **Revision 1** folds the adversarial review of dac55083b and the rulings on it (1215 and 1216, L2952–2972):
  - the vendor's tree is reported and never removed (1216 (b′), which supersedes 1193 (b));
  - every engine refusal is source-aware, with one install command;
  - forks F1, F2 and F5 to F11 are ruled, and F3 and F4 fell away with the removal (§7.1);
  - the review's seven other findings are fixed in the sections they belong to.
- **Revision 2** folds the bounded re-review of 0c6c5b455 (one P1, five P2s) and ruling 1217, which confirms
  revision 1's nine choices (§7.2). 1217 is cited from the revision's brief; T9 puts it in the Decision Log.
  - A linked `staging/` is refused before any acquiring lane writes (§3.4).
  - The report's sentence claims only what cua knows (§3.3).
  - The second selector's read is bounded, and install's sentence promises no readiness (§2.1, §2.2).
  - The bootstrap binds the script, the conf and the checkout to one commit (§3.6).
  - Each fixture is compared once with its authenticated deb before its manifest is pinned (§4.4).
  - E3's version probe and the fixture cell's bindings are stated as they can pass (§5.2).
- **An opt-in removal is deferred to #586,** which carries the review's three removal P1s as its requirements
  (L2954–2956, L2963). Nothing here plans it.
- **Ruled, and folded in as constraints:** 1193 (a) and (c) (L2899, L2903), 1212 and #570 (L2947–2948), 1211:
  nothing in M6b installs or updates an engine by itself (L2949), the Linux vendor lanes deleted with M5's sitting
  cited (L206, L3062), and 1215 and 1216.
- Names. `<installer>` is `node <this checkout>/bin/cua.mjs install` (`ownInstaller`, `src/runtime/installer.mjs`
  L13–16). The release that carries M6b is **0.30.0** (F1). `<engine.json>` is the path `engineSettingsPath(env)`
  gives, `~/.config/cua/engine.json` by default.
- Dispositions in §1: **D** deleted, **M** moved to cua's own parts, **K** kept.
- This pre-flight ran no cua code, wrote to no cua home and touched no ticket. It read the code, the specs, M5's and
  M6a's evidence, this VM's default home (the listing of its `runtimes/`, the release's `install.json`, its files'
  sizes and one file's hash), the two preserved vendor fixtures (their listings and hashes) and the two pinned debs
  (their lengths and hashes).
- Task 165 is arm64's FB (N9). Loop tasks continue from task 166. "T" numbers are this document's rows. The build's
  branch is `feat/171-m6b`.

## 0. What the reading found

1. **Two things still read the vendor's package on Linux, and a third places it.** The vendor selection resolves
   its tree (`src/runtime/launch.mjs` L555, L607–616). Doctor checks it in one row
   (`src/runtime/doctor-linux-runtime.mjs` L140–155). `cua install` places it as its last lane
   (`src/runtime/linux-install.mjs` L129–141). The rest of `src/` serves those three: the deb pins and their parser,
   the deb's unpacking, and the sentences that offer the vendor engine as a way out.
2. **M6b moves no pin, so no home needs an install to keep its sessions.** The derived release is the one main
   installs today. One kind of home is met by the update at once: one whose environment or `engine.json` selects
   `vendor` is refused.
3. **A home's vendor tree stays where it is** (1216). Its install record, `{schema, release, archive: {sha256,
   length}, source, installedAt}` (`src/runtime/install.mjs` L116), names the archive and not what was unpacked. It
   can say that a cua install recorded a release there, and no more, so the report is worded to that (§3.1). The
   report needs the two releases' names, hashes and lengths as constants of its own, because 1193 (a) keeps the deb
   records out of install's reach.
4. **In this home the tree is 211,063,820 bytes in 2,345 files,** with no links and 327 directories:
   `runtimes/26.928.40906-linux-x64/` holds `cua_node/` and `install.json`. The figure is the sum of its files'
   sizes, §3.2's method. `du -sb` of coreutils 9.4 prints the same; `du -s` prints 218,714,112, which counts blocks.
5. **Install's and doctor's own reads can still follow a link into the tree.** `installNode`
   (`src/runtime/node-install.mjs` L69) and doctor's `nodeBlockers` (doctor-linux-runtime.mjs L136) hand
   `node/<version>` to `readNodeRecord`, which opens its `install.json` with `readFileSync`
   (`src/runtime/managed-node.mjs` L108–110). Launch keeps that path out of the tree before it reads it (launch.mjs
   L743–753). These two do not, and doctor reaches its read after the guarded lookup has refused. Install's writes
   have the same gap. Every lane that acquires a part makes its scratch under `<home>/staging`: the helper
   (`src/runtime/install.mjs` L345–347), Node (node-install.mjs L61–64, L85) and the engine (install.mjs L396–398;
   a local build's placing, `src/runtime/linux-engine.mjs` L240–242). Only the module tree refuses a linked
   `staging/` (`src/runtime/module-tree.mjs` L445). The helper's lane also reads its installed file through a link
   (install.mjs L334) (§3.4).
6. **A cloud VM runs the provisioner it was created with.** cloud-init writes `cua-provision.sh` to
   `/usr/local/sbin` once (`deploy/cloud-vm/cloud-init.yaml` L10–13). A re-run moves the checkout and not the script
   (`cua-provision.sh` L354–356). The scripts in the field ask the checkout for a Linux pin (L83–88 at main, L288–291
   at 9d3fdce6b), which M6b's checkout does not have (§3.6).
7. **The pin-time reader needs more of a deb record than its hash.** `lockfileMember(pin)` builds the lockfile's
   path inside the deb from `layout.moduleDir` and `components` (`scripts/modules-pin.mjs` L89–92). For both records
   that path is `./usr/lib/chatgpt/resources/cua_node/lib/node_modules/.pnpm/lock.yaml` (§4.1).
8. **The engine's gate takes the pinned vendor build from the run home's `runtimes/`**
   (`scripts/linux-engine-gate/gate.mjs` L76, L85–89). F7 keeps the differential lanes as a development instrument,
   so they need that build from a place that is no cua home. Both architectures' release trees are preserved on
   dc-linux171-1e68 as hash-checked tars (§4.4).
9. **`sky_linux` must stay nameable in one role.** Acceptance item 1 is "no vendor process" (L192), and the watches
   that prove it look for that name (`scripts/linux-engine-gate/engine-watch.mjs` L19;
   `scripts/accept/linux-runtime-watch.mjs` L15, L73; `scripts/accept/linux-trace.mjs` L304). The spec's "the
   `sky_linux` patterns are removed" (L164) is read as: nothing expects that process, and something still detects it.
10. **No vendor lane has run on the code M6b starts from.** R1 and R2 were counted on 0.4.0
    (`docs/evidence/2026-10-28-own-linux-engine/m5/README.md` L224). T10 ran them again on 0.4.3 as flip checks
    (`m5/t10/README.md` L97–98). M6a ran R1's two lanes on 0.4.4 at f41546d08, on x64, with a diff of 0 and the three
    declared defects (`m6a/README.md` L80–88). f41546d08 holds neither #558's Linux tree escapes nor #565's JSONL
    framing: 0e7f3de4a and f6a6002ef are not its ancestors (§5.3).
11. **R1's verdict is the diff's.** `scripts/linux-engine-gate/suites.sh` logs the cua run's status (L136) and exits
    with the diff's or the cleanup's (L140–141). With the vendor run and the diff gone, nothing of the cua lane
    would decide the part (§1.3).
12. **Four shared harness sites select the vendor engine for `cua install`,** so that a macOS install builds no
    engine (#117 M4): `scripts/repl-parity/remote-device.mjs` L35, `scripts/repl-parity/selection-device.mjs` L76,
    `scripts/native-baseline/prepare.mjs` L167, `scripts/browser-parity/capability-home.mjs` L38. They run on Linux
    devices too, where that selection becomes a refusal.
13. **The gates L218 names have moved.** `test` is `test-1` and `test-2` since #578 (`.github/ci-kit.yml` L25, L30).
    `engine-linux` runs only for paths this plan leaves alone (L152–154), so a default run skips it (§5.2).
14. **The arm64 VM ends on 2026-11-26T01:00Z.** M6b's acceptance does not need it: arm64 runs on the hosted runner,
    and the arm64 fixture is already on the x64 VM. One five-minute step runs there first: arm64's FB, task 165 (N9).

## 1. The inventory

### 1.1 `runtime/`

| Place | What it is | After | Why |
|---|---|---|---|
| `runtime/releases/26.928.40906-linux-x64.json`, `…-linux-arm64.json` | the deb pins: URL, length, SHA-256, `notes` (how the hash was checked), and what to unpack and where (`components`, `runtime`, `layout`, L13–31 of each) | **M** to `runtime/provenance/`, trimmed to what names an archive and the one member read from it (§4.1) | 1193 (a), F5 |
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
| `manifest.mjs` L201 `selectPin`, asked for a Linux host | finds no Linux pin | `unsupported_platform`, its sentence naming `deploy/cloud-vm/update.sh` (§3.6) | an old provisioner is the one caller left |
| `manifest.mjs` L187–194, L236–329: the pointer's rule, the Linux record, `locateOwnLinuxRuntime` | cua's own runtime | **K** | – |
| `runtime/launch.mjs` L552–555, the vendor selection; L607–616 `vendorEngineTree`; the `vendor` seam (L532, L552) | resolves the tree | **D**; `vendor` set on Linux is refused `engine_retired` (§2.1) | L164, 1193 (c) |
| `launch.mjs` L290–297, L315, L349: `vendorEngine` in `buildLaunch`, its trusted path, `OAI_SKY_LINUX_BIN` and the vendor service; header L62–65 | launches the vendor engine | **D**. A Linux computer launch requires `replHost.engine.bin` | L164 |
| `launch.mjs` L579, the refusal's tail: "(or a local build with `cua engine build`), or set CUA_NATIVE_ENGINE=vendor for the vendor engine" | offers the vendor engine | the one command (§2.1) | 1212 |
| `launch.mjs` L558–575, the override's refusals: a build, then the unset, then the installer; `runtime/installer.mjs` L15, the hint's bare `install` | – | the source-aware form, and a hint that holds no command (§2.1) | 1216 |
| `launch.mjs` L490–493: the defaults and `['vendor', 'cua']` | the setting's values, for both platforms | **K** | macOS's default is `vendor`; on Linux `vendor` stays a known value, so that it is refused by name |
| `runtime/vendor-tree.mjs`, whole; its callers `launch.mjs` L564, L585, L728, L744, `runtime/sandbox.mjs` L267–313, `runtime/linux-engine.mjs` L145, `secrets/project.mjs` L37, `runtime/doctor-engine.mjs` L77 | keeps every own lookup out of `<home>/runtimes/` (M6a's F2a) | **K**; install's and doctor's Node reads join its callers (§3.4) | A home keeps its tree until a person deletes it (1216) |
| `runtime/node-install.mjs` L69; `runtime/doctor-linux-runtime.mjs` L131–138 `nodeBlockers`: `readNodeRecord` on `node/<version>` (`runtime/managed-node.mjs` L108–110) | follows a linked `install.json` into the tree | guarded as launch guards it (§3.4) | finding 5 |
| `runtime/install.mjs` L345–347 (the helper), L396–398 (the engine); `runtime/node-install.mjs` L61–64, L85; `runtime/linux-engine.mjs` L240–242 (a local build): each lane's scratch under `<home>/staging`. `install.mjs` L334: the helper's installed file, read by `readFileSync` | writes, and cleans up, through a linked `staging/`; reads through a linked helper | each refused before the lane's first access (§3.4) | finding 5 |
| `runtime/engine-sign.mjs` L45–57 `readEngineSettings` | reads `engine.json` whole, following a link | **K**. The refusal's look for a second selector uses a bounded reader of its own (§2.1) | the re-review |
| `runtime/install.mjs` L69–70 `DEB_TOOLS`, `DEB_PAYLOAD`; L84; the deb halves of `withStage` (L129–130, L141) and `snapshotArchive` (L259); `extractDeb` L155–160; the `activate` option (L79), which only Linux passed; header L18–24 | acquires and unpacks the deb | **D** | L164 |
| `install.mjs` L184–187, `release_refused` and its hint naming `CUA_NATIVE_ENGINE=vendor` | `cua runtime use <vendor release>` | **D**; the name is `unknown_release` like any other | no pin recognises it |
| `install.mjs` `installRuntime`'s zip path, `download`, `verifyArchive`, `installSandboxHelper`, `installLinuxEngine`, `installMacosEngine` | macOS's install; cua's own parts | **K** | – |
| `runtime/linux-install.mjs` L129–141, lane 7; L68–72 `requestedLanes`' vendor half; L85–86 `--release`; L153–154; L162–163; the "other engine" of `readiness` and `opensNow` (L215–216, L257–258) | installs the tree and reports the vendor engine as an alternative | **D**; step 7 becomes the report (§3) | acceptance 13, 1216 |
| `runtime/retired-tree.mjs` | – | **new**: the report (§3) | 1216 |
| `runtime/doctor-linux-runtime.mjs` L140–155 `vendorRow`, L69; header L19–23 | the `runtime.vendor` row | **D**; `runtime.retired` in its place (§2.3) | acceptance 13, 1216 |
| `doctor-linux-runtime.mjs` L91: a pointer naming a vendor release, told by the pins or by its leading digit | words of `runtime.installed`'s warning | **K**, by the name's form alone | it describes `current.json`, not the tree |
| `runtime/doctor.mjs` L133–141 (the vendor pins and `pinsError`), L214 (the `vendor` seam); header L52–55 | feeds `runtime.vendor` and the vendor selection | **D** on Linux | – |
| `doctor.mjs` L199 `leftoversCheck`, and `runtime/codex-leftovers.mjs` L36 (`codex`), L83–107 (the scan of release trees) | names the Codex CLI's `codex` file inside a Linux release | **D** on Linux: there the row reads the home's `state/codex` only | the tree is reported whole (§3), and nothing of cua's deletes inside it (N4) |
| `doctor.mjs` L173–187, `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc`, `runtime.signatures`; `runtime/checks.mjs` | macOS's rows and checks | **K**; the branches for a pin with no IPC or no signing (`checks.mjs` L42, L69; `doctor.mjs` L188–190) go, dead once no Linux pin parses | macOS |
| `runtime/doctor-engine.mjs` L237–244, the vendor engine preferred on Linux (`skip`, or `fail` without its tree); L219–221 `SETTING_FIX.engine` ("name vendor or cua"); L192–193 | the `engine` row | `fail` with the `engine_retired` sentence (§2.3) | 1193 (c) |
| `src/cli.mjs` L48, L77–85, L86–89, L114 (usage); L189, L204 (`--archive`, `--release` on Linux) | the flags and their text | on Linux both flags are a usage error (§3.5) | no deb to take |
| `mcp/surface.mjs` L279 `LINUX_COMPUTER_RULES.vendor`, L291; note L267–270 | the `js` tool's rule for the vendor engine on Linux | **D** for Linux; macOS keeps both sets | no Linux session can select it |
| `mcp/connection.mjs` L5–8, L135; `runtime/layout.mjs` L2 | comments | reworded | – |
| `services/engine/linux/client.mjs` L47, L71: "cua-engine `<found>` is older than `<min>`, which this cua needs; run `<installer> --engine`" | the service's own refusal | **K**: already the one command; a test pins it (N5) | 1212 |
| `services/sky.mjs` L23–52, `repl-host/supervisor.mjs` L11, L18–19, `runtime/sandbox.mjs` L9, L32, `runtime/linux-desktop.mjs` L4, `services/engine/linux/*.mjs` | comments that name `sky_linux` or the vendor as where a ported behaviour came from | **K**, untouched | Provenance of ported code. And leaving the service, the facade and the host byte-identical is what §5.3's credit rests on |

### 1.3 Scripts and harnesses

| Place | What it does | After | Why |
|---|---|---|---|
| `scripts/modules-pin.mjs` L32, L59, L286: `loadPins()` filtered to Linux, matched to a deb by length and SHA-256 | the authenticator | **K**; reads `runtime/provenance/` through its own strict reader (§4) | 1193 (a) |
| `scripts/sandbox-probe/linux-probes.mjs` (460 lines; L416–438 read `codexCli` and `skyLinuxBin` off the resolved runtime) | #115 M0c's probes; no caller | **D**, with `test/sandbox-probe/linux-probes.test.mjs`; its evidence stays (F8) | #570 |
| `scripts/repl-parity.mjs` L50–55, L67; `scripts/repl-parity/native.mjs` L15–16: a Linux native run names `--engine`, vendor or cua | the engine lanes of the native suite | the vendor lane **D**: on Linux `--engine vendor` is refused, citing where its last run is stored | ruled |
| `scripts/repl-parity/native-linux.mjs` (the diff of a vendor run and a cua run, L49–65), `scripts/repl-parity/expected/native-linux.json`, `scripts/repl-parity/vendor-defects.mjs`, `vendor-release.mjs`, and the 6 Linux engine entries of `test/repl-parity/vendor-defects.json` | judge two stored runs | **K** (F6). `checkEnginePair` (L51–66) takes two kinds of pair. A stored vendor and cua pair keeps today's checks, the vendor releases included. A cua and cua pair needs one own runtime, commit, controller commit, device and case set, and each lane's engine evidence; it takes no declarations, and no vendor release is asked of either record | They read run directories, not engines. M5's and M6a's stored lanes are re-judged through them, as task 139 did. A run made after M6b records no vendor release |
| `scripts/repl-parity/engine-answered.mjs` L12, L129–131: the vendor lane's expected engine, from `vendorLinuxRuntime` | says which engine a lane must have run | the vendor expectation **D**. `engineKind` and `serviceKind` (L27–37) **K**: a `sky_linux` under the worker still fails a cua lane | finding 9; ruling 1175's exported shape is kept |
| `scripts/repl-parity/provenance.mjs` L28, `vendorRelease` from `selectPin` on Linux | records the vendor release a run could use | **D** on Linux | no Linux pin |
| `scripts/repl-parity/archive-cache.mjs` L37–40, L62: the vendor archive in the parity cache, and `--archive` in `installArgs` | prepares scratch homes | **D** on Linux | – |
| `remote-device.mjs` L35, `selection-device.mjs` L76, `native-baseline/prepare.mjs` L167, `browser-parity/capability-home.mjs` L38 | `CUA_NATIVE_ENGINE=vendor` on `cua install` | set on macOS only | finding 12 |
| `scripts/repl-parity/selection.mjs` L50–57, the oracle's Linux table: `vendor` passes with its tree, else `engine_not_installed` | the independent table of the selection | `vendor` is `engine_retired`; the `vendorTree` input goes | mirrors §2.1 |
| `scripts/native-baseline/engine.mjs` L60; `scripts/native-baseline.mjs` L38: a Linux run names its engine | the lanes of the native baseline | the vendor lane **D**, refused as above | ruled |
| `scripts/native-baseline/compare.mjs` (`compare --engines`), `summary.mjs` L78–82 | judge stored runs | **K** (F6) | as `native-linux.mjs` |
| `scripts/native-baseline/remote.mjs` L12, L122–131 (`runtimeRoot` from `vendorLinuxRuntime`), L239; `linux.mjs` L94–95 (`ps` for `sky_linux`, classified by that root), L172–176; `linux-cells.mjs` L1 | list the helpers a run met | **M**: they list `cua-engine` by the run home's engine; a `sky_linux` seen is recorded as foreign | L164 |
| `scripts/probe/lib.mjs` L82, the reason `verify.mjs` skips its socket step on Linux: "the computer-use helper (sky_linux) is a child process…" | wording | **M**: names `cua-engine` | L164 |
| `scripts/linux-engine-gate/suites.sh` L135–137 (R1's vendor run and the diff), L150 (R2's vendor runs); `steps.mjs` L109, L114 | the facade suites in the gate | R1 is the cua lane alone, and the verdict is its own: the run's exit status, 34 of 34 cases, both text cases positive, and the engine the home's `cua-engine` under the worker. Cleanup runs whatever happened, and its failure fails the part too. R2 **D** as a step | ruled; finding 11; R2 is a comparison of two lanes |
| `scripts/linux-engine-gate/gate.mjs` L76, L84–89 `defaultsFor`: the pinned vendor build and the vendor's client from the run home's `runtimes/` | feeds `--vendor` and `--vendor-js` to every differential step | **M**: from the hash-checked comparator fixture (§4.4) | finding 8, F7 |
| `scripts/linux-engine-diff.mjs` and `scripts/linux-engine-diff/` (`vendor-js.mjs`, `wire-check.mjs`, `services.mjs`, `scene-ended.mjs`, `xprobe/`), the gate's differential steps | drive vendor binaries given by path, beside cua's | **K** (F7) | The engine's instrument. It never went through selection or install, and the spec's M6b names none of it (L348) |
| `scripts/linux-engine-gate/engine-watch.mjs` L19; `scripts/accept/linux-runtime-watch.mjs` L15, L73; `scripts/accept/linux-trace.mjs` L304 | detect a `sky_linux` | **K** | finding 9 |
| `scripts/accept/linux-runtime-watch.mjs` L88–92 `vendorEngineProblems`; `scripts/accept/linux-text.mjs` L11, L96 (`--read-only`, E5's rollback); `linux-runtime-cells.mjs` L18–19, L112–121; `linux-runtime.mjs` L304–329, L370–375, L430–460 | acceptance 12's vendor cells | **D**; the driver becomes acceptance 13's (§5.2) | the rollback is what M6b retires |
| `scripts/accept/linux-fallback.mjs`, `linux-selection.mjs`, `scripts/linux-engine-gate/fallback-home.mjs` | the five homes with no usable engine of cua's | **K**; their expected sentences follow 1212 | – |
| `scripts/accept-native.mjs`, `scripts/accept/{engine-lane,compat-route,own-sandbox,reinstall,install-item}.mjs`, `scripts/native-matrix*`, `scripts/cursor-sitting*`, `scripts/probe-lifecycle.mjs`, `scripts/sandbox-probe/{experiment.mjs,hosted-gate.sh}`, `scripts/repl-parity/native-mac*.mjs`, `verify.mjs` L48 | name the vendor engine or host on macOS | **K** | macOS |

### 1.4 Tests

| Tests | After |
|---|---|
| `test/runtime-linux-install.test.mjs`, whole (the deb's install, L27–108); `test/sandbox-probe/linux-probes.test.mjs` | **D** with their subjects |
| `test/runtime-manifest.test.mjs` L88, L96, L119 (the Linux pins), L198 (the deb hint), L381, L398 (`vendorLinuxRuntime`) | **D**; in their place: a Linux pin is `invalid_pin`, and the two records load from `runtime/provenance/` only through the script's reader |
| `test/runtime-linux-engine-selection.test.mjs` L267, L281; `test/runtime-linux-launch.test.mjs` L171, L191; `test/serve-lazy.test.mjs` L548; `test/doctor-engine-linux.test.mjs` L140, L195, L208 | **D**; in their place the rows of §5.1 for `engine_retired` and 1212 |
| `test/cli-linux-install.test.mjs` L155, L204, L226, L240, L253, L295, L312, L391, L444, L543 | the vendor lane's cases **D**; the report's and the flags' cases in their place |
| `test/runtime-linux-doctor.test.mjs` L94, L118, L309, L336, L347 | `runtime.vendor`'s cases **D**. A home with no recorded release has no `runtime.retired` row; one with it has the row, as `skip` |
| `test/runtime-codex-leftovers.test.mjs` L195 (Linux's `codex` file) | **D**; in its place: on Linux the scan lists nothing under `runtimes/` |
| `test/fixtures/runtime-fixture.mjs` L158–170, L223 (`linuxDebFixture`, `linuxFixturePin`); `test/fixtures/installed-home.mjs`; `test/fixtures/linux-native-runtime.mjs` (a fake vendor service and a fake `sky_linux`) | **M**: a Linux fixture home holds cua's own parts and an engine double behind cua's real service |
| `test/repl-host/linux-native.test.mjs` L132, L179; `test/repl-host/linux-native-runtime-fixture.test.mjs`; `test/linux-secrets.test.mjs` L56–73; `test/linux-sandbox-refusal.test.mjs` L171; `test/mcp-browser-surface.test.mjs` L542 | **M**: the same assertions about the host, the wrapper and the sandbox, on that fixture. `linux-native.test.mjs` L227 already runs so |
| `test/runtime-linux-no-vendor-read.test.mjs` | **K**, and extended: doctor and install join the recorded entry points, and its linked fixtures are replayed through both (§3.4, §4.3) |
| `test/services-sky-linux-launch.test.mjs`, `test/services-sky-linux-policy.test.mjs`, `test/services-sky.test.mjs` | **K**: the wrapper against a delegate double, whatever service it stands for |
| `test/repl-parity/{engine-answered,native-linux-selection,provenance,selection-oracle}.test.mjs`, `serve-native.mjs`; `test/native-baseline/{engine,linux,linux-engine,remote,run}.test.mjs`; `test/linux-engine-diff/gate-runner.test.mjs` L266–271; `test/browser-parity/capability-host.test.mjs` L122–143; `test/probe-lib.test.mjs` L59; `test/accept-linux-{runtime,runtime-cells,selection}.test.mjs` | follow their scripts (§1.3) |
| `test/repl-parity/{native-linux-expected,native-linux-arm64,vendor-defects}.test.mjs`; `test/native-baseline/compare*.test.mjs` | **K** with their judges (F6) |
| `test/cua-api/linux-engine-document.test.mjs` L158 | **K**: the Linux document already names no engine |
| `test/deploy-cloud-vm.test.mjs` L40–46, L94–98 | follow the provisioner (§3.6) |

### 1.5 Docs, deploy, skills and the plugin's text

| Place | Says today | After |
|---|---|---|
| `README.md` L33, L68 (Install) | OpenAI's Linux package "only for `CUA_NATIVE_ENGINE=vendor`"; install tries it | no OpenAI package on Linux |
| `README.md` L125–144, "Updating on Linux" | one install per home since M6a | adds 0.30.0: sessions need no install; a home that selects `vendor` is refused; install and doctor name OpenAI's package where an install recorded it, with its size, leave it in place, and say what to check before deleting it by hand; an older cua sharing the home may still run from it |
| `README.md` L1275–1287 | the vendor engine as the second of two, "the rollback" | one engine; a sentence that the vendor's was removed in 0.30.0, with M5's and M6a's evidence cited for what it was measured against |
| `README.md` L1301–1308 (the cloud template), L1330 (`ar`, `tar`, `xz`), L1342, L1347–1352 ("OpenAI's deb, for the vendor engine only") | the deb, its tools, a mirror, `--archive` | **D** |
| `README.md` L1373, L1436–1442 | `sky_linux`'s `list_apps`; the vendor engine's typing caveats | the engine's inventory; the caveats **D** |
| `README.md` L1449–1450 (doctor), L1466–1483, L1504–1511 (install's steps), L1532–1538 (selection), L1557–1568, L1580 | `runtime.vendor`; step 7; "`vendor` in either selects the vendor engine"; "what a session sees that the vendor engine does not answer" | the rows of §2.3; the report in place of step 7; the refusals of §2.1; the same list, said of cua's engine alone |
| `README.md` L1842, L1847 (Configuration), L1934 (Licences) | `runtimes/` "on Linux only for `CUA_NATIVE_ENGINE=vendor`"; `CUA_NATIVE_ENGINE` "`vendor` or `cua`" | macOS only; on Linux `cua`, with `vendor` refused since 0.30.0; the vendor runtime is macOS's |
| `deploy/cloud-vm/render.sh` L5, L8–12, L22–31, L45–49, L61; `create-hetzner.sh` L8–13, L28, L52–62, L104–105; `cua-provision.sh` L10–16, L31–50, L82–144, L153, L174, L181; `deploy/cloud-vm/README.md` L21–24, L43, L82–91, L127, L132–148 | `--deb` and `CUA_DEB`; the fetch, the wait and `--archive`; "edit the conf to change the ref" | **D**. `deploy/cloud-vm/update.sh` is new, and it is the README's upgrade command (§3.6, F9) |
| `skills/cua-remote/SKILL.md` L27 | "keep a copy of the deb for `--archive`" | **D** |
| `.claude-plugin/plugin.json` L3 | "(OpenAI's with CUA_NATIVE_ENGINE=vendor)" | **D**; version 0.30.0, as `.claude-plugin/marketplace.json` L11 (F1) |
| `package.json` L5; `CLAUDE.md` L3–4, L20 | "for OpenAI's computer-use runtime on macOS and Linux"; "the pinned vendor release relocated under `CUA_HOME`" | macOS's vendor runtime, Linux's own |
| `docs/cua-api/linux-engine.md`, `core.md` | nothing of the vendor engine | **K**, unchanged |
| `tech-debt-tracker.md` L6 | #570 | removed at close-out |
| the spec L155–164, L206, L346–348 | "Retirement (M6b)" | folded with what was built (T9) |

### 1.6 CI

| Place | What | After |
|---|---|---|
| `.github/workflows/linux-runtime.yml` L1–13, L31, L35, L129, L149, L186–195: acceptance 12's suite, the `older` input "the cua before M6a" | the hosted venue | the suite runs acceptance 13's driver; `older` is the cua before M6b (§5.2) |
| `linux-runtime.yml` L85, L179: `binutils xz-utils`, "the deb's tools" | for the older cua's install | **K**: the upgraded home is made by the older cua's real install (F11) |
| `.github/ci-kit.yml` L197 (`sandbox-live`: `runtime/**`), L283 (`parity-browser`: `runtime/releases/**`), L254 | hosted macOS gates over the vendor's macOS archive | **K**. Moving the records touches `runtime/**`, so `sandbox-live` runs on the pull request, which L218 wants in any case |
| `.github/ci-kit.yml` L98, L105–154 (`engine-linux`), L155–175 (`harness-dbus`) | cua's engine and its harness; no vendor package | **K**. `engine-linux`'s paths (L152–154) are none M6b changes, so it is selected by name at the frozen head (§5.2) |
| `.github/ci-kit.yml` L25, L30 (`test-1`, `test-2`) | `npm test` in two shards, the gates L218 calls `test` | **K** |
| `.github/workflows/linux-engine.yml`, `linux-sandbox-helper.yml` | cua's own releases | **K** |

### 1.7 Where the line falls in shared files

- **`manifest.mjs`.** `parsePin` keeps one schema, the darwin one: `signing` and `runtime.ipc` required, no
  `archive.format`, no `notes`. `loadPins`, `selectPin`, `findPin`, `runtimeFor`, `readInstalledRecord` and the
  pointer's selection serve macOS as today. A Linux host never calls them; an old provisioner's `selectPin` is
  answered as §3.6 says.
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

### 2.1 One form, by source (1212, 1215, 1216)

Line numbers in §2 are `src/runtime/launch.mjs`'s unless a file is named.

Every engine refusal on Linux reads: what was selected and why it cannot run, a colon, the prerequisite for the
source that selected it, then the one command. The prerequisite is a precondition of that command, never a second
remedy. Each refusal carries the same hint, which holds no command:

> a `cua` from another checkout installs that checkout's engine, not this one's

| Refused | Selected by | After the colon |
|---|---|---|
| `engine_retired` | `CUA_NATIVE_ENGINE=vendor` | unset `CUA_NATIVE_ENGINE`, then run `` `<installer> --engine` `` |
| `engine_retired` | `"engine": "vendor"` in `engine.json` | remove `"engine"` from `<engine.json>`, then run the same |
| `engine_retired` | both | unset `CUA_NATIVE_ENGINE` and remove `"engine"` from `<engine.json>`, then run the same |
| every refusal of an override: `engine_outdated`, `engine_not_installed`, `engine_unrecorded`, `invalid_setting` | `CUA_LINUX_ENGINE_BIN` | unset `CUA_LINUX_ENGINE_BIN`, then run the same |
| `engine_outdated`, `engine_not_installed`, `engine_unrecorded` of the installed engine | no setting to undo | run the same |
| the same, its path a link into the vendor's tree | the link | move `<link>` aside, then run the same (as today, launch.mjs L584–587) |

`engine_retired`, by the environment:

> `CUA_NATIVE_ENGINE=vendor` selects the vendor's engine, which cua 0.30.0 removed from Linux, where cua's own engine
> (`CUA_NATIVE_ENGINE=cua`, the default) is the only one: unset `CUA_NATIVE_ENGINE`, then run
> `` `<installer> --engine` ``

By `engine.json`:

> `"engine": "vendor"` in `<engine.json>` selects the vendor's engine, which cua 0.30.0 removed from Linux, where
> cua's own engine (`CUA_NATIVE_ENGINE=cua`, the default) is the only one: remove `"engine"` from `<engine.json>`,
> then run `` `<installer> --engine` ``

By both, in precedence order (the variable is read first, launch.mjs L666–669):

> `CUA_NATIVE_ENGINE=vendor` and `"engine": "vendor"` in `<engine.json>` select the vendor's engine, which cua
> 0.30.0 removed from Linux, where cua's own engine (`CUA_NATIVE_ENGINE=cua`, the default) is the only one: unset
> `CUA_NATIVE_ENGINE` and remove `"engine"` from `<engine.json>`, then run `` `<installer> --engine` ``

An override below the minimum:

> `<source>` selects cua's own engine, and CUA_LINUX_ENGINE_BIN names `<path>`, which is 0.4.4, older than 0.4.5,
> which this cua needs: unset CUA_LINUX_ENGINE_BIN, then run `` `<installer> --engine` ``

The installed engine below the minimum (1212):

> `<source>` selects cua's own engine, and the engine installed in this cua home (`<path>`) is 0.4.4, older than
> 0.4.5, which this cua needs: run `` `<installer> --engine` ``

- **Raised first.** `linuxEngineFor` refuses `vendor` as its first act. It looks for no tree and reads no pin, so
  the sentence is the same with the tree present, absent or damaged.
- **Both sources, by a bounded read.** Today `engineSetting` stops at the variable (L666–669), and `engine.json` is
  not opened. To name both, the Linux refusal looks at `<engine.json>` once more. It does so through a reader of its
  own, not `readEngineSettings`, which follows a link and would wait on a FIFO (`src/runtime/engine-sign.mjs`
  L45–48):
  - the path passes `outsideVendorTree` first, and one that leads into the tree is not opened;
  - it must be a regular file by `lstat`, of at most 64 KiB, opened without following a link and without blocking,
    and still a regular file by `fstat`;
  - on any failure there is no second source: absent, a link, a FIFO, a directory, too large, unreadable, or not a
    JSON object. The read never throws and never waits, and the sentence names the variable alone.
- **Its tests,** each with `CUA_NATIVE_ENGINE=vendor` set: an `engine.json` that is a link into the recorded
  release, and one that is a FIFO. Each is refused at once with the variable's sentence. The recorder shows no path
  under `runtimes/` and no open of the FIFO.
- **The first read is today's.** With no variable set, `engine.json` is read by `readEngineSettings` as on main,
  link-following included. M6b leaves that read as it is, and T9 records it in `tech-debt-tracker.md`.
- **The sentence names `CUA_NATIVE_ENGINE=cua`,** as L164 asks, as what the default is. Its instruction is 1216's:
  unset (N1).
- **The release** is one exported constant, `'0.30.0'`, beside the selection. A test holds it no later than the
  plugin's version, and T1 lands the bump with it (§5.2).
- **The override's refusals** are written by one function (L563), but for a relative path's (L560), and all take
  the form. Today that function offers a build, then the unset, then the installer (L562–568), and its hint names a
  bare `install` (installer.mjs L15). `cua engine build` and `cargo build` leave every refusal. The README's engine
  section keeps them.
- **`<source>`** is as today: `CUA_NATIVE_ENGINE=cua`, the `engine.json` wording, or "the default engine (cua)"
  (L493).
- **The service's own sentence** (client.mjs L71) already gives the one command and stays byte for byte (N5).
- **A value that is no engine.** Linux's sentence stops offering one that is refused: "`CUA_NATIVE_ENGINE` must be
  cua (cua 0.30.0 removed the vendor's engine from Linux)". macOS keeps "must be vendor or cua".
- **Node's refusals** (L727–739) name the runtime's installer, not the engine's. They never offered the vendor
  engine and are unchanged.
- **A browser-only session** asks for no engine (`replHostFor`, L450), so it opens with any of these set, as M6a's
  C7 had it.

### 2.2 `cua install` under a vendor selection (F10)

Install runs every step, then exits nonzero with `engine_retired`. The sentence ends differently, because the
command it would name is the one that just ran:

> `CUA_NATIVE_ENGINE=vendor` selects the vendor's engine, which cua 0.30.0 removed from Linux, where cua's own engine
> (`CUA_NATIVE_ENGINE=cua`, the default) is the only one: unset `CUA_NATIVE_ENGINE`; the install otherwise
> completed

- The other two sources end the same way, each with its own prerequisite.
- "Otherwise completed" is said only when it is true. When a step failed, that step's error is the install's, as
  today, and the last line names the setting.
- **It promises nothing about the next open.** A malformed `engine.json`, or an outdated override that is still
  set, can refuse it, each with its own sentence. 1216 asks for "the install otherwise completed" and no more.

### 2.3 Doctor on Linux

The rows, in order: `platform`, `runtime.installed`, `runtime.modules`, `runtime.node`, `sandbox`,
`sandbox.launcher`, `run.stale`, `runtime.leftovers`, `runtime.retired` when there is one, `display`,
`accessibility.bus`, `accessibility.enabled`, `sandbox.userns`, `secrets.store`, `repl.host`, `engine`, the Chrome
rows and the `agent.*` rows.

| Row | After M6b |
|---|---|
| `runtime.vendor` | gone. No row checks a vendor runtime |
| `runtime.retired` (new, 1216) | present only when §3.1 finds a recorded release. Its status is `skip` whatever it finds, so it never fails doctor and never counts as a warning. Its detail is §3.3's sentence (N2) |
| `runtime.installed`, the pointer naming an older cua's release | unchanged: "…but current.json names the vendor's release `<name>`, which an older cua's install wrote: no install of this cua has completed here…; run `` `<installer>` ``" |
| `runtime.node`, a part of the Node linked into the tree | names the link as what blocks the installer, with nothing there read (§3.4) |
| `runtime.leftovers` | on Linux: the Codex CLI's files in `<home>/state/codex`, or `pass`. It looks inside no release (N4) |
| `repl.host`, the home selecting `vendor` | `fail`: "refused (engine_retired): `<the sentence>`; `<the hint>`. The profile listing (browser only): cua host (linux) on Node …" |
| `engine`, the home selecting `vendor` | `fail`: "the vendor's engine is selected (`<what selects it>`), and every Linux computer session is refused (engine_retired; see repl.host): `<the sentence>`; `<the hint>`; in this home: `<what it holds, as today>`" |
| `engine`, cua's engine refused | `fail`, with §2.1's sentence and hint, as today |
| every other row | unchanged |

`report.engine.service` is `cua` or null. `report.retired` lists what `runtime.retired` names.

## 3. Install and doctor report the vendor's tree (1216)

One module, `src/runtime/retired-tree.mjs`, used by `cua install` and by doctor on Linux. It reads and changes
nothing: it has no rename, no unlink and no write. Launch never calls it, and macOS never does: there `runtimes/`
holds the runtime sessions run from.

### 3.1 The record it trusts

The module holds the two releases cua's install ever placed on Linux, as constants:

| Release | Archive SHA-256 | Length |
|---|---|---|
| `26.928.40906-linux-x64` | `8094004f…8ad30` | 474,898,954 |
| `26.928.40906-linux-arm64` | `ab3eea13…0f5cd` | 453,477,698 |

- They carry no URL, so nothing in `src/` can fetch a deb with them.
- A test ties each to its provenance record and to `runtime/modules/provenance.json`'s `vendor` entry. Tests may
  read the records; install may not (§4).
- No other Linux release was ever pinned (`git log -- runtime/releases`: fe09732c8 added these two).

A release is named only when all of these hold:

1. `<home>/runtimes` and `<home>/runtimes/<release>` are real directories by `lstat`. A link at either is not
   followed, and nothing is named (N3).
2. `<release>/install.json` is a regular file by `lstat`, opened without following a link, of at most 64 KiB.
3. It parses to exactly `{schema: 1, release, archive: {sha256, length}, source, installedAt}`: `release` the
   directory's name, the archive's hash and length that release's constants, `source` `archive` or `download`,
   `installedAt` a date. This is the record `install.mjs` L116 wrote, read more strictly than `readInstalledRecord`
   reads it (`src/runtime/manifest.mjs` L224–232).

- **What that shows, and what it does not.** It shows that a cua install recorded placing this release at this
  path. It does not show that the files below are the vendor's, since the record names an archive (finding 3). So
  the sentence says "recorded", and nothing is ever deleted on the record's word.
- **Anything else is not named,** by install or by doctor: a directory of another name, a release with no record or
  with one that fails a check, a darwin release, a file, a link. cua calls no tree its own without a record behind
  it.
- Only the two names are looked up. `runtimes/` is never listed.

### 3.2 The size

A walk from the release directory with `lstat`, following nothing:

- the sum of the sizes of regular files and of symbolic links, a link by its own length and not its target's;
- a file with more than one hard link once, by device and inode;
- directories and every other kind of entry count nothing.

That is not `du -s`, which counts blocks, and not `du -sb` before coreutils 9.2, which adds each directory's own
size.

- Finding 4's figure is this VM's tree by this method (`find`, each file's size, summed): 211,063,820 bytes, which
  the sentence prints as 211.1 MB, at 10^6 bytes to the MB.
- The walk stops at 200,000 entries or at its first error. The sentence then says "its size could not be measured
  (`<code>`)", and still names the release.
- Its tests use a small fixture whose sum is known: a hard-linked pair, a link, a nested directory and a fifo.

### 3.3 The sentence

Install prints it after the engine's line, and doctor's `runtime.retired` carries it:

> cua 0.30.0 no longer uses the vendor's release at `<home>/runtimes/26.928.40906-linux-x64` for sessions: 211.1 MB
> as it is now, where a `cua install` recorded placing it on 2026-10-28. cua leaves it in place and has not checked
> what it holds. Before deleting it by hand, check that no older cua (another checkout on this home) still runs
> from it, and for files added to it

- **What it says:** the path and the size, as ruled, and the one thing cua knows, that this version does not use
  the tree for sessions.
- **What it does not say:** that nothing reads the tree, or what the tree holds. The record is an old receipt for
  an archive (§3.1). It tells nothing of today's contents, and nothing of another checkout that shares the home. So
  the sentence hands the person both checks, for older consumers and for added files. The size is of whatever is
  there now, added files included.
- No command is printed, and cua runs none.
- Nothing is printed for a home with no recorded release.
- In `--json`, install's `vendor` gives way to `retired`, which doctor's report carries too:
  `[{release, path, bytes, installedAt, source}]`, with `bytes` null where the walk stopped. It never sets
  `changed`.
- The README says who an older consumer can be: a cua from before M6a runs every session from the tree, and one
  from M6a on reads it under a vendor selection (§1.5).

### 3.4 The boundary on install's and doctor's own reads and writes

M6a kept every path a session reads out of the tree (`outsideVendorTree`). Install and doctor touch the same managed
parts, and finding 5 shows reads and writes without that boundary.

- **Node's reads.** On Linux, `installNode` and `nodeBlockers` pass each path they are about to read through
  `outsideVendorTree` first, as `linuxHostNode` does (launch.mjs L743–753): the pointer, `node/<version>`, its
  `install.json` and `bin/node`. One helper serves the three callers. A path that leads into the tree is not read.
  Install refuses it, naming the first link to move aside, and doctor's `runtime.node` names that link as what
  blocks the installer.
- **`staging/`, before any lane writes.** A `staging` that links into a recorded release would take a lane's
  `mkdtemp`, its download, its unpacking and its cleanup's recursive delete inside the tree. So one helper refuses a
  `staging` that is a link, or that `outsideVendorTree` shows leading into the tree: `target_occupied`, naming the
  link to move aside, with nothing created. Every acquiring lane calls it before its first access to `staging`,
  which means before its `mkdir`, its `mkdtemp` or any read: the module tree (in place of its own `lstat` check,
  module-tree.mjs L445), the helper, Node, the engine, and a local build's placing.
- **The helper's installed file** (install.mjs L334) passes the same guard before it is read.
- **The replay** runs the linked fixtures of `test/runtime-linux-no-vendor-read.test.mjs` through the whole of
  `inspectRuntime` and of `installLinux`, under M6a's recorder: the Node's pointer and record (L165), the engine, its
  record and its directory (L182), the helper (L241), `current.json` (L315) and each home directory (L366). It adds
  a `node/` and a `modules/` that are themselves links. Its home already holds every part (its L37–45), so it
  shows reinstalls that acquire nothing.
- **A full install with the link present and the parts missing.** Each home holds a recorded release, and its
  `staging` is a link to a directory inside that release. One home has every part missing. Four more have exactly
  one part missing, a different one each (the module tree, the helper, Node, the engine), so that each lane's own
  guard is the one that meets the link. A sixth places a local build. Each runs the whole of `installLinux`, or the
  build's placing, with fixture archives served, under the recorder. Passing means:
  - the lane refuses with the link named, before it creates anything;
  - with §3's module stubbed, no path under `runtimes/` is recorded, as spelled or physical;
  - the release's listing, every file's hash and every mtime are as before, and no temp directory was made there;
  - **the negative control:** with the guard switched off through its seam, the same homes record the `mkdtemp`
    inside the release. A recorder that saw nothing would otherwise pass;
  - a `staging` that is absent, and one that is a real directory, install as today.
- **Telling the accesses apart.** Each replay and each full install runs twice. With §3's module replaced by a stub
  through its seam, no recorded path lies under `<home>/runtimes/`, as spelled or by its physical path. With the
  real module, the recorded paths there are exactly its own: `lstat` of `runtimes/` and of the two names, one open
  of `install.json`, and the walk's `lstat` and `readdir`. There is no other kind of call, nothing is executed and
  nothing is written.
- Whatever else these show is fixed the same way in the same task. From reading, three gaps are known: Node's
  record, the helper's file and `staging`. The pointer is `lstat`-ed first (node-install.mjs L162), the module tree
  refuses a linked directory by `lstat` (module-tree.mjs L430, L445), and the engine's own paths are guarded
  (install.mjs L385), though its staging is not.

### 3.5 The rest of `cua install` on Linux

| # | Step | After M6b |
|---|---|---|
| 1–5 | the record, the module tree, the helper, Node, the pointer | unchanged, but for §3.4's boundary |
| 6 | cua's engine | unchanged |
| 7 | the vendor's tree | the report. Nothing is fetched or unpacked, and `ar` and `xz` are never run |
| 8 | the Codex CLI's leftovers | `state/codex` only (N4) |

- **`--archive` and `--release`** are a usage error on Linux, before anything is installed: "install takes --archive
  and --release on macOS only: on Linux cua installs its own runtime and, since cua 0.30.0, no ChatGPT package". An
  old provisioner is what still passes `--archive`, so the error ends with §3.6's clause for it.
- **The last line** says which sessions open, as today, without the other engine's clause.
- **The exit status.** The command fails when a common part failed, or the engine did while the home asks for it, as
  today. Under a vendor selection it fails as §2.2 says.
- **`cua runtime use <name>`** on Linux knows one name, as today. Any other is `unknown_release`, a vendor
  release's included.

### 3.6 The cloud provisioner (F9)

**What the field runs** (finding 6). The two generations of the deployed script, read against M6b's checkout:

| Deployed script | Its conf | With `CUA_REF` at M6b |
|---|---|---|
| before M6a (9d3fdce6b and earlier) | `CUA_DEB` always set | Exits 1 at its step 8, before any install: `pin="$(… selectPin …)"` fails under `set -e` (its L288–291). The checkout has moved and nothing was installed for it, so sessions are refused until the bootstrap runs |
| M6a's (cb9973e82) | `CUA_DEB=none`, the default | Runs to the end. Its plain `cua install` is M6b's |
| M6a's | `pin`, a mirror or `upload` | Installs and registers, then stops at the deb step with exit 0 and the old script's own checklist line: the failed lookup is lost in a here-string (L94), and no `.vendor.release` is found (L50). `upload` first waits out `CUA_DEB_WAIT`. Step 10 is skipped: no relay move, and the agent is not restarted on the new code |

**The bootstrap: `deploy/cloud-vm/update.sh <ssh target> [--ref <ref>] [--bundle]`** (new), run from the operator's
checkout. It binds three things to one commit: the script that runs, the conf, and the checkout that results. The
script's bytes alone do not bind the checkout: the VM fetches `CUA_REF` from its own origin (`cua-provision.sh`
L353–356), which may be another remote or an uploaded bundle, and two commits can carry the same script.

1. It resolves `<ref>` (HEAD by default) once, to a full commit ID, C. Every later step uses C and never the name.
2. It checks that its own `cua-provision.sh` is byte for byte the one at C.
3. Only with `--bundle`, the recovery for a stale bundle: it makes a bundle whose tip is C from the operator's
   checkout, copies it beside the VM's, checks there that its heads name C, and only then renames it over
   `cua.bundle`.
4. **Before it changes the VM's script or conf,** it checks that the VM's configured source can give exactly C. It
   reads `CUA_REPO` from the VM's conf:
   - for a repository URL, a fetch into a scratch repository on the VM, as the desktop user, must end holding the
     commit C: a fetch of C by its ID, or of the source's refs where it refuses one by ID;
   - for `upload`, `git bundle list-heads /var/cache/cua/cua.bundle` on the VM must name C as a tip.

   If the source cannot, it stops with the VM's script and conf untouched and says what the source lacks: for a
   URL, "push C there"; for a bundle, "run again with `--bundle`".
5. It copies the script to the VM as root, to a new name in `/usr/local/sbin`, checks its SHA-256 there, and
   renames it over `cua-provision.sh`.
6. It sets `CUA_REF` in `/etc/cua-provision.conf` to C, the commit ID. A ref that moves afterwards changes nothing.
7. It runs the script.
8. It reads the checkout's `HEAD` on the VM, and exits nonzero unless it is C, saying what it is.

- **Why this path is trusted.** It is the path the first script took: from the operator's checkout to the VM's
  root, over the operator's SSH. Nothing the desktop user can write is run as root. A script that replaced itself
  from `/opt/cua` would run that user's file as root, so the VM never does that.
- **It is the upgrade's command from here on.** `ssh root@<vm> /usr/local/sbin/cua-provision.sh` stays the repair
  at the same ref.
- **It repairs both stops of the table.** The new script completes on the state either one leaves.

**The new script.**

- It loses `fetch_deb`, its wait and the `--archive` install (L82–144). It runs `cua install`, the registration and
  the profile, as its `CUA_DEB=none` path does today.
- A conf written by an earlier template may still set `CUA_DEB`. The script says in one log line that the value is
  no longer used, and goes on.
- **It provisions refs from 0.30.0 on, and says so.** After the checkout step, and before `cua install`, it exits 1
  on a checkout that holds a Linux deb pin under `runtime/releases/` or has no `runtime/linux-runtime.json`: "this
  template provisions cua 0.30.0 or later; `CUA_REF` `<ref>` is older: use that ref's own `deploy/cloud-vm`". So
  `binutils` and `xz-utils` leave its package list (L174, L181), and its promise of refs older than M6a goes (L15–16,
  L128–130; `deploy/cloud-vm/README.md` L145–148) (N6).
- **A commit ID as `CUA_REF` is checked out exactly.** The checkout step fetches it from origin, by its ID or with
  origin's refs, requires that commit to be present, checks it out, and exits 1 before `cua install` unless `HEAD`
  is that ID. A name is fetched and
  checked out as today, which is how a first boot runs, and the log names the commit it resolved to.
- **It runs only as the checkout's own provisioner** (N6). After the checkout step, and before `cua install`, it
  exits 1 when it is not byte for byte the checkout's `deploy/cloud-vm/cua-provision.sh`, naming `update.sh`. It
  compares the file and never runs it. So the next change of this kind cannot run an old script, and a template is
  rendered from the ref it provisions, or from one with the same script.
- `render.sh` and `create-hetzner.sh` lose `--deb`: given, it is refused with one sentence.

**What the checkout says to an old script.** The two failures an old script meets are worded for it, and both land
in `/var/log/cua-provision.log`:

- `selectPin` for a Linux host is `unsupported_platform`: "cua 0.30.0 has no vendor release for Linux; a cloud VM's
  provisioner that asks for one is replaced with `deploy/cloud-vm/update.sh`";
- `cua install --archive` on Linux is §3.5's usage error, ending with the same clause.

**Tests** (`test/deploy-cloud-vm.test.mjs`, with the stubs it uses today; the two old scripts frozen as fixtures,
each held to its commit's blob hash):

- each row of the table: the old script against the new checkout's real `manifest.mjs` and CLI gives that exit
  status, runs and skips those steps, and leaves the checkout's sentence in the log;
- then the new script on the state each one left completes through step 10;
- the new script with each old conf (`pin`, `upload`, a mirror URL) logs one line, fetches nothing, waits for
  nothing and completes;
- the new script on a checkout older than 0.30.0, and on one whose own provisioner differs from it, exits 1 before
  `cua install`;
- `update.sh`, with `ssh` and `scp` stubbed to act on a scratch directory, and real temporary repositories and a
  real bundle standing for the VM's source:
  - its order, its hash check, and its refusal when its script is not the one at C;
  - **a moving ref:** after it resolved `<ref>` to C, the origin's ref moves to C′, whose provisioner is byte for
    byte the same. The conf holds C, the checkout ends at C, and it exits 0;
  - **a source without C:** it stops at step 4, and the VM's script and conf are byte for byte as before;
  - **a stale uploaded bundle,** its tip an older commit: it stops at step 4 with the script, the conf and the
    bundle as before, naming `--bundle`. Run again with `--bundle`, it replaces the bundle and ends with `HEAD` at
    C. A new bundle whose heads do not name C is never renamed over the old one;
  - **a checkout that ends elsewhere** (stubbed): it exits nonzero at step 8, naming the commit it found;
- `render.sh --deb` is refused.

### 3.7 What a user meets

- **The update itself asks for nothing,** unless the home selects `vendor` (finding 2).
- **A home that has the tree keeps it.** Install and doctor say so in one sentence, with its path and size.
  Deleting it is the person's act.
- **An older cua sharing the home works as it did before M6b:** nothing it reads was touched. That is 1216's reason
  (L2957). Its own `cua install` still fetches the deb.
- **Removal by cua,** on request, is #586.

## 4. The vendor's bytes that stay: provenance records and the comparator fixture

### 4.1 The records: where, and in what shape (1193 (a), F5)

`runtime/provenance/26.928.40906-linux-x64.json` and `…-linux-arm64.json`: a sibling of `runtime/modules/`, outside
`package.json`'s `files`.

    {"schema": 1, "release": "26.928.40906-linux-x64", "platform": "linux", "arch": "x64",
     "archive": {"format": "deb", "url": "https://…/chatgpt_26.928.40906_amd64.deb",
                 "length": 474898954, "sha256": "8094004f…"},
     "lockfile": "usr/lib/chatgpt/resources/cua_node/lib/node_modules/.pnpm/lock.yaml",
     "notes": "Provenance of the archive hash, checked once at authoring (2026-10-06, …)"}

- **Kept:** the release, the archive's URL as where it was published, its length and SHA-256, and `notes`, byte for
  byte: the record of the signature check.
- **`lockfile`** (new; finding 7): the lockfile's path inside the deb's payload, the value `lockfileMember` computes
  today from `components.cua_node` and `layout.moduleDir`. The reader accepts only a relative path of plain
  components (letters, digits, `.`, `_`, `@` and `-`, none of them `.` or `..`) that ends in `/.pnpm/lock.yaml`,
  and hands `tar` `./<lockfile>`.
- **Dropped:** `appVersion`, `components`, `runtime` and `layout`. They said what to unpack and what the tree must
  look like. Without them a record names an archive and one member to read from it, and nothing an installer could
  act on.
- **Moved with `git mv`,** then trimmed in the same commit, so the history follows the file.

### 4.2 Who reads them, and the proof

One reader: `scripts/modules-pin.mjs`, through a strict parser of its own (exactly these keys). The parser returns
the release, the length, the SHA-256 and the lockfile member. It does not return the URL, so no caller can fetch by
it. `pinModules` takes the directory to read, and its `pins` parameter goes (L286): no caller can hand it a pin of
the old shape.

The proof runs end to end, from records loaded through that reader:

- **In the gates.** `test/modules-pin.test.mjs`'s fixture debs, with fixture records written in the new shape to a
  directory of the test's. The lockfile is extracted from the member the record names, and `provenance.json` is
  written as today. A record whose `lockfile` is absolute, climbs or ends elsewhere is refused, and so is a deb
  that lacks the member.
- **On the real debs, once, in T4.** `node scripts/modules-pin.mjs` on both pinned debs, which this VM holds
  (`/var/cache/cua/chatgpt_26.928.40906_amd64.deb`, `~/.local/share/cua-171/task144/arm64-deb/`). Then
  `git diff --exit-code runtime/modules/provenance.json` prints nothing: the bytes are today's. The commands and
  their output go to `m6b/provenance.txt`.

### 4.3 The unreachability test

Three layers, in `test/runtime-linux-provenance-unreachable.test.mjs` and the recorder M6a built
(`test/runtime-linux-no-vendor-read.test.mjs`):

1. **Static.** No file under `src/`, `bin/` or `cua-shim.mjs` contains `runtime/provenance`, `chatgpt_` or
   `/linux/deb/`, and none imports the comparator fixture's modules or names its directory (§4.4). `package.json`'s
   `files` does not list `runtime/provenance/`. Under `scripts/`, only `modules-pin.mjs` names that directory, and
   nothing reads a record's `url`: the directory is never a place to fetch from.
2. **No pin, and no parser for one.** `loadPins()` holds no Linux pin. `selectPin` for linux-x64 and linux-arm64 is
   `unsupported_platform`. `parsePin` of each record, as it is and as it was before the trim, is `invalid_pin`.
3. **Recorded.** With `node:fs` and `node:child_process` wrapped as M6a's recorder wraps them, and a `fetch` that
   records every URL, three entry points run for a Linux host, each under no setting, `cua` and `vendor`:
   - install: `installLinux`, in an empty home and in one holding a recorded release;
   - doctor: `inspectRuntime`;
   - launch: `resolveRuntime`, `replHostFor`, `buildLaunch` and `assertSandboxFits`, for a computer session and a
     browser-only one.
   No recorded path lies under `runtime/provenance/`, and no URL is a record's.
   - Launch records no path under `<home>/runtimes/`. Install's and doctor's are §3's module's alone, told apart as
     §3.4 says.
   - **Its negative control:** `scripts/modules-pin.mjs`'s reader, under the same recorder, is recorded opening
     both records. A recorder that saw nothing would otherwise pass.

### 4.4 The comparator fixture (F7)

A development-only exception. The differential harness and the gate still compare cua's engine with the vendor's
builds, given by path.

- **What it is.** For each architecture, a directory holding `26.928.40906-linux-<arch>.tar` (the release tree as
  taken from an installed home, 2,345 files), `SHA256SUMS` (the tar's hash) and `tree-sha256.txt` (every file's
  hash).
- **Where it lives.** On dc-linux171-1e68, both: `~/.local/share/cua-171/vendor-x64-pinned/` and
  `~/.local/share/cua-171/vendor-arm64-pinned/`. `sha256sum -c` passed on both here: the tars are `2e620986…5914`
  and `fab95971…0d69`. No hosted runner holds one or needs one, since the vendor comparisons never ran there
  (`.github/ci-kit.yml` L98). An arm64 desktop machine, when there is one again, gets its directory by copy.
- **The second copy** (1217, N7) is on the owner's MacBook, at `~/.local/share/cua-171/vendor-fixtures/{x64,arm64}/`.
  The coordinator checked its tars there: x64 `2e620986…5914`, 214,425,600 bytes; arm64 `fab95971…0d69`,
  208,496,640 bytes; each `tree-sha256.txt` 2,345 lines. It is off every repository and reachable only from the
  owner's machines.
- **Never in the repository** (1217). The fixtures go into no branch of this repository and none of its releases,
  drafts included. `vendor-fixture.json` holds hashes only.
- **What the checksums prove, and the one comparison that proves the rest.** They prove that a tar is the one
  preserved. They do not prove that its tree is the vendor's: each tar was made from an installed home, which could
  have been changed after its install. Both authenticated debs are on this VM, and their lengths and SHA-256 equal
  the records' (checked here). So once, in T3, before the manifest is pinned,
  `scripts/linux-engine-gate/vendor-fixture-pin.mjs <deb> <fixture>` (new, a development tool):
  1. matches the deb to its record by length and SHA-256, through `modules-pin.mjs`'s own matcher (its L54–62): over
     the Linux pins when T3 runs, and over the provenance records once T4 has moved them;
  2. unpacks the deb's payload under `usr/lib/chatgpt/resources/cua_node/` to scratch and compares it with the
     fixture's `cua_node/`: the same names, the same types, the same link targets, and the same bytes for every
     regular file. `install.json`, cua's own receipt, is the one entry set aside. Nothing else may be extra or
     missing on either side;
  3. only then writes that architecture's entry of `vendor-fixture.json`, with the deb's SHA-256 beside the tar's.

  The commands and their output go to `m6b/fixture-identity.txt`. A difference stops T3: it is reported, and the
  fixture is rebuilt from the deb. The tool fetches nothing.
- **A cross-check that already exists.** The arm64 fixture lists `sky_linux_arm64` as `a2ee3b61…2193`. That is the
  pinned arm64 build's digest in the counted evidence table `DECLARED_VENDOR_ENDS`
  (`scripts/linux-engine-diff/scene-ended.mjs` L80–81), which was written from M5's runs and not from this fixture.
  x64's `sky_linux_x64` is `7ac3c2ae…f1cd`, R/A L224's. A test holds the manifest's arm64 binary to that table.
- **How the harness takes it.** `scripts/linux-engine-diff/vendor-fixture.mjs` (new) becomes the only way
  `gate.mjs` finds the pinned build and the vendor's client. It takes the directory from `--vendor-fixture`, else
  the path above for the host's architecture. It checks the tar against hashes recorded in the repository
  (`scripts/linux-engine-gate/vendor-fixture.json`: for each architecture the tar's SHA-256, the SHA-256 of
  `tree-sha256.txt` and the file count), extracts it beside the tar on first use, and checks every extracted file
  against the list before each gate run. A mismatch refuses the step: it is never a skip and never a fetch.
  `defaultsFor` loses its cua-home argument (gate.mjs L84), so no step can be pointed at a home.
- **Who restores it.** Whoever runs the gate, from the x64 VM's copy or the MacBook's, checked by the same hashes.
  If both are lost, a person rebuilds the fixture from the pinned deb, whose record says where it was published and
  what it hashes to. No script does that.
- **Out of the product.** Nothing that serve, install or doctor reaches imports either module or names the fixture,
  and §4.3's first layer holds that. The gate-time module never reads `runtime/provenance/`: the manifest's hashes
  are its own. The one-time pin tool asks `modules-pin.mjs`'s matcher one thing, whether the deb it was handed is
  the authenticated one.

## 5. Tests and acceptance 13

### 5.1 Unit tests

They run in the `test-1` and `test-2` gates on hosted macOS with a Linux host injected, as M6a's do.

| Row | Expect | File |
|---|---|---|
| `engine_retired` by the variable, by `engine.json` and by both: one test each | the complete message and hint against a literal; the same with the tree present, absent and damaged; nothing under `runtimes/` recorded | `test/runtime-linux-engine-selection.test.mjs` |
| An override naming an engine below the minimum | the complete message and hint against a literal: the unset, then the one command, and no build | same |
| The override's other refusals; the installed engine's three | each ends as its row of §2.1's table says. None holds `cua engine build`, `cargo`, the vendor engine as a way out, or a second command. Every hint holds no command | same |
| The variable `vendor` beside an `engine.json` that is absent, malformed, over 64 KiB, a link into the recorded release, or a FIFO (§2.1) | the variable's sentence alone, at once. Nothing under `runtimes/` is recorded, and the FIFO is never opened | same |
| The release's constant | `0.30.0`, and no later than the plugin's version | same |
| The service's sentence | the literal of `client.mjs` L71, and its installer the selection's (M6a's drift test) | `test/services-engine-linux/client.test.mjs` |
| A value that is no engine, on Linux and on macOS | Linux names `cua`; macOS is unchanged | `test/runtime-linux-engine-selection.test.mjs` |
| `buildLaunch` for a Linux computer session with no `bin` | a `TypeError`; no environment names `OAI_SKY_LINUX_BIN` or a module of `@oai/sky` | `test/runtime-linux-launch.test.mjs` |
| A browser-only launch with `CUA_NATIVE_ENGINE=vendor` | builds | same |
| The `js` rules for a Linux computer session, whatever `engine` is passed | cua's | `test/mcp-browser-surface.test.mjs` |
| The oracle's Linux table | `vendor` is `engine_retired` in every row | `test/repl-parity/selection-oracle.test.mjs` |
| Doctor, the home selecting `vendor`, by each source | `repl.host` and `engine` fail with that source's sentence and the hint | `test/doctor-engine-linux.test.mjs` |
| **A recorded release** (1216), x64 and arm64 | named by install and by doctor: the path, the fixture's bytes, the record's date. The sentence is §3.3's against a literal: it does not say that nothing reads the tree, and it names both checks. Doctor's row is `skip` and `report.ok` is true. The tree is byte for byte as before | `test/runtime-linux-retired-tree.test.mjs` (new) |
| No record; a record with a wrong hash, length, release or `schema`, an extra key, not JSON, over 64 KiB, a link, a directory | not named by either: no line, no row, `retired` empty | same |
| A directory of another name, a file, a darwin release; `runtimes/` or the release a link; `runtimes/` absent | not named; no link followed; `runtimes/` never listed | same |
| The size (§3.2) | the fixture's known sum: a hard-linked pair once, a link by its own length, directories and a fifo nothing. A walk past its bound, or one that fails, says "could not be measured" and still names the release | same |
| What the module does | under the recorder: `lstat` of `runtimes/` and of the two names; inside a release, `lstat`, `readdir` and one open of `install.json`. No write, rename, unlink or exec anywhere | same |
| The module's two constants | equal the provenance records' and `provenance.json`'s | same |
| The linked managed parts, through the whole of doctor and of install (§3.4) | with the module stubbed, no path under `runtimes/` is recorded, as spelled or physical; with it real, only its own. The refusal and the row name the link | `test/runtime-linux-no-vendor-read.test.mjs` |
| **A full install with `staging` linked into a recorded release** (§3.4): every part missing; each acquiring lane's part alone missing (the module tree, the helper, Node, the engine); a local build's placing | the lane refuses, naming the link, before it creates anything. No path under `runtimes/` is recorded. The release's listing, hashes and mtimes are as before. With the guard off through its seam, the `mkdtemp` is recorded inside the release | same |
| The helper's installed file a link into the tree, through the whole of install | refused before it is read; nothing under `runtimes/` recorded | same |
| `cua install` in an empty home | no `runtimes/` made; the `fetch` log is this arch's pinned assets and no other URL; no `ar` or `xz` looked up; `retired` empty | `test/cli-linux-install.test.mjs` |
| `cua install` over a recorded release, twice | the line and `retired` both times; every part `changed: false`; the tree unchanged | same |
| `--archive`, `--release` on Linux | usage error, exit 2, nothing installed | same |
| `cua install` under each vendor source (F10) | every part placed; exit nonzero with `engine_retired`; the message is §2.2's against a literal: what to unset, that the install otherwise completed, and no word about the next open. In this clean home, with the setting gone, a session opens with no further install | same |
| `cua runtime use` with a vendor release's name | `unknown_release`; its hint names no engine | same |
| macOS: `cua install`, `cua doctor`, the selection | unchanged; the report is never called | `test/runtime-install.test.mjs`, `test/cli.test.mjs`, `test/runtime-doctor.test.mjs` |
| §4.3's three layers | pass | `test/runtime-linux-provenance-unreachable.test.mjs` (new) |
| `modules-pin.mjs` through its reader (§4.2) | fixture debs and new-shape records give today's output; a bad `lockfile` and a missing member are refused; `pinModules` takes no `pins` | `test/modules-pin.test.mjs` |
| The provisioner and its bootstrap (§3.6) | every test of §3.6's list | `test/deploy-cloud-vm.test.mjs` |
| R1's verdict (§1.3) | red: a failed cua lane with a clean cleanup; 33 cases; a text case that is not positive; another engine under the worker; a clean lane with a failed cleanup. Green only with all five right | `test/linux-engine-diff/gate-runner.test.mjs` |
| `checkEnginePair` (§1.3) | M6a's stored vendor and cua lanes pass with their 3 declarations. A new cua and cua pair passes. A cua pair of two runtimes, commits or case sets fails. A vendor pair with no vendor release fails as today | `test/repl-parity/native-linux-expected.test.mjs` |
| The comparator fixture (§4.4) | a good fixture gives the two paths. One changed byte in the tar, in an extracted file or in the list refuses. No network call. The manifest's arm64 binary is `DECLARED_VENDOR_ENDS`' pinned digest. The pin tool, on a fixture deb: an equal payload writes the entry; one changed byte, an added file, a changed link target or a changed type writes nothing; `install.json` alone is set aside | `test/linux-engine-diff/vendor-fixture.test.mjs` (new) |
| The harness rows of §1.3 | each by its own test | §1.4 |

### 5.2 Acceptance 13, live

One driver, M6a's, with its cells replaced: `scripts/accept/linux-runtime.mjs`, inside
`scripts/accept/linux-runtime-env.sh`'s environment (a private X server, a private session bus, accessibility on,
the run's own homes, the sandbox scoped), with M6a's watch, trace and confinement step.

**Two witnesses are new.**

- **The fetch log.** The install runs as `node --import <preload> bin/cua.mjs install`. The preload wraps
  `globalThis.fetch` and writes every URL asked for, the URL that answered and the bytes. cua's code is not changed
  by it. Its control is the older cua's install under the same preload, whose log must hold the deb's URL.
- **The traced install and doctor.** M6a's `strace -f` wrapper: every program executed, and every call that names a
  path under `runtimes/`, with its kind.

**The older cua** is main 854103aa5, the cua before M6b. Its install places its own runtime and the vendor's
release, as every home updated from main holds them (F11).

| Cell | Home | Step | Passing means |
|---|---|---|---|
| E0 | empty | `cua install` at the head, under the fetch log and the trace | Exit 0. The module tree, helper, Node and engine placed; the pointer the derived name. The URLs the log shows asked for are exactly this architecture's pinned assets (23 tarballs, the helper, Node, the engine); none asked for, and none that answered, is OpenAI's. No `ar` and no `xz` was executed. The home has no `runtimes/`, `retired` is empty and no line names a vendor release. Doctor is ok, with no row named `runtime.retired`, `runtime.vendor`, `runtime.files`, `runtime.vendor-manifest`, `runtime.ipc` or `runtime.signatures`; its `engine` row shows the pinned version and hash behind service `cua`. `file` says the engine is statically linked (item 9) |
| E1 | E | the item 1 smoke and the item 6 witness, plain and traced | As M6a's E1: every step passes; no `sky_linux` at any sample; the engine child is the home's `cua-engine` under the trusted worker; no traced call names a path under `runtimes/` |
| E2 | E | the browser-only session, plain and traced; the profile map's loader | As M6a's E2 |
| E3 | E | a computer session under each source: the variable, `engine.json`, both, and an override naming a 0.4.4 engine; doctor under each; a browser-only session with the variable; `cua install` under the variable, then a session with it unset | Each open is refused with §2.1's sentence for its source, equal to a literal built from this head's installer, and with the hint. **Under the three vendor sources the trace shows no `execve` of an engine, a worker, a helper or a host.** Under the override it shows exactly one more, per open and per doctor run: the override's path with the single argument `--version`, which is how the selection learns it is outdated (launch.mjs L572, L632–634). No engine `server`, worker, helper or host is started on any row. Doctor's `engine` and `repl.host` rows fail with the sentence. The browser-only session passes. The install exits nonzero with §2.2's sentence, every part placed. In this home, with the variable unset, the session opens with no further install |
| U0 | upgraded: installed by the older cua, whose doctor passes its `runtime.vendor` | at the head, before any install: the item 1 smoke, traced; then the vendor selection | The default session passes with the tree present and whole, and no traced call names a path under `runtimes/`. The vendor selection is refused as in E3, though its tree is there |
| U1 | U | `cua doctor --json`, plain and traced | Exit 0. The rows are E0's and `runtime.retired`, `skip`: its path the release's, its `bytes` the driver's own count (taken with `find`, not with cua's code), its date the record's. The traced calls under `runtimes/` are `lstat`, directory reads and one open of `install.json`, none outside the two release names. Nothing there is executed or written |
| U2 | U, with a directory and a file of the run's added to `runtimes/` | `cua install` at the head, under the fetch log and the trace | Exit 0. `retired` is the one release with U1's bytes, and the line is §3.3's. The two added entries are named nowhere. Nothing under `runtimes/` changed: the listing, every file's hash and every mtime are as before, and the trace shows no unlink, rename or write there. Nothing was fetched: every part is `changed: false` |
| U3 | U | doctor; E1 and E2, plain; `cua install` again | Doctor as U1's. The sessions pass. The second install reports the same and changes nothing |
| U4 | a new home holding a copy of U's release whose record has one digit of its hash changed | `cua install`; `cua doctor` | Neither names it: `retired` is empty and there is no `runtime.retired` row. The copy's listing and every file's hash are as before |
| U5 | a new home holding a copy with no `install.json` | `cua install`; `cua doctor` | the same |

**Measured and reported, not judged:**

- E0's time and bytes fetched, beside the older cua's install on the same leg, which fetches the deb;
- doctor's time in U1 beside E0's: the walk's cost;
- serve start to a first cell's answer, 20 samples at the head against 20 under the older cua. M6b removes a branch
  from the selection; a difference above about 50 ms is a finding.

**Venues.**

- **x64: this machine's private displays,** under the host lock, at the frozen head. The counted x64 evidence is this
  run.
- **arm64: GitHub's hosted `ubuntu-24.04-arm` runner,** through `.github/workflows/linux-runtime.yml`'s acceptance
  suite, with its x64 leg as the control. Dispatched on the head, with `older` 854103aa5.
- No VM, and no `:0` sitting.

**The regression on x64, at the same head.** `launch.mjs` is what every facade suite launches through:

- R1, repl-parity's native suite on the cua lane, by its own verdict (§1.3): the run's exit status, 34 of 34 cases,
  both text cases positive, the engine the home's `cua-engine` under the worker, and a clean cleanup;
- R3, `linux-native.mjs`, in the default selection and with `CUA_NATIVE_ENGINE=cua`;
- R4, `linux-device-mode.mjs`, in the default selection;
- the `fallback` part: its five homes, each refused with §2.1's sentence for the installed engine;
- FB (`scripts/linux-engine-diff/services.mjs`): the over-budget scene read through cua's facade on the vendor's
  service and on cua's, the truncation line judged in each lane (§5.3).

**The differential harness on the fixture alone** (F7). Two gate steps run on x64 through `gate.mjs`, whose defaults
now come from the fixture: the events step (the gate's own `E1`: `--vendor` and `--newest`, 8 minutes) and FB
(`--vendor-js`, 5 minutes).

- The fixture is verified first, as §4.4 says.
- No home with a vendor tree is in the steps' reach. They run with `HOME` and `CUA_HOME` set to a scratch home that
  holds no `runtimes/`, the fixture and the newest build named by path (`--vendor-fixture`, `--newest`), and a file
  trace of each step shows no path under any `runtimes/`. This machine's default home still holds its tree (1216),
  so the trace is what shows it unread.
- **The events step is bound to two vendor binaries.** `--vendor` is `sky_linux_<arch>` inside the extracted
  fixture, and its SHA-256 is the list's (`7ac3c2ae…f1cd` on x64). `--newest` is the newest build, named by its own
  path outside the fixture, with its SHA-256 recorded. Every vendor lane's process in the step's record ran one of
  those two files. The step ran complete.
- **FB is bound to the fixture's JavaScript, and to no vendor binary.** It gives both services the same cua engine
  on purpose (`scripts/linux-engine-diff/services.mjs` L65, L68). So: `--vendor-js` is the `@oai/sky` directory
  inside the extracted fixture, and the `service.js` it loads has the list's hash; `--engine` is the pinned
  `cua-engine`, by `runtime/engine/linux-engine.json`'s hash, on both sides; every step is equal across the two
  lanes; and the truncation line is judged in each lane on the over-budget scene. That verdict is item 4's (§5.3).
- The events step's speed verdict is reported and not judged here: M6b changes no engine byte, so a bar it misses
  is an engine finding with its own ticket.

**Gates,** on the frozen head:

- `ci-gate` by its own selection: GREEN, with `test-1`, `test-2` and `sandbox-live` among the gates that ran. L218
  says `test`, which #578 split in two (C8).
- `ci-gate --gates engine-linux`: PASS. Its paths (`.github/ci-kit.yml` L152–154) are none M6b changes, so the
  default run skips it, and a SKIP never counts as item 10.
- **If that named run skips the gate too** (1217, N8), #585's pass is cited, and `credit.txt` records that
  `git diff 854103aa5..H -- native/linux-engine runtime/releases/node/24.22.0-linux-x64.json .github/ci-kit.yml`
  prints nothing: those are the gate's three paths, its own file among them. If anything there changed, the gate
  runs by its own selection, and that run is what counts.

**0.30.0 before the freeze.** T1 lands the constant, the literals, the bump of `.claude-plugin/plugin.json` and
`marketplace.json`, and their tests on `feat/171-m6b`, so the frozen head holds the release's real name. If main
takes 0.30.0 first, M6b takes the next minor: the constant, the literals and the README change, the head is frozen
again, and the checks that read the name run again (both `ci-gate` runs, E3, U0's refusal, U1's and U2's
sentence). Nothing of §5.3 reruns for it.

**Evidence:** `docs/evidence/2026-10-28-own-linux-engine/m6b/{x64,arm64,x64-hosted}/`, each cell's report, the head,
the hosted run's id, both `ci-gate` runs with the gates each ran, `m6b/credit.txt` and `m6b/provenance.txt`.

### 5.3 Items 1 to 10: what reruns, what is cited

M6b changes the selection, the launch's vendor branch, install, doctor and the harness. It changes no byte of the
engine, of cua's Linux service, of the facade or of the REPL host. So items 1 and 9 and the suites of item 10 rerun,
and items 2 to 8 are cited, cell by cell, from M5's per-item table
(`docs/evidence/2026-10-28-own-linux-engine/m5/README.md` L213–225) and bridged to the frozen head H below.

**What M5 counted,** each cell on the release that table gives it. H, H‴, H⁗, H⁵, H6 and H8 are M5's heads, and "the
events step" is the gate's `E1`:

| Item | x64 | arm64 | In M6b |
|---|---|---|---|
| 2, the same answers | V1–V4 on 0.4.1 at H⁗; V5 on 0.4.3 at H8, 52 of 52; the events step on 0.4.1 | V1–V4 on 0.4.1 at H⁵; V5 on 0.4.3 at H8; the events step on 0.4.0 at H‴ | cited |
| 3, at or below the bar | the seven operations on 0.4.1 (V2, V3); Chrome's canvas and thumb, D1 on 0.4.3 at H8; Electron's thumb, D2 on 0.4.2 at H6; Firefox's canvas, D3 on 0.4.0 at H; desktop moves, the events step on 0.4.1 | the same steps: 0.4.1 at H⁵, D1 at H8, D2 at H6, D3 and the events step on 0.4.0 at H‴ | cited |
| 4, same elements | V2 on 0.4.1; the truncation line through the facade, FB on 0.4.0 at H | V2 on 0.4.1; FB on 0.4.0 at H‴ | V2 cited. **FB reruns on x64:** it has no bridge (below). arm64's FB is task 165's run (below) |
| 5, background left alone | V1–V5 and Z0 on 0.4.1; V5 on 0.4.2 at H6 and on 0.4.3 at H8 | V1–V4, Z0 and V5 on 0.4.1; V5 on 0.4.2 and on 0.4.3 | cited |
| 6, text arrives once | V1 and V4 on 0.4.1 | V1 and V4 on 0.4.1 | cited through M6a's F10 credit, which covers this item and no other; its witness reruns on both arches (cells E1, U3), and R4's case on x64 |
| 7, identity and minimized | V3 on 0.4.1; V5 on 0.4.3; R1's case on 0.4.0 | the same | cited; R1's minimized case reruns on x64 |
| 8, device mode | V4 on 0.4.1; V5 on 0.4.3; P1–P6 and R4 on 0.4.0 | the same | cited; R4 reruns on x64 |

- **The artifacts** are the ones M5's cells link: `m5/x64/README.md`, `m5/arm64/README.md`, and under
  `m5/<arch>/h6/out/` and `m5/<arch>/h8/out/` each step's `run/summary.md`. T8's `credit.txt` resolves every link
  to a path that exists at H.
- **The reach inside M5.** Steps that stand on 0.4.0 to 0.4.2 do so under rulings 827, 828, 929 and 990: 0.4.1 to
  0.4.3 changed only how a drop is confirmed and ended (m5/README.md L243–246). Main's 34 commits during the
  acceptance stand under ruling 1089 (L248). The acceptance itself is ruling 1090's.

**The bridges from there to H.** Every later change to the engine, the service, the facade or the host:

| Since M5 | What it changed | What it can reach | The bridge | In M6b |
|---|---|---|---|---|
| #493, #494, #503 (435420cce, c02bbaea9, a14d5c1d7) | the browser's ids and first-use document, the macOS agent-cursor document and the loader both platforms share (`documentation.mjs`, `create-tinysky-alt.mjs`), two lines of `core.md`, the host's identity string | the documents a Linux session is given, and the facade's constructor | They are in M6a's head: its R1 on both lanes with a diff of 0, R3 and R4 at f41546d08 ran with them (`m6a/README.md` L80–99) | cited; R1's cua lane, R3 and R4 rerun in any case |
| #526 (#562, cf02ca3c5) | the macOS renderer and two macOS documents | nothing a Linux session loads, by its file list: Linux reads `core.md`, then `linux-engine.md` (L2868–2869) | its file list | cited |
| 0.4.4 (#516, da927265e) | the Electron drop's settle rest, the handle end's settle and tail (`pointer.rs`, `handle.rs`, `drop_settle.rs`, `drop_cursor.rs`) | items 2 and 3, on a drag | Its reach at H9 = cd03a47b (rulings 1102, 1115; L2767–2801): H1, H2 and L4a pass on both arches and L4d on x64; arm64's L4d failed as #512 (1140, 1146). Evidence `engine-044/reach/`. Text-neutral by `m6a/f10-credit.txt` | cited |
| #558 (#563, 0e7f3de4a; rulings 1178, 1186) | the Linux facade's tree text: VT, FF, U+001C to U+001E, NEL, LS and PS inside an element's text print as four-hex-digit escapes. An intended departure from the vendor's renderer, declared (L2822–2874) | item 4 where it is read through the facade; item 10's vendor diff | `test/cua-api/facade-scenarios.mjs` declares it `differs` and pins that LF, CR, tab and a backslash print as the vendor's; `test/cua-api/core-documentation.test.mjs`; `test/services-engine-render.test.mjs`. Item 4's V2 is not reached: the harness prints trees with the vendor's own `to_string()` (L2863–2864). Task 157's live check on x64 was a development run, kept on the VM and not in the repository. **No counted run has it** | **FB reruns at H**, and R1's cua lane reads its trees through this renderer. The stored vendor lanes predate it, so no vendor diff on it is claimed |
| M6a (#568, cb9973e82) | the runtime, launch, install, doctor | items 1, 9 and 10; item 6's path to the engine | acceptance 12 at f41546d08 (`m6a/README.md`); F10's credit for item 6 | these rerun in M6b |
| #565 (#571, f6a6002ef; ruling 1190) | one JSONL framing for the host, the kernel, the worker and the Linux service's two pipes; the differential harness's reader (`scripts/linux-engine-diff/engine.mjs`) | every item where it runs through the facade; the harness's own reading | `test/repl-host/{jsonl,line-separators}.test.mjs`, `test/mcp-{server,upstream}.test.mjs` and `test/linux-engine-diff/engine-stats.test.mjs` in the gates. H10's reach ran the harness with it. **No counted facade run has it:** M6a's head predates it (finding 10) | **the lanes through the host rerun at H:** R1's cua lane, R3 and R4 on x64, cells E1 and U3 on both arches. They are its first counted runs |
| 0.4.5, #512 (#585, 854103aa5) | a Chrome drop whose path overran takes the after-path tail, and a dropped visit answers unconfirmed (`pointer.rs`, `release_sync.rs`, `handle.rs`, `engine.rs`) | items 2 and 3, on a Chrome drop | Its reach at H10 = 2c66966bd on both arches (rulings 1193, 1194, 1200, 1201; L2919–2936): H1, H2, L4a, and L4d at 993's bar. Evidence `engine-045/reach/{x64,arm64}/` and `engine-045/x300-arm64/` | cited |
| 0.4.5, #572 | `wire.rs`: every line the engine writes carries U+2028 and U+2029 as escapes, the same JSON value | every answer of items 2 to 8 | The engine's own tests, required in `engine-linux`: wire's round trip, a request's stats line, and `tests/live.rs`'s window titled with U+2028, read through Node 24's readline (red at 3 lines, green at 1). H10's reach parsed every line of both arches' runs | cited; `engine-linux` runs at H (§5.2) |
| M6b | the selection, install, doctor, the harness | items 1, 9 and 10 | – | rerun (§5.2) |

**arm64's FB** (1217, N9) is task 165: the gate's FB on the arm VM at main 854103aa5, before that VM's lease ends,
with its evidence on branch `m6b-fb-arm64`. It is cited as arm64's witness for item 4's facade half, and its result
is filled in at close-out. The credit check's third line ties main's facade and host to H.

**A failure in #558's or #565's first counted runs is a defect on main** (1217): FB, R1's cua lane, R3, R4 or a
cell that fails on their code. It gets its own ticket and its own pull request from main, and M6b's evidence waits
for that fix. The one exception is a one-line fix, named to the design session first.

**Item 10** in full. Rerun at H on x64: R1's cua lane by its own verdict, R3 and R4; `test-1`, `test-2` and
`engine-linux` by `ci-gate`. Cited, for the diff against the vendor lane: R1 counted on 0.4.0 at H and H‴
(m5/README.md L224); T10's flip checks on 0.4.3 at 51f6b281, both arches (`m5/t10/README.md` L97); M6a's on 0.4.4 at
f41546d08, x64, a diff of 0 with the 3 declared defects. Cited, for `compare --engines`: R2 counted on 0.4.0, and
T10's on 0.4.3 (L98). R2 judges the engine's in-cell time, which 0.4.4's and 0.4.5's rows bridge by their reaches,
not by R2. No vendor diff on the code at H is claimed (L206 cites the vendor lanes).

**The credit check,** recorded with its output in `m6b/credit.txt` at H:

- `git diff --stat linux-engine-v0.4.5 H -- native/linux-engine` prints nothing;
- the two hashes of `runtime/engine/linux-engine.json` are the release's assets' (`gh release view
  linux-engine-v0.4.5`);
- `git diff 854103aa5 H -- src/services/engine/linux src/services/engine/policy.mjs src/services/sky.mjs src/cua-api
  src/repl-host docs/cua-api` prints nothing;
- `git diff --stat da7585c31 854103aa5` over the same paths and `native/linux-engine` is recorded, and every file in
  it is assigned to a row of the bridge table. A file with no row fails the check.

A check that prints what it should not is read. A change that is not plainly neutral fails the credit for the items
it reaches, and their steps then run on x64 from the fixture (§4.4).

**What could cut it,** most likely first:

1. A harness or test path that still reaches a Linux pin or the vendor tree (§1.3, §1.4). The recorder and R1 find it.
2. FB or R1's cua lane failing on #558's or #565's code, which no counted facade run has exercised. That is a defect
   on main, and M6b's evidence waits for its fix (above).
3. The fetch log seeing less than the install fetched. Its control, the older cua's log, shows the deb or the witness
   does not count.
4. The hosted leg's time: the older cua's install fetches about 450 MB on arm64, as it did in M6a.
5. A sentence a harness judge still expects in its old words (the `fallback` part, the driver's refusal judge).

## 6. The tasks

An export is deleted by the task that removes its last reader, never before. So the selection goes first, the
harnesses' readers next, and the pins and their parser last.

| T | Scope | Touches | Consumes | Produces, and its proof |
|---|---|---|---|---|
| T1 | **Nothing offers the vendor's engine, and 0.30.0 has its name** (§2; §3.5's flags, last line and exit status). The selection and its source-aware sentences; the bounded look at `engine.json` for a second selector; the override's refusals; the engine hint; launch's vendor branch; doctor's `engine` and `repl.host` rows; the `js` rules; install's vendor lane and its "other engine"; the usage text; the oracle; the constant and the plugin's version. The Linux test fixtures move to cua's own parts | `src/runtime/{launch,installer,doctor,doctor-linux-runtime,doctor-engine,linux-install}.mjs`, `src/runtime/install.mjs` (`useOwnLinuxRuntime`), `src/cli.mjs`, `src/mcp/{surface,connection}.mjs`, `.claude-plugin/{plugin,marketplace}.json`, `scripts/repl-parity/selection.mjs`, `test/fixtures/{installed-home,linux-native-runtime}.mjs`, `test/runtime-linux-{launch,engine-selection,doctor}.test.mjs`, `test/doctor-engine-linux.test.mjs`, `test/cli-linux-install.test.mjs`, `test/serve-lazy.test.mjs`, `test/mcp-browser-surface.test.mjs`, `test/repl-host/linux-native*.test.mjs`, `test/linux-{secrets,sandbox-refusal}.test.mjs`, `test/repl-parity/selection-oracle.test.mjs` | – | `engine_retired`. One test per source (the variable, `engine.json`, both) and one for an outdated override, each pinning the whole message and the hint. The second selector's read with a link into the tree and with a FIFO. 1212's literals for the installed engine. Install's exit under each source, its sentence with no word on the next open. Every darwin row unchanged. `vendorLinuxRuntime`, `vendorPinsOf` and the pins stay: scripts still read them |
| T2 | **The report, and the boundary** (§3.1–3.5): `retired-tree.mjs`, install's line and JSON, doctor's `runtime.retired`; the guard on install's and doctor's reads, on the helper's file and on every acquiring lane's `staging`, with the replay and the full installs under a linked `staging`; the deb's code out of `install.mjs`; Linux's leftovers scan | `src/runtime/{retired-tree,linux-install,install,node-install,managed-node,module-tree,linux-engine,vendor-tree,doctor,doctor-linux-runtime,codex-leftovers}.mjs`, `test/runtime-linux-retired-tree.test.mjs`, `test/runtime-linux-no-vendor-read.test.mjs`, `test/cli-linux-install.test.mjs`, `test/runtime-linux-doctor.test.mjs`, `test/runtime-codex-leftovers.test.mjs`, `test/runtime-linux-install.test.mjs` (deleted) | T1 | §5.1's rows for the report, the size, the replay and the full installs under a linked `staging`, each lane's guard shown by its own case and by the negative control. The recorder shows that nothing under `runtimes/` is created, written, renamed or removed. macOS's install unchanged |
| T3 | **The harnesses** (§1.3, §4.4): the Linux vendor lanes out, the judges kept; R1's own verdict; `checkEnginePair`'s two kinds; `engine-answered`; the parity cache and provenance; the four install sites; native-baseline's helper listing; `probe/lib.mjs`; R2 out of the gate; the comparator fixture's module; each fixture's one comparison with its authenticated deb, and only then its manifest (§4.4); the `fallback` part's sentences; acceptance 12's vendor cells out of the driver; #570. Then, with no reader left, `vendorLinuxRuntime`, `vendorPinsOf`, `RESTORE_PINS` and `installHint`'s Linux half | `scripts/repl-parity.mjs`, `scripts/repl-parity/*`, `scripts/native-baseline.mjs`, `scripts/native-baseline/*`, `scripts/browser-parity/capability-home.mjs`, `scripts/linux-engine-gate/{gate,steps}.mjs`, `suites.sh`, `vendor-fixture.json`, `vendor-fixture-pin.mjs`, `scripts/linux-engine-diff/vendor-fixture.mjs`, `scripts/modules-pin.mjs` (its matcher exported), `scripts/accept/{linux-fallback,linux-selection,linux-runtime,linux-runtime-cells,linux-runtime-watch,linux-text}.mjs`, `scripts/probe/lib.mjs`, `scripts/sandbox-probe/linux-probes.mjs` (deleted), `src/runtime/manifest.mjs`, `test/runtime-manifest.test.mjs`, their tests (§1.4) | T1 | Each by its test, negative controls included: a failed cua lane with a clean cleanup is red; a fixture with one changed byte refuses the step; one pair of each kind. Both fixtures equal their debs' payloads (`m6b/fixture-identity.txt`), or the task stops. R1's cua lane and the `fallback` part run once on x64 as development runs. Reviewed for false greens first, as every harness change since M4 |
| T4 | **The provenance move, and the parser's end** (§4.1–4.3): the two records moved and trimmed, with `lockfile`; the script's reader; `parsePin`'s Linux branch and `LINUX_LAYOUT_KEYS`; the dead branches of `checks.mjs` and `doctor.mjs`; the fixtures' Linux pin helpers; §4.3's three layers | `runtime/provenance/` (new), `scripts/modules-pin.mjs`, `src/runtime/{manifest,checks,doctor}.mjs`, `test/fixtures/runtime-fixture.mjs`, `test/runtime-manifest.test.mjs`, `test/modules-pin.test.mjs`, `test/runtime-linux-provenance-unreachable.test.mjs` | T2, T3 | Both real debs give today's `provenance.json` bytes through the new reader (`m6b/provenance.txt`). `loadPins()` holds no Linux pin, and no parser reads one. §4.3 passes, its negative control included |
| T5 | **The cloud provisioner** (§3.6): `update.sh`, binding the script, the conf and the checkout to one commit, with its bundle recovery; the script without the deb, with its commit-ID checkout and its own-provisioner check; the checkout's two sentences for an old script; the frozen old scripts and their tests | `deploy/cloud-vm/{update.sh,cua-provision.sh,render.sh,create-hetzner.sh}`, `src/runtime/manifest.mjs` (`selectPin`'s Linux sentence), `src/cli.mjs` (the usage error's clause), `test/deploy-cloud-vm.test.mjs`, `test/fixtures/cloud-vm/` | T4 | §3.6's tests. Run on no VM: the template's VMs are the owner's (§9) |
| T6 | **Acceptance 13's driver** (§5.2): the new cells and their judges, the fetch log's preload, the traced install and doctor, the older cua, the workflow | `scripts/accept/{linux-runtime,linux-runtime-cells}.mjs`, `scripts/accept/fetch-log.mjs` (new), `.github/workflows/linux-runtime.yml`, `test/accept-linux-{runtime,runtime-cells}.test.mjs` | T2, T3 | Each judge's negative control by test: a log with the deb's URL, a trace with `ar`, a trace with an unlink under `runtimes/`, a report whose bytes are off by one, a tree with one file changed, a sentence one word off. A pilot of every cell on both venues, at the tip that holds T4. Reviewed for false greens first |
| T7 | **Docs** (§1.5): the README, `deploy/cloud-vm/README.md`, the skill, `CLAUDE.md`, `package.json`'s description, the plugin's description | those files | T1; final after T5 | Each sentence checked against the code at the head |
| T8 | **Acceptance 13, counted** (§5.2, §5.3), at the frozen head on both venues, with the x64 regression, the fixture's steps, the credit check and both `ci-gate` runs | evidence `m6b/` | the frozen head: T1–T7 | Every cell passes by the driver's own judge. `m6b/README.md` with the cell table, the head, the hosted run's id, §5.3's tables with each citation resolved to a path, `credit.txt` and `provenance.txt` |
| T9 | **Close-out.** The spec folded: Progress, a Decision Log entry for ruling 1217 and §7.2's choices, Outcomes, "Retirement (M6b)" as built, and acceptance 13's wording (C5). arm64's FB result filled in from `m6b-fb-arm64` (§5.3). The tracker's #570 line, and a line for the first `engine.json` read (§2.1). The whole-branch review by `doperpowers:reviewer-high` (L217). The pull request, its body listing every macOS-visible change, the homes that selected `vendor`, what install and doctor now report, and the cloud template's upgrade command | the spec, the report, `tech-debt-tracker.md` | T8 | The review clean. Both `ci-gate` runs still stand for the merged head, or run again. `MERGEABLE` |

**Order.** Each task is reviewed clean before what consumes it runs.

| Wave | Tasks | Notes |
|---|---|---|
| 0 | T1; T7's draft | T1 puts 0.30.0 on the branch |
| 1 | T2 and T3, each in its own worktree | They share no file. T2 merges first |
| 2 | T4 and T6, each in its own worktree; T5 after T4; then T6's pilots on both venues | The pilots run at the tip that holds T4 |
| 3 | the pilots' fixes, reviewed; T7 final; the head frozen as H and pushed | H holds the release's name (§5.2) |
| 4 | T8 at H: x64 here, arm64 by dispatch, both `ci-gate` runs | A fix after the freeze follows the M5 pre-flight's §8.1 |
| 5 | T9 | |

**Timeline,** from the approval of this pre-flight, on M6a's costs for tasks of these sizes:

| Task | Hours |
|---|---|
| T1 | 14–18 |
| T2 | 8–11 |
| T3 | 13–17 |
| T4 | 5–7 |
| T5 | 7–9 |
| T6 | 8–12, with the pilots |
| T7 | 4–6 |
| T8 | about 2.5 of machine time on x64 (the cells about 30 minutes; R1, R3, R4, FB and the events step planned at 40, 5, 3, 5 and 8); about 45 minutes for the dispatched run |
| T9 | 6–10 |

About three days to the pull request with no cut, as the draft had it. The removal's leaving takes about five hours
and the plan's riskiest review out of T2. The bootstrap, the fixture, the sentences' sources and the credit's
reruns put about as many hours back. Revision 2's fixes add about five more, in T2, T3 and T5, and the estimate
holds. Plan for one fix round from the pilots: three and a half. Not counted: usage stops, the hosted macOS queue
for `ci-gate`, and a wait for a fix on main if #558's or #565's first counted runs fail (§5.3).

## 7. Rulings folded

### 7.1 The forks

| F | The ruling | Folded in |
|---|---|---|
| F1 | a minor bump, 0.30.0 (1215) | §2.1, §5.2, T1 |
| F2 | one install command; `cua engine build` in the README's engine section only (1215, 1216) | §2.1 |
| F3, F4 | fell away with the removal (1216). The removal is #586 | – |
| F5 | `runtime/provenance/`, trimmed, with a validated lockfile member, proved end to end (1216) | §4.1, §4.2 |
| F6 | the lanes that run a vendor engine go; the judges of stored runs stay | §1.3 |
| F7 | a development-only exception: a hash-checked fixture, and one differential run on it alone | §4.4, §5.2 |
| F8 | `linux-probes.mjs` removed with its test (#570) | §1.3 |
| F9 | `--deb` and `CUA_DEB` removed; a conf that still sets it tolerated | §3.6 |
| F10 | every step, then nonzero `engine_retired` | §2.2 |
| F11 | the hosted leg's upgraded home made by the older cua's real install | §5.2 |

### 7.2 Revision 1's choices, as ruling 1217 settled them

| N | The choice | As ruled (1217) | Folded in |
|---|---|---|---|
| N1 | The sentence names `CUA_NATIVE_ENGINE=cua` (L164) and tells the reader to unset the variable (1216) | Both: the name describes the default, the unset is the instruction | §2.1 |
| N2 | Doctor's informational row | `runtime.retired`, an informational `skip`, present only for a recorded release. Acceptance 13's wording changes at close-out | §2.3, T9 (C5) |
| N3 | A `runtimes/` or a release that is a link | Not followed, and nothing named | §3.1 |
| N4 | `runtime.leftovers` and `--prune-leftovers` on Linux | `state/codex` only. Nothing of cua's reads or deletes inside the tree | §2.3, §3.5 |
| N5 | The service's own outdated sentence (`client.mjs` L71) | Unchanged: it knows a path and not a source | §2.1 |
| N6 | The provisioner | `update.sh` as the bootstrap; a template that provisions 0.30.0 or later; a script that runs only as the checkout's own provisioner | §3.6 |
| N7 | The fixtures' second copy | On the owner's MacBook. The fixtures go into no branch, release or draft of the repository | §4.4 |
| N8 | `engine-linux` for item 10 | `ci-gate --gates engine-linux` at H. If it skips, #585's pass is cited with the empty diff of the gate's paths recorded; if those paths changed, the gate runs | §5.2 |
| N9 | arm64's FB | Task 165, on the arm VM at main 854103aa5, evidence on `m6b-fb-arm64`; its result filled in at close-out | §5.3, T9 |
| – | #558's and #565's first counted runs | A failure is a defect on main, with its own ticket and pull request; M6b's evidence waits, unless the fix is one line named to the design session first | §5.3 |

Nothing is left for the design session to rule.

## 8. Conflicts and ambiguities

| # | Issue | Where | Resolution |
|---|---|---|---|
| C1 | "The `sky_linux` patterns … are removed or moved to cua's engine", and acceptance item 1 needs something that detects one | L164 against L192 | Nothing expects a `sky_linux`; the watches that prove none ran keep the name (finding 9) |
| C2 | "Items 1–10 still hold", and items 2 to 8 are comparisons with the vendor | L206 | §5.3: cited cell by cell and bridged, with FB and the facade lanes rerun |
| C3 | "The facade suites' vendor lanes cited from M5's sitting"; later vendor lanes exist | L206; finding 10 | Each is cited by the release and head it ran on: M5's counted lanes, T10's flip checks, M6a's R1 |
| C4 | The spec's Touches for M6b omit `linux-install.mjs`, the doctor modules, `surface.mjs`, `codex-leftovers.mjs`, the provisioner, the workflow, the gate and the acceptance driver | L348 | Each task's list here supersedes it, as M6a's C8 did |
| C5 | "`cua doctor` lists no vendor runtime rows", and 1216 adds a row that names the vendor's tree | L206 against L2959–2960 | The later ruling stands: the row checks no runtime. T9 rewords the acceptance (N2) |
| C6 | 1216's report rests on "its install record", and 1193 (a) keeps the deb records from install | L2959 against L2899 | The module's own two constants (§3.1), tied to the records by test |
| C7 | 1212 names `engine_retired` and `engine_outdated`; one line writes `engine_not_installed` and `engine_unrecorded` too | launch.mjs L579 | All change together (§2.1) |
| C8 | L218 asks for the `test` gate, which no longer exists | L218; `.github/ci-kit.yml` L25, L30 | `test-1` and `test-2` (§5.2) |
| C9 | M6a's README text says a later update "asks for the install again" only when a part moves; M6b moves none and still changes what install says | README L132–134 | The update step says what install and doctor now report, and that sessions do not wait for an install (§1.5) |
| C10 | The acceptance says `cua install` "downloads no ChatGPT package"; an older cua sharing the home still does | L206; §3.7 | The claim is this cua's. The README says what an older one does |
| C11 | "Its sentence naming … `CUA_NATIVE_ENGINE=cua`", and 1216's "unset CUA_NATIVE_ENGINE" | L164 against L2966 | Both, in one sentence (N1) |
| C12 | 1216's "nothing reads it since this release", and what the report can know: an older cua sharing the home may read the tree, and the record does not show its contents | L2959; the re-review | The sentence keeps the path and the size and says only that this version no longer uses the tree for sessions. It hands the person the check for older consumers and for added files (§3.3). T9's Decision Log entry records the narrowing |
| C13 | Ruling 1217 is not in the Decision Log yet | the revision-2 brief | Cited from the brief here; T9 adds its entry |

## 9. Sources, and what was not verified

**Sources** (read 2026-11-24).

- The code at 84216c0fe; the spec at 8f4df73a4; M6a's pre-flight; #117's spec for ruling 1175.
- M5's evidence (`m5/README.md` L213–250, `m5/t10/README.md`) and M6a's (`m6a/README.md`, `f10-credit.txt`, the
  listing of `x64/regression/parity/`); the listings of `engine-044/` and `engine-045/`.
- The deployed provisioner's two generations: `deploy/cloud-vm/cua-provision.sh` at main and at 9d3fdce6b.
- `git log` and `git show --stat` for da7585c31..854103aa5 over the engine, the service, the facade and the host,
  and `git merge-base --is-ancestor` for finding 10.
- This VM's default home, read only: `runtimes/` (one release), the record's text, each file's size by `find`
  (211,063,820 bytes in 2,345 files), `du`'s two figures, and the SHA-256 of its `sky_linux_x64` (`7ac3c2ae…f1cd`,
  which is R/A L224's).
- The two fixtures: their listings, `sha256sum -c` on both tars, the tars' member lists, and the hashes of their
  `tree-sha256.txt` (x64 `7886c5dc…b54f`, arm64 `24340a6e…af45`).
- The two pinned debs on this VM: their lengths and SHA-256, which equal the pins' (474,898,954 bytes and
  `8094004f…8ad30`; 453,477,698 bytes and `ab3eea13…0f5cd`).
- `scripts/linux-engine-diff/scene-ended.mjs` L76–81, whose pinned arm64 digest equals the arm64 fixture's entry for
  `sky_linux_arm64`.
- `ci-gate --help`, for what `--gates` selects.
- Ruling 1217, and the MacBook copy's hashes and sizes, from the coordinator's revision-2 brief.

**Not verified.**

- No cua code was run. Every statement about behaviour after the change is design, and every statement about
  today's is from reading the code.
- §3.6's table: what each deployed script does against M6b's checkout is read from the two scripts, not run. T5's
  tests are the check. How many VMs the template has made, and what their confs hold, is not known here.
- That `ci-gate --gates engine-linux` runs a gate whose paths did not change. Its help says "exactly these gates".
  §5.2 says what counts if it skips.
- That each fixture's payload equals its deb's. The fixtures were not extracted or compared here; only the two
  binaries' digests were matched to independent records (§4.4). T3's comparison is the check, and it comes before
  the manifest is pinned.
- That the install left the deb's `cua_node` payload as it was, with nothing stripped or re-moded. If it did not,
  T3's comparison shows the difference, and the fixture is rebuilt from the deb.
- That the VM's origin answers a fetch by commit ID. Where it does not, `update.sh`'s step 4 and the script fetch
  the source's refs and require the commit to be present.
- The MacBook's copy of the fixtures: its hashes and sizes are the coordinator's reading, not mine.
- Task 165's result. The plan cites the run and leaves the result for close-out.
- That the events step and FB run from the fixture with no change to the harness but where the paths come from.
- Whether the facade's vendor differential (`test/cua-api/facade-vendor.test.mjs`, which runs only with
  `CUA_VENDOR_CUA`) was ever run on #558's scenarios. The repository holds no record of one.
- That every file of da7585c31..854103aa5 under §5.3's paths falls in a row of the bridge table. The rows come from
  the commits' file lists; `credit.txt` is the check.
- The arm64 tree: its top-level names and its `install.json` are assumed to mirror x64's.
- That every installer's `fetch` is the global one at call time, so that a preload's wrapper sees it. They take it as
  a default parameter; the older cua's log is the check.
- That `strace -f` follows `cua install` and `cua doctor` as it followed `cua serve` on both venues.
- Doctor's time for the size walk on a slow disk. T6 reports it.
- That no script or test outside §1.3 and §1.4 reads a Linux pin, `vendorLinuxRuntime` or `runtime.vendor`. The list
  is from one search of the tree for those names and for `sky_linux`, read by file.
- The four harness install sites on a Linux device after F10: they are read, not run.
- Whether any home besides this VM's selects `vendor` today. The soak's record says none needed it (L2941).
- The hosted runner's time for the older cua's install on arm64 at 854103aa5; M6a's was at 0d19fdfa.
