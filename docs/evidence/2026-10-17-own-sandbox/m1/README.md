# M1 on the mini, 2026-10-17

M1's held runs (task-4 report, "Held runs"; `scripts/sandbox-probe/m1-mini.sh`), on the mini.

**Status.** M1's final SHA is 5d9bf70. Every item reruns there so that the evidence carries one SHA. Earlier runs are kept as attempts under `m1/<item>-attempt-N/`.

**Where the runs come from.** Attempt 1 ran from M1's working checkout. During the cfprefs attempt, M1's executor committed four times into that checkout (15:42:57Z to 15:58:22Z), so the two sides of that measurement ran different harness code: before recorded f4bec92, after recorded 080981b. From the rerun on, the harness runs from a separate clone that nothing else writes to, and the evidence is committed on `feat/115-own-sandbox-m1-evidence`.

# The rerun at 5d9bf70

**Gate.** Every step had two readings about 45 s apart before it and a frontmost check after it. The current mini rules applied (load under 5). The readings are in `mini-rules/sitting-log.txt`. GUI-bound groups also had the runner watched during the run (MAWS DL 58), with a reading every 30 s; a busy runner, a queued macOS job or a system dialog would have ended the run's own process tree. The watch never fired.

## Tier discovery: proceeds

- Run: 16:26:18Z; gate loads 4 and 4.05.
- File: `tier-discovery/tier-check.json`.
- Result, unchanged from attempt 2: `projects/` absent; 0 tiers, 0 symlinked, 0 absent targets.

## Oracles: PASS

- Command: `sh scripts/sandbox-probe/m1-mini.sh oracles 5d9bf70`; exit 0 at 17:23:32Z.
- Gate: loads 4.68 and 4.9. The gate first waited from 16:27Z to 17:22Z while the mac lane's runner worked through a queue of about 30 MAWS macOS jobs.
- Fingerprints: all four comparisons have `judgement.ok` with no undeclared difference. They are golden kernel against cua kernel, and signed CLI against cua worker, each in scoped and default.
- Port against the signed capture: equal argv and profile in both modes. The environment differs only in the CLI's arg0 PATH entry and `__CF_USER_TEXT_ENCODING`.

## Own-sandbox: PASS

- Command: `sh scripts/sandbox-probe/m1-mini.sh own-sandbox 5d9bf70`; exit 0 at 17:24:30Z.
- Gate: loads 4.77 and 4.01.
- File: `own-sandbox/own-sandbox.json`. **76 of 76 checks PASS** across scoped, default and disabled.
- The new store-root checks use a scratch HOME's store, browser surface only, and run under sandbox-exec with no helper and no GUI. Each check passes both plain and through a symlinked `~/.config`:
  - a store root missing at launch is not created;
  - once created mid-session, it stays denied;
  - once created mid-session, it cannot be listed.

## cfprefs, attempt 2 (90cbfe0 against 5d9bf70): no judgement; a design conflict

- Command: `sh scripts/sandbox-probe/m1-mini.sh cfprefs 90cbfe0 5d9bf70 ssfs`.
- Run: 17:25:59Z to 17:42:49Z; gate loads 4.65 and 4.63.
- Watch: the runner watch ran from 17:35:36Z to the end of the run without firing.
- Files: `cfprefs-attempt-2/`.

**Before side (90cbfe0).** Cells 150/150 and services 41/41, both complete with assertions PASS.

**After side (5d9bf70).** Both suites failed at connect with "MCP exited (1)". The ssh stderr, kept outside the evidence for diagnosis, shows the serve refusing:
- `sandbox_conflict`: "what JavaScript cells may not read overlaps: `<CUA_HOME>/home/.config/<store>` and `<CUA_HOME>`; `<CUA_HOME>/home/.config/cua` and `<CUA_HOME>`";
- raised from `assertDenyListShape`, called by `assertSandboxFits`, called by `openConnection`.

Why it refuses:
- repl-parity's prepared endpoint puts the run's HOME at `<endpoint home>/home`, inside its CUA_HOME (`scripts/repl-parity/prepare-device.mjs`).
- On macOS, M1 denies the whole cua home and refuses a store or `~/.config/cua` nested inside it.
- Linux denies the home's private directories one by one, so the GCE lane is unaffected.
- Attempt 1's after side at c55ba01 most likely failed the same way.

**Chrome.** Before (17:25:07Z) pid 36513 with 1 ssfs tab; after (17:42:50Z) pid 36513 with 1 tab. Chrome was never quit. Both preparations were removed.

## Parity: not run

Parity would meet the same refusal, so it waits for the layout decision.

# Attempt 2

## Tier discovery, attempt 2 (e4bfece): proceeds

This is a non-GUI check, gated like every other step. It ran at 16:09:11Z with gate loads 3.72 and 3.88, and Terminal was in front afterwards.

