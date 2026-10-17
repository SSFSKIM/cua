# cua's own sandbox for its JavaScript children (#115; child 2 of #114)

## Purpose

cua runs model-written JavaScript in two Node children, the kernel (the model's cells) and the trusted worker (cua's trusted services: the sky and browser wrappers that substitute `{{secret:KEY}}`). Both are confined by an OS sandbox. That sandbox has come from OpenAI's Codex CLI so far: CodexCLI.app (229 MB, signed by OpenAI) on macOS and the ChatGPT deb's `codex` on Linux, extracted into every runtime cua installs. After this work, cua builds that sandbox itself from the public original (openai/codex, Apache-2.0), and nothing from the Codex CLI is extracted or launched.

Three things become possible that were not before:

- **The model's cells can no longer read the user's secrets.** Today both children share one profile, so a cell can run `fs.readFileSync(<the secret store>/PASSWORD)`, and README says cua cannot prevent it. With its own launcher, cua gives the kernel a stricter profile than the worker. The kernel is denied the secret store, `~/.config/cua` and cua's own home (state, device enrolment, Chrome registration, other sessions' run directories), except the runtime and Node it must read and its own run directory. The worker keeps reading the store, so substitution still works.
- **Linux computer sessions get a sandbox.** They run with no sandbox at all today, because the original's network filter blocks every socket and sky_linux needs X11 and the session bus. They now default to a confined kernel, and only the worker can reach the network.
- **The install is lighter and owned.** `cua install` stops placing CodexCLI.app. On Linux it fetches one small static helper that cua builds from upstream with a provenance attestation.

How to see it: on the mini, run `cua doctor`. It shows a `sandbox.launcher` row and no Codex CLI rows. In a session, `ps` shows no `codex` process. A cell's read of the secret store fails with `EPERM`, while `type_text("{{secret:KEY}}")` still types the value.

This is child 2 of the independence composite #114, after #113 (own browser service) and #116 (own REPL host). It is not full independence: on macOS, computer sessions still run the vendor's node_repl and native helper until #117. For that route, cua ships a small compatibility executable in the Codex CLI's place.

## Progress

- [x] (2026-10-17) Owner approved starting #115 with route "B, with a first experiment under A"; research landed (`docs/doperpowers/research/2026-10-17-own-sandbox/`: A macOS seatbelt path, B Linux helper, C1 cua wiring, C2 app-server callers and signature checks, spike-helper live spike, critique-final).
- [x] (2026-10-17) Owner rulings: ChatGPT extension route removed first (#79); kernel denied the secret store, `~/.config/cua`, `$CUA_HOME/state` and other sessions' run directories; Linux helper as a release asset; Linux computer sessions default to a confined kernel; Linux vendor host retired (#135); the Linux worker contingency.
- [x] (2026-10-17) Design converged with a doperpowers:critique debate (ten findings adopted) and approved by the owner.
- [x] (2026-10-17) Living spec authored.
- [ ] Independent spec review (technical, adversarial-reviewer) and execution-section buildability review.
- [ ] M0 — Oracles, probes and baselines.
- [ ] M1 — Policy model, deny list, seatbelt port; cua's own host on macOS.
- [ ] M2 — Compatibility executable for the macOS vendor host; CodexCLI.app leaves the macOS pin.
- [ ] M3 — Linux helper (built, attested, released), cua's own host on Linux, confined Linux computer default, Linux vendor host retired; `codex` leaves the Linux pins.
- [ ] M4 — #138 measured change, CODEX_HOME narrowing and cleanup, documentation, final acceptance and latency, plugin release.

## Scope, inheritance and evidence

Child 2, board #115, of composite #114 (recorded on the board; no checked-in parent spec). The parent contract is full independence from OpenAI with no capability or performance regression and an unchanged model-facing API. Siblings:

- #113 own browser service (landed);
- #116 own REPL host (landed; its spec `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md` section "Kernel and sandbox" is what this work replaces);
- #117 native engine (paused);
- #120 clean-room rewrite (not current work).

#79 (removing the ChatGPT extension route, the vendor browser service and `cua login`) runs ahead of this ticket. It is a prerequisite of M2.

Owner principle (2026-10-17, #114): referenceable originals are used as far as they go. Distribution stays internal (research purpose). The repository is public.

Research inputs, `docs/doperpowers/research/2026-10-17-own-sandbox/` (cited below as R/<file>):

| File | What it settles |
|---|---|
| `codex-dependency-research.md` | The recovered `codex sandbox` argv; node_repl's lazy `codex app-server`; licences |
| `A-macos-seatbelt.md` | The original's macOS path at rust-v0.159.2: config load, permission resolution, profile composition, `-D` order, environment, process model, port sizing, observability, upstream changes |
| `B-linux-helper.md` | codex-linux-sandbox: bwrap selection, mounts, seccomp (connect denied on every family), fail-closed behaviour, standalone build, the exact `--permission-profile` JSON, redistribution, upstream fixes |
| `C1-cua-wiring.md` | Every Codex CLI and CODEX_HOME reference in cua, install/manifest/doctor, CODEX_HOME's consumers, spec and README text to revise, tests and evidence, latency data |
| `C2-appserver-signature.md` | Which JavaScript reaches app-server-backed calls; node_repl's failure handling; no code-signature check of CODEX_CLI_PATH; the native helper's own app-server client |
| `spike-helper/` | Live spike on the mini (2026-10-17): the macOS native helper runs `$CODEX_CLI_PATH app-server --listen stdio://` and fails every native call without it; node_repl runs its children unconfined when CODEX_CLI_PATH is unset; `shim.log` shows node_repl's script directory under TMPDIR |
| `critique-final.md` | The converged critique: the ten adopted changes with their reasons |

The public original is cited as `U@<commit>:<path>:<lines>`, with `U` meaning `https://github.com/openai/codex/blob/<commit>/codex-rs/`. Two commits matter:

- `ff6aec96948b70d94983af2641a6b67c94faeff5` is tag rust-v0.159.2, the version of the installed CLI. The macOS port's source.
- The Linux helper's commit, chosen in M3 (see "The Linux helper").

## Design

### Terms

- **Kernel**: the Node child that runs the model's cells. Code: `src/repl-host/kernel.mjs` on cua's host; the vendor's `kernel.js` on the vendor host.
- **Trusted worker**: the Node child that runs cua's trusted services (`src/repl-host/trusted-worker.mjs`; the vendor's `trusted-worker.js`).
- **Role**: kernel or worker.
- **Own host**: cua's REPL host, `src/repl-host/supervisor.mjs`.
- **Vendor host**: Node → cua-repl → OpenAI's closed Rust node_repl. After this work it serves only macOS computer sessions.
- **Sandbox state**: the per-call `_meta["codex/sandbox-state-meta"]` value cua's proxy sends (`src/runtime/sandbox.mjs` `sandboxState`), selected by `CUA_SHIM_SANDBOX`:
  - `scoped` (default): read everywhere, write the run directory and `$TMPDIR`, no network;
  - `default`: read everywhere, no writes;
  - `disabled`: no sandbox.
- **Permission profile**: the original's JSON shape `{type:'managed', file_system:{type:'restricted', entries:[{path, access}]}, network:'restricted'|'enabled'}`. `path` is `{type:'special', value:{kind}}` or `{type:'path', path}`. `access` is `read`, `write` or `none` (`none` is the original's serde alias for Deny).
- **Deny list**: the absolute paths the kernel may not read, with the paths re-exposed inside them (Design, "Policy").
- **Compat executable**: the cua-owned executable named by CODEX_CLI_PATH for the vendor host.

### Today, and why the Codex CLI cannot simply be dropped

