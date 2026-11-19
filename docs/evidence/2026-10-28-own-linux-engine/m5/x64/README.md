# #171 M5 T5, the x64 acceptance at H (task 89), 2026-11-16 to 2026-11-17

**Acceptance on the pinned release, counted.** Every step ran at the frozen head **H = `fefe306c`** on the run home's
own `cua install` of **linux-engine-v0.4.0** (`cua-engine` sha256 `751ec9be…`, `cua-engine 0.4.0 (c55c8e08d9cb)`),
taken by the pinned rule inside each step. **Status: every one of the gate's 50 steps passes on its record, item 9 passes, and H's local proof passed before
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

- D1, Chrome, warm medians newest / cua / pinned: canvas 476.4 / 75 / 1146.7 ms; drag and drop 338.2 / 363.8 / 506.9,
  with **#358 declared** (interval [21.9, 28.4], within its 40 ms).
- D3, Firefox: canvas 354.6 / 77.2 / 1149.2.
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
| `chrome_dnd_late_take_shared` | "a drop the witness did not record on 1 of 9 samples (2/0)". Sample 2/0's dragend came 221 ms after the press, after the witness span closed (the answer at 164.02 ms + 20 ms). Its notice, its read and its next request's refusal all pass. This is ruling 680's shape; T5's at H was 0/0 | Task 89's read-only `rejudge-680` script (`m5/x64/scripts/rejudge-680/`) over the stored rows, with H⁗'s harness (`h4/scripts/v5-680-diag.sh`, output `v5-680-diag.txt`): **pass**, "9 samples; the witness span's limit: 2/0 (dragend 221 ms after the press, answer 164.02 ms + 20); every other rule passes". Rows 52, failing none; replaced only this row; other terminal failures none. Controls: the stored rows PASS; all 7 negative controls FAIL as expected (notice missing; next acting request not refused; the drop early; no drop where the witness recorded; a foreign change at cleanup; preparation over the cap; an operation with no verdict) | **pending (680 as at T5)** |

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
