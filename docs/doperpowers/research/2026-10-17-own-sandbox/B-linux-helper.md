# Linux helper audit: rust-v0.159.2

**Yes: cua can invoke the standalone helper without Codex. Setup errors fail closed.** Two caveats matter before shipping: Linux has no selective native Unix-socket grant, and this pin predates relevant security fixes.

**V** means verified by reading source; **I** means inference/estimate. GitHub metadata is labeled **API**. Checkout HEAD is `ff6aec96948b70d94983af2641a6b67c94faeff5`, unchanged. Nothing from Codex was built or executed; examples below are unexecuted.

## 1. CLI → helper

**V.** `codex` enters `arg0_dispatch_or_else`; Linux `sandbox` selects `LandlockCommand` and `run_command_under_landlock`. Config supplies cwd, environment and the effective permission profile; workspace-root entries are materialized. The launcher emits:

```text
--sandbox-policy-cwd CWD --command-cwd CWD --permission-profile JSON -- NODE ...
```

It launches the helper alias with argv[0] `codex-linux-sandbox`. Arg0 dispatch recognizes that basename and calls `codex_linux_sandbox::run_main()` before normal CLI initialization. Sources: [CLI main:1013–1020,1688–1694](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/cli/src/main.rs#L1013), [debug launcher:251–296,436–465](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/cli/src/debug_sandbox.rs#L251), [argument renderer:26–66](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/sandboxing/src/landlock.rs#L26), [arg0:97–99,283–292,392–405](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/arg0/src/lib.rs#L97).

**V.** `features.use_legacy_landlock` is deprecated and defaults false. It requests `--use-legacy-landlock`, except managed-proxy construction suppresses it. Crucially, the helper **rejects filesystem-restricted execution with that flag**; it is not an automatic fallback. [Feature:1238–1243](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/features/src/lib.rs#L1238), [rejection:412–418](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/linux_run_main.rs#L412).

## 2. Restricted filesystem, network disabled

### Launcher selection

**V.** `/usr/bin/bwrap` is not hardcoded. The helper chooses the first canonical `bwrap` on `PATH` outside cwd whose `--help` advertises `--as-pid-1` and `--perms`. Missing `--argv0` uses a compatibility re-exec path; missing `--ro-bind-fd` uses descriptor-mount translation. [Selection:132–210](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/launcher.rs#L132), [PATH filtering:168–190](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/sandboxing/src/bwrap.rs#L168).

**V.** Otherwise it searches installation resources, then `<exe_dir>/codex-resources/bwrap`, `../codex-resources/bwrap`, and sibling `bwrap`. Debug Bazel builds can additionally resolve `CARGO_BIN_EXE_bwrap` through runfiles. Bundled bwrap is opened, optionally SHA-256 verified, and executed through `/proc/self/fd/N`. `CODEX_BWRAP_SHA256` is **compile-time**; absent/all-zero means no digest check. [Bundled launcher:28–130](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bundled_bwrap.rs#L28), [Bazel:7–25](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bazel_bwrap.rs#L7).

### Stages and mounts

**V.** For cua’s root-readable policies, the argv template is:

```text
bwrap --as-pid-1 --new-session --die-with-parent
  --ro-bind / / --dev /dev [policy binds and masks]
  --unshare-user --unshare-pid --unshare-ipc --unshare-net
  --proc /proc [--chdir canonical-cwd] --cap-drop ALL
  --argv0 codex-linux-sandbox -- HELPER
  --sandbox-policy-cwd CWD --command-cwd CWD
  --permission-profile JSON --apply-seccomp-then-exec -- NODE ...
```

Host-dependent additions are explicit brackets, not literal arguments. Older system bwrap omits `--argv0`. Mount namespace isolation is intrinsic to bwrap’s `CLONE_NEWNS`; no UTS/cgroup namespace is requested. [Assembly:323–405](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bwrap.rs#L323), [PID1 insertion:38–45](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/launcher.rs#L38), [namespace creation:3090–3100](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/vendor/bubblewrap/bubblewrap.c#L3090).

**V.** Scoped adds writable `--bind ROOT ROOT` mounts for existing run/TMPDIR roots. These are **persistent host writes, not copy-on-write overlays**. Default adds no ordinary writable roots; minimal `/dev` remains writable. More-specific read/deny carveouts are layered after write binds. Top-level `.git`, `.agents`, `.codex`, `.aws`, and resolved gitdirs receive default protection unless explicitly granted writes. Existing protected paths are rebound read-only; missing metadata gets read-only synthetic placeholders and cleanup. Unsafe writable-symlink carveouts abort. [Mount order:408–424,511–669](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bwrap.rs#L408), [metadata:697–741,1214–1284](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bwrap.rs#L697), [metadata semantics:1051–1087,2347–2389](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/protocol/src/permissions.rs#L1051).

**V.** Additional protections:
- `daemon_mounts` finds mount aliases of fixed `/tmp/codex-daemon-UID`; masks use mode-000 read-only tmpfs after exposing binds. Unsupported direct/nested mount aliases abort. [Directory:12–38](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/uds/src/daemon_directory.rs#L12), [aliases:180–227](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/daemon_mounts.rs#L180), [masks:855–883](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bwrap.rs#L855).
- WSL masks `/run/WSL` and WSLg’s duplicate `/mnt/wslg/distro`; explicit duplicate-root grants/command paths are rejected. Without fresh procfs, WSL also masks `/proc`. [WSL setup:306–330](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/linux_run_main.rs#L306), [duplicate detection:10–45](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/wslg.rs#L10).
- `fd_mount` authenticates legacy descriptor-backed mounts by device/inode and closes descriptors before user code. This compatibility mechanism is not emitted by cua’s ordinary mounts. [Translation:65–128](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/launcher.rs#L65), [verification:12–83](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/fd_mount.rs#L12).

### Seccomp and failure behavior

**V.** Inner re-exec checks capabilities/fds, sets `PR_SET_NO_NEW_PRIVS`, installs seccomp, then forks/reaps the command. Default bwrap mode applies **no Landlock filesystem rules**. Legacy rules use ABI V5/BestEffort and reject NotEnforced, but restricted profiles cannot reach that route. [Inner stage:197–279](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/linux_run_main.rs#L197), [Landlock:43–94,147–170](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/landlock.rs#L43).

**V.** Restricted seccomp returns EPERM for `ptrace`, `process_vm_readv/writev`, `io_uring_setup/enter/register`, `connect`, `accept/accept4`, `bind`, `listen`, `getpeername`, `getsockname`, `shutdown`, `sendto/sendmmsg`, `recvmmsg`, `getsockopt/setsockopt`; `socket/socketpair` allow only AF_UNIX. **`connect` is denied unconditionally, including AF_UNIX.** Default action is allow; `recvfrom`, `sendmsg/recvmsg`, read/write remain available. [Filter:187–297](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/landlock.rs#L187).

**V.** Missing both launchers, exec errors, namespace failures, or enforcement errors terminate; there is no unsandboxed or automatic Landlock retry. The sole compatibility fallback drops fresh `/proc` after a recognized proc-mount failure, retaining PID/user isolation. A privileged system bwrap may work where unprivileged creation is blocked; failed namespace creation is fatal. [Failure/fallback:295–298,421–450](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/linux_run_main.rs#L295), [unavailable:47–61](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/launcher.rs#L47), [namespace errors:3148–3162](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/vendor/bubblewrap/bubblewrap.c#L3148). Issue [cua#135](https://github.com/SSFSKIM/cua/issues/135) reports a **vendor-host fallback**, not this helper’s behavior; not re-tested here.

## 3. Build and dependencies

**V.** On Linux, from the checkout’s `/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs` directory:

```sh
cargo build --locked --release -p codex-linux-sandbox --bin codex-linux-sandbox --target x86_64-unknown-linux-musl
```

Use `aarch64-unknown-linux-musl` for arm64. Rust is pinned **1.95.0**. Release uses thin LTO but `strip=false`; strip for distribution. Main directly calls `run_main`. [Manifest:7–36](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/Cargo.toml#L7), [main:1–6](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/main.rs#L1), [toolchain:1–3](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/rust-toolchain.toml#L1), [release:614–623](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/Cargo.toml#L614).

**V/I.** Direct production dependencies are clap; install-context, network-proxy, process-hardening, protocol, sandboxing, uds, absolute-path; globset, landlock, libc, rustix, seccompiler, serde/json, sha2, url. `codex-core` is dev-only. A static manifest/lock walk suggests **28 workspace crates and roughly 555 external packages as an upper bound**, not a Cargo-resolved closure. Protocol/network/sandboxing pull HTTP/TLS, Starlark, image/ICU and Windows/MXC support. Native dependencies require a C toolchain and OpenSSL headers/libs. Exact feature closure remains unverified.

**V.** The helper’s [build.rs:1–3](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/build.rs#L1) does **not compile bubblewrap**. Optional package `codex-bwrap` separately compiles four vendored C files using cc/pkg-config/libcap. Build/strip/hash that sidecar first, then compile the helper with `CODEX_BWRAP_SHA256`, and install it as sibling `codex-resources/bwrap`. [C build:32–75](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/bwrap/build.rs#L32), [release ordering:218–258](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/.github/workflows/rust-release.yml#L218).

**V/I.** Upstream releases both musl architectures and statically builds OpenSSL; GNU/glibc is a plausible alternative, not verified here. Follow the musl toolchain recipes rather than assuming `--target` alone supplies native libraries. [Targets:108–131](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/.github/workflows/rust-release.yml#L108), [static OpenSSL:16–50](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/.github/scripts/install-musl-openssl.sh#L16). **I size:** standalone helper approximately a few–10 MB stripped; unmeasured. Released bwrap sidecars were inspected as data: about **0.53 MB** each.

## 4. Direct invocation and exact JSON

**V.** No Codex binary, config, authentication or special argv0 is required for the standalone executable. Supply native cwd paths and actually spawn with that cwd; `--command-cwd` is primarily logical-cwd preservation. Required-in-practice flags are the three shown below. Do not supply internal `--apply-seccomp-then-exec`, `--verify-fd-mount`, or `--proxy-route-spec`. [CLI:85–157,383–403](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/linux_run_main.rs#L85).

**V schema; I worked equivalents.** For read path `/opt/cua` (repeat that entry for other readPaths):

```sh
SCOPED='{"type":"managed","file_system":{"type":"restricted","entries":[{"path":{"type":"special","value":{"kind":"root"}},"access":"read"},{"path":{"type":"special","value":{"kind":"project_roots"}},"access":"write"},{"path":{"type":"special","value":{"kind":"tmpdir"}},"access":"write"},{"path":{"type":"path","path":"/opt/cua"},"access":"read"}]},"network":"restricted"}'
DEFAULT='{"type":"managed","file_system":{"type":"restricted","entries":[{"path":{"type":"special","value":{"kind":"root"}},"access":"read"},{"path":{"type":"path","path":"/opt/cua"},"access":"read"}]},"network":"restricted"}'

(cd /srv/cua/run/one && TMPDIR=/srv/cua/tmp/one /opt/cua/bin/codex-linux-sandbox --sandbox-policy-cwd /srv/cua/run/one --command-cwd /srv/cua/run/one --permission-profile "$SCOPED" -- /opt/cua/node/bin/node --experimental-vm-modules /opt/cua/kernel.mjs)
(cd /srv/cua/run/one && TMPDIR=/srv/cua/tmp/one /opt/cua/bin/codex-linux-sandbox --sandbox-policy-cwd /srv/cua/run/one --command-cwd /srv/cua/run/one --permission-profile "$DEFAULT" -- /opt/cua/node/bin/node --experimental-vm-modules /opt/cua/trusted-worker.mjs)
```

**V.** `project_roots` resolves to policy cwd; TMPDIR must be nonempty/absolute or its grant disappears. There is no automatic `/tmp` write grant. [JSON:296–374,715–741](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/protocol/src/models.rs#L296), [resolution:2250–2275](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/protocol/src/permissions.rs#L2250). The helper preserves environment; reproduce any desired CLI filtering yourself. CLI always removes its fixed non-inheritable credential variables and sets informational `CODEX_SANDBOX_NETWORK_DISABLED=1`; the marker is not enforcement. [Environment:13–20,155–157](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/protocol/src/shell_environment.rs#L13), [spawn:607–635](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/cli/src/debug_sandbox.rs#L607).

## 5. Redistribution

**V license text; I application.** Apache §4 requires the license, changed-file notices, retained applicable source notices, and readable NOTICE attribution. Shipping upstream [NOTICE:1–6](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/NOTICE#L1) unchanged is simplest; generate notices for the exact dependency build too. [LICENSE:94–119](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/LICENSE#L94).

Bubblewrap is LGPL-2.0-or-later, not Apache. Merely invoking an installed system bwrap does not incorporate it into the helper. Shipping a separate bwrap requires its notices/license and corresponding source/build materials; its statically linked wrapper must be reproducible/relinkable. Embedding C into the sandbox—**not this tag’s design**—extends §6 obligations to that combined executable: permit modification/reverse-engineering for debugging, provide library source and application source/objects sufficient to relink, or a qualifying offer/equivalent download. This does not automatically relicense separate cua processes. [SPDX:1–16](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/vendor/bubblewrap/bubblewrap.c#L1), [LGPL:193–196,214–225,258–304](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/vendor/bubblewrap/COPYING#L193).

## 6. X11/D-Bus sockets

**V.** No selective native Linux grant exists. `--allow-unix-socket` belongs only to macOS Seatbelt. Managed context carries `allowUnixSockets`, but Linux seccomp uses only broad `dangerouslyAllowAllUnixSockets`. Tests explicitly expect a path grant to remain denied. [CLI structs:85–87,106–147](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/cli/src/lib.rs#L85), [filter:233–268](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/landlock.rs#L233), [regression:127–175](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/tests/suite/managed_proxy_unix_sockets_tests.rs#L127).

**V.** `--managed-network` creates an isolated TCP→UDS→TCP proxy bridge using supplied loopback proxy environment endpoints; it does not start a policy proxy itself, and missing proxy environment fails closed. Broad Unix opt-in permits native pathname sockets, **not just X11/bus**. HTTP `x-unix-socket` proxying is macOS-only. [Routes:75–120,244–275](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/proxy_routing.rs#L75), [HTTP limitation:975–999](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/network-proxy/src/http_proxy.rs#L975).

**I.** Network-enabled restricted-filesystem mode can retain filesystem protection but grants general networking/Unix sockets. Broad managed Unix permission plus a newly narrowed filesystem might approximate socket visibility controls; that is not cua’s root-readable scoped policy and needs acceptance testing.

## 7. Post-tag upstream changes

**API.** Paginated `gh api` compare against main snapshot `ce0323f2` found divergence: **813 main-only / 4 tag-only commits**. Path-filtered histories were intersected with that range; the capped compare-files list was not relied upon. The four release-only commits contain no sandbox changes.

**V, code-diff verified:**
- [#51211 / 7aa8f51](https://github.com/openai/codex/commit/7aa8f510496316b86a91a75ed0a71598ef03c640): reject sandbox-writable/replaceable bwrap PATH candidates. Tag excludes only cwd—relevant if cua’s PATH includes writable TMPDIR/other roots.
- [#51407 / ccde2fc](https://github.com/openai/codex/commit/ccde2fc8b7fd08216757d3d3f67362847ab8341b): protected pre-sandbox `rg` lookup.
- [#51527 / ac9b5b8](https://github.com/openai/codex/commit/ac9b5b8380517ded445b09dd3196d8d9e2ba3c59): `rg --no-config` prevents user configuration suppressing deny-glob masks. These rg issues are dormant in today’s no-deny-glob cua profiles. [Tag invocation:1010–1022](/Users/new/.claude/jobs/1ea561bc/tmp/codex-src/codex-rs/linux-sandbox/src/bwrap.rs#L1010).
- [#50059 / ae7aad5](https://github.com/openai/codex/commit/ae7aad586ea0769f329e214e9827c541823fd191): distinct descriptors fix fail-closed startup with multiple denied files. These four fixes are contained in 0.162.0.
- Later [#52610](https://github.com/openai/codex/commit/c63929af50518ca638ccad12f2805298cb7f25a1) renames `landlock.rs` to `seccomp.rs`; [#54445](https://github.com/openai/codex/commit/6b991972c5b539198dcea9bac4fc14e57559c3af) removes obsolete protected-create monitoring. Existing daemon/WSLg/VSOCK protections were already in this tag, not new fixes.

## Implications for cua

- Direct-launch both children with managed JSON, controlled cwd/environment, and refusal on launcher failure—never retry unconfined.
- Prefer a fixed upstream helper after parity testing; retaining 0.159.2 requires an explicitly trusted pre-sandbox PATH.
- Choose system bwrap or a digest-pinned, separately licensed sidecar; package-only Cargo builds do not bundle one.
- Direct invocation does not solve selective GUI sockets. Keep that policy decision explicit; perform Linux acceptance before changing computer-session defaults.