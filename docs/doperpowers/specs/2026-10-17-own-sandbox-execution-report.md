# #115 own sandbox: execution report (interim, 2026-10-17)

Status: BLOCKED. M0 has merged. M1 is still being built. The mini residue is held, waiting for a ruling on the frontmost-app gate.

## Done
- M0 merged: PR https://github.com/SSFSKIM/cua/pull/153, merge 90cbfe0. CI was green and the PR was MERGEABLE. The reviewer-high milestone review ran two fix rounds:
  - the Linux probe signalled apps without causal ownership; it now uses a per-launch marker (420c4ee);
  - the argv capture leaked children; it now cleans up by process group (f5086c4);
  - the tz verdict was confounded by HOME and Node (418fa72);
  - a test launcher interpolated a shell path (8ec8a5a).
- M0 ran as three loop tasks, each reviewed clean:
  - M0a: mini oracles;
  - M0b: harness extensions, built in a second worktree and merged in;
  - M0c: GCE box, Linux probes, baselines and controls, after three fix rounds.
- The verdicts are in the spec's Surprises and Decision Log:
  - experiment A: equal;
  - argv capture: byte-equal;
  - app-server replay: accepted, no extra method;
  - fingerprints: equal;
  - macOS nesting: holds;
  - Linux app launch: selects the supervisor-side launch;
  - Linux nesting: selects the per-directory deny extended with run/;
  - node_repl filters the kernel launcher's environment: M2's compat takes its settings from `$CUA_HOME/state/compat/<id>.json|.node`, the route ruled by the dispatching session.
- #79 landed (94366c1) and was folded into the spec. M4's version bump is now 0.13.0 → 0.14.0.

## In flight
- M1 (task 4): executor a28fa0face9a027f9 on feat/115-own-sandbox-m1 (base bc6a4a9) in /Users/new/Developer/GitHub/cua-wt-115. It is told to stay off the mini entirely and to continue with code, unit tests and the GCE regression. Its report goes to `.doperpowers/sde/2026-10-17-own-sandbox-design/task-4-report.md`.
- M0 residue, in /Users/new/Developer/GitHub/cua-wt-115-residue, branch feat/115-own-sandbox-m0-residue at 90cbfe0. Nothing has run. At 13:25:22Z the gate stopped before vendor run-1 because Chrome, most likely the window of maws-fe's CI job, was frontmost while the runner was busy. No prompt appeared. A refinement of the rule was proposed to the dispatching session and is awaiting its ruling: while the runner is busy, a non-Terminal front app counts as contention, except system dialogs. Resume in order:
  1. `node scripts/mini-rules.mjs vendor`
  2. `node scripts/mini-rules.mjs browser`
  3. `node scripts/mini-rules.mjs tz-real-home`
  4. `node scripts/mini-rules.mjs accept`
  accept has its go, with the owner standing by.

## Not started
- M1's PR, which waits for its live mini runs (parity, cfprefsd diff, accept-native items).
- M2, M3, M4.

## Resources
- GCE `cua-gce` (europe-west4-a) is stopped, unless M1's executor has started it for its regression; it must stop it again.
- `~/cua-115` on the mini (about 9.5 GB) is kept until #115 ends.

## Ledger
`/Users/new/Developer/GitHub/cua-wt-115/.doperpowers/sde/2026-10-17-own-sandbox-design/progress.md` holds the bases, heads and agent handles.
