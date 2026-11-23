# #171 M5 T5, the x64 acceptance at H (task 89), 2026-11-16 to 2026-11-17

**Acceptance on the pinned release, counted.** Every step ran at the frozen head **H = `fefe306c`** on the run home's
own `cua install` of **linux-engine-v0.4.0** (`cua-engine` sha256 `751ec9be…`, `cua-engine 0.4.0 (c55c8e08d9cb)`),
taken by the pinned rule inside each step. **Status: every one of the gate's 50 steps passes, 49 on their stored verdicts and V5 by ruling 680 beside its stored FAIL (below), item 9 passes, and H's local proof passed before
any counted step.**

- 49 steps passed by their own judge at H: the 28 private idle steps, the 16 at twice the load, V1–V4 and Z0.
- V5 passes on its rerun's stored rows re-judged at H′, under rulings 680 and 756. Its first attempt was stopped by a
  guard false stop (rulings 749, 750).
- What is declared or unconfirmed is listed apart and never counted as a pass.
- F3's unjudged lane ran apart: V2 complete, V3 stopped by the same guard race.
- Run on the #171 x64 VM (`dc-linux171-1e68`) from 2026-11-16T14:28Z to 2026-11-17T11:43Z.

Every step stands on H, except V5, which is re-judged at **H′ = `0495b1a7`** (ruling 756 for `chrome_dnd_shared`;
ruling 680's re-judge for `chrome_dnd_late_take_shared`, the pre-flight's C22). H′ changes only the device judge's cancel
cell, which no other step reaches; nothing reran at H′.

## Setup

- **Checkout:** `t5-x64`, a fresh git worktree detached and clean at `fefe306c288956a48b6c086017f3cd1a58462a07`: a real
  `npm ci`, `node node_modules/electron/install.js` (electron v44.9.0), and xprobe built through the cargo wrapper, under
  the lock (`scripts/setup.sh`, `setup-both.sh`, `setup-t5.log`). 0 changes before and after. main's comparison checkout
  `t5-main`, detached at `b99232de`, got `npm ci` and Electron the same way (`setup-main.log`).
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64` (CUA_HOME), its own `cua install` under a HOME and XDG
  directories of the run's with an empty secret store (`scripts/install-home.sh`, `.log`). It placed the vendor runtime
  26.928.40906-linux-x64, the sandbox helper, Node 24.22.0 and linux-engine-v0.4.0: sha256 `751ec9be…` (the pin's x64
  asset), static-pie, `install.json` build `pinned`. `gate.mjs check --pinned` exited 0: attested (linux-engine.yml runs
  43637317960 on `release/linux-engine-v0.4.0` and 43608161213 on `feat/171-m4`, both GitHub-hosted), native/linux-engine
  as at c55c8e08, the checkout at fefe306c and clean.
- **Chrome (F2):** the judged Chrome is Google Chrome **156.0.8078.73** (`google-chrome-stable 156.0.8078.73-1 amd64`).
  The harness runs `google-chrome` from PATH (`chrome.mjs` `CHROME_COMMAND`), which is `/opt/google/chrome/chrome`
  156.0.8078.73; every `:0` precondition read re-read it.
- **Firefox:** task 59's Mozilla Firefox 159.0 first on PATH (gate.mjs `firefoxDir` for private steps; the sitting
  launcher for `:0`, which refuses a Firefox step otherwise).
- **The parity clone** (`~/Developer/GitHub/cua-parity`) fetched the tag `linux-engine-v0.4.0` → `c55c8e08`
  (`scripts/parity-tag.log`).

## H's local proof (rulings 742, 743), before any counted step

GitHub Actions was locked by a billing issue, so H was proven here first, each part under `locked.sh t5-x64` with its own
`timeout` (`scripts/local-proof.sh`, `proof-all.sh`; logs `scripts/proof/`). The lines are `.github/ci-kit.yml`'s at H,
cargo through the lock's wrapper. **This was the local proof; hosted ci-gate on H followed when Actions returned: GREEN
5/5** (harness-dbus, plugin, sandbox-live, parity-browser, test; run
[44001083419](https://github.com/SSFSKIM/cua/actions/runs/44001083419)).

| part | command | UTC (11-16) | result |
|---|---|---|---|
| npm test at H | `npm test` in t5-x64 | 14:28:12–14:31:02 | 6004 tests: 5755 pass, **50 fail**, 199 skipped (platform: see below) |
| npm test at main | `npm test` in t5-main (b99232de) | 14:31:02–14:33:43 | 5826 tests: 5578 pass, **52 fail**, 196 skipped |
| harness suite | `npm run test:linux-engine-diff` | 14:33:43–14:34:24 | 1157 tests: 1153 pass, 0 fail, 4 skipped (they need a native/linux-engine build); exit 0 |
| harness-dbus | `CUA171_DBUS_TESTS=required node test/linux-engine-diff/suite-check.mjs …a11y-stub, leak-check, session-bus, audit-proxy-lifetime` (the gate's apt line: the packages are installed) | 14:34:28–14:34:52 | 62/62; exit 0 |
| engine-linux, static | `rustup toolchain install`; `rustup target add x86_64-unknown-linux-musl`; `cargo fmt --check`; both `cargo clippy … -D warnings`; `cargo build --release --locked --target x86_64-unknown-linux-musl` (rustc 1.94.1) | 14:34:52–14:36:08 | exit 0 |
| engine-linux, live | `CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session --dbus-daemon=tests/dbus-daemon-quiet -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1` | 14:36:16–14:44:57 | 616 passed, 0 failed, 1 ignored, over 10 test binaries; exit 0 |
| engine-linux, two screens | `tests/two-screens.sh` | 14:44:57–14:44:58 | 3/3 on Xorg :100 (two screens) and :101 (resizable); exit 0 |

**npm test, by ruling 743:** it passes when H fails nothing that main doesn't. The sets, by test name
(`scripts/failing.mjs` over the two logs; `scripts/proof/npm-test-compare.txt`):

Failing at H: 50. Failing at main: 52. In both: 49.

Failing at both heads (file :: test):

- `test/mcp-http.test.mjs :: over real connections, a session lists no device tools, and DELETE answers only after its run entries are released`
- `test/native-baseline/approved-runtime.test.mjs :: ownership is the exact executable plus the run's TMPDIR; argv mentions and other TMPDIRs are not owned; nothing else is read out`
- `test/refused-serve-exit.test.mjs :: cua serve, refused before its handshake by an unreadable store, exits 1 without answering`
- `test/refused-serve-exit.test.mjs :: the probe's serve wrapper, refused before its handshake by an unreadable store, exits 1 without answering`
- `test/remote-agent.test.mjs :: a lock left by an agent that is gone is broken; a session id answers 404 after DELETE`
- `test/remote-agent.test.mjs :: a rotation ends every open session: a standing stream on the old credential is cut, its session gone`
- `test/remote-agent.test.mjs :: agent run --http --relay serves both; a newer connection for the device (4001) makes it close every session and exit 0`
- `test/remote-agent.test.mjs :: agent run --http serves sessions over HTTP; two sessions (cap 2) have their own run entries and both close on SIGTERM`
- `test/remote-agent.test.mjs :: the resident agent records Chrome readability at startup and refreshes it on profiles_list`
- `test/repl-parity/selection-cache.test.mjs :: ordinary selection calls record a complete cold handshake and reuse it on the next call`
- `test/repl-parity/socket-error-peer.test.mjs :: owned peer stays open before input and aborts mid-stream with a real transport error`
- `test/runtime-node.test.mjs :: a filesystem failure in the Node step fails classified, with the runtime-installed remedy, in JSON and in text`
- `test/runtime-node.test.mjs :: install (darwin) keeps only bin/node and the licence, moves them into node/<version> with one rename, then writes the pointer`
- `test/runtime-node.test.mjs :: install (linux) keeps only bin/node and the licence, moves them into node/<version> with one rename, then writes the pointer`
- `test/runtime-sandbox-helper-install.test.mjs :: the helper is fetched from the pinned URL, verified, and placed 0755 in a 0755 directory; the staging is gone`
- `test/sandbox/index.test.mjs :: Linux: the pinned helper runs each role under its profile JSON, the kernel denied its deny list, only the worker on the network`
- `test/serve-cli.test.mjs :: SIGHUP closes a secrets-on connection like SIGTERM, removing its run entries`
- `test/serve-cli.test.mjs :: SIGINT closes a secrets-on connection like SIGTERM, removing its run entries`
- `test/serve-cli.test.mjs :: SIGTERM closes the connection and its runtime`
- `test/serve-cli.test.mjs :: a client that closes all its pipes mid-task gets an orderly close: exit 0, runtime gone, no run entries`
- `test/serve-cli.test.mjs :: a connection's own session approval file is removed at close; other sessions' files are left alone`
- `test/serve-cli.test.mjs :: a release step that fails is reported and the rest of the release still runs`
- `test/serve-cli.test.mjs :: a signal that arrives while the connection is starting closes it, leaving no run entries`
- `test/serve-cli.test.mjs :: an upstream exit fails the pending call, cleans up and exits nonzero`
- `test/serve-cli.test.mjs :: cua profiles bind shows each candidate's label, binds a unique name automatically and nothing ambiguous`
- `test/serve-cli.test.mjs :: cua profiles list still shows the profiles but fails when its listing runtime was not confirmed stopped; an empty listing does not fail`
- `test/serve-cli.test.mjs :: cua serve runs the resolved runtime with an allowlisted environment in an owned directory and removes it at close`
- `test/serve-cli.test.mjs :: each connection gets its own random session ID`
- `test/serve-cli.test.mjs :: profiles_list and cua profiles list check a bound profile against the live backends, one tab-free listing launch per request`
- `test/serve-cli.test.mjs :: serve resolves the store from its $HOME and project, hands the runtime only their directories, and lists their keys, never a value`
- `test/serve-cli.test.mjs :: serve start sweeps the run entries of connections whose process is gone, says so, and leaves live and unrecorded ones`
- `test/serve-cli.test.mjs :: serve with no store yet still serves, and secrets_list lists no keys`
- `test/serve-cli.test.mjs :: stdio serve reads the device registry and credentials under its $HOME: devices_list probes a registered device, devices_use classifies a failed open`
- `test/serve-cli.test.mjs :: the plugin entry cua-shim.mjs is the same server`
- `test/serve-cli.test.mjs :: under the scoped default a CUA_HOME below the caller's $TMPDIR serves: the launch's TMPDIR is its own session temp`
- `test/serve-cli.test.mjs :: with CUA_SHIM_SANDBOX=default serve sends no sandbox state; an invalid value fails classified before anything is launched`
- `test/serve-cli.test.mjs :: with CUA_SHIM_SURFACES=computer,browser, serve registers both wrappers, configures cua's browser service and answers profiles_list from the registry`
- `test/serve-lazy.test.mjs :: CUA_RUNTIME_IDLE_MS: 0 never stops the runtime; a value must be whole milliseconds`
- `test/serve-lazy.test.mjs :: a connection that never launched closes clean on SIGHUP: exit 0, nothing launched, nothing left`
- `test/serve-lazy.test.mjs :: a connection that never launched closes clean on SIGINT: exit 0, nothing launched, nothing left`
- `test/serve-lazy.test.mjs :: a connection that never launched closes clean on SIGTERM: exit 0, nothing launched, nothing left`
- `test/serve-lazy.test.mjs :: a connection that never launched closes clean on eof: exit 0, nothing launched, nothing left`
- `test/serve-lazy.test.mjs :: an idle restart reuses a leftover working directory, fixes its mode and removes it at close`
- `test/serve-lazy.test.mjs :: an idle runtime stops after the default 15 min through the normal end and the next js relaunches it once, its result opening with the restart notice`
- `test/serve-lazy.test.mjs :: every connection teaches and launches cua's browser service, on every home, with CUA_BROWSER_SERVICE ignored`
- `test/serve-lazy.test.mjs :: profiles_list's registry part launches nothing; its live check makes only the listing's own launch`
- `test/serve-lazy.test.mjs :: the first connection launches at its handshake and records it; a later one answers it and tools/list with no launch, launches once at its first js and never again`
- `test/serve-lazy.test.mjs :: the record is the runtime's raw answers; a MAWS session and a plain one replaying it each get their own descriptions`
- `test/serve-lazy.test.mjs :: with a MAWS backend the handshake does not wait for its hello; profiles_list and the first launch do, and prefer its instance`

Failing at H only:

- `test/browser-service/paste.test.mjs :: every CDP call of a paste or shortcut carries its deadline; one queued past it dispatches nothing`

Failing at main only:

- `test/accept-lib.test.mjs :: a tree snapshot notices added, removed and rewritten entries, and an untouched tree compares equal`
- `test/accept-linux-chrome-features.test.mjs :: a click RPC failure after a completed download remains FAIL and preserves evidence for safe deletion`
- `test/accept-maws-features.test.mjs :: the download step passes for the fixture's bytes under the Downloads folder and removes the file it proved it made`

The one test failing at H only is load-sensitive, not H's: `test/browser-service/paste.test.mjs` and `src/browser-service/`
are identical between the heads (`git diff --stat b99232de fefe306c` empty), and the file alone, run alternating at the
two heads 20 times each under the lock, failed **2 of 20 at H and 2 of 20 at main** (`scripts/paste-check2.sh`,
`proof/paste-check2.log`; a first, non-alternating 10 each: 2/10 at H, 0/10 at main, `proof/paste-check.log`). The
controller ruled it passes 743's test (already noted in #382 as load-sensitive). The three failing at main only are
main's.

## Item 9, the fresh install (§1.2), on a private display

`scripts/item9.sh` under the lock, inside M4's `private-desktop.mjs --session` (a private Xvfb, Openbox, a private bus
with accessibility on), in an empty home of the run's (`mktemp -d`: HOME, the XDG directories, an empty secret store,
CUA_HOME). Transcript `scripts/item9/transcript.txt`.

| attempt | UTC (11-16) | lock status | what happened |
|---|---|---|---|
| 1 | 14:45:47 | 1 | the launcher's own fault: item9.sh gave private-desktop.mjs its own path as `./item9.sh`, whose spawn failed with ENOENT before anything inside ran (no install, no doctor, no home made). Its outer log also read the pin's release as `undefined`. Its private Xvfb (pid 3297578) and Openbox (3297624) on `:1` were left orphaned to init (below) |
| 2 | 14:46:00–14:46:32 | 0 | **passes.** `cua install --engine`: exit 0 (fetched 26.928.40906, the sandbox helper, linux-engine-v0.4.0, Node 24.22.0); the engine's sha256 `751ec9be…` **equals the pin**; `file`: `ELF 64-bit LSB pie executable, x86-64 … static-pie linked … stripped`; `--version` `cua-engine 0.4.0 (c55c8e08d9cb)`; install.json build `pinned`; `CUA_NATIVE_ENGINE=cua cua doctor`: exit 0, `engine` PASS (0.4.0, the pin's hash, service `cua`), `accessibility.enabled` PASS, its three chrome-route rows BLOCKED as in M4's fresh check (no Chrome registration in an empty home); no engine process of the home left; the home removed; private-desktop exit 0, watchdog clean |

**The two orphans of attempt 1**, found during the sitting, were ended after it on the controller's word
(`scripts/orphans-before.txt`, `orphans-term.sh`, `orphans-term.log`). Each was signalled only while it was still that
program: the same start time (stat field 22: 167255552 and 167255565) and executable (`/usr/bin/Xvfb`,
`/usr/bin/openbox`) as recorded at 23:58Z, and tied to `:1` (the Xvfb held the socket `@/tmp/.X11-unix/X1`, inode
213007008 in `/proc/net/unix`; Openbox's environment named `DISPLAY=:1`; neither's argv names a display, since Xvfb
takes its number by `-displayfd`). Both checks held, TERM was sent at about 02:25Z on 11-17, both ended, and `X1` is gone.
They idled beside every step from 14:45Z to then; nothing of them reached `:0`.

## The step table

Lock lines are from `~/.local/share/cua-171/host-lock.log`, holder `t5-x64` (`scripts/lock-lines.txt`); the `:0`
steps' times are from their sitting's `zero.log` (one lock hold a sitting). Load is the 1-, 5- and 15-minute average.
mawsd's render host ran during none of them (`render-host=none` on every lock line). The driver held each private
step until the 1-minute load was under 1.0, for up to 15 minutes: at twice the load the 5- and 15-minute averages were
still the previous step's. "Stands on" is the SHA whose judge the step's verdict is read by.

