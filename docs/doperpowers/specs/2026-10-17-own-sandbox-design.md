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
- [x] (2026-10-17) Independent spec review (adversarial-reviewer) and execution-section buildability review: three rounds each, findings folded (Decision Log), both approve at 63d47d7.
- [x] (2026-10-17) M0 — Oracles, probes and baselines (tasks M0a, M0b, M0c reviewed clean; PR #153 reviewed at reviewer-high, its findings fixed). The residue's vendor, browser and tz runs completed 2026-10-17 15:05Z (branch feat/115-own-sandbox-m0-residue); its accept-native runs in M1's window. Verdicts: experiment A equal (promote), argv capture byte-equal, app-server replay accepted with no extra method, fingerprints equal, macOS nesting holds; Linux: app launch selects the supervisor-side launch, nesting selects the per-directory deny with `run/`. Baselines in: the GCE own-host computer triple, the GCE vendor parity control (492/493, the #135 defect recorded), the scratch-HOME tz control (0/160).
  - **M0 residue, held by the mini's native-run hold and run in the next cleared window, before M1's live acceptance and before M2 or M4 depend on them** (`node scripts/mini-rules.mjs <item>`, with the harness clone prepared at 90cbfe0, M0's merge, never a later main: these runs measure the pre-M1 launcher and TMPDIR; in order): `vendor` (the vendor computer triple, retaken whole with per-run TMPDIR), `browser` (the own-host browser-only triple), `tz-real-home` (the tz baseline under the real HOME), `accept` (accept-native at main 94366c1, only on the dispatching session's separate go).
- [x] (2026-10-18) M1 — Policy model, deny list, seatbelt port; cua's own host on macOS (task 4 reviewed clean; PR #156 reviewed at reviewer-high, correct after one fix round; the mini's acceptance at code f8019bf: tier-check, oracles, own-sandbox 76/76, cfprefs, parity 479/479 with no undeclared difference, accept-native item 11 76/76, probe-secrets standalone).
- [x] (2026-10-18) M2 — Compatibility executable for the macOS vendor host; CodexCLI.app leaves the macOS pin (task 5 reviewed clean; PR #158 at reviewer-high, product confirmed, harness fixes; mini acceptance at code 249a2a9: env probe, helper check, parity 479/479 with no undeclared difference, vendor own-sandbox 86/86, accept-native items 11/12/13).
- [x] (2026-10-18) M3 — Linux helper (built, attested, released), cua's own host on Linux, confined Linux computer default, Linux vendor host retired; `codex` leaves the Linux pins. Task 6 was reviewed clean after one fix round, which closed the launch_app write-root and helper-mode gaps; Linux `default` mode now denies `run/`. PR #160 at reviewer-high: no material findings. Release `linux-sandbox-rust-v0.163.0`, tag target da0c530, attested by run 39110168611. On GCE at code fedc016: own-sandbox 82/82, linux-native PASS, helper comparison equal, x64 smoke. Full parity at bf7739f: 493 cases, diff ok with no difference beyond the declared transition and #135. Merged with a merge commit.
- [x] (2026-10-18) M4 — #138 measured change, CODEX_HOME narrowing and cleanup, documentation, final acceptance and latency, plugin release. Task 7 was reviewed clean after four rounds. The prune became explicit, the sweep guards its parents, and tombstones and unreadable paths are reported. PR #161 at reviewer-high: correct after one fix round (skipped links reported; acceptance recipe). The frontmost key guard was reviewed clean. Mini group A at 7b87873/a920e2f and group B at 8782604, all pass: parity 479/479 with 0 undeclared differences; latency within the limit, with the vendor cold.hit row ruled. GCE at 7b87873: items 1, 2-5, 7 and 10 pass; Linux latency ruled. The #138 line ships off, and the owner's sitting was skipped, both by ruling. Plugin 0.15.0.

## Scope, inheritance and evidence

Child 2, board #115, of composite #114 (recorded on the board; no checked-in parent spec). The parent contract is full independence from OpenAI with no capability or performance regression and an unchanged model-facing API. Siblings:

- #113 own browser service (landed);
- #116 own REPL host (landed; its spec `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md` section "Kernel and sandbox" is what this work replaces);
- #117 native engine (paused);
- #120 clean-room rewrite (not current work).

#79 (removing the ChatGPT extension route, the vendor browser service and `cua login`) ran ahead of this ticket and landed in main on 2026-10-17 (PR #152, merge 94366c1, plugin 0.13.0). It was the prerequisite of M2.

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

Its `sandboxPolicy`/`sandboxArgs` pair renders the Codex CLI's argv. It is retired platform by platform:
- **M1:** the macOS own host switches to `src/sandbox`.
- **M2:** the macOS vendor host switches, through the compat executable.
- **M3:** the Linux own host, the last consumer, switches, and the pair is deleted.

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
- on Linux, the pinned helper's version directory `sandbox/<upstreamTag>/` (read). The helper enters bubblewrap and re-executes itself from `current_exe()` inside the restricted filesystem (`U@ff6aec96:linux-sandbox/src/linux_run_main.rs:295-347,1539-1560`; confirmed again at the M3 commit), so the kernel's own launch needs it readable;
- the launch's own run directory `run/<sessionId>` (the scoped write root) and its selected session temp (below), both writable.

`buildLaunch` passes the list to the own host as `CUA_SANDBOX_DENY_READ`, JSON `{"deny": [absolute paths], "reexpose": [absolute paths], "metadataOnly": [absolute paths], "tiers": [absolute paths]}` (`tiers`: the deny entries that are discovered secret tiers, which Linux creates leaf-only; `metadataOnly`: the denied ancestors whose metadata alone the kernel may read, Decision Log "the metadata grant on denied ancestors"; empty on Linux), and to the vendor host's compat executable through the session's compat settings file (Design, "The compat executable"), because node_repl does not pass it to the kernel's launcher. A non-disabled launch without a well-formed value is refused (`sandbox_state_invalid`). The kernel role applies it and the worker role ignores it; one rule governs refusal for both.

**A per-session TMPDIR.** `buildLaunch` selects one session temp directory per launch, records it in the launch (`sessionTmp`), creates it with mode 0700 and sets `TMPDIR` to it for both hosts. It no longer copies the caller's TMPDIR. The selected path is `run/<sessionId>/tmp`, unless M2's helper check moves the vendor host's to `$CUA_HOME/tmp/<sessionId>` (M2). Launch construction, the policy's re-exposure, the preflight's exception and cleanup all read the one recorded `sessionTmp`. Two reasons:

- On macOS the caller's TMPDIR is shared by every session of the account. node_repl writes each session's `kernel.js` and `trusted-worker.js` into a `.tmpXXXXXX` directory there (R/spike-helper/shim.log). Each profile protects only its own session's script directory, so a scoped kernel in one session could overwrite another session's `trusted-worker.js` before that session's worker starts, and run as a secret-reading worker.
- With TMPDIR inside the run directory, every write root a kernel has lies inside its own run directory, and every other session's run directory is denied.

The `tmpdir` write grant then names a directory nobody else uses. `os.tmpdir()` in a cell returns it. It is removed with the run directory when the connection ends.

Before any profile is rendered, every deny target is emitted at its real path (`realish`, `src/runtime/sandbox.mjs`: a missing tail is kept as spelled under its nearest existing ancestor's real path). On Linux each deny target that does not exist is then created as a directory with mode 0700 (idempotent): cua's fixed targets (the store root, `~/.config/cua`, the cua home) with parents created only inside HOME, and an external dangling tier target as its leaf only, when its parent exists; anything else refuses. On macOS nothing is created (Decision Log, 2026-10-17, "deny targets are created on Linux only"). Every deny target is a directory by construction, and an existing target is left as it is. The reasons are two original behaviours:

- **Linux**: the original emits no mask for an unreadable root that does not exist (`U@ff6aec96:linux-sandbox/src/bwrap.rs:1320-1352`), and `--ro-bind / /` is a live view. A store created mid-session would be readable by the running kernel.
- **macOS**: the original falls back to the logical path when canonicalization fails (`U@ff6aec96:sandboxing/src/seatbelt.rs:217-231`), which a symlinked ancestor defeats. cua's port does not: `realish` resolves the missing tail under its nearest existing ancestor's real path, so the deny matches the path when it appears later, and nothing needs creating.

A target that cannot be created refuses the launch. This is cheap and closes both.

The deny entries join the scoped preflight's protected paths (`protectedPaths`), so a write root overlapping a deny target is refused at launch. The one exception is the launch's own run directory and its selected session temp: under the most-specific rule, a write entry nested inside a deny entry makes that subtree readable again, and that is intended only for `run/<sessionId>` and `sessionTmp`. Every other session's are denied. Whether the original renders "deny the home, read `runtimes/` and `node/`, write `run/<id>`" as intended is checked on both OSes:

- macOS: an explicit `deny` rule would override the later `allow`. Checked with the golden fixture in M0, and in M1.
- Linux: the mount order for re-exposed binds inside a mask (`U:linux-sandbox/src/bwrap.rs:613-646`, at the M3 commit). Probed in M0.

If an OS cannot express the nesting, the home entry on that OS falls back to denying its private directories one by one: `state/`, `remote/` and `chrome/`. The fallback denies directories only. `profiles.json` and `current.json` hold no secret, and an absent `profiles.json` must stay creatable as a file (`src/profiles/registry.mjs` reads ENOENT as an empty registry), so creating a placeholder would break it. Other sessions' run directories then stay readable on that OS. Both facts are recorded in the Decision Log and reported to the owner. The secret store and `~/.config/cua` entries do not depend on nesting.

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

CODEX_CLI_PATH names `bin/cua-codex-compat`, by its real path in cua's checkout. It is a POSIX sh script that execs a Node on `src/sandbox/codex-compat.mjs`: the vendor runtime's pinned Node (24.21.0, which has `process.execve`). The script refuses unless that path is absolute and executable.

**How the compat receives its per-launch settings.** node_repl spawns the kernel's launcher with a filtered environment (CODEX_HOME, HOME, PATH, TMPDIR, LANG and node_repl's own settings; Surprises & Discoveries), so nothing `buildLaunch` adds to the environment reaches the kernel's `sandbox` call. The settings travel in a file instead:

- **One computation.** `buildLaunch`, through `src/sandbox`, computes the session's settings once and writes them for vendor-host launches: `$CUA_HOME/state/compat/<sessionId>.json` (`{denyRead: {deny, reexpose, metadataOnly, tiers}, sessionTmp, home}`) and `$CUA_HOME/state/compat/<sessionId>.node` (one line, the Node path, which the sh script must read before any JSON can be parsed). Both are written with mode 0600 in a 0700 directory and removed at session cleanup, on the same lifecycle as the recorded `sessionTmp`. The compat only reads them; it never derives a policy itself.
- **Locating them.** The compat takes the session id from TMPDIR (the recorded `sessionTmp`: `<home>/run/<id>/tmp`, or `<home>/tmp/<id>` if M2's helper check moves it) and the state directory from CODEX_HOME (`dirname` is `<home>/state`). Both must name the same `<home>`, and the file's `home` and `sessionTmp` must equal them. A mismatch, a TMPDIR of any other shape, or a missing or malformed file exits 1 with a sentence.
- **Both children read it.** The worker's launcher receives node_repl's full environment, but it reads its settings the same way as the kernel's, so both roles have one source.
- **Tamper boundary.** The files lie under `$CUA_HOME/state`, inside the denied home and never re-exposed: the kernel can neither read nor write them. The worker cannot write them either: its write roots are its run directory and `sessionTmp` (scoped) or none (default), and the preflight refuses any write root overlapping the home other than those two. M2 checks the worker's write roots against `state/compat` explicitly. The compat itself runs unconfined, as the launcher.
- **The helper's `app-server`** reads no session file. The native helper is shared across sessions and outlives the one that started it. It takes its Node from `CUA_COMPAT_NODE`, which `buildLaunch` sets for vendor-host launches and which reaches the helper's environment through `open`. The script uses `CUA_COMPAT_NODE` for `app-server` and the session's `.node` file for `sandbox`.

The compat executable runs outside any sandbox, so its code must not be writable by cells. `bin/` and `src/sandbox/` join the trusted code paths that the scoped preflight protects, for both hosts.

Subcommands:

- **`sandbox`.** It accepts exactly the recovered template: the three `-c` keys `shell_environment_policy.inherit="all"`, `default_permissions="node_repl"` and `permissions.node_repl={filesystem = {…}, network = {enabled = false}}`, then `--`, then the command. Anything else exits 1 with a sentence on stderr, including `--allow-unix-socket` (cua never sets `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS`), another key, or a malformed table; node_repl on macOS refuses the cell on a launcher failure.
  - It parses the filesystem table into the same entries `policy.mjs` takes.
  - It takes the role from the script's basename. node_repl writes its scripts into a random temp directory, so no stable path exists: `kernel.js` is the kernel, `trusted-worker.js` the worker, and anything else gets the kernel's stricter profile.
  - It reads the session's compat settings (above); a missing or malformed file, or a TMPDIR or CODEX_HOME that does not locate it, exits 1.
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
- **The macOS pin keeps its release id** (2026-10-18, Decision Log). The release id comes from the app version, platform and arch, and the archive is unchanged. An installed tree is never modified, so an existing install keeps the native helper at the same on-disk path and sees no new screen-capture prompt. Its tree keeps the now-unused CodexCLI.app (about 229 MB) until M4's cleanup. Once the pin drops CodexCLI.app, doctor and install verification stop checking it, so a user who deletes it by hand gets no failing check (M2 pins this with a test).
- **CodexCLI.app removal (M4).** `cua install` removes it only under three conditions: by its exact name inside `$CUA_HOME/runtimes/<release>/`, only when the installed pin no longer lists it, and never while a session runs from that release. Each removal is logged by name.
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
   - a missing or malformed `CUA_SANDBOX_DENY_READ`, or on the vendor host a missing or malformed compat settings file, or a TMPDIR or CODEX_HOME that does not match it;
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
    - **Each child:** a plain Node script, not cua's runtime, which would warm the zone at load. It is started under the configuration's launcher and reproduces the demonstrated trigger (`docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/README.md`): 200 `vm.createContext` calls, then its first host-local-time use (`new Date().toISOString()` on a local date, no `TZ`) about 2.5 s into the process. Each child is bounded at 15 s.
    - **Each run** is classified as completed, hung (bound reached) or launcher failure.
    - **M0** runs it under the signed CLI's scoped profile, for the baseline rate (the README recorded 10 and 5 of 40). **M4** runs it under cua's final kernel and worker profiles, without the notification_center line (the denying control) and with it.
    - **Verdict.**
      - The line is kept only if the control reproduces the hang (at least one hung run in 80) and the runs with the line show zero hangs and zero launcher failures.
      - If the control does not reproduce, the experiment is inconclusive and the line is left out.
      - Otherwise the line is removed.
      - In both of the last two cases #138 stays open with the numbers.
14. **Gates and release.**
    - `HOME=<scratch> npm test`, `npm run test:mods` and `claude plugin validate .` pass.
    - README's sandbox, CODEX_HOME, Linux and configuration text matches the behaviour.
    - The standalone spec (`docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`) and the #116 spec carry dated Decision Log entries.
    - The plugin version is the next minor after main's version at M4 (likely 0.15.0: #154, the secrets mod change, releases as 0.14.0 first).

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
- A new on-disk copy of the native helper raises a one-time screen-capture confirmation per machine (Surprises & Discoveries). M2 either keeps the helper's on-disk path stable across its macOS pin change, or records the one-time prompt as an expected effect in its acceptance notes and the plugin's release notes. On the mini, native harness runs reuse one approved scratch runtime copy (Decision Log, "native runs on the mini"). The mini's resident cua is updated only by the dispatching session, at an idle window with the owner present, never by an executor; the same holds for M4's acceptance on the mini.

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
- **Linux probes.** On the GCE box, under the vendor `codex` with `--permission-profile` network enabled and the scoped filesystem, run (a) `XShmAttach` from a client under the helper, and (b) an app launch by sky_linux from a worker-shaped sandbox. Run also the nesting check: deny the cua home, re-expose `runtimes/`, `node/` and the helper's version directory read-only, and bind `run/<id>` writable. Execute the helper from that installed location, since it re-executes itself inside the sandbox. Each yields a verdict.
- **Harness extensions**, so later milestones can measure without inventing a harness:
  1. `scripts/native-baseline.mjs`: a `--surfaces browser` mode producing the same cold rows with no native calls, and `compare --same-host <before> <after>`, which judges a run against a baseline of the same host and permits only the configuration differences acceptance 11 lists, each recorded in the result;
  2. `scripts/repl-parity.mjs`:
     - the GCE box as a declared device (ssh alias `cua-gce`; `cua-linux` stays declared but off);
     - the native lane parameterized by device instead of hard-coded to `cua-linux`;
     - host-aware preparation: `scripts/repl-parity/prepare-device.mjs` runs `profiles list` with `CUA_REPL_HOST: 'vendor'` today. On Linux it uses the own host, which stays selectable after M3, and explicit vendor selection remains only for executing M0's control runs. A test runs preparation under the post-retirement selection rules;
     - a comparator allowance for a declared configuration transition. `scripts/repl-parity/compare.mjs` hard-codes `{surfaces: ['computer'], sandbox: 'disabled'}` for both native runs and validates expected entries only as identity slots, tool-text transforms or the vendor-defect departure. A new expected-entry kind names one before/after configuration pair (native fixture `disabled` → the new Linux computer default) and the cell differences that follow from it. It has tests that accept exactly that pair and reject any unlisted change. M3 switches the fixture and its metadata;
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
- `src/runtime/launch.mjs`: the vendor host's CODEX_CLI_PATH and CUA_COMPAT_NODE, the session's compat settings files and their cleanup, the preflight, and `bin/` among the trusted paths. `src/sandbox/` is there since M1. `sandboxPolicy`/`sandboxArgs` stay for the Linux own host until M3;
- `runtime/releases/*-darwin-arm64.json`, `src/runtime/manifest.mjs`, `src/runtime/install.mjs`, `src/runtime/checks.mjs`, `src/runtime/doctor.mjs` (`sandbox.launcher`), the test fixtures that model the runtime tree (`test/fixtures/runtime-fixture.mjs` and the installed-home fixture).

**First step:** a probe on the mini, before anything is built on route (a): the filtered kernel environment that reaches `$CODEX_CLI_PATH sandbox` carries TMPDIR and CODEX_HOME exactly as `buildLaunch` set them (the spike's shim pattern, logging the values, under a scratch HOME and the native-run rules in the Decision Log). If either is absent or rewritten, the session stops and reports before building.

**Decisions here:**
- The compat TOML subset: inline tables of string keys to a string or an inline table, as `sandboxArgs` renders and node_repl emits (`shim.log`), nothing else.
- `process.execve` failure exits 1 with a sentence.
- The app-server reads lines until EOF and answers each request in order.
- The per-session TMPDIR reaches the native helper too, since `open` passes node_repl's environment. A helper started by one session can outlive it while another session still uses it. M2 checks whether the helper writes under TMPDIR (watch the directory across a session that captures screenshots).
  - If it does not, nothing changes.
  - If it does, the vendor host's `sessionTmp` becomes `$CUA_HOME/tmp/<sessionId>`. It lies inside the denied home, is re-exposed writable for its own session only, and is covered by the preflight exception through the same recorded path. It is removed when no helper started with it is alive, not at connection end.
  - M2 then adds two regression tests: one session cannot write another's `$CUA_HOME/tmp/<id>`, and the directory survives its session while its helper lives and is removed after.

**Does not touch:** Linux pins or the Linux host; CODEX_HOME's contents (M4).

**Proves:**
- acceptance 1 (macOS), 2 to 5 on the vendor host (including the script directory), 6, 9 (compat cases and `no-unsandboxed-fallback` on the vendor host), 10 (macOS), 12 (vendor host computer on the mini);
- unit tests pin: the exact template accepted, each deviation refused with exit 1; role by basename; each settings refusal (missing file, malformed file, TMPDIR outside `run/<id>/tmp` or `tmp/<id>`, TMPDIR and CODEX_HOME naming different homes, a file whose `home` or `sessionTmp` differs); the sh script's Node refusals; the files written once per launch and removed with `sessionTmp`; the app-server's three answers, unknown method `-32601`, notifications ignored, EOF exit.

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
- on the GCE box, the real bwrap launch runs the four deny-target creation cases for real (Decision Log, "deny targets are created on Linux only, and bounded there"): a missing fixed target created 0700 inside HOME; a dangling tier target created leaf-only; a tier whose parent is missing refused with the classified sentence; a fixed target whose missing parent lies outside HOME refused. Each case asserts the kernel cannot list or read the target. Until M3, Linux creation is exercised only through the platform seam;
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
- `src/runtime/install.mjs` and `src/runtime/doctor.mjs` (cleanup and its report, including the unused CodexCLI.app in installed darwin trees under the conditions in Design, "Removal, CODEX_HOME and the install");
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
node scripts/native-baseline.mjs run --device mini --experiment 115-m0 --host vendor --approved-runtime ~/cua-115/home --out "$E/m0/mini-vendor-computer/run-1"   # run-1..3; on the mini, through scripts/mini-rules.mjs (Decision Log, "native runs on the mini")
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
# expect: "ok": true and "differences": [] in the diff's JSON
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
node scripts/sandbox-probe/tz-probe.mjs --launcher cua --home real --role kernel --runs 80 --bound-ms 15000 --notification-center deny    # mini, M4: the control
node scripts/sandbox-probe/tz-probe.mjs --launcher cua --home real --role kernel --runs 80 --bound-ms 15000 --notification-center allow   # and --role worker for both
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
// {deny: absolute paths (store, symlinked tier targets, ~/.config/cua, the cua home), reexpose: absolute paths (runtimes/, node/, on Linux sandbox/<upstreamTag>/, the launch's run directory, its sessionTmp)}.
export function denyListFor({home, env, secretsDir, secretsProjectDir, sessionId, sessionTmp, platform}) /* -> {deny: string[], reexpose: string[], metadataOnly: string[], tiers: string[]} */;

// Creates each deny target that does not exist (0700, idempotent) and returns the list with real paths; throws SandboxStateError when one cannot be created.
export function prepareDenyTargets(list) /* -> {deny: string[], reexpose: string[], metadataOnly: string[], tiers: string[]}; creates targets on Linux only (Design, "Policy") */;

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

- `CUA_SANDBOX_DENY_READ`: JSON `{deny, reexpose, metadataOnly, tiers}` of absolute paths, set by `buildLaunch` for the own host on a confined connection (a `disabled` connection builds no list, M1 review); the vendor host's compat reads the same shape from its settings file.
- `TMPDIR`: the launch's selected `sessionTmp` (0700): `run/<sessionId>/tmp`, or `$CUA_HOME/tmp/<sessionId>` for the vendor host if M2's helper check requires it. It is set by `buildLaunch` for both hosts and is never the caller's.
- `CUA_COMPAT_NODE`: absolute path of the Node the compat executable's `app-server` runs on, set for vendor-host launches; it reaches the native helper. The `sandbox` subcommand takes its Node from the session's compat settings, since the kernel's launcher does not receive it.

Files introduced: `$CUA_HOME/state/compat/<sessionId>.json` and `.node`, the vendor host's per-session compat settings (Design, "The compat executable").

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
- Observation: the same-host latency comparison returns no verdict if the mini's or the MacBook controller's OS or Node version changes between M0 and M4.
  Evidence: `scripts/native-baseline/compare.mjs` same-host rule (task 2). M4 checks the versions recorded in the M0 runs before measuring; a change is a re-baseline, not a loosened rule.
- Observation: `test/deploy-cloud-vm.test.mjs` fails locally on this MacBook at base a35ccc8 (`create-hetzner.sh: line 89: printf: write error: Broken pipe`), independent of this work.
  Evidence: task 2's report, a scratch worktree at a35ccc8: 6 pass, 1 fail. CI is the gate of record for the PRs.
- Observation: node_repl spawns the kernel's `$CODEX_CLI_PATH sandbox …` with a filtered environment: CODEX_HOME, HOME, PATH, PWD, SHLVL, TMPDIR, LANG, `__CF_USER_TEXT_ENCODING`, NODE_REPL_JS_BANNER, NODE_REPL_NODE_MODULE_DIRS, NODE_REPL_TRUSTED_RPC_ENABLED, NODE_REPL_UNTRUSTED_ENV_ALLOWLIST and CUA_REPL_ENABLED_SURFACES. Nothing else `buildLaunch` sets reaches it. The worker's launcher and the native helper's `app-server` receive the full environment.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m0/experiment-a/exp-signed-vendor-scoped.json`, `slot.invocations[].envNames` (M0a, task 1).
- Observation: M0's four oracles agree. The public build at ff6aec96 equals the signed CLI in all four configurations (vendor and own host, scoped and default), and the six native calls pass under both. The argv capture caught `sandbox-exec`'s argv on the first try for both inputs, byte-equal to the golden generator's output; the child environment differs only by the CLI's arg0 PATH entry and `__CF_USER_TEXT_ENCODING`, so eslogger is not needed. The helper sends only `initialize`, `configRequirements/read` and `config/read` and accepts their replay. The fingerprint is equal under the signed and public builds in both modes. All promoted.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m0/` `experiment-a/`, `argv-capture/`, `app-server/`, `fingerprint/`.
- Observation: on macOS the original expresses the home nesting (deny the cua home; read `runtimes/` and `node/`; write `run/<id>`) as intended, so the per-directory fallback is not needed there.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m0/fingerprint/fp-golden-kernel-*.json`.
- Observation: native calls on the mini fail under a scratch HOME ("Sky Computer Use native pipe startup failed"; three runs, 07:54 to 07:56Z), and the first run under the account's real HOME (07:57:05Z) succeeded but raised a UserNotificationCenter permission dialog that only the owner can answer, which also stops the mini's CI runner. Native runs on the mini are paused until the owner answers it and the route is set.
  Evidence: task 1's report; the coordinator's record of the dialog at 07:57:14Z.
- Observation: the dialog is most likely macOS's per-app screen-capture confirmation, raised the first time a new on-disk copy of the native helper captures the screen, not by the HOME or the signature. The scratch copy and the resident one verify identically (bundle id, team, designated requirement); the dialog came within 250 ms of the copy's first ScreenCaptureKit capture, inside the Finder call; tccd's decision is not persisted, so the owner's reading of the dialog is the confirmation. Consequence: every new on-disk helper copy raises it once per machine, including a runtime that lands in a new directory after a pin change (M2).
  Evidence: task 1's report, its read-only `log show` and `codesign` analysis (07:57:13.13 to 07:57:14.186Z).
- Observation: on Linux, under the vendor `codex` 0.159.2 run as the helper from `$CUA_HOME/sandbox/<tag>/`, (a) sky_linux's own screenshots work inside the worker's shape (it does not use MIT-SHM), but MIT-SHM is broken there (`--unshare-ipc`: GTK apps die with BadAccess on `X_ShmAttach`); (b) sky_linux launches applications by fork/exec, and gedit and zenity die at start inside the worker's sandbox (MIT-SHM, a read-only dconf); (c) read entries inside a `none` directory are not re-bound, while writable ones are, so "deny the home, re-expose `runtimes/`, `node/` and `sandbox/<tag>/` read" fails (the helper cannot re-exec itself), and "deny `state/`, `remote/`, `chrome/` and `run/`, re-expose `run/<id>` and the session temp writable" holds completely. Source reading says rust-v0.163.0 builds the mounts the same way.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m0/linux-probes/README.md` (M0c, task 3).
- Observation: a second permission dialog was on the mini's screen when M0c's vendor computer native-baseline run-1 ended (10:52:28–10:53:36Z, real HOME, scratch XDG_CONFIG_HOME, the approved helper copy served in place). It was most likely not raised by this work. It was already up at 10:27:45Z, 25 minutes before run-1 and about 84 s after the tz-probe worker ended (10:26:21Z, front app then normal). It followed a burst of `kTCCServiceSystemPolicyAppDataDetailed` checks from sandboxd whose visible subjects are XProtectPluginService; the subject of the one request allowed to prompt (10:27:45.36Z) is private in the log. The owner allowed it, by hand through Screen Sharing (dismissed 10:57:49Z, confirmed to CI-opt; owner-answered, no automated input); its text was not relayed. Run-1's own `TCCAccessRequest` at 10:52:55Z is this work's (inside the run, kind unknown), and the screen captures were allowed throughout (replayd "TCC Allow" from 10:52:50Z). Run-1's idle check passed only because, with a dialog up, every macOS CI job fails within seconds and the runner reads idle. That led to the pre-run front-app check (Decision Log, "native runs on the mini").
  Evidence: task 3's report; the coordinator's and CI-opt's read-only `log show` on the mini.
- Observation: #138's hang did not reproduce in M0 under either HOME. Under the signed CLI's scoped profile, the tz probe hung 0 of 160 runs under a scratch HOME that most likely did not exist, and 0 of 80 per role (kernel and worker) under the real HOME on the mini, against 10 and 5 of 40 recorded in the history-hang sitting (`docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/README.md`). HOME is therefore not the trigger. What still differs from that sitting is the Node version (24.22 here, 24.18/24.21 there) and the machine's state. Both M0 results stand as recorded controls. M4's denying control will likely not reproduce, in which case the spec's rule leaves the notification_center line out and #138 stays open with the numbers.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m0/tz-probe/` and `tz-probe/real-home/` (M0 residue, 2026-10-17).
- Observation: the M0 tz baseline's `HOME` (`$S/home`) was never created, so its children most likely ran with a HOME that did not exist: a third HOME condition beside an empty scratch HOME and the real one. Its 0 of 160 stays a recorded control, not one side of acceptance 13's pair.
  Evidence: the M0 PR review fix report (`tz-probe.mjs` now owns HOME through `--home`).

- Observation: denying the whole cua home on macOS breaks Node. Resolving the module tree under `runtimes/` lstat()s every ancestor, and `lstat '<cuahome>'` is EPERM under the deny, so every import fails. The original renders exactly this profile and has the same defect. M0's fingerprint tested the re-exposed paths but not their ancestors, so it did not catch it.
  Evidence: M1 task 4's report (reproduced on the MacBook, macOS 26.6.2; a literal metadata grant on the ancestor makes imports work while the secret stays EPERM).
- Observation: cells have no `process` and refuse `import('node:process')`, so a confinement check reads the kernel's pid, environment and cwd through child processes. The repl-parity boundary probes relied on the caller's TMPDIR being the cells' writable temp, which the per-session TMPDIR removes; the first GCE regression stopped at `lifecycle/eof-settles-no-replay` until the boundary lanes got their own marker TMPDIR.
  Evidence: M1 task 4's report; the GCE regression (cells suite on the own host, 150/150 after the fix).

- Observation: on macOS, M1's own host refuses a confined launch with `sandbox_conflict` when the cua home, the secret store or its tiers, or `~/.config/cua` lie inside one another. repl-parity's prepared endpoints put the user HOME at `<CUA_HOME>/home`, so cfprefs' after side failed at connect in both M1 attempts. In attempt 1, at c55ba01, it read "MCP exited (1)". That was first blamed on the checkout race alone; the race was real, but this refusal was most likely the cause. Attempt 2, at 5d9bf70, kept the stderr: `CuaError sandbox_conflict: what JavaScript cells may not read overlaps: <CUA_HOME>/home/.config/<store> and <CUA_HOME>; <CUA_HOME>/home/.config/cua and <CUA_HOME>` (assertDenyListShape ← assertSandboxFits ← openConnection). The GCE cells passed because Linux denies per directory. The harness is the artefact: no production path nests these (`src/remote/job.mjs` passes CUA_HOME only, and the mini's approved home sits beside the real HOME). Every harness layout that built `<home>/home` now places HOME beside CUA_HOME.
  Behaviour change for M4's release notes and README: on macOS, a confined launch with such a nested layout now refuses. Before M1 it worked. doctor shows the hint, and the remedy is to move the layout apart or run the connection `disabled`. The plausible case is a user with a custom CUA_HOME under `~/.config`.
  Evidence: docs/evidence/2026-10-17-own-sandbox/m1/cfprefs-attempt-2/ (feat/115-own-sandbox-m1-evidence 929a912).

- Observation: the harness's Runner.Worker probe counted our own readers as CI workers. `pgrep -f actions-runner-maws/bin/Runner.Worker`, run through an ssh shell whose argv contains that pattern, excludes only itself and its ancestors, so two of our readers that overlap count each other. Over both sitting logs, 84 readings with workers=1 also carried the runner's busy flag and a non-empty queue: those were genuine CI. 5 readings with workers≥1 had busy=false and queued=0. They form 3 events (18:14:11Z, 18:34:34Z, 18:47:50Z), each coinciding to the millisecond with the in-run watcher's own reading. CI-opt's hook log shows no mac-lane job between 17:18:52Z and 18:38Z. cfprefs attempts 3 and 4 were killed on false readings, and attempt 5 paused on one. `workerProbe()` now counts only processes whose command starts with the runner's own executable path (`pgrep -x Runner.Worker` filtered by `ps -o command=`) and logs each worker's command, parent and elapsed time, never its environment.
  Evidence: the m1 and m0 sitting logs (feat/115-own-sandbox-m1-evidence, residue branch); CI-opt's hook log relayed by the dispatching session; test/mini-worker-probe.test.mjs (8bf4343).

- Observation: the mini's securityd crashed five times (10-16 06:37:19Z and 06:54:40Z; 10-17 20:05:54Z, 20:17:18Z and 20:18:13Z), each time SIGABRT from an uncaught C++ exception (std::terminate, _objc_terminate, abort; "error destroying Mutex: 16"). Each crash left the login keychain locked, and the owner's ClaudeUsage menu-bar app, polling `security find-generic-password`, then raised a SecurityAgent unlock prompt. Only the 20:05:54Z crash overlapped a run of ours (cfprefs attempt 8). Nothing of ours ran during the other four. cua's parallel `codesign --verify` (run at install, `cua use` and doctor, never at session launch) is therefore not necessary for the crash, and the records show no sign that it contributes. No product change follows.
  Evidence: docs/evidence/2026-10-17-own-sandbox/m1/cfprefs-attempt-8/STOPPED.md (feat/115-own-sandbox-m1-evidence 18c983b); the dispatching session's read of the mini's unified log.

- Observation: the cfprefs measurement on the mini (cells and services suites, 90cbfe0's profile against f8019bf's) found no preferences (cfprefsd) denial on either side, and every suite passes on both sides (cells 150/150, services 41/41). So the original's semantics are kept and the preferences policy is not added back. Two new mach-lookup denials appear on the after side: `com.apple.diagnosticd` ×391 and `com.apple.logd` ×194. The original grants these only in `seatbelt_read_only_platform_defaults.sbpl`, which `:minimal` alone includes, so the kernel's os_log messages are dropped. They are not granted: nothing fails without them, and a grant would be a widening deviation with no failure to justify it. M4's notification_center decision touches the same file and can revisit them with evidence. The judge's one undeclared cells difference (`cells/budget/suspend-resume`, warm) is an artefact of the harness pause, not of either profile. The before side was held 33.9 minutes for CI, past the runtime's 15-minute idle stop, so its response carries the runtime-restarted notice. The after side never paused. The value is equal on both sides. The result is accepted with this note, provisionally: parity's cua run covers the same cell under f8019bf's profile and closes the case if that cell runs unpaused and matches the vendor run. For M4's release notes, the logd and diagnosticd denials are a behaviour change: os_log output from kernel cells goes nowhere. A pause longer than the runtime's idle window changes a cell's output, not only its timing; this is recorded as harness debt.
  Evidence: docs/evidence/2026-10-17-own-sandbox/m1/cfprefs/ (feat/115-own-sandbox-m1-evidence f629160).

- Observation: M2's opening probe confirms route (a). On the mini, under scoped and default, node_repl's kernel and worker `sandbox` calls carried TMPDIR and CODEX_HOME exactly as `buildLaunch` set them, with no unmatched call. Under `disabled`, node_repl does not call the launcher at all (zero invocations), so a vendor-host `disabled` session never reaches the compat executable.
  Evidence: docs/evidence/2026-10-17-own-sandbox/m2/ (feat/115-own-sandbox-m2-evidence 2ea31a8), run at 475881a, 2026-10-18 05:20:25Z.
- Observation: the api-only rerun at fedc016 could not show what the fix wave's launch change did to the suites that build their own HOME. The full Linux parity at 43c543d stopped at its first case. The native-secret and live-secrets fixtures move the children's HOME into `run/<id>/home`, which puts `~/.local/share/applications` inside a write root, and fedc016's scoped preflight correctly refuses that. No real session's HOME lies in its run directory. The fixtures now keep `XDG_DATA_HOME` with the connection's HOME (bf7739f, test-only). A sweep of every HOME and `XDG_*` assignment in `test/`, `scripts/` and `bin/` found no other fixture of that shape. The full rerun at bf7739f was clean.
  Evidence: `docs/evidence/2026-10-17-own-sandbox/m3/gce-cua-43c543d-attempt-1/`, `m3/gce-cua-bf7739f/`.

- Observation (2026-10-18, after merge): the two closures of the owner's Chrome window on the mini were the owner's own clicks, not cua's. Each was an AppKit close-button click (`trackMouse send action on mouseUp`, then `windowShouldClose`) arriving through a Screen Sharing session (screensharingd forwarding pointer events), with no keyboard event, no cua session and no helper activity at that second:
  - 03:14:43.572Z, 35 s before accept-native started (03:15:18.764Z), while its gate waited on Chrome in front.
  - 15:31:52.737Z, three seconds after the Default profile's window was closed the same way and 11 minutes before group B's first vendor run (15:43:18Z), not between 15:43Z and 15:48Z as first recorded. Chrome's own session files and cua's host log (`native port closed` at 15:31:52.806Z) agree.
  - Separately, a static read of the native helper (#162) found that it posts pressKey and typeText to the bound app's pid (`SynthesizedEvent.send(to:delay:)` → `CGEventAPI.postToPid`) and activates an app only on the click path. So a session's keys cannot reach the frontmost app, and no key guard is added to cua's API layer. The harness guard (`scripts/accept/key-guard.mjs`) stays as a test-side safety check.
  - ci-kit's desktop posture read `remote=none` at 15:28:41Z and 15:32:07Z while that Screen Sharing viewer was attached and clicking, so "nobody at the mini" cannot rest on it or on HID idle alone.
  Evidence: SSFSKIM/cua#162 (the static finding and the timeline comment); the mini's unified log for Google Chrome, screensharingd and ScreensharingAgent at those seconds.

## Decision Log

- Decision: verification for this spec and its branch. One independent spec review by `doperpowers:adversarial-reviewer` (the design is technical and security-sensitive), and in the same round a buildability review of the execution section by `doperpowers:adversarial-reviewer` (five milestones). Each milestone PR is reviewed at `doperpowers:reviewer-high` on its whole diff. A final whole-branch `doperpowers:reviewer-high` review covers the M4 PR with the acceptance evidence.
  Rationale: a sandbox replacement fails silently when wrong; every milestone changes what confines model code, so each gets the frontier rung, not only the last.
  Date/Author: 2026-10-17, design session.

- Decision: spec review round 1 (2026-10-17). Both reviews were adopted in full.
  - **Design review.** The deny list now covers cua's whole home with `runtimes/`, `node/` and the own run directory re-exposed. It had named only `state/` and other run directories, and so missed the device enrolment in `$CUA_HOME/remote` and the Chrome registration. Real-path targets of symlinked secret tiers are denied. TMPDIR becomes per-session, because the shared macOS TMPDIR let one session's kernel write another session's vendor scripts.
  - **Buildability review.** The Linux own host keeps the Codex CLI and `sandboxPolicy`/`sandboxArgs` until M3, with a Linux regression gating M1 and M2. `src/sandbox/` is protected from M1. M0 adds the same-host latency comparison, the browser cold-row mode, the GCE device and browser profile for parity, retained Linux vendor controls and the parameterized time-zone probe. Parity and acceptance commands are corrected to the scripts' real interfaces.
  Rationale: the home-wide deny implements the owner's ruling, that model cells do not read cua's private state, without a list that misses the next private file. Per-session TMPDIR closes a cross-session write the per-profile carve-out cannot.
  Date/Author: 2026-10-17, design session.
- Decision: spec review round 2 (2026-10-17), adopted.
  - **Design review.** The per-entry fallback denies directories only. An absent `profiles.json` must remain creatable as a file, and it and `current.json` hold no secret. On Linux, the helper's version directory is re-exposed, because the helper re-executes itself inside its own sandbox.
  - **Buildability review.** One recorded `sessionTmp` governs launch, policy, preflight and cleanup, and the M2 contingency uses it. Parity preparation is host-aware, so Linux works after the vendor host is retired. The comparator gains an allowance for the one declared configuration transition. The tz probe reproduces the demonstrated trigger and requires the denying control to reproduce before the grant can be kept. The `sandboxPolicy`/`sandboxArgs` retirement is stated platform by platform.
  Rationale: each finding was a launch failure, a state break or an unmeasurable claim in the plan as written. None changes an owner ruling.
  Date/Author: 2026-10-17, design session.

- Decision: execution pre-flight (2026-10-17, execution session). M0 runs as three tasks of the subagent-driven loop, one PR: M0a, the mini oracles (experiment A, the golden generator and its fixtures, the argv capture, the fingerprint probe under the signed CLI and the public build, the app-server capture and replay); M0b, the harness extensions (native-baseline `--surfaces browser` and `compare --same-host`, repl-parity's GCE device, device-parameterized native lane, host-aware preparation and the transition allowance, tz-probe), local code and tests; M0c, the GCE box provisioned, the Linux probes (XShm, app launch, nesting), and the baselines and controls, which consume M0b's harness. The x64 GCE instance is created only in M3, where its smoke runs. Every other milestone is one task. M0a and M0b share no files and run concurrently, M0b in a second worktree whose branch merges into `feat/115-own-sandbox` after its review. The mini's scratch clone comes from GitHub, not the Concrete Steps' `git clone --shared` of the resident checkout, whose object store a shared clone would borrow.
  Rationale: M0 alone spans two machines, a Rust build, C probes, four harness changes and a dozen live runs; one executor for all of it would not fit one context, and M0c consumes M0b, so the frontier review falls between them. M0a's verdicts come first because a design surprise there stops the work before anything else is built.
  Date/Author: 2026-10-17, execution session.

- Decision: M0b's harness choices (2026-10-17, task 2 of the execution loop, reviewed clean).
  - `cua-gce` is a declared repl-parity device (`{platform: 'linux', captureChrome: true}`); every live lane takes any declared device of the right platform, and `prepare` lists profiles through the own host on Linux and the vendor host on macOS. The command-line selection is a pure `parseSelection(argv)`, which the device tests exercise without reaching a device.
  - The comparator's new `configuration-transition` entry kind accepts only `disabled` → `scoped` on the `native/` cases it lists, between the vendor control and the own host, with each differing cell declared field for field. The entry itself is written in M3, when its cells are known.
  - native-baseline records a launch witness on every connection (`cua/sandboxLaunch`: which launcher confined the children, read from `CODEX_CLI_PATH`, and whether TMPDIR is the session's own). M1's macOS own host leaves `CODEX_CLI_PATH` unset, so the witness reads `cua`; any later change to how the launcher is chosen keeps the witness truthful.
  - `compare --same-host` judges only `cold.miss.first_js` and `cold.hit.first_js` and permits exactly three one-way changes, each listed in its result: the launcher (`codex-cli` → `cua` or `cua-compat`), TMPDIR (`inherited` or `unset` → `session`; prepared serves start from `env -i`, so the M0 baselines record `unset`), and on Linux computer sessions the sandbox mode (`disabled` → `scoped`). It requires the default plan (`DEFAULT_PLAN`: 30 warm, 5 cold, 10 tasks) and three runs per side; anything smaller is `DIAGNOSTIC`, never PASS. It requires identical controller and device OS and Node versions.
  - `tz-probe.mjs`: the `codex` launcher renders today's own-host scoped policy and argv against the installed CLI; the `cua` launcher throws until M1 wires it to `src/sandbox`; `--notification-center allow` is refused under `codex`. Its `verdict` subcommand gives keep, remove or inconclusive only for 80 runs bounded at 15000 ms, and `diagnostic` otherwise. Since the M0 PR review it records each run's conditions (HOME class through `--home scratch|real`, Node path and version, platform, launcher identity) and refuses a control/grant pair that differs in anything but `--notification-center`; result files without those fields (schema 1, M0's scratch-HOME runs) are refused as either side and stand only as a recorded control. M1 gives the `cua` launcher its identity.
  Rationale: each is what M0c's live runs and M4's comparison consume; the review's three findings (the unset TMPDIR handoff, acceptance verdicts from diagnostic-sized samples, a unit test with a path to ssh) were fixed before the merge.
- Decision: the compat executable receives its per-launch settings through a per-session file (2026-10-17, M0a's finding, ruled by the dispatching session before M1). `buildLaunch` computes the vendor host's settings once and writes `$CUA_HOME/state/compat/<sessionId>.json` and `.node`; the compat locates them from TMPDIR (the session) and CODEX_HOME (the home), requires both to agree, and fails closed on any mismatch or a missing or malformed file; both roles read the file; the helper's `app-server` stays settings-free on `CUA_COMPAT_NODE`. Design, "The compat executable", the M2 entry, acceptance 9 and Interfaces are revised to match. M2 opens with a probe confirming that the filtered kernel environment carries TMPDIR and CODEX_HOME as `buildLaunch` set them.
  Rejected: (b) adding the two names to `NODE_REPL_UNTRUSTED_ENV_ALLOWLIST` exposes them to cells, and the vendor launcher may overwrite that list; (c) a per-session CODEX_CLI_PATH wrapper with the values baked in breaks when the shared native helper outlives the session that started it, since the helper calls it from its own environment; (d) the compat deriving the deny list itself from CUA_HOME, HOME and TMPDIR computes the policy in two places, and XDG_CONFIG_HOME is not in the kernel's environment.
  Rationale: node_repl filters the kernel launcher's environment (Surprises & Discoveries), so the design's environment route would refuse every vendor-host kernel launch. The file keeps one computation of the policy in `buildLaunch`, sits where neither child can write, and keys on values node_repl passes and no cell sets.
  Date/Author: 2026-10-17, execution session (route ruled by the dispatching session).
- Decision: native runs on the mini (2026-10-17, the dispatching session's standing rules after the 07:57Z dialog). No native run on the mini while a ci-kit macOS job is running or queued: check twice, about 45 s apart, that the runner is idle and nothing is queued. After each run, check the frontmost app (`lsappinfo`); on UserNotificationCenter, SecurityAgent or CoreServicesUIAgent, stop and report. Both pre-run readings must also find Terminal frontmost (`lsappinfo info -only name "$(lsappinfo front)"`); any other frontmost app means stop and report (added 2026-10-17 after a dialog made the runner read idle). No probe under the real HOME, or anything else that can reach a new TCC client identity or permission kind, unless the plan names it and the dispatching session has been told first. A harness-owned Chrome on the mini runs under the same idle rule and is closed afterwards. These bind M0's remaining mini items and M1 to M4.
  Rationale: a new TCC prompt is an owner-only action, and a dialog on the mini blocks the CI runner other projects use.
  Date/Author: 2026-10-17, execution session.

- Decision: M0a's oracle choices (2026-10-17, task 1 of the execution loop, reviewed clean).
  - The mini's runs use the scratch tree `~/cua-115` (a GitHub clone with the worktree's commits, the upstream checkout, and the scratch CUA_HOME `~/cua-115/home` installed from the pinned archive). It is kept for M1's fingerprint under cua's launcher and M2's probes, and deleted when #115 ends.
  - The golden generator mirrors the CLI's `-c` path into the original's policy types (not a parallel construction); its Cargo project excludes the upstream checkout and repeats upstream's patch section. Fixtures carry their filesystem setup as executable code (`scripts/sandbox-golden/fixtures.mjs`).
  - The CLI slot in experiment A is a per-run sh script with its settings baked in; a native helper counts as the run's own only when its `CODEX_CLI_PATH` is that slot, and no other helper is ever signalled.
  - The app-server audit matches sensitive keys in any spelling and keeps only four allowlisted settings by exact path and value; it withheld only the notification's `installationId`. The replay renders `${CUA_HOME}` from CODEX_HOME. `app-server.mjs reaudit` re-audits a committed capture from its raw log.
  - The fingerprint comparison keys each check by operation, filter and label and compares result and errno.
  Rationale: what M1 and M2 consume as oracles must be truthful under failure, private by construction, and never touch a process the harness did not start; the review's three findings (the audit's short-value exception, a helper adopted by a global pgrep, errno dropped from the comparison) were fixed before the merge.
  Date/Author: 2026-10-17, execution session.

- Decision: #79 is in main (2026-10-17: PR #152, merge 94366c1, plugin 0.13.0), so M2's prerequisite is met and the order M1 → M2 → M3 stands. What changed underneath this spec: `replHostFor` and `browserSelectionFor` no longer have the ChatGPT-route default or the vendor browser route, and a browser-only launch goes to the own host on Node 24 or later; `CUA_BROWSER_SERVICE` is gone from production, and the vendor browser service survives only as the test oracle `test/browser-parity/vendor-oracle.mjs` on the vendor host; the three release pins lost `chromePlugin`. CODEX_CLI_PATH, CODEX_HOME and the CodexCLI.app relocation stay for this ticket. The spec's text named none of the removed selections; the M0 branch merges main before its PR, and the harness drops anything that set or read `CUA_BROWSER_SERVICE` or the vendor browser route. Tests that drive a fake runtime pin `CUA_REPL_HOST=vendor` explicitly (main 9c45c6c), and this ticket's new tests follow that pattern. Parity on the mini (acceptance 12) compares the browser suites through whatever vendor-host oracle #79 left; M1 confirms the lanes still run before relying on them.
  Rationale: the spec cites #79's outcome; recording what it removed keeps M1 to M4 from building against a selection that no longer exists.
  Date/Author: 2026-10-17, execution session.

- Decision: the Linux probe verdicts select two of the spec's fallbacks for M3 (2026-10-17, M0c). Accepted by the dispatching session, which carries them to the owner; the app-launch branch is the owner's ruling's first branch (the supervisor-side launch before an unconfined worker), and the `run/` extension is tighter than the Design's fallback, so it needs no owner decision.
  - **App launch: contingency 1, the supervisor-side launch.** Every `launch_app` already passes through cua's `src/services/sky.mjs` as `{type: "execute", method: "launch_app"}`, so the supervisor answers it outside the sandbox with `gio launch` or `systemd-run --user` (both present on the box), as `src/repl-host/launch-services.mjs` does with `open` on macOS. The worker stays confined; contingency 2 (an unconfined worker) is not needed. XShm alone selects nothing: sky_linux's screenshots work inside.
  - **Nesting on Linux: the per-directory fallback, extended with `run/`.** The kernel's Linux deny list is `state/`, `remote/`, `chrome/` and `run/` (not the whole home), with `run/<id>` and the session temp re-exposed writable, which the probe shows the original honours. This is tighter than the Design's fallback: other sessions' run directories stay denied on Linux too. `profiles.json`, `current.json`, `staging/` and `bin/` stay readable on Linux, as the Design's fallback already accepts. The helper's version directory needs no re-exposure, because `sandbox/` is not denied. macOS keeps the whole-home deny (M0a). M3 re-probes the nesting with its own build at the chosen commit before relying on either shape.
  Rationale: the Design orders these fallbacks for exactly these verdicts; the `run/` extension keeps the cross-session property the per-session TMPDIR was introduced for, and the probe shows the original can express it.
  Date/Author: 2026-10-17, execution session.

- Decision: M0c's live-harness choices (2026-10-17, task 3 of the execution loop, reviewed clean after three fix rounds).
  - **The GCE box.** `cua-gce`, a t2a-standard-4 spot instance in europe-west4-a (Ubuntu 24.04, Xvfb, openbox, AT-SPI), desktop user `cua` (`admin` collides with Ubuntu's group), reached through an ssh alias whose ProxyCommand resolves the spot instance's changing IP. Browser lanes run there with Google's arm64 Chrome 155 deb; the harness profile's extension has "Allow access to file URLs" on, which the fixture downloads need. Stopped between milestones.
  - **Native runs on the mini reuse the approved runtime** (`native-baseline --approved-runtime ~/cua-115/home`): the one on-disk helper copy the owner allowed is served in place; `state/` and `run/` are moved aside losslessly and restored, with every move journaled and only successful moves undone. An admission file under the home admits one run at a time and every harness serve registers under it.
  - **Helper ownership is causal**: each native run gets its own TMPDIR (0700), which reaches the helper through node_repl's environment and `open`; a helper is the run's own only when its executable (from `lsof`) is exactly the approved helper's and the TMPDIR in its environment is the run's. Only TMPDIR is extracted from that environment; nothing else is logged, stored or reported, and a parse failure says only that it failed. Unproven ownership signals nothing and keeps the admission and the moved state. No process's environment is scanned globally. The approved home is reserved for the harness: a hand-started process using it only through `CUA_HOME` in its environment is not detected.
  - **The vendor computer triple is retaken whole** with per-run TMPDIR (launch witness `inherited`); the 10:52Z run-1 (witness `unset`) is kept as `m0/mini-vendor-computer-superseded/`.
  - **`scripts/mini-rules.mjs`** carries the mini's rules as tested code: GitHub run and job lists read to their totals, pgrep's status kept, any missing observation or non-Terminal frontmost app stops at once, CI activity and load wait, failures propagate, and evidence is archived only after it is verified complete and fresh by its own fields.
  - **Privacy**: the Linux probe records the app listing as a count and the two targets' booleans; the committed `probes.json` was redacted to match.
  - **Obligation for M1 and M2.** From M1, `buildLaunch` sets TMPDIR to the session's `sessionTmp`, not the caller's, so the helper no longer carries the harness's per-run TMPDIR. Before M2's native runs, the harness takes its ownership witness from the session's recorded `sessionTmp` (or an equally causal value that reaches the helper), and its tests prove it.
  Rationale: native runs on a shared Mac must never raise a new owner-only prompt, never touch a process the harness cannot prove it started, and never read what the secrets rule forbids; each review round found a case where the harness fell short of one of these, and each was fixed before the merge.
  Date/Author: 2026-10-17, execution session.

- Decision: M0's PR review (reviewer-high, 2026-10-17) found three harness defects, fixed before the merge. The Linux probe signals a launched application only when that pid's own environment carries the launch's marker (`CUA_PROBE_LAUNCH`, the only value read; unproven pids are counted, never signalled). The argv capture runs each attempt in its own process group and ends the whole tree, TERM then KILL, bounded, reaping the launcher last so its group id cannot be reused. The tz probe records the conditions of each run and its verdict compares them (the M0b entry above). None of the committed verdicts change.
  Rationale: the probes are later milestones' oracles; one could stop a process it did not start, one could leak sandboxed children on the mini, and one could attribute a HOME change to the Mach grant.
  Date/Author: 2026-10-17, execution session.

- Decision: the metadata grant on denied ancestors (2026-10-17, M1; accepted by the dispatching session as within the owner's ruling, reported to the owner as information). The macOS kernel profile keeps the whole-home deny and adds, last, `(allow file-read-metadata (literal …))` for each denied ancestor of a readable root that no readable root covers, computed from real paths: on the default layout exactly `<cuahome>` and `<cuahome>/run`. It grants stat of those two directories only; listing and contents (`file-read-data`) stay denied, and it never covers the store, `~/.config/cua`, `state/` or another session's `run/<id>`. It is the port's one widening deviation, named in its provenance header beside the others. Unit tests pin the exact grant set (symlinked home included; empty when no re-exposed root sits under a denied path), and the kernel fingerprint under cua's launcher on the mini pins metadata allowed and data denied on the two paths, both denied on another session's `run/<id>`.
  Rejected: the per-directory fallback (deny `state/`, `remote/`, `chrome/`, `run/`) hits the same ancestor lstat at `run/`; dropping `run/` from the deny list re-opens other sessions' run directories.
  Rationale: the owner's ruling denies the kernel the contents of cua's home; the stat of two literal directories whose paths a cell already knows (TMPDIR, the module paths) reveals no contents, and without it no import works.
  Date/Author: 2026-10-17, execution session (ruled by the dispatching session).
- Decision: M1's other choices (2026-10-17, task 4).
  - The port refuses a relative TMPDIR (the original ignores it), so the preflight and the port agree on the write roots. `policy.mjs` validates through `sandboxPolicy`'s rules; M3 moves that validator when it deletes `sandboxArgs`. Re-exposed paths are always read entries; write wins at equal depth, so the run directory stays writable under scoped.
  - The seatbelt route is selected by a setting (`CUA_REPL_SANDBOX_EXEC`), not the supervisor's platform, so tests drive it with doubles anywhere. `buildLaunch` stays free of side effects; `createLaunchDirs` creates the cwd and `sessionTmp` (0700), and the supervisor runs `prepareDenyTargets` at every kernel launch. The deny list is computed on every platform; its Linux shape (`state/`, `remote/`, `chrome/`, `run/`) is unused until M3.
  - Doctor: the caller's TMPDIR is no longer a write root, so the issue #36 conflict cannot occur; its row checks the session write root and the deny list, and the serve-cli #36 test now expects a home under the caller's TMPDIR to serve.
  - The kernel's exit status after SIGKILL is Node's (`exited(signal=9)`), not the Codex CLI's `exited(code=137)`. repl-parity gains a `kernel-exit-status` expected-difference kind, declared only for `cells/lifecycle/child-exit-settles` (and whether the kernel is the Node named in the stderr tail, which the pid normalizer otherwise numbers differently), retired in M2 when the vendor host's children are also Node.
  - repl-parity boundary lanes use their marker directory as the launch's TMPDIR (`CUA_PARITY_FIXTURE_TMPDIR`), because their markers must outlive a connection; the overlap preflight stages its conflict through a scratch `run/` symlinked into the modules. tz-probe's `cua` launcher never creates deny targets and refuses `allow` until M4.
  - The native-baseline ownership witness accepts a helper whose TMPDIR is a session temp of the approved home's `run/`, which discharges the M0c obligation for M2's native runs.
  - The held mini runs are one command each (`mini-rules gated`, `scripts/sandbox-probe/m1-mini.sh`, accept-native item 11).
  Rationale: each keeps the port's byte parity on everything but the named deviations and keeps the harness's witnesses truthful under the per-session TMPDIR.
  Date/Author: 2026-10-17, execution session.

- Decision: GUI-bound mini groups pause while the mac-lane runner works (2026-10-17, MAWS DL 58 from maws-fe and CI-opt, relayed by the dispatching session). MAWS children start mac-lane gates on their own schedule, so a job can start at any minute. Our GUI-bound groups on the mini watch the runner during the run: cfprefs, parity and accept-native's TextEdit sitting. When the runner turns busy or a macOS job is queued, the group pauses at the next cell boundary. It resumes after two idle readings about 45 s apart, as at the start.
  - Headless groups (tier-check, oracles, own-sandbox) need nothing.
  - Mechanism: a watcher keeps a pause file that the harness checks before each cell. Where the side under test cannot carry the hook, the group stops and reruns instead, aborting only its own process tree.
  - Each pause is recorded in the run's evidence with its start, end and reason. A paused cell's timing is excluded from any comparison.
  - The TextEdit sitting waits at a pause and never aborts, because the owner stands by.
  - CI-opt adds computer-use presence to every job's posture line, so an overlap shows in their logs.
  Rationale: the mini's macOS lane is shared, and a desktop-driving run during another project's GUI job harms both.
  Date/Author: 2026-10-17, execution session.
- Decision: the mini pause is an in-run pause, and cfprefs' two sides keep their own cells and services scratch layouts (2026-10-17, M1 harness). The repl-parity runner, which also drives the cfprefs suites, and the pause watcher run on the controller from the M1 checkout, while `--commit` selects the side under test on the mini. So both sides pause at cell boundaries. Boundary probes pause between cases. accept-native runs on the mini and reads the watcher's mirrored pause file. Every harness scratch user HOME is now its cua home's sibling (`<cua home>.home`), and the controller normalizes an older side's nested prepared endpoint. 90cbfe0's `serve-cells.mjs` and capability home still create their scratch `<home>/home` on the mini, which is harmless there because that side has no nesting refusal. So cfprefs' before and after sides keep their scratch store and `~/.config/cua` in different places, while the prepared endpoint matches.
  Rationale: cfprefs compares sandbox denials of the preference domains and their classes, which do not depend on where a scratch store lies. Retrofitting 90cbfe0's own scripts would change the measured before side.
  Date/Author: 2026-10-17, execution session.
- Decision: one load threshold for every comparative mini run (2026-10-17, the dispatching session). The mini's idle 1-minute load now sits at 2 to 3 (other sessions' work), so the residue's original bar of 2, set for M0a's cargo builds at load 16, almost never cleared. Every comparative run on the mini, M0's residue and M1's alike and later ones too, starts only at a 1-minute load under 5, beside the other pre-run checks, and records its observed load in its evidence. M4's vendor/own and before/after comparisons are read against those recorded loads. M0's vendor run-1 ran under the old bar, and its load is recorded beside run-2 and run-3. The two TextEdit-driving runs of a window (the residue's accept-native and M1's accept-native with item 11) run back to back at its end, so the owner stands by once.
  Rationale: a bar the machine's idle state cannot meet blocks the runs without protecting the measurement; recording the load keeps the spread visible to whoever judges the comparison.
  Date/Author: 2026-10-17, execution session.

- Decision: a secret store whose tiers cannot be established refuses confined launches (2026-10-17, M1 live run, reversed after review). M1's review made tier discovery fail closed. The live probe-secrets run then showed a store at mode 0000 refusing every confined session (`sandbox_state_invalid`) where before only a `{{secret:…}}` reference failed (`secret_unreadable`).
  - **First attempt, reversed; its acceptance by the dispatching session is superseded.** The execution session first let a launch proceed when the store or `projects/` was not searchable, reasoning that nothing under it was reachable, and the dispatching session accepted that. The fix review disproved it on two counts. First, with `projects/` at 0000 and a symlinked external tier, a real `sandbox-exec` kernel read that tier's sentinel through its real path: `src/secrets/store.mjs` follows an intermediate symlinked tier (`projects/<slug>` is joined; `O_NOFOLLOW` guards only the key file), so an unsearchable directory hides the target from discovery but not from a cell. Second, a project-scoped launch under the same blocked directory threw raw EACCES from `realish(secretsProjectDir)`. No owner exception was sought; the ruling stands as written.
  - **The rule now.** Scoped and default launches refuse with `sandbox_state_invalid` whenever the tier set cannot be established: any error other than ENOENT, including an unsearchable directory and an explicit project tier beneath one. The sentence names the store and the remedy (fix the permissions, or run the connection `disabled`). Disabled launches skip discovery. Two edges proceed, because there is nothing to deny: a store or `projects/` that does not exist (ENOENT), and a symlinked tier whose target does not exist (the link's path is denied, the target recorded absent or created as a deny target). The refusal names the store's role and the remedy, never a key or tier name. probe-secrets' "store unreadable" phase expects that classified refusal.
  - Also from the live run: `scripts/accept/own-sandbox.mjs` had not parsed since 6016a8a, a nested template, so accept-native crashed on load. Every acceptance script is now syntax-checked, and accept-native's imports are loaded by the unit suite. Three M0/M1 tests now hold under accept-native's `env -i` item-1 environment on the mini.
  Rationale: the owner's ruling denies the kernel the secret store, and a deny that depends on discovery is only as good as the discovery. A store with broken permissions is a misconfiguration the error names; a cell reading a tier is not recoverable.
  Date/Author: 2026-10-17, execution session.

- Decision: deny targets are created on Linux only, and bounded there (2026-10-17, M1; ruled by the dispatching session). M1 first built the Design as written: `mkdirSync(…, {recursive: true})` for every missing target on both OSes. For a dangling symlinked tier that would create a directory chain wherever the link points.
  - **macOS** creates nothing. Every missing target is denied at its `realish` path, and seatbelt matches it when it appears later, including through a symlinked `~/.config`.
  - **Linux**, where a mask is made only for a path that exists, creates cua's fixed targets (store root, `~/.config/cua`, the cua home) 0700 with parents only inside HOME. It creates an external dangling tier target as its leaf only, when its parent exists. Anything else refuses with the classified sentence.
  - Tests pin each case. M1's mini run checks that a store root missing at launch stays denied after it is created mid-session.
  Rejected: creating everywhere (the Design as first written), because on macOS it is a side effect with no purpose once `realish` handles the missing tail; and creating nothing on Linux, because the mask needs the path.
  Rationale: create only where the confinement needs it, and never outside what cua owns beyond a single leaf whose parent already exists.
  Date/Author: 2026-10-17, execution session (ruled by the dispatching session).

- Decision: the darwin pin keeps its release id across M2's change (2026-10-18, accepted by the dispatching session). The native helper then stays at the same on-disk path on every machine that already has this release, and the owner sees no new screen-capture prompt. Existing trees keep the unused CodexCLI.app until M4 removes it under the conditions in the Design.
  Rationale: a new helper copy path raises a one-time screen-capture prompt per machine (Surprises). Keeping the path avoids that cost for 229 MB of disk that M4 reclaims.
  Date/Author: 2026-10-18, execution session.

- Decision: a failed `process.execve` in the compat aborts rather than exiting 1 (2026-10-18, M2). On the vendor's Node 24.21.0 a failed `process.execve` is not catchable: it prints "process.execve failed with error code …" with a native stack and dies by SIGABRT (exit 134). Node 26 throws instead. The compat checks that `/usr/bin/sandbox-exec` is executable before calling it, so the abort is reached only if that file vanishes between the check and the call. The exit is still nonzero, and node_repl refuses the cell on a launcher failure, so the launch fails closed. The Design's "exits 1 with a sentence" holds for every refusal before the call.
  Rationale: the vendor's Node cannot report an execve failure any other way, and the pre-check makes the window negligible.
  Date/Author: 2026-10-18, execution session.

- Decision: M2's execution (2026-10-18, task 5). The compat executable takes its per-launch settings from `$CUA_HOME/state/compat/<sessionId>.{json,node}`, written and removed with the run directory by one shared module (`src/sandbox/compat-settings.mjs`). It accepts node_repl's template only in its exact order, with absolute `read` path entries, and turns node_repl's read entries into the policy's read paths (so the host read-root rule applies). The app-server echoes `jsonrpc` only when the request carried it, and sends no server notification, matching M0's capture. The compat executable's path is resolved at use, not at module load, so doctor reports a missing executable instead of failing to load. A helper counts as the run's own by its session TMPDIR, and teardown counts it stopped only once its pid is verified gone. The `kernel-exit-status` parity allowance is retired. The helper check showed the helper writes nothing under TMPDIR, so the vendor host's `sessionTmp` stays `run/<id>/tmp`.
  Rationale: each follows the Design and closes a gap the task and live reviews found.
  Date/Author: 2026-10-18, execution session.

- Decision: Linux `default` mode denies `run/` too, with the kernel's cwd moved out of it (2026-10-18, M3; ruled by the dispatching session in place of reporting an exposure). The upstream helper's `--permission-profile` re-binds only writable roots inside a denied directory (`U@83086188:linux-sandbox/src/bwrap.rs:414-430,566-669,790-800`). Under `default`, which has no write roots, `run/<id>` could not be re-exposed for reading, and the first build left `run/` readable in that mode. The default-mode kernel needs only its working directory and its lifeline FIFO from the session, so both now live in `$CUA_HOME/kernel/<session>/`. That directory, with its `tmp/` as TMPDIR, is created with the session and removed with it, including by the stale sweep. The deny list is the same in every mode, so other sessions' run directories are denied under `default` as under `scoped`. The GCE check showed EACCES for another session's run directory under `default`.
  Rationale: the owner's ruling denies the kernel other sessions' run directories. The shape that keeps it costs one directory per session.
  Date/Author: 2026-10-18, execution session.
- Decision: M3's other choices (2026-10-18, task 6).
  - The helper is built from rust-v0.163.0 (`83086188`) in run 39110168611. It is released as `linux-sandbox-rust-v0.163.0` with upstream's LICENSE and NOTICE; the release tag targets da0c530. Its build-provenance attestation names the feature branch's run, and M3 merges with a merge commit so that commit stays in main's history.
  - The build replaces `--locked` with a lockfile-drift check, remaps paths and strips the binary. The pin records each asset's length.
  - Every child launch re-hashes the helper, and the helper must be a regular executable file; install restores mode 0755 on the pinned bytes.
  - The worker's network on Linux computer sessions comes through `CUA_REPL_WORKER_NETWORK`.
  - Linux never falls back to the vendor host: an explicit vendor selection is refused, and a missing Node 24 refuses.
  - `launch_app` on Linux starts only an id `list_apps` returned, resolved to a desktop entry outside every sandbox write root, through `gio launch` outside the sandbox. The scoped preflight refuses an XDG applications root that overlaps a write root.
  - The parity transition entry lists 19 native cases and no cell differences.
  Rationale: each follows the Design; the review found the desktop-entry and executable-bit gaps, which were fixed before merge.
  Date/Author: 2026-10-18, execution session.
- Decision: Linux acceptance 12 closes on a full suite run at M3's final code, not on a single-suite rerun (2026-10-18, ruled by the dispatching session). The fix wave moved the default-mode kernel's cwd and lifeline and added launch_app refusals, and only the api suite had run since. The full run at 43c543d found the fixture defect described in Surprises; the full run at bf7739f compares clean. Nothing under `src/` changed after the review fixes (fedc016).
  Date/Author: 2026-10-18, execution session.
- Decision: M4 was prepared on a branch cut from M3's head (43c543d) while #160 was still open, and took main by a merge once #160 merged as 108d49f (2026-10-18; accepted by the dispatching session). This departs from "later milestones branch from main after the preceding PR merges". The merge changed no M3 launch code: M4's `src/` changes against main are comments in `launch.mjs`, `sandbox.mjs`, `install.mjs`, `manifest.mjs`, `layout.mjs` and `surface.mjs`, plus the leftovers module, the CLI and doctor rows, the seatbelt switch and the session-parent guard in `run-dir.mjs`. The Linux launch is therefore the one M3's full parity ran at bf7739f, and Linux acceptance 12 rests on that run.
  Date/Author: 2026-10-18, execution session.
- Decision: the Codex CLI's leftovers are removed only by an explicit `cua install --prune-leftovers`; a plain install removes nothing (2026-10-18, ruled by the dispatching session; supersedes "removed by `cua install`" in Design, "Removal, CODEX_HOME and the install").
  - What the prune removes: CodexCLI.app, the pre-M3 Linux `codex` file and the CODEX_HOME leftovers, by name. It keeps the three conditions and runs the stale sweep first.
  - Doctor's `runtime.leftovers` row names what is left and the command. The README and release notes say to update every cua sharing the home first.
  - Rejected alternative: automatic removal at install. A session's run record cannot show version skew, meaning an older cua sharing the same CUA_HOME that still launches CodexCLI.app. Both cases are real: this MacBook's installed 0.14.0 plugin, and the mini's long-lived 0.5.0, 0.9.0 and 0.11.0 shims and checkout-based serve and agent, which may write no run record or an old-format one.
  - On Linux, an older cua on the vendor host may run its kernel unconfined after a failed launch (#135), so updating first is a precondition.
  - The cleanup touches only `$CUA_HOME/state/codex`, never an environment CODEX_HOME, and never follows a symlink out of it.
  - A removal renames the component to a tombstone (`.<name>.pruning-<hex>`) between two session checks, and the scan recognises tombstones, so a failed or interrupted removal stays reported.
  - The task review found that the session sweep followed a symlinked `run/`, `state/`, `state/compat/` or `kernel/`, an exposure that dates from 2026-10-05, M2 and M3 respectively. The sweep now refuses on such a parent for every caller; serve and the agent log the refusal and carry on.
  Date/Author: 2026-10-18, execution session.
- Decision: the notification_center line ships off in 0.15.0, and M4 runs no time-zone sittings for it (2026-10-18, ruled by the dispatching session; replaces acceptance 13's M4 runs).
  - Why no sittings: M0 measured 0 of 80 hangs per role under the real HOME without the line, and 0 of 160 in the scratch control. A denying control that does not reproduce cannot show what the line does, and a widening grant needs evidence that it fixes something.
  - What remains: the switch in `src/sandbox/seatbelt.mjs`, off, and tz-probe's `deny` and `allow` modes. #138 stays open as not reproduced, with the switch ready for when a reproduction turns up.
  - Unchanged: the logd and diagnosticd denials stay; the release notes list them under behaviour changes.
  Date/Author: 2026-10-18, execution session.
- Decision: M4's macOS acceptance runs in three groups, and the owner's TextEdit sitting is skipped (2026-10-18, approved by the dispatching session).
  - Group A (headless): items 1 to 5, 8, 9 and 10.
  - Group B (a CI-opt hold): latency first, then parity, then accept-native without `--live-textedit`.
  - Why the sitting can go:
    - M4 does not touch the macOS computer route or the compat;
    - M2's sitting proved typing and approvals at its SHA;
    - group B re-proves the route read-only.
  - A latency regression on either host's cold rows beyond M0's run-to-run spread goes to the dispatching session before merging.
  Date/Author: 2026-10-18, execution session.
- Decision: Linux acceptance 11 is accepted with the confined kernel's first-cell cost (2026-10-18, ruled by the dispatching session). Three runs on cua-gce at 7b87873 against M0's same-host baseline: `cold.miss.first_js` 735.1 ms pooled against 666.5 (+10.3%), and `cold.hit.first_js` 825.8 against 773.6 (+6.7%). Both are beyond M0's run-to-run spread and well inside the spec's limit (baseline + max(10%, 500 ms)); the warm rows and tasks are equal or faster.
  - Cause: a session's first cell now starts the kernel through the helper (bubblewrap and seccomp), where M0 ran it unconfined. That is the disabled → scoped change acceptance 11 names as being measured.
  - Why it stands: the owner's "no regression" was set for the browser service and the macOS GUI, whose rows come from group B under the same beyond-the-spread rule.
  - The release notes state the cost. `compare --same-host` gains a tolerance for a `memoryBytes` difference under 0.1%, and nothing else: the box read 4 KiB lower on the same machine type, which it had treated as a hardware change.
  - Candidates for the cost, if Linux latency ever matters: bwrap's namespace setup and the helper's inner fork (tech-debt-tracker.md).
  Date/Author: 2026-10-18, execution session.
- Decision: macOS acceptance 11 is accepted on three runs (2026-10-18, ruled by the dispatching session). Measured on the mini at 8782604, inside the group B hold; `compare --same-host` passes both configurations.
  - The vendor host computer session's `cold.hit.first_js` pooled 489.0 ms against M0's 429.3. Its M0 runs spread 412 to 472, so it is beyond that spread, but inside the 929.3 limit.
  - Its `cold.miss.first_js` improved from 400.9 to 258.7 ms.
  - The own host browser-only rows improved: miss 1160.5 → 229.6 ms, hit 316.6 → 301.0 ms.
  - Likely cause of the hit-row cost: `bin/cua-codex-compat` starts Node before it execve's sandbox-exec, where the signed Codex CLI was a native binary. Pre-rendering the per-session profile in `buildLaunch` would remove it; that is in tech-debt-tracker.md, not M4.
  - The three confirming runs were not taken. Both of the day's closures of the owner's Chrome window followed runs whose native helper typed into TextEdit and sent super+w and super+q. Every key was confirmed in TextEdit, so this is a correlation, not a mechanism, but a stray super+q would quit the owner's Chrome. The question is #162.
  - Until #162 settles it, native-baseline's task cells and accept-native's TextEdit fixture send super+n, typing, super+w and super+q only while TextEdit is frontmost (`scripts/accept/key-guard.mjs`). Otherwise they skip the key, record it and fail the run.
  - The release notes state the cost.
  Date/Author: 2026-10-18, execution session.

## Outcomes & Retrospective

**What shipped (0.15.0, PRs #153, #156, #158, #160, #161).** cua no longer runs the Codex CLI.
- On macOS, its kernel and the vendor host's node_repl run under cua's own seatbelt profiles. They come from a JS port of the original generator, and conformance is proven three ways: byte-equal golden fixtures, the signed CLI's argv, and a fingerprint matrix.
- On Linux, both children run under the original `codex-linux-sandbox` helper. cua builds it from a pinned upstream commit, attests it and publishes it as its own release.
- The credential store, `~/.config/cua`, cua's state, remote enrolments, Chrome data and other sessions' run directories are denied to model cells in every confined mode. On Linux the deny is per directory; on macOS the whole home is denied with metadata grants.
- Linux computer sessions are confined by default, and the Linux vendor host is retired.
- The Codex CLI's leftovers are removed by an explicit `cua install --prune-leftovers`, after every cua sharing the home has been updated.

**Against the purpose.** The acceptance holds on both platforms:
- The deny holds: own-sandbox 76/76 and 86/86 on the mini, 82/82 on Linux.
- Parity holds: mini 479/479, Linux 493/493, with no undeclared difference.
- The own host is no slower where the owner works: the browser-only cold rows improved by about 900 ms (miss) and 16 ms (hit).

Two costs are accepted by ruling:
- On Linux, a session's first cell is 50–70 ms slower. That is the price of the confined kernel.
- On the macOS vendor host, the cached first cell is about 60 ms slower. That is likely the compat's Node startup, and a fix is logged as debt.

The #138 time-zone line ships off: the hang never reproduced, so no measurement could decide it.

**What went well.**
- The probes before building (M0's oracles, the Linux nesting and app-launch probes) settled the hard design forks before code depended on them. The per-directory deny on Linux and the supervisor-side `launch_app` came from evidence, not assumption.
- Full-suite runs at each milestone's final code caught what partial reruns could not. The Linux parity at 43c543d found fixtures whose HOME layout no real session has.

**What it cost, and what to do differently.**
- Deletion code took four review rounds: symlinked parents, snapshot races, swallowed scan errors, orphaned tombstones. Anything that deletes from a user's home should start from an explicit command, guard every parent it mutates, and report everything it could not inspect. Those rules surfaced late, one review at a time.
- Live runs on a shared Mac collide with the owner's own state. The owner's Chrome window closed twice near runs that typed into TextEdit, and the correlation was taken for a mechanism. The closures were the owner's own clicks over Screen Sharing, and the helper's keys go to the bound app's pid (#162). Before blaming automation for a change on a shared desktop, read the unified log for the input that caused it; it names the click or key, its source and the second.
- Scheduling against other sessions' holds and gates cost more wall time than any build. Batching the mini's headless and GUI groups, and asking for holds early, kept it bounded.

**Left open.**
- #138: not reproduced; the switch is ready.
- #162: closed. Keys are posted to the bound app's pid; the window closures were manual (Surprises, 2026-10-18).
- #157: M1 residue.
- tech-debt-tracker.md: the waitfor race; the prune's residual race; the pre-rendered compat profile; Linux helper startup.
- The mini's resident cua update and prune, which the dispatching session owns.
