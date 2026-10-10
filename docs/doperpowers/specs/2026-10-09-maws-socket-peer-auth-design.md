# MAWS browser socket: peer authentication for cua's host

Board: SSFSKIM/cua#95 (residue of #13). Repositories: the code lands in MAWS (`/Users/new/Developer/GitHub/MAWS`, master, working branch `95-socket-peer-auth` in worktree `/Users/new/Developer/GitHub/MAWS-wt-95`); this spec lives in cua (`/Users/new/Developer/GitHub/cua-wt-95`, branch `spec/socket-peer-auth-95`). cua's code does not change; two of its documents do (M3).

## Purpose

MAWS serves cua's browser primitives on one Unix socket per app session, `<userData>/browser/cua/<appSessionId>.sock`, and cua's host connects to it from inside `cua serve` (P1 A-51, A-52; the cua spec `2026-10-08-maws-in-app-browser-design.md`, "Session authorization"). Today the only check on a connecting peer is the 0700 directory: any process of the same user that can name the path gets the whole primitive set the moment it connects, before a byte is read, and the primitive set reaches every tab of the session, the owner's imported Chrome profile partition included. The directory is listable by every same-user process, so "knows the path" is not a boundary against other applications on the Mac; the tracker's E13 row records that one site's cookies at a time are readable through request events by such a client (`docs/tech-debt-tracker.md:111`).

This initiative makes the socket refuse every peer that is not a process of the session it serves. The kernel is the only witness that cannot be forged from user space: it knows the peer's pid and uid, and the process table knows the peer's ancestry. A peer is accepted when it runs as MAWS's user and descends from that session's engine process. That admits exactly the processes the design already names as legitimate clients (the session's `cua serve`, a fork subagent's `cua serve`, a `cua profiles list` run inside the session) and refuses every other application, every other session, and any connection made while the session has no engine.

What it does not do, stated plainly: a process the session's own engine started (the model's Bash command among them) is a descendant and is accepted. Which executable it is cannot be told apart from inside the same process tree without forgeable evidence, and the security rules that matter (the cookie-jar refusals, internal tabs out of reach, the takeover hold) are enforced on the MAWS side of the socket for every peer alike, so such a peer does nothing the model cannot already do through cua's tools. The residual is accepted and recorded.

## Progress

- [ ] M1 — The peer identity primitive: a small N-API addon, its build script, the committed prebuild, and the loader with its tests
- [ ] M2 — The authorizer on the cua socket server: engine-pid plumbing, the wait, the refusals, 0600 on the socket, the e2e seam and scenes
- [ ] M3 — Documents, acceptance as written, hand-back

## Facts this design rests on

