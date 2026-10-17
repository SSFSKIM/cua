## `codex sandbox` on macOS at rust-v0.159.2: what a port has to reproduce

All paths below are relative to `/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs`. **[V]** means I read it in the code; **[I]** means it is inferred.

**Bottom line.** Under cua's two policies the generated profile is mostly constant text. What changes from run to run comes from: the full TOML config stack, the CLI's `TMPDIR`/cwd/HOME/euid, whether `.git`, `.agents`, `.codex` and `.aws` exist under each write root, and symlink state. There is no flag, debug subcommand or log that prints the generated `sandbox-exec` argv. A byte-level oracle against the signed binary needs `eslogger` (root plus Full Disk Access) or a racy argv capture. A golden generator built from the tag's crates is the practical fixture source.

---

### 1. End-to-end path and what it reads

1. **Before any parsing:** `main` (cli/src/main.rs:1013) calls `arg0_dispatch_or_else` (arg0/src/lib.rs:224).
   - It loads `$CODEX_HOME/.env` into the process environment, except names starting with `CODEX_` (arg0/src/lib.rs:164, 304-314). **[V]**
   - It creates `$CODEX_HOME/tmp/arg0/codex-arg0*`: a lock file and helper symlinks. It also cleans stale ones and prepends that directory to PATH (arg0/src/lib.rs:166-176, 336-410). **[V]**
   - Because cua passes `inherit=all`, both changes reach the child's environment.
2. **Dispatch:** `Subcommand::Sandbox` (main.rs:189, 1652-1689) → `run_command_under_seatbelt` (cli/src/debug_sandbox.rs:49) → `run_command_under_sandbox` (debug_sandbox.rs:203).
3. **Managed requirements are included for cua.** cua uses `-c default_permissions=…`, not `--permission-profile`, so `ManagedRequirementsMode::Include` applies (debug_sandbox.rs:190-200). **[V]**
   - The cloud config bundle is skipped, because it needs `--permission-profile` (cli/src/debug_sandbox/cloud_config.rs:18-25). **[V]**
   - `-C/--cd` requires `--permission-profile` (cli/src/lib.rs:69-75), so cua's cwd is the process cwd.
4. **Config load:** `load_debug_sandbox_config_with_codex_home` (debug_sandbox.rs:663-727) → `ConfigBuilder`. Because `default_permissions` is set, there is no read-only second pass (debug_sandbox.rs:707, 755-761). **[V]**
   - Config layers, lowest to highest (config/src/loader/mod.rs:107-140):
     - MDM `com.openai.codex` key `config_toml_base64` (config/src/loader/macos.rs:27-29)
     - `/etc/codex/config.toml`
     - `$CODEX_HOME/config.toml` (CODEX_HOME comes from the env var, else `~/.codex`; utils/home-dir/src/lib.rs:13)
     - the `-p` profile
     - cwd / ancestor / repo `.codex/config.toml`, which only apply when the directory is trusted
     - the `-c` runtime layer
   - Requirements come from `/etc/codex/requirements.toml`, `/etc/codex/managed_config.toml` and MDM `requirements_toml_base64`. **[V]**
5. **The config stack can change the policy.** **[V]**
   - Layers are deep-merged per key (config/src/merge.rs:77-98). A `[permissions.node_repl.filesystem]` entry, `network` table or `extends` in any lower layer gets unioned with cua's `-c` table.
   - Requirements can force a fallback profile (core/src/config/mod.rs:4108-4130).
   - Managed `deny_read` adds Deny entries (mod.rs:4162-4176). Section 2 explains why that drops full-disk read.
   - Managed network requirements start a proxy and switch the network section to proxy mode (network_config.rs:115-127; debug_sandbox.rs:356-383).
   - `[shell_environment_policy]` exclude/set/include_only in config still apply to the child's environment.
6. **Profile compile:** `compile_permission_profile` (core/src/config/permissions.rs:376-434) → `compile_resolved_permission_profile` (:436-498).
   - Keys go through `parse_special_path` (:843-858). Unknown `:x` keys produce a warning and are ignored.
   - `:workspace_roots` with `{"."=write}` becomes `ProjectRoots{None}` (:669-677). It is later materialized to the cwd via `effective_permission_profile` (mod.rs:451-455; workspace roots = `[resolved_cwd]`, mod.rs:3560-3570).
   - Helper readable roots (zsh, execve wrapper, memories) are added (mod.rs:4147-4183), but they are no-ops under full-disk read (protocol/src/permissions.rs:1346-1352). **[V]**
