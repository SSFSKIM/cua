# The mini's run rules, as M0c applied them

The own-sandbox spec's Decision Log, "native runs on the mini" (2026-10-17), after task 1's run at 07:57Z raised a screen-capture confirmation that only the owner could answer and that held the mini's CI runner. Every M0c item on the mini (`../tz-probe/`, `../mini-vendor-computer/`, `../mini-cua-browser/`, `../accept-native-main/`) ran under these rules; `sitting-log.txt` is the record of every check.

- **Before each item:** `mini-idle.sh`, which looks twice, 45 s apart: the mac lane's runner `ci-kit-mac-mini` (SSFSKIM/MAWS) not busy, no `Runner.Worker` under `~/actions-runner-maws`, and no MAWS job waiting for a `macOS`/`ci-kit-mac` runner in a queued or running workflow run. The mini's 1-minute load also had to be under 2 (the dispatch's rule for measurements on the shared mini). While either failed, the sequence waited and looked again a minute later.
- **After each item:** `mini-front.sh`: the frontmost application's bundle id. On `com.apple.UserNotificationCenter`, `com.apple.SecurityAgent` or `com.apple.coreservices.uiagent` the sequence stops and reports; nothing is clicked.
- **Native runs serve the approved runtime copy.** A new on-disk copy of the native helper raises the confirmation again, so no native run installs one. Every run that starts the native helper (the vendor computer baseline, accept-native) serves the copy the owner approved, `~/cua-115/home/runtimes/26.928.40906-darwin-arm64/` (helper `cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app`), in place, through `scripts/native-baseline/prepare.mjs`'s approved-runtime preparation:
  - it refuses a home whose runtime is not the pinned release, or that another process is using;
  - the home's `state/` and `run/` (task 1's, kept for M1 and M2) are moved into the run's scratch directory for the run and moved back afterwards, so each run starts with no state and leaves task 1's untouched;
  - HOME is the account's (native calls fail at the native pipe under a scratch HOME, task 1's finding), XDG_CONFIG_HOME is the run's scratch directory, secrets are off for the baseline;
  - the run refuses if its serve would resolve any other runtime, and records `runtimeReuse` in `meta.json` (`measurement.freshInstall: false`).
- **Nothing else on the mini.** Scratch clones only (`~/Developer/GitHub/cua-parity` for the harnesses at this branch, `~/cua-115-accept-main` for main); never the resident checkout `~/Developer/GitHub/cua`, the resident cua home or agent, or the owner's Chrome.

## The sequence scripts (controller side, run from this worktree)

- `mini-sequence.sh <harness commit> [items]`: items `native-prepare`, `tz`, `vendor`, `browser`, `accept` in order, each behind the idle gate and followed by the frontmost check; `vendor` and `browser` skip runs already recorded. M0c ran it as `mini-sequence.sh 8afd143 tz vendor browser accept` and it stopped after vendor run-1 (a prompt was already frontmost).
- `tz-real-home.sh`: the tz baseline under the account's real HOME (approved 2026-10-17), kernel then worker, into `../tz-probe/real-home/`; it stops on any non-Terminal frontmost app before or after.

Held as M0 residue when M0c returned (the mini's CI runner busy with maws-fe's gate set; no native or GUI run until the dispatching session clears it): vendor computer run-2 and run-3, the own-host browser baseline (three runs), accept-native on main at 94366c1 (only with the owner at hand), and the real-HOME tz baseline (never started).
