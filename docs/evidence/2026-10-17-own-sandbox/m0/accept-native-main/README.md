# accept-native on main (94366c1) on the mini, 2026-10-17

The first run of the TextEdit pair. It ran from this branch's checkout with `node scripts/mini-rules.mjs accept` (the `ACCEPT_REMOTE` script in `scripts/mini-rules.mjs`):
- a scratch clone `~/cua-115-accept-main` at 94366c1, serving the approved runtime `~/cua-115/home`;
- the approved-runtime preparation and cleanup came from the harness clone `~/Developer/GitHub/cua-parity` at 90cbfe0;
- `--live-secrets --live-textedit` with a generated key in a temporary `$HOME`, a synthetic key only (no `--secret-key`);
- the owner was standing by.

The report is `acceptance.json`. Its startedAt is 15:23:51Z and its finishedAt 15:25:43Z; it is the runner's own metadata-only report.

## Gate and stop

- The gate's two readings were taken at 15:22:58Z and 15:23:46Z. Both showed Terminal in front, the runner idle with nothing queued, and load 4.72 and then 4.38.
- At 15:25:44Z, the after-run check found `com.apple.TextEdit` in front, so the sequence stopped. This was not a system dialog: the frontmost process was the runner's own fixture TextEdit, pid 91785, started at 15:25:17Z inside the run by item 5, and the runner left it running and in front.
- The stop came before the item's own copy step, so the report was copied by hand from `/tmp/cua-115-accept.OtRzYk`, which keeps the original on the mini.
- The approved home's admission was released and no SkyComputerUseService process remained, so the cleanup ran.
- The dispatching session then quit that TextEdit and brought Terminal back. The harness touched neither.

## Items: overall FAIL

| Item | Status | Why |
|---|---|---|
| 1 npm test | FAIL | exit 1: 2 of 2586 failed (2513 pass, 71 skipped), 55.1 s |
| 2 pinned install | FAIL | cascade: "npm test was FAIL in item 1". Download mode is BLOCKED because the acquisition code changed since bc315bc |
| 3 doctor | FAIL | cascade from item 1 |
| 4 serve and verify.mjs | PASS | |
| 5 live TextEdit fixture | PASS | its own disposable document |
| 6 secrets | FAIL | cascade from item 1 |
| 7 substitution | FAIL | cascade from item 1. The live trusted-root row is INFO, as designed |
| 8 lifecycle | FAIL | cascade from item 1 |
| 9 release gates | BLOCKED | needs a clean VM, a cold start and fresh TCC onboarding, as always on this host |
| 10 packaging | FAIL | two checks, below |

The two failing tests in item 1:
- `unit proof must exist, run by npm test and actually pass its exact named test`, in test/repl-parity/coverage.test.mjs:14.
- `selected-stage completeness reports later contracts as pending, never covered`, in test/repl-parity/inventory.test.mjs:298.

Both pass on the controller (10 of 10) from a `git archive` export of 94366c1, which has no `.git`. The mini's failure therefore depends on the environment or the checkout, and the report holds only the test names, so the cause is not established.

The two failing checks in item 10:
- **Clean clone tests.** "git clone failed: fatal: Remote branch HEAD not found in upstream origin". The scratch clone is a detached checkout of 94366c1, so the clean clone the check makes from it has no HEAD branch to follow. This comes from how the item runs, not from main's code.
- **Code naming this user's home.** The check uses the rule in `scripts/accept-native.mjs:409`: a tracked file fails if its text contains the account's home followed by `/`, or matches a `TOKEN_PATTERNS` credential pattern (`scripts/accept/lib.mjs:196`). Every match here is the home-path rule (`/Users/new/`, which is the mini's account home too); none matches a credential pattern:
  - scripts/accept/linux-chrome-features.mjs:8
  - test/secrets-project.test.mjs:30, :33
  - tests/mods/secrets.test.ts:210, :213