7. **Seatbelt build:** `create_seatbelt_command_args` (sandboxing/src/seatbelt.rs:871-880, `allowed_symlinked_codex_home=None`) → `create_seatbelt_command_args_with_profile` (:882-1109). debug_sandbox.rs then appends `\n(deny file-ioctl (ioctl-command TIOCSTI))` (:414-419) and spawns `/usr/bin/sandbox-exec` (:420-434). **[V]**

### 2. Semantics for cua's inputs

- **TOML order.** Filesystem entries are a `BTreeMap` (config/src/permissions_toml.rs:230), so keys are sorted and absolute paths sort before `:root`, `:tmpdir`, `:workspace_roots`. The likely result is `WRITABLE_ROOT_0` = TMPDIR and `WRITABLE_ROOT_1` = cwd. **[I]**
- **Full-disk read.** It holds when `:root` is readable and there is no Deny entry (protocol/src/permissions.rs:913-931, 677-708). **[V]** Under it:
  - the read section is the constant `; allow read-only file operations\n(allow file-read*)` (seatbelt.rs:984-990);
  - cua's explicit read paths have no effect at all;
  - the preferences .sbpl is included (:1053-1055).
- **`none`** is a serde alias for `Deny` (permissions.rs:120-126). One Deny entry disables full read. The profile then lists `READABLE_ROOT_n` params (with `/` from `:root` plus the read paths and write roots), excludes the denied subpaths, and drops cfprefs/user-preference access. That changes behaviour, not just the text. **[V]**
- **`:minimal`** only takes effect without full read (permissions.rs:962-975). It adds the platform-defaults .sbpl, `/Applications` read, and implicitly writable plus readable `/private/tmp` and `/private/var/tmp` scratch roots (seatbelt_scratch.rs:37-67; seatbelt.rs:904-914, 1056-1061). **[V]**
- **`:tmpdir`** is the CLI's `TMPDIR`. Unset or empty means no entry (permissions.rs:2267-2275). `from_absolute_path` also expands `~` and lexically removes `.`/`..` (utils/absolute-path/src/lib.rs:59-63; absolutize.rs). **[V]**
- **`:slash_tmp`** is `/tmp` if it is a directory (permissions.rs:2276-2286), then alias-normalized. **[V]**
- **cwd** is `env::current_dir()` (mod.rs:3429-3446). On macOS, getcwd already returns the physical path. **[I]**
- **Write-root normalization** (seatbelt.rs:440-488):
  - A symlink in any non-top-level component is a hard error: "symlinked writable roots are not supported" (:418-427, 449-460).
  - Top-level aliases are normalized, e.g. `/var` → `/private/var` (`normalize_system_aliases`, utils/absolute-path/src/system_aliases.rs:12-30).
  - A missing path or a directory becomes `subpath`; a file becomes `literal`.
- **Read roots and socket paths** are fully canonicalized, falling back to the logical path (seatbelt.rs:217-231). There is no case folding anywhere. **[V]**
- **Carve-outs inside each write root.** **[V]**
  - All four protected names (`.git`, `.agents`, `.codex`, `.aws`; permissions.rs:46-51) are protected by regex wherever they are not writable: `(require-not (regex #"^<root>/\.git(/.*)?$"))`, escaped with regex-lite's meta set `\.+*?()|[]{}^$#&-~` (seatbelt.rs:576-626).
  - The existing ones also get literal plus subpath exclusions, `…_EXCLUDED_n`, with a `_RESOLVED` variant when a symlink is involved (seatbelt.rs:541-575).
  - Which ones exist is decided by `default_read_only_subpaths_for_writable_root` (permissions.rs:2348-2398): `.git` dir or file, plus the gitdir target of a pointer file; `.agents` dir; `.codex` always for the cwd root, otherwise if it exists; `.aws` dir. Explicit entries suppress these (:1700).
  - The ancestors of each carve-out inside the root (the root included) become `PROTECTED_ANCESTOR_n` unlink denies (seatbelt.rs:919-945, 1074-1080).
  - Each write root gets a directory-unlink deny on itself (:522-528).
