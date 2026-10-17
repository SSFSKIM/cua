# The mini's run rules, as M0c applied them

The own-sandbox spec's Decision Log, "native runs on the mini" (2026-10-17), after task 1's run at 07:57Z raised a screen-capture confirmation that only the owner could answer and that held the mini's CI runner. Every M0c item on the mini (`../tz-probe/`, `../mini-vendor-computer/`, `../mini-cua-browser/`, `../accept-native-main/`) ran under these rules; `sitting-log.txt` is the record of every check.

The rules are code: `scripts/mini-rules.mjs` (tested against doubles in `test/mini-rules.test.mjs`). Until the review fixes of 2026-10-17 they were four shell scripts here (`mini-idle.sh`, `mini-front.sh`, `mini-sequence.sh`, `tz-real-home.sh`); the runs recorded before then (the tz baseline under a scratch HOME, vendor computer run-1) ran under those, whose checks were the same in intent but could read a failed request as idle and retried under a dialog.

- **Before each item, two readings about 45 s apart.** Every observation must be present; a failed request or an answer that does not parse stops the sequence:
  - the frontmost application is Terminal; anything else, a dialog above all, **stops at once** (no retry): a dialog makes every mac CI job fail within seconds, so the runner alone can read idle under one;
  - the mac lane's runner `ci-kit-mac-mini` (SSFSKIM/MAWS) not busy, no `Runner.Worker` under `~/actions-runner-maws`, no MAWS job waiting for a `macOS`/`ci-kit-mac` runner in a queued or running workflow run, and the mini's 1-minute load under 2. Any of these is contention: wait a minute and look again.
- **After each item, and before any stop:** the frontmost application again; anything but Terminal stops.
- **Failures stop the sequence.** A failed run stops it after the frontmost check. A run directory is skipped only if it holds a complete run of this sitting whose preparation was cleaned up; anything else there stops. Evidence (tz results, the acceptance report) is copied only from a directory the item created for itself, verified (parses, complete, newer than the item's start) before it is archived, and only then removed from the mini. accept-native's acceptance status and the approved home's cleanup status are reported separately.
- **Native runs serve the approved runtime copy.** A new on-disk copy of the native helper raises the confirmation again, so no native run installs one. Every run that starts the native helper (the vendor computer baseline, accept-native) serves the copy the owner approved, `~/cua-115/home/runtimes/26.928.40906-darwin-arm64/` (helper `cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app`), in place, through `scripts/native-baseline/prepare.mjs`'s approved-runtime preparation:
  - it refuses a home whose runtime is not the pinned release, whose admission (`.cua-native-admission`) another run holds, or that another process names on its command line or as CUA_HOME in its environment (only pids are read);
  - every harness serve on that home presents the run's admission token and registers its pid while it runs;
  - the home's `state/` and `run/` (task 1's, kept for M1 and M2) are moved into the run's scratch directory for the run and moved back afterwards, each move recorded as it happens; a failed move is undone move by move, and a failed undo or restoration deletes nothing and names the recovery directory;
  - at cleanup, the native helper the run's calls opened (the approved copy's executable, started after this run took the admission) is stopped by its pid; any process not proven the run's stops the cleanup instead;
  - HOME is the account's (native calls fail at the native pipe under a scratch HOME, task 1's finding), XDG_CONFIG_HOME is the run's scratch directory, secrets are off for the baseline;
  - the run refuses if its serve would resolve any other runtime, and records `runtimeReuse` in `meta.json` (`measurement.freshInstall: false`).
- **Nothing else on the mini.** Scratch clones only (`~/Developer/GitHub/cua-parity` for the harnesses at this branch, `~/cua-115-accept-main` for main); never the resident checkout `~/Developer/GitHub/cua`, the resident cua home or agent, or the owner's Chrome.

## Running the held items

From this checkout on the controller, after the dispatching session clears the mini. The mini's harness clone must first be at a commit that carries the admission (the serve checks it):

```sh
node scripts/native-baseline.mjs prepare --device mini --commit <reviewed SHA>
node scripts/mini-rules.mjs vendor              # vendor computer run-2 and run-3 (run-1 is complete and skipped)
node scripts/mini-rules.mjs browser             # the own-host browser-only baseline, three runs (no Chrome is started)
node scripts/mini-rules.mjs tz-real-home        # the tz baseline under the account's real HOME, into ../tz-probe/real-home/
node scripts/mini-rules.mjs accept              # accept-native on main at 94366c1; only with the owner at hand
```

Held as M0 residue when M0c returned (the mini's CI runner busy with maws-fe's gate set; no native or GUI run until the dispatching session clears it): vendor computer run-2 and run-3, the own-host browser baseline (three runs), accept-native on main at 94366c1, and the real-HOME tz baseline (never started).