1. **MAWS speaks first.** On accept, `CuaConnection`'s constructor sends the `hello` notification at once (`src/main/browser/cua/connection.ts:143`); the client sends no hello and no credential (`cua/src/chrome/host.mjs:750`, `runHost` waits for the peer's hello). Every message after that is a primitive request. The check must therefore happen on accept, before the connection object exists.
2. **The socket and its directory.** `startCuaBackend` creates `<userData>/browser/cua` 0700 and sweeps `*.sock` at start (`src/main/browser/cua/index.ts:76-79`); `listen()` creates the server and listens (`index.ts:90-99`); the socket file itself gets no `chmod` (the supervisor socket does, `src/engine-host/detached.ts:198`). Several connections per socket are expected and unlimited (`index.ts:68-72`; the cua spec names a fork subagent's shim, an inventory launch, a relaunched `cua serve`).
3. **A token would not be a secret.** The path reaches the engine as `extraSettings.env.CUA_BROWSER_BACKENDS` (`src/main/sessions/launch-mapping.ts:70`), which `buildLaunch` serialises into `--settings <JSON>` on the engine's argv (`src/engine-host/launch.ts:208`); argv is journaled verbatim (X8, `journal.ts:6-9`) and readable by any same-user process through `ps`. Environment variables are readable the same way: on this Mac `ps -E -p <pid>` prints another same-user node process's environment (checked 2026-10-09). A per-launch token in the hello, the ticket's first candidate, would be as public as the path; it is rejected (Decision Log).
4. **Node and Electron expose no peer credentials.** `net.Socket` has no pid or uid for a Unix-domain peer; the libuv `Pipe` handle has no `getsockopt`. The accepted socket's file descriptor is readable as `socket._handle.fd` (an own getter; valid under Electron 44.4.5's Node 24.21.0 and under Node 22). Nothing in MAWS's or cua's `node_modules` provides `LOCAL_PEERPID`, `getpeereid` or `SO_PEERCRED`.
5. **The Codex desktop app's check** (`authorizeSocketPeer`, native addon `browser-use-peer-authorization.node`, `main-BvBtZhys.js:18774-18842` in the 26.928.40906 readable build) reads `getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN)`, converts the audit token to a pid, walks `proc_pidinfo` ppids up to 64 levels until it meets the Electron main process, and then requires the peer, its parent and its grandparent to carry its own team's code signature. The ancestry half transfers to MAWS; the signature half does not (cua is an unsigned node script, the engine an Anthropic-signed binary) and is not needed for the boundary named above. Codex fails closed when the addon is missing.
6. **MAWS's engine is not a child of MAWS's main process.** The default engine host is a detached supervisor that outlives the app (`src/main/hosts/detached-transport.ts:391-418`); the engine is its child (`src/engine-host/transport.ts:167`). The ancestry root is therefore the engine's own pid, which main already receives: `EngineSessionStatusSchema.pid` (`src/shared/engine/status.ts:19`) arrives with every `session.status` event, the same event that opens the socket today (`src/main/browser/index.ts:191-193`), and an engine that outlived a main restart reports it with its first status (D-16).
7. **Native pieces already in MAWS.** `node-pty` (an N-API prebuild loaded from beside the asar, `electron-builder.yml` `asarUnpack`), the Swift dictation helper built by `scripts/build-voice-helper.sh` into `build/voice-helper` and shipped through `extraResources`, located at runtime by `helperPath()` (`src/main/voice/helper-backend.ts:26-29`: `resourcesPath` when packaged, the repo path in dev). `clang` and `xcrun` are present; `node-gyp` and `electron-rebuild` are in `node_modules/.bin`. No N-API C header is in `node_modules` today (`node-addon-api` ships only its C++ wrapper).
8. **macOS `lsof -U`** prints each Unix socket's kernel address and its peer's (`->0x…`), 66 ms for a full scan on this Mac. It is the alternative that needs no native code (Decision Log).
9. **The e2e fake host** (`e2e/browser-cua.spec.ts`) connects from the Playwright test process, which descends from no engine; under `MAWS_E2E=1` the engine is a stub. The seam is `globalThis.__maws_browser.cua` (`src/main/browser/index.ts`, `inspector.cua = cua`).
10. **Orphans reparent to launchd on macOS.** A process whose parent exited has ppid 1. That is how a test makes a same-user process that is not a descendant of the test: spawn through a shell that backgrounds the connector and exits.

## Design

### Shape

One new main-process module, `src/main/browser/cua/peer.ts`, answers two questions about an accepted socket: who is the peer (pid, uid) and whether that pid descends from a given root. It gets the facts from a small N-API addon, `native/peer-auth/peer-auth.c`, that wraps three system calls and nothing else; the policy stays in TypeScript. `startCuaBackend` gains an authorizer that runs on every accept, before `CuaConnection` is constructed, and either hands the socket on or destroys it with a logged reason. The root for a session is its engine pid, pushed into the backend from the `session.status` event that already opens the socket.

### The addon (M1)