- **Network `enabled=false`.** This maps to `Restricted` (core/src/config/permissions.rs:550-553). The network section is empty (seatbelt.rs:372-383), and the env gets `CODEX_SANDBOX_NETWORK_DISABLED=1` (debug_sandbox.rs:627-629). **[V]**
- **`--allow-unix-socket`.** The path is resolved relative to cwd (cli/src/lib.rs:85-87, 100-103), canonicalized, deduplicated and sorted by string (seatbelt.rs:233-249). It adds `(allow system-socket (socket-domain AF_UNIX))` plus bind and outbound rules on `(subpath (param "UNIX_SOCKET_PATH_n"))`. **[V]**
  - With network restricted, it also appends the whole `seatbelt_network_policy.sbpl`: AF_SYSTEM sockets and mach-lookup for dirhelper, membership, SecurityServer, networkd, ocspd, trustd.agent, DNSConfiguration and configd (seatbelt.rs:328-357). It is a wider grant than the flag name suggests.
- **Daemon socket protection** applies whenever write is not full-disk: it denies read/write and unix-connect for `/private/tmp/codex-daemon-<euid>` and adds unlink denies on `/private/tmp`, `/private` and `/` (seatbelt.rs:1064-1068; seatbelt_daemon.rs:7-23; uds/src/daemon_directory.rs:13-18). **[V]**

### 3. The generated invocation

The profile is the `"\n"`-joined section list from seatbelt.rs:1047-1089. Empty sections still produce blank lines, which matters for a byte comparison. Order **[V]**:

1. `seatbelt_base_policy.sbpl`, static, 116 lines
2. read section
3. write section: one `(allow file-write*\n<require-all …> …\n)` followed by the root unlink denies
4. network section (empty for cua without sockets)
5. preferences .sbpl, 8 lines, only under full read
6. platform defaults (188 lines) and `/Applications`, only for `:minimal`
7. daemon protection
8. `(deny mach-lookup (xpc-service-name-prefix ""))`
9. deny-glob section (empty for cua)
10. `PROTECTED_ANCESTOR` denies
11. `(deny system-fcntl (fcntl-command 80 110))`
12. the TIOCSTI line (from debug_sandbox.rs)

Only the four .sbpl files are static; everything else is templated. Paths reach the profile only through `-D` params, except the regexes and the daemon paths, which are inlined.

The argv is `-p <profile>`, then `-D<KEY>=<path>` in the order read params, write params (per root: root, then its exclusions), protected ancestors, unix sockets, then `--`, then the command (seatbelt.rs:1091-1108). It is spawned as `/usr/bin/sandbox-exec` with arg0 equal to the full path (debug_sandbox.rs:616-618).

**Environment changes** (protocol/src/shell_environment.rs:90-160; debug_sandbox.rs:427-433, 623-629) **[V]**:
- `inherit=all` is already the default, and `ignore_default_excludes` defaults to true (config/src/shell_environment_policy.rs:135-136). The `-c` flag only overrides an ambient config setting.
- These variables are always stripped: `CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN`, **`NODE_REPL_AUTH_TOKEN`** and the three `OPENAI_*` identity variables (:14-20).
- `CODEX_SANDBOX=seatbelt` is added, plus `CODEX_SANDBOX_NETWORK_DISABLED=1`.
- The child also sees the arg0 PATH prepend and the `.env` values.
- `env_clear()` followed by the computed map means the child gets exactly that map.

### 4. Process model

All of this is **[V]** in debug_sandbox.rs:607-636 and :525-540 and exit_status.rs:1-13, except where marked.
- The CLI spawns the child with tokio and waits; it does not exec.
- stdin, stdout and stderr are inherited, so the CLI holds the pipe fds too.
- The child's cwd is the config cwd.
- The child gets `kill_on_drop(true)`, but only an in-process drop triggers it.
- There is no `setsid` or process-group call, so the child shares the CLI's process group.
- There is no signal forwarding; the sandbox path has no `tokio::signal` usage. **[I]**
- Exit: a normal exit passes the code through; a signal death exits `128+sig` without re-raising the signal.
- If the CLI is killed by a signal, the child is orphaned and keeps running. **[I]**
- `sandbox-exec` itself execs the command, so the tree is cua → codex → node. **[I]**
- `--log-denials` additionally runs `log stream`.

### 5. Port sizing