- **Own host.** `src/repl-host/supervisor.mjs` `childLaunch` spawns `$CODEX_CLI_PATH sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl" -c permissions.node_repl={filesystem = {…}, network = {enabled = false}} -- <node> --experimental-vm-modules <script> …` for both children, with one policy rendered by `src/runtime/sandbox.mjs` `sandboxPolicy`/`sandboxArgs`.
- **Vendor host.** node_repl spawns the same command for its `kernel.js` and `trusted-worker.js`. It writes those scripts into a random `.tmpXXXXXX` directory under TMPDIR and passes that directory as an explicit read entry (R/spike-helper/shim.log). node_repl runs both children unconfined when CODEX_CLI_PATH is unset (R/spike-helper/REPORT.md, surprise 1). On Linux it also fails open when the launcher fails at run time (#135).
- **The macOS native helper.** SkyComputerUseService is opened by node_repl through `open`, which passes node_repl's whole environment. At the first native call it runs `$CODEX_CLI_PATH app-server --listen stdio://` once per helper and sends `initialize`, `configRequirements/read` and `config/read`, then kills it. If that fails, every native call fails with `Computer Use server error -10005: codex app-server exited before returning a response` (R/spike-helper/REPORT.md, phases 2 and 3). This is the one consumer that makes a bare sandbox launcher insufficient on macOS.
- **No code-signature check.** Nothing verifies the CODEX_CLI_PATH executable's code signature (R/C2 §3).
- **The original's own behaviour.** What the original CLI does beyond the profile (R/A §1–4):
  - it reads the full Codex config stack (`~/.codex` or `$CODEX_HOME/config.toml`, `/etc/codex`, MDM) and merges it into the policy;
  - it loads `$CODEX_HOME/.env`, creates `tmp/arg0` symlinks and prepends them to PATH;
  - it spawns `/usr/bin/sandbox-exec` as a child and waits, with no signal forwarding, and is orphaned if killed.
- **Linux computer sessions** default to `disabled`: the original's seccomp filter denies `connect` on every socket family when the network is restricted (R/B §2, §6), so sky_linux could not reach X11 or the bus.

### The shape: one policy model, two OS renderings, two callers

```
             src/runtime/launch.mjs buildLaunch
             (resolves the deny list once: CUA_SANDBOX_DENY_READ)
                  |                               |
     own host (supervisor.mjs)          vendor host (node_repl, macOS computer only)
     childLaunch(role)                  spawns $CODEX_CLI_PATH = bin/cua-codex-compat
                  |                               |  sandbox -c … -- node kernel.js|trusted-worker.js
                  |                               |  app-server --listen stdio://  (also from the native helper)
                  v                               v
            src/sandbox/  policy.mjs (state, role, deny list) -> permission profile
                          seatbelt.mjs (macOS) -> /usr/bin/sandbox-exec argv
                          linux.mjs   (Linux) -> pinned codex-linux-sandbox argv
                          env.mjs     -> the child's environment
                          app-server.mjs -> the three recorded answers
```

`src/sandbox/` is new: it holds the policy model and its OS renderings. `src/runtime/sandbox.mjs` keeps what it owns today:

- the modes and the per-call state;
- `withSandbox`;
- the preflights: `assertSandboxFits`, `assertSandboxConfines`, `assertTrustedServicesContained`.

Its `sandboxPolicy`/`sandboxArgs` pair, which renders the Codex CLI's argv, is retired at M2. Until then the vendor host uses it unchanged; the own host stops using it at M1.

### Policy: roles and the deny list

`policy.mjs` turns a call's sandbox state into one permission profile per role. Both roles start from the state as today:

- **scoped**: `:root` read, `project_roots` write, `tmpdir` write;
- **default**: `:root` read;
- **disabled**: no profile at all.

To that it adds:

- **Read paths.** The host's own read paths (`hostSettings` `readPaths`; for the vendor host, the read entries node_repl passes), both roles.
- **The deny list**, kernel role only. Each directory on it becomes an entry with `access: 'none'`.
- **Network.** `network: 'enabled'` for the worker role on Linux with the computer surface. Everything else, the kernel always, stays `restricted`.

The deny list is resolved once, by `buildLaunch`, from the same values it gives the worker. Two resolutions could diverge (a test home, HOME differing between proxy and launch); the kernel would then read what the worker substitutes from. It has two kinds of entries.

Denied (`access: 'none'`):

1. **The secret store.** The global directory is `CUA_SECRETS_DIR` when secrets are on, else the default store path from `src/secrets/store.mjs` `storeDir`, because the directory exists whatever this connection's setting. Project tiers live under it (`projects/<slug>`), but containment must hold by real path, not lexically: the store follows intermediate symlinks (`src/secrets/store.mjs` joins names and opens only the final file with `O_NOFOLLOW`). So the list also carries the real target of every symlinked entry under `projects/` (enumerated at launch), and of `projects/` itself if it is a symlink, together with the real path of this connection's project tier (`CUA_SECRETS_PROJECT_DIR`) when that lies outside the global store.
2. **`$HOME/.config/cua`.**
3. **The whole of `$CUA_HOME`** (`homeLayout(home).home`). That covers:
   - `state/`, where CODEX_HOME and the handshake record live;
   - `remote/`, which holds the device enrolment (`device.json`), the device list and the extension signing key (`src/remote/device.mjs`); an enrolled device's credentials there would let a cell impersonate it;
   - `chrome/`, with host registrations, logs and sockets;
   - `profiles.json`, `current.json`, `staging/` and `bin/`;
   - every other session's `run/<id>`.

   Denying the home and re-exposing what the kernel needs keeps future private state covered without a list to maintain.

Re-exposed inside the denied home (most-specific wins):

- `runtimes/` (read: the vendor module tree the kernel resolves packages from, and on the vendor host the vendor Node it runs on);
- `node/` (read: the Node cua installed for its own host);
- the launch's own run directory `run/<sessionId>` (the scoped write root, and the per-session TMPDIR below).

`buildLaunch` passes the list to both hosts as `CUA_SANDBOX_DENY_READ`, JSON `{"deny": [absolute paths], "reexpose": [absolute paths]}`. A non-disabled launch without a well-formed value is refused (`sandbox_state_invalid`). The kernel role applies it and the worker role ignores it; one rule governs refusal for both.

**A per-session TMPDIR.** `buildLaunch` sets `TMPDIR` for every launch, both hosts, to `run/<sessionId>/tmp`, created with mode 0700. It no longer copies the caller's. Two reasons:

- On macOS the caller's TMPDIR is shared by every session of the account. node_repl writes each session's `kernel.js` and `trusted-worker.js` into a `.tmpXXXXXX` directory there (R/spike-helper/shim.log). Each profile protects only its own session's script directory, so a scoped kernel in one session could overwrite another session's `trusted-worker.js` before that session's worker starts, and run as a secret-reading worker.
- With TMPDIR inside the run directory, every write root a kernel has lies inside its own run directory, and every other session's run directory is denied.

The `tmpdir` write grant then names a directory nobody else uses. `os.tmpdir()` in a cell returns it. It is removed with the run directory when the connection ends.

Before any profile is rendered, each deny target is created as a directory with mode 0700 (idempotent; a file target such as a symlinked tier's target that is a file is left as it is), and the path emitted is its real path (`realish`, `src/runtime/sandbox.mjs`). The reasons are two original behaviours:

- **Linux**: the original emits no mask for an unreadable root that does not exist (`U@ff6aec96:linux-sandbox/src/bwrap.rs:1320-1352`), and `--ro-bind / /` is a live view. A store created mid-session would be readable by the running kernel.
- **macOS**: the original falls back to the logical path when canonicalization fails (`U@ff6aec96:sandboxing/src/seatbelt.rs:217-231`), which a symlinked ancestor defeats.

A target that cannot be created refuses the launch. This is cheap and closes both.

The deny entries join the scoped preflight's protected paths (`protectedPaths`), so a write root overlapping a deny target is refused at launch. The one exception is the launch's own run directory: under the most-specific rule, a write entry nested inside a deny entry makes that subtree readable again, and that is intended only for `run/<sessionId>`. Whether the original renders "deny the home, read `runtimes/` and `node/`, write `run/<id>`" as intended is checked on both OSes:

- macOS: an explicit `deny` rule would override the later `allow`. Checked with the golden fixture in M0, and in M1.
- Linux: the mount order for re-exposed binds inside a mask (`U:linux-sandbox/src/bwrap.rs:613-646`, at the M3 commit). Probed in M0.

If an OS cannot express the nesting, the home entry on that OS falls back to denying its private entries one by one: `state/`, `remote/`, `chrome/`, `profiles.json`, `current.json`. Other sessions' run directories then stay readable on that OS, which is recorded in the Decision Log and reported to the owner. The secret store and `~/.config/cua` entries do not depend on nesting.

Effect on the original's semantics (R/A §2, R/critique-final 7). Any Deny entry makes `has_full_disk_read_access()` false (`U@ff6aec96:protocol/src/permissions.rs:913-931`). The kernel's profile then lists readable roots (`/` with the denied subpaths excluded) instead of `(allow file-read*)`, and it drops `seatbelt_preferences_policy.sbpl` (cfprefsd lookup, cfprefs shared memory, `user-preference-read`). Nothing cua has run before was this tight. M1 measures it: the #116 corpus runs with the sandbox denial log captured, and the result is diffed against today's profile. Two outcomes:

- No new failure: keep the original's semantics.
- Otherwise: add the preferences policy back to the kernel profile as a recorded deviation.

Why deny through the original's `none` entries rather than appending cua's own `(deny file-read* …)` rules: byte parity with the original's generator stays the oracle for the kernel's profile too. The alternative would be a cua-specific rendering with no original to check it against.

Hard links and clones. A path-based read deny is bypassable by a hard link made inside a writable root, unless the profile denies `file-link` and `file-clone`. This was verified with toy profiles on macOS (R/critique-final 6). The original's base policy is `(deny default)` and never allows either, which is what keeps the deny effective. On Linux, a hard link cannot cross into a writable bind mount (EXDEV), and the tmpfs mask hides the target. Probes pin this invariant on both OSes (acceptance 3).

### macOS: the seatbelt port

`src/sandbox/seatbelt.mjs` is a JavaScript port of the original's profile generation at rust-v0.159.2. It covers `create_seatbelt_command_args_with_profile` (`U@ff6aec96:sandboxing/src/seatbelt.rs:882-1109`) and the permission resolution it depends on (`U@ff6aec96:protocol/src/permissions.rs`). The port is scoped to cua's input set (special kinds `root`, `project_roots`, `tmpdir`, `slash_tmp`, `minimal`, absolute paths; access read/write/none; network restricted or enabled; no globs, no proxy, no unix-socket grants), about 600–900 lines. Anything outside that set is refused, not rendered. It reproduces:

- **Composition.** The section order and the `"\n"` join (empty sections still produce blank lines), as R/A §3 lists:
  1. base policy;
  2. read section;
  3. write section with the root unlink denies;
  4. network section;
  5. preferences under full read;
  6. platform defaults only for `:minimal`;
  7. daemon-socket protection;
  8. XPC lookup deny;
  9. deny-glob section (empty);
  10. protected-ancestor unlink denies;
  11. fcntl deny;
  12. TIOCSTI line.
- **The `-D` parameters** in the original's order: read params, write params (per root: root, then its exclusions), protected ancestors.
- **Writable roots.** Top-level alias normalization (`/var` → `/private/var`), rejection of a symlink in a non-top-level component ("symlinked writable roots are not supported"), `subpath` for a directory or missing path, `literal` for a file.
- **Read-only carve-outs inside each write root.** The protected names `.git`, `.agents`, `.codex` and `.aws` are protected by regex wherever they are not writable, escaped with regex-lite's meta set. The existing ones also get literal and subpath exclusions (with `_RESOLVED` variants). `.codex` is always protected for the cwd root. A gitdir pointer target is protected too.
- **Nested lesser-access entries.** An explicit read (or none) entry nested inside a write root becomes a read-only (or unreadable) subpath of that root (`U@ff6aec96:protocol/src/permissions.rs:1696-1760`). This is load-bearing on the vendor host. node_repl's script directory lies inside the TMPDIR write root, and this exclusion is the only thing between a cell and overwriting `trusted-worker.js` before the worker's lazy first start.
- **Deny entries.** They switch full-disk read to readable roots with the denied subpaths excluded and drop the preferences policy (above).
- **Protected-ancestor unlink denies, the per-root directory-unlink deny, and daemon-socket protection** for `/private/tmp/codex-daemon-<euid>`.
- **The four `.sbpl` files**, copied byte for byte to `src/sandbox/seatbelt/`.

The `.codex`-always and gitdir-pointer rules only ever fire in fixtures, because cua's cwd is a fresh run directory. They are kept for parity, not because they are load-bearing.

Deviations from the original, each strictly tighter or a fix, each named in the file header and in the provenance list:

- **No Codex config.** It reads no Codex config, MDM preferences, `/etc/codex` or `$CODEX_HOME/.env`, and adds no arg0 PATH entry. The policy is exactly cua's input, the same on every machine.
- **TIOCSTI line.** It is `(deny file-ioctl (ioctl-command 2147578994))`, the numeric form of `TIOCSTI` that upstream adopted after the tag (openai/codex f817e16905), because older policy compilers reject the symbol.
- **One more stripped name.** `CODEX_GUARDIAN_DECISIONS_API_KEY` joins the stripped environment names (upstream 9552906b2b).

The child's environment (`src/sandbox/env.mjs`) is the parent's, minus the original's non-inheritable names (`U@ff6aec96:protocol/src/shell_environment.rs:14-20` plus the one above), plus `CODEX_SANDBOX=seatbelt` and, with the network off, `CODEX_SANDBOX_NETWORK_DISABLED=1`. Vendor code may read these.

`src/sandbox/LICENSE` (Apache-2.0) and `src/sandbox/NOTICE` (upstream's NOTICE) sit beside the port. Each ported file carries a "Ported from openai/codex@<commit> <path>:<lines> (Apache-2.0)" header naming every source range, the house rule for ports.

Why port rather than build a small Rust binary from the original crates: the crates pull about 650 dependencies and would ship an unsigned binary per macOS architecture, against a JavaScript renderer the own host calls in-process with no extra process. The Rust build is still used, as the golden generator (Verification).

### Linux: the original helper, invoked directly

`src/sandbox/linux.mjs` renders the helper's argv exactly as the original's renderer does (`U:sandboxing/src/landlock.rs`, at the M3 commit; R/B §1, §4):

```
codex-linux-sandbox --sandbox-policy-cwd <cwd> --command-cwd <cwd> --permission-profile <profile JSON> -- <node> --experimental-vm-modules <script> …
```

It is spawned with that cwd and the environment rule above, without `CODEX_SANDBOX=seatbelt`. The helper selects the system `bwrap` from PATH; cua's PATH is fixed at `/usr/bin:/bin:/usr/sbin:/sbin`, which no cell can write. It applies `PR_SET_NO_NEW_PRIVS` and seccomp, and fails closed on every setup error (R/B §2). cua never passes `--use-legacy-landlock`, `--managed-network` or the helper's internal flags.

The helper binary:

- **Build.** It is built by a workflow in SSFSKIM/cua's GitHub Actions (`.github/workflows/linux-sandbox-helper.yml`):
  - `cargo build --locked --release -p codex-linux-sandbox --bin codex-linux-sandbox --target <arch>-unknown-linux-musl`, for x86_64 and aarch64;
  - upstream's musl recipe (`.github/scripts/install-musl-openssl.sh` at that commit), stripped;
  - upstream's LICENSE and NOTICE beside it;
  - a provenance attestation from `actions/attest-build-provenance`.
- **The commit.** An exact upstream commit, chosen at M3's start: the newest stable `rust-v*` release that contains ae7aad5 (#50059: fail-closed startup with multiple denied files, which the kernel's deny entries need) and 7aa8f51 (#51211: refuse sandbox-writable bwrap candidates). rust-v0.163.0 qualifies at writing. The helper's CLI and `--permission-profile` schema are re-read at that commit before anything depends on them (R/B verified them at 0.159.2).
- **Release.** It is published as a release asset on SSFSKIM/cua.
- **Pin file.** `runtime/sandbox/linux-sandbox.json` records `{upstreamTag, upstreamCommit, assets: {"linux-x64": {url, sha256}, "linux-arm64": {url, sha256}}, attestation: {workflow, runId}}`.
- **Install.** `cua install` fetches the asset for the machine's architecture, verifies the SHA-256 and places it at `$CUA_HOME/sandbox/<upstreamTag>/codex-linux-sandbox` (mode 0755, directory 0755). That directory joins the scoped preflight's protected paths.
- **Every launch** re-checks the placed file's SHA-256 against the pin. A missing or mismatched helper refuses with `sandbox_unavailable`.

Why not upstream's own release: upstream publishes no standalone helper. Its cosign-signed `codex-<musl>` binary becomes the helper when run as `codex-linux-sandbox` (arg0 dispatch). That would give upstream-grade provenance for no build work, but it is the whole ~100 MB Codex CLI, which is what this ticket removes. Why system bwrap and no bundled sidecar: Ubuntu ships it, `cua doctor` already checks it, and a bundled bwrap would carry LGPL obligations (R/B §5).

**Linux computer sessions.** With the computer surface on Linux the default mode becomes `scoped`:

- the kernel gets the restricted profile plus the deny list, with no sockets (seccomp denies `connect` on every family), so a cell can no longer reach X11 or the bus directly;
- the worker gets `network: 'enabled'` with the same filesystem limits, so sky_linux, its stdio child, reaches X11 and the session bus.

`CUA_SHIM_SANDBOX=disabled` remains the operator's explicit opt-out (README states it), set in `cua serve`'s environment. No client can change it per call.

Two facts are probed in M0 before M3 builds on them:

- **(a) XShm.** The helper always passes `--unshare-ipc`, so MIT-SHM may fail for sky_linux's screenshots: `XShmAttach` returning BadAccess after a successful extension query.
- **(b) App launch.** If sky_linux fork/execs the applications it launches, they inherit the worker's read-only root, `--unshare-pid` and `--die-with-parent`.

If either breaks, the owner-approved order applies:

1. Keep the worker confined, and launch applications outside the sandbox through the supervisor. That would be a Linux `launch_services_action` over `gio launch` or `systemd-run --user`, as `src/repl-host/launch-services.mjs` does with `open` on macOS. It is possible only if sky_linux's launch path can be redirected.
2. Otherwise, the worker on Linux computer sessions runs unconfined (today's posture for vendor code), and the kernel stays confined.

Either way the host's `sandboxed` advertisement and tool text say which child is confined.

**Linux vendor host retired.** `CUA_REPL_HOST=vendor` on Linux is refused (`repl_host_refused`, naming the reason). `replHostFor` never selects the vendor host on Linux. This closes #135, whose fail-open path exists only in the vendor node_repl.

### The own host launches through it directly

`src/repl-host/supervisor.mjs` `childLaunch` asks `src/sandbox` for each child with its role and spawns the result:

- **macOS:** `/usr/bin/sandbox-exec`, which applies the profile and execs Node. The child process is Node itself: no launcher parent is left behind, nothing is orphaned on kill, and exit status and signals are Node's. `kernel-child.mjs`'s header and its diagnostic test change accordingly; `kernel_pid` is Node's pid.
- **Linux:** the pinned helper. The FIFO stdio stays, because the helper's seccomp still blocks socketpairs.

The own host no longer receives CODEX_CLI_PATH or CODEX_HOME. `NO_SANDBOX_SENTENCE` is reworded to name the missing helper or a state that cannot be rendered, never CODEX_CLI_PATH.

The children's launch key stays the policy-state key, the same for both roles: the call's sandbox state, its cwd and the read paths, never the role-rendered profile. `runJs` stops the worker whenever its key differs from the kernel launch's, so role-specific keys would restart the worker on every call. A state change still replaces both children.

### The compat executable (macOS vendor host, until #117)

CODEX_CLI_PATH names `bin/cua-codex-compat`, by its real path in cua's checkout. It is a POSIX sh script that execs `$CUA_COMPAT_NODE` on `src/sandbox/codex-compat.mjs`. `buildLaunch` sets `CUA_COMPAT_NODE` to the vendor runtime's pinned Node (24.21.0, which has `process.execve`) for vendor-host launches. node_repl's environment carries it, and so does the native helper's, which `open` passes through. The script refuses unless the value is an absolute path to an executable.

The compat executable runs outside any sandbox, so its code must not be writable by cells. `bin/` and `src/sandbox/` join the trusted code paths that the scoped preflight protects, for both hosts.

Subcommands:

- **`sandbox`.** It accepts exactly the recovered template: the three `-c` keys `shell_environment_policy.inherit="all"`, `default_permissions="node_repl"` and `permissions.node_repl={filesystem = {…}, network = {enabled = false}}`, then `--`, then the command. Anything else exits 1 with a sentence on stderr, including `--allow-unix-socket` (cua never sets `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS`), another key, or a malformed table; node_repl on macOS refuses the cell on a launcher failure.
  - It parses the filesystem table into the same entries `policy.mjs` takes.
  - It takes the role from the script's basename. node_repl writes its scripts into a random temp directory, so no stable path exists: `kernel.js` is the kernel, `trusted-worker.js` the worker, and anything else gets the kernel's stricter profile.
  - It reads `CUA_SANDBOX_DENY_READ`; missing or malformed exits 1.
  - Then it `process.execve`s `/usr/bin/sandbox-exec` with the seatbelt argv and environment.
- **`app-server --listen stdio://`.** Newline-delimited JSON-RPC 2.0 on stdin and stdout.
  - It answers `initialize`, `configRequirements/read` and `config/read` with the results the signed CLI returns under cua's CODEX_HOME, captured in M0. The captured results are audited (no credential, token or account field; paths rendered from the environment if the capture shows any) and kept in `src/sandbox/app-server-responses.json`.
  - Notifications are ignored. Any other method gets JSON-RPC error `-32601` with a sentence.
  - It exits 0 on EOF.
  - If M0's replay test shows the helper needs another method (for example `getAuthStatus`), that method's recorded answer is added the same way.
- **Anything else** (`login`, `exec`, no subcommand) exits 1 with a sentence.

`buildLaunch`'s vendor-host preflight refuses to start unless CODEX_CLI_PATH is set to an existing executable file, because node_repl runs unconfined without it.

### Removal, CODEX_HOME and the install

- **macOS (M2).** CodexCLI.app leaves:
  - the darwin pin (`components`, `layout.codexCli`, `signing.components`);
  - `src/runtime/manifest.mjs` `LAYOUT_KEYS`;
  - install's component placement and `verifyCodeSignatures`;
  - doctor's `runtime.files` and `runtime.signatures`.
- **Linux (M3).** `codex` leaves the two Linux pins and `LINUX_LAYOUT_KEYS`.
- **Archives.** The vendor archives themselves are unchanged: `cua_node` and the native helper still come from them until #117.
- **Doctor.** It gains `sandbox.launcher`:
  - macOS: `/usr/bin/sandbox-exec` present, plus the compat executable and its Node for the vendor host;
  - Linux: the helper present and hash-correct; the existing `sandbox.userns` row stays.
- **CODEX_HOME.** It stays only for the macOS vendor host, where node_repl writes `computer-use/sessions` approvals and `node_repl/active_execs`. The own host stops setting it.
- **Cleanup.** The Codex CLI's leftovers in the owned CODEX_HOME are removed by `cua install` (and reported by doctor until then), by name, after #79 has removed their last user: `auth.json`, `installation_id`, `*.sqlite` with their `-wal`/`-shm`, `models_cache.json`, `cache/`, `plugins/`, `skills/`, `log/`, `tmp/arg0`, `browser/sessions`. Every name is logged without its content.

### #138: the time-zone hang

The full-read profile denies the `com.apple.system.notification_center` mach lookup that `notify_register_tz` makes; the original grants it only in its platform-defaults file, which `:minimal` alone includes (R/A §7). That denied lookup, adjudicated by launchd, fits #138's hang (about 1 in 8 first local-time conversions). After parity (M4), one `(allow mach-lookup (global-name "com.apple.system.notification_center"))` line is added to cua's macOS profiles, both roles, as a recorded deviation. It is kept only if #138's 80-run repro then shows zero hangs; otherwise it is removed and #138 stays open with the measurement. The own host's time-zone warm-up (`src/repl-host/worker-runtime.mjs`) stays either way.

## Verification and acceptance

Each item is behaviour someone can check. The commands are in Concrete Steps.

1. **No Codex CLI.** On the mini and on the Linux box, a fresh `cua install` places no CodexCLI.app or `codex`. During any session, `ps` shows no process named `codex`. In an own-host session on macOS, the kernel process is Node, and its parent is the supervisor.
2. **The deny holds.** In `scoped` and `default` sessions, on both hosts and both OSes, a cell's `readFileSync`/`readdirSync` of each deny-list location fails with `EPERM` or `EACCES`. The locations: the global store; a project tier, including the real target of a symlinked tier; `~/.config/cua`; `$CUA_HOME/state`; a synthetic enrolled device under `$CUA_HOME/remote`; `$CUA_HOME/chrome`; and another session's run directory. The same cell can still import packages from the runtime's module tree. The same holds for a store directory created after the session started. In the same session, a `{{secret:KEY}}` reference in a native or browser action still delivers the synthetic value. Under `disabled`, nothing is denied, as README says.
3. **No bypass by link.** A cell cannot read a denied file through a hard link or a clone made in its writable roots: `ln` and `cp -c` fail on macOS, `link` fails on Linux.
4. **Writes confined to the session.** `scripts/accept-native.mjs` item 7 passes: trusted roots unwritable, run directory and `$TMPDIR` writable, `$TMPDIR` being the session's own. On the macOS vendor host, a cell cannot write into its own session's node_repl script directory. With two concurrent sessions, a kernel in an own-host session cannot write into a vendor-host session's script directory or run directory, and the victim session's worker still runs its own script, verified by a synthetic secret that stays unreadable to the attacker.
5. **No network for cells.** A cell's TCP connect and AF_UNIX connect fail, on both OSes and both hosts.
6. **macOS computer route.** On the mini, a computer session runs through the compat executable: `listApps`, Finder `getApp` and `getAXState` succeed, and the helper's app-server child is `bin/cua-codex-compat`. Approvals behave as before.
7. **Linux computer route.** On the Linux box, a computer session drives gedit through sky_linux (bind, AX state, act, screenshot, `end_task`) with the kernel confined per items 2 and 5. `CUA_REPL_HOST=vendor` is refused there with a sentence.
8. **Conformance.**
   - The port matches the golden fixtures byte for byte.
   - The captured argv of the signed CLI equals the port's output for cua's two inputs. If the capture failed, that is recorded and the behavioural link stands in.
   - The fingerprint (`sandbox_check` matrix, environment, cwd) is equal under the signed CLI, the public build and cua's launcher, except for the recorded deviations.
   - On Linux, the probe outcomes under the vendor `codex` and cua's helper invocation are equal for scoped and default.
9. **Fail closed.** Each of these refuses with a sentence, and the probe file the cell would have written does not exist:
   - a missing helper;
   - a helper whose hash mismatches;
   - an unrenderable state;
   - a missing or malformed `CUA_SANDBOX_DENY_READ`;
   - a deny target that cannot be created;
   - a compat wrapper whose Node is missing or relative;
   - a compat executable that exits before `execve`;
   - an unset CODEX_CLI_PATH on the vendor host.

   The #116 parity case `cell/confinement/no-unsandboxed-fallback` passes on the macOS vendor host.
10. **Install and doctor.**
    - `cua doctor` shows `sandbox.launcher` pass and no Codex CLI rows.
    - On Linux, `cua install` fetches and verifies the helper.
    - A tampered helper fails doctor and refuses launches.
    - `cua install` removes the CODEX_HOME leftovers by name.
11. **No latency regression.** Cold start is measured before (M0) and after (M4) on the same machine and host.
    - **Comparison.** native-baseline's same-host comparison, which M0 adds. Its `compare` today requires a vendor baseline, a cua candidate and identical sandbox metadata.
    - **Judged rows and limit.** `cold.miss.first_js` and `cold.hit.first_js`, medians over three runs of the harness's default samples, against the harness's limit (baseline + max(10%, 500 ms)), with the medians reported beside it.
    - **Permitted configuration differences.** The launcher (Codex CLI versus cua), the per-session TMPDIR, and on Linux the sandbox mode (disabled, then scoped with the confined kernel), which is the change being measured.
    - **Configurations:**
      - the vendor host computer session on the mini;
      - an own-host browser-only session on the mini (native-baseline's cold rows with the browser surface, which M0 adds as `--surfaces browser`: the same cold rows, no native calls);
      - the own host computer session on the Linux box.
12. **#116 parity holds.** `scripts/repl-parity.mjs` prepare, run and diff (Concrete Steps):
    - **On the mini:** the own host against the vendor host (`CUA_REPL_HOST=vendor`), `--suite all` (the native scenarios are Linux-only). M1 compares the own host under cua's sandbox with the vendor host under the Codex CLI; M2 onward, both under cua's sandbox. Result: 0 unexpected differences.
    - **On the Linux box:** the own host's `--suite all`, native included, against the vendor control runs retained from M0, the last vendor runs on Linux before M3 retires the vendor host. Expected differences are only this spec's deliberate changes, each with its reason in `test/repl-parity/expected-differences.json`: the native fixture (`test/repl-parity/serve-native.mjs`) moves from forced `disabled` to the new default, and a cell's direct socket reach is gone.
    - **The macOS computer route** has no parity lane, because only the vendor host serves it. Acceptance 6 and the native acceptance runner prove it.
13. **#138.** `scripts/sandbox-probe/tz-probe.mjs` (M0) runs 80 fresh children per configuration.
    - **Each child:** a Node started under the configuration's launcher, whose first time-zone use comes late (after 300 ms idle, a `toLocaleString` with an explicit zone conversion), bounded at 10 s.
    - **Each run** is classified as completed, hung (bound reached) or launcher failure.
    - **M0** runs it under the signed CLI's scoped profile, for the baseline rate. **M4** runs it under cua's final kernel and worker profiles, with and without the notification_center line.
    - **Verdict.** The line is kept only if its runs show zero hangs and zero launcher failures. Otherwise it is removed and #138 stays open with the numbers.
14. **Gates and release.**
    - `HOME=<scratch> npm test`, `npm run test:mods` and `claude plugin validate .` pass.
    - README's sandbox, CODEX_HOME, Linux and configuration text matches the behaviour.
    - The standalone spec (`docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`) and the #116 spec carry dated Decision Log entries.
    - The plugin version is one minor above main's at M4.

## Constraints binding every milestone

**Repository and branches.**
- Repository SSFSKIM/cua. Authoring branch `feat/115-own-sandbox`, worktree `/Users/new/Developer/GitHub/cua-wt-115`, base main 76c3b84. M0 executes on this branch.
- Later milestones branch from main after the preceding PR merges (`feat/115-own-sandbox-m1` … `-m4`), re-pointing the same worktree.
- M2 starts only after #79 is merged into main.
- Never touch `/Users/new/Developer/GitHub/cua` or the mini's resident checkout and agent.
- Each milestone is one PR against main, reviewed at `doperpowers:reviewer-high` on the whole milestone diff, merged by the session after CI is green and the PR is MERGEABLE. No attribution footers. Board writes go only through the issue-tracker scripts with `BOARD_REPO=SSFSKIM/cua`.

**Inherited contracts.**
- #114: no capability or performance regression; the model-facing API and first-call document unchanged.
- #113 and #116: their contracts unchanged except the "Kernel and sandbox" section this spec replaces.
- #117 owns the native helper and therefore the compat executable's retirement.
- The owner rulings in Purpose and Design are not reopened. A fork they do not cover goes to the owner.

**Provenance.**
- Every port carries its provenance header.
- The `.sbpl` files are byte copies.
- No new runtime npm dependency: TOML parsing in the compat executable covers only the recovered template's inline-table subset and refuses anything else.

**Secrets and privacy.**
- Never read or print the secret store's contents, any `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`, `~/.config/cua/extension-key.pem`, `~/.config/hcloud` or secret values.
- Secret tests use synthetic sentinels in a temporary HOME and report labels, counts and booleans.
- Nothing logs AX text of the owner's windows, app lists beyond counts, bookmark names or URLs, pictures or page credentials.
- The app-server capture logs and commits only what the audit allows.

**Processes and the desktop.**
- Never launch or kill the owner's Chrome, native helpers or hosts. Terminate only harness-owned processes; a native helper a harness started may be quit by its pid.
- No GUI input events on the mini beyond what an acceptance item names, on a harness-owned target.
- No TCC clicks, no password prompts (stop and report), no bypass flags.

**Machines.**
- This MacBook runs no heavy builds and no VMs; the cua-linux Tart VM stays off.
- macOS builds and live runs happen on the mini (`ssh mini`; Rust is installed there).
- Linux live runs happen on a GCE Ubuntu 24.04 box with Xvfb, openbox and AT-SPI, provisioned as `docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench/README.md` records (project ytdownload-505811, the default service account; an arm64 t2a spot instance with ssh alias `cua-gce`, plus an x64 instance for the x64 helper's smoke). Stopped between milestones and deleted at the end.
- Linux helper builds happen in GitHub Actions.

**Tests.**
- Local tests use doubles, never the installed runtime, real Chrome or the network.
- Gates before every PR are the three commands of acceptance 14; CI runs them on the PR.

## Plan of Work

### M0 — Oracles, probes and baselines

What exists at the end: committed harness code and evidence that later milestones test against, and verdicts on the four empirical unknowns.

- **Experiment A.** The public CLI is built on the mini at ff6aec96 (`cargo build --release -p codex-cli` in a scratch clone; the toolchain pinned by its `rust-toolchain.toml`). It is run in the signed binary's slot through a harness launch: the spike's `prepareLaunch` hook in `docs/doperpowers/research/2026-10-17-own-sandbox/spike-helper/serve-spike.mjs` is the pattern. The verdict:
  - do the confinement cases and the native calls behave the same as with the signed binary;
  - does the helper accept the public build's app-server.
- **Golden generator** (`scripts/sandbox-golden/`, a dev-only Cargo project with path dependencies into an upstream checkout at ff6aec96 that its script fetches).
  - It constructs the original's filesystem policy directly from a fixture input, calls `create_seatbelt_command_args`, appends the TIOCSTI line (both the symbolic and the numeric form, so fixtures can carry the deviation), and prints JSON `{args, env}`.
  - The fixture matrix:
    - scoped and default × kernel and worker;
    - carve-out directories present and absent;
    - TMPDIR set, unset and relative;
    - a symlinked root;
    - a nested read entry inside a write root (the vendor host's script directory);
    - deny entries, one and several;
    - "deny the cua home, read `runtimes/` and `node/`, write `run/<id>`" (the nesting the deny list relies on).
  - Fixtures are committed under `test/fixtures/sandbox/seatbelt/` with path placeholders, together with the filesystem setup each one assumes.
- **Argv capture** (`scripts/sandbox-probe/capture-argv.c`). An unprivileged poller that spawns the signed CLI itself and busy-loops `proc_listchildpids` and `KERN_PROCARGS2` from before the spawn, catching `sandbox-exec`'s argv before its exec, with bounded retries. It runs for cua's two inputs (scoped and default) on the mini. The captures are committed as evidence. eslogger is used only if the owner grants root and Full Disk Access on the mini.
- **Fingerprint probe** (`scripts/sandbox-probe/fingerprint.c`, built with `xcrun clang` on the mini).
  - It reports `sandbox_check` results over a fixed matrix of `file-read-data`/`file-write-data` paths (home, the deny targets, `/private/tmp`, the run directory, TMPDIR, system directories), `mach-lookup` names (cfprefsd, notification_center, opendirectoryd, trustd and others, listed in the probe), `network-outbound`, `process-exec`, `sysctl-read`, `file-link` and `file-clone`.
  - It also reports its environment and cwd, as JSON.
  - It is run under the signed CLI and the public build in M0; under cua's launcher in M1.
- **App-server capture and replay.**
  1. Record the signed CLI's answers to `initialize`, `configRequirements/read` and `config/read` under cua's CODEX_HOME, through the spike's shim pattern, and audit them.
  2. Replay them from a stub app-server.
  3. Run the six native calls of the spike (`listApps` twice, Finder `getApp` and `getAXState` twice).
  The verdict: the helper accepts the replay, or the extra methods it sends, with their recorded answers.
- **Linux probes.** On the GCE box, under the vendor `codex` with `--permission-profile` network enabled and the scoped filesystem, run (a) `XShmAttach` from a client under the helper, and (b) an app launch by sky_linux from a worker-shaped sandbox. Run also the nesting check: deny the cua home, re-expose `runtimes/` and `node/` read-only, and bind `run/<id>` writable. Each yields a verdict.
- **Harness extensions**, so later milestones can measure without inventing a harness:
  1. `scripts/native-baseline.mjs`: a `--surfaces browser` mode producing the same cold rows with no native calls, and `compare --same-host <before> <after>`, which judges a run against a baseline of the same host and permits only the configuration differences acceptance 11 lists, each recorded in the result;
  2. `scripts/repl-parity.mjs`: the GCE box as a declared device (ssh alias `cua-gce`; `cua-linux` stays declared but off), and the native lane parameterized by device instead of hard-coded to `cua-linux`;
  3. the GCE box provisioned for the browser lanes: Chrome and cua's extension in a harness-owned profile bound as `repl-parity prepare` requires, with its preparation and cleanup written in the evidence README;
  4. `scripts/sandbox-probe/tz-probe.mjs`, parameterized by launcher (the signed CLI's `codex sandbox`, or `src/sandbox` from M1) and role, as acceptance 13 describes. It replaces the history-hang probe (`docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/sandbox-tz-probe.sh`), which hard-codes the installed CLI.
- **Baselines and controls**, before any production change, committed under `docs/evidence/2026-10-17-own-sandbox/m0/`:
  - native-baseline for the three configurations of acceptance 11;
  - tz-probe's baseline rate under the signed CLI;
  - vendor-host parity control runs on the GCE box (`--host vendor --suite all`), retained for M3 and M4;
  - a run of `scripts/accept-native.mjs --live-secrets --live-textedit` on main on the mini, recording which items main itself reports BLOCKED.

**Touches:** `scripts/sandbox-golden/`, `scripts/sandbox-probe/`, `scripts/native-baseline.mjs` and `scripts/native-baseline/`, `scripts/repl-parity.mjs` and `scripts/repl-parity/` (device declaration, native lane), `test/fixtures/sandbox/`, `docs/evidence/2026-10-17-own-sandbox/m0/`, this spec's Surprises & Discoveries.

**Does not touch:** any production code under `src/`, the pins, install or doctor.

**Proves:**
- the four verdicts, each recorded in Surprises & Discoveries with its promote-or-discard reading;
- the fixtures and captures exist for M1;
- the baselines exist for M4.

If experiment A or the replay shows something this design did not foresee (the helper needs auth, the public build differs from the signed one), the session stops and reports to the owner before M1.

### M1 — Policy model, deny list, seatbelt port; cua's own host on macOS

What exists at the end: on macOS, every own-host session (browser-only) runs its kernel and worker under cua's own seatbelt profiles, with the kernel denied the deny list; no `codex` process is involved.

**Touches:**
- new `src/sandbox/` (`policy.mjs`, `seatbelt.mjs`, `env.mjs`, `seatbelt/*.sbpl`, `LICENSE`, `NOTICE`);
- `src/runtime/launch.mjs`: the deny list, `CUA_SANDBOX_DENY_READ`, the per-session TMPDIR (both hosts), `src/sandbox/` added to the trusted code paths of both hosts (it runs outside the sandbox from M1, so the preflight must refuse a write root containing or inside it), and the own host on macOS no longer getting CODEX_CLI_PATH or CODEX_HOME. The own host on Linux keeps both until M3, since it still launches through the Codex CLI;
- `src/runtime/sandbox.mjs`: the deny list in `protectedPaths` with the own-run-directory exception;
- `src/repl-host/supervisor.mjs`: `childLaunch` by role, the launch key, `NO_SANDBOX_SENTENCE`, the advertisement;
- `src/repl-host/kernel-child.mjs`: header, `kernel_pid`;
- their tests.

**Decisions here:**
- The cfprefsd measurement (Design, "Policy"): run the #116 `cells` and `services` suites on the mini under the new kernel profile with `log stream --predicate 'sender == "Sandbox"'` captured, and diff the denials against a run under today's profile. Keep the original's semantics if nothing new fails; otherwise add the preferences policy to the kernel profile as a deviation, logged.
- The home's nesting on macOS: the golden fixture from M0 and the fingerprint under cua's launcher decide whether it is expressible. If it is not, the fallback in Design, "Policy" applies.

**Does not touch:** the vendor host's launch, which keeps the Codex CLI until M2. Linux: the own host on Linux keeps the Codex CLI until M3. `childLaunch` routes Linux through the old path, and `sandboxPolicy`/`sandboxArgs` and the Linux CODEX_CLI_PATH stay until M3 removes their last consumer. The pins.

Before its PR merges, M1 runs a Linux regression on the GCE box. A scoped own-host session there still launches through the Codex CLI with the per-session TMPDIR, and the #116 confinement cases pass. The same check gates M2.

**Proves:**
- acceptance 1 (macOS own host), 2, 3, 4 (item 7), 5, 8 (port vs fixtures, argv capture, fingerprint under cua's launcher), 9 (own-host cases), 12 (own host on the mini);
- unit tests pin: role profiles for each mode; the deny list's resolution with secrets on and off; creation and realish of deny targets; refusal on overlap except the own run directory; the launch key equal for both roles; `env.mjs`'s stripped and added names.

### M2 — Compat executable for the macOS vendor host; CodexCLI.app leaves the macOS pin

Starts after #79 is in main.

What exists at the end: macOS computer sessions run node_repl with CODEX_CLI_PATH naming `bin/cua-codex-compat`. Their children are confined by cua's profiles, with the role split by script basename. The native helper's policy read is answered by the compat app-server. CodexCLI.app is no longer in the darwin pin, placed by install or checked by doctor.

**Touches:**
- `bin/cua-codex-compat`, `src/sandbox/codex-compat.mjs`, `src/sandbox/app-server.mjs`, `src/sandbox/app-server-responses.json`;
- `src/runtime/launch.mjs`: the vendor host's CODEX_CLI_PATH and CUA_COMPAT_NODE, the preflight, and `bin/` among the trusted paths. `src/sandbox/` is there since M1. `sandboxPolicy`/`sandboxArgs` stay for the Linux own host until M3;
- `runtime/releases/*-darwin-arm64.json`, `src/runtime/manifest.mjs`, `src/runtime/install.mjs`, `src/runtime/checks.mjs`, `src/runtime/doctor.mjs` (`sandbox.launcher`), the test fixtures that model the runtime tree (`test/fixtures/runtime-fixture.mjs` and the installed-home fixture).

**Decisions here:**
- The compat TOML subset: inline tables of string keys to a string or an inline table, as `sandboxArgs` renders and node_repl emits (`shim.log`), nothing else.
- `process.execve` failure exits 1 with a sentence.
- The app-server reads lines until EOF and answers each request in order.

**Does not touch:** Linux pins or the Linux host; CODEX_HOME's contents (M4).

**Proves:**
- acceptance 1 (macOS), 2 to 5 on the vendor host (including the script directory), 6, 9 (compat cases and `no-unsandboxed-fallback` on the vendor host), 10 (macOS), 12 (vendor host computer on the mini);
- unit tests pin: the exact template accepted, each deviation refused with exit 1; role by basename; missing deny list refused; the app-server's three answers, unknown method `-32601`, notifications ignored, EOF exit.

### M3 — Linux helper; cua's own host on Linux; confined computer default; vendor host retired

What exists at the end:
- a release asset of codex-linux-sandbox for both architectures, built and attested in GitHub Actions and pinned in the repo;
- Linux sessions run their children under it with role profiles;
- Linux computer sessions default to `scoped` with the confined kernel and the network-enabled worker, or the contingency the M0 verdict selected;
- `CUA_REPL_HOST=vendor` is refused on Linux;
- `codex` is gone from the Linux pins.

**Touches:**
- `.github/workflows/linux-sandbox-helper.yml`, `runtime/sandbox/linux-sandbox.json`;
- `src/sandbox/linux.mjs`;
- `src/runtime/install.mjs` and `src/runtime/layout.mjs` (`$CUA_HOME/sandbox/`), `src/runtime/doctor.mjs`;
- `src/runtime/sandbox.mjs` (`defaultSandboxMode`, `assertSandboxConfines` and its wording; retire `sandboxPolicy`/`sandboxArgs` and stop setting CODEX_CLI_PATH and CODEX_HOME for the own host, their last consumers gone);
- `src/runtime/launch.mjs` (`replHostFor` on Linux);
- `src/repl-host/supervisor.mjs` (the Linux path);
- the Linux pins, `src/runtime/manifest.mjs` `LINUX_LAYOUT_KEYS`;
- if the M0 verdict requires it: the supervisor-side app launch (`src/repl-host/launch-services.mjs` gains a Linux action), or the worker's unconfined branch for Linux computer sessions.

**Decisions here:**
- The upstream commit, per the Design; its CLI and JSON contract re-read and recorded in Surprises & Discoveries.
- The release tag naming: `linux-sandbox-<upstreamTag>`.
- Install's fetch: Node's `fetch` with the pinned URL. The pin's SHA-256 is the trust root; the attestation is recorded and checked with `gh attestation verify` in M3's evidence, not at install time.
- The home's nesting on Linux: decided by M0's mount-order verdict, with the same fallback.

**Does not touch:** macOS behaviour.

**Proves:**
- acceptance 1 (Linux), 2 to 5 on Linux, 7, 8 (Linux probe), 9 (helper cases), 10 (Linux), 12 (Linux);
- unit tests pin: the helper argv and profile JSON for each role and mode; hash mismatch refusal; the vendor host refused on Linux; the computer default.

### M4 — #138, CODEX_HOME, documentation, final acceptance and release

What exists at the end:
- the #138 verdict applied;
- CODEX_HOME narrowed to the macOS vendor host and its Codex CLI leftovers removed by install;
- README and both specs revised;
- the acceptance section executed on both platforms with evidence;
- latency compared;
- the plugin released one minor up;
- #115 and #135 closed.

**Touches:**
- `src/sandbox/seatbelt.mjs` (the notification_center line);
- `src/runtime/install.mjs` and `src/runtime/doctor.mjs` (cleanup and its report);
- `README.md`;
- `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` and `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md` (Decision Log entries; "Kernel and sandbox" revised to point here);
- `.claude-plugin/plugin.json`, `package.json`;
- `docs/evidence/2026-10-17-own-sandbox/`.

**Proves:**
- acceptance 1 to 14 as written, with the full test suite;
- Outcomes & Retrospective written after the whole-branch review.

## Concrete Steps

Working directory `/Users/new/Developer/GitHub/cua-wt-115` unless stated. `$E` is `docs/evidence/2026-10-17-own-sandbox`.

Gates before every PR:

```
HOME=$(mktemp -d) npm test          # expect: all suites pass, 0 failures
npm run test:mods                   # expect: pass
claude plugin validate .            # expect: exit 0
```

**M0 on the mini** (the experiment and the golden generator build in a scratch directory, never the resident checkout):

```
ssh mini 'mkdir -p ~/cua-115 && cd ~/cua-115 && git clone --shared ~/Developer/GitHub/cua repo && git -C repo fetch origin feat/115-own-sandbox && git -C repo checkout FETCH_HEAD'
ssh mini 'cd ~/cua-115 && git clone --filter=blob:none https://github.com/openai/codex upstream && git -C upstream checkout ff6aec96948b70d94983af2641a6b67c94faeff5'
ssh mini 'cd ~/cua-115/upstream/codex-rs && cargo build --release -p codex-cli'          # experiment A
ssh mini 'cd ~/cua-115/repo && scripts/sandbox-golden/generate.sh ~/cua-115/upstream'    # writes test/fixtures/sandbox/seatbelt/*.json
ssh mini 'cd ~/cua-115/repo && xcrun clang -O2 -o /tmp/cua-fp scripts/sandbox-probe/fingerprint.c && xcrun clang -O2 -o /tmp/cua-cap scripts/sandbox-probe/capture-argv.c'
```

**Baselines** (`scripts/native-baseline.mjs` drives a session on a device; M0 writes `$E/m0/…`, M4 repeats each into `$E/m4/…` with the same arguments):

```
node scripts/native-baseline.mjs prepare --device mini --commit <reviewed SHA>
node scripts/native-baseline.mjs run --device mini --experiment 115-m0 --host vendor --out "$E/m0/mini-vendor-computer/run-1"                     # run-1..3
node scripts/native-baseline.mjs run --device mini --experiment 115-m0 --host cua --surfaces browser --out "$E/m0/mini-cua-browser/run-1"         # run-1..3; --surfaces added in M0
node scripts/native-baseline.mjs prepare --device cua-gce --commit <reviewed SHA>
node scripts/native-baseline.mjs run --device cua-gce --experiment 115-m0 --host cua --display :0 --out "$E/m0/gce-cua-computer/run-1"           # run-1..3
node scripts/native-baseline.mjs compare --same-host "$E/m0/<config>" "$E/m4/<config>"   # expect: every judged row within the limit; the permitted differences listed
```

**Parity** (repeat per milestone into `$E/<m>/`; `prepare` binds the harness-owned browser profile on the device):

```
node scripts/repl-parity.mjs prepare --device mini --commit <SHA> --profile <harness profile>
node scripts/repl-parity.mjs run --device mini --host vendor --suite all --out "$E/<m>/mini-vendor"
node scripts/repl-parity.mjs run --device mini --host cua --suite all --out "$E/<m>/mini-cua"
node scripts/repl-parity.mjs diff "$E/<m>/mini-vendor" "$E/<m>/mini-cua" --expected test/repl-parity/expected-differences.json
# expect: "unexpected": [] in the diff's JSON
node scripts/repl-parity.mjs prepare --device cua-gce --commit <SHA> --profile <harness profile>
node scripts/repl-parity.mjs run --device cua-gce --host vendor --suite all --out "$E/m0/gce-vendor-control"     # M0 only: the retained control
node scripts/repl-parity.mjs run --device cua-gce --host cua --suite all --out "$E/<m>/gce-cua"
node scripts/repl-parity.mjs diff "$E/m0/gce-vendor-control" "$E/<m>/gce-cua" --expected test/repl-parity/expected-differences.json
node scripts/repl-parity.mjs cleanup-prepared --device <device>
```

**Native acceptance.** The runners execute on the device against an installed runtime in a scratch `CUA_HOME`, as their headers say. M1 to M3 add the new items to `scripts/accept-native.mjs` and `scripts/accept/linux-native.mjs`. `--live-textedit` types into the runner's own TextEdit document on the mini, a harness-owned target as in the native baseline; no other window receives input.

```
# on the mini, in a scratch clone at the milestone's SHA
export CUA_HOME="$(mktemp -d /tmp/cua-accept.XXXXXX)"
node bin/cua.mjs install --archive <pinned ChatGPT zip>
node scripts/accept-native.mjs --live-secrets --live-textedit --report "$CUA_HOME/acceptance.json"
#   expect: every #115 item PASS (deny, link, network, script directory, compat route);
#   every other item PASS or BLOCKED exactly as in M0's run on main (item 9's clean-machine and TCC gates stay BLOCKED)
node bin/cua.mjs doctor          # expect: sandbox.launcher pass; no Codex CLI rows
# on the GCE box, in the X session's environment
node scripts/accept/linux-native.mjs     # expect: exit 0, every step pass, the kernel confined
node scripts/sandbox-probe/tz-probe.mjs --launcher cua --role kernel --runs 80 --bound-ms 10000   # mini, M4; also --role worker, and with --no-notification-center
```

**Helper release** (M3):

```
gh workflow run linux-sandbox-helper.yml -f upstream_commit=<sha> -f upstream_tag=<tag>
gh run watch <run-id>
gh attestation verify <asset> --repo SSFSKIM/cua     # expect: verification succeeded
```

## Interfaces and Dependencies

Node built-ins only (`node:fs`, `node:path`, `node:child_process`, `process.execve`). The own host needs Node 24 or later (already its floor), and the compat executable runs on the vendor's Node 24.21.0.

In `src/sandbox/policy.mjs`:

```js
// The roles a child can have.
export const ROLES = ['kernel', 'worker'];

// The deny list buildLaunch resolves, as passed in CUA_SANDBOX_DENY_READ:
// {deny: absolute paths (store, symlinked tier targets, ~/.config/cua, the cua home), reexpose: absolute paths (runtimes/, node/, the launch's run directory)}.
export function denyListFor({home, env, secretsDir, secretsProjectDir, sessionId}) /* -> {deny: string[], reexpose: string[]} */;

// Creates each deny target that does not exist (0700, idempotent) and returns the list with real paths; throws SandboxStateError when one cannot be created.
export function prepareDenyTargets(list) /* -> {deny: string[], reexpose: string[]} */;

// One child's permission profile for a call's sandbox state; null for disabled.
// state: the sandbox-state value or undefined (default mode); role: 'kernel' | 'worker';
// readPaths: absolute paths both roles read; denyRead: prepareDenyTargets' result (kernel only; re-exposed paths become read entries, the run directory stays the write root); network: 'restricted' | 'enabled'.
export function roleProfile({state, role, readPaths, denyRead, network}) /* -> {profile, cwd} | null */;

// The launch key: equal for both roles under the same state (see Design, "The own host launches through it directly").
export function stateKey({state, readPaths}) /* -> string */;
```

In `src/sandbox/seatbelt.mjs`:

```js
// The sandbox-exec invocation for `command` ([file, ...args]) under `profile` in `cwd`.
// fs: the filesystem seam (lstat, realpath, existsSync, readFileSync) for fixtures.
export function seatbeltCommand({profile, cwd, command, fs}) /* -> {file: '/usr/bin/sandbox-exec', args: string[]} */;
```

In `src/sandbox/linux.mjs`:

```js
export function linuxHelper({home, arch}) /* -> {path, sha256} ; throws CuaError('sandbox_unavailable') when missing or mismatched */;
export function linuxCommand({profile, cwd, command, helper}) /* -> {file, args} */;
```

In `src/sandbox/env.mjs`:

```js
export const STRIPPED_ENV = [/* the original's non-inheritable names + CODEX_GUARDIAN_DECISIONS_API_KEY */];
export function sandboxedEnv(env, {platform, network}) /* -> env */;
```

In `src/sandbox/index.mjs` (what `supervisor.mjs` and `codex-compat.mjs` call):

```js
// -> {command, args, env, cwd} ready to spawn (own host) or execve (compat); throws SandboxStateError or CuaError.
export function sandboxedLaunch({platform, state, role, command, env, cwd, readPaths, denyRead, network, home, arch}) /* -> object */;
```

`src/sandbox/codex-compat.mjs` exports `main(argv, env, io)` for tests and runs it when executed. `src/sandbox/app-server.mjs` exports `serveAppServer({input, output, responses})`, which resolves on EOF.

Environment names introduced:

- `CUA_SANDBOX_DENY_READ`: JSON `{deny, reexpose}` of absolute paths, set by `buildLaunch` for both hosts.
- `TMPDIR`: now always `run/<sessionId>/tmp` (0700), set by `buildLaunch` for both hosts, never the caller's.
- `CUA_COMPAT_NODE`: absolute path of the Node the compat executable runs on, set for vendor-host launches.

Pin file `runtime/sandbox/linux-sandbox.json`, as in the Design.

Dependencies on other work: #79 merged before M2. #117 retires the compat executable and CODEX_HOME. #120 is unaffected; the port is Apache-licensed source used under its licence.

## Surprises & Discoveries

- Observation: the macOS native helper needs a working `$CODEX_CLI_PATH app-server`; a sandbox-only launcher breaks every native call.
  Evidence: R/spike-helper/REPORT.md, phase 2: `Computer Use server error -10005: codex app-server exited before returning a response` on all four calls, app-server retried per call.
- Observation: node_repl runs its children unconfined when CODEX_CLI_PATH is unset.
  Evidence: R/spike-helper/REPORT.md, phase 3, surprise 1: kernel and worker were direct children of node_repl with no sandbox wrapper.
- Observation: the vendor host's scripts live in a random directory under the scoped TMPDIR write root, protected only by the original's nested-entry exclusion.
  Evidence: R/spike-helper/shim.log (`.tmpXXXXXX/kernel.js` passed as a read entry); `U@ff6aec96:protocol/src/permissions.rs:1696-1745`.
- Observation: a path-based read deny is bypassable by hard link under an allow-default profile, and holds under the original's deny-default base.
  Evidence: R/critique-final.md item 6 (toy `sandbox-exec` profiles on macOS: `ln` succeeds and reads under `(allow default)`; `ln` and `cp -c` fail EPERM under deny-default).
- Observation: there is no way to print the signed CLI's generated profile; RUST_LOG yields nothing on this path.
  Evidence: R/A §6.
- Observation: the original's Linux seccomp denies `connect` on every socket family under a restricted network, and there is no selective Unix-socket grant on Linux.
  Evidence: R/B §2, §6 (`U@ff6aec96:linux-sandbox/src/landlock.rs:187-297`).

## Decision Log

- Decision: verification for this spec and its branch. One independent spec review by `doperpowers:adversarial-reviewer` (the design is technical and security-sensitive), and in the same round a buildability review of the execution section by `doperpowers:adversarial-reviewer` (five milestones). Each milestone PR is reviewed at `doperpowers:reviewer-high` on its whole diff. A final whole-branch `doperpowers:reviewer-high` review covers the M4 PR with the acceptance evidence.
  Rationale: a sandbox replacement fails silently when wrong; every milestone changes what confines model code, so each gets the frontier rung, not only the last.
  Date/Author: 2026-10-17, design session.

- Decision: spec review round 1 (2026-10-17). Both reviews were adopted in full.
  - **Design review.** The deny list now covers cua's whole home with `runtimes/`, `node/` and the own run directory re-exposed. It had named only `state/` and other run directories, and so missed the device enrolment in `$CUA_HOME/remote` and the Chrome registration. Real-path targets of symlinked secret tiers are denied. TMPDIR becomes per-session, because the shared macOS TMPDIR let one session's kernel write another session's vendor scripts.
  - **Buildability review.** The Linux own host keeps the Codex CLI and `sandboxPolicy`/`sandboxArgs` until M3, with a Linux regression gating M1 and M2. `src/sandbox/` is protected from M1. M0 adds the same-host latency comparison, the browser cold-row mode, the GCE device and browser profile for parity, retained Linux vendor controls and the parameterized time-zone probe. Parity and acceptance commands are corrected to the scripts' real interfaces.
  Rationale: the home-wide deny implements the owner's ruling, that model cells do not read cua's private state, without a list that misses the next private file. Per-session TMPDIR closes a cross-session write the per-profile carve-out cannot.
  Date/Author: 2026-10-17, design session.

## Outcomes & Retrospective

Pending — written at finish.