`native/peer-auth/peer-auth.c`, plain C against the N-API C header (`node-api-headers`, a headers-only devDependency; `NAPI_VERSION 8`), compiled by `scripts/build-peer-auth.sh` with `clang -shared -fPIC -O2 -undefined dynamic_lookup -target arm64-apple-macosx13.0` into `native/peer-auth/prebuilds/darwin-arm64/peer-auth.node`. The prebuild is committed (as node-pty's is shipped): N-API is ABI-stable, so the same file loads under Electron's Node and under the Node that runs the unit tests, and a fresh checkout needs no compiler. The script is run by hand when the C source changes; a unit test guards a stale prebuild by comparing the addon's exported `version` with `PEER_AUTH_VERSION` in `peer.ts` (both bumped together). The script refuses off Apple-silicon macOS like the voice helper's does.

Exports, each a thin wrapper that throws a plain `Error` carrying `strerror` on failure:

- `peer(fd: number): { pid: number; uid: number }` — `getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID)` and `getpeereid(fd)`.
- `parent(pid: number): number` — `proc_pidinfo(pid, PROC_PIDTBSDINFO)` → `pbi_ppid`; `0` when the process is gone or unreadable.
- `version: number`.

Packaging: `electron-builder.yml` `extraResources` copies `native/peer-auth/prebuilds/darwin-arm64` to `Resources/peer-auth`; the loader resolves `peer-auth/peer-auth.node` under `process.resourcesPath` when packaged and under the repo root in dev, the voice helper's rule. The addon is loaded with `process.dlopen` on first use.

### The authorizer (M2)

`peer.ts`:

- `PEER_AUTH_VERSION`, `ANCESTRY_LIMIT = 64`, `PEER_ROOT_WAIT_MS = 3000`.
- `peerOf(socket): { pid, uid } | null` reads `socket._handle?.fd` (null when absent, which refuses).
- `descends(pid, root, parent = addon.parent): boolean` walks `pid → parent(pid)` at most 64 steps; true when it meets `root` (the root itself counts: a peer that is the engine process is accepted), false at `0`, `1` or the limit.
- `authorizePeer(socket, roots: number[], deps): PeerRefusal | null` applies, in order: `module_unavailable` (the addon failed to load; the log line names `scripts/build-peer-auth.sh`), `peer_unavailable` (no fd or `peer()` threw), `uid_mismatch` (`uid !== process.getuid()`), `no_engine` (`roots` is empty: no engine pid and no trusted seam root), `not_descendant` (the peer descends from none of `roots`). `roots` is the session's engine pid, when known, plus the e2e seam's trusted roots.

`startCuaBackend`:

- `CuaBackend.engineProcess(appSessionId, pid: number | null)` records the session's root. `src/main/browser/index.ts`'s `session.status` subscription calls it with `status.pid` when the process is not exited and `null` when it is, beside the existing `socketPathFor` call. The root survives a main restart because the first status of a surviving engine carries its pid (D-16).
- On accept: if the session's root is `null`, the socket waits up to `PEER_ROOT_WAIT_MS` for `engineProcess` to set one (the engine's MCP servers start within the first second of the engine, and the status event precedes them; the wait covers ordering, not a missing engine), with the socket paused and its data unread; then `authorizePeer`. A refusal destroys the socket, logs `cua socket of <appSessionId>: refused peer pid <pid> (<reason>)` through `log` (no pid logged when it is unknown), and increments the session's `refused` count, visible in `inspect()`. Acceptance constructs `CuaConnection` as today.
- `listen()` does `chmodSync(path, 0o600)` after `server.listen` succeeds (the `listening` event).
- Existing connections are not re-checked when the root changes or the engine exits: an exited engine takes its `cua serve` with it, and the close handler already releases everything.
- E2E seam: under `MAWS_E2E=1`, `inspector.cua.trustRoot(pid)` adds a pid to the session-independent root set; `authorizePeer` accepts a peer that descends from any trusted root or from the session's engine. The fake host test registers its own `process.pid`. The seam is compiled in only behind the existing `env.MAWS_E2E === '1'` branch, like `__maws_browser` itself.

