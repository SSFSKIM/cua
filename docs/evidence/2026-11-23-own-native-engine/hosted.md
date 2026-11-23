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
| Executor | `scripts/hosted-sittings/run.mjs` | Runs the steps in order with one log per step. Each step is read by its own check (`checks.mjs`, fix wave 1). Statuses are PASS, FAIL, NO VERDICT, OWNER, INFO, SKIP and PENDING. Exit 0, 1 FAIL, 4 NO VERDICT, 5 a full sitting with a pending step, 3 OWNER. |
| Counts and pilot reads | `scripts/hosted-sittings/{counts,pilot-reads,focus-timing}.mjs` | Per cell, on each side: the runs where every sample has a verdict, and each run's verdict samples. The pilot's readings of what part 1 flagged. |
| CLI | `scripts/hosted-sittings.mjs` | `setup`, `approve` (this is `CUA_HOSTED_APPROVE`), `run`, `plan`, `counts`, `focus-timing`, `textedit up/down`. |
| Workflow | `.github/workflows/m5-sittings.yml` | Dispatch only (a push registers it). One `engine` job on macos-latest, then one `sitting` job per sitting. Uploads with `if: always()`. The step summary prints the step table and the counts. |
| ci-kit | `.github/ci-kit.yml` | Gate `default-selection-approved` gains `env: CUA_HOSTED_APPROVE: node scripts/hosted-sittings.mjs approve`. |

## How to run each sitting

Dispatch from GitHub, or with `gh` (not run here; the dispatch forbids `gh workflow run` on this Mac):

```sh
gh workflow run m5-sittings.yml --ref feat/117-m5 -f sitting=<all|a..f> -f form=<full|pilot> -f image=<default|macos-latest|xcode-27> -f flipped=<false|true>
```

- **The pilot** is `-f sitting=all -f form=pilot`. It is the first hosted run after M4 is merged into this branch.
- **`image`** (fix wave 1): `default` runs C on xcode-27 (macOS 27) and A, B, D, F on macos-latest; `macos-latest` or `xcode-27` puts all but E there. The engine is always the macos-latest build job's, copied over, until
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
    and pilot readings are INFO, never FAIL (superseded by fix wave 1: only A's and C's judges may give an expected NO VERDICT in the pilot). PENDING fails no pilot, but a full sitting with one exits 5.
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
- **A full D exits 5 (INCOMPLETE)** until T3b lands, and a full F does the same until T12.
- **Main must be merged into `feat/117-m5` before the pilot,** and the three shared files above resolved.

## Fix wave 1

