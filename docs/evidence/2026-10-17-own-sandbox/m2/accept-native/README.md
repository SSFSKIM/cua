# M2's TextEdit sitting: accept-native at 6de47ae (code under test 249a2a9)

The run setup and the item summary are in `../README.md`. The report is `acceptance.json`.

## The runner was released early

CI-opt's hold was meant to cover the whole sitting, but CI-opt released it at 07:15:54Z.
- **Cause.** CI-opt's chat watcher read our 07:15:24Z line, "M2 TextEdit sitting finished … next: done", as the release. That line actually reported the stopped first attempt.
- **What overlapped.** The real sitting ran from 07:16:15Z to 07:19:05Z, so its interval from 07:15:54Z to 07:19:05Z ran with the runner back online.
- **Check.** The dispatching session confirmed that no MAWS run started or ran after 07:10Z. Nothing overlapped the sitting, and the result stands.
- **Since then.** Status lines say "finished" or "done" only for an actual release. A failed attempt is reported as "attempt N stopped (…); rerunning".

## Items 1 to 3 and 6 to 10, compared with main (94366c1) and M1 (f8019bf)

| Item | main | M1 | M2 | Same as both? | The failing checks |
|---|---|---|---|---|---|
| 1 npm test | FAIL | FAIL | FAIL | yes | `unit proof must exist, run by npm test and actually pass its exact named test` (test/repl-parity/coverage.test.mjs:14); `selected-stage completeness reports later contracts as pending, never covered` (test/repl-parity/inventory.test.mjs:298). Only these two fail in all three runs. |
| 2 pinned install | FAIL | FAIL | FAIL | yes | "bad hash, length, manifest or signature never activates" (cascade from item 1). "download mode" is BLOCKED in all three; M2's list of acquisition commits since bc315bc adds a99f951. |
| 3 doctor | FAIL | FAIL | FAIL | yes | "unsupported platform, incompatible helper, secret store state explicit" (cascade from item 1). |
| 6 secrets | FAIL | FAIL | FAIL | as main | "masked prompt: …" (cascade from item 1). M1's live probe-secrets failure (the refused launch exiting 0) is gone, so M2 matches main. |
| 7 substitution | FAIL | FAIL | FAIL | as main | "exact reference expansion per method …" and "the store reads only a regular, owned, 0600 file …" (cascade from item 1). M1's live failure is gone here too. |
| 8 lifecycle | FAIL | FAIL | FAIL | yes | "lifecycle state machine, races, deadlines, EOF, elicitation routing, …" (cascade from item 1). |
| 9 release gates | BLOCKED | BLOCKED | BLOCKED | yes | clean VM, cold start, fresh TCC onboarding. |
| 10 packaging | FAIL | FAIL | FAIL | same checks, one more file | "clean clone tests" fails identically: the scratch clone is a detached checkout. The home-path check flags `scripts/sandbox-probe/m2-mini.sh` (lines 140 and 144, the home-path rule `/Users/new/`, no credential pattern) in addition to M1's files. |

No item fails in a way that is new to M2, other than item 10's added file. That file is M2's own: `m2-mini.sh` names the approved home's absolute path.