**Pure policy and string building** (seatbelt.rs) **[V]**:
| Piece | Lines |
|---|---|
| `build_seatbelt_access_policy` | 490-594 (105) |
| metadata regex helpers | 596-626 (31) |
| network section | 319-384 (66) |
| unix-socket helpers | 133-304 (~120 needed) |
| assembly, `with_profile` | 882-1109 (228) |
| glob-to-regex | 628-831 (204); cua emits no globs |
| `seatbelt_daemon.rs` | 24 |
| `seatbelt_scratch.rs` | 69, only for `:minimal` |
| .sbpl files, copied verbatim | 343 |

**I/O mixed in:**
- seatbelt.rs: canonicalize and lstat (217-231, 418-488); geteuid plus canonicalize `/tmp`.
- protocol/src/permissions.rs:
  - writable-root computation 1538-1760 (~220)
  - readable/unreadable 1455-1480, 1763-1797
  - special-path resolution 2250-2290
  - `normalize_effective_absolute_path` 2326-2346
  - default carve-outs 2348-2398 (is_dir/is_file checks)
  - gitdir pointer parsing 2568-2630
  - protected-name precedence 2513-2536
  - the most-specific-entry precedence matcher (`resolve_access` and `can_write_path`, ~1007-1180, plus permissions/local_aliases.rs at 131 lines)
- The TOML compile layer is core/src/config/permissions.rs:376-858; cua can skip it by building entries directly.

A faithful JS port scoped to cua's input set is about 600-900 lines plus the verbatim .sbpl. A general port is about 2,000 Rust lines. **[I]**

**Tests worth porting:**
- seatbelt_tests.rs has 52 tests. About 16 assert on policy and argv text: :394, 456, 1036, 1206, 1431-1802 (network and unix sockets), 1865, 2126, 2219, 2694, 2745, 2907. Most of the rest run real `sandbox-exec` and port as behavioural tests on a Mac.
- The remaining sandbox files: seatbelt_daemon_socket_tests.rs (1 test), seatbelt_fcntl_tests.rs (2), seatbelt_tls_tests.rs (2).
- The config-to-profile tests in debug_sandbox.rs:767-1281.
- core/src/config/permissions_tests.rs and the `permissions.rs` tests from :2632 on (carve-outs, symlinks, tmpdir).
- policy_transforms.rs and its tests are **not on this path**; that code serves additional-permission requests through manager.rs:8-9. debug_sandbox only uses `with_managed_mitm_ca_readable_root`, which is a no-op without a proxy (manager.rs:65-72). **[V]**

**Rust-helper alternative.** codex-sandboxing depends on codex-protocol, codex-network-proxy, codex-uds and others (sandboxing/Cargo.toml). The Cargo.lock transitive closure is about 675 crates, 26 of them internal (http client, otel, rustls…); this over-counts because the lock file is target-agnostic. The config resolution lives in codex-core, at about 1,072 crates. A helper could skip codex-core: build the `FileSystemSandboxPolicy` entries directly (Root=Read, Tmpdir=Write, Path(cwd)=Write, Path=Read), then call `create_seatbelt_command_args` and dump the argv as JSON. That works as a CI golden generator on a GitHub macOS runner.
- Fixtures depend on the live filesystem, so each one must pin its setup: carve-out dirs present or absent, symlinks, TMPDIR value, `/tmp`, euid. Paths need placeholder substitution.
- It is not a good shipping artifact: the build is heavy, and it would be unsigned.

### 6. Observability against the installed binary

- **No print path in the code.** **[V]**
  - There is no print or dry-run flag (cli/src/lib.rs:51-99).
  - `codex debug` has no sandbox subcommand (main.rs:256-273).
  - No tracing subscriber is installed on this path; `exec_server_telemetry.rs` and `login.rs` install their own, not here. There is no trace event at the spawn site, and seatbelt.rs only has a `warn!` (:140), so RUST_LOG yields nothing.
  - `--log-denials` streams `com.apple.sandbox.reporting` denials and prints them after exit (cli/src/debug_sandbox/seatbelt.rs:87-113). It shows denials, not the profile.
- **Viable oracles** **[I]**:
  1. `sudo eslogger exec` captures the full argv and env of the `sandbox-exec` exec. That is a byte-level oracle, but it needs root and Full Disk Access, which this Mac's privilege list would have to grant.
  2. Polling the CLI's child (`proc_listchildpids` plus `KERN_PROCARGS2`) during the window while `sandbox-exec` compiles the profile is racy but needs no privilege.
  3. Differential behaviour without capturing anything: a probe child dumps `process.env` and cwd (exact), and calls `sandbox_check()` over a list of operations, paths and mach names under both launchers.
  - A PATH shim cannot work (the absolute path is constant at seatbelt.rs:62), and DYLD interposition or a debugger is blocked on a hardened signed binary.

