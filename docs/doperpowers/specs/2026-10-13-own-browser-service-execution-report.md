# Own browser service (#113): execution report

Executed by the plan-executor for the session that owns #113. Spec: `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`.

## Status

| milestone | branch | PR | state |
|---|---|---|---|
| M0 | feat/own-browser-service | https://github.com/SSFSKIM/cua/pull/121 | merged |
| M1a | feat/own-browser-service-m1a | (opening) | reviewed clean at aad5235 (reviewer-high), awaiting merge |

## Log

- 2026-10-13 pre-flight. Gates at b5656f2: `HOME=/tmp/cua-scratch-home npm test` 1078 pass, 0 fail, 32 skip; `npm run test:mods` 32 pass. The mini runs the ChatGPT extension route (spec Surprises); escalated to the session, which chose to set up the cua route on profile `ssfs` itself (Decision Log). M0 split into three tasks (Decision Log).
- Model routing: the Agent tool in this environment carries no effort parameter, so astra executors run at their default (high) rather than the brief's medium.

- 2026-10-13 the session set up the cua route on the mini; bound `ssfs` once (instance 3b45d47c-51f6-469b-a915-3d46ac5fb0ad, 15:19:59Z). The cua-linux VM is not running (`ssh cua-linux`: "No IP address found, is your VM running?"), relevant to M4.

- 2026-10-13 M0 task 1 (astra executor, sol task review): host trace, fixture server, harness and comparator with self-tests, bench-summary, controller brief, test-helper race fix. Review found the benchmark compared only ok flags; the criterion was narrowed (success counts per task, cua >= vendor) and recorded. After vendor pilot run 1 the session moved the verdict to per-task tool-call time; the recorder was added and then hardened to journal on the device after a REPL reset lost a run's tail.
- 2026-10-13 M0 task 2 (astra executor, sol task review): inventory 88 rows, corpus, live vendor pair. Review found no-op-passing scenarios, a cua-incompatible export oracle and a handler gate that counted pre-dispatch errors; fixed (COMMAND_HANDLERS registry contract, no-op self-test) and the live pair refreshed.
- 2026-10-13 M0 task 3 (controller-dispatched sonnet benchmark controllers): three pilot runs set aside (hand-relabelled rows, early ground-truth read, REPL reset at end_task); three journaled vendor runs all-ok, committed 9e8ca75.
- 2026-10-13 M0 whole-branch review (reviewer-high): 4 P2 (trace kept malformed identifier values; viewport reset, mark_tab, download_media effects unobserved); fixed in a76b902/413ad53; the fix introduced a fixture acknowledgment race (P2), fixed in c6b7805 with delayed-POST regressions; live pair refreshed: 0 differences (40 cases, 106 cells); re-review: no material findings.
- 2026-10-13 M0 gates re-run by the plan-executor at 5393503: npm test 1184 pass / 0 fail / 34 skip; test:mods 32 pass; claude plugin validate passed with the known warning; diff of the committed vendor pair: 0 differences (40 cases, 106 cells).

- 2026-10-13 M1a, split in two tasks (opus task-executors, sol task reviews). Task 1 (errors, budgets, backend, CDP controller): two fix waves (deadline through attachment and document reads; dialog recheck before dispatch; host-worded timeouts in shared attachment). Task 2 (index/COMMAND_HANDLERS, manifest, tabs, docs, switch, trust root, two-pin guard, real-client proof, live parity): found that only error.message crosses node_repl's RPC boundary (cua-side oracles corrected to sentences, 679a251) and that createBrowserTab needs M1b's snapshot (parity cases use tabs.new + goto until M1b); one fix wave (handler check before the documentation gate). Real-client proof first passed 22:13Z; live M1a parity 0 unexpected differences at 22:17Z. Whole-branch reviewer-high: one P2 (deadline not enforced after dispatch because the host awaits debugger.detach), fixed in aad5235; re-review "correct".
- 2026-10-13 M1a gates at aad5235, three full runs by the plan-executor: 1303/0/37 once and 1302/1/37 twice, each failure a different pre-existing test outside M1a's files under full-suite load (test/extension-host.test.mjs "commands in flight when the user cancels debugging..." ECONNREFUSED; test/mcp-upstream.test.mjs "owned descendants ... are reaped"); both files pass 5/5 in isolation.

## Environmental friction

- The Agent tool here has no effort parameter: astra executors ran at their default (high), not the brief's medium.
- Benchmark controllers cannot write files from the device REPL outside the mini's $TMPDIR, and end_task resets the device REPL: solved by the journaling recorder plus scp.
- The cua-linux VM is not running (relevant to M4).