It runs that checkout's `denyListFor` (scoped; the list the default mode's launch builds) on the mini's real HOME and real secret store, as the account. The store path is built in code. The check only lists `projects/` and lstats its entries, opens nothing under the store and creates nothing; it never calls `prepareDenyTargets`. It reports class and counts only, in `tier-discovery-attempt-2/tier-check.json`:
- outcome: **proceeds**;
- `projects/`: absent;
- tiers found 0, symlinked tiers 0, absent targets 0.

e4bfece stopped being final right after this check, when the deny-target creation ruling changed the code (macOS creates nothing; Linux's creation is bounded). Oracles had not started at e4bfece. The whole rerun restarts from this check at the new final SHA.

# Attempt 1

## SHA split (attempt 1)

- **Oracles at 107c291.**
- **Everything after them at c55ba01.** That is own-sandbox, M1's accept-native, and, still to run, cfprefs and parity.

c55ba01 changes only `scripts/accept/own-sandbox.mjs`, which escapes its probe cell's nested template, and adds a load test. At 107c291 the file did not parse ("SyntaxError: Unexpected identifier 'exit'", line 70). The 15:16:56Z own-sandbox attempt therefore stopped before any check, and accept-native, which imports the file, would have crashed on load. The oracles never load that file.

## Gate

Every step was gated under the current mini rules: the residue branch's `scripts/mini-rules.mjs` at fac6aa0, with a 1-minute load under 5, the refined frontmost rule and unread CI observations re-read. The gate is a wrapper outside the repo that imports those rules; it is needed because this branch's own `gated` still carries load < 2 and the old frontmost rule. The wrapper:
- takes two readings about 45 s apart before each step;
- checks the frontmost application after each step;
- logs both to `mini-rules/sitting-log.txt`, with every reading's load.

The mini's scratch clone `~/cua-115/repo` held task 1's uncommitted working files. They were set aside losslessly with `git stash push -u` ("task-1 working files (M0a), set aside for M1 checkout 107c291, 2026-10-17"), so that `m1-mini.sh` could check out a detached commit. `git stash pop` restores them.

## Oracles (107c291): PASS

Command: `sh scripts/sandbox-probe/m1-mini.sh oracles 107c291`. It exited 0 at 15:15:42Z. The gate's loads were 4.63 and 4.77.

Results, in `oracles-attempt-1/`:
- **Golden kernel vs cua kernel, and signed CLI vs cua worker.** Each pair was compared in both modes, scoped and default. All four comparisons have `judgement.ok`, with no undeclared check, environment, cwd or sandbox difference.
- **Port vs signed capture.** In both modes the argv and the profile are equal and no parameter differs. The environment differs only in the CLI's own arg0 PATH entry and `__CF_USER_TEXT_ENCODING`.

## Own-sandbox (c55ba01): PASS

Command: `sh scripts/sandbox-probe/m1-mini.sh own-sandbox c55ba01` (`scripts/accept/own-sandbox.mjs --home ~/cua-115/home`). It exited 0 at 15:19:49Z. The gate's loads were 4.97 and 4.2.

The report is `own-sandbox-attempt-1/own-sandbox.json`: 71 checks PASS and 0 FAIL, across scoped, default and disabled plus the check on a store created after the session started.

## accept-native at c55ba01, with item 11

This is the second run of the TextEdit pair. It came right after main's accept-native at 94366c1, which is recorded on the residue branch at `m0/accept-native-main/`. The owner was standing by.

Setup:
- the remote script is the residue's `ACCEPT_REMOTE`, run with its own scratch clone `~/cua-115-accept-m1` at c55ba01;
- the approved home is `~/cua-115/home`;
- the approved-runtime preparation and cleanup came from the harness clone, first moved to c55ba01 with `node scripts/native-baseline.mjs prepare --device mini --commit c55ba01`, because its prepare.mjs recognises M1's session-temp TMPDIR witness;
- the run used `--live-secrets --live-textedit` with a generated key only.

Timing: the gate's loads were 4.71 and 4.73. The run took from 15:30:50Z to 15:34:46Z. The cleanup exited 0.

**Front after the run.** TextEdit was in front. For this run only, the controller allowed that case, provided the TextEdit pid started inside the run's window. Pid 27875 started at 15:34:17Z, inside the window from 15:30:45Z to 15:34:46Z, so the run was accepted. TextEdit was left running.

The report is `accept-native-attempt-1/acceptance.json`. Overall: FAIL.

| Item | main 94366c1 | M1 c55ba01 | Note |
|---|---|---|---|
| 1 npm test | FAIL (2 of 2586) | FAIL (8 of 2765) | the same two failing tests as main, plus six of M0/M1's tests, below |
| 2 pinned install | FAIL | FAIL | cascade from item 1; download mode BLOCKED in both |
| 3 doctor | FAIL | FAIL | cascade from item 1 |
| 4 serve, verify.mjs | PASS | PASS | |
| 5 live TextEdit fixture | PASS | PASS | |
| 6 secrets | FAIL (cascade only) | FAIL | the cascade, plus the **live probe-secrets** failure below, which main did not have |
| 7 substitution | FAIL (cascade only) | FAIL | the same cascade and live probe-secrets failure |
| 8 lifecycle | FAIL | FAIL | cascade from item 1 |
| 9 release gates | BLOCKED | BLOCKED | |
| 10 packaging | FAIL | FAIL | the same detached-clone and home-path checks; more files match |
| 11 own sandbox (#115) | n/a | **PASS** | 71 of 71 checks, in scoped, default and disabled |

**Item 1, the two tests main also fails:**
- `unit proof must exist, run by npm test and actually pass its exact named test`, in test/repl-parity/coverage.test.mjs:14;
- `selected-stage completeness reports later contracts as pending, never covered`, in test/repl-parity/inventory.test.mjs:298.

**Item 1, the six M0/M1 tests that fail only here:**
- test/native-baseline/approved-runtime.test.mjs:165, `ownership is the exact executable plus the run's TMPDIR; …`;
- test/sandbox-probe/capture-argv.test.mjs:50, `a missed capture window ends each attempt's whole tree, not only the launcher`;
- test/sandbox-probe/capture-argv.test.mjs:60, `a tree that ignores SIGTERM is killed after a bounded wait, and the probe still returns`;
- test/sandbox-probe/capture-argv.test.mjs:69, `a descendant that left the attempt's process group is ended too`;
- test/sandbox-probe/capture-argv.test.mjs:78, `after a catch, a launcher that does not finish is ended with its whole tree`;
- test/sandbox/seatbelt.test.mjs:75, `on a Mac, every golden fixture replays on the real filesystem too`.

On the controller (macOS, a branch checkout), all eight pass: 32 of 32 across those five files. Under accept-native's environment on the mini they fail. That environment is `env -i` with the preparation's TMPDIR and XDG_CONFIG_HOME, in a detached scratch clone. The report keeps only the names, so the cause is not established.

**Items 6 and 7, the live probe-secrets failure.** It is the step "error: fail-closed store unreadable: initialize failed". In that phase, scripts/probe-secrets.mjs:353-356 serves with a HOME whose store directory is mode 0000 and expects the call to fail with `secret_unreadable`. Under M1, the launch itself is refused, so `initialize` fails. The reason is src/sandbox/policy.mjs:30-41: when the store's tiers cannot be listed (EACCES), the launch is refused with `sandbox_state_invalid`, because the kernel's deny list would otherwise miss a hidden tier. Both behaviours fail closed. The probe's expectation predates M1's launch-time refusal.

**Item 10, the files that match.** Every match is the home-path rule (`/Users/new/`), never a credential pattern:
- scripts/accept/linux-chrome-features.mjs:8
- scripts/mini-rules.mjs:29
- test/fixtures/sandbox/seatbelt/tmpdir-relative.json:156, 157, 172, 173
- test/mini-rules.test.mjs:273
- test/secrets-project.test.mjs:30, 33
- tests/mods/secrets.test.ts:210, 213

The clean-clone check fails as it does on main: "Remote branch HEAD not found in upstream origin", because the scratch clone is detached.

## cfprefs, attempt 1 (90cbfe0 against c55ba01): no judgement

**The first try, about 15:20Z.** It stopped before preparation. Both bound profiles on the mini, ssfs and school, read `ready:false, reason:"host_not_live"`, so the live listing found no Chrome backend (`cfprefs-attempt-1/chrome-ssfs-not-live.txt`). The harness never launches or rebinds Chrome. The dispatching session therefore opened one Profile 1 window inside the existing Chrome, after which ssfs read `ready:true`.

**The run, 15:41:15Z to 15:57:57Z.** Command: `sh scripts/sandbox-probe/m1-mini.sh cfprefs 90cbfe0 c55ba01 ssfs`. The gate's loads were 4.64 and 4.58.
- **Before (90cbfe0).** cells 150/150 and services 41/41, both complete with assertions PASS. The before-side denials (`denials.json`) hold no preferences (cfprefs) entry. They are:
  - the notification_center mach-lookup;
  - three sysctl-reads (kern.bootargs, kern.iossupportversion, security.mac.lockdown_mode_state);
  - file-write-data and file-write-create on `<other>` and `<run directory>`;
  - two network-outbound to loopback ports.
- **After (c55ba01).** Both suites failed at connect with "MCP exited (1)". Their meta.json is `complete:false` with no cells, so there is no after-side denial set. The judge step crashed on the missing `tools.json`. The harness keeps no runtime stderr, so the cause cannot be recovered. That cause is either c55ba01's launch refusal in the prepared home or the harness change under the run (above).
- **Chrome.** Before (15:40:25Z): pid 36513, 1 tab in the ssfs backend. After (15:57:59Z): pid 36513, 1 tab (`chrome-before.json`, `chrome-after.json`; counts only). Chrome was never quit, and the Profile 1 window was left open.
