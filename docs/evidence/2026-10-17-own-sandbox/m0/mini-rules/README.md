# The mini's run rules, as M0c applied them

The own-sandbox spec's Decision Log, "native runs on the mini" (2026-10-17), after task 1's run at 07:57Z raised a screen-capture confirmation that only the owner could answer and that held the mini's CI runner. Every M0c item on the mini (`../tz-probe/`, `../mini-vendor-computer/`, `../mini-cua-browser/`, `../accept-native-main/`) ran under these rules; `sitting-log.txt` is the record of every check.

The rules are code: `scripts/mini-rules.mjs` (tested against doubles in `test/mini-rules.test.mjs`). Until the review fixes of 2026-10-17 they were four shell scripts here (`mini-idle.sh`, `mini-front.sh`, `mini-sequence.sh`, `tz-real-home.sh`); the runs recorded before then (the tz baseline under a scratch HOME, vendor computer run-1) ran under those, whose checks were the same in intent but could read a failed request as idle and retried under a dialog.

- **Before each item, two readings about 45 s apart.** Every observation must be present; a failed request or an answer that does not parse stops the sequence:
  - the frontmost application: UserNotificationCenter, SecurityAgent or CoreServicesUIAgent **stops at once**, runner busy or idle; while the runner is busy, any other app in front is the CI job's window and waits; once the runner reads idle, Terminal must be in front on both readings, and anything else stops. An unreadable frontmost application stops;
  - the mac lane's runner `ci-kit-mac-mini` (SSFSKIM/MAWS) not busy, no `Runner.Worker` under `~/actions-runner-maws`, no MAWS job waiting for a `macOS`/`ci-kit-mac` runner in a queued or running workflow run, and the mini's 1-minute load under 5 (2 until about 14:10Z on 2026-10-17; see `../mini-vendor-computer/README.md`). Any of these is contention: wait a minute and look again. A CI-side observation that cannot be read whole (a failed request, a truncated list) is also read again, never taken as idle.
- **After each item, and before any stop:** the frontmost application again; anything but Terminal stops.
- **Failures stop the sequence.** A failed run stops it after the frontmost check. A run directory is skipped only if it holds a complete run of this sitting whose preparation was cleaned up; anything else there stops. Evidence (tz results, the acceptance report) is copied only from a directory the item created for itself, verified (parses, complete, newer than the item's start) before it is archived, and only then removed from the mini. accept-native's acceptance status and the approved home's cleanup status are reported separately.
- **Native runs serve the approved runtime copy.** A new on-disk copy of the native helper raises the confirmation again, so no native run installs one. Every run that starts the native helper (the vendor computer baseline, accept-native) serves the copy the owner approved, `~/cua-115/home/runtimes/26.928.40906-darwin-arm64/` (helper `cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app`), in place, through `scripts/native-baseline/prepare.mjs`'s approved-runtime preparation:
  - it refuses a home whose runtime is not the pinned release, whose admission (`.cua-native-admission`) another run holds, that another process names on its command line, or whose approved helper is running (identified by its exact executable, read from the process, never its argv); no process's environment is scanned;
  - every harness serve on that home presents the run's admission token and registers its pid while it runs;
  - the home's `state/` and `run/` (task 1's, kept for M1 and M2) are moved into the run's scratch directory for the run and moved back afterwards, each move recorded as it happens; a failed move is undone move by move, and a failed undo or restoration deletes nothing and names the recovery directory;
  - every mini run (native or browser) gives its serves a TMPDIR of its own, created 0700; buildLaunch copies it into the runtime, and the helper inherits it through `open`;
  - at cleanup, the native helper is stopped by its pid only when it is proven the run's: its exact executable is the approved helper's, and the TMPDIR in that pid's environment is the run's (only TMPDIR is extracted, only compared, and nothing else from that environment is kept, logged or reported). A process that cannot be proven the run's is never signalled, and the state stays moved aside with the admission held;
  - HOME is the account's (native calls fail at the native pipe under a scratch HOME, task 1's finding), XDG_CONFIG_HOME is the run's scratch directory, secrets are off for the baseline;
  - the run refuses if its serve would resolve any other runtime, and records `runtimeReuse` in `meta.json` (`measurement.freshInstall: false`).
- **Nothing else on the mini.** Scratch clones only (`~/Developer/GitHub/cua-parity` for the harnesses at this branch, `~/cua-115-accept-main` for main); never the resident checkout `~/Developer/GitHub/cua`, the resident cua home or agent, or the owner's Chrome.

## Running the held items

From this checkout on the controller, after the dispatching session clears the mini. The mini's harness clone must first be at a commit that carries the admission (the serve checks it):

```sh
node scripts/native-baseline.mjs prepare --device mini --commit <reviewed SHA>
node scripts/mini-rules.mjs vendor              # the vendor computer triple, run-1 to run-3, with the per-run TMPDIR
node scripts/mini-rules.mjs browser             # the own-host browser-only baseline, three runs (no Chrome is started)
node scripts/mini-rules.mjs tz-real-home        # the tz baseline under the account's real HOME, into ../tz-probe/real-home/
node scripts/mini-rules.mjs accept              # accept-native on main at 94366c1; only with the owner at hand
```

Held as M0 residue when M0c returned (the mini's CI runner busy with maws-fe's gate set; no native or GUI run until the dispatching session clears it): the vendor computer triple, retaken whole (the 10:52Z run-1 recorded `TMPDIR unset` before the per-run TMPDIR existed; it is kept in `../mini-vendor-computer-superseded/`), the own-host browser baseline (three runs), accept-native on main at 94366c1, and the real-HOME tz baseline (never started).