### cua's side

No code change. `cua serve` keeps dialing and waiting for the hello; a refused peer sees the socket close and retries every 5 s as today (`client-mode.mjs:57-81`), which is the behaviour a wrong setup should show. The two sentences that say "the path is the session's authorization" (`src/chrome/client-mode.mjs:3-4`, `README.md` "For MAWS") change to say the path plus MAWS's peer check (M3).

### Lifecycle and failure table

| Situation | Behaviour |
| --- | --- |
| `cua serve` of the session connects after the engine's first status | root known; accepted at once |
| `cua serve` connects before main processed the status | waits ≤ 3 s for the root; accepted when it arrives |
| a fork subagent's `cua serve`; `cua profiles list` run by the model's Bash | descendants of the engine; accepted |
| a Terminal `nc -U <path>`; another app; another session's process | `not_descendant`; destroyed before any hello; one log line |
| a root-owned process | `uid_mismatch` |
| the session's engine exited; a peer connects | `no_engine` after the 3 s wait |
| the engine outlived a main restart | its first status carries the pid; accepted as before |
| the addon fails to load (missing file, wrong arch) | every peer refused with `module_unavailable`; the log names the build script; the socket still listens so cua's retries keep showing the symptom |
| the peer process exits mid-walk | `parent()` returns 0; `not_descendant` |
| e2e under `MAWS_E2E=1` | the test's pid is a trusted root; the fake host is accepted; an orphaned connector is refused |

### What users see change

Nothing in the app. The browser works for the session's agent exactly as before. A same-user process outside the session that connects to the socket is cut off at once instead of being served.

### Out of scope

Executable or code-signature identity of the peer (forgeable or inapplicable here, see Purpose). Linux (MAWS is macOS; `peer.ts` refuses with `module_unavailable` elsewhere). Re-checking live connections on root change. Any change to the primitive filter (A-51).

## Acceptance

1. **Unit, the addon:** a child process spawned by the test connects to a listening socket; `peer(fd)` reports the child's pid and the test's uid; `descends(childPid, process.pid)` is true. A connector spawned through `sh -c '(node connector.js &)'` (reparented to launchd) connects; `descends(itsPid, process.pid)` is false. `parent(<a pid that has exited>)` is 0. The committed prebuild's `version` equals `PEER_AUTH_VERSION`.
2. **Unit, the authorizer** (fake `peer`/`parent` doubles, no addon): the five refusal reasons in order; a root arriving within the wait accepts; a root arriving after the wait does not; the socket is destroyed with nothing read; `inspect()` counts `refused`; a trusted e2e root accepts a peer that is not an engine descendant.
3. **Unit, the server:** after `listen`, the socket file's mode is 0600; an accepted connection still gets the `hello` first; two accepted connections per socket still work (the existing cases in `index.test.ts` run under an authorizer that accepts the test's own descendants).
4. **e2e `browser-cua`:** the existing five scenes pass with the fake host accepted through the trusted root; a sixth scene connects an orphaned same-user process to the socket and asserts it is closed before any hello, with `inspect()` showing `refused: 1` and `connections` unchanged.
5. **Packaged:** `pnpm build:app` writes `Resources/peer-auth/peer-auth.node` into the app; `pnpm e2e:packaged` stays green.
6. **Live, the owner's sitting:** in their MAWS (`pnpm dev` run by the owner), a session with the cua plugin lists `maws` ready in `profiles_list` and drives a tab; in Terminal, `nc -U "<userData>/browser/cua/<appSessionId>.sock"` exits at once and the browser log shows the refusal line with the reason `not_descendant`.

## Constraints binding every milestone

