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
