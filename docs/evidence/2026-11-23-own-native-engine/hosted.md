# M5 T10b′ part 2: the hosted plumbing for M5's sittings

Task 6b-2 of `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md` (refs #506). It is built and
unit-tested only. Nothing ran on a runner, no workflow was dispatched, and no TCC row was written anywhere. Part 1's
records are in `harness.md`.

## What it is

Each sitting, A to F, is one job on one GitHub-hosted macOS runner. Both engines run on that one machine, and their
lanes alternate. The runner reaches itself as the harnesses' device `hosted-macos` over loopback. Every harness serves
the run's own install.

| Piece | File | What it does |
|---|---|---|
| Attestation | `scripts/hosted-sittings/runner.mjs` | The runner's record (`~/.local/share/cua-hosted/runner.json`): image name and version, run id and attempt, the run's install (CUA_HOME, release) and engine (bundle, build, version). `hostedRunOf` sets `meta.hosted` and `meta.runner` from the device's record and the controller's env, and refuses when they disagree. |
| Harness wiring | `scripts/native-baseline{.mjs,/remote.mjs,/summary.mjs,/compare.mjs}`, `scripts/native-matrix/{run,summary}.mjs`, `scripts/repl-parity/native-mac{,-diff}.mjs` | The macOS preflight reads the record on the device. All three harnesses record `meta.hosted` and `meta.runner`. The judges attest `runner` beside `hardware` and require one job's run per pairing (baseline compare, matrix pairing and proof, native-mac diff). |
| TCC writer | `scripts/hosted-sittings/tcc.mjs` | The one guarded writer. It writes system-database rows only (Accessibility, Screen Recording, Input Monitoring, post events) for `io.github.ssfskim.cua.engine` and `com.openai.sky.CUAService`, and no other client. Before it touches any store it refuses unless `RUNNER_ENVIRONMENT=github-hosted` on macOS, and its log cites the Decision Log entry (O0, ruling 1111). |
| Approve | `scripts/hosted-sittings/approve.mjs` | In H0's order: the engine's rows, then a relaunch (`cua engine stop`), then `cua engine approve` twice with stdin closed. Both passes always run. Pass 2 must approve. The report lists both passes. |
| Setup | `scripts/hosted-sittings/setup.mjs`, `loopback.sh` | Loopback sshd, the harness checkout, `native-baseline prepare`, the install, the engine (unpacked from the build job, signature verified), a check that the vendor's helper is not running, the vendor's rows, the approve, then the record. Each step gates the next. |
| Plans | `scripts/hosted-sittings/plan.mjs` | Each sitting's exact steps, full and pilot. |
| Executor | `scripts/hosted-sittings/run.mjs` | Runs the steps in order with one log per step. Statuses are PASS, FAIL, INFO, SKIP and PENDING. Exit 0, 1 on any FAIL, 3 when a full sitting holds a pending step. |
| Counts and pilot reads | `scripts/hosted-sittings/{counts,pilot-reads,focus-timing}.mjs` | Per cell, on each side: the runs where every sample has a verdict, and each run's verdict samples. The pilot's readings of what part 1 flagged. |
| CLI | `scripts/hosted-sittings.mjs` | `setup`, `approve` (this is `CUA_HOSTED_APPROVE`), `run`, `plan`, `counts`, `focus-timing`, `textedit up/down`. |
| Workflow | `.github/workflows/m5-sittings.yml` | Dispatch only (a push registers it). One `engine` job on macos-latest, then one `sitting` job per sitting. Uploads with `if: always()`. The step summary prints the step table and the counts. |
| ci-kit | `.github/ci-kit.yml` | Gate `default-selection-approved` gains `env: CUA_HOSTED_APPROVE: node scripts/hosted-sittings.mjs approve`. |

## How to run each sitting

Dispatch from GitHub, or with `gh` (not run here; the dispatch forbids `gh workflow run` on this Mac):

```sh
gh workflow run m5-sittings.yml --ref feat/117-m5 -f sitting=<all|a..f> -f form=<full|pilot> -f image=<macos-latest|xcode-27> -f flipped=<false|true>
```

- **The pilot** is `-f sitting=all -f form=pilot`. It is the first hosted run after M4 is merged into this branch.
- **`image=xcode-27`** runs A to D on macOS 27. Their engine is always the macos-latest build job's, copied over, until
  #504.
- **Sitting E** always runs on macos-latest, because its script builds its own engine.
- **`flipped=true`** only on the flip commit.

Each job runs these commands on its runner (`$OUT` = `$RUNNER_TEMP/m5-out`):

```sh
npm ci --no-audit --no-fund
node scripts/hosted-sittings.mjs setup --engine-archive "$RUNNER_TEMP/m5-engine/m5-engine.tgz" --report "$OUT/setup.json"   # A to D
node scripts/hosted-sittings.mjs run <sitting> --out "$OUT/sitting" [--pilot] [--flipped]
```

The `engine` job builds the engine with `node bin/cua.mjs engine build --sign adhoc --json`. It then packs the engine
directory, without the Swift build's scratch.

`node scripts/hosted-sittings.mjs plan <s> --out <dir> [--pilot]` prints the exact steps and runs nothing. The approved
paths come from the runner's record, so `plan` only works on a runner after setup, except for E and F. The steps are:

- **A** (Acceptance 5). Three runs of each lane, in the order vv, vc, cc, then again.
  - Each run: `node scripts/native-baseline.mjs run --device hosted-macos --experiment hosted-<run>-<attempt>-a --host H --engine E --approved-runtime <record's install> --approved-engine <record's engine> --out $OUT/sitting/<lane>/run-<i>`.
  - Then `compare --engines vv vc`, `--hosts vc cc` and `--end-to-end vv cc`.
  - Pilot: one run of each lane.
- **B** (Acceptance 6). `repl-parity prepare --device hosted-macos --commit <sha>` with the approved paths. Then
  `repl-parity run --suite native-mac --host X --engine X` for vendor and for cua. Then
  `repl-parity diff vendor cua --expected scripts/repl-parity/expected/native-mac.json`, then `cleanup-prepared`. The
  pilot is the same.
- **C** (Acceptance 3, 4 and 7, and #212).
  - The matrix runs `native-matrix run --device hosted-macos --host X --engine X --sitting hosted-<run>-c --run-number i`,
    vendor then cua for each i (three of each; the pilot runs one of each).
  - #212's cell, observation only: `native-matrix cell intervention-save-sheet` on both lanes.
  - Then `native-matrix summary` and `native-matrix compare`.
  - The pilot first runs `focus-timing`.
  - Per-cell counts go to `counts.md`. The pilot's readings go to `pilot-reads.md`.
  - Acceptance 3's keystroke witness and the window-order oracle are rows of the full plan.
- **D** (Acceptance 1 in its hosted form, 2, 8 and 9, and #216).
  - `CUA_HOME=<scratch>/cua-accept CUA_NATIVE_ENGINE=vendor node bin/cua.mjs install --json`.
  - Then `node scripts/accept-native.mjs --engine cua --live-textedit --live-secrets --items 1,2,3,4,5,6,7,8,10,11,12,13 --report $OUT/sitting/acceptance.json`.
    The secrets are the temporary sentinel store that accept-native makes and removes itself (PF §7).
  - Then a scratch TextEdit document, then `verify.mjs --engine cua|vendor --bind com.apple.TextEdit`.
  - Then `CUA_SHIM_SURFACES=computer,browser node scripts/approval-cycles.mjs --engine cua --approve com.apple.TextEdit --decline com.apple.calculator --cycles 20`.
  - Then TextEdit quits, and T3b's onboarding is listed as PENDING.
  - The pilot is the same: #216 needs all twenty cycles.
- **E** (the flip). The fixture lane is `macos-default-selection.mjs --older-node <the tool cache's Node 22>`. The
  approved lane is `CUA_HOSTED_APPROVE='node scripts/hosted-sittings.mjs approve' sh scripts/accept/macos-default-selection-hosted.sh`.
  - Each lane is expected to exit 1 before the flip and 0 on the flip.
  - An exit counts only if the judge's report exists, so a build that fails is not an expected FAIL.
  - The same lane also runs alone as `ci-gate <sha> --gates default-selection-approved`.
- **F** is PENDING until T12 (the MAWS build and both scripts).

## What each sitting needs from M4

M4 merged to main as PR #513 (squash `d38630f9`, 2026-11-23 14:12Z). This branch does not have it yet.

- **T4's bundle build** (A to E). `cua engine build --sign adhoc` puts the build in the pending slot
  (`engine/pending/cua Engine.app`). The engine job packs that slot. `engineToApprove` reads the slot, and falls back to
  the pre-M4 `pending.json` layout.
- **T2's permission flow** (A to E). `cua engine approve` promotes the pending build, and fails with
  `engine_capture_confirmation` when nobody confirms the capture prompt (a rollback). That makes pass 1 fail and pass 2
  approve. Confirmed on main: `src/runtime/engine.mjs:859`.
- **D** also needs T3b's staged-onboarding driver. **F** needs T12.

## What the pilot reads

`pilot-reads.md` covers these, from C's records:

- the Open panel's front and key ids, against `PANEL_SERVICE`;
- the Save panel's structure from #212's cell (Go To controls are read by hand from it);
- the key app on the Chrome for Testing and Electron fixture rows;
- Finder's type-select after the background TextEdit click, on both lanes;
- the focus probe's median and max cost over five launches;
- whether 2-Set engaged after each refocus;
- the vendor lane's `cua/errorName` values.

Any question that no row answers is listed as "Not read in this pilot".

## Tests

Command: `node --test test/hosted-sittings/*.test.mjs test/native-matrix/*.test.mjs test/native-baseline/*.test.mjs test/repl-parity/native-mac-*.test.mjs test/accept-macos-selection.test.mjs`

- **Result:** 741/741 pass, and 741/741 again with `RUNNER_ENVIRONMENT=github-hosted GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1`
  (the CI `test` gate runs on a hosted runner). The output has no stray lines.
- **`test/hosted-sittings`:** 41 tests (approve 6, plan 8, report 5, run 6, runner 6, setup 4, tcc 6).
- **YAML:** `m5-sittings.yml` parses with ci-kit's vendored YAML parser. `.github/ci-kit.yml` passes ci-kit's own
  `parseConfig` (12 gates, and `default-selection-approved` carries the env).
- **The sitting step's shell:** passes `bash -n` on `/bin/bash` 3.2. The empty `flags` array is guarded for `set -u`.
- **The CLI's refusals on this Mac:** `run`, `approve` and `textedit` exit 2 ("refused"). `plan c` exits 1 because
  there is no runner record. `plan e` prints its steps.

### TDD evidence

**RED**, each written before its module, with the failure expected because the module did not exist yet:

- `runner.test.mjs`, `tcc.test.mjs`, `approve.test.mjs`, `report.test.mjs` (recorded in the session before compaction).
- `plan.test.mjs`: `node --test test/hosted-sittings/plan.test.mjs` gave `ERR_MODULE_NOT_FOUND … scripts/hosted-sittings/plan.mjs`, pass 0 fail 1.
- `setup.test.mjs` and `run.test.mjs`: `ERR_MODULE_NOT_FOUND` for `setup.mjs` and `run.mjs`, pass 0 fail 2.

**RED, for changes to existing behavior:**

- D's reorder (approval-cycles needs the TextEdit fixture): test 5 failed until the plan changed.
- `sittingContext`: "does not provide an export named 'sittingContext'".
- The `report` requirement: plan test 6 and run test 11 failed.

**GREEN:** plan 7, then 8 after the reorder and `sittingContext`. Run 6/6 and setup 4/4 after one fix each:

- the render dropped a redundant "exit 1" note;
- the clone directory is made through `exec` (a spy), not `mkdirSync`.

The whole suite is listed above.

## Commits

- `534fda083`: the hosted runner's attestation.
- `9a0040798`: the guarded TCC writer and the two-pass approve.
- `95dae4dc2`: the sittings' plans, counts and pilot readings.
- `edb5355af`: one dispatch-only job per sitting, the setup in H0's order, and `CUA_HOSTED_APPROVE`.
- `da6fe0b92`: the engine's archive without the Swift build's scratch.
- This report.

## Decisions made

1. **The attestation is a file on the device.** The record (`~/.local/share/cua-hosted/runner.json`) is written by
   setup and read by every macOS preflight, because the ssh session's environment carries only PATH. `hostedRunOf`
   cross-checks it against the controller's env and the approved paths, so no run is marked hosted by one side alone.
2. **`runner` is a separate attested field.** `hardware` stays a true fact. Two runs pair only in one job's run.
3. **A hosted controller with no record is hosted but unattested** (`runner: null`). The judges report the missing
   proof, rather than the harness throwing. This keeps the CI `test` gate, which runs on a hosted runner, from tripping
   on doubles. The test doubles now default to `env = {}`.
4. **The TCC guard cites the O0 entry as a constant.** The entry lives on `docs/117-progress`, not this branch, so the
   writer does not read the spec. The writer throws instead of exiting, writes the system DB only, and allows only the
   two clients.
5. **Approve always runs both passes, and pass 2 must approve.** Missing rows stop it before any approve. The relaunch
   is `cua engine stop`.
6. **`approve` exits 0 (approved), 3 (not approved, including any error) or 2 (refused), never 1.** E's script passes
   that status through under `set -e`, and before the flip E expects its judge's exit 1.
7. **E's expected exit counts only with the judge's report** (the `report` field). This closes a false PASS on the flip
   check when a build or approve exits 1.
8. **Sittings run from a GitHub workflow, not ci-kit gates.** ci-kit uploads artifacts only on failure, and its gates
   cannot depend on the macos-latest engine job. The one sitting gate that does fit, `default-selection-approved`, keeps
   its ci-kit form with the env.
9. **One engine build per dispatch, on macos-latest, copied to every runner.** It is packed from the engine directory
   without `engine/build` or `engine/staging`, so it serves the M4 and pre-M4 layouts alike. E always runs on
   macos-latest.
10. **Setup refuses if the vendor's helper is already running.** Nothing kills it: a helper launched before its rows
    would keep the old answer, and a fresh runner has none running.
11. **The pilot's forms.** C keeps the default samples with one pair of runs, so its counts mean something. B is already
    its smallest form. D keeps the exact selection and all 20 cycles, because #216 needs twenty. In the pilot, verdicts
    and pilot readings are INFO, never FAIL. PENDING fails no pilot, but a full sitting with one exits 3.
12. **#212's cell runs in C on both lanes; #216's cycles run in D**, inside the TextEdit fixture.
13. **`--flipped` is an explicit input,** not read from the source. The commit before the flip and the flip commit are
    both dispatched on purpose.
14. **F and E need no setup.** F has nothing to run until T12, and T12 decides its setup. E makes its own disposable
    home.

## Discoveries

- **M4 is already merged** (PR #513, `d38630f9`, 14:12Z today). `origin/feat/117-m4-recut` is deleted, so the overlap
  below is computed against the squash. The pilot can run once main is merged into `feat/117-m5`.
- **M4's `engine build` keeps its Swift scratch under `engine/build`,** which is why the archive excludes it.
- **`approval-cycles.mjs` binds TextEdit's existing window** and is refused without it ("the kit opens a scratch
  document in it first"). D's TextEdit fixture therefore covers the cycles too.
- **The window-order rows hold only booleans,** so the Open panel's service id can be read only from the `frontKey`
  readings.
- **The CI `test` gate runs on a GitHub-hosted runner,** so any test double without an explicit env reads as hosted.

## Files this change shares with M4 (PR #513, `c02bbaea..d38630f9`)

- `.github/ci-kit.yml`: M4 rewrote `engine-swift`; I changed only `default-selection-approved`.
- `scripts/repl-parity/native-mac.mjs`
- `test/repl-parity/native-mac-run.test.mjs`

## Concerns

- **Nothing here has run on a runner.** These are all unverified until the pilot: the loopback sshd (copied from
  `hosted.sh`), the setup's order, the two-pass approve on M4's real CLI, whether the xcode-27 runner accepts a bundle
  built on macos-latest, and whether `matrix-device compile` and the probes work there.
- **Time.** Full C (three runs a side plus #212) and full D (accept-native items 1 and 10 are heavy, then 20 cycles) may
  not fit in one job's 360-minute cap. The pilot's timings should decide whether C splits across jobs. Splitting would
  break "one job's run", which the judges now enforce.
- **The artifacts are public** (a public repository). They hold only the runner's own data: bundle ids, timings,
  fixture text and accept-native's generated sentinels. No repository secret is used. `hosted.sh` chose to upload no
  artifact for the parity gates; these sittings need theirs.
- **A full D exits 3 (INCOMPLETE)** until T3b lands, and a full F does the same until T12.
- **Main must be merged into `feat/117-m5` before the pilot,** and the three shared files above resolved.
