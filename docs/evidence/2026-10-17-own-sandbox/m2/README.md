# M2 on the mini, 2026-10-18

All runs went from the evidence clone (`feat/115-own-sandbox-m2-evidence`) under the mini's rules. Gate readings are in `mini-rules/sitting-log.txt`; the runner watch's readings are in `../m1/mini-rules/sitting-log.txt`.

| Item | SHA (code / harness) | When | Result | Evidence |
|---|---|---|---|---|
| env probe | 475881a | 05:20Z | **PASS** | `env-probe/` |
| helper check | 475881a | 05:27Z | **PASS** | `helper-tmp/` |
| headless group | 249a2a9 | 06:28Z | 1 of 5 steps FAILED (vendor-host own-sandbox, a harness bug); the rest PASS | `headless/` |
| vendor-host own-sandbox, rerun | 249a2a9 / 6de47ae | 07:19:39Z to 07:19:52Z | **PASS**, 86/86 | `headless/own-sandbox-vendor.json` |
| parity | 249a2a9 | 06:32Z to 07:02Z | **PASS**: vendor 479 and cua 479; diff ok, 0 undeclared differences | `parity/` |
| TextEdit sitting | 6de47ae (src = 249a2a9) | 07:16:15Z to 07:19:05Z | item 11 PASS 76/76, item 12 PASS 86/86, item 13 PASS 18/18 | `accept-native/acceptance.json` |

## Env probe and helper check (475881a)

**Env probe.** Headless rule.
- Scoped and default: the kernel and the worker each made one `sandbox` call, and both calls carried TMPDIR and CODEX_HOME exactly as buildLaunch set them.
- Disabled: node_repl never calls the launcher (0 slot invocations).

**Helper check.** Native rules.
- Six read-only calls and one Finder screenshot (size only) were made.
- The approved helper wrote nothing and held nothing open under the session temp. It started once and quit by itself. No prompt appeared.
- Observation: in that run's vendor-host confinement cell, `tmpdirIsSession` is false.

## Headless group (249a2a9)

The 9b1698d and dd88113 runs never passed their gates while CI was busy; 249a2a9's is the only run.

- **own-sandbox, vendor host: FAILED.**
  - The vendor node_repl keeps top-level bindings across cells. A second `const fs` drew a warning text, which `own-sandbox.mjs` parsed as the report.
  - Fixed at 6de47ae, harness only: each cell is block-scoped, and the report is the last text that parses as JSON.
  - Rerun at 6de47ae: **86/86 PASS**.
- **own-sandbox, cua's host:** 76/76 PASS.
- **doctor:** ok.
- **The compat's tests on the vendor's Node v24.21.0:** 26/26 PASS.
- **`process.execve` on Node v24.21.0:** it aborts (SIGABRT, exit 134, "process.execve failed with error code ENOENT"). It does not throw.

## The CI-opt hold, 06:29:06Z to 07:44:06Z

Parity, the sitting and the vendor-host rerun ran inside the hold.

**Queue exception.** Approved for this window only. In the gate and in the pause watcher, busy=false with no Runner.Worker counted as idle and the queue was ignored; the gate took one reading. The headless group ran under the approved headless rule (queue ignored at start).

**Parity**
- **Run.** profile ssfs; both sides used `--pause-file`, and no pause occurred. ssfs was found not live at 06:30Z; the Profile 1 window was reopened at 06:31:37Z.
- **Chrome.** pid 36513 with 1 tab, before and after.
- **Terminal raise.** Parity left Chrome in front. HIDIdleTime was 14032 s, so Terminal was raised with `open -a Terminal` at 07:14:26Z.

**The sitting**
- **Attempt 1, `m2-mini.sh accept 6de47ae`.** Stopped at 07:15:19Z before acceptance (exit 84), and nothing was prepared. The cause: m2-mini.sh runs native-baseline's `prepare.mjs` from `~/cua-115/repo`, and prepare refuses outside the prepared parity clone.
- **The rerun.** M1's route: the residue's `ACCEPT_REMOTE` with its own scratch clone `~/cua-115-accept-m2` at 6de47ae, the harness clone at 6de47ae, the approved home, `--live-secrets --live-textedit` with a synthetic key only, the pause mirrored as `CUA_PAUSE_FILE`, and a dialog-only watch.
- **Outcome.** No prompt and no pause; cleanup exit 0. The fixture TextEdit, pid 76277 (started 07:18:32Z, inside the run), was quit by pid, and Terminal was refocused.

| Item | main 94366c1 | M1 f8019bf | M2 6de47ae |
|---|---|---|---|
| 1 npm test | FAIL (2) | FAIL (2) | FAIL (the same 2) |
| 2, 3, 8 | FAIL (cascade) | FAIL (cascade) | FAIL (cascade) |
| 4, 5 | PASS | PASS | PASS |
| 6, 7 | FAIL (cascade) | FAIL (cascade + refused-exit) | FAIL (cascade only; the live probe-secrets steps pass) |
| 9 | BLOCKED | BLOCKED | BLOCKED |
| 10 | FAIL | FAIL | FAIL (the same two checks) |
| 11 own sandbox | n/a | PASS 76/76 | PASS 76/76 |
| 12 vendor-host sandbox | n/a | n/a | PASS 86/86 |
| 13 computer route via compat | n/a | n/a | PASS 18/18 |