| step | stands on | out | acquire (UTC) | release | min | exit | load at acquire | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| V1 | fefe306c | out | 11-16 23:53:26 | 00:30:29 | 37.0 | 0 | 0.52 0.46 0.41 | 0.62 0.44 0.44 | all-clear clear | every verdict PASS: 6 cua rows; their speed series 7 faster, 1 within the bound; gedit's caret and bus-trace cases pass |
| V2 | fefe306c | out | 11-17 00:30:29 | 00:55:32 | 25.1 | 0 | 0.62 0.44 0.44 | 1.32 1.45 1.22 | all-clear clear | every verdict PASS: 15 cua rows; their speed series 26 faster, 1 same within noise, 1 within the bound |
| V3 | fefe306c | out | 11-17 00:55:32 | 01:33:35 | 38.0 | 0 | 1.32 1.45 1.22 | 0.74 1.05 1.13 | all-clear clear | no verdict FAIL: 41 cua rows (37 pass, 20 speed series faster); listed apart: #373 declared gap (within its 15 ms bound), 2 declared unconfirmed, 1 declared refusal |
| V4 | fefe306c | out | 11-17 01:33:35 | 02:00:08 | 26.6 | 0 | 0.74 1.05 1.13 | 0.99 0.90 0.84 | all-clear clear | every verdict PASS: 22 cua rows; their speed series 4 faster; every paste case |
| V5 (1) | fefe306c | out | 11-17 02:00:08 | 02:16:40 | 16.5 | 1 | 0.99 0.90 0.84 | 0.86 0.94 0.93 | all-clear NOT clear (hold-sittings) | **stopped** by wrap71's outside-peer flag on the run's own audit proxy (:40) at 968 s: no verdict made; a guard false stop, rulings 749, 750 (below) |
| V5 (2) | fefe306c ran; **re-judged at H′ 0495b1a7** | out-rerun1 | 11-17 03:20:07 | 03:57:17 | 37.2 | 1 | 0.02 0.08 0.08 | 1.56 1.14 0.96 | all-clear clear | **FAIL as recorded** on 2 device-chrome-dnd cells; **re-judged at H′: no failure left** (late take by 680, chrome_dnd_shared by 756; below) |
| Z0 | fefe306c | out-rerun1 | 11-17 03:57:17 | 04:08:19 | 11.0 | 0 | 1.56 1.14 0.96 | 0.39 0.87 1.02 | all-clear clear | PASS: Firefox's plain drop 30/30 on :0 (the cua:0ms control 0/30), Writer's select 30/30 |
| D1 | fefe306c | out | 11-16 14:46:42 | 15:08:08 | 21.4 | 0 | 0.60 0.60 0.89 | 0.50 0.58 0.70 | clean; end check clear | PASS (Chrome: canvas, drag and drop with #358 declared, the thumb at the pinned mean) |
| D2 | fefe306c | out | 11-16 15:08:09 | 15:27:06 | 18.9 | 0 | 0.50 0.58 0.70 | 0.49 0.43 0.48 | clean; end check clear | PASS (Electron's cells, its thumb at the pinned mean) |
| D3 | fefe306c | out | 11-16 15:27:06 | 15:45:13 | 18.1 | 0 | 0.49 0.43 0.48 | 0.79 0.50 0.48 | clean; end check clear | PASS (Firefox's cells, its canvas on speed) |
| D4 | fefe306c | out | 11-16 15:45:13 | 16:11:36 | 26.4 | 0 | 0.79 0.50 0.48 | 0.10 0.24 0.31 | clean; end check clear | PASS (the GTK and Qt editors' cells) |
| D5 | fefe306c | out | 11-16 16:11:36 | 16:30:59 | 19.4 | 0 | 0.10 0.24 0.31 | 0.08 0.21 0.29 | clean; end check clear | PASS (Writer unprimed, the terminals, GTK 4, Writer through gen) |
| R1 | fefe306c | out | 11-16 16:30:59 | 17:08:48 | 37.8 | 0 | 0.08 0.21 0.29 | 1.29 1.35 1.24 | clean; end check clear | repl-parity 34 cases on each lane, the diff exit 0; the prepared home pinned |
| R2 | fefe306c | out | 11-16 17:09:18 | 17:31:12 | 21.9 | 0 | 0.90 1.25 1.21 | 0.89 0.74 0.78 | clean; end check clear | `VERDICT: PASS` by in-cell time; unproved.txt empty |
| R3 | fefe306c | out | 11-16 17:31:12 | 17:34:42 | 3.5 | 0 | 0.89 0.74 0.78 | 0.62 0.67 0.75 | clean; end check clear | linux-native passes; engine watch PASS: only the home's installed cua-engine, under the trusted worker, no sky_linux |
| R4 | fefe306c | out | 11-16 17:34:42 | 17:35:54 | 1.2 | 0 | 0.62 0.67 0.75 | 1.16 0.83 0.80 | clean; end check clear | linux-device-mode passes; engine watch PASS |
| FB | fefe306c | out | 11-16 17:36:04 | 17:36:33 | 0.5 | 0 | 0.99 0.80 0.79 | 0.94 0.80 0.79 | clean; end check clear | every step PASS (the truncation line) |
| E1 | fefe306c | out | 11-16 17:36:33 | 17:44:36 | 8.1 | 0 | 0.94 0.80 0.79 | 0.15 0.37 0.58 | clean; end check clear | complete: desktop move first and later faster; every scenario the same or the declared answer |
| S1 | fefe306c | out | 11-16 17:44:36 | 18:18:26 | 33.8 | 0 | 0.15 0.37 0.58 | 0.35 0.47 0.57 | unclean: pid 3538804 openbox; end check clear | complete (#302 counted toward its streak, listed apart) |
| S2 | fefe306c | out | 11-16 18:18:26 | 18:45:04 | 26.6 | 0 | 0.35 0.47 0.57 | 0.48 0.53 0.50 | unclean: pid 3592152 openbox; end check clear | complete |
| S3 | fefe306c | out | 11-16 18:45:04 | 19:11:15 | 26.2 | 0 | 0.48 0.53 0.50 | 0.20 0.33 0.52 | unclean: pid 3645594 openbox; end check clear | complete |
| S4 | fefe306c | out | 11-16 19:11:15 | 19:46:05 | 34.8 | 0 | 0.20 0.33 0.52 | 0.18 0.26 0.33 | unclean: pid 3708294 openbox; end check clear | complete |
| F1a | fefe306c | out | 11-16 19:46:05 | 20:02:22 | 16.3 | 0 | 0.18 0.26 0.33 | 0.81 0.78 0.57 | unclean: pid 3782942 openbox; end check clear | complete |
| F1b | fefe306c | out | 11-16 20:02:22 | 20:12:59 | 10.6 | 0 | 0.81 0.78 0.57 | 0.92 0.82 0.65 | unclean: pid 3828228 openbox; end check clear | complete |
| F2 | fefe306c | out | 11-16 20:12:59 | 20:17:21 | 4.4 | 0 | 0.92 0.82 0.65 | 0.18 0.46 0.54 | unclean: pid 3853266 openbox; end check clear | complete |
| ES | fefe306c | out | 11-16 20:17:21 | 20:30:13 | 12.9 | 0 | 0.18 0.46 0.54 | 0.56 0.65 0.63 | unclean: pid 3862465 openbox; end check clear | complete (every run one engine under its session, the installed path) |
| P1 | fefe306c | out | 11-16 20:30:13 | 20:58:32 | 28.3 | 0 | 0.56 0.65 0.63 | 0.83 0.81 0.83 | clean; end check clear | every cell PASS (8 of 8) |
| P2 | fefe306c | out | 11-16 20:58:32 | 21:25:09 | 26.6 | 0 | 0.83 0.81 0.83 | 0.86 0.83 0.86 | clean; end check clear | every cell PASS (8 of 8) |
| P3 | fefe306c | out | 11-16 21:25:09 | 21:51:35 | 26.4 | 0 | 0.86 0.83 0.86 | 1.37 1.34 1.23 | clean; end check clear | every cell PASS (8 of 8) |
| P4 | fefe306c | out | 11-16 21:58:05 | 22:27:03 | 29.0 | 0 | 0.94 1.14 1.16 | 0.75 0.59 0.71 | clean; end check clear | every cell PASS (8 of 8) |
| P6 | fefe306c | out | 11-16 22:27:03 | 22:55:54 | 28.9 | 0 | 0.75 0.59 0.71 | 0.77 0.41 0.44 | clean; end check clear | every cell PASS (8 of 8), Firefox's dnd 30/30 by P6's Fisher judge (p = 1.0 against the pinned build) |
| P5 | fefe306c | out | 11-16 22:55:54 | 23:14:38 | 18.7 | 0 | 0.77 0.41 0.44 | 0.33 0.28 0.33 | clean; end check clear | every cell PASS (5 of 5: the leave cases) |
| H1 | fefe306c | out | 11-16 23:14:38 | 23:32:36 | 18.0 | 0 | 0.33 0.28 0.33 | 0.28 0.36 0.40 | clean; end check clear | no false ok, no missing landing, no false error; findings counted |
| H2 | fefe306c | out | 11-16 23:32:36 | 23:50:59 | 18.4 | 0 | 0.28 0.36 0.40 | 0.35 0.38 0.38 | clean; end check clear | the same, at the gate's window load |
| C1 | fefe306c | out | 11-16 23:50:59 | 23:52:50 | 1.9 | 0 | 0.35 0.38 0.38 | 0.81 0.50 0.42 | clean; end check clear | every late take reported (9 of 9) |
| L1 | fefe306c | out | 11-17 04:23:05 | 04:51:59 | 28.9 | 0 | 0.33 0.27 0.53 | 16.87 16.78 14.45 | clean; end check clear | the judges' verdict PASS (thumbs and ranges at 40 a side) |
| L2a | fefe306c | out | 11-17 04:55:39 | 05:18:51 | 23.2 | 0 | 0.96 8.32 11.51 | 16.96 17.11 15.95 | clean; end check clear | the judges' verdict PASS |
| L2b | fefe306c | out | 11-17 05:22:21 | 05:38:10 | 15.8 | 0 | 0.99 8.65 12.78 | 18.35 17.02 15.56 | clean; end check clear | the judges' verdict PASS |
| L2c | fefe306c | out | 11-17 05:44:01 | 06:12:03 | 28.0 | 0 | 0.97 6.12 11.07 | 17.58 17.80 16.75 | clean; end check clear | the judges' verdict PASS |
| L3a | fefe306c | out | 11-17 06:15:23 | 06:46:16 | 30.9 | 0 | 0.95 9.28 13.57 | 16.68 16.96 16.62 | unclean: pid 881664 openbox; end check clear | complete |
| L3b | fefe306c | out | 11-17 06:49:17 | 07:06:48 | 17.5 | 0 | 0.92 9.38 13.73 | 15.26 16.17 15.64 | unclean: pid 927023 openbox; end check clear | complete (#302 listed apart) |
| L3c | fefe306c | out | 11-17 07:09:38 | 07:41:55 | 32.3 | 0 | 0.93 9.20 13.04 | 15.65 16.72 16.62 | unclean: pid 955179 openbox; end check clear | complete |
| L3d | fefe306c | out | 11-17 07:44:55 | 08:24:56 | 40.0 | 0 | 0.92 9.19 13.70 | 16.57 16.75 16.82 | unclean: pid 1012699 openbox; end check clear | complete |
| L3e | fefe306c | out | 11-17 08:27:57 | 09:04:08 | 36.2 | 0 | 0.85 9.20 13.86 | 16.36 16.64 16.39 | unclean: pid 1089181 openbox; end check clear | complete |
| L4a | fefe306c | out | 11-17 09:06:58 | 09:26:29 | 19.5 | 0 | 0.97 9.43 13.65 | 15.42 16.38 15.80 | clean; end check clear | no false ok, no missing landing; findings counted |
| L4b | fefe306c | out | 11-17 09:29:29 | 09:43:14 | 13.8 | 0 | 0.99 9.03 13.03 | 17.26 16.63 15.42 | clean; end check clear | complete; findings counted (6 false releases on the measurement lane) |
| L4c | fefe306c | out | 11-17 09:46:14 | 09:48:13 | 2.0 | 0 | 0.93 9.14 12.71 | 14.30 11.36 13.08 | clean; end check clear | every late take reported (16 of 16) |
| L5 | fefe306c | out | 11-17 09:51:13 | 09:52:50 | 1.6 | 0 | 0.93 6.31 10.80 | 11.92 8.61 11.16 | clean; end check clear | complete |
| F3a | fefe306c | out | 11-17 09:55:30 | 10:15:24 | 19.9 | 0 | 0.85 5.06 9.40 | 16.87 17.15 15.13 | unclean: pid 1228348 openbox; end check clear | complete |
| F3b | fefe306c | out | 11-17 10:18:34 | 10:32:30 | 13.9 | 0 | 0.86 9.14 12.35 | 15.57 16.45 15.08 | unclean: pid 1278214 openbox; end check clear | complete |
| F4 | fefe306c | out | 11-17 10:35:30 | 10:40:39 | 5.2 | 0 | 0.93 9.05 12.43 | 16.83 13.98 13.61 | unclean: pid 1309335 openbox; end check clear | complete |

## The `:0` sittings

Each sitting was GO'd by the design session through the controller, planned 45 minutes or more ahead. Each held the
host lock once across its steps (`scripts/sitting-locked.sh`, CUA_LOCK_MAX set for it), so no other holder ran between
its steps. Each step ran `gate.mjs print`'s command exactly (`scripts/zero-commands*.txt`), with only its own leading
`locked.sh t5-x64` stripped, since a nested hold would wait on the sitting's own (`scripts/sitting.sh`). That command
is the sitting launcher (`sitting.mjs`: the start check, then the end check and the all-clear however the step ends)
around run71.sh under wrap71.py, which are M4's guards unchanged: owner-check before and after, owner-watch, tmp-watch,
a TMPDIR of the step's own, and the pointer read before the step and restored after it. Each step was capped at
55 minutes, and none was started that could not finish before the hard stop. Task 59's Firefox was first on PATH. The
owner's Chrome kept pid 2546101 throughout every sitting and was never signalled. Preconditions are in
`scripts/zero-precheck*.out`, each step's guard records in `scripts/zero-<step>*.out`, and the times in each out root's
`zero.log`.

| sitting | GO | lock hold (UTC) | hard stop | steps | all-clear |
|---|---|---|---|---|---|
| 1 | sminos 745 | 11-16 23:53:26 – 11-17 02:16:40 (released with status 8: the launcher stopped after V5) | 04:08:25 | V1, V2, V3, V4 exit 0; V5 stopped by wrap71 (exit 1); Z0 not started | V1–V4 clear. **V5 not clear: hold-sittings written** at 02:16:40Z (below). Cleared by the controller at 02:30:44Z on rulings 749 and 750 |
| 2 (the rerun) | sminos 751 | 11-17 03:20:07 – 04:08:19 (status 0) | 04:50:00 | V5 exit 1 (its verdict, below), Z0 exit 0 | both clear |
| F3's lane | sminos 763 | 11-17 10:41:18 – 11:42:58 (released with status 8: the launcher stopped after V3) | 12:11:18 | V2, V3 as development runs | V2 clear. **V3 not clear: hold-sittings written** at 11:42:58Z, the same race (below). Cleared by the controller at 11:46:10Z on ruling 773 |

Preconditions at each start: no hold-sittings, no stress-ng, the owner's Chrome at pid 2546101, the pointer at 142,130,
no `/tmp/cua171-run-*`, `gate.mjs leftovers` clear, task 59's Firefox on PATH, and google-chrome 156.0.8078.73. Loads:
0.52 0.46 0.41 (sitting 1), 0.02 0.08 0.08 (sitting 2), 8.63 12.22 13.03 (F3's lane: the lagging average
of F4's stress, which had ended 40 s before; no stress-ng).

The guard records, step by step:

| step | wrap71 samples | flags | decoy connections | leftovers | owner-watch | owner-diff | pointer |
|---|---:|---:|---:|---|---|---|---|
| V1 (sitting 1) | 17607 | 0 | 0 | none | done after 217 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V2 (sitting 1) | 11451 | 0 | 0 | none | done after 144 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V3 (sitting 1) | 17521 | 0 | 0 | none | done after 220 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V4 (sitting 1) | 11982 | 0 | 0 | none | done after 152 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V5 (sitting 1) | 6692 | 1 | 0 | 464215 cua-engine | done after 92 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V5 (sitting 2) | 15051 | 0 | 0 | none | done after 207 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| Z0 (sitting 2) | 4649 | 0 | 0 | none | done after 64 checks; changed=0 | none | pointer restored to 142 130, reads 142 130 |
| V2 (F3) | 11504 | 0 | 0 | none | done after 145 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |
| V3 (F3) | 16917 | 1 | 0 | none | done after 212 checks; changed=0 | mtime ~/.config/google-chrome | pointer restored to 142 130, reads 142 130 |

owner-diff's one difference, where there is one, is the owner's own Chrome writing its profile's mtime, as in every M4
sitting. wrap71 saw no run process touch it. The sitting launcher's other reads were clear after every step: no window with the harness's title, and no key or
button held on `:0`. The audit of windows the harness did not open was clean after every step but the two that wrap71
stopped (the first V5 and F3's V3), whose missing end row left it unshown, which their all-clears failed on.

## V5: stopped once, rerun, two cells ruled

**The first attempt, stopped by its guard** (`out/V5.pinned-release/`; the proof `V5-stopped/`). At 968.282 s, about
02:16:17Z, wrap71 flagged `outside-peer-connection`: pid 465174 (comm null; it had already exited) had a socket to
`/tmp/.X11-unix/X40` whose server end showed no pid. wrap71 then sent its stop to the harness (pid 398109, 968.283 s).
The harness exited 143 with no end row, and the cell's engine (464215 cua-engine) was still alive at wrap's end. The
launcher wrote hold-sittings: "wrap71 flagged 1 reach into the person's session and 0 decoy connections; processes of
the run still alive after it, which can hold a grab or a window on :0: 464215 cua-engine; the harness's terminal row
(end) is missing, so its audit of the windows it did not open is unshown". The pointer was restored, no window or held
key was left, and 464215 had ended before the controller cleared the hold.

The proof the design session asked for (ruling 749) was read from V5's own records, wrap71's process table
(`wrap-summary.json` `processes`) and `flags.jsonl`, by `V5-stopped/v5-flag-proof.py` (output `v5-flag-proof.txt`):

1. **`:40` was V5's own audit proxy, live at the flag.** xtrace, pid 398197, ppid 398109 (the harness), `-D :40`
   (audit.mjs `freeDisplay` starts at 40), first seen at 5.478 s and last at 973.843 s, so it brackets 968.282. The
   empty peer list fits a connection still in xtrace's accept queue: the task-71 race wrap71 already counts for the
   step's own session bus, here on the proxy.
2. **465174 was in the run's set** by wrap71's own check (`ours = … if p in runset`). There is no record of it beyond
   that: it ended before its record was read. The only processes recorded with `DISPLAY=:40` are the harness's xdotool
   (145) and xprobe (9).
3. **No other server on `:40`** in the run's records, and the path was xtrace's bound listener for the whole span.
   wrap71 records only the run's tree, so this holds by path exclusivity, not by a record of every host process.

The design session ruled it a guard false stop that failed closed (749, 750). The controller cleared hold-sittings at
02:30:44Z (`V5-stopped/hold-sittings-cleared-2026-11-17T02:30:44Z.txt`), and V5 and Z0 reran at H unchanged.

**The rerun** (`out-rerun1/V5.pinned-release/`, 03:20:07–03:57:17Z) ran 52 cua verdict rows with a clear all-clear. It
exited 1 on two device-chrome-dnd cua cells in shared mode: "**FAIL**: device-chrome-dnd chrome_dnd_shared cua,
device-chrome-dnd chrome_dnd_late_take_shared cua". Neither is an engine fault. native/linux-engine changes between
f9692898, the c2 engine V5 last passed on `:0`, and c55c8e08 only in b4560995, 03076d64 and 30e16a43 (copy.rs,
clipboard.rs, elements.rs, menu_faults.rs, atspi.rs, tree.rs, the fault tests, README). dnd.rs, drag_cursors.rs, input.rs
and engine/pointer.rs are unchanged, so the drag and DnD path is c2's. This was the first `:0` V5 on the released
engine.

| cell | its judge at H | the ruling | the re-judge |
|---|---|---|---|
| `chrome_dnd_late_take_shared` | "a drop the witness did not record on 1 of 9 samples (0/0)": the late take's dragend 190 ms after the press, after the witness span closed (the answer at 162.14 ms + 20 ms) | **680** (M4 c2's V5 2/0, the same shape), by the pre-flight's C22 | ruling 680's script, read-only with H's harness, its run-name prefix widened to `pinned-` (`scripts/rejudge-680/`, `diff.txt`): **pass**, "9 samples; the witness span's limit: 0/0 (dragend 190 ms after the press, answer 162.14 ms + 20); every other rule passes". Its 7 negative controls fail as expected; its positive control fails only on `chrome_dnd_shared` (`scripts/v5-rerun1.rejudge-680.txt`) |
| `chrome_dnd_shared` | "not cancelled with the drag-and-drop sentence on 2 of 9 samples (0/0, 0/1)" | **756**: 0/0 is #264's honest late take, not a false ok. The engine's take came 2.35 ms after the release (`late_dnd.after_release_ms`), and the engine answered as a plain drag by its contract (engine/pointer.rs "no take by the release: answered now as a plain drag, the watch handed over until the next request"; docs/cua-api/linux-engine.md's `Pending from your last drag,`). Nothing dropped. 0/1 is that late take's report. The fix is the judge's alone: a sample whose X-level take came after the release is judged by the late-take rules. That is H′ (task 90) | at **H′ = 0495b1a7**, `rejudge-device.mjs` over the stored rows (8.1(4), no rerun): **fail → pass**. H's judge reproduces all 52 stored verdicts, and no other step's device verdicts move (`out-rerun1/V5-rejudge-756/`) |

With both, **V5 has no failure left**. Its stored verdict is recorded as it ran. The facts on 0/0's timeline are in
`scripts/v5-dnd-samples.py` and `v5-dnd-residual.py`, and in the controller's record of the 756 ruling.

## Item 2: the 21 commands, and which step ran each

The engine's wire is the pinned vendor's 20 commands plus `type_characters` (the spec, Purpose). Each verdict row of
V1–V5 is mapped to the command its timed request sends, read from the harness's own op table at H (ops.mjs `OPS`:
`scripts/op-commands.mjs`, outputs `scripts/commands-V1-V4.txt` and `commands-V5-rerun1.txt`). The minimized, identity and device ops are mapped by
their names, and their requests were checked by hand. The cells are cua's verdict rows: each is equal to the vendor's
answer or a declared deviation, retention included. The declared and unconfirmed cells are listed apart, in the next
section and in the column below, never as passes.

| command | step(s) | cua verdicts there | apart (declared, unconfirmed, ruled) |
|---|---|---|---|
| `list_windows` | V2 (desktop), V3 (minimized: the window listed `minimized: true`) | pass | – |
| `list_apps` | V2 | pass | – |
| `get_window_state` | V2 (gedit, Chrome, over-budget's truncation, retention), V3 (retention, minimized: tree read, no screenshot), V5 (identity reads) | pass | over-budget `tree`: declared (the truncation line, V2) |
| `get_screenshot` | V2 | pass | – |
| `launch_app` | V2 | pass | – |
| `activate_window` | V3 | pass but one | **declared gap #373** (bounded, 15 ms): chrome-input activate_window |
| `click` | V2, V3 (click_element, right_click, minimized refusals), V4 (device cases), V5 (Firefox device cases, identity_click_element) | pass but one | **declared unconfirmed**: chrome-input right_click_fallback (V3) |
| `perform_secondary_action` | V3, V5 (identity_secondary_action) | pass but one | **declared unconfirmed**: chrome-input secondary_action (V3) |
| `press_key` | V2, V4, V3 (minimized refusal) | pass | – |
| `key_down` | V3, V4 | pass | – |
| `key_up` | V3, V5 (identity_key_up) | pass | – |
| `type_text` | V1 (gedit, selection, dedicated), V4 (Chrome's textarea and address bar, gnome-text-editor dedicated, paste-target), V5 (identity_type_text), V3 (minimized refusal) | pass | gnome-text-editor `type_text` declared (V4) |
| `type_characters` | V2, V3 (minimized refusal); E1 (the events experiment, its refusals the declared answer) | pass | E1: four refusals, the declared answer (type_characters) |
| `scroll` | V3, V4, V5 (Firefox device cases) | pass | – |
| `move` | V3, V5 (Firefox device cases) | pass | – |
| `move_relative` | not sent by V1–V5. **E1**: `desktop move_relative`, cua the same as the pinned build in answers and X events; S1's settle cells | pass (E1 complete, exit 0) | – |
| `drag` | V3, V4 (device cases), V5 (Firefox and Chrome device cases, device-chrome-dnd) | pass but these | **declared refusal**: chrome-input drag (V3, M3.1's Chromium drag refusal). V5's two device-chrome-dnd cells, **ruled**: chrome_dnd_late_take_shared (680) and chrome_dnd_shared (756, at H′) |
| `drag_handle` | not sent by V1–V5. **E1**: `drag_handle` and `drag_handle stray end`, cua the same as the pinned build; S1, S2 (the settle cells); H1, H2 (T17's handle lanes) | pass | – |
| `clipboard_read` | V1, V5 (identity_clipboard_read), V3 (minimized refusal) | pass | – |
| `clipboard_write` | V1, V3 (minimized refusal) | pass | gedit `clipboard_write` declared (V1) |
| `clipboard_release` | V1 | pass | – |

The cases cua runs alone, not a command's output (the paste safety cases, the bus trace, caret_placed): V1 2, V4 12,
all pass (`scripts/commands-V1-V4.txt`). V2's `capabilities` row is the engine's own extra query, not one of the 21.

## Item 3: the seven listed operations, three medians each

These come from V2 (gedit's and Chrome's reads and screenshots, press_key, click) and V3 (chrome-input's scroll and
drag). The bar is the faster vendor build's median (`scripts/seven-ops.py`, output `seven-ops.md`). The 480-element
gedit tree and the 222-element Chrome page are the `tree` of V2's `gedit` and `chrome` scenes. The window screenshot
is each scene's `tree_shot`.

| scene | op | step | cold: pinned / newest / cua (ms) | warm: pinned / newest / cua (ms) | cua verdict |
|---|---|---|---|---|---|
| gedit | tree | V2 | 572.8 / 564.8 / 91.8 | 650 / 558.3 / 80.9 | PASS (cold faster [-497.57, -459.205]; warm faster [-492.48, -452.68]) |
| chrome | tree | V2 | 475.2 / 459.6 / 68.8 | 448.1 / 434.3 / 65.5 | PASS (cold faster [-414.695, -365.545]; warm faster [-403.74, -350.43] |
| gedit | tree_shot | V2 | 703.8 / 696.5 / 129.1 | 745.7 / 719.5 / 103.5 | PASS (cold faster [-592.45, -532.405]; warm faster [-636.98, -570.84]) |
| chrome | tree_shot | V2 | 609.6 / 632.8 / 121.7 | 575.9 / 621.2 / 84.5 | PASS (cold faster [-518.72, -464.625]; warm faster [-523.35, -474.08]) |
| gedit | press_key | V2 | 273.4 / 240.4 / 7 | 268.9 / 235.7 / 1.1 | PASS (cold faster [-234.12, -232.615]; warm faster [-234.82, -234.39]) |
| chrome | press_key | V2 | 273.5 / 240.7 / 5.9 | 269.3 / 236.2 / 1.2 | PASS (cold faster [-236.01, -234.035]; warm faster [-235.23, -234.725] |
| gedit | click | V2 | 219.5 / 221 / 20 | 214.9 / 215.9 / 14 | PASS (cold faster [-200.7, -198.95]; warm faster [-201.17, -200.43]) |
| chrome | click | V2 | 219 / 220.4 / 18.4 | 214.9 / 215.6 / 14 | PASS (cold faster [-201.19, -200.215]; warm faster [-201.33, -200.355] |
| chrome-input | scroll | V3 | 315 / 317 / 114.6 | 311.1 / 312.2 / 110.2 | PASS (cold faster [-201.43, -199.34]; warm faster [-201.13, -200.56]) |
| chrome-input | drag | V3 | 717.6 / 417.6 / 4 | 705 / 413.6 / 1.2 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium |

The chrome-input `drag` in shared mode is M3.1's declared refusal (a Chromium drag is refused unless its path is
unobscured), so its 4 / 1.2 ms is a refusal's time, not a drag's. Drag speed is judged in the drag experiment, with
every run's effect:

- D1, Chrome, warm medians newest / cua / pinned: canvas 510.4 / 476.4 / 1146.7 ms (cua:0ms 75, on 1 usable sample); drag and drop 338.2 / 363.8 / 506.9,
  with **#358 declared** (interval [21.9, 28.4], within its 40 ms).
- D3, Firefox: canvas 515.4 / 354.6 / 1149.2 (cua:0ms 77.2, on 0 of 30 taken).
- Chrome's thumbs (D1) and Electron's (D2) land at or past the pinned build's mean distance on 30 of 30 (the judges'
  line; PASS).

Desktop `move` (E1): the first request takes 74.92 ms against the pinned 83.03 and the newest 84.06 (faster,
[-8.49, -7.62]); later requests take 0.47 against 8.61 and 6.13 (faster).

The verdict steps' speed tallies, each series counted once (M4's `speed-tally.py`; `scripts/speed-tally.txt`):

- V1: cua rows 6; series faster 7, within the bound 1, same 0; PASS rows naming no series 2; other verdicts {}
- V2: cua rows 15; series faster 26, within the bound 1, same 1; PASS rows naming no series 1; other verdicts {}
- V3: cua rows 41; series faster 20, within the bound 0, same 0; PASS rows naming no series 27; other verdicts {'declared': 4}
- V4: cua rows 22; series faster 4, within the bound 0, same 0; PASS rows naming no series 20; other verdicts {}
- V5: cua rows 52; series faster 0, within the bound 0, same 0; PASS rows naming no series 50; other verdicts {'FAIL:': 2}

V5's 50 PASS rows name no speed series: its cells are judged on their effects and answers.

## Declared and unconfirmed, listed apart (never passes)

From each step's own summary (`scripts/declared.sh`, output `declared.txt`). Each is listed as its judge listed it, a
loss or a limit, never a pass.

| step | cell | what | its record |
|---|---|---|---|
| V3 | chrome-input `activate_window` cua | **declared gap #373**, bounded at 15 ms a series (ruling 728): cold 12.05 ms against the bar's 3.66, warm 10.5; within the bound, so a declared gap and not a fail | `out/V3.pinned-release/run/summary.md` |
| V3 | chrome-input `right_click_fallback`, `secondary_action` cua | **declared unconfirmed** (`menuUnconfirmed`, rulings 687, 688): effect 40/40, answers 0/40 equal, by design | same |
| V3 | chrome-input `drag` cua | **declared refusal** (M3.1: Chromium drag unless the path is unobscured) | same |
| D1 | Chrome `dnd` cua (and cua:0ms) | **declared speed gap #358**: 363.8 ms against the newest's 338.2, interval [21.9, 28.4] within the declared 40 ms | `out/D1.pinned-release/run/summary.md` |
| S1 | electron-input `press_key` background | **#302**, a declared limit (a key release reaching the tree after press_key's settle), counted toward the streak by the gate's own judge (#371), listed apart | `out/S1.pinned-release/run/summary.md` |
| L3b | electron-input `press_key` background, at twice the load | **#302**, the same declared limit, counted toward the streak and listed apart | `out/L3b.pinned-release/run/summary.md` |
| L4a, L4b, L4c | Electron's and Chrome's drops at twice the load | findings, counted and not fails: L4a #365's declared race 0 of 60, and 4 cold handle drops at load landed while Electron's cursor still showed no accept; L4b 0 of 300 landed drops unconfirmed, and 6 false releases at the accept on the measurement lane `cua:accept` (not shipped), 3 of them answered ok with nothing pending; L4c 16 late takes, 16 reported, and 24 drags that never took answered as plain drags | the steps' summaries |
| V1, V4, V2 | gedit `clipboard_write`, gnome-text-editor `type_text`, over-budget `tree` | each answer equal **as declared** (`(declared: …)` on a PASS row: the spec's declared answers, the truncation line) | the steps' summaries |
| E1 | four `type_characters` refusals; `a key hold whose window is destroyed` | the same as the vendor's but the **declared answer** (type_characters, interrupted_hold) | `out/E1.pinned-release/run/summary.md` |
| H1, H2, C1 | Chrome's and Electron's drops | findings, counted and not fails: #365's declared race (0 of 60 at idle, 0 at the gate's window load), the late-take share reported (C1: 9 late takes, 9 reported; 0 of 31 landed drops unconfirmed); H2's `root unmeasured` ends | the steps' summaries |

**Unproved (F8a):** R2's `unproved.txt` is empty, so no engine-answered series was left undetermined and none was
declared by name. **Unconfirmed** apart from V3's two: none.

## Unclean ends and leftovers

- **Sixteen unclean ends on the run's own side** (ruling 730 (a): a finding, never a verdict failure). They fall on
  every step that runs on the experiment's own display: S1, S2, S3, S4, F1a, F1b, F2 and ES at idle, and L3a–L3e,
  F3a, F3b and F4 at twice the load. Each step's end record names "a process it spawned still runs: pid N openbox", the
  openbox of the experiment's own Xvfb:
  - at idle: 3538804, 3592152, 3645594, 3708294, 3782942, 3828228, 3853266, 3862465;
  - at twice the load: 881664, 927023, 955179, 1012699, 1089181, 1228348, 1278214, 1309335.

  They are listed as recorded. None of them was alive when checked (the idle eight at about 23:55Z on 11-16, the rest at
  10:42Z on 11-17): each exited just after its end record was taken, so the record races the display's teardown. The
  controller logged the race as harness debt; it is not changed at H. Every step's end check (gate.mjs, after the step)
  was clear: no `cua171-run-*` and no session bus of one.
- **Item 9's two orphans** (above): ended after the first sitting, each after its identity checks.
- **The first V5's cua-engine** (464215), left alive by wrap71's stop, ended before the controller cleared the hold.
- No step's start check refused, and no step needed `gate.mjs leftovers --remove`.

## F3's lane: the vendor's third build, unjudged (apart)

**A development run, unjudged and never counted** (F3, GO sminos 763), in `f3-out/`. V2 and then V3 ran once each with
the vendor's third build, **26.1111.21308**, given as `--newest`, against the same pinned home and its engine
(`gate.mjs print V2|V3 --pinned <home> --dev --newest <its sky_linux_x64>`; `scripts/zero-commands-f3.txt`). The spec's
bar stays its two builds (F3), so nothing here is a verdict. These are medians for the owner's page.

- **The binary:** `sky_linux_x64` sha256 `5a9b0fc04c659bdad6b7c192ef8c73159b165426bc59aaa6b8dce669f081868a`, from
  `chatgpt_26.1111.21308_amd64.deb` (sha256 `4b443bc5…`).
  - The vendor key is `3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4`, "Codex Linux Repository", fetched by that fingerprint
    from keyserver.ubuntu.com into a throwaway GNUPGHOME. It is the fingerprint the pins' notes record
    (`runtime/releases/26.928.40906-linux-x64.json`).
  - `gpgv` over `dists/stable/InRelease`: Good signature (made 2026-11-13T01:19:28Z), exit 0; with one byte changed,
    exit 1. Packages' sha256 `a78db77f…` is in InRelease, and the deb's is in Packages.
  - The deb's own `_gpgorigin` over its members in order: GOODSIG and VALIDSIG `3BFA0E4A…`; without `debian-binary`,
    BADSIG.
  - The record: `scripts/verify-third.sh`, `vendor-26.1111-verification.txt`, `vendor-26.1111-InRelease`,
    `vendor-26.1111-Packages-amd64`.
- **V2** (10:41:18–11:06:24Z, exit 0, all-clear clear): its own line reads "development run, not a release gate: every
  verdict PASS". At the start the 1-minute load average was 8.63, lagging F4's stress, which ended at 10:40:39Z; there
  was no stress-ng, and top read 70.6% idle at 10:42 with V2 running.
- **V3** (11:06:24–11:42:58Z): **stopped by the same wrap71 race** at 2180.356 s: `outside-peer-connection` on
  `/tmp/.X11-unix/X40`, V3's own audit proxy (xtrace 1371679, seen 0.565–2182.497 s, the only process naming `:40`;
  `scripts/f3-v3-flag-proof.txt`). Its all-clear wrote hold-sittings at 11:42:58Z. The harness exited 143 with no end
  row and no summary, and nothing was left running. Its chrome-input series were complete, 20 a side, so scroll's and
  drag's medians below are read straight from its raw rows (`run/results.jsonl`), not from a summary. It is recorded as
  stopped by the guard, with no rerun (ruling 773). The controller cleared hold-sittings at 11:46:10Z on the same
  proof (`F3-V3-stopped/`: the proof and the clearance record).
- **The race is not rare.** It stopped 2 of this run's 9 `:0` steps: V5's first attempt and F3's V3. M4's sittings had
  none. The proofs are `V5-stopped/v5-flag-proof.txt` and `scripts/f3-v3-flag-proof.txt`, both read by
  `v5-flag-proof.py` from the step's own `wrap-summary.json` and `flags.jsonl`.
  - Each time, the flagged peer was the step's own live audit proxy on `:40`, and the flagged pid was a short-lived run
    child with no record.
  - In F3's V3, the pids recorded next to it are the harness's xdotool clients with `DISPLAY=:40` (`windowactivate
    --sync`, `windowmap --sync`, 2175.98–2178.28 s).
  - wrap71 counts this not-yet-accepted race for the step's own session bus, but not for its audit proxy. That is the
    design session's (B).

The seven operations, three medians each (cold / warm, ms): the pinned build, the third build, cua.

| scene | op | step | cold: pinned / 26.1111.21308 / cua (ms) | warm: pinned / 26.1111.21308 / cua (ms) |
|---|---|---|---|---|
| gedit | tree | V2 | 647 / 600.3 / 93 | 572.6 / 574.1 / 80.3 |
| chrome | tree | V2 | 454.8 / 445.3 / 67.3 | 440.3 / 426.5 / 63.7 |
| gedit | tree_shot | V2 | 751.8 / 732.2 / 137 | 720.1 / 709.8 / 106.4 |
| chrome | tree_shot | V2 | 594.5 / 606.4 / 124.8 | 572.6 / 553.7 / 89.1 |
| gedit | press_key | V2 | 273.3 / 240.5 / 6.9 | 269 / 235.8 / 1.1 |
| chrome | press_key | V2 | 273.5 / 240.4 / 5.8 | 269.2 / 236 / 1.4 |
| gedit | click | V2 | 219.5 / 222.9 / 21.2 | 215.3 / 215.9 / 13.9 |
| chrome | click | V2 | 219 / 220.4 / 18.9 | 215 / 215.7 / 14 |
| chrome-input | scroll | V3 (raw rows, stopped run) | 314.8 / 316.5 / 114.5 | 311.3 / 311.9 / 110.1 |
| chrome-input | drag | V3 (raw rows, stopped run) | 713.4 / 417.6 / 3.5 | 710.4 / 412.6 / 1.1 |

cua's `drag` figure is chrome-input's shared-mode refusal (M3.1's declared refusal), not a comparable drag: its time is a
refusal's, against the vendor builds' drags.

## At H⁗ on 0.4.1 (task 105), 2026-11-18 to 2026-11-19

**The reruns that ruling 827/828's reach calls for on x64, on linux-engine-v0.4.1, at the frozen head H⁗ = `3b5c0441`.**
They ran on the #171 x64 VM from 2026-11-18T21:13Z to 2026-11-19T05:27Z. The records are in `h4/`: `out/` holds the
counted private steps, `pilot/` the counter pilot, `zero/` the `:0` sitting, and `scripts/` task 105's launchers and
records.

- **Class A** (827), every one exit 0 and passing by its own judge at H⁗: H1, H2, D2 and S1 at idle; L1, L2b, L3b and
  L4a at twice the load.
- **D1** cross-checks **the same** as its record at H (ruling 854's form, below).
- **E1** is complete. Its fragile scenarios ran through the audit proxy (818, task 97).
- **The counter pilot** (828(c)) reads **not taken** on all 9 class-B idle steps it reaches. No step moves to class A.
- **The `:0` sitting** (GO ruling 862, the owner's window 02:30–08:00Z):
  - V1, V2, V3, V4 and Z0 pass.
  - V5 FAILs as stored on one cell, `chrome_dnd_late_take_shared`, in ruling 680's shape (below).
  - Every all-clear was clear, and no hold-sittings was written.

### Setup

- **Checkout:** `t105-x64`, a fresh worktree detached and clean at `3b5c0441b41e67ab87dd1265d2ca74325f93dec3`. It got a
  real `npm ci`, `node node_modules/electron/install.js` (electron v44.9.0), and xprobe through the cargo wrapper, all
  under the lock (`h4/scripts/setup.sh`, `setup-t105.log`). It had 0 changes before and 0 after.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64-041`, its own `cua install` under a HOME of the run's with
  an empty secret store (`install-home.sh`, `.log`).
  - It holds linux-engine-v0.4.1, sha256 `c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626`, the
    pin's x64 asset and the brief's.
  - The engine reads `cua-engine 0.4.1 (7522dcb8fb8c)` and is static-pie, with install.json build `pinned`.
  - `gate.mjs check --pinned` exited 0: attested (linux-engine.yml run 44380699966 on `release/linux-engine-v0.4.1`),
    native/linux-engine as at 7522dcb8, the checkout at 3b5c0441 and clean.
- **Chrome (F2):** google-chrome 156.0.8078.73, read again at the sitting's pre-check. Task 59's Firefox is first on
  PATH. The owner's Chrome kept pid 2546101 (started 11-02 20:16:10) throughout and was never signalled.

### H⁗'s local proof (rulings 742, 743), under `locked.sh t105-x64`

This used the repo's `scripts/linux-engine-gate/local-proof.sh` at H⁗ (`h4/scripts/proof.sh`; logs in
`h4/scripts/proof/`). The comparison checkout is `t5-main` at `b99232de`, which is H⁗'s merge base with main.

| part | UTC (11-18) | result |
|---|---|---|
| npm test at H⁗ | 21:15:05–21:18:04 | 6167 tests: 5917 pass, **51 fail**, 199 skipped |
| npm test at main b99232de | 21:18:04–21:20:45 | 5826 tests: 5579 pass, **51 fail**, 196 skipped |
| harness suite (`npm run test:linux-engine-diff`) | 21:20:45–21:21:30 | 1311 tests: 1307 pass, 0 fail, 4 skipped; exit 0 |
| harness-dbus (the gate's line, its seven suites) | 21:21:30–21:21:54 | 91/91; exit 0 |

**Ruling 743:** the failing sets are the same 51 names at both heads, with none failing at H⁗ only and none at main
only (`failing.mjs`, `proof/npm-test-compare.txt`). So no alternation run was needed. **ci-gate on H⁗:** GREEN 8/8, run
[44394454677](https://github.com/SSFSKIM/cua/actions/runs/44394454677) (the controller's).

### The step table at H⁗

Lock lines are from `host-lock.log`, holder `t105-x64` (`h4/scripts/lock-lines.txt`). Private steps ran one per hold
through `drive.sh`/`step.sh`, with a quiet wait inside the hold (`step start`). The `:0` steps ran in one hold
(`run-sitting.sh`, CUA_LOCK_MAX 329m to 08:00Z), with times from `zero/zero.log`. Load is the 1-, 5- and 15-minute
average.

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| D1 | 3b5c0441 | 11-18 21:22:37 | 21:23:17 | 21:44:45 | 21.5 | 0 | 0.85 2.19 1.46 | 0.22 0.45 0.75 | clean; end check clear | PASS; #358 declared (cua 369 ms against newest's 338.4, [24.6, 33.2] within 40 ms). The cross-check (below) |
| D2 | 3b5c0441 | 11-18 21:45:38 | 21:45:38 | 22:04:41 | 19.1 | 0 | 0.42 0.46 0.74 | 0.31 0.42 0.51 | clean; end check clear | PASS (Electron's cells, its thumb at the pinned mean) |
| E1 | 3b5c0441 | 11-18 22:04:41 | 22:04:41 | 22:12:46 | 8.1 | 0 | 0.31 0.42 0.51 | 0.19 0.21 0.36 | clean; end check clear | complete: cua sent the pinned build's events and answers in every scenario; desktop move first and later faster, key_up later within the bound |
| S1 | 3b5c0441 | 11-18 22:12:47 | 22:12:47 | 22:46:49 | 34.0 | 0 | 0.19 0.21 0.36 | 0.50 0.59 0.58 | unclean: pid 286294 openbox; end check clear | complete (#302 counted toward its streak, listed apart) |
| H1 | 3b5c0441 | 11-18 22:46:49 | 22:46:49 | 23:04:55 | 18.1 | 0 | 0.50 0.59 0.58 | 0.28 0.26 0.37 | clean; end check clear | no false ok, no missing landing, no false error; findings counted |
| H2 | 3b5c0441 | 11-18 23:04:55 | 23:04:55 | 23:23:31 | 18.6 | 0 | 0.28 0.26 0.37 | 0.81 0.91 0.80 | clean; end check clear | the same, at the gate's window load |
| L1 | 3b5c0441 | 11-19 00:08:24 | 00:08:24 | 00:37:01 | 28.6 | 0 | 0.94 0.70 0.84 | 16.67 16.60 14.29 | clean; end check clear | the judges' verdict PASS |
| L2b | 3b5c0441 | 11-19 00:37:46 | 00:40:16 | 00:56:07 | 15.8 | 0 | 0.84 8.92 11.71 | 16.64 16.42 14.95 | clean; end check clear | the judges' verdict PASS |
| L3b | 3b5c0441 | 11-19 00:56:07 | 00:58:57 | 01:16:27 | 17.5 | 0 | 0.97 9.29 12.44 | 16.68 16.39 15.24 | unclean: pid 574911 openbox; end check clear | complete (#302 listed apart) |
| L4a | 3b5c0441 | 11-19 01:16:27 | 01:19:58 | 01:39:38 | 19.7 | 0 | 0.98 8.33 12.23 | 17.31 17.13 15.91 | clean; end check clear | no false ok, no missing landing; residue 0 (below) |
| V1 | 3b5c0441 | 11-19 02:30:01 | 02:30:01 | 03:07:05 | 37.1 | 0 | 0.02 0.16 0.93 | 0.58 0.54 0.58 | all-clear clear | every verdict PASS; text windows a lane ended 0 |
| V2 | 3b5c0441 | (one hold) | 03:07:05 | 03:33:08 | 26.1 | 0 | 0.58 0.54 0.58 | 0.97 1.50 1.39 | all-clear clear | every verdict PASS |
| V3 | 3b5c0441 | (one hold) | 03:33:08 | 04:11:41 | 38.5 | 0 | 0.97 1.50 1.39 | 0.96 1.17 1.16 | all-clear clear | no verdict FAIL; listed apart as at H: the chrome-input drag (declared refusal), 2 declared unconfirmed (right_click_fallback, secondary_action), the #373 activate_window gap |
| V4 | 3b5c0441 | (one hold) | 04:11:42 | 04:38:44 | 27.0 | 0 | 0.96 1.17 1.16 | 0.62 0.89 0.91 | all-clear clear | every verdict PASS; every paste case |
| Z0 | 3b5c0441 | (one hold) | 04:38:45 | 04:49:46 | 11.0 | 0 | 0.62 0.89 0.91 | 0.69 0.81 0.91 | all-clear clear | PASS: Firefox's plain drop 30/30 (cua:0ms 2/30), Writer's select 30/30 |
| V5 | 3b5c0441 | (one hold, released 05:27:20) | 04:49:46 | 05:27:20 | 37.6 | 1 | 0.69 0.81 0.91 | 0.88 0.94 0.93 | all-clear clear | **FAIL as stored** on `chrome_dnd_late_take_shared` cua (2/0); 51 other rows pass (below) |

**What stands, and on which SHA.** Every other step of the gate stands on its record above at **H = `fefe306c`** on
0.4.0, for these reasons:

- **The counted class-B idle steps** D3, D4, D5, P4, P6, P5 and C1. The diff
  reaches them only by entering changed functions with no new branch taken (task 98's reach table, B). Their counter
  pilot at H⁗ reads not taken (below).
- **The class-B steps that start no engine through engine.mjs**, which `--engine-stats` cannot reach: S2, S3, S4, ES,
  R2, R3, R4 and FB. Ruling 843's static exclusions apply: no source of the settle's family (Electron, or another
  Chromium-toolkit app outside Chrome's classes).
- **R1** stands on H, **re-judged at H‴** (task 97, §8.1 point 4: the stored diff unchanged, ok with 0 differences).
- **The class-C steps** (no drag, no handle): F1a, F1b, F2, P1, P2, P3, L5, F3a, F3b and F4.
- **The class-B steps at twice the load:** L2a, L2c, L3a, L3c, L3d, L3e, L4b and L4c. They stand on H, and they had no
  idle-form pilot. Ruling 828(c)'s pilot covers idle steps that ran on 0.4.0, and their next runs record the counter.
- **V5 at H** stays as recorded beside this run, re-judged at H′ = `0495b1a7` (above). The sitting here is the H⁗ run
  that ruling 847 asks for.

### D1, the cross-check (§8.1 point 2; ruling 854)

`h4/scripts/compare-drag.mjs`, in the form of M4's `compare-settle.mjs`, compares D1's H⁗ summary with its H record
`out/D1.pinned-release/run/summary.md` (`h4/scripts/crosscheck-D1.txt`).

- **The shipped lane is the same in every cell:**
  - `cua` took 30/30 in each of select, range, scroller, dnd and canvas;
  - every cua verdict is the same (PASS, and dnd's #358 declared gap);
  - every witness is the same (dnd `changed` at both, as M4 recorded it), and the pinned build took 30/30 throughout;
  - the judges' verdict is PASS at both, no "Incomplete or failed" line at either, and no foreign window was acted on.
- **The 0 ms control lane moved by one sample in two cells, and a reference lane in one:**
  - select: cua:0ms 27/30 at H vs 28/30 at H⁗;
  - scroller: cua:0ms 4/30 at H vs 5/30 at H⁗;
  - canvas: newest (the vendor's newest build, a reference lane) 22/30 at H vs 23/30 at H⁗.
- So D1 does not differ, and §8.1 point 3's full rerun is not called for.

### E1

E1 is complete at H⁗. Its fragile scenarios ran through the audit proxy as task 97 built it (ruling 818): the
interrupted drag's and the interrupted click's rows carry `sent: {traced: true, conn: 1, …}`, the span of the run's
own connection read from the trace. Both scenarios are "same" against the pinned build. The key hold whose window is
destroyed is "same but the declared answer (interrupted_hold)" on both lanes.

### The counter pilot (ruling 828(c))

**Which steps.** Task 98's reach table (`m5/l4a-fix/README.md` §6 on `origin/m5-l4a-fix`) lists the class-B steps. The
idle steps among them that start their engines through engine.mjs are D1, D3, D4, D5, E1, P4, P6, P5 and C1. Each ran
once, uncounted, in pilot form, at idle (their counted load profile): `gate.mjs run <step> --pinned home-x64-041 --dev
--pilot 2 --engine-stats` (`h4/pilot/`, 23:23–00:08Z, every one exit 0).

| step | reading (`settle-check.mjs`, `h4/scripts/settle-pilot.txt`) | drags / drag_handles sent to cua lanes |
|---|---|---|
| D1 | not taken: entered 0, second_rest 0, skipped 0, unsettled 0, settle_failed_activation_confirmed 0 (12 cua engines; 1 without a counter sent no drag) | 40 / 0 |
| D3 | not taken, all zero (12 engines; 1 sent no drag) | 40 / 0 |
| D4 | not taken, all zero (18; 1) | 64 / 0 |
| D5 | not taken, all zero (30; 1) | 48 / 0 |
| E1 | not taken, all zero (133 engines) | 45 / 78 |
| P4 | not taken, all zero (3; 1) | 40 / 0 |
| P6 | not taken, all zero (3; 1) | 40 / 0 |
| P5 | not taken, all zero (7; 1) | 80 / 0 |
| C1 | not taken, all zero (2 engines) | 2 / 0 |

**No "taken": no step moves to class A.** Every zero is read from the engine's `settle_final` exit line.

V2–V5 and Z0 are class-B `:0` steps, so they reran in the sitting here.

### settle-check over every step directory at H⁗

| out root | step: reading |
|---|---|
| `h4/out/` (counted; `settle-counted.txt`) | **H1, H2, L4a: TAKEN** (entered 560 each; second_rest 0, 6 and 8; skipped, unsettled and settle_failed_activation_confirmed 0). These are class A by design: their Electron cells are where the settle decides, and they reran here as class A. D1, D2, E1, L1, L2b: unknown, since the counted lanes take no `--stats` (834) and their cua lanes read `no stats: not recorded`. S1 and L3b: unknown, since their engines start through cua's service and 843 excludes them from the opt-in |
| `h4/pilot/` (`settle-pilot.txt`) | all 9 not taken (above) |
| `h4/zero/` (`settle-zero.txt`) | V1, V2: not taken (all zero, final). V3, V4, V5, Z0: unknown. V3–V5's audit engines run with `stats: false` (2, 2 and 20 cua engines without a counter; every recorded one entered 0), and Z0's lanes take no stats. V3–V5's audit drags are 843's static exclusion: Chrome, Gecko, GTK 4, or a minimized gedit refusing, none of the settle's family |

### The judges' counts the brief asks for

- **L4a's residue** (827 3b, t17-fix3's plain cell at twice the load):
  - cua plain: **0 of 100** honest unconfirmed non-landings, against a bound of 2 (floor(2·100/100));
  - cua:handle plain: **0 of 100**, bound 2;
  - **false oks 0**.
- **Ruling 830's zone-truth mismatches:** none in 320 drags of the window's cells, in each of H1 (idle), H2 (window
  load) and L4a (twice the load).
- **Ruling 838's H2-root unverified ends by answer:** cua:desktop root **0 ok** and 30 unconfirmed of 30; cua:handle
  root **0 ok** and 30 unconfirmed of 30. The ok count is zero, so there is no finding. In H1 (idle) the root cells'
  ends were all verified: 30 of 30 unconfirmed on each lane.
- **#365's declared race:** 0 of 60 in each of H1, H2 and L4a. **T14's share:** 0 of 200 landed drops answered
  unconfirmed in each.

### The `:0` sitting

- **The GO:** ruling 862, relayed by the controller, for the owner's window of 2026-11-19 02:30–08:00Z (hard stop
  08:00Z). The plan was sent at about 01:41Z, with V1, V2, V3, V4, Z0 and V5, then the conditional V5 slots on the
  controller's decision only (last start 07:05Z).
- **The pre-check** (`zero-precheck.out`, 02:27:13Z):
  - no hold-sittings and no stress-ng;
  - the owner's Chrome at pid 2546101 and the pointer at 142,130;
  - no `/tmp/cua171-run-*`, and `gate.mjs leftovers` clear;
  - task 59's Firefox on PATH, and google-chrome 156.0.8078.73.
- **How it ran.** One hold of the host lock, holder t105-x64, from 02:30:01 to 05:27:20Z (`run-sitting.sh` →
  `sitting-locked.sh` → `sitting.sh`).
  - Each step ran `gate.mjs print`'s command (`zero-commands.txt`) with only its leading `locked.sh t105-x64` stripped.
  - Each step was capped at 55 min and admitted only if it fit before 08:00Z.
  - Inside each command are the sitting launcher and run71.sh under M5's wrap71.

| step | wrap71 samples | flags | decoy connections | leftovers | owner-watch | owner-diff | pointer | all-clear |
|---|---:|---:|---:|---|---|---|---|---|
| V1 | 17378 | 0 | 0 | none | done after 217 checks; changed=0 | mtime ~/.config/google-chrome | restored to 142 130, reads 142 130 | clear |
| V2 | 11584 | 0 | 0 | none | done after 148 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V3 | 17467 | 0 | 0 | none | done after 222 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V4 | 11737 | 0 | 0 | none | done after 153 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| Z0 | 4628 | 0 | 0 | none | done after 64 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V5 | 14929 | 0 | 0 | none | done after 207 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear (the sitting's exit: 1, V5's verdict) |

owner-diff's one difference is the owner's own Chrome writing its profile's mtime, as in every sitting. No all-clear
was NOT CLEAR, so ruling 857's form did not arise. Every V step read "text windows a lane ended: 0" on every lane.

**Ruling 857(b)'s foreign scan** (task 106's `scan-foreign.mjs`, copied as is to `h4/scripts/`, over V1–V5's
`run/results.jsonl`; `h4/scripts/scan-foreign.txt`): **0 foreign findings in every step.**

| step | findings | audits | end rows | trace | text restores (pinned/newest/cua) | scene ends (pinned/newest/cua) |
|---|---:|---:|---:|---|---|---|
| V1 | 0 | 16 | 1 | clean | 43 / 0 / 0 | 0 / 0 / 0 |
| V2 | 0 | 30 | 1 | clean | 0 / 0 / 0 | 0 / 0 / 0 |
| V3 | 0 | 69 | 1 | clean | 0 / 0 / 0 | not recorded |
| V4 | 0 | 28 | 1 | clean | 0 / 0 / 0 | 0 / 0 / 0 |
| V5 | 0 | 52 | 1 | clean | 0 / 0 / 0 | not recorded |

The conditional V5 slot was not used, on the controller's word: a rerun could not erase this run's verdict under 836.

### V5 at H⁗, ruled

V5's stored verdict is "**FAIL**: device-chrome-dnd chrome_dnd_late_take_shared cua". The other 51 of its 52 rows pass,
`chrome_dnd_shared` among them, so ruling 756's judge held live. No cell reads incomplete and no sample was excluded as
premise-unmet, so this is not route D's stop. The stored verdict stands as recorded.

| cell | its judge at H⁗ | the re-judge (the ruling's instrument) | the ruling |
|---|---|---|---|
| `chrome_dnd_late_take_shared` | "a drop the witness did not record on 1 of 9 samples (2/0)". Sample 2/0's dragend came 221 ms after the press, after the witness span closed (the answer at 164.02 ms + 20 ms). Its notice, its read and its next request's refusal all pass. This is ruling 680's shape; T5's at H was 0/0 | Task 89's read-only `rejudge-680` script (`m5/x64/scripts/rejudge-680/`) over the stored rows, with H⁗'s harness (`h4/scripts/v5-680-diag.sh`, output `v5-680-diag.txt`): **pass**, "9 samples; the witness span's limit: 2/0 (dragend 221 ms after the press, answer 164.02 ms + 20); every other rule passes". Rows 52, failing none; replaced only this row; other terminal failures none. Controls: the stored rows PASS; all 7 negative controls FAIL as expected (notice missing; next acting request not refused; the drop early; no drop where the witness recorded; a foreign change at cleanup; preparation over the cap; an operation with no verdict) | **passes by ruling 680, as at T5 (the design session, 2026-11-19, sminos 867; the script is the instrument of the ruling, and the stored FAIL stands beside it)** |

## At H6 on 0.4.2 (task 123), 2026-11-20 to 2026-11-21

**What ruling 929's reach reruns on x64, at the frozen head H6 = `69bd7993` on linux-engine-v0.4.2.** They ran on the
#171 x64 VM (`dc-linux171-1e68`) from 2026-11-20T22:24Z. The records are in `h6/`: `out/` holds the counted private
steps, `zero/` V5's `:0` sitting, and `scripts/` task 123's launchers and records.

- **Class A at idle**, every one exit 0 and passing by its own judge at H6: C1, K1, K2, K3, D1, D2, S1, H1 and H2.
- **Class A at twice the load:**
  - L1, L2a, L2b, L3b, L4a, L4b and L4c exit 0 and pass.
  - **L3a FAILS on the declared #429 limit, now extended to x64 at twice the load** (the design session, after
    ruling 950). chrome-text `activate_window` reached 41 runs without 30 in a row. Two runs read
    `_NET_ACTIVE_WINDOW` 91–94 ms late (below).
  - It is not rerun. Ruling 950's measurement (`a950/`) reads (b): X focus on the target at the answer in every run,
    on 0.4.1 and 0.4.2 alike.
- **Ruling 953's shipped twin** (`a953/`, plan `t14-long`, #459): 0 false oks, 0 stale-position drops in 100.
- **V5** passes every one of its 52 verdicts on `:0`, in the owner's window (ruling 933, GO 939). Its all-clear is clear.
- **S2**, the cross-check for the steps that only gained new reads (V4, S4, L3c, L3e), is **the same** as its record
  at H in every cell. So those four don't rerun.
- **Item 9** passes: the fresh-home install equals the pin, and doctor exits 0.
- **H6's local proof** passed before any counted step.

### Setup

- **Checkout:** `t123-x64`, a fresh worktree detached and clean at `69bd7993e1f1cb252574939bd6e8e80674bab5b8`. It got
  a real `npm ci`, `node node_modules/electron/install.js` (electron v44.9.0), and xprobe through the cargo wrapper, all
  under the lock (`h6/scripts/setup.sh`, `setup-t123.log.txt`). It had 0 changes before and 0 after.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64-042`, its own `cua install` under a HOME of the run's
  with an empty secret store (`install-home.sh`, `.log.txt`).
  - It holds linux-engine-v0.4.2, sha256 `a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78`, which
    is the pin's x64 asset and the brief's.
  - The engine reads `cua-engine 0.4.2 (9371d2348cf8)` and is static-pie, with install.json build `pinned`.
  - `gate.mjs check --pinned` exited 0: attested (linux-engine.yml run 44796908527 on `release/linux-engine-v0.4.2`),
    native/linux-engine as at 9371d234, and the checkout at 69bd7993 and clean.
- **Chrome (F2):** google-chrome 156.0.8078.73 for the judged steps and V5. K2 takes the extracted current stable,
  158.0.8127.36. Task 59's Firefox is first on PATH.
- **The owner's Chrome** kept pid 2546101 (started 11-02 20:16:10) throughout, read by `ps` only, never signalled.
- **Disk (ruling 937):** 51G free at the idle block's start, 50G at the twice-load block's and at V5's.

### H6's local proof and item 9, under `locked.sh task123-x64`

| part | UTC (11-20) | result |
|---|---|---|
| harness suite (`npm run test:linux-engine-diff`) | 22:27:32–22:28:19 | 1403 tests: 1398 pass, 0 fail, 4 skipped, 1 todo; exit 0 |
| harness-dbus (the gate's line) | 22:28:19–22:28:43 | 91/91; exit 0 |
| item 9 (`item9.sh` in `private-desktop.mjs --session`, `:1`) | 22:28:43–22:29:16 | **passes**. `cua install --engine` exit 0. The engine's sha256 equals the pin; `file` reads static-pie; `--version` reads `cua-engine 0.4.2 (9371d2348cf8)`; install.json build `pinned`. `CUA_NATIVE_ENGINE=cua cua doctor` exit 0, `engine` PASS (0.4.2), `accessibility.enabled` PASS, and its three chrome-route rows BLOCKED as at H (no Chrome registration in an empty home). No engine process of the home left, the home removed, the private desktop's watchdog clean |

The proof ran `scripts/linux-engine-gate/local-proof.sh` with the parts the brief names (`h6/scripts/proof.sh`, logs in
`h6/scripts/proof/`). ci-gate on H6 is the controller's: GREEN 8/8, run
[44824501779](https://github.com/SSFSKIM/cua/actions/runs/44824501779).

### The step table at H6

Lock lines are from `host-lock.log`, holder `task123-x64` (`h6/scripts/lock-lines.txt`). Private steps ran one per hold
through `drive.sh`/`step.sh`, with a quiet wait inside the hold. The idle block was fenced at 02:15Z, so no step could
still run when V5's window opened. The twice-load block ran L1 and L2a before the fence and resumed after V5's hold was
released. Load is the 1-, 5- and 15-minute average.

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| C1 | 69bd7993 | 11-20 22:29:16 | 22:30:06 | 22:32:18 | 2.2 | 0 | 0.85 0.96 0.58 | 0.41 0.80 0.57 | clean; end check clear | PASS: every band at its minimum (below) |
| K1 | 69bd7993 | 11-20 22:32:18 | 22:32:18 | 22:35:21 | 3.0 | 0 | 0.41 0.80 0.57 | 0.34 0.69 0.58 | clean; end check clear | every verdict PASS; the canary relative (below) |
| K2 | 69bd7993 | 11-20 22:35:21 | 22:35:21 | 22:38:21 | 3.0 | 0 | 0.34 0.69 0.58 | 0.31 0.61 0.58 | clean; end check clear | every verdict PASS on Chrome 158.0.8127.36; the canary relative |
| K3 | 69bd7993 | 11-20 22:38:21 | 22:38:21 | 22:39:31 | 1.2 | 0 | 0.31 0.61 0.58 | 0.51 0.59 0.57 | clean; end check clear | complete: dragstart-150 10/10 and dragstart-400 10/10 landed inside B (ruling 900) |
| D1 | 69bd7993 | 11-20 22:39:31 | 22:39:31 | 23:03:29 | 24.0 | 0 | 0.51 0.59 0.57 | 0.78 0.74 0.65 | clean; end check clear | PASS; #358 declared: cua 371.4 ms against newest's 338.7, the interval [29.2, 36.9] within 40 ms (cua:0ms 365.7, [20.6, 31.6]). At H⁗: 369 against 338.4, [24.6, 33.2] |
| D2 | 69bd7993 | 11-20 23:03:29 | 23:03:29 | 23:22:59 | 19.5 | 0 | 0.78 0.74 0.65 | 0.42 0.49 0.50 | clean; end check clear | PASS |
| S1 | 69bd7993 | 11-20 23:22:59 | 23:22:59 | 23:58:03 | 35.1 | 0 | 0.42 0.49 0.50 | 0.50 0.89 0.81 | unclean: pid 1264445 openbox; end check clear | complete (#302, 4 of 30 on electron-input press_key, listed apart, as at H⁗) |
| H1 | 69bd7993 | 11-20 23:58:03 | 23:58:03 | 00:16:11 | 18.1 | 0 | 0.50 0.89 0.81 | 0.79 0.46 0.56 | clean; end check clear | no false ok, no missing landing, no false error |
| H2 | 69bd7993 | 11-21 00:16:11 | 00:16:11 | 00:34:47 | 18.6 | 0 | 0.79 0.46 0.56 | 0.24 0.40 0.50 | clean; end check clear | the same, at the gate's window load |
| S2 | 69bd7993 | 11-21 00:34:47 | 00:34:47 | 01:01:24 | 26.6 | 0 | 0.24 0.40 0.50 | 0.62 0.48 0.45 | unclean: pid 1387597 openbox; end check clear | complete; the cross-check (below) |
| L1 | 69bd7993 | 11-21 01:01:40 | 01:01:40 | 01:31:46 | 30.1 | 0 | 0.48 0.46 0.44 | 16.64 16.67 14.59 | clean; end check clear | the judges' verdict PASS |
| L2a | 69bd7993 | 11-21 01:31:46 | 01:34:57 | 01:58:56 | 24.0 | 0 | 0.91 8.93 11.92 | 17.15 16.97 15.99 | clean; end check clear | the judges' verdict PASS |
| V5 | 69bd7993 | 11-21 02:30:02 | 02:30:02 | 03:07:37 | 37.6 | 0 | 0.15 0.26 2.30 | 1.30 1.19 1.21 | all-clear clear | **every verdict PASS** (52 rows; below) |
| L2b | 69bd7993 | 11-21 03:08:34 | 03:08:34 | 03:24:52 | 16.3 | 0 | 0.63 1.02 1.15 | 17.38 16.55 11.55 | clean; end check clear | the judges' verdict PASS |
| L3a | 69bd7993 | 11-21 03:24:56 | 03:28:17 | 04:00:22 | 32.1 | 1 | 0.88 8.51 9.33 | 16.86 17.05 16.17 | unclean: pid 1718078 openbox; end check clear | **FAIL**: "chrome-text activate_window background (shipped): no 30 consecutive passing runs in 41" (below) |
| L3b | 69bd7993 | 11-21 04:02:24 | 04:03:44 | 04:21:57 | 18.2 | 0 | 0.93 8.78 13.03 | 16.74 16.72 15.79 | unclean: pid 1769370 openbox; end check clear | complete (#302 listed apart: electron-input press_key 1 background, 3 desktop) |
| L4a | 69bd7993 | 11-21 04:21:57 | 04:25:37 | 04:45:19 | 19.7 | 0 | 0.96 8.25 12.55 | 16.99 16.89 15.84 | clean; end check clear | no false ok, no missing landing; residue 0 (below) |
| L4b | 69bd7993 | 11-21 04:45:25 | 04:48:46 | 05:02:38 | 13.9 | 0 | 0.85 8.49 12.67 | 17.44 16.81 15.37 | clean; end check clear | complete: no false ok, 0 of 300 landed drops unconfirmed. The `cua:accept` measurement lane's 6 false releases (3 answered ok) are listed apart, as at H: that lane does not ship |
| L4c | 69bd7993 | 11-21 05:04:56 | 05:05:46 | 05:08:12 | 2.4 | 0 | 0.87 9.01 12.57 | 15.65 12.07 13.20 | clean; end check clear | PASS: every band at its minimum (below) |

**What stands, and on which SHA.** Every other step stands on its record as above, for these reasons:

- V4, S4, L3c and L3e stand on H (`fefe306c`) on 0.4.0, because S2, their cross-check, is the same (below).
- Steps outside ruling 929's reach stand on their records: at H, and at H⁗ for E1 and for V1–V4 and Z0 (the sitting
  there).
- R1–R4 rerun with the flip at T10 (929), not here.

### C1's bands (ruling 931)

From `C1.pinned-release/run/summary.md`:

| band | cells | drags | its outcome | minimum | late takes |
|---|---|---:|---|---:|---:|
| inside | freeze-600 | 10 | 10 landed after a take inside the hold | 7 | 0 |
| edge | freeze-646, -648, -650, -652 | 20 | – | – | 3 |
| past | freeze-700 | 10 | 10 answered the hold notice, with no drop and nothing sent after it | 7 | 0 |

The judge counted 0 false ok, 0 unjudged, 0 false alarms, 0 missing landings, and 0 harness Escapes. 12 drags never
took and were answered as plain drags. T14's share is 0 of 25 landed drops answered unconfirmed.

**Each of the edge band's late takes, judged in full** (`h6/scripts/late-takes.mjs`, output `late-takes-C1.txt`):

| cell | take after the release | the answer | the read | the next request | the engine's Escape after the release | drop |
|---|---:|---|---|---|---:|---|
| freeze-648 #2 | 0.5 ms | ok with the hold notice ("the page may have started a drag that did not complete"; `hold.adaptive.way` noticed) | the late notice ("Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop a…") | refused with it | 1.8 ms | none |
| freeze-650 #4 | 0.7 ms | the same | the same | refused with it | 2.1 ms | none |
| freeze-652 #4 | 0.4 ms | the same | the same | refused with it | 2.4 ms | none |

In each one, the engine saw no take by its release (`hold.taken` false), and `late_dnd` was recorded with
`escaped: true`.

### L4c's bands (ruling 931), at twice the load

| band | cells | drags | its outcome | minimum | late takes |
|---|---|---:|---|---:|---:|
| inside | freeze-600 | 10 | 9 landed after a take inside the hold | 7 | 0 |
| edge | freeze-646, -648, -650, -652 | 20 | – | – | 2 |
| past | freeze-700 | 10 | 10 answered the hold notice, with no drop and nothing sent after it | 7 | 0 |

- 0 false ok and 0 unjudged.
- The inside band's one drag that didn't land is freeze-600 #0.
  - Chrome, thawed at 605 ms, made no take by press + 650. Its ping was unanswered at 397 ms.
  - It answered ok with the hold notice, and nothing started on the page. That is honest.
- **The two late takes, judged in full** (`late-takes-L4c.txt`):
  - freeze-648 #1 and #4 were taken 0.7 and 2.3 ms after the release.
  - Each answered with the hold notice, the read carried the late notice, and the next request was refused.
  - The engine's Escape came 2.5 and 3.6 ms after the release, and nothing dropped.

### L3a's failure (not rerun; ruling 950)

From `L3a.pinned-release/run/results.jsonl`, the cell's settle-series and settle-run rows:
- **The cell:** chrome-text `activate_window` background, the shipped lane, covered. It ran 41 runs with 2 misses,
  both "late" (0 never, refused or invalid, 0 false ok). Its streak at the end was 0, so 30 in a row was never
  reached.
- Every other L3a cell, and every audit, passes.
- **The two misses**, trials 24 and 40:
  - The engine answered ok at 1.4 and 6.6 ms, after sending the activation at 6.2 and 5.0 ms.
  - At the read after the 10 ms settle, the oracle found the window manager's `_NET_ACTIVE_WINDOW` not yet naming
    the target (`wm: false`; action-settle.mjs `fromOracle`). For a Chromium page the oracle has no application
    state, so its reading is the window manager's alone.
  - The property named the target 94.2 and 91.3 ms late.
  - The other 39 runs read it within the settle.
- **The comparison:** at H (`fefe306c`, 0.4.0) the same cell was 30 of 30 with no miss. 0.4.2 changes only the drag
  hold, the late-take watch, the ping and identification. activate_window's path and its 10 ms settle are as at M4.
- **The shape** is the one declared for arm64 at twice the load (rulings 871, 872, 876; `tech-debt-tracker.md`):
  `_NET_ACTIVE_WINDOW` lags the answer by about 85–108 ms while the X focus is already the target's. #429 is its fix.
- **The load:** step start 0.88 8.51 9.33 and end 16.86 17.05 16.17, against fefe306c's 0.95 9.28 13.57 →
  16.68 16.96 16.62.
  - The host's sysstat shows steady stress, with no spike: ldavg-1 14.5–17.7 every 10 min, CPU %nice 97.8–98.0,
    iowait and steal 0.
  - The rows carry no per-trial time, so the two trials can't be placed against it.
- **The verdict:** FAIL on the declared #429 limit, now extended to x64 at twice the load.
- **Ruling 950's measurement** (`h6/a950/`, a development run, never counted; 05:14:57–05:45:36Z):
  - **The setup:** chrome-text's `activate_window` from the covered front window, at twice the load (the gate's 16
    workers on 8 cores) on a private display, under the host lock. It ran 200 runs per engine, one of each in turn.
  - **The method** is task 99's 872b (`m5/arm64/scripts/activation-872b.mjs`), with its XReader unchanged:
    - at the answer, GetInputFocus and `_NET_ACTIVE_WINDOW` read on a connection of the experiment's own;
    - both then polled for 500 ms;
    - one press_key "x" right after the answer, its landing read from the field's own text.
  - **The engines:** 0.4.1 (`c432c8c2…`, the pin at H⁗ = 3b5c0441, attestation verified on
    `release/linux-engine-v0.4.1`, run 44380699966) and the pinned 0.4.2 (`a1314106…`). `a950.mjs` checks each one's
    sha256 against its pin before any run.
  - **No version check was stepped around.** Both engines were started as the service starts them
    (`server --desktop shared`), through the harness's engine client. That client has no version check, and the
    service's MIN_ENGINE_VERSION check is not on this path. No product code was changed.

| engine | runs | failed to start | X focus on the target at the answer | `_NET_ACTIVE_WINDOW` the target at the answer | … by answer + 10 ms | late | lag after the answer median / p95 / max (ms) | focus left the target in 500 ms | key in the target |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 0.4.1 | 200 | 0 | 200 | 152 | 196 | 4 | 0 / 5.2 / 16.5 | 0 | 200 |
| 0.4.2 | 200 | 0 | 200 | 166 | 199 | 1 | 0 / 4.9 / 14.8 | 0 | 200 |

- **Late rates:** 0.4.1 4/200, 0.4.2 1/200. The one-sided Fisher exact p that 0.4.2 is higher is 0.970, so it is not
  clearly above. At these rates the test can catch only a large difference (951).
- **The reading** by the rule fixed before the run (950, 951) is **(b)**:
  - the focus was on the target at the answer in every run of both engines;
  - the key landed in the target in every run;
  - the late rate is not clearly above.
- **The lag** never passed 16.5 ms in these 400 runs, against L3a's 91 and 94 ms.
- **The load:** loadavg 9.74 at stress start (L4c's lagging average), 15.79 after a 2-minute warm-up, and
  17.53 16.99 16.30 at the end. L3a's was 0.88 8.51 9.33 → 16.86 17.05 16.17 at H6, and 0.95 9.28 13.57 →
  16.68 16.96 16.62 at fefe306c.
- A 2-run smoke came first (`a950/smoke/`).

### Ruling 953's shipped twin of L4b (#459; a development run, never counted)

`h6/a953/`, 05:47:29–05:51:59Z. This is plan `t14-long` (cua: long-left 100) at twice the load, on the engine as it ships:
the `cua` lane, with no measurement flag.
- **The launch** is L4b's as the H6 runner gives it (`a953/plan-l4b.txt`, from task 121's launch-plan.mjs), with
  three arguments changed (`a953.mjs`):
  - `--plan t14` became `--plan t14-long`;
  - `--run pinned-L4b` became `--run pinned-a953-t14-long`;
  - `--pilot` was added beside `--pinned`, making it a development run on the pinned release.
  It ran on a private display through display.mjs `runOnPrivateDisplay`, as the gate runs L4b, and L4b's judge
  judged it.
- **The judge:** PASS, with 0 false ok, 0 missing landing, 0 late takes and 0 harness Escapes.
- **Per cell** (`a953/cells.txt`), long-left, 100 drags:
  - Chrome took in every one (`released_with_take` 100), and nothing landed (0 landed, 100 no drop).
  - **0 drops at a stale position**: none landed although the path ended outside the zone.
  - Every drag answered ok with no notice. The read after it carried the unconfirmed-drop notice ("Pending from your
    last drag, an unconfirmed drop: …"), and the next request was refused, in 100 of 100.
  - `after_release.confirmed_by` is `Activation(<the page's window>)` in all 100. That field names the confirmation
    the route waits for (pointer.rs, `format!("{confirming:?}")`), not one that came.
  - From the last step to the release (the wall press-to-release, less `hold.path_ms`): median 0.1, p95 3.4,
    max 5.3 ms, with no keepalive after the floor (`hold.keepalives` 0 in all 100). That is #23's timing: the take
    came at about 17 ms, and the path ran 473 ms with 917 steps after the take.
- **The outcome, by 953's rule:** 0 false oks. On x64 at twice the load, the shipped route reported every one of
  these drops as unconfirmed, and none landed at a stale position. arm64's run gave 7 false oks and 5 stale-position
  drops in 100.

### The hold canary (rulings 930, 932): x64 relative

Each canary takes the plain control's largest warm wait, triples it, and floors the result at 5 ms. The table gives
the ping waits in ms, from each step's summary.

| step | Chrome | held / started | draggable largest | draggable median | plain largest | bar | verdict |
|---|---|---:|---:|---:|---:|---:|---|
| K1 | 156.0.8078.73 | 9 / 9 | 49.7 | 16.3 | 1.2 | 5 | PASS |
| K2 | 158.0.8127.36 | 9 / 9 | 42.9 | 16.3 | 1.3 | 5 | PASS |
| V5 (in step) | 156.0.8078.73 | 9 / 9 | 88 | 57.4 | 1.2 | 5 | PASS |

### S2, the cross-check (ruling 929)

`h6/scripts/crosscheck-s2.sh` compares S2's H6 summary with its record at H (`out/S2.pinned-release/run/summary.md`)
by M4's `compare-settle.mjs`, read-only (`crosscheck-S2.txt`):
- the 30 cells: the same runs and misses, and the same verdicts;
- the 19 audited cells: clean at both, 5 of 5 ran, 0 effects missed;
- neither run has a failure of its own.

The comparator's line: "CROSS-CHECK: SAME verdicts, cells, audits and the runs' own failures". **S2 does not move.**

### The judges' counts

- **Ruling 830's zone-truth mismatches:** none in 320 drags of the window's cells, in each of H1 (idle), H2 (window
  load) and L4a (twice the load).
- **L4a's residue** (827 3b): cua plain **0 of 100** and cua:handle plain **0 of 100**, against a bound of 2 each.
  0 false oks.
- **Ruling 838's H2-root unverified ends by answer:** cua:desktop root **0 ok** and 30 unconfirmed of 30; cua:handle
  root **0 ok** and 30 unconfirmed of 30. The ok count is zero, so there is no finding.
- **#365's declared race:** 0 of 60 in each of H1, H2 and L4a.
- **The adaptive hold's identification (ruling 954; `ident-count.mjs`, `ident-count.txt`).** These are hold records
  as the rows carry them (V5 carries each sample's twice).
  - **0 unidentified anywhere.**
  - V5 carries each sample's record twice (`hold` and `engine_stats.hold`), so its 99 Chrome drag samples give 198
    records.
    - 96 records (48 samples) are identified ("Google-chrome, role browser, application "Google Chrome", executable
      chrome"). They cover chrome_drag_visible_path, chrome_drag_covered_dedicated, chrome_select_nudged,
      chrome_dnd_short_in_front and chrome_dnd_short_pointer_outside_shared, and some of the inzone-out and
      short-covered samples.
    - 102 records are `adaptive: null`, with no identification recorded, because no adaptive hold ran for them (a
      take on the path, or a route that holds nothing).
  - C1 (freeze, idle) 40 of 40 identified, and L4c (freeze, twice the load) 40 of 40.
  - K1, K2 and K3: 36, 36 and 20 identified, as "executable not visible here", since their engines are sandboxed as
    in service (899).
  - The twice-load steps' Chrome cells otherwise record no hold:
    - L1, L2a, L3a: counted lanes without `--stats` (834);
    - L4b: its `cua:accept` lane's 360 records `adaptive: null`, the take on the path;
    - L4a and H1/H2: Electron, `adaptive: null`, never identified as a browser.

### V5 on `:0` (ruling 933's window; GO 939)

- **The plan** was sent at about 22:27Z on 11-20 (`h6/scripts/v5-plan.md`). The GO was ruling 939, relayed by the
  controller.
- **The launch:** `go-v5.sh` waited for 02:30:00Z and for task 123's private drivers to end, then read the precheck and
  refused on any miss. The precheck (`zero-precheck.out`, 02:30:02Z) found:
  - no hold-sittings and no stress-ng;
  - the owner's Chrome at pid 2546101, the load 0.15, and the pointer at 142,130;
  - no `/tmp/cua171-run-*`, and `gate.mjs leftovers` clear;
  - task 59's Firefox on PATH, and google-chrome 156.0.8078.73;
  - 50G free.
- **How it ran:** one hold of the host lock, holder task123-x64, 02:30:02–03:07:37Z (`run-sitting.sh` →
  `sitting-locked.sh` → `sitting.sh`).
  - CUA_LOCK_MAX was the minutes to 08:00Z less 2, and V5 was capped at 55 min. Only V5 ran.
  - The command was `gate.mjs print V5`'s line with only its leading `locked.sh task123-x64` stripped
    (`zero-commands.txt`).
  - Against H⁗'s line it differs only by `--hold-canary relative` (ruling 932), apart from the paths, holder and home.
- **The verdict:** "run valid; acceptance on the pinned release: every verdict PASS". That covers 52 rows, with text
  restores 0/0/0 and no premise exclusion.
- **One span-limited sample, judged live by ruling 680 as encoded (867a):** `chrome_dnd_late_take_shared` cua sample
  2/0, whose dragend came 191 ms after the press, past the witness span (the answer at 168.71 ms + 20).
  - The row's verdict is pass, and its row carries `span_limited: [{sample: "2/0", …}]`.
  - It is the shape x64 showed at H⁗ (2/0, 221 ms, stored FAIL then, re-judged pass under 680) and at T5 (0/0).
  - Now the judge passes it live, as the ruling encodes.
- **The guard records** (`zero-V5.out`):
  - wrap71 took 14963 samples, with 0 flags, 0 decoy connections and no leftovers;
  - owner-watch was done after 209 checks, changed=0;
  - owner-diff's one difference is the owner's Chrome writing its profile's mtime, as in every sitting;
  - the pointer was restored to 142 130 and reads 142 130;
  - tmproot and `/tmp/cua171-run-*` were left empty;
  - all-clear: clear. No hold-sittings was written.
- **Kept traces and rejudge-audit** (`after-V5.txt`): 52 audit rows, every one with `kept_traces` files (52, none
  missing). `rejudge-audit.mjs` reproduces the stored findings: moved 0, unkept 0, foreign 0 stored and 0 now.
- **One stderr line, harmless (ruling 949):** wrap.out carries libxdo's "XGetWindowProperty[_NET_ACTIVE_WINDOW]
  failed (code=1)", which H⁗'s V5 did not have.
  - It comes from one of the harness's own `xdotool windowactivate --sync <id>` calls (xtools.mjs `xdotool()`, an
    execFileSync whose stderr goes through). libxdo's wait loop read `_NET_ACTIVE_WINDOW` as None once while the
    window manager switched activation, then kept polling until the target was active, and the call exited 0.
  - wrap71's process records show 374 such calls, 307 of them focusFront's restore to the scene's front window. No
    other xdotool call read the active window. The line follows the negative checks' lines, so it came from the cell
    loop.
  - On a private display (`xdo-msg-check.sh`, `.txt`), `getactivewindow` with nothing active prints exactly this
    line, plus a second one, and exits 1. V5 shows only the first line, so it wasn't the stub's getactivewindow,
    which succeeded: the negative check failed the stub.
  - No verdict and no witness span reads the value; the helper's output is discarded.

### settle-check over every step directory at H6

`settle-counted.txt` and `settle-zero.txt`, the counter as ruling 834 reads it:

| step | reading |
|---|---|
| H1, H2 | **TAKEN**: entered 560 each, second_rest 0 and 5, and skipped, unsettled and settle_failed_activation_confirmed 0. These are class A by design: their Electron cells are where the settle decides, as at H⁗ (560 each) |
| C1, K3 | not taken: all zero, final |
| K1, K2 | unknown: 2 of 10 cua engines kept no counter, and those were sent no drag or handle. Every recorded one entered 0 |
| L4a | **TAKEN**: entered 560, second_rest 11, the rest 0. Class A by design, its Electron cells, as H1 and H2 |
| L4b, L4c | not taken: all zero, final |
| D1, D2, L1, L2a, L2b | unknown: the counted lanes take no `--stats` (834) |
| S1, S2, L3a, L3b | unknown: their engines start through cua's service, which 843 excludes from the opt-in |
| V5 | unknown: 20 of 218 cua engines are without a counter (its audit engines, `stats: false`). Every recorded one entered 0 |

No step outside class A reads taken.

### Scans before the commit

- **Token-shaped strings:** `h6/scripts/scan-evidence.sh` over `h6/`, file names only: 404 files, 0 hits.
- **Key codes** (rulings 874, 875): `privacy-scan.mjs` (task 109's) over `h6/`, 404 files, found 0 held-code rows and 0
  raw minimized codes.
- **Window titles** (ruling 863): **the live title half was not run on x64.** Its `:0` is the owner's display, and
  reading its windows' titles is a read of that display outside the GO (the controller's word, ruling 947).
- In its place, a structural scan (`title-scan.mjs`) judged every value in the evidence that can carry a window's
  title, name, class or application. That is 8841 JSON fields (title, name, label, app, application, window, owner,
  class, by, source, toolkit and the like), the quoted strings in error and notice sentences, and the double-quoted
  strings on plain-text lines that name a window.
- Every value is one the harness set itself: its `cua171-…` windows, its scene pages' elements, its own instances'
  classes and app names, and its labels. Over `h6/out/` and `h6/zero/` (309 files; `title-scan.txt`) that is 14923 of
  14923, with 0 not its own (8855 of 8855 at the first commit, before L3a–L4c). Over `a950/runs/` and `a953/runs/` (13
  files; `title-scan-a950-a953.txt`), it is 524 of 524. The owner's Chrome appears in the owner-check lines by class and geometry only, as at H⁗.
- `h6/scripts/` holds task 123's own code and records from private displays only. There the scan's other hits are
  quoted strings in that code, and doctor's own device-mode words in item 9's transcript (`:1`).

## At H7 on 0.4.2 (task 129), 2026-11-21

**C1 and L4c rerun counted at the frozen head H7 = `ae3fc1e8` on linux-engine-v0.4.2 (rulings 954–956, 963, 969).**
H7 changes only the `t14-late` plan these two steps run, and its judge
(`../engine-042/h7/README.md`, `../engine-042/h7/fix/README.md`):
- each freeze waits for Chrome's own mark of the press (`_NET_WM_USER_TIME`, bound to the trial by its server time),
  plus 55 ms;
- a stop that can't begin before its thaw is skipped;
- an unidentified or skipped row is unexercised for its band.

Both ran on the #171 x64 VM (`dc-linux171-1e68`) on private displays. The records are in `h7/`: `out/` holds the two
counted steps, and `scripts/` holds task 129's launchers, extracts, scans and lock lines.

- **C1 at idle: PASS.** Inside 10/10 landed, past 10/10 answered the notice, 5 late takes at the edge, all reported.
- **L4c at twice the load: PASS.** Inside 10/10 landed, past 10/10 answered the notice, 3 late takes at the edge, all
  reported.
- **In both:** 0 unexercised, 0 skipped, 0 false ok and 0 unjudged. All 40 sources were identified, and all 40 press
  marks were bound.
- **Re-judged under ruling 957's judge** (96fa1fd3, task 128, ruling 984): no row moved. Both steps still PASS. C1's 24
  and L4c's 20 landings each ended where the path ended, so there are 0 drops at a stale position and 0 path ends in
  the 3 px margin.

### Setup

- **Checkout:** `t129-x64`, a fresh worktree detached at `ae3fc1e80685e192fd75d01a71ac14c034992a77`, inside the shared
  checkout's `.claude/worktrees/`. The brief named task 123's `t123-x64`, but two things stood in the way. The session's
  worktree isolation refuses git there, and task 126 runs its development runs from `t123-x64` at H6, so moving it
  would have changed another task's checkout.
  - The lockfile is the same as H6's.
  - Under the lock it got a real `npm ci`, electron v44.9.0, and xprobe through the cargo wrapper
    (`h7/scripts/setup.sh`, `setup-t129.log.txt`).
  - It had 0 changes before and 0 after.
- **The acceptance home:** task 123's `~/.local/share/cua-171/m5/home-x64-042`, rechecked at H7 (`check-home.sh`,
  `.log.txt`).
  - Its engine's sha256 `a1314106…a85a78` equals the pin's x64 asset.
  - It reads `cua-engine 0.4.2 (9371d2348cf8)` and is static-pie, with install.json build `pinned`.
  - `gate.mjs check --pinned` exited 0: attested (run 44796908527), native/linux-engine as at 9371d234, and the
    checkout at ae3fc1e8 and clean.
- **Chrome:** the installed google-chrome, 156.0.8078.73.
- **Preconditions:** hold-sittings was absent. `df` showed 42G free before C1 and 41G before L4c (ruling 937).
- **The commands:** `gate.mjs print C1` and `print L4c` gave the lines in `scripts/commands.txt`. `print` writes a stub
  of the step's directory, and `run` refuses a directory that exists, so each stub was moved to `out/print/` before its
  step ran.
  - Each step ran as `locked.sh task129-x64 timeout -s TERM -k 60 45m step.sh <step>`, one step per hold.
  - Inside the hold, `step.sh` waits up to 6 minutes for a quiet host (no stress-ng, the 1-minute load under 1.0). It
    then execs the printed line, minus its leading `locked.sh task129-x64`.
- **The holder in the records:** the printed `run` line carries no `--holder`, so each step's `step.json` and README
  name the gate's default holder, `m5-gate`, in their command. The lock itself was held as `task129-x64`
  (`scripts/lock-lines.txt`).

### The step table at H7

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| C1 | ae3fc1e8 | 11-21 07:56:08 | 07:56:08 | 07:58:18 | 2.2 | 0 | 0.45 1.92 6.40 | 0.36 1.35 5.60 | clean; end check clear | **PASS**: every band at its minimum, 0 unexercised |
| L4c | ae3fc1e8 | 11-21 08:18:15 | 08:21:46 (after a 211 s quiet wait) | 08:24:16 | 2.5 | 0 | 0.89 8.82 11.58 | 15.99 12.13 12.41 | clean; end check clear | **PASS**: every band at its minimum, 0 unexercised |

### The bands (ruling 931), from each step's `run/summary.md`

| step | band | cells | drags | its outcome (exercised rows) | minimum | late takes | unexercised |
|---|---|---|---:|---|---:|---:|---:|
| C1 | inside | freeze-600 | 10 | 10 landed after a take inside the hold | 7 | 0 | 0 |
| C1 | edge | freeze-646, -648, -650, -652 | 20 | – | – | 5 | 0 |
| C1 | past | freeze-700 | 10 | 10 answered the hold notice, with no drop and nothing sent after it | 7 | 0 | 0 |
| L4c | inside | freeze-600 | 10 | 10 landed after a take inside the hold | 7 | 0 | 0 |
| L4c | edge | freeze-646, -648, -650, -652 | 20 | – | – | 3 | 0 |
| L4c | past | freeze-700 | 10 | 10 answered the hold notice, with no drop and nothing sent after it | 7 | 0 | 0 |

Both judges counted 0 false ok, 0 unjudged, 0 missing landings, 0 false alarms and 0 harness Escapes.
- C1: 11 drags never took, answered as plain drags. 0 of 24 landed drops were answered unconfirmed.
- L4c: 17 drags never took, answered as plain drags. 0 of 20 landed drops were answered unconfirmed.
- H6 had inside 10/10 for C1 and 9/10 for L4c (freeze-600 #0, honest), with 3 and 2 late takes.

**Each late take, judged in full** (`late-takes.mjs`, output `late-takes-C1.txt` and `-L4c.txt`):

| step | cell | take after the release | the engine's Escape after the release | drop |
|---|---|---:|---:|---|
| C1 | freeze-650 #2 | 0.9 ms | 2.2 ms | none |
| C1 | freeze-650 #3 | 0.0 ms | 1.6 ms | none |
| C1 | freeze-650 #4 | 0.1 ms | 1.1 ms | none |
| C1 | freeze-652 #2 | 2.2 ms | 2.4 ms | none |
| C1 | freeze-652 #3 | 1.5 ms | 3.3 ms | none |
| L4c | freeze-648 #4 | 2.1 ms | 3.8 ms | none |
| L4c | freeze-650 #2 | 2.1 ms | 3.2 ms | none |
| L4c | freeze-652 #3 | 4.6 ms | 4.7 ms | none |

All eight have the same shape:
- the engine saw no take by its release (`hold.taken` false, way `noticed`);
- the answer was ok with the hold notice ("the page may have started a drag that did not complete");
- the read carried the late notice, and the next request was refused with it;
- `late_dnd` was recorded with `escaped: true`, and nothing landed.

On L4c's freeze-652 #3, the engine's own late-drag watch saw the take 1.1 ms after the release. The harness's
observer saw it at 4.6 ms.

### Unexercised and skipped rows, identification, and the press mark's binding

From `h7-bands.mjs` (output `bands-C1.txt`, `bands-L4c.txt`) and `ident-count.mjs` (`ident-count.txt`):

- **Unexercised: 0 of 40 in each step, so 0 per band.** Every row's source was identified, and every stop was credited:
  it began before its thaw, then continued.
- **Skipped: 0 of 40 in each step.** Every row has a freeze record.
- **Identification:** 40 of 40 in each step: "Google-chrome, role browser, application "Google Chrome", executable
  chrome".
- **Press-mark binding:** 40 of 40 bound in each step (`press_time` and `sent_time` both recorded). No mark was passed
  over (`press_ignored` absent).

| step | cell | n | bound | press marked (ms after the send) | value − send (server ms) | stop began (ms after the send) | thawed |
|---|---|---:|---:|---|---|---|---|
| C1 | freeze-600 | 10 | 10 | 4.4–12.4 | 2–10 | 59.4–67.2 | 600–602.8 |
| C1 | freeze-646 | 5 | 5 | 4.8–9.4 | 2–6 | 59–64 | 646.8–648.3 |
| C1 | freeze-648 | 5 | 5 | 4.9–11.4 | 2–8 | 59.3–65.1 | 647.9–651.2 |
| C1 | freeze-650 | 5 | 5 | 4.7–10 | 2–8 | 59.3–64.4 | 651.9–653.4 |
| C1 | freeze-652 | 5 | 5 | 4.4–10.3 | 2–8 | 59.6–64.7 | 653.5–655.8 |
| C1 | freeze-700 | 10 | 10 | 4.5–10.8 | 2–9 | 58.9–65.5 | 699.4–700.7 |
| L4c | freeze-600 | 10 | 10 | 4.2–23.2 | 1–21 | 59.8–78.3 | 601–604.8 |
| L4c | freeze-646 | 5 | 5 | 8.4–30.9 | 2–29 | 65.4–85.3 | 647.8–650.7 |
| L4c | freeze-648 | 5 | 5 | 9.4–19.7 | 7–16 | 64.3–74.1 | 650.3–653.3 |
| L4c | freeze-650 | 5 | 5 | 4.8–20.2 | 1–15 | 59.6–74.4 | 651.2–654.8 |
| L4c | freeze-652 | 5 | 5 | 10.3–22.7 | 4–20 | 64.7–77.4 | 653–658.9 |
| L4c | freeze-700 | 10 | 10 | 3.2–20.5 | 1–14 | 59.5–74.7 | 699.2–702.1 |

- **Each press's server time against the send's:**
  - C1: 2–10 ms after it, median 3.
  - L4c: 1–29 ms after it, median 9.
  - Every value is inside the binding's bounds (2 ms of slack before the send), and far from a stale mark, which is a
    second or more older.
- **The stop against its start rule** (the later of 60 ms after the send, and the mark + 55):
  - Every stop came 53.5–55.5 ms after its mark in C1, and 53.6–57.0 ms after it in L4c. So each began well after
    the mark, and with it the identification the mark follows.
  - The stop's timer (`setTimeout`, on Node's millisecond loop clock) woke up to 1.5 ms (C1) and 1.4 ms (L4c) before
    the rule's start. By more than 1 ms, that happened in 7 rows of C1 and 1 of L4c.
  - The judge doesn't credit a stop by that rule, so no verdict turns on it. H7's development runs had 59 ms minima
    too (`../engine-042/h7/README.md`).

### settle-check, stderr and scans

- **settle-check** over both step dirs (`settle.txt`): not taken, with 0 entered and 0 second rests, as at H6.
- **stderr:** each step has Chrome's startup line ("Read channel stable from …"), as at H6. L4c also has one
  `XGetWindowProperty[_NET_ACTIVE_WINDOW] failed (code=1)`, the same line H6's twice-load steps carry (L2a, L3a, L3b,
  L4a, L4b) and H⁗'s.
- **Token-shaped strings** (`scan-evidence.sh` over `h7/`, file names only): 55 files, 0 hits.
- **Key codes** (`privacy-scan.mjs`): 0 held-code rows and 0 raw minimized codes. It was given no titles: x64's `:0` is
  the owner's display and was not read.
- **Window titles:** the structural scan (`title-scan.mjs`, ruling 947) covered `h7/out/` (29 files: 432 JSON fields
  and 4 quoted strings on text lines). All 436 values are the harness's own, with 0 not its own (`title-scan.txt`).

### L4d at H7.1 (96fa1fd3), at twice the load: FAIL on one false ok (rulings 957, 961, 962, 972, 986)

**L4d is the new counted step:** the shipped Chrome drop route at twice the load. It runs plan `t14-stale` as three
parts in turn, judged by ruling 957's judge (`../engine-042/h7/judge957/README.md`):
1. chrome `t14-long`;
2. chrome `t14-floor`;
3. electron `t17-long`.

It ran once and was not rerun. The record is `h7/out/L4d.pinned-release/`. The extracts in `h7/scripts/` are
`l4d-parts.txt`, `l4d-row8.txt` and `gate459-row8.txt`.

- **Setup:**
  - `t129-x64` was moved to `96fa1fd3b6a30c15eed4de232bc252d41655831e`, detached, with 0 changes. Its lockfile and
    xprobe are as at H7, and the Electron binary was present (44.9.0).
  - home-x64-042's engine still equals the pin, and `check --pinned` exited 0 at 96fa1fd3 (`check-home-h71.log.txt`).
  - hold-sittings was absent, with 41G free.
  - `gate.mjs print L4d --pinned home-x64-042 --holder task129-x64` gave `commands-l4d.txt`, and its line ran under
    `locked.sh task129-x64 timeout -s TERM -k 60 45m`.
- **The run:** acquire and start 09:00:28Z, with no quiet wait (load 0.75 0.48 1.61); release 09:20:32Z, 20.1 min.
  Exit 1, the watchdog clean, the end check clear, the end clean.
- **The verdict, as printed:** "part 1 (chrome t14-long): cua long-left: answered ok with no drop and nothing pending
  on 1 of 100 (#8)".

| part | plan | drags | landed where the path ended | stale-position drops | false oks | honest unconfirmed notices | untaken | in the 3 px margin | judge |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | chrome t14-long (long-left) | 100 | 0 | 0 | **1** (#8) | 99 | 0 | 0 | **FAIL** |
| 2 | chrome t14-floor (plain-long 300, left 30, inzone-out 30) | 360 | 300 | 0 | 0 | 60 (left 30, inzone-out 30) | 0 | 0 | pass |
| 3 | electron t17-long (long-left) | 30 | 0 | 0 | 0 | 30 | 0 | 0 | pass: 30 of 30 exercised (minimum 20) |

Every honest notice was kept: the read carried it, and the next request was refused with it.
- In Electron's long path, the motion after the take ran 442 / 457 / 531 ms (min / median / max), so 92 ms past the floor at
  the least.
- Over t14-long's 100 drags:
  - take after the press: 5.1 / 19.1 / 68.7 ms;
  - path after the take: 402.7 / 457.6 / 587.1 ms;
  - last step to release: 0 / 0.1 / 6.3 ms.

**Row #8, the false ok** (part 1, long-left, block 0, warm):

| take after the press | path after the take | last step to release | Chrome's activation after the release |
|---:|---:|---:|---:|
| 27.0 ms (the harness saw 27.8) | 445.0 ms (path 472.0 ms; 895 steps after the take) | 0.1 ms | 4.8 ms |

- **The engine's answer:** it let the drop drop with the take seen (`released_with_take`, no keepalive, the hold not
  held). It waited on Chrome's activation (`confirmed_by` Activation of Chrome's window), and the activation came. It
  answered a plain ok with no notice, and the next request ran.
- **What landed:** the zone's counter did not move (`plain` drops 0 → 0), and the path ended at page (500, 500),
  outside the zone. So it is a false ok, not a stale-position drop.
- **The page's own dragend reported a copy** (this trial's, stamped with its press). Chrome's accept cursor showed
  after the release.
- **The other 99 rows:** Chrome activated on none of them, and every one answered unconfirmed honestly. Their dragend
  reported no drop.
- **Reading:** Chrome finished this drop as accepted, but the zone never counted it. The release came 0.1 ms after the
  last step, with the path 95 ms past the floor. That is #459's shape. It is x64's first such row: a953 x64 at H6 had
  0 of 100.

**m5-p459's gate on #8, offline** (`gate459-row8.mjs`, read-only, nothing run live). It applies de3bc094's
`release_sync::gate`, `!outlasted || (keepalives == 0 && !last_spaced)`, to the row's recorded fields:
1. **The gate opens:** `gate(true, 0, false)`. The floor sent no keepalive, and its end at the take + 350 ms came
   95.1 ms before the release, so the last step was not spaced.
2. **(b')'s release sync would have run.** The gate was open, the engine let the drop drop with its take seen, and the
   Chromium hold was unguarded.
3. **Option (c) would have answered it unconfirmed:** the gate was open, and its only confirmation was Activation.

**settle-check** (`settle-l4d.txt`): TAKEN. Electron's part entered the settle 30 times, with 0 second rests and 0
unsettled, so L4d reruns as class A.

**stderr:**
- the step's: Chrome's startup line twice, and seven `XGetWindowProperty[_NET_ACTIVE_WINDOW] failed (code=1)` lines,
  as H6's twice-load steps carry;
- Electron's app log (`run/apps/`): Chromium's network-service restart and zygote lines, at the part's end.

**Scans over `h7/` after L4d's copy:**
- token-shaped strings: 86 files, 0 hits;
- key codes: 0;
- titles over `h7/out/`: 44 files, 2603 of 2603 values the harness's own.

## At H8 (0.4.3) (task 135), 2026-11-22

**The counted reach at the frozen head H8 = `048140a2`, on the pinned linux-engine-v0.4.3 (rulings 990 (3), 993,
1037).** 0.4.3 carries three tails: #459's, the in-floor tail, and the handle end's.
- The list is the reach's "Chrome sources only" class A: D1, C1, K1, K2 and K3 at idle, then L2a, L4b, L4c and L4d at
  twice the load.
- H1 is the cross-check against its H6 record.
- Item 9 and the doctor ran on the pinned asset.
- x64's V5 is the owner-window sitting, outside this set. It ran on 11-23 and passes ("V5 at H8", below).

It all ran on the #171 x64 VM (`dc-linux171-1e68`), on private displays only. The records are in `h8/`: `out/`
holds the counted steps, and `scripts/` holds task 135's launchers, extracts, transcripts, scans and lock lines.

- **Every step exits 0 and passes by its own judge.** No row is unexercised or skipped, there are 0 false oks, and
  there are 0 drops at a stale position.
- **L4d passes ruling 993's bar.** Every Chrome cell has 0 false oks and 0 stale-position drops, t14-long's 100 and
  t14-floor's `left` included. Electron's part has 30 of 30 exercised. The 0.4.2 baseline at H7.1 on x64 was 1 false
  ok in 100 (#8).
- **H1 is the same as its H6 record** in every judged cell. Only the accept-cursor measurement signal moves, and
  within chance (Fisher p 0.75 and 0.50). The reach argument stands.
- **Item 9 and the doctor pass.** The fresh-home install equals the pin. The doctor exits 0 with engine PASS on 0.4.3,
  both on the fresh home and on the pinned home. The three chrome-route rows are BLOCKED as before.

### Setup

- **Checkout:** `t129-x64` (`.claude/worktrees/cua-171/.claude/worktrees/t129-x64`), moved to
  `048140a2bde0f6398cc910c1aa14ecf2e7e51004`, detached, with 0 changes. `h8/scripts/setup.sh` and `.log.txt` record:
  - package.json and the lockfile are the same as at its `npm ci` (ae3fc1e8), and so is xprobe's source;
  - the Electron binary is present (44.9.0);
  - google-chrome is 156.0.8078.73, and the extracted current stable is 158.0.8127.36, for K2.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64-043`, its own `node bin/cua.mjs install --engine` under
  a HOME of the run's with an empty secret store (`install-home.sh`, `.log.txt`).
  - Its engine's sha256 is `f1513e79…4d921f`, the pin's x64 asset. It reads `cua-engine 0.4.3 (ba5b043834ce)`, is
    static-pie, and install.json has build `pinned`.
  - `gate.mjs check --pinned` exited 0. That covers the attestation (release run 44966356899, and 44964231636, both
    built from ba5b0438 on `m5-engine-043`), native/linux-engine as at ba5b0438, and the checkout at 048140a2, clean.
- **Preconditions:** hold-sittings was absent before each step, and `df` showed 35–36G free (ruling 937).
- **The commands:** each step's line is `gate.mjs print <step> --pinned home-x64-043 --holder h8-x64`
  (`scripts/commands.txt`). print's stubs are kept in `out/print/`.
  - Each step ran as `locked.sh h8-x64 timeout -s TERM -k 60 45m step.sh <step>`, one step per hold, released at its
    end (`scripts/lock-lines.txt`).
  - Inside the hold, `step.sh` waits up to 6 minutes for a quiet host, then execs the printed line.
  - The driver stops at any nonzero exit; it reached none.

### Item 9 and the doctor (`scripts/item9/`, `scripts/doctor-home/`)

| part | UTC (11-22) | result |
|---|---|---|
| item 9 (`item9.sh` in `private-desktop.mjs --session`, `:1`) | 02:51:33–02:52:04 | **passes**. `cua install --engine` in a fresh home exit 0; the engine's sha256 equals the pin; static-pie; `cua-engine 0.4.3 (ba5b043834ce)`. `CUA_NATIVE_ENGINE=cua cua doctor` exit 0, engine PASS (0.4.3, build ba5b043834ce), `accessibility.enabled` PASS, the three chrome-route rows BLOCKED (no Chrome registration in an empty home). No engine process left, the fresh home removed, the watchdog clean |
| the doctor on the pinned home (`item9.sh home`, `:1`, after the steps) | 04:57:10–04:57:12 | exit 0: every row PASS but the same three chrome-route rows BLOCKED; engine PASS on home-x64-043's 0.4.3. No engine process left, the watchdog clean |

### The step table at H8

The load columns are the 1-, 5- and 15-minute averages. The verdicts are as each step printed them.

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | verdict |
|---|---|---|---|---|---:|---:|---|---|---|---|
| D1 | 048140a2 | 11-22 02:52:06 | 02:52:06 | 03:16:05 | 24.0 | 0 | 0.89 0.47 0.24 | 1.01 0.99 0.79 | clean; end check clear | "The judges' verdict for `cua`: PASS." #358 declared: cua 368.7 ms against newest's 337.9, the interval [27.8, 32.7] within 40 ms (cua:0ms 365.8, [22.8, 32.8]). At H6: 371.4 against 338.7, [29.2, 36.9] |
| C1 | 048140a2 | 11-22 03:16:05 | 03:16:15 | 03:18:25 | 2.2 | 0 | 0.93 0.97 0.79 | 0.87 0.97 0.82 | clean; end check clear | "Every late take reported, no false ok, no drop at a stale position, no missing landing, every notice refused once; every cell of the plan ran." (below) |
| K1 | 048140a2 | 11-22 03:18:25 | 03:18:25 | 03:21:26 | 3.0 | 0 | 0.87 0.97 0.82 | 0.94 1.04 0.89 | clean; end check clear | "every verdict PASS"; the canary relative: draggable 9/9 held, largest 46.7, median 18.2, plain largest 1.6, bar 5 (Chrome 156.0.8078.73) |
| K2 | 048140a2 | 11-22 03:21:26 | 03:21:26 | 03:24:27 | 3.0 | 0 | 0.94 1.04 0.89 | 1.23 1.28 1.02 | clean; end check clear | "every verdict PASS" on Chrome 158.0.8127.36; the canary: 9/9 held, largest 20.5, median 12.1, plain largest 1.2, bar 5 |
| K3 | 048140a2 | 11-22 03:24:28 | 03:24:58 | 03:26:08 | 1.2 | 0 | 0.95 1.21 1.00 | 1.45 1.32 1.06 | clean; end check clear | "every drop whose page started it late landed inside B": dragstart-150 10/10, dragstart-400 10/10 |
| H1 | 048140a2 | 11-22 03:26:08 | 03:26:58 | 03:45:05 | 18.1 | 0 | 0.97 1.21 1.03 | 1.17 1.00 0.96 | clean; end check clear | "No false ok, no drop at a stale position, no missing landing, no false error, every notice refused once; every cell of the plan ran." #365: 0 of 60. The cross-check (below) |
| L2a | 048140a2 | 11-22 03:45:05 | 03:45:25 | 04:09:29 | 24.1 | 0 | 0.98 0.97 0.95 | 17.47 17.39 14.09 | clean; end check clear | "The judges' verdict for `cua`: PASS." |
| L4b | 048140a2 | 11-22 04:09:29 | 04:13:20 | 04:27:11 | 13.8 | 0 | 0.94 8.38 11.13 | 17.50 16.78 14.78 | clean; end check clear | "Every late take reported, no false ok, no drop at a stale position, …": plain-long 300/300 landed, 0 of 300 answered unconfirmed; left and inzone-out 59 of 60 unconfirmed, 0 false ok. The `cua:accept` measurement lane's 5 false releases (1 answered ok) on inzone-out are listed apart, as at H6 (6, 3): that lane does not ship |
| L4c | 048140a2 | 11-22 04:27:11 | 04:31:12 | 04:33:41 | 2.5 | 0 | 0.99 7.72 11.47 | 16.06 11.34 12.28 | clean; end check clear | the same sentence as C1's (below) |
| L4d | 048140a2 | 11-22 04:33:41 | 04:37:01 | 04:57:10 | 20.1 | 0 | 0.98 6.00 9.97 | 17.41 17.27 15.45 | clean; end check clear | "No false ok, no drop at a stale position, no missing landing, no false error, every notice refused once; every cell of the plan ran." (below) |

The idle steps started at a 1-minute load of 0.87–0.98, below the quiet wait's 1.0. The quiet waits took 0–50 s at idle
and 200–241 s after a twice-load step.

### C1 and L4c (ruling 931; rulings 954–956's freeze)

From `h7-bands.mjs` (`bands-C1.txt`, `bands-L4c.txt`) and `late-takes.mjs` (`late-takes-*.txt`):

| step | inside: landed after an in-hold take | edge: late takes, all reported | past: hold notices | unexercised | skipped | identified | press marks bound (press − send, server ms) |
|---|---|---:|---|---:|---:|---:|---|
| C1 | 10 / 10 (min 7) | 5 | 10 / 10 (min 7) | 0 | 0 | 40 / 40 | 40 / 40 (1–9, median 4) |
| L4c | 10 / 10 (min 7) | 4 | 10 / 10 (min 7) | 0 | 0 | 40 / 40 | 40 / 40 (1–25, median 9) |

- **The other counts:** 0 false ok, 0 unjudged, 0 missing landings and 0 harness Escapes. C1 has 24 landed and L4c 18,
  none of them unconfirmed and none at a stale position.
- **Each late take, judged in full:** the engine saw no take by its release (`noticed`). The answer was ok with the
  hold notice, the read carried the late notice, and the next request was refused with it. `late_dnd` escaped, and
  nothing landed.
  - C1's takes came 0.3–1.7 ms after the release, and the engine's Escape 1.5–3.0 ms after it.
  - L4c's takes came 1.1–5.1 ms after the release, and the Escape 1.7–10.2 ms after it.
- **The stop's timer, as at H7:** some stops began up to about 1.5 ms before max(60, mark + 55): 12 rows of C1 and 2
  of L4c by more than 1 ms. Every stop came well after its mark, and the judge doesn't credit by that rule.

### L4d at H8: PASS (ruling 993's bar)

From `l4d-h8.mjs` (`l4d-parts.txt`), with the judge's own `landingOf` and `pendingOf`.

**The gate's reading is derived.** Counted rows carry no `release_sync`: drop-signals.mjs copies none of it from
`--stats`, and a counted run takes no `--engine-stats`.
- **The gate:** by ruling 993's rule, open on a Chrome source whose drop was let go with its take seen, with no floor
  keepalive, and whose path after the take outlasted the 350 ms floor.
- **The schedule:** derived the same way. `after_path` where the gate is open, `in_floor` where it is shut.
- **The check on the derivation:**
  - the open rows' last step came 24.3–31.6 ms before the release, which is the tail's span of 3 × 8 ms;
  - the shut rows released at the floor's end, 350–357.3 ms after the take.
- **Not readable from counted rows:** the tail's `motions` and `visits_dropped`.

Counts are "all (gate open / shut)":

| part | cell | drags | gate open / shut | landed where the path ended | stale-position drops | false oks | honest unconfirmed | untaken | in the margin | Chrome activations |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 chrome t14-long | long-left | 100 | 100 / 0 | 0 | 0 | 0 | 100 (100 / 0) | 0 | 0 | 0 |
| 2 chrome t14-floor | plain-long | 300 | 0 / 300 | 300 (0 / 300) | 0 | 0 | 0 | 0 | 0 | 300 |
| 2 chrome t14-floor | left | 30 | 0 / 30 | 0 | 0 | 0 | 30 (0 / 30) | 0 | 0 | 0 |
| 2 chrome t14-floor | inzone-out | 30 | 0 / 30 | 0 | 0 | 0 | 30 (0 / 30) | 0 | 0 | 0 |
| 3 electron t17-long | long-left | 30 | – (Chrome only) | 0 | 0 | 0 | 30 | 0 | 0 | 0 |

- **Every part passes.** Electron's part has 30 of 30 exercised, against a minimum of 20; its motion after the take
  ran 446.2 / 460 / 502.1 ms.
- **t14-long's timings:** the take came 4.9 / 17.2 / 55.2 ms after the press, and the path ran 415.5 / 457.9 /
  551.3 ms after the take (min / median / max).
- **Chrome never activated on a t14-long drag**, and each drag answered unconfirmed honestly. At H7.1 #8 had activated
  4.8 ms after the release and answered a false ok.
- **plain-long's and left's paths** ended 326–333 ms after the take: the floor's steps end the tail's span early, and
  its in-floor tail fills the rest. plain-long landed 300 of 300 with Chrome's activation and nothing pending.

### H1, the cross-check (ruling 990 (3); `h1-compare.mjs`, `h1-crosscheck.txt`)

H1 at H8 was compared cell by cell with its H6 record, `h6/out/H1.pinned-release/run/summary.md`. Each count that
differs is tested with Fisher's exact test.
- **Electron's judged cells:** 14 lanes and cells, across `cua`, `cua:desktop` and `cua:handle`. Each is the same in
  every column: drags, ends not verified, landed, ok with nothing pending, unconfirmed, other notices, errors and false
  oks. The two columns H7.1's judge added read 0 stale-position drops and 0 ambiguous, in every cell.
- **The take table:** `cua` plain and `cua:handle` plain are the same (100 took of 100, 0 late).
- **The activation signal** is the same.
- **The accept cursor at the release** is a measurement signal. Its true positives went 67 → 63 of 200 (p 0.75), its
  false negatives 51 → 58 (p 0.50), and its indeterminates 82 → 79.
- **0 differences beyond chance** (p < 0.01), so the task did not stop.

### settle-check, identification, stderr and scans

- **settle-check** (`settle.txt`): H1 and L4d read TAKEN, from their Electron cells, as at H6 and H7.1. C1, K3, L4b and
  L4c read not taken. D1, K1, K2 and L2a read unknown, under rulings 834 and 843.
- **Identification** (`ident-count.txt`):
  - C1 and L4c: 40 of 40 identified.
  - K1, K2 (36 each) and K3 (20): identified, with the executable "not visible here", sandboxed as in service.
  - L4b's and L4d's holds record no adaptive identification, as at H7.1.
- **stderr:** Chrome's startup line, as before. There are also `XGetWindowProperty[_NET_ACTIVE_WINDOW] failed (code=1)`
  lines in the twice-load steps (L2a 18, L4d 9, L4b 2), the line H6's and H7's twice-load steps carry.
- **Token-shaped strings** (`scan-evidence.sh` over `h8/`, file names only): 187 files, 0 hits.
- **Key codes** (`privacy-scan.mjs`): 0 held-code rows and 0 raw minimized codes. It was given no titles: x64's `:0` is
  the owner's display and was not read.
- **Window titles:** the structural scan (`title-scan.mjs`, ruling 947) covered `h8/out/` and the two doctor
  transcripts (152 files). Of 6999 values, 6997 are the harness's own. The other 2 are the doctor's own device-mode
  word in its `engine` row, one in each transcript, as at H6. There are no window titles.

### V5 at H8, on `:0` in the owner's window (GO 1087): PASS

**V5 passes at H8 on 0.4.3**: "run valid; acceptance on the pinned release: every verdict PASS". All 52 verdict rows
pass. The all-clear is clear, with no flag, no decoy connection and no leftover.
- It ran once, 2026-11-23 02:30:03–03:07:44Z, in the owner's window (02:30–08:00Z). There was no stop, so none of the
  plan's rerun or conditional slots was used.
- The records are in `h8/zero/` (`V5.pinned-release/`, `zero.log.txt`) and `h8/zero-scripts/` (the launchers, the plan,
  the precheck, the sitting's output and the reads after it).

**The plan and the launch.**
- The plan is `zero-scripts/v5-plan-h8.txt`, under rulings 1046, 1047, 1053 and 1054. It is task 123's H6 plan with
  H8's facts:
  - t129-x64 at 048140a2, clean;
  - home-x64-043 on 0.4.3 (f1513e79…), holder h8-x64;
  - the 55-min cap and the latest start at 07:00Z;
  - a budget of one stop plus one whole rerun, then 823.3/831's two conditional slots, all inside 08:00Z.
- The GO was ruling 1087, relayed by the controller.
- `go-v5.sh first` waited for 02:30:00Z, then read the precheck and refused on any miss. The precheck
  (`zero-precheck.out`, 02:30:02Z) found:
  - no hold-sittings and no stress-ng;
  - the owner's Chrome at pid 2546101, the load 0.33, and the pointer at 142,130;
  - no `/tmp/cua171-run-*`, and `gate.mjs leftovers` clear;
  - task 59's Firefox 159.0 first on PATH, and google-chrome 156.0.8078.73;
  - 32G free.
- **How it ran.** One hold of the host lock, holder h8-x64, 02:30:03–03:07:44Z (`lock-lines.txt`; `run-sitting.sh` →
  `sitting-locked.sh` → `sitting.sh`). CUA_LOCK_MAX was 327 min, the minutes to 08:00Z less 2, and V5 was capped at
  55 min. Only V5 ran.
- **The command** was `gate.mjs print V5 --pinned home-x64-043 --out zero-x64-h8 --holder h8-x64`'s line, with only its
  leading `locked.sh h8-x64` stripped (`zero-commands.txt`). Argument by argument, it is H6's line once the checkout,
  home, out root and holder are placeholders (`compare-v5-line.txt`).
- **wrap71 is exactly H8's** (ruling 1053).

**The capture sidecar (rulings 1046, 1047, 1053, 1054).**
- x64's narrowed copy ran beside the sitting, never as part of it: sha256 `03ee08bd…2d15e478` (`sidecar-sha256.txt`),
  outside the repository. At a flag it would write only the lines naming the flagged peer inode or its path, plus
  `owners.json` under 1047's rule.
- **No flag came, so it captured nothing.** Its log reads "captured False", and it exited 0 on its stop file at
  03:07:44Z.
- Its two conditions before the window are recorded with their count-only outputs:
  - (a) its synthetic test passed on the narrowed build, writing only lines that name the test's inode
    (`narrow-check-test.txt`);
  - (b) `classify-stop.py` reads MATCH on arm's stopped-2 capture narrowed the same way
    (`narrow-filter-arm-stopped-2.txt`, `classify-stop-arm-stopped-2-narrowed.txt`, `narrow-check-arm-stopped-2.txt`).
- The sidecar's sources, its test's records and any raw capture stay on the host, never committed. After M5 is
  accepted, the captures are deleted (1054).

**The verdict and the judges** (`v5-rows.txt`, `run/summary.md`):
- **Rows:** 52 verdict rows, 52 pass, text restores 0/0/0.
- **No exclusions:** no premise exclusion and no span-limited sample. H6's one span-limited sample,
  `chrome_dnd_late_take_shared` 2/0, does not recur.
- **Identification:** 94 adaptive holds identified, 0 unidentified.
- **The hold canary**, relative (rulings 930, 932): draggable `chrome_dnd_short_in_front_shared` 9/9 held, largest wait
  76.8 ms, median 50.3, against the plain control's largest 1.2 and a bar of 5. At H6: 88, 57.4 and 1.2.
- **Kept traces and rejudge-audit** (`after-V5.txt`): 52 audit rows, each with its `kept_traces` file, none missing.
  `rejudge-audit.mjs` reproduces the stored findings: moved 0, unkept 0, and foreign 0 stored and 0 now.
- **settle-check** reads unknown, under rulings 834 and 843, as at H6.

**The guard records** (`zero-V5.out`, `v5-status.txt`):
- wrap71 took 15066 samples, with 0 flags, 0 decoy connections and no leftovers.
- owner-diff's one difference is the owner's Chrome writing its profile's mtime, as in every sitting.
- The pointer was restored to 142 130 and reads 142 130.
- tmproot and `/tmp/cua171-run-*` were left empty. all-clear: clear. No hold-sittings was written.
- The owner's Chrome kept pid 2546101 (started 11-02 20:16:10), read by ps only and never signalled. It appears in the
  owner-check lines by class and geometry only.
- wrap.out carries no `XGetWindowProperty` line this time. At H6 it carried one, ruled harmless (949).

**The scans before the commit:**
- token-shaped strings: 78 files in `zero/` and 35 in `zero-scripts/`, 0 hits;
- key codes: 0 held-code rows and 0 raw minimized codes;
- window titles: the structural scan (ruling 947; `:0`'s live titles are not read) covered 113 files. Of 395 values,
  392 are the harness's own. The other 3 are quoted strings in `after-step.sh`'s own code, and none is a window
  title.

## Corrections

- **The local proof's summary log had false exits** (ruling 774). `scripts/proof-all.sh` wrote
  `echo "$(date …) <part> exit $?"`, whose `$?` was the `date`'s, so its one-line-per-part summary read exit 0 for every
  part. The part logs and the host lock's release lines (`scripts/lock-lines.txt`: `status=1` for both npm test parts,
  `status=0` for the rest) carry the true exits, and the table above was read from them. T5's scripts stay here as what
  ran. Fixed in `c3b97e0e` (task 91): `scripts/linux-engine-gate/local-proof.sh` reads each part's exit straight after
  it ends, and its test fails a summary that misses a failing part.

## Files

- `out/`: each counted step's directory as the runner wrote it (`<step>.pinned-release`: `step.json`, `README.md`,
  `run/` with its raw rows), the driver's log and `zero.log` of the first sitting. V1–V4 and the stopped V5 are there;
  Z0's directory there holds only its printed README, since the first sitting stopped before it.
- `out-rerun1/`: the second sitting's V5 and Z0. `out-rerun1/V5-rejudge-756/` holds task 90's re-judge of the stored
  rows at H′ (`rejudge-fix1.out`, its `*.rejudge-device.jsonl`, and its control `probe-ran.mjs` with `.out`).
- `V5-stopped/`: the proof read from the first V5's records (`v5-flag-proof.py`, `.txt`) and the controller's clearance
  record.
- `f3-out/`: F3's lane, V2 and the stopped V3 (development runs). `F3-V3-stopped/`: V3's flag proof and the clearance
  record (ruling 773).
- `h4/`: task 105's reruns at H⁗ on 0.4.1 (above): `out/` the counted private steps, `pilot/` the counter pilot, `zero/`
  the `:0` sitting, and `scripts/` its launchers, proof logs, cross-check, settle readings, scans and lock lines.
- `h6/`: task 123's reruns at H6 on 0.4.2 (above): `out/` the counted private steps, `zero/` V5's `:0` sitting, and
  `scripts/` its launchers, proof logs, item 9, cross-check, settle readings, canary and late-take extracts, scans and
  lock lines. Logs are kept as `.log.txt`, since the repository ignores `*.log`.
- `h7/`: task 129's counted reruns of C1 and L4c at H7 on 0.4.2, and its counted L4d at H7.1 (above).
  - `out/` holds the three step directories, the driver's log and `print/`, the print's stubs.
  - `scripts/` holds the setup, the home's checks, the printed commands and the driver and step launcher. It also has
    the band, binding and late-take extracts, L4d's part, row and offline-gate extracts (`l4d-*`, `gate459-row8.*`),
    settle-check, the scans and the lock lines.
- `h8/`: task 135's counted reach at H8 on 0.4.3 (above).
  - `out/` holds the ten step directories, the driver's log and `print/`, the print's stubs.
  - `scripts/` holds:
    - the setup, the home's install and its check, and the printed commands;
    - the driver and step launcher, and the step table;
    - the band, binding, late-take, L4d and H1 cross-check extracts, the identification counts and settle-check;
    - item 9's and the pinned home's doctor transcripts (`item9/`, `doctor-home/`);
    - the scans and the lock lines.
  - `zero/` holds V5's `:0` sitting at H8 (`V5.pinned-release/`, `zero.log.txt`).
  - `zero-scripts/` holds:
    - its plan and launchers, the precheck records and the printed command with its comparison to H6's;
    - the sitting's output, the reads after it (`after-V5.txt`, `v5-rows.txt`, `v5-status.txt`) and the lock lines;
    - the stop classifier and the sidecar's narrowing checks, with their count-only outputs, and the sidecar's sha256;
    - the scans.
- `scripts/`: task 89's launchers and records as they ran.
  - The setup, the home, item 9 and its transcript.
  - The local proof and its logs (`proof/`).
  - The driver, the sitting launchers and the printed commands, with the preconditions and guard records.
  - The table, command, declared and median extractors with their outputs.
  - The ruling-680 re-judge's copy (`rejudge-680/`) and its output.
  - The V5 and F3 flag proofs, the orphans' checks, the vendor verification, and the lock lines.
- Every vendor series is committed with its raw rows (`run/results.jsonl` of each step, gzipped over 1 MB), for items
  12 and 13. The guard's decoy sockets and pidfiles are left out. The directory was scanned for token-shaped strings
  before each commit (`scripts/scan-evidence.sh`, file names only): none. It reads no secret values; this task reads
  none.