Round 1 of the review returned nine Important findings and two Minor ones. All eleven are fixed on `feat/117-m5`,
starting from `2cb6c2da0` (part 1's round 2). Part 1's changes are kept: the measure windows, `readBack.unavailable`
and the `cellError` double.

### What changed, finding by finding

- **I1: the TCC writer requires the O0 entry** (`14711a7bf`).
  - `tcc.mjs`'s guard now checks two things before any store access: that it is on a GitHub-hosted macOS runner, and
    that the O0 entry (`DECISION_MARKER`, matched across the spec's line wraps) is in the design spec's Decision Log.
  - It looks for the entry on `origin/docs/117-progress`, then `HEAD`, then in a shallow fetch of
    `docs/117-progress`. The fetch covers ci-kit's one-commit-deep checkout.
  - If none of these holds the entry, it refuses.
  - The spy covers all four refusals from ruling 1137, plus an unreadable log. Each gives zero store calls.
  - Checked on this Mac with a read only (no write): `readDecisionLog()` finds the entry.
- **I2: every ssh to the loopback device goes through its own config** (`851d61a0e`).
  - Every ssh to `hosted-macos` now starts with `-F ~/.local/share/cua-hosted/ssh/config`. `hosted-macos` is marked
    `loopback` in `devices.mjs`, and `scripts/repl-parity/loopback-ssh.mjs` supplies the arguments.
  - This covers the harnesses (`browser-parity/topology.mjs`'s `ssh()`, which builds every remote command, preparation
    included), setup's own check, and `hosted.sh`.
  - `loopback.sh` writes that config, pinned to:
    - `127.0.0.1:2222`;
    - `HostKeyAlias hosted-macos` with strict checking;
    - its own `known_hosts`, which holds the sshd's own host key, and `GlobalKnownHostsFile /dev/null`;
    - its own identity and `authorized_keys`.
  - It no longer touches `~/.ssh/config`.
  - `hosted.sh`'s `sshd_up` now calls `loopback.sh`, so the parity gates use the same pinned config. This is not
    verified on a runner.
- **I3: a hosted run holds replayd's capture alert instead of stopping** (`2c79eb817`).
  - With `alertWatch(..., {hosted: true})` (`matrix-device alerts check --hosted yes`, passed by `steps.mjs alertCheck`
    when `meta.hosted`), up to two UserNotificationCenter windows with no pasteboard title are reported as `held`. Two
    because there is one per copy, as H0 found. They do not abort the run.
  - Samples with the alert in front stay NO VERDICT through their front/key readings.
  - These still stop the run: a third such window, a pasteboard title, another alert process, an unknown new window, an
    unread window list, and any alert on a run that is not hosted.
- **I4: D gets a run-owned config home** (`0451a97e4`). D's accept-native runs with
  `XDG_CONFIG_HOME=<scratch>/accept-config`, which is never the account's `~/.config`. The plan lists that directory in
  `scratchDirs`, and the CLI creates it before the steps run.
- **I5, I6, I7 and m1: each step is read by its own check** (`35d050ed3`). The new `scripts/hosted-sittings/checks.mjs`
  holds the checks; the plan names one per step.
  - `record` (A's and C's runs):
    - A complete `meta.json`/`result.json` passes whatever the exit. A failing exit there is the run's own outcome, which
      its judge reads.
    - A missing or incomplete record is a "runtime error".
  - `verdict` (A's comparisons, C's compare):
    - The status is the last `VERDICT:` line the judge printed. NO VERDICT and OWNER are kept as they are.
    - If no verdict was printed, that is a runtime error.
  - `report`: C's summary passes once its report file is written. Its exit is the verdict, which the compare step gives.
  - `observation` (#212's cell):
    - It passes when a `textedit/intervention.saveSheet` sample recorded the observation, or ran through.
    - It is NO VERDICT when every sample had no verdict (activation, unread or alert).
    - Anything else is a "driver failure".
  - `selection` (E's two lanes):
    - The exit must be the expected one.
    - The report must come from this run: the executor removes it before the step runs, then reads it after.
    - The report must be for the step's lane.
    - Before the flip, the judge must say FAIL and the default home must select the vendor engine on the vendor host. On
      the flip, it must say PASS and select cua's engine on cua's host.
  - The sitting's exit is now: 1 FAIL, 4 NO VERDICT, 5 INCOMPLETE (pending steps, full form only), 3 OWNER, 0 PASS.
    - In the pilot, only judges marked `pilotNoVerdict` (A's and C's) may give an expected NO VERDICT outside the exit.
    - B's diff keeps its real verdict in the pilot.
    - Only a pilot reading that does not answer becomes INFO.
  - m1: the CLI's report is now `sitting.md` beside `sitting.json`. C's judge keeps its own `summary.md`. The workflow's
    step summary reads `sitting.md`.
- **I8: the runner's record names its VM** (`8cc83f569`).
  - The record gains `vm: {id, platformUuid, bootedAt}`:
    - `id` is a random UUID, made at setup;
    - `platformUuid` and `bootedAt` come from `vmIdentity()`, which reads ioreg's `IOPlatformUUID` and `kern.boottime`.
  - `runnerKey` and `runnerText` now include the VM, so one attempt's sittings (each on its own VM) never share a key.
  - `hostedRunOf` compares the record's VM with the controller's own reading. A harness can inject that reading with
    `io.vmIdentity`; the test doubles inject it, so tests never read the real machine.
  - It refuses a record written on another VM, and a VM it cannot read.
  - New tests check that one attempt on two VMs cannot pair, in the matrix pairing and in `checkPair`.
  - Checked on this Mac with a read only: `vmIdentity()` parses.
- **I9: C runs on xcode-27 by default** (`c1d8f1473`). The `image` input gains `default`, which is now its default: C on
  xcode-27, and A, B, D and F on macos-latest. The builder and E always run on macos-latest.
- **m2: the Open panel question is marked unread** (`c1110ac14`).
  - No row keeps the window order itself: the oracle keeps only booleans.
  - So the pilot reports `openPanel.windowOrder: null` and lists it in `unread`. The front/key ids on the panel's rows
    are given beside it, labelled as not the window order.
  - Reading the panel's id from the window order needs the order on the rows. That is part 1's area, so I left it
    alone.

### TDD

**RED**, each run before its implementation:

| Test | Command | Failure |
|---|---|---|
| `tcc.test.mjs` | `node --test test/hosted-sittings/tcc.test.mjs` | `does not provide an export named 'DECISION_MARKER'`, pass 0 fail 1 |
| `ssh.test.mjs` | `node --test test/hosted-sittings/ssh.test.mjs` | `ERR_MODULE_NOT_FOUND … scripts/repl-parity/loopback-ssh.mjs` |
| | | then, after the module, `not ok 2 - loopback.sh writes that config…`, until `loopback.sh` was rewritten |
| `setup.test.mjs` (ssh) | `node --test test/hosted-sittings/setup.test.mjs` | `not ok 2` (the ssh call lacked `-F`) |
| alert hold | `node --test test/native-matrix/live-checks.test.mjs test/native-matrix/matrix-device.test.mjs test/native-matrix/run.test.mjs` | `not ok 13`, `not ok 33`, `not ok 59`; pass 67 fail 3 |
| `plan.test.mjs` (I4) | `node --test test/hosted-sittings/plan.test.mjs` | `not ok 5` (D) |
| `checks.test.mjs` | `node --test test/hosted-sittings/checks.test.mjs` | `ERR_MODULE_NOT_FOUND … scripts/hosted-sittings/checks.mjs` |
| `plan.test.mjs` (checks) | `node --test test/hosted-sittings/plan.test.mjs` | `not ok 2` (A), `not ok 4` (C), `not ok 6` (E); pass 5 fail 3 |
| `runner.test.mjs` | `node --test test/hosted-sittings/runner.test.mjs` | `does not provide an export named 'vmIdentity'` |
| `setup.test.mjs` (VM) | `node --test test/hosted-sittings/setup.test.mjs` | `not ok 2`, `not ok 3`; pass 2 fail 2 |
| `report.test.mjs` (m2) | `node --test test/hosted-sittings/report.test.mjs` | `not ok 3`; pass 4 fail 1 |

`run.test.mjs` was rewritten together with `run.mjs` for the check-based statuses, not before it.

**GREEN:**

| Test file | Result |
|---|---|
| tcc | 9/9 |
| ssh | 2/2 |
| setup | 4/4 |
| plan | 8/8 |
| checks | 4/4 |
| run | 6/6 |
| runner | 8/8 |
| report | 5/5 |
| native-matrix | 453/453 |
| `test/hosted-sittings/*` together | 50/50 (after I5–I7) |

### The focused suites, at `c1110ac14`

```
node --test test/hosted-sittings/*.test.mjs test/native-matrix/*.test.mjs test/accept*.test.mjs test/native-baseline/*.test.mjs test/repl-parity/*.test.mjs test/browser-parity/*.test.mjs
# tests 1879
# pass 1879
# fail 0
RUNNER_ENVIRONMENT=github-hosted GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 node --test <the same files>
# tests 1879
# pass 1879
# fail 0
```

Other checks:

- The workflow parses with ci-kit's vendored YAML parser: jobs `register`, `engine` and `sitting`, with the new
  `runs-on` expression.
- `sh -n` passes on `loopback.sh` and `hosted.sh`.
- `node scripts/hosted-sittings.mjs plan e --out /tmp/x` prints E's plan with its `selection` checks.

No full `npm test`, hosted run, GUI or TCC write.

### Decisions

1. **How the guard reads the Decision Log** (I1). It reads the spec from git: `origin/docs/117-progress`, else `HEAD`,
   else a shallow fetch, as H0's kit did. The marker is matched with whitespace collapsed, because the spec wraps the
   entry across two lines.
2. **Where the ssh config lives** (I2). The config path is fixed under the runner's home, and routing comes from the
   device declaration (`loopback: true`). There is no environment variable, so a call cannot miss it. `hosted.sh`
   shares `loopback.sh`, so the parity gates are pinned too.
3. **What counts as the known capture alert** (I3). The hold applies only on hosted runs, and covers at most two
   UserNotificationCenter windows with no pasteboard title. A window that was already up at the baseline is not
   required: the vendor helper's alert first appears during the run.
4. **How the expected red is proved** (I7). The proof is the judge's own report, removed before the step runs. Its
   default home must show the vendor's engine and host: these are the report's `selected` and `host.host` fields.
5. **Exit codes follow the matrix judge's.** The sitting exits 3 for OWNER and 4 for NO VERDICT, as the matrix judge
   does. INCOMPLETE moves from 3 to 5.
6. **One VM identity** (I8). The VM is the setup's own id, together with the platform UUID and boot time. The
   controller re-reads the machine facts, and the key carries the id.
7. **The Open panel stays unread** (m2). Recording the window order on rows would touch part 1's harness.

### Files this wave shares with part 1's round 2

These are `run-doubles.mjs` and `run.test.mjs`. In `run-doubles.mjs` I added one io field, `vmIdentity`. In
`run.test.mjs` I added one test for the hosted alert check. `steps.mjs` changed only in `alertCheck`, and `run.mjs`
only at its `hostedRunOf` call. The `harness.md` edits from round 2 are untouched.

### Concerns

- **The loopback config and `hosted.sh` are unverified on a runner.** `hosted.sh`'s gates (`sandbox-denials`,
  `parity-browser`) now depend on `loopback.sh`, which no runner has exercised yet.
- **The "two UserNotificationCenter windows" bound comes from H0.** H0 saw one alert per copy. If a runner shows more,
  the run stops; the run still never passes on it.

## Fix wave 2

Round 2 of the review returned five Important findings (I1, I3, I5, I6, I7) and one Minor. All six are fixed on
`feat/117-m5`, on top of part 1's fix wave 3 (`d50d4c891`) and the merge of M4 (`4c922d067`). Each file was re-read at
that head before it was edited.

### What changed, finding by finding

- **I1: the O0 source is pinned at preparation** (`58ce12e43`).
  - The writer no longer runs git. `scripts/hosted-sittings/pin.mjs` (`node scripts/hosted-sittings.mjs pin-decision
    [--commit <full sha>] [--env-file <file>]`) does the fetching, at preparation:
    - It pins the commit: `db775127652ebae5e0c7d90b5f5e2785f8e5711e` (`O0_COMMIT`) by default, or a later full SHA
      that the workflow's new `decision_commit` input names.
    - It fetches that commit if the checkout lacks it, then checks `FETCH_HEAD`.
    - It writes the design spec at that commit to a file the run owns:
      `$RUNNER_TEMP/hosted-sittings-decision/design-<sha>.md`.
    - It exports `CUA_HOSTED_DECISION_FILE` and `CUA_HOSTED_DECISION_SHA`.
    - It refuses off a GitHub-hosted runner, before any git.
  - Where it runs:
    - In the workflow, the step "Pin the O0 source for the TCC writer" runs before setup for A to E, through
      `$GITHUB_ENV`. Sitting E's approve reads the pin from there too.
    - In ci-kit, the `default-selection-approved` gate's run pins first, then sources the two variables.
  - What `tcc.mjs` checks, in order, before any store access:
    1. It is on a GitHub-hosted runner.
    2. It reads only the pinned file (`pinnedDecisionLog`). It refuses when no file is named, when the file is missing
       or unreadable, or when the SHA is not a full one.
    3. It runs `decisionEntryProblem` on that file. The marker must open an entry of its own: a `- ` line, plus any
       indented continuation lines, inside `## Decision Log` up to the next `## ` heading, whose whitespace-normalised
       text begins with the marker. It refuses a quotation of the marker in another entry, and a marker outside the
       section.
  - The write log cites the pinned SHA: "under the design spec's Decision Log at <sha>". `grantRows` returns
    `decision: {entry, commit}`, which lands in the setup and approve reports. The runner record carries no TCC facts,
    so it does not cite the SHA.
  - Tests:
    - The off-host refusals use a `decisionLog` spy that throws if it is called.
    - New refusals: a quoted marker, a marker outside the section, a missing file, an unreadable file, and a short SHA.
    - Every refusal makes zero store calls.
    - `pin.test.mjs` covers the hosted guard, the fetch with its `FETCH_HEAD` check, and the full-SHA rule.
  - Checked on this Mac by a read only: `decisionEntryProblem` returns null for the real spec at `db775127`.
- **I6: a step resolves only once its log is flushed** (`1e35e4f3f`).
  - `execStep` is now async:
    - It awaits the log stream's open.
    - It resolves only after `file.end()` calls back.
    - A write error on the log is the step's runtime error, as is a log directory that cannot be made.
  - The test runs a real subprocess that writes 4 MB and then a `VERDICT:` line, and runs a delayed stream (each write
    lands 30 ms late, injected through `openLog`). It also covers a blocked log path.
  - Mutation check: with `execStep` resolving before the flush, the delayed-stream case fails.
- **I7: E's expected red needs every home observed** (`525aaeafa`).
  - The `selection` check now reads every home of `macos-selection.mjs` `HOMES`. A home counts as observed when it has
    `selected` and `host.host`.
  - Each home must select what the step's ref gives it (`expectedHome`):
    - Before the flip, every home selects the vendor's engine for reason `default`, on the vendor host for
      `macos_native_peer_requires_vendor`. That is `launch.mjs` `nativeEngineFor` with the vendor default, then
      `macosComputerHost`.
    - On the flip, the default home selects cua's engine (`default`) on cua's host (`cua_engine`). Each fallback home
      keeps the vendor's engine and host for its own reason (`HOMES[kind].expect`).
  - A fresh FAIL report whose default home fell back for `engine_not_installed` now fails. So does a report with a home
    missing, or a home with no observation (its `problem` is quoted).
- **I5: #212's cell asks for its runs and checks every record** (`ba623c5e8`).
  - The plan:
    - The save-sheet step passes `--runs <n>`: 1 in the pilot, 3 in full, as the matrix runs.
    - It names every record it asks for in `records` (`run-1` to `run-n`). The pilot's step asks for exactly one run
      and checks that run's record.
  - The `observation` check:
    - Every record must exist and be complete. A missing or incomplete record is a runtime error whatever it observed.
      The reason counts the panel observations kept in the records; they stay in the artifact and are not certified.
    - Every record must hold a sample of the cell.
    - It passes only on an actual panel observation: `outcome.observed.before` or `.after` with at least one element
      line (`savePanelStructure`'s shape).
    - A sample that ran through, or an observation with no structure, is no longer a pass.
    - NO VERDICT is unchanged: every sample has no verdict, by activation, unread or alert.
- **I3: the capture alert at a key guard is the sample's NO VERDICT row** (`e9a79ed08`).
  - `sendKeys` changes only on a hosted run, and only when the guard finds `com.apple.UserNotificationCenter` in front.
    It then runs an alert check:
    - If the check holds the capture alert, and nothing else, the key is still not sent. `meta.keySkipped` marks the
      skip `held: true`.
    - It reads front and key, then marks the device-clock window, from the run's last marked step through that read,
      as the sample's window (`row`, or `setup` for a harness key). The alert's own activation is therefore accounted
      to the sample, not left unaccounted.
    - It then throws `AlertHeld`.
    - Anything the watch does not hold still stops the run, as does UserNotificationCenter in front with no window
      held. Off a runner, the run stops as before.
  - `AlertHeld` is caught where each sample's row is made:
    - `caseRow`: the row and its speed row;
    - `probe-run.mjs` `sampled`: every probe cell. The span is now made by `sampled` and passed to the attempt, so the
      held row's window covers the whole attempt;
    - the Unicode mid-switch attempt;
    - `run.mjs` `openPanel`: the panel's rows carry the readings.
  - Each held row:
    - Its readings are the activate step in force, the guard's reading (UserNotificationCenter) and one read after. So
      `sampleCause` gives `alert`, NO VERDICT under ruling 1141, counted per cell.
    - It also carries `invalid: "the key guard held the action's keys: …"` as a backstop.
    - A cleanup whose keys the alert held is recorded as `outcome.cleanupHeld`. The run goes on.
  - The alert's identity:
    - The readings cannot identify the alert. H0 read its owner, one window for each capturing copy, and that it
      persists; it read no title, text or size. On the runner the reading process may not read titles at all
      (`system-windows.swift`: `name` is null without Screen Recording).
    - So the hold stays the bound: UserNotificationCenter windows, up to two, with no pasteboard keyword. That is a
      bound, not an identification.
    - The limitation is written in `alertWatch`'s comment, here, and in the pilot's output. A new "Capture alert" line
      always says the alert is held by owner and bound, not identified.
    - What the pilot reads, so that a later wave can pin the alert:
      - Each held window now keeps `titled`: true or false, or null when unreadable; never the title itself.
      - It keeps its `size`.
      - Each distinct held reading goes to the run's `meta.alertsHeld`. The pilot's reads merge these across runs.
  - The reviewer's reproduction is now a test: an in-memory hosted save-sheet run where the alert comes up after
    TextEdit's activation. It records one row:
    - the row's readings show UserNotificationCenter front and key;
    - `sampleCause` is `alert`;
    - `super+n` is never sent;
    - no activation is left unaccounted;
    - the result is `complete: true`, verdict `no-verdict`.
- **Minor: a pilot that proved nothing says so** (`59e688af3`).
  - When a pilot passes but one of its judges gave only the expected NO VERDICT, or some of its steps are pending (F),
    `renderSitting` changes two lines:
    - "Proves: …" becomes "Would prove: …. This pilot proves none of it: <n judges gave the expected NO VERDICT>,
      <n steps pending>".
    - The headline becomes **PILOT COMPLETED WITHOUT ACCEPTANCE PROOF**.
  - The exit codes are unchanged, as is `report.verdict` in `sitting.json`. B's pilot, its full form, keeps
    "Proves" and PASS.

### TDD

**RED**, each run before its implementation:

| Finding | Command | Failure before the change |
|---|---|---|
| I1 | `node --test test/hosted-sittings/tcc.test.mjs` | against the writer at `4c922d067` (re-run after the fix by restoring it): `does not provide an export named 'O0_COMMIT'`; pass 0 fail 1. The pinned-file reader the table needs did not exist |
| I6 | `node --test test/hosted-sittings/run.test.mjs` | the 4 MB subprocess alone passed on the old code; the delayed `openLog` stream made test 7 fail; confirmed again by mutation after the fix |
| I7 | `node --test test/hosted-sittings/checks.test.mjs` | `not ok 4 - sitting E: …`; pass 3 fail 1 (the `engine_not_installed` default home and the missing homes passed) |
| I5 | `node --test test/hosted-sittings/plan.test.mjs test/hosted-sittings/checks.test.mjs` | `not ok 3` (observation: `step.records`), `not ok 8` (C: no `--runs`, no `records`); pass 10 fail 2 |
| I3 | `node --test test/native-matrix/probe-run.test.mjs test/native-matrix/live-checks.test.mjs test/native-matrix/run.test.mjs` | `not ok 13` (held window readings), `not ok 50` (hosted save sheet: complete false, zero rows), `not ok 51`, `not ok 65` (caseRow); pass 70 fail 4. Re-run with the implementation reverted: the same four fail |
| I3 (pilot) | `node --test test/hosted-sittings/report.test.mjs` | with the old `pilot-reads.mjs`: `not ok 3`, `not ok 5`; pass 3 fail 2 |
| Minor | `node --test test/hosted-sittings/run.test.mjs` | `not ok 7 - a pilot that proved nothing is labelled so…`; pass 7 fail 1 |

`pin.test.mjs` was written with `pin.mjs`, not run red on its own.

**GREEN:**

| Test file | Result |
|---|---|
| hosted-sittings: tcc | 14/14 |
| hosted-sittings: pin | 3/3 |
| hosted-sittings: checks | 4/4 |
| hosted-sittings: plan | 8/8 |
| hosted-sittings: run | 8/8 |
| hosted-sittings: report | 5/5 |
| native-matrix: probe-run | 25/25 |
| native-matrix: run | 23/23 |
| native-matrix: live-checks | 26/26 |
| `test/native-matrix/*` | 519/519 |

### The focused suites, at `59e688af3`

```
node --test test/hosted-sittings/*.test.mjs test/native-matrix/*.test.mjs test/accept*.test.mjs test/native-baseline/*.test.mjs test/repl-parity/*.test.mjs test/browser-parity/*.test.mjs
# tests 2126
# pass 2126
# fail 0
RUNNER_ENVIRONMENT=github-hosted GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 node --test <the same files>
# tests 2126
# pass 2126
# fail 0
```

Other checks:

- `test/runtime-launch.test.mjs`: 56/56.
- The workflow parses with ci-kit's vendored YAML parser.
- `.github/ci-kit.yml` parses with ci-kit's own `parseConfig`: 13 gates, and the approved gate pins first.

No full `npm test`, hosted run, GUI, TCC write or push.

### Decisions

1. **Where the pin runs** (I1). It runs as its own CLI step, `pin-decision`, before setup, and in the ci-kit gate's run
   script. The writer reads two environment variables and nothing else. The pinned SHA is cited in the write log and in
   `grantRows`' `decision.commit`, not in `runner.json`: the record holds no TCC facts.
2. **What "an entry of its own" means** (I1). An entry is a `- ` line in the section, plus its indented continuation
   lines; its normalised text must begin with the marker. A marker inside another entry's text is a quotation.
3. **E's pre-flip expectation includes the host's reason** (I7). Every home must give `vendor (default)` on
   `vendor host (macos_native_peer_requires_vendor)`, which is exactly what the current code gives. A change in that
   reason would turn E's expected red into a FAIL, and someone would have to look.
4. **#212's full form asks for three runs** (I5). Three, as the matrix runs; one in the pilot. A pass needs every
   record complete and at least one panel observation. A panel observation is one element line of
   `savePanelStructure`: the controls are not identified yet, so "the panel's structure" cannot be checked more
   narrowly.
5. **The held alert is identified by the front plus a live alert check** (I3). The front must be UserNotificationCenter
   and an alert check at the guard must hold it. The hold itself stays the bound, documented as such; titled/size
   readings are added for the pilot to pin it later.
6. **A held sample's row window** (I3). It runs from the run's last marked step through a read after the guard, so the
   alert's own activation is the sample's. For harness keys it is a `setup` window.
7. **A held cleanup does not stop the run** (I3). It is recorded as `outcome.cleanupHeld`. The state it would have
   closed, such as an untitled document, stays, and later samples may be invalid because of it. That never makes a
   pass.
8. **The pilot label is presentation only** (Minor). The exit and `report.verdict` are unchanged. The label applies
   only to a pilot that passed with expected NO VERDICTs or pending steps.

### Discoveries

- **The pilot's Save panel line never showed the structure's ids.** `outcome.observed` is `{before, after}`
  (`probe-plan.mjs` `saveSheetDestinationCell`), but `renderPilotReads` read `.lines` on it directly. Its test fixture
  used the flat shape, so the test passed. Both are fixed in `e9a79ed08`: the fixture now has the real shape, and the
  line reads `after`, else `before`.
- **The alert's activation would have left the run incomplete.** `accountActivations` leaves an activation outside
  every window unaccounted, and the run then becomes incomplete. The capture alert's activation falls between the
  activate step and the guard, a gap no window covered. The held mark closes that gap, and the hosted save-sheet test
  injects such an activation.

### Concerns

- **The capture alert is held by a bound, not identified** (I3). Any UserNotificationCenter window, up to two, with no
  pasteboard keyword is held. So a different system prompt from that process would also be held. Its cost is limited:
  keys stay blocked while it is in front, and its samples are NO VERDICT. The pilot's "Capture alert" line and
  `meta.alertsHeld` give the readings a later wave needs to narrow the hold.
- **The pin's fetch needs `origin` readable without credentials** (I1).
  - The workflow checks out with `fetch-depth: 0`, so the commit is present as long as `docs/117-progress` holds it.
  - ci-kit's one-commit checkout needs the fetch, and `persist-credentials` is false. If the fetch fails, the gate
    fails before any TCC write. That is fail-safe, but it would need a fix.
- **A held sample can leave state behind** (I3, decision 7). This is not verified on a runner.
- **I3's paths outside the save sheet and `caseRow`** (Unicode mid-switch, `openPanel`) are covered by code, but by
  no test of their own.

## Fix wave 3

Round 3 of the review returned three Important findings (I3a, I3b, I1) and one Minor, all fixed on `feat/117-m5` from
`28fd8d1f3`, which includes the #518 merge and two doctor fixes. I re-read each file before editing it. Nothing in this
wave touches native-matrix's summary or lane files.

### What changed, finding by finding

- **I3a: a held row never gets a verdict** (`eb1944dd4`).
  - `AlertHeld.reading` now holds the guard's own observation:
    - `front` is the app the key guard saw, UserNotificationCenter;
    - `key` is read just after.
    - Before this fix, the reading was taken later, so an alert that had left the front made the row look clean.
  - Every row a hold affected carries `AlertHeld.row`:
    - `alertHeld: {keys, front}`;
    - `invalid` as a backstop.
  - `front-key.mjs` `sampleCause` checks `alertHeld` first. A row carrying it is `alert`: NO VERDICT, counted per
    cell, whatever the readings say.
  - Rows get the mark in four places:
    - `caseRow`;
    - `probe-run.mjs` `sampled`;
    - the Unicode mid-switch;
    - `run.mjs` `openPanel`, for both regimes. `skippedTarget` and the background `caseRows` add the mark to every
      case and timing row.
  - Regression test, the reviewer's case:
    - ⌘O is held while the alert is in front for the guard's read only. Every later read shows TextEdit.
    - Every Open-panel row, frontmost and background, is `alert` and carries the backstop.
    - The cell is not FAIL. The run is complete.
  - With the old code, `sampleCause` was null for these rows, as the reviewer found.
- **I3b: a held attempt still undoes its fixture** (`492c6c278`).
  - Cleanup is registered when the fixture is made:
    - The attempt's span now carries `made(scene, cleanup)`.
    - The save sheet and the sheet variant call it right after ⌘N, so a hold anywhere after that has the cleanup to
      run.
    - On `AlertHeld`, `sampled` ends the attempt with that cleanup, which runs as any attempt's cleanup does, after the
      row is recorded.
  - If the alert holds the cleanup's own keys:
    - The row records `outcome.cleanupHeld`.
    - The fixture is kept as the run's held fixture, and listed in `meta.fixturesHeld` as `{row, sample, scene, reset}`.
  - Before any further sample, and once the probe cells end, `resetHeldFixture` handles a held fixture:
    - It activates the fixture's scene first ("alert up, scene activated first"), then runs the cleanup again.
    - If the cleanup runs, it records `reset: true`.
    - If it still does not run, it records `reset: false` and stops the run with "… could not be reset …; the run
      stopped collecting evidence". The rows already kept stay NO VERDICT.
  - Tests, each a hosted save sheet whose typing is held after the document opened:
    - **Alert up only for the guard:** the sheet is cancelled and the document closed, and the run completes.
    - **Alert up until the next activation:** the cleanup is held, `cleanupHeld` is recorded, and the reset closes the
      document (`reset: true`).
    - **Alert that never leaves:** the run stops with `reset: false`.
  - With the old code, the cleanup never ran, the run completed, and nothing marked the document as left open.
- **I1: examples of the entry do not pass the O0 guard, and the override must come from a reviewed source**
  (`10777055e`).
  - `decisionEntryProblem` now tracks fenced code blocks, at any indent:
    - A fence opens on ```` ``` ```` or `~~~`.
    - It closes on the same character, at least as long, with nothing after it.
    - Lines inside a fence are skipped, and each fence ends the entry before it.
  - Indented code was already rejected, because an entry must start at column 0 with `- `. It is now a test case.
  - The zero-store-call refusal table gains three cases: a ```` ``` ```` fence, a `~~~` fence and indented code.
  - The real spec at `db775127` still passes; I checked this by reading it on this Mac.
  - `pin.mjs`, for any commit other than `O0_COMMIT`:
    1. It fetches `docs/117-progress` into `refs/remotes/origin/docs/117-progress`. A failed fetch only means the
       check below refuses.
    2. It accepts the commit only if `merge-base --is-ancestor` finds it in `O0_COMMIT`'s history or in that branch's.
    3. Otherwise it refuses, before reading or writing the spec.
    - The check costs one fetch and two `merge-base` calls, and the workflow's checkout already has full history.
  - The workflow input's description now says the override must come from that branch.
- **Minor: the Unicode mid-switch's held row** (`c33dd2a4f`). A focused test on a hosted run with the alert at the
  mid-switch's guard. It checks that:
  - the typing is never sent;
  - the input-source probe is finished;
  - Latin is selected again and read back;
  - the row is `alert` with the backstop;
  - the run is complete.
  It passes on the existing code. Changing the catch to rethrow makes it fail.

### TDD

**RED**, each run before its implementation:

| Finding | Command | Failure |
|---|---|---|
| I3a | `node --test test/native-matrix/front-key.test.mjs test/native-matrix/run.test.mjs` | `not ok 9` (an `alertHeld` row with clean readings: no cause), `not ok 24` (Open panel: `sampleCause` null, as in the review); pass 31 fail 2 |
| I3b | `node --test test/native-matrix/probe-run.test.mjs` | `not ok 26` (no `savesheet.cancel`, no `sheet.cleanup` after the held typing), `not ok 27`; pass 25 fail 2 |
| I1 | `node --test test/hosted-sittings/tcc.test.mjs test/hosted-sittings/pin.test.mjs` | `not ok 2` (pin: an override not on a reviewed source accepted), `not ok 10`, `not ok 11` (the two fenced examples accepted: store reached), `not ok 16`; pass 16 fail 4. The indented-code case already refused |
| Minor | `node --test --test-name-pattern="mid-switch row on a hosted run" test/native-matrix/unicode-run.test.mjs` | passes on the existing code; with the catch changed to rethrow: `not ok 1`, pass 0 fail 1 |

**GREEN:** front-key and run, 33/33. probe-run, 27/27. tcc and pin, 20/20. `test/hosted-sittings/*`, 65/65.
`test/native-matrix/*`, all of them.

### The focused suites, at `c33dd2a4f`

```
node --test test/hosted-sittings/*.test.mjs test/native-matrix/*.test.mjs test/accept*.test.mjs test/native-baseline/*.test.mjs test/repl-parity/*.test.mjs test/browser-parity/*.test.mjs
# tests 2134
# pass 2134
# fail 0
RUNNER_ENVIRONMENT=github-hosted GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 node --test <the same files>
# tests 2134
# pass 2134
# fail 0
```

The workflow still parses with ci-kit's YAML parser. I made no full `npm test`, hosted run, GUI action, TCC write or
push.

### Decisions

1. **The mark decides, not the readings** (I3a). `alertHeld` is a row field that `sampleCause` reads first. The
   front/key readings stay as observed: the guard's front, then whatever came after. The `invalid` reason is a second
   way the row can never count.
2. **A dirty fixture is reset or ends the run** (I3b). Reset is tried with the scene activated, before the next
   sample and at the end of the probe cells. If it fails, the run stops (`complete: false`) instead of collecting more
   evidence beside an open document. This is fail-safe, but a hosted run whose alert never leaves TextEdit's front ends
   incomplete, not NO VERDICT.
3. **What counts as "reviewed"** (I1). A reviewed commit is `O0_COMMIT`, an ancestor of it, or any commit reachable
   from `origin/docs/117-progress`. That branch is the one the owner's entry was recorded on. Any commit there is in
   its reviewed history.
4. **Fences are judged the CommonMark way** (I1): ```` ``` ```` or `~~~`, three or more, closed by the same character
   at least as long. An unclosed fence hides the rest of the section, so a broken spec refuses.

### Concerns

- **An alert that never leaves the front now ends a run incomplete** (decision 2). C's observation check reads an
  incomplete record as a runtime error, so the sitting fails rather than giving NO VERDICT. It never passes either way.
- **The ancestry check depends on fetching the branch.** In a shallow checkout, or one without credentials for a
  private repository, the branch fetch fails and any override is refused. This affects only the override; the
  default pin is unaffected.

## Fix wave 4

Round 4 returned two small O0 findings and two Minor ones. All four are fixed from `00dcbc17c`.

### What changed

- **I1: an override is checked only against a tip fetched in this run** (`29058c799`).
  - `pin.mjs` first checks whether the override is in `O0_COMMIT`'s own history. That check needs no fetch.
  - Otherwise it fetches `refs/heads/docs/117-progress` and reads that fetch's `FETCH_HEAD`. It then tests the
    override's ancestry against that tip only, never against a tracking ref the checkout may already hold.
  - If the fetch fails, any override outside `O0_COMMIT`'s history is refused, before the spec is read.
  - The default pin is unchanged.
  - New test: the fetch fails while a cached ref holds the candidate. The override is refused, and nothing is shown or
    written.
- **I1: a fenced heading no longer passes** (`29058c799`).
  - `decisionEntryProblem` now marks fenced lines across the whole document first. The section's start, its end and
    its entries are all read from lines outside fences.
  - A document whose only `## Decision Log` heading and O0 bullet sit inside one fence now refuses with "no Decision
    Log section". This case is in the zero-store-call table.
  - The real spec at `db775127` still passes.
- **Minor: a stop caused by a reset the alert blocked is labelled NO VERDICT** (`4130efedc`).
  - `resetHeldFixture` records `blockedBy: 'alert'` when the retried cleanup was itself held.
  - The `record` and `observation` checks read such a stopped record as NO VERDICT, with the fixture reason, so the
    sitting exits 4.
  - Any other incomplete record, including a reset that failed for another reason, stays FAIL.
- **Minor: a held row's timing carries its mark** (`4130efedc`). In `caseRow`, the held method row's speed row now
  copies `alertHeld` and the backstop, so it lands in `alert`.

### TDD

**RED**, all in one run:

```
node --test test/hosted-sittings/pin.test.mjs test/hosted-sittings/tcc.test.mjs test/hosted-sittings/checks.test.mjs test/native-matrix/probe-run.test.mjs test/native-matrix/run.test.mjs
```

pass 71, fail 5:

| Test | Failure |
|---|---|
| `checks` `not ok 3` | the blocked reset read as FAIL |
| `pin` `not ok 6` | the cached ref was trusted |
| `tcc` `not ok 16` | the fenced heading was accepted |
| `probe-run` `not ok 52` | no `blockedBy` |
| `run` `not ok 66` | the timing row's `alertHeld` was undefined |

**GREEN:** the same files pass 76/76.

The focused suites at `4130efedc` pass 2135/2135, plain and with `RUNNER_ENVIRONMENT=github-hosted
GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1`.

I made no full `npm test`, hosted run, GUI action, TCC write or push.

## Pilot A, run 45218179501

Sitting A's hosted pilot ran at `8bf3ff37b`. The artifact is kept outside the repository, in `~/.local/share/cua-m5-pilot/a-1/`.

### Setup: every step passed

| Step | Result |
|---|---|
| loopback | passed |
| harness checkout | passed |
| prepare | passed |
| install | passed |
| engine | unpacked, signature verified |
| vendor rows | written |
| TCC rows | all four services written |
| approve | two passes: pass 1 `engine_capture_confirmation`, pass 2 approved. Build `c83131f0…`, engineVersion 0.3.0 |

### What failed

Every native-baseline run (vv-1, vc-1, cc-1) failed at prepare within a second:

```
the approved home is in use by 3 process(es) (pids 2142, 2162, 2180); refusing to share it
```

pid 2142 was the same in every run; the other two changed from run to run (2208/2226, 2253/2271).

### Cause

`homeUsers` counted every process whose command line names the approved home (`pgrep -f`). On a runner, two kinds of
process do that without using the runtime:

- **cua's approved engine** (pid 2142). Setup's approve left it running, at
  `~/Library/Application Support/cua/engine/cua Engine.app`. On a runner the approved home is the default CUA_HOME,
  `~/Library/Application Support/cua`, so the engine sits under it.
- **The controller's ssh client and the shell around it** (the two pids that changed each run). On the hosted
  topology the controller and the device are one VM. These carry the home in their argv. They are outside prepare's
  ppid chain, because sshd sits between them and prepare. On a two-machine topology they would be on the other
  machine.

### The fix

- **The engine is stopped first, under the admission, before the in-use check.**
  - `prepareRun` now runs in two phases: `admitReused` takes the admission; `cua engine stop` runs (`stopEngine`, the
    `shutdown` request); then `settle()` runs the in-use check, the scratch directory and the stash.
  - Every run starts from a known engine state, and the check needs no exception for the engine.
  - An engine that will not stop gives the admission back and refuses the run, as before.
  - `engineStop` (`{wasRunning, pid?}`) is the run's, as before.
  - Setup gains an `engine stop` step after approve, so every sitting starts with the engine down; this covers C, D and
    T3b too. The result goes into `setup.json` as `engineStop: {wasRunning, pid?, stopped}`.
  - Cleanup already stopped the engine before its own users check.
- **Only real users of the runtime are counted.**
  - `homeUsers` counts a candidate only if it runs the approved helper's exact executable, or an executable under the
    home: the managed Node, a REPL host, or cua's engine if it is left running.
  - A process that only names the path in its argv is not a user. That is the decoy, the controller's ssh client and
    its shell.
  - The match is on executables (`lsof` txt), never on argv.
  - Cleanup uses the same function, so the hosted cleanup no longer sees the ssh client as a stranger.

### Tests

- New, with real processes: an ssh-style client and a shell that name the home are not users; another run's helper
  and a serve whose executable is under the home still are. Their RED (in the next table) is against the
  argv-counting `homeUsers`.
- New: an approved-runtime run stops the engine before its in-use check. With the engine as the only user, the run is
  admitted, and the order is stop, then users.
- Changed: the ownership test's decoy, which only names the helper's path, is no longer listed. The stop-under-the-
  admission test now checks that the admission is held and nothing is stashed yet. `owner.json` is written after the
  check.
- Setup: `engine stop` comes after approve and before the record, and `engineStop` is reported.

RED:

| Command | Result |
|---|---|
| `node --test test/native-baseline/approved-runtime.test.mjs` | pass 13 fail 4: `not ok 10` (the stop came after the stash), `not ok 15` (the decoy listed), `not ok 16`, `not ok 17` |
| `node --test test/hosted-sittings/setup.test.mjs` | pass 3 fail 1 |

GREEN:

| Suite | Result |
|---|---|
| `test/native-baseline/*` | 203/203 |
| `test/hosted-sittings/*` | 68/68 |

### The other sittings, checked statically

| Where | Guard | Finding |
|---|---|---|
| B: `native-mac`, through `repl-parity/prepare-device.mjs` | `prepareRun`/`cleanupRun` | Met the same guard, with the engine running and the ssh client visible. Fixed by both changes. |
| C: `native-matrix`, `live-device.mjs` | its begin already runs `stopEngine` before preparation | Only the ssh client in argv was a problem, fixed by the narrowing. Its cleanup stops the engine again before the users check. |
| `native-baseline/remote.mjs` | the preflight's `serves` count, `pgrep -f` on `<checkout>/bin/cua.mjs serve` | No change. It runs before a serve is started, and its bracket keeps it from matching its own ssh command. A controller's ssh client carrying a serve command exists only while that serve runs, so counting it is not a false positive. |
| The scene and app checks | `pgrep -x TextEdit`, `pgrep -x ChatGPT` in accept-native, `hosted-sittings.mjs textedit`, `mini-rules.mjs` | Process names, not paths: no change. |
| D: `accept-native` | runs in a scratch CUA_HOME with no admission guard | Setup's engine stop gives it a known engine state. |
| D: `verify --bind`, `approval-cycles` | no admission or in-use guard | Setup's engine stop gives them a known engine state. |
| T3b | not built yet | Its stages run after setup's engine stop. A relaunch at every stage should go through `cua engine stop` the same way. |

### Decisions

1. **Stop the engine; do not exclude it.** The design session's steer: the engine is stopped under the admission and
   before the check, so the check stays one rule. The engine is no longer needed to persist across a run, because the
   cua lanes launch it on demand.
2. **Executables, not argv.** A user runs part of the runtime. That is the same rule `cleanupReused` already applied to
   helpers, now applied to every candidate.

The focused suites (hosted-sittings, native-matrix, accept*, native-baseline, repl-parity, browser-parity, sandbox-probe) pass 2259/2259. I made no hosted run, GUI action, TCC write or push.

## The O0 fence scanner, after wave 4's review

An independent review of wave 4 found that the fence scanner in `tcc.mjs` was not CommonMark-aware in two ways:

- It accepted a closer at any indent, including an indented line that is literal content inside a top-level fence.
- It did not recognise a fence that opens on a list marker. It could then take that fence's closer for an opener and
  hide the Decision Log after it.

This commit does not write a full parser. `fenceScan` places only fences it can place without doubt: those that open
at column 0 and close with the same character, at least as long, indented at most three spaces, with nothing after the
marker. It refuses a document as "the pinned spec's fences are ambiguous (…, line N)" when it finds any of these:

- a closer indented four or more;
- a fence opening on a list marker;
- any other indented fence marker outside a fence, which would belong to a list item or be indented code;
- a fence that is never closed.

The zero-store-call table gains three cases:

- an indented closer inside a top-level fence;
- a list-marker fence before the Decision Log;
- a list item's fence whose closer looks like an opener.

The `~~~` example moves to column 0, so it still tests a placed fence.

- RED (`node --test test/hosted-sittings/tcc.test.mjs`): pass 18, fail 3. The three new cases reached the store.
- GREEN: 21/21, and `test/hosted-sittings/*` 71/71.

The real spec at `db775127` passes; I checked a byte-identical copy of `git show` at that commit. It has four fence
lines (307, 386, 392, 634), all at column 0, balanced, and all before `## Decision Log` (line 780). Its Decision Log
holds no fence.

## Pilot A, run 45220897246

Sitting A's re-run at `92b13bb66`. The artifact is in `~/.local/share/cua-m5-pilot/a-2/`, and the job log is saved
beside it as `job.log`.

The engine job took 2.5 min. The sitting job took 4.5 min: vv 30 s, vc 56 s and cc 58 s.

The engine-stop fix worked. Setup passed every step, including `engine stop: was running (pid 2782), stopped`, and vc-1
and cc-1 were complete. vv-1 was INCOMPLETE at `setup.activate`, so the hosted `record` check gave FAIL ("runtime error:
the run is incomplete"). compare-A, B and C were NO VERDICT, as expected for a pilot.

### Timeline (job log and vv's rows)

| Time (UTC) | What |
|---|---|
| 16:54:14.1 | setup: the vendor helper's rows written; the helper is not running |
| 16:54:20.4 | approve pass 1: `engine_capture_confirmation`. This is cua's copy's first capture, which raises replayd's alert |
| 16:54:25.9 | approve pass 2 approved; engine stop (pid 2782) |
| 16:54:30.5 | vv-1 starts: cold connections, then warm.noop, getState and listApps. All ok; none needs the front |
| 16:54:44 | vv's `bind.getApp` launches TextEdit (pid 4009): ok, 2.9 s, 1 approval. The vendor helper had not run before this run (`helperAtStart`: none), so this bind's capture is its first |
| ~16:54:49.7 | `setup.activate`: `open -a TextEdit` once, then 12 reads of the front over 5.08 s |
| 16:54:54.8 | every read was UserNotificationCenter (pid 2596), never TextEdit, so the run stops |
| 16:55:09 | vc's bind launches TextEdit (pid 6049); `setup.activate` takes the front on its first read (977 ms) |
| 16:56:05 | cc's bind launches TextEdit (pid 9623); `setup.activate` takes the front on its first read (474 ms) |

### Which alert it was

UserNotificationCenter shows both copies' alerts, so its pid cannot tell them apart. pid 2596 is lower than the engine's
2782, so the process predates the approve's launch of the engine. That dates the process, not the window. Nothing in
the run read the window list or replayd's SCAlert lines, so I cannot say from the record which window was in front.

The evidence points to the vendor helper's own first-capture alert:

- In H0 (ii), every copy alerts at its first capture, and the vendor helper stacks a second window over cua's. Here the
  vendor helper's first capture was vv's bind, about 3 to 5 s before the activation.
- vc and cc activated on their first read, with cua's alert from approve pass 1 still up, and by then the vendor's.
  Neither raised a new alert: cua's copy had already captured at the approve, and a second capture by the same copy
  raises none (H0 (ii)).
- So the one run that failed is the one whose own bind had just raised a new alert. The runs where every alert was
  already up activated cleanly.

That fits H0's two observations: a new alert takes the front, and an activation takes the front from an alert already
up.

What I cannot tell:

- whether the vendor's window appeared before or after the one `open -a`;
- whether a second activation would have worked;
- whether vv's warm.getState, which listed 8 apps, captured. If it did, the alert came about 15 s earlier, and the
  failure is H0 (ii)'s "activation under an alert is unreliable" rather than a fresh alert.

It was not the leftover from approve pass 1 alone. That alert was equally up for vc and cc, which activated fine.

### Reconciliation with H0 (ii): the alert did not clear

H0 (ii), run 45156038821, saw both alerts on screen at every sample for 604 s and 602 s. Nothing in this run shows an
alert closing either. The "about 15 s" is the gap between vv's failed activation (16:54:54.8) and vc's activation
(about 16:55:10), and that activation is the only later front reading. It shows the front taken by vc's
`open -a TextEdit`, not an alert gone.

H0 (ii)'s keystroke cell and ruling 1141's run show the same thing: TextEdit and Finder activations took the front and
the key focus with the alerts still on screen. So the alert was covered, not closed. Both copies' alerts were most
likely still up behind TextEdit for all of vc and cc. Neither run read the window list, so that is inferred, not seen.

### What that means for the wait and the judged cells

The fix's bounded wait (below) asks whether UserNotificationCenter is still the front app. It does not ask whether the
alert still exists. Since the alert never closes, the wait can only end early if something takes the front.

Nothing in setup activates an app, so I expect the wait to reach its 60 s bound after both warm-ups. That costs about
2 min per sitting, and the record will say "still in front".

That is a wait the sitting can pass with the alert still up, and that is acceptable. The judged cells never rely on the
alert being gone:

- each run activates its TextEdit first, which takes the front from an alert already up;
- front and key are sampled around each judged cell under the alert-frontmost rule;
- a run that finds the alert in front where it needs TextEdit (at `setup.activate` or before a key) now records the
  cause, and the hosted check reads it as NO VERDICT, never FAIL.

What the warm-up changes is when a new alert can be raised. Both copies make their first capture in setup, so no run's
bind raises one in the middle of its activation, which is the failure in vv.

One residue is worth the design session's eye. H0's README says the alerts "stay on screen above the scenes". A cell
that clicks by coordinates where an alert window overlaps the scene could land on the alert, which would answer it.
That is forbidden. The setup record now keeps each alert window's bounds, so the next pilot can check for overlap with
the scene windows. vc and cc completed their clicks with the alerts up.

### The fix (ruling 1153; 8dd641d2d, b6154d108)

- **(c) The producer names the cause.** In native-baseline's macOS lane (`macos.mjs`), a stop with
  UserNotificationCenter in front records `incompleteCause: {cause: 'alert', at, front}`. `at` is `setup.activate` or
  `key.skipped`, and the first such stop counts. The `record` check (`checks.mjs`, `record` only; `observation` is
  untouched) reads that as `NO VERDICT` ("alert: … stopped at … with com.apple.UserNotificationCenter (pid …) in
  front (…)"). An incomplete run without that cause is still a runtime error, and the message text is never matched.
- **(b) The warm-up, symmetric.** New setup steps `warm-up cua` and `warm-up vendor` run after the approve and before
  the engine stop (`warm-up.mjs`). Each is one `cua serve` session on the copy: bind TextEdit and take one screenshot,
  accept TextEdit's approval and nothing else, then end by pid the TextEdit it launched. If TextEdit was already
  running, it refuses to start. It refuses off a GitHub-hosted runner. It writes nothing, clicks nothing and answers
  nothing.
- **(a) The bounded wait and what each warm-up raised.** Each warm-up records, in `setup.json` → `warmUps[]`:
  - the capture's outcome and the engine its result attested;
  - replayd's SCAlert lines over the capture (`watchCaptureAlerts`);
  - the front app after it;
  - UserNotificationCenter's windows from the window server's list (`system-windows.swift`): pid, number, layer,
    bounds, and whether a title was readable (never the title);
  - the wait itself: a watch-only poll of the front app every 1 s, up to 60 s, with `cleared`, `waitedMs`, `polls`, the
    distinct fronts seen and the last one. An unreadable front does not count as clear;
  - the alert windows again at the end.

  An alert still in front at the bound, or a failed capture, is recorded and the setup goes on. Nothing retries.

Tests:

- RED: `node --test test/hosted-sittings/checks.test.mjs` failed 1 of 6, the new mapping. The producer test failed 1 of
  1. `warm-up.test.mjs` failed: the module did not exist. `setup.test.mjs` failed 2 of 5: the steps list and the
  held-alert case.
- GREEN: checks 6/6; `test/native-baseline/{run,compare-lanes,summary}` 69/69; warm-up 9/9; setup 5/5;
  `test/hosted-sittings/*` 82/82.

Not proven here: the warm-up itself has not run on a runner. Hosted runs are the controller's. The next pilot shows
whether the vendor warm-up raises its alert in setup (`captureAlerts.count` 2, window stacked), whether vv's activation
then takes the front, and how long the two waits cost.