- **Repositories and branches.** MAWS work on branch `95-socket-peer-auth` in worktree `/Users/new/Developer/GitHub/MAWS-wt-95` (never the main checkout, which stays on master); this spec and its Progress in `/Users/new/Developer/GitHub/cua-wt-95` on `spec/socket-peer-auth-95`. One MAWS PR at the end; the spec's PR to cua main after it.
- **MAWS's standing rules.** D-1 (the engine is never touched). No version slot moves (no settings, index or file-format change). Ledger §5: no IPC change; the e2e seam is main-only under `MAWS_E2E`. P1 A-52's "no peer credential check" sentence is amended by a dated line that maws-fe writes from the text M3 supplies; the tracker's E13 cookie row (`docs/tech-debt-tracker.md:111`) is closed by the executor in the PR.
- **Nothing logs a value:** the refusal line carries pid and reason only; never a path's user segment beyond what the existing log lines already print.
- **No new runtime dependency**; `node-api-headers` is a devDependency used only by the build script. The prebuild is committed with its source and a one-line `README` in `native/peer-auth/` saying how to rebuild.
- **Fail closed.** A missing or unloadable addon refuses every peer; it never falls back to an unchecked accept.
- **Verification.** Each milestone's review at its boundary by `doperpowers:reviewer-medium`; the whole-branch review before the MAWS PR by `doperpowers:reviewer-high` (on opus while astra is at its usage limit). Executors on opus at high.
- **The owner's constraints** carried from earlier work: no attribution footers; never kill Chrome or hosts on the owner's Mac; executors never launch the owner's MAWS build (the e2e harness over scratch user data is fine); the owner runs `pnpm dev` for the sitting.

## Plan of Work

### M1 — The peer identity primitive

Deliverables: `native/peer-auth/peer-auth.c`, `native/peer-auth/README.md`, `scripts/build-peer-auth.sh`, `native/peer-auth/prebuilds/darwin-arm64/peer-auth.node` (built and committed), `node-api-headers` devDependency, `src/main/browser/cua/peer.ts` (loader, `peerOf`, `descends`, `PEER_AUTH_VERSION`, the resource path rule) and `peer.test.ts` covering Acceptance 1 and the version guard. `electron-builder.yml` gains the `extraResources` entry. Proof: `pnpm typecheck && pnpm lint && pnpm test -- peer`, and `pnpm build:app` listing the `.node` under `Resources/peer-auth`.

### M2 — The authorizer on the socket server

Deliverables: `authorizePeer` and the refusal reasons in `peer.ts`; `engineProcess` on `CuaBackend` and its call from `src/main/browser/index.ts`'s `session.status` subscription; the accept path in `index.ts` with the root wait, the refusal log, the `refused` count in `inspect()`, `chmod 0600`; the `trustRoot` seam; unit tests for Acceptance 2 and 3 (the existing `index.test.ts` cases adapted to inject an accepting authorizer or a trusted root); the sixth `browser-cua` scene (Acceptance 4). Proof: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm e2e:browser-cua` 6/6, `pnpm e2e:browser` green.

### M3 — Documents, acceptance as written, hand-back

Deliverables: the tracker row closed (dated, pointing at this spec); the cua repository's two sentences changed (`client-mode.mjs` header comment and `README.md` "For MAWS") in a cua PR beside this spec's; the text for maws-fe in the report (the A-52 amendment line, a ledger §6 line for the new native piece, a charter §19 landing line); the whole-branch review; Acceptance 5 run; Acceptance 6 handed to the owner as the sitting; the report at `docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-report.md` in the cua worktree; the MAWS PR.

## Concrete Steps

Working directory for MAWS commands: `/Users/new/Developer/GitHub/MAWS-wt-95` (created with `git worktree add -b 95-socket-peer-auth ../MAWS-wt-95 origin/master`, then `pnpm install --frozen-lockfile`; after M1 adds the devDependency, `pnpm install` once and commit the lockfile).