### 7. Upstream after the tag

The tag sits on `release/0.159`; its merge base with main is 06971ec9a, 2026-09-28. On main, all four .sbpl files, seatbelt_scratch.rs and seatbelt_daemon.rs are byte-identical to the tag. **[V]**

- **f817e16905 (#49028):** the TIOCSTI rule now uses the number from `libc::TIOCSTI`. Older macOS policy compilers reject the symbol, which means `sandbox-exec` fails. A port should emit 0x80017472 (2147578994) **[I]**.
- **37eaae6eeb (#51650):** removes the `*:53` DNS allowance in proxy plus local-binding mode (security fix; not cua's mode).
- **9552906b2b:** adds `CODEX_GUARDIAN_DECISIONS_API_KEY` to the non-inheritable list.
- **9b738582b1:** `CODEX_TOOL_CALL_ID` handling.
- **78a19f5ab5 (#52182) and 7d0b91d5d6 (#53709):** upstream now presents `codex sandbox --sandbox-state-json` as a verified launcher for local MCP servers, through `codex/sandbox-state` and `codex/sandbox-launcher` metadata. That is the contract node_repl-style hosts are moving to.
- The rest is Windows MXC work (f90a578f76, 3342ee8c07), arg0 dirs becoming `tmp/arg0-<os>` (16845bb8e8), and zsh backend removal (cd85a26cae).

Security-relevant changes already in the tag: XPC-service lookup deny (78245b47af), mutating-fcntl deny (04e4d2b40f), daemon-socket isolation (49305d74b4), scratch exclusions (d84ebff592), `.aws`/gitdir protection (1d804e91b7, a92ccbde53), runningboard removal (01f92c5780).

**Time zone, ICU, launchd:** I found no commits or issues upstream; searches for timezone, tzset, notify_register_tz, launchd and notification_center found nothing relevant. In the full-read profile, `com.apple.system.notification_center` is **not** allowed. Only the platform-defaults file grants it (seatbelt_read_only_platform_defaults.sbpl:127), and that file is not included under full read. The only mach-lookups allowed are opendirectoryd.libinfo and PowerManagement.control (base .sbpl:90-105) and cfprefsd (preferences .sbpl:4-7). So `notify_register_tz → bootstrap_look_up2` is a denied lookup that launchd has to adjudicate, which fits issue #138's hang in launchd. **[I]**

### Decisions implied

**JavaScript port**
1. Treat "byte-equal to 0.159.2" as the conformance target. That means verbatim .sbpl files, the exact section and blank-line join, `-D` ordering, regex-lite escaping, BTreeMap key order, and the TIOCSTI line. Choose explicitly between the tag's symbolic TIOCSTI and upstream's numeric fix; I recommend numeric, as a recorded deviation.
2. Do not read any Codex config, MDM or `.env`. That removes the vendor's dependence on the user's machine by design; record it as an intentional deviation.
3. Reproduce the environment effects deliberately: strip `NODE_REPL_AUTH_TOKEN` and the `OPENAI_*` identity variables, set `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`, and leave out the arg0 PATH prepend.
4. Keep the I/O-dependent rules: carve-out existence checks, the `.codex`-always rule for cwd, the gitdir pointer target, the nested-symlink rejection, and alias normalization.
5. Decide the process model: exec `sandbox-exec` directly, which removes the orphan-on-kill and `128+sig` quirks, or keep a parent process that forwards signals.
6. Handle the `notification_center` question for #138 as its own measured change after parity, using cua's 80-run repro.
7. Warn that a `none` entry drops full read and preferences access, and that `--allow-unix-socket` adds the network mach-lookups.

**Rust-helper alternative**
1. Use it only as a CI golden-fixture generator. Have it construct `FileSystemSandboxPolicy` directly, which avoids codex-core but still pulls in about 650 crates, then call `create_seatbelt_command_args` and append the TIOCSTI line. Pin each fixture's filesystem setup and normalize paths to placeholders.
2. Get the byte-level check against the installed binary from `eslogger` once root and Full Disk Access are approved. Run the `sandbox_check` and env differential probe without privilege.