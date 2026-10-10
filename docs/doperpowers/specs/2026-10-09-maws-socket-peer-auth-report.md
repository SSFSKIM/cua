# MAWS socket peer authentication (cua board #95): execution report

Spec: `docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md` (this branch). Status: DONE_WITH_CONCERNS. The concern is the open SIGUSR1 route into MAWS main and the supervisor; see Residue.

## PRs and ranges

- **MAWS**: https://github.com/SSFSKIM/MAWS/pull/7. Branch `95-socket-peer-auth`, a35dc53d..4e998773.
  - M1 a925fbdd
  - M2 36cea2a6, review fix 8ab7258d
  - M4 tracker 5178d7f5, PR number 4e998773
- **cua**: https://github.com/SSFSKIM/cua/pull/104. Branch `spec/socket-peer-auth-95`, 9b33a97..HEAD.
  - Spec commits 17d060a and earlier, pre-flight f6474cc
  - M1 dacfd61
  - M3 30d4a6e and 9a23621, review fix 1fde3cf, branch-review fix 8350004
  - In-app browser spec pointer c2b4eee
  - Spec living-section commits throughout
- **Merge order**: MAWS #7 first, then cua #104. Neither is merged.

## Gate tails

### MAWS

- **typecheck / lint**: exit 0 (M2 executor at 36cea2a6; whole-branch reviewer at 5178d7f5).
- **pnpm test**: 11033 passed, 3 failed at 36cea2a6.
  - The failures are the known-flaky `pause-take-over.pty.test.ts` and one `remote-runner` grandchild-cancel case. Both files pass alone, 27/27.
  - The focused peer, admission and cua suites pass 65/65 at the branch head.
- **pnpm e2e:browser-cua**: `7 passed (33.6s)`, exit 0. Run by the controller at 5178d7f5. The executor and reviewer each also ran it 7/7.
- **pnpm e2e:browser**: 8/8 (M2).
- **pnpm build:app && pnpm e2e:packaged**: `61 passed, 140 skipped (4.0m)`, exit 0. Run by the controller at 5178d7f5. The run includes `peerModule === 'loaded'`, and `Resources/peer-auth/peer-auth.node` is present.

### cua

- **`HOME=$(mktemp -d) npm test`**: `# pass 1071`, `# fail 0`, `# skipped 1` (controller, c43d479).
- **npm run test:mods**: `32 pass`, `0 fail`.
- **claude plugin validate .**: `✔ Validation passed with warnings`, the same warnings as before.

### Addon identity

- `diff` of the two `peer-auth.c` files and `cmp` of the two prebuilds both print nothing.
- SHA-256 is 5c94d2b4606c66a0… for the source and 9de92f2c7ceec5d2… for the prebuild.
- Two reviewers rebuilt it from source and got byte-identical output.

## Reviews

Every reviewer ran on opus at high, because of the astra limit.

| Scope | Rung | Verdict | Finding and fix |
| --- | --- | --- | --- |
| M1 | medium | correct | none |
| M2 | medium | correct | P3 shell quoting in e2e scenes 6 and 7; fixed in 8ab7258d, re-reviewed clean |
| M3 | medium | correct | P3 the cua-remote skill still said Node 22; fixed in 1fde3cf, re-reviewed clean |
| cua branch | high | correct | P3 Node 23.0–23.6 lack `--disable-sigusr1`; fixed in 8350004 (`^22.14 \|\| >=23.7`), re-reviewed clean |
| MAWS branch | high | correct | P3 the tracker row's `MAWS PR #<n>` placeholder; filled in 4e998773 |

No unresolved findings. The one ledger Minor, a cloud-VM README line longer than 120 columns, was fixed in 8350004.

## The checks the spec asked for

- **SIGUSR1 in MAWS main (M2).** The check ran only on instances the executor launched over scratch e2e user data. The answer is yes: an inspector opens on 127.0.0.1:9229 in dev main, in packaged main, and in the packaged binary run as Node, which is the detached supervisor. The `EnableNodeCliInspectArguments` fuse is enabled.
  - A no-op `process.on('SIGUSR1')` listener suppresses it on Electron 44.4.5 and keeps Playwright's `--inspect=0` working. It was not applied: it is outside M2's edge, and I asked the coordinator and got no decision before the PRs.
  - The finding is recorded in the spec's Surprises and in the tracker's E13 row ("not applied yet").
- **SIGUSR1 in cua (M3).** `cua serve` and the anchor are now flagged; they open no inspector and stay alive.
  - The vendor launcher (stock Node `cua_node/bin/node`) opens one.
  - The sandboxed kernel and the trusted worker try to, but the default sandbox blocks the listener.
  - Per the owner's ruling, nothing was applied to vendor processes.
- **Real vendor runtime through the checked relay (M3 live probe).** It gets through: a fake MAWS saw `tabs.create`, and nothing was refused.

## Spec changes made during execution

All are in the Decision Log and Surprises, dated.
- **Pre-flight:**
  - M2 and the Interfaces still listed host-loss clearing, which the second review had dropped. Removed.
  - The anchor spawn lives in `src/mcp/upstream.mjs`, not `server.mjs`.
  - The SIGUSR1 residual now has its general form, which the owner confirmed.
- **M1–M4:** each milestone's decisions were folded in as it landed.
- **Chrome-route host:** named by its file. There is no `cua chrome host` command.
- **Node requirement:** `^22.14 || >=23.7`.
- **Outcomes & Retrospective:** written.

## For maws-fe

### (a) P1 A-52 amendment

Where it goes: `docs/doperpowers/plans/2026-10-05-p1-extension.md`, the A-52 row. Append the sentence at the end of the
Decision cell, after "…until the spec's M4 removes it.". This is the form the A-51 and A-54 rows use for their dated
amendments ("Amended 2026-10-08 (…): …").

> Amended 2026-10-09 (cua board #95, MAWS PR #7; the cua spec `docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md`): the 0700 directory is no longer the whole authorization. The socket file is 0600 and each peer is checked at accept, before a byte is read (`pauseOnConnect`): it is accepted only when it runs as MAWS's user and descends from the session's engine process instance (the pid every `session.status` carries, stored with its start time and re-verified at every check; a peer that connects before the first status waits up to 3 s for it), read from the kernel by a committed N-API addon (`LOCAL_PEERPID`, `getpeereid`, `proc_pidinfo`); any other peer is destroyed with one log line naming its pid and reason, and every peer is refused when the addon cannot load. cua's client-mode relay inside `cua serve` applies the same check with that `cua serve` process as its root (plugin 0.7.0); cua's Chrome-route sockets keep the filesystem rule. A peer is accepted by where it sits in the process tree, not by what it is: the engine's descendants (the model's commands among them) and code a same-user process injects through the owner's or a project's Claude Code configuration (hooks, MCP servers, plugin files; the engine loads them under `--setting-sources user,project,local` without `--strict-mcp-config`) are admitted, bounded by the rules every peer meets. Every stock Node process in an admitted tree (the engine's other Node MCP servers, Node processes the model starts, the vendor runtime's Node launcher) opens an inspector on a same-user SIGUSR1, as MAWS's main process and the detached supervisor do, and the supervisor's 0600 token file lets any same-user process take the supervisor over; these routes are accepted by the spec's owner and carried in the tracker's E13 row with the follow-ups that would close them.

Optional companion in the same row's Reason cell, appended:

> Amended by the socket peer authentication spec (its Purpose and "MAWS: the authorizer on the cua socket"); the token alternative was rejected there because the path travels in the engine's argv, the X8 journal and the environment.

If the SIGUSR1 listener lands in MAWS main and the supervisor before this is placed, replace "as MAWS's main process
and the detached supervisor do," with "as MAWS's main process and the detached supervisor did until MAWS PR #7 gave
them a SIGUSR1 listener,".

### (b) P1 interface ledger §6 line

Where it goes: `docs/doperpowers/plans/2026-10-05-p1-interface-ledger.md` §6. Append it to the end of the "Exceptions to
'appended blocks only', dated, one line each" paragraph, after "…and `Navigator.leaveInternal`.". Replace that final
period with "; " and the clause below continues the list, the way #90's clause continues E4c's. It belongs there because
two of its edits are in place: C1's smoke test and the `package.json` key position.

> 2026-10-09, cua board #95 (socket peer authentication, MAWS PR #7) adds the top-level `native/peer-auth/`: the peer identity addon's C source `peer-auth.c`, its committed darwin-arm64 N-API prebuild `prebuilds/darwin-arm64/peer-auth.node` and a `README.md`, rebuilt by hand with `scripts/build-peer-auth.sh` (`pnpm build:peer-auth`) only when the source changes (`build:app` does not run it; the source and the prebuild are byte-identical with cua's copies, and each repository's test pins the source's SHA-256); `electron-builder.yml`'s `extraResources` gains one entry appended after E9's block, `native/peer-auth/prebuilds/darwin-arm64` to `Resources/peer-auth` filtered to `peer-auth.node`, which `src/main/browser/cua/peer.ts` loads when packaged (the committed prebuild under the app root otherwise); `package.json` gains `build:peer-auth` beside `build:helper` and the headers-only devDependency `node-api-headers`; C1's smoke test in `e2e/smoke.spec.ts` gains the `peerModule === 'loaded'` assertion in place after its first expectation (Acceptance 6, run by `e2e:packaged`).

### (c) Charter §19 landing line

Where it goes: `docs/charter.md` §19, after the latest entry. Modeled on the cua board #90 landing line. The
placeholders `<…>` are the controller's PR facts. The gate list shown is M2's branch gate, kept as the shape; replace it
with the PR's gate tails.

> - 2026-10-09 (cua board #95 landed; the cua_repl session's text, placed by the architect): MAWS PR #7 merged at <merge sha> (branch `95-socket-peer-auth`, head <head>; the spec `docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md` lands with cua PR #104). The in-app browser's per-session socket (P1 A-52, amended this day) admits a peer by process ancestry: same uid and a descendant of the session's engine process instance (the `session.status` pid with its start time, re-verified at every check), read from the kernel by a committed N-API addon (`native/peer-auth/`, packaged to `Resources/peer-auth`), refused before any read with one log line, and fail closed when the addon cannot load; cua's relay inside `cua serve` applies the same check with its own process as root (plugin 0.7.0). A token was rejected (the path is in the engine's argv, the X8 journal and the environment). No IPC change, no version slot; the e2e seam `trustRoot` is main-only under `MAWS_E2E`. The tracker's E13 row is amended, not closed: engine descendants and configuration-injected code are admitted; the SIGUSR1 inspector of every stock Node process in an admitted tree, of main and of the detached supervisor, and the supervisor's token route stay open; `--strict-mcp-config` or narrower setting sources for the engine launch is a separate decision. Gates on the branch: typecheck, lint, 11,033 units (1 skipped; two load-flaky files pass alone), e2e browser-cua 7, browser 8, build:app, e2e:packaged 61 with `peerModule` loaded. The owner's live check (the session's socket and the relay each refusing a Terminal `nc -U` with one `not_descendant` line) follows the cua merge and the plugin's update to 0.7.0.

For reference, M2's branch gate values were 11,033 units passed / 1 skipped (two load-flaky files that pass alone),
browser-cua 7, browser 8, packaged 61.


## The owner's sitting (Acceptance 8), after both merges

1. Merge MAWS #7, then cua #104. Update the installed cua plugin to 0.7.0; the marketplace tracks cua's `main`. Restart Claude Code sessions so the plugin's server restarts with `--disable-sigusr1`.
2. Start MAWS on master with `pnpm dev`. In one session, check that `profiles_list` lists `maws` ready, then have the agent drive a tab.
3. In Terminal, with that session still running, try each socket.

   MAWS's per-session socket (userData is `~/Library/Application Support/MAWS` unless `MAWS_USER_DATA` is set):
   ```
   ls "$HOME/Library/Application Support/MAWS/browser/cua/"
   nc -U "$HOME/Library/Application Support/MAWS/browser/cua/<appSessionId>.sock"
   ```
   Expected: `nc` exits at once and prints no `hello`. The `pnpm dev` terminal shows `[browser] cua socket of <appSessionId>: refused peer pid <nc pid> (not_descendant)`.

   cua's relay inside that session's `cua serve` (`$CUA_HOME` defaults to `~/Library/Application Support/cua`):
   ```
   ls "$HOME/Library/Application Support/cua/chrome/m/"
   nc -U "$HOME/Library/Application Support/cua/chrome/m/<name>-<pid>.sock"
   ```
   Expected: `nc` exits at once. The host log `$HOME/Library/Application Support/cua/chrome/logs/<name>.log` gains `relay <name>: refused peer pid <nc pid> (not_descendant)`. The status file `chrome/b/<name>.json` shows `peerCheck: "on"`.
4. Expected throughout: the agent's tab keeps working.

## Residue (for tickets)

1. **SIGUSR1 into MAWS main and the detached supervisor.** Any same-user `kill -USR1` opens an inspector in the whole app, going around both socket checks. The measured fix is a no-op SIGUSR1 listener in main and at the supervisor's entry; it is small and could also land on MAWS #7 if you decide so. Related fuses: `EnableNodeOptionsEnvironmentVariable` is enabled and `OnlyLoadAppFromAsar` is disabled.
2. **The supervisor's 0600 token file** (`src/engine-host/detached.ts`). Any same-user process can read it and take over the supervisor and the session's engine. This is a MAWS-wide authorization question.
3. **`--strict-mcp-config` or narrower `--setting-sources` for the engine launch.** Hooks and MCP servers injected through configuration are admitted as engine descendants. Changing that is a charter decision against §4.1's launch line.
4. **The vendor launcher's SIGUSR1 inspector.** The vendor's stock Node, started by `cua serve`, is an inspector route into the relay's admitted tree. It can only be closed upstream, or by a decision to pass the flag into the vendor launch.
5. **The `remote-runner` grandchild-cancel flake in MAWS.** It failed once in a loaded full run and passes alone. It is not in the tracker.

## Environmental friction

- The M1 executor was cut off once by an API timeout right after committing; it was resumed and finished.
- One `pnpm build:app` attempt hit a temporary DNS failure reaching github.com; the rerun passed.
- `cua #95` closes through `Closes #95` in the cua PR body, per the PR rule. Acceptance 8 still follows that merge.