- M1: `scripts/build-peer-auth.sh` → prints the prebuild path; `pnpm test -- peer` loads the committed prebuild under Node and exercises Acceptance 1. `pnpm build:app` → `ls dist/mac-arm64/MAWS.app/Contents/Resources/peer-auth/peer-auth.node`.
- M2: `pnpm typecheck && pnpm lint && pnpm test` (the tracker's known flaky `pause-take-over.pty.test.ts` may fail in a full run and must pass alone), `pnpm e2e:browser-cua` (6 passed), `pnpm e2e:browser` (8 passed).
- M3: `pnpm build:app`, `pnpm e2e:packaged`; the whole-branch review; `gh pr create` against master with the gate tails; the cua PR for the two sentences.
- Spec progress: `cd /Users/new/Developer/GitHub/cua-wt-95 && git add docs && git commit` at every stopping point.

## Interfaces and Dependencies

- `native/peer-auth/peer-auth.c` exports `peer(fd) → {pid, uid}`, `parent(pid) → number`, `version → number`.
- `src/main/browser/cua/peer.ts`: `PEER_AUTH_VERSION`, `ANCESTRY_LIMIT`, `PEER_ROOT_WAIT_MS`, `peerAddonPath({ packaged, resourcesPath, appRoot })`, `loadPeerAddon(path?)`, `peerOf(socket)`, `descends(pid, root, parent?)`, `authorizePeer(socket, roots: number[], deps) → PeerRefusal | null` with `PeerRefusal = { reason: 'module_unavailable' | 'peer_unavailable' | 'uid_mismatch' | 'no_engine' | 'not_descendant'; pid: number | null }`.
- `CuaBackend` (`src/main/browser/cua/index.ts`): `engineProcess(appSessionId, pid: number | null)`; `inspect()` entries gain `refused: number`; `CuaBackendDeps` gains `peer?: { authorize: typeof authorizePeer }` for tests and `trustedRoots?: Set<number>` for the seam.
- `src/main/browser/index.ts`: the `session.status` handler calls `cua.engineProcess(appSessionId, status.process === 'exited' ? null : status.pid)`; the e2e inspector gains `cua.trustRoot(pid)`.
- `electron-builder.yml`: `extraResources` entry `from: native/peer-auth/prebuilds/darwin-arm64, to: peer-auth, filter: [peer-auth.node]`.
- `package.json`: devDependency `node-api-headers`; script `build:peer-auth`.
- cua: `src/chrome/client-mode.mjs:3-4` and `README.md` "For MAWS" wording only.

## Surprises & Discoveries

(none yet)

## Decision Log

- 2026-10-09 (authoring, the verification call): one `doperpowers:adversarial-reviewer` round on the whole document (design and execution section; technical-heavy), on opus while astra is at its usage limit; branch rungs `reviewer-medium` per milestone and `reviewer-high` for the whole branch, since the change is a security boundary.
- 2026-10-09: a per-launch token presented in the hello (the ticket's first candidate) rejected: it would travel in the engine's `--settings` argv, the X8 journal and the environment, all readable by any same-user process (Fact 3); it narrows nothing the path does not already narrow.
- 2026-10-09: peer identity through an N-API addon over `LOCAL_PEERPID`, `getpeereid` and `proc_pidinfo` chosen over an `lsof -U` peer-link lookup (Fact 8). The owner chose the addon: kernel-exact, Codex's precedent, and MAWS already carries native pieces; `lsof` parses an external tool's output and the cua Chrome spec rejected such lookups as platform-specific and racy. Alternative kept: `lsof` if a compiled component ever becomes unacceptable.
- 2026-10-09: the ancestry root is the session's engine pid, not MAWS's main process (Fact 6: the engine lives under a detached supervisor and outlives main). Code-signature identity (Codex's second half) not adopted: inapplicable to an unsigned node client and unnecessary for the boundary this spec names.
- 2026-10-09: fail closed when the addon is unavailable (Codex's rule), with the log naming the build script; the alternative, an unchecked accept with a warning, would silently restore today's exposure in a mis-built app.

## Outcomes & Retrospective

Pending — written at finish.
