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
  - Then T3b's staged onboarding, `node scripts/hosted-sittings.mjs onboarding --out $OUT/sitting/onboarding.json`, on
    the same scratch document (see "T3b: the staged onboarding" below). Then TextEdit quits.
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
- **D**'s last step is T3b's staged onboarding (built; see below). **F** needs T12.

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

## T3b: the staged onboarding

Task 7 of the wave (refs #506): the pre-flight's T3b, R5 and §4 item 8. It is built and unit-tested only. Nothing ran
on a runner and no TCC row was written anywhere.

On a runner, it sets the onboarding stages a new Mac goes through by cua's engine's own TCC rows. It then records what
the product does at each stage. It is sitting D's last step that measures, before the scratch TextEdit document's cleanup:

```sh
node scripts/hosted-sittings.mjs onboarding --out "$OUT/sitting/onboarding.json"
```

The full sitting and the pilot are the same: one pass of the four stages.

### What it runs

The driver is `scripts/hosted-sittings/onboarding.mjs`. It works on the run's approved engine through `cua serve`,
with `CUA_NATIVE_ENGINE=cua` set explicitly. The launcher must select cua's engine on cua's host, or the driver stops.

Each stage sets its rows first and then relaunches the engine, because a runner's row is honoured only at the engine's
next launch (H0). Rows go through the one guarded writer, `tcc.mjs`. `revokeRows` is new: it removes cua's engine's
rows for named services, and no other client's. `grantRows` can now name the services it grants.

| Stage | Rows of `io.github.ssfskim.cua.engine` | Relaunch |
|---|---|---|
| `none` | all four removed | `cua engine stop` (the setup already stopped the engine after its approve, so this usually finds none running); a fresh session launches the engine |
| `accessibility` | Accessibility added | the same |
| `screenRecording` | Screen Recording added | the product's own: the stage before refused Screen Recording on this connection, which owes one relaunch at its next observation (`client.mjs`). The same session is kept. The retry is bracketed: see below |
| `full` | Input Monitoring and post events added last | as `none`. The run ends with H0's row set, the setup's |

At each stage, the driver makes two `js` calls on the scratch document:

- a bind of TextEdit, an observation, which checks Accessibility first;
- a bind then a capture (`getScreenshot`). The capture needs Screen Recording, but in a stage without the grants the
  call fails at the bind.

Around every call (rulings 1136 and 1141), the driver first activates TextEdit and checks that it took front and key;
if it did not, the call is not sent. It reads front and key again after the call. The readings use #216's witness's
reading of the screen: the frontmost app, the top window's owner and the system prompts' pids (`screenState`). After
each call it reads `cua engine status`. After both calls it reads `cua doctor`.

`getScreenshot` here is a window capture: the engine captures the app's window (`Screenshot.swift`'s
`capture(window:…)`, over ScreenCaptureKit's shareable windows). So it can succeed behind replayd's alert, which is why
the front-and-key rule applies to both cells. Ruling 1154's guard, which refuses keyboard cells while the alert holds
key, does not apply: these cells are a bind and a capture, and send no keys.

The Screen Recording stage's retry is bracketed, so that nothing can arrive unseen between the baseline and the retry:

1. After the stage before, one second for its status and doctor connections to close.
2. TextEdit activated, and checked front and key, before anything is read.
3. The baseline: `cua engine status`'s pid and connection count, as accept-native item 14 reads them.
4. One second, only for that status read's own socket to close.
5. The engine bundle's running processes, listed by `pgrep` (which opens no socket), just before the retry is sent.
6. The retry itself, then front and key, then `cua engine status` again.

Whether the product relaunched is told by the retry's own status only. If that status is unread, the relaunch is unread;
the second call's pid never stands in for it.

### What it records

The record goes to `onboarding.json`. For each stage it holds:

- the rows removed or granted, as read back;
- the relaunch: the stop's answer and its attempts (an `engine_busy` is retried five times, a second apart), or, for the
  product's relaunch, the pid that last refused Screen Recording, the baseline's pid and connection count, and the
  engine's processes listed as the retry was sent;
- whether the engine's pid changed;
- for each call:
  - the answer's allowlisted facts, through accept-native item 14's `replyFacts`;
  - `cua/permission`;
  - the `cua/nativeEngine` attestation;
  - `cua/errorName`;
  - whether a refusal carries the grant's steps and the approved bundle's path (`permissionGuidance`);
  - the error's text;
  - front and key: the activate check, and the readings before and after;
  - whether it waited, and how;
  - the status after the call;
- the capabilities: Accessibility, Screen Recording, Input Monitoring, `canPostHid` and the pid;
- doctor's engine row and its permissions (`doctorFacts`).

It never writes an operator's confirmation:

- It runs no `cua engine approve`.
- Every CLI runs with its input closed, so a product that waits for an operator reads end of input.
- It declines every elicitation except TextEdit's app approval, which an MCP client answers. Both counts are recorded.

A call the product holds is recorded as a wait, never a refusal, in either form:

- The own host's deadline reply ("js execution timed out; kernel reset, rerun your request", `TIMEOUT_SENTENCE`). The
  host has ended the execution, so the session stays in use.
- No answer at the transport. The call may still be running, so nothing more is sent on that session. Its remaining
  cell is recorded as not sent. If that session is the one the Screen Recording stage needs, that stage is recorded as
  not set, its rows are still written, and the full stage runs on a fresh session.

If a stage's rows, relaunch or session cannot be set, the run stops there, and the record says why. A run that stops
leaves the rows as its last stage set them. Nothing after it in sitting D needs them.

The record is saved after every stage and again before cleanup. Every session's teardown, between stages and at the
end, owns its deadline through the escalation (`disposeSession`):

- The close (`end_task`, then end of input, SIGTERM and SIGKILL) is raced against 30 s. A close that does not end in
  time is recorded as `stuck`.
- Whichever finishes first, the session is then disposed (`dispose()` in `scripts/accept/mcp-session.mjs`): SIGKILL if
  the server still runs, every pending request settled, its pipes destroyed and the child unreferenced. Its exit is
  awaited for at most 5 s, and recorded as `exited`.

So no child, timer or pipe of a session outlives the run, and the CLI ends on its own with the record written; it no
longer calls `process.exit`. Every subprocess the driver starts has its own timeout: `open` 15 s, `swiftc` 300 s, the
front-window probe 120 s, `lsappinfo` and `pgrep` 5 s, and each `cua` command 120 s.

### What the check expects

The check is `onboarding`, in `checks.mjs`, through `onboarding-judge.mjs`. Each expectation comes from M4's code:

| Stage | Bind | Bind then capture | Capabilities | doctor's engine row |
|---|---|---|---|---|
| `none` | refused, `cua/permission` `accessibility` | refused at the bind, `accessibility` | AX false, SR false | `fail` |
| `accessibility` | refused, `screenRecording`, with "a relaunch of the engine is pending" | refused at the bind, `screenRecording` | AX true, SR false | `fail` |
| `screenRecording` | answered, on an engine the product relaunched: the engine before the retry is the one that refused, with only the test's connection, no other engine process as the retry is sent, and the one after it is another | answered, screenshot bytes > 0 | AX true, SR true | `pass` or `warn` |
| `full` | answered | answered | AX, SR, Input Monitoring and `canPostHid` true | `pass` or `warn`, intervention on |

The citations:

- **The order of checks.** `Skyshot.swift`'s `getAppState` runs `requireAccessibility` first. `Screenshot.swift`'s
  `capture` runs `requireScreenRecording`. Every observation captures (the service's header, M4's ruling of
  2026-10-22).
- **The refusal.** `Permissions.swift` writes the sentence, which matches `grantSteps` in `engine.mjs` word for word.
  The service sets `cua/permission`.
- **The recovery.** `client.mjs`'s `relaunchForPermissions`, judged as accept-native item 14 judges it
  (`scripts/accept/onboarding.mjs`, "service relaunch recovery").
- **The doctor row.** `GRANT_EFFECT` in `doctor-engine.mjs`. Its permissions must equal the engine's status, and its
  "intervention detection off" must match Input Monitoring.

### Its exits

| Verdict | When |
|---|---|
| **PASS** | All four stages are recorded, and each shows positive evidence: rows read back, the relaunch shown, every cell sent and answered with TextEdit front and key and no alert around it, the expected answers, and every result attesting the run's cua build. |
| **FAIL** | Any of: a refusal names the wrong grant; a refusal lacks the steps or the bundle's path; a call answers without its grant; a call is refused with its grants present; doctor's row or permissions are wrong. |
| **NO VERDICT** | Any of: no record, or a malformed or ambiguous one (the judge never throws on a record); fewer than four stages, or a run that did not finish; rows not read back; a relaunch not shown; a cell not sent, or with TextEdit not front and key, or an alert front or key around it (ruling 1141); a result answered on another engine (the vendor's on the cua side, state 1, or any build but the run's); a result with no attestation; rows not written or not honoured (a capability that does not match the stage's rows); a relaunch that could not be made; before the product's relaunch, an engine other than the one that refused, another connection, or another engine process as the retry is sent; no relaunch for the Screen Recording grant, the pid unchanged through the retry (never a FAIL: see below); the retry's status unread; a call with no answer; unread status or doctor; no Screen Recording refusal seen before the recovery stage. |

The order follows ruling 1149, as the `record` check does:

1. A result answered on another engine, anywhere in the record, is NO VERDICT before anything else. The step carries
   `engine: 'cua'`, and the attestations are classed by `classifyAttestation` (`scripts/probe/lib.mjs`). Every call
   that carries an attestation is scanned before any stage's own evidence is examined, so a stage that is malformed,
   not set or missing its rows' read-back still has its answers classed.
2. Then any FAIL.
3. Then any other missing proof, including a result with no attestation.

Each cell is judged on its own. A cell without proof is NO VERDICT for itself, and its sibling in the same stage is
still judged.

No relaunch at the Screen Recording retry cannot FAIL. While another client is connected the engine refuses the
relaunch's shutdown as busy (`Methods.swift`), and the client then replays the attested Screen Recording refusal
(`client.mjs`). A client that connects after the baseline and leaves before the status read therefore leaves the same
record as a relaunch never attempted. So it is NO VERDICT, never a PASS: a product that does not relaunch cannot reach
acceptance. The record keeps the connection counts and the processes listed at the retry as evidence.

Residue: a product-side marker for a busy-refused relaunch would let the sitting tell the two cases apart and FAIL a
relaunch never attempted; for example, `_meta` naming the busy refusal and its holders. That marker is product scope,
and it is not built here.

The driver exits 0 when every stage ran, 1 when it stopped, and 2 when refused (off a GitHub-hosted macOS runner, before
anything is touched). The sitting's verdict is the check's, not the driver's exit.

### Tests

- `test/hosted-sittings/onboarding.test.mjs` uses a fake product that answers as M4's code does. It covers the stage
  sequence, a relaunch at every stage, what is recorded, the refusal of any operator confirmation, both forms of wait
  (the host's deadline reply and a transport timeout, after which the session is not used again), a stage that cannot
  be set, the front and key readings, an otherwise successful capture with the alert frontmost, a cleanup that never
  ends, and the refusal off a runner. It also covers the judge: PASS, four FAIL cases, the NO VERDICT cases, malformed
  and empty records, an unattested cell beside a failing sibling, and a moved or busy baseline before the product's
  relaunch. Review round 2 added: an alert around the retry, or an unattested retry, with the pid unchanged (NO VERDICT,
  not "did not relaunch"); another engine's answer in a stage missing its read-back, beside a FAIL; the retry's bracket
  (activation before the baseline, a replacement engine or another client arriving before the retry, the retry's status
  unread); and a real child process that ignores SIGTERM, killed and disposed within the bound. Review round 3 added:
  no relaunch with the pid unchanged is NO VERDICT, never FAIL, including a client that blocks the shutdown and leaves
  before the status read (one connection after the retry).
- `tcc.test.mjs`: every guard refusal applies to `revokeRows` too, with zero store calls. Removal touches only the named
  rows of cua's engine, in the system database. It refuses the vendor's helper, any other app and any unknown service.
  A grant can name its services.
- `plan.test.mjs`: D's `onboarding` step, in its place and its form.
- `checks.test.mjs`: the `onboarding` check.

## Hosted geometry (rulings 1160, 1164)

Built on branch `m5/geometry`, off feat/117-m5 at 5e0aebc64. Nothing here ran on a runner. It is proven by unit tests
with doubles only; the first hosted run is the evidence still owed.

### What was built

- **One shared alert guard**, `scripts/hosted-sittings/alert-guard.mjs`. T8e's rules moved out of the matrix so every
  sitting uses the same code:
  - `guardReading` turns a window list and the targets into bounds.
  - `guardCause` applies the pointer rule. It refuses when a UserNotificationCenter window overlaps one of the target's
    windows or an Open panel, or when UserNotificationCenter holds the front or the key. An unread reading is refused as
    `unread`.
  - `keyCause` applies the key rule: UserNotificationCenter holds the key. Every sitting's key cells share one premise:
    the activation click cua's route 3 may synthesize around a keyed typeText, a paste or an element action is posted
    to the target's pid and window only (`Activation.swift`). So a key cell is checked for the alert holding the key
    (here) or the front (the key guard). An alert that only overlaps the target's windows does not stop a key cell.
    When the key reading could not be taken, nothing refuses the cell, and it goes unguarded against the alert holding
    the key: the key guard's front check cannot see UserNotificationCenter holding the key while the target is in
    front. A, C and D keep this one premise. Each such cell is counted per cell and per side with `recordKeyUnread`
    (`keyUnread: {cell: n}`), so a sitting shows how many key cells went unchecked.
  - `captureCause` applies the capture rule. A screen or region capture that intersects an alert is refused as `alert`.
    A window capture is refused only when its own window is overlapped.
  - `clearFrame` makes the smallest move that clears the alerts, below the 25-point menu bar and with an 8-point margin.
    `placeWindows` reads, moves and reads back each window. It records `{scene, number, from, moved, to, readBack,
    matched}` or a reason.
  - `guardMark` and `countGuards` give the row mark (`alertGuard: {cause, detail}`, `invalid`) and the per-cell
    counts. `recordRefusal(record, cell, cause, extra)` writes a refusal into whatever record a sitting keeps, in one
    shape for A, B, D and T3b: the per-cell entry in `alertGuards`, `alertGuardCounts`, and the first refusal as
    `alertGuardStop: {cause, detail, at}`. It returns the row's mark.

  `scripts/native-matrix/alert-guard.mjs` now re-exports these and keeps only the matrix's cell mapping.
- **A device reader**, `scripts/hosted-sittings/guard-device.mjs`. It is a CLI and a module that runs on the device the
  cell drives:
  - `read --target <scene:pid:window[:only]> [--key]` returns `{bounds, front, key, keyWindow, at}`.
  - `place --pid|--panel --window --frame` returns `{requested, readBack, matched}`. Off a GitHub-hosted runner
    (#560's follow-up) it moves nothing and answers `{requested, readBack: null, matched: false, refused}`.

  It uses the matrix's `system-windows.swift`, compiled once into `~/Library/Caches/cua-harness/guard-device`, together
  with `lsappinfo` for the front app and the live device's focus and window-frame probes. Sittings A and B call it
  through their device (local, or the loopback for B). That way the reading is the target's own, and the same on both
  sides.
- **The display mode step** in setup (ruling 1164), in `scripts/hosted-sittings/display-mode.mjs`, plus a `set <w> <h>`
  subcommand in `display-modes.swift`. Run without arguments, that script still lists the modes read-only.
  - The step runs after the warm-ups, so each copy still raises its one alert at 1024x768. It runs before the engine
    stop and the placement, and only on a GitHub-hosted runner.
  - It reads the mode, the alerts and the front. It then sets 1920x1080 by size (1x, usable) through
    `CGBeginDisplayConfiguration`, `CGConfigureDisplayWithDisplayMode` and `CGCompleteDisplayConfiguration(.forSession)`,
    and reads the display back.
  - For 3 s it watches the window list and the front, polling every 0.5 s. Then it reads the alerts fresh.
  - These fail the setup:
    - a new UserNotificationCenter or System Settings window, or System Settings in front;
    - a read-back that is not the mode chosen: 1920x1080 in points and in pixels (1x), with the listing's mode id, which
      the switch must also have answered;
    - no 1920x1080 mode offered;
    - a window list that could not be read before or after the switch, because a prompt across it would go unseen.

    Nothing is answered or closed.
  - Re-centred alerts are recorded. The placement step that follows reads its alerts fresh, after the switch. Chrome
    keeps its size; a scene that cannot be cleared stays the guard's to refuse.
- **The screen at the end.** After every step of a sitting, `hosted-sittings.mjs` reads the alert windows (number,
  layer, bounds) and the display mode again. It records them in `sitting.json` as `screenAtEnd: {alerts, mode, bounds,
  modeHeld}` and in `sitting.md` under "The screen at the end".
- **#528's diagnostics** on sitting B's ACTION row, on both sides. They are value-free, and verdicts do not read them.
  - `diagnostics.before`: the front app, the key owner and window, and the scenes-mac activate answer, which was
    previously discarded. All are read just before the click.
  - `diagnostics.click`: what `click` returned.
  - `diagnostics.focusAfterClick`: the focused element's index from the diff's focus trailer, read right after the
    click.

  A failed action's row carries the same diagnostics, taken once the lane has answered.

  The click's own route cannot be read from the cell. The service resets its per-call result meta at every call
  (`src/services/engine/service.mjs` `PER_CALL`), so the ACTION cell's `_meta` holds the keys of the last observation
  after the click. The row therefore keeps no route field. A per-cell route accumulator in the service would make the
  route readable; that is a separate change and is not in this wave.
- **T8e's review Minors.**
  - `closePanel` now activates TextEdit before its Escape after the background pairing (`openPanel@finder`).
  - `resetHeldFixture` throws `ResetBlocked`, a `Stop` that carries the guard's cause. When a reset is blocked, `runOnce`
    records the fixture's unrun samples (`recordUnrun`, "a held fixture could not be reset").

### How each sitting calls the module

The sittings share the rules:

- The guard reads the target's state fresh before every pointer event, key event or capture.
- It never sends and judges afterwards, and a refused cell is not retried.
- A refusal writes a row marked with `guardMark`, through `recordRefusal`. It counts per side per cell
  (`alertGuardCounts`) and keeps the first refusal as `alertGuardStop: {cause, detail, at}`. In A, D and the matrix the
  refusal stops the run. In B it ends only its scene, and the lane goes on to the next scene.
- `checks.mjs` reads the stop as NO VERDICT. `record` and `observation` look at `meta.alertGuardStop` or the top-level
  `alertGuardStop`.
  - B's lane keeps its refusals apart from its problems (`guardRefused`). Its record is NO VERDICT only when the lane
    has no error and no problem besides its refusals. If it has any other problem, it is FAIL, named, with the refusal
    noted.
  - The new `acceptance` check returns PASS on exit 0 and judges check by check. Items 5, 6 and 8 hold more than the
    fixture: item 6 holds the secrets CLI, MCP `secrets_list` and the live probe, and item 8 holds the lifecycle
    suites. In those items, only the checks the fixture itself produces may go unproven (`isFixtureCheck` in
    `scripts/accept/textedit.mjs`): item 5's verdict and own steps, item 6's UI delivery and item 8's approvals
    observation. Even those are excused only when BLOCKED. Every way the refusal leaves a fixture check unrun reads
    BLOCKED: the refused step, an inventory check of a step never run, an approvals observation not made, and item
    5's rollup of them. So a fixture check that FAILed ran and failed. An example is the typed text not being the marker
    while the fixture went on to a refusal at the secret's key cell. Every other check must pass, and every other item
    too. Anything else not passed is FAIL, named, with the refusal noted.

`sitting.md` gains a section "The alert guard" (`guardTally` in `counts.mjs`). For every record the plan names, it
lists per step and cell the refusals (NO VERDICT `alert`, NO VERDICT `unread`) and the key cells guarded with their key
reading not taken (`key cells guarded unread`). The count is taken at the guard, before the front check. So it counts
the key cells guarded unread, whether or not the front check then sent them. The matrix's `counts.md` adds a `key cells
guarded unread` column per side beside its NO VERDICT `alert` column. A row's span (`row:<index>`) maps to that row's
cell, and a harness key cell gets its own line.

Known limit of this diagnostic: the matrix names a row's span by the number of rows recorded when the row began
(`row:<index>`). A row that is never recorded, for example one a stop interrupts, leaves its index to the next row
recorded. Its count can then be shown against that next row's cell. The total per side is right; the cell it is shown
against may not be.

STEP.front, the fixture's hand-back of the front, now accounts for the alert as well:
- If UserNotificationCenter is in front after the hand-back, STEP.front is BLOCKED and names the alert, because
  rulings 1136 and 1141 make a system prompt's front no verdict. This holds whether or not the guard refused anything.
- If the alert was the front before the run, `restoreFront` does not open it. It leaves it alone, as it does an
  unknown previous front, and STEP.front is BLOCKED, naming it.
- Any other front not handed back stays FAIL.

A and B also guard off hosted runners, on the mini and anywhere else, as the matrix does. The cost is one launch of
the focus probe for each guarded cell, outside the cell's timing. D and T3b guard on a GitHub-hosted runner only.

Per sitting:

- **A (native-baseline, `scripts/native-baseline/macos.mjs`).**
  - The device gains `guard({pid, key})` and `place({pid|panel, window, frame})`, each a `guard-device.mjs` call in the
    checkout.
  - TextEdit's window is placed after `setup.activate` and again after `setup.newDocument`. Each placement goes to
    `meta.placement`.
  - `setup.newDocument` and `task.close` run under the pointer guard: the cell may click the Open panel's New Document
    button or the close sheet's Delete button. Key cells, the task's new document and typing among them, run under the
    key guard. The screenshot measure runs under the capture guard (`measure(..., {before})`). If a capture refusal stops
    the held screenshot series partway, the samples already taken are still written. They are marked invalid, because
    the scratch guard after the series, which vouches for them, never runs. Only the refused sample carries the mark.
  - A refusal stops the run, and `record` reads that stop as NO VERDICT. The cleanup that follows still quits TextEdit
    as it does after any failure:
    - If a scratch document was made, it presses ⌘Q from that document. The key guard applies, so the quit is refused
      too while the alert holds the key. It is sent only with TextEdit in front and its scratch document in front of it.
    - If no scratch document was made, it sends SIGTERM to the pid the run launched.

    A TextEdit it cannot quit is left running, and the next run would refuse it at its preflight. So the plan chains
    A's runs: each run needs the one before it to have passed. Each comparison (A, B, C) needs every run of both its
    lanes. After a stop, the remaining runs and the comparisons are SKIP, never failures of their own, and the stopped
    run's NO VERDICT is the sitting's.

    As a second line of defence, `compareDirs` prints `VERDICT: NO VERDICT` when a lane has no complete run to compare,
    naming the lane. That covers a missing directory, a run not whole, or only incomplete runs. It used to throw with
    no VERDICT line, which the hosted check read as FAIL.
- **B (repl-parity native-mac, `scripts/repl-parity/native-mac.mjs`).**
  - After each scene's bring-up, the scene's window is placed (`meta.scenes[id].placement`).
  - Each lane guards the ACTION cell before sending it, from its own fresh reading on its own device. Each lane decides
    for itself; one lane's refusal sends or holds nothing on the other.
  - A refusal writes the action row with its mark and diagnostics, and records `alertGuardStop` at `<scene>/action`.
    It ends only that scene (`GuardRefused`, kept in `meta.guardRefused`, apart from `meta.problems`), and the lane
    goes on to its next scene.
  - `record` reads the lane as NO VERDICT only when its refusals are its only problems.
  - B's diff needs both lanes to have passed. So when either lane has a refusal, the diff does not run, and the parity
    of every other scene, the ones both lanes did record, goes unjudged until the sitting is re-run.
- **C (the matrix).** The matrix already ran under T8e's guard. It now imports the shared module, and `placeScenes` and
  `placePanel` go through `placeWindows`.
- **D (accept-native, verify `--bind`, the approval cycles, T3b).**
  - `textedit up` places the scratch document's windows clear of the alerts and records the placement in
    `textedit-placement.json` (`textedit-guard.mjs`). verify `--bind`, #216's approval cycles and T3b's onboarding bind
    that document.
  - Those three send no pointer or key event of their own, only binds and observations of the placed window. Each step
    is guarded differently:
    - verify `--bind` runs only its own checks: the app running with a window on screen, and the approvals asked. It
      takes no alert reading.
    - #216's approval cycles activate TextEdit and require front and key before each bind. A system prompt in front or
      key around a bind makes it NO VERDICT (rulings 1136 and 1141).
    - T3b's onboarding samples front and key around each cell in the same way. Its capture cell also follows the
      shared capture rule (`captureRefusal`, read once TextEdit has taken front and key). If TextEdit's window is under
      an alert, or the screen is unread, no capture is sent. The call records `alertGuard`, the record keeps the
      refusal through `recordRefusal`, and the judge returns NO VERDICT.
  - accept-native's live TextEdit run is shared by items 5, 6 and 8. On a hosted runner it takes the guard, and its
    document is placed after open (`observations.placement`).
    - Each key cell (`fixtureKeyCell`) waits out any pause first. It then takes one fresh guard reading and is
      refused when the alert holds the key (the key-cell premise). After that comes the front check, then the cell.
      A key reading not taken is counted in `keyUnread`.
    - The marker cell types and then captures TextEdit's window (`getScreenshot`). It is held to the capture rule as
      well, with window kind, from the same reading. If TextEdit's window is under an alert, or the screen is unread,
      the whole cell is refused before it is sent.
    - A refusal sends nothing. The step is BLOCKED "NO VERDICT <cause>: …" and carries the mark. The observations
      hold `alertGuards`, `alertGuardCounts` and `alertGuardStop`.
  - The report carries `alertGuardStop`, `alertGuardCounts` and `keyUnread` (`fixtureGuardRecord`). D's step is judged
    by the `acceptance` check on `acceptance.json`.

### The setup record's shape

`setup.json` gains `modeSwitch` between `warmUps` and `placement`:

```
modeSwitch: {
  before:   {mode: {width, height, modeId, pixelWidth, pixelHeight}, alerts: [{number, layer, bounds}], front},
  set:      {width, height, modeId, pixelWidth, pixelHeight} | null,
  readBack: {bounds: {x, y, width, height}, mode},
  after:    {alerts: [...], front},
  promptSeen: [{number, owner, layer, bounds} | {front}],
  recentred:  [{number, from, to}],
  watchedMs
}
```

The step's detail line reads, for example, "1024x768 (mode 3) -> 1920x1080 (mode 10), read back 1920x1080; 2 alert
windows, none moved; no prompt". Off a hosted runner the step refuses before it reads anything. `placement` keeps its
shape, and its alerts are now the fresh ones after the switch.

### Tests

These suites were run on this Mac:

- `node --test` on `test/hosted-sittings`, `test/native-baseline`, `test/native-matrix`,
  `test/accept-textedit-{cells,readback}`: 940/940.
- `test/repl-parity`, `test/cursor-sitting`: 1039/1039.
- `test/accept-{native-cli,scripts-load,key-guard,window-close,onboarding}`: 112/112.

`swiftc -typecheck` passes on `display-modes.swift`. The mode switch was never run here.

What the tests cover:

- **New suites.** `alert-guard`, `guard-device`, `display-mode` and `textedit-guard`. The `display-mode` tests cover a
  prompt seen, a read-back mismatch, re-centred alerts and the hosted-only refusal.
- **`setup.test.mjs`.** The step's place in the order and a failing switch.
- **Sitting A** (`native-baseline/run.test.mjs`) **and sitting B** (`repl-parity/native-mac-run.test.mjs`). Tests that
  an overlapping alert refuses the pointer event on both sides, that the run records NO VERDICT alert, and that the
  hosted check reads NO VERDICT. B also gets the ACTION diagnostics test.
- **The Minors.** One test for each, in the matrix's `run.test.mjs` and `probe-run.test.mjs`. `run-records.test.mjs`
  counts the extra TextEdit activation from Minor 1.

### Review round 1

Test counts after the review fixes:

- `test/hosted-sittings`, `test/native-baseline`, `test/native-matrix`, `test/accept-textedit-{cells,readback}`:
  948/948.
- `test/repl-parity`, `test/cursor-sitting`: 1041/1041.
- `test/accept-{native-cli,scripts-load,key-guard,window-close,onboarding,engine-lane}`: 123/123.

New tests:

- **`acceptance`.** A real FAIL in item 6 (secrets remove) or item 8 (a lifecycle observation) beside the fixture's
  refusal is FAIL, named. So are a non-fixture check that is only BLOCKED, and an item with no checks.
- **B's record.** A refusal alongside TextEdit's fixed state failing is FAIL, naming the TextEdit problem. Refusals
  alone are NO VERDICT. A failed action's row keeps its diagnostics, and no route field is kept.
- **A's plan.** Each run needs the run before it. After a stop the remaining runs are SKIP and the sitting is NO
  VERDICT, exit 4.
- **A's cleanup after a refusal.** With the alert holding the key, ⌘Q is refused and TextEdit is left running. With
  the alert gone, ⌘Q is sent and TextEdit quits.
- **A's held screenshot series.** Sample 1 is kept, marked invalid, and only sample 2 is refused.
- **D.** The key-cell premise: an overlapping alert alone refuses no key cell. `fixtureKeyCell` reads the guard after
  the pause, and its refusal reaches `fixtureGuardRecord` and then the `acceptance` check.
- **Display mode.** A 2x read-back, another mode id, and a window list unread after the switch.
- **T3b.** The capture cell under an alert, and with the screen unread.
- **`recordRefusal`.** Its shape.

### Review round 2

Test counts after the fixes:

- `test/hosted-sittings`, `test/native-baseline`, `test/native-matrix`, `test/accept-textedit-{cells,readback}`:
  955/955.
- `test/repl-parity`, `test/cursor-sitting`: 1041/1041.
- `test/accept-{native-cli,scripts-load,key-guard,window-close,onboarding,engine-lane}`: 123/123.

New tests:

- **`acceptance`.** Item 5's type step FAILs, then a refusal comes at "secret: type the reference". The result is
  FAIL, naming the type step.
- **A's comparisons.** The real CLI, `native-baseline.mjs compare --engines`, run on a missing lane and on a lane
  holding only a stopped run. Each prints `VERDICT: NO VERDICT` naming the lane, and the hosted `verdict` check reads
  NO VERDICT. The plan test runs `runSitting` with a refused vv-1 in both the pilot and full forms, with no comparison
  output faked. Only vv-1 runs, every other step is SKIP, and the sitting is NO VERDICT, exit 4.
- **`keyUnread`.**
  - The helper's shape.
  - A counts its key cells guarded unread per cell (`task.act`, `task.close`, `quit`).
  - The matrix counts them under the row's span, which `counts.md` maps to the row's cell.
  - D counts them, through `fixtureKeyCell`.
  - `guardTally` reads every record shape.
- **D's marker cell.** It is refused unsent when TextEdit's window is under an alert or the screen is unread. A window
  clear of every alert is exempt.

## Placement (ruling 1169)

Pilot A's re-run (run 45252131587) showed what the switch to 1920x1080 does to the alerts. The two capture alerts
re-centre at 830,188 260x348 (#31) and 893,244 260x364 (#59), and the strip from x 0 to 822 is clear of both. Ruling
1169 places every scene window in that strip at launch. Nothing writes through Accessibility except Finder's existing
frame probe. Both sides of every pair stand on one frame, and every frame that differs from the mini's is declared.
Branch `m5/placement`. No hosted run has proven any of this yet: the frames below are computed from pilot A's alerts by
the code, and the next sitting's setup reads them fresh.

### The venue

`scripts/hosted-sittings/venue.mjs` chooses the venue once, in setup's new `placement` step, after the mode switch.
Each scene gets its hosted size at the mini's origin, moved by `clearFrame` (the shared rule:
the smallest move clear of every alert, below the menu bar, 8 pt from an alert). An unread window list keeps the bases
and says why. The venue goes into the runner record (`~/.local/share/cua-hosted/runner.json`, the device's hosted
signal). So every `up` on the device takes the same frames, whichever driver calls it and whichever side runs. That makes
the two sides symmetric by construction.

With pilot A's alerts:

| scene | mini | hosted | how it gets there |
|---|---|---|---|
| Chrome for Testing | 80,60 1000x760 | 22,60 800x760 (moved) | `--window-position` and `--window-size` at launch |
| Electron fixture | 140,100 720x560 | 102,100 720x560 (moved) | `--cua-fixture-bounds` at launch |
| Finder | 80,80 920x520 | 22,80 800x520 (moved) | the existing `WindowFrameProbe` pin, at the venue's frame |
| TextEdit | its template | its template, 60 characters wide; the scenes' document a 480x792 view | `WidthInChars 60` read back from TextEdit's container, and the RTF's own `\vieww9600\viewh15840`, hosted only (both added after the pilots, below) |
| Open panel | where it last stood | 80,80 720x440 (not moved) | its own saved frame in TextEdit's domain, hosted only |

Chrome and the fixture are launched at the frame. They are never moved after launch. Each scene's record keeps
`launchFrame` (`{frame, from: 'venue' | 'scene'}`), and off a runner (no runner record) each scene keeps its own frame.

### TextEdit

TextEdit's window has no preference for its position. That was read from the readable binary and its nib, not
assumed:

- The binary's strings name `WidthInChars` and `HeightInChars` (the new-document size, in characters) and
  `OpenPanelFollowsMainWindow` (a directory choice, not a frame). They hold no cascade, frame-autosave or
  `setFrameUsingName` string.
- `DocumentWindow.nib` holds `NSWindowRect {{309,1104},{494,357}}` against `NSScreenRect {{0,0},{2560,1578}}` and no
  `NSFrameAutosaveName`.

So the origin is AppKit's template and cascade, and only the size is TextEdit's to set. Setup's new `textedit
defaults` step writes `WidthInChars 60` into `com.apple.TextEdit` on the runner only (`assertGithubHosted`; never the
owner's defaults) and reads it back, by `/usr/bin/defaults`. A value not read back fails setup. The value comes from
the widest window pilot A read: 627 pt wide at the default 75 characters, at x 242, a new document 20 pt further
right. Scaling the whole window by 60/75 gives at most ceil(627 x 60 / 75) = 502 pt, so its right edge stands at most
at 242 + 20 + 502 = 764 pt. 764 is the right edge, not the width, and it is left of the alerts at x 830. That is an
estimate (part of the window does not scale with the characters), not a proof. The height is left alone.
`-ApplePersistenceIgnoreState YES` turns off window restoration only. It does not stop TextEdit reading `WidthInChars`
for a new document. Neither launch argument names these keys.

The proof is each run's read-back. `sitting.md` now prints it per step under "TextEdit and the Open panel, read back"
(recorded checks 1 and 2): the window's actual frame, what the venue planned, and whether an alert the venue read
overlaps it. The record check's frame symmetry (below) shows any difference between the sides, and the alert guard
refuses any cell whose window an alert overlaps.

### TextEdit's scene document (pilot B, run 45274556933)

`WidthInChars` sizes new documents only. The parity TextEdit scene opens the run's RTF as a file, and an opened RTF
with no view size takes its paper's width: pilot B read the scene window at 213,78 627x877 on both sides (Letter's 612
points and a 15-point scroller), its right edge 840 over alert 31 at 830,188. The guard refused textedit/action on
both sides. Sitting C's matrix brings TextEdit up the same way.

On a hosted runner the document now carries TextEdit's own saved view size, `\vieww9600\viewh15840` (twips: 480 x
792 points). AppKit's RTF reader returns it as `NSViewSizeDocumentAttribute`, and TextEdit sizes the document's window
from it: the view, the text padding (5 points a side) and the scroller. `venue.mjs` declares it
(`TEXTEDIT_DOCUMENT_VIEW`). The runner record carries it to the device, and `up textedit` inserts it after the font
table. The mini's document is byte for byte what it was.

- **The width.** 242 (the furthest cascade origin read so far, pilot A's new document; pilot B's was 213) + 30 (one
  more cascade step) + 480 + 25 = 777, left of the strip's 822.
- **The height.** Letter's 792. Pilot B's 877-point window suggests TextEdit took that height unasked (792 and its
  bars), so the rows shown stay as they were on the runner.
- **Only the view size changes.** The patched file is the original with the two words inserted, in both layouts.
  AppKit's `textutil` renders both files to the same plain text and the same HTML (each run's font, size and bold).
  That covers everything the cells read of the document: the text area's value and valueMarkdown in native-mac's tree,
  the matrix's text fields, the typing read-back and cursor-sitting's text. `textutil -convert rtf` gives the view
  size back, so AppKit's reader takes it (`test/repl-parity/scenes-mac.test.mjs`).
- **The wide page** (`\paperw28800\viewkind1\viewscale200`, the hscroll cell) keeps its zoom, so its page stays
  wider than the narrower window.
- **The record.** `venue.textEditDocument` keeps the view, the control words and each layout's sha256 as the mini and
  a runner write it. The venue table's `textedit document` row shows them with the cells resting on it, and
  `test/native-goldens/PROVENANCE.md` names the same hashes. The read-back table plans the scene document's windows
  (the matrix's `textedit`, native-mac's `textedit/…`) as `view 480x792` and the new and scratch documents as
  `WidthInChars 60`.

The device takes the view size, like the venue's frames, only when two things hold. First, its own environment says
it is a GitHub-hosted macOS runner (`isGithubHosted`, checked where the venue is read). Second, the runner record
attests one (`runnerProblems` empty). Anything else leaves the mini's frames and bytes. The device is reached over the
loopback ssh, whose sessions get only what `~/.ssh/environment` holds. So `loopback.sh` writes
`RUNNER_ENVIRONMENT=github-hosted` there beside `PATH`, after its own guard on that variable; the mini's sshd never
sets it. Declared gap (#560, P3): the read is not bound to the runner's VM (`vm.platformUuid`, `vm.bootedAt`). Since
the environment check now comes first, a complete hosted record copied onto the mini would not be taken there either;
only a copy onto another hosted runner would. Nothing copies one, and each VM is thrown away.

The rule (#560's follow-up, the design session): every hosted-only write checks `RUNNER_ENVIRONMENT=github-hosted`
itself where it writes (`isGithubHosted`, `assertGithubHosted`), never through the runner record alone. The direct
checks:

- **Setup** (`setup.mjs` `hostedSetup`, its first line) covers the loopback device, the harness checkout, the install,
  the engine and the runner record's write. Its steps' own writers check again: `loopback.sh` (its first test, for
  the sshd, `~/.ssh/environment` and `~/.bashrc`), the TCC rows (`tcc.mjs`), the approve (`approve.mjs`), the warm-ups
  (`warm-up.mjs`), the display mode (`display-mode.mjs`), TextEdit's preferences and its saved state (`venue.mjs`
  `writeTextEditDefaults`, `clearTextEditSavedState`), and the record (`runner.mjs` `runnerRecord`).
- **The sittings' own** checks: `hosted-sittings.mjs` (a sitting's run, the scratch TextEdit document, the focus
  probe's timing), `pin.mjs`, `onboarding.mjs` and accept-native's TextEdit guard (`isGithubHosted()`).
- **The other hosted entry points**: `approval-cycles.mjs` (its usage check), `accept/macos-selection.mjs`
  (`--approved-home`), `accept/macos-default-selection-hosted.sh` (its first test), `repl-parity/hosted/hosted.sh`
  (its first test) and the `m5-sittings.yml` workflow's Prerequisites step.
- **On the device**: the venue's reads (`runner.mjs` `attestedVenue`: Chrome's and the fixture's launch frames,
  Finder's `finderFrame`, the TextEdit RTF's view size) and every move through the `place` commands
  (`guard-device.mjs` `placeWindow`, `matrix-device.mjs` `placeScene`, both through `runner.mjs` `moveRefusal`). Off a
  hosted runner a move is refused before anything is read: `{requested, readBack: null, matched: false, refused}`,
  recorded as not moved with "the move was refused: …", and the alert guard refuses what the window overlaps.
  `loopback.sh` ends by checking that its own session carries the variable, and fails the bring-up if not.

The goldens recorder's `finderFrame` step (`goldens-device.mjs`) is not a hosted-only write: it pins Finder on the mini
by design, at `FINDER_FRAME` there and at the venue's frame only where the venue is read. It is left as it is.

Not proven: that TextEdit sizes the opened window from the view size. AppKit's reader taking it is shown here, and the
window is TextEdit's to make. The next B and C runs must read the scene window about 505 wide and about 877 high, its
right edge left of 822, the same on both sides, with textedit/action sent.

### TextEdit's preferences reach the file it reads (pilot A's re-run, run 45277221729)

vv-1's launch window stood again at 241,87 586x488, the frame every vv run reads, with
`NSRequiresOpenUntitledWindowAtLaunch NO` in force. Its ⌘N document took 603x505 at 242,107, the default 75
characters, although setup had read `WidthInChars 60` back from the domain. Alert 31 then refused
warm.getScreenshot. Two causes are read from that. The warm-ups end TextEdit by pid, so its saved application state
outlives it and restores their window at the next launch. And TextEdit is sandboxed: it reads its container's plist,
which `defaults write com.apple.TextEdit` from outside the sandbox need not reach.

The `textedit defaults` step now does three more things, hosted only:

- It writes `ApplePersistenceIgnoreState YES` beside the other keys: AppKit's own switch for window restoration, and
  already the parity scenes' launch argument.
- It reads each key back from the domain and from
  `~/Library/Containers/com.apple.TextEdit/Data/Library/Preferences/com.apple.TextEdit`. A key the container does not
  hold is written through that path and read again. Only the container's read-back puts a key in force; one it does
  not hold fails the setup. Each write keeps both read-backs and whether it was written through
  (`venue.textEdit.writes[].container`: `{readBack, readBackBefore?, written?}`). `/usr/bin/defaults` is the only
  route into the container: it asks cfprefsd, which does the file's I/O. No harness process opens, stats or removes
  anything under `~/Library/Containers` itself, because that can raise macOS's App Data protection dialog
  (`kTCCServiceSystemPolicyAppDataDetailed`, seen live on the mini:
  `docs/evidence/2026-10-17-own-sandbox/m0/mini-vendor-computer-superseded/README.md`). That dialog would be one more
  window over the scenes, and nobody may answer it.
- After the writes, it removes TextEdit's saved application state outside its container,
  `~/Library/Saved Application State/com.apple.TextEdit.savedState`, recorded as removed, absent, or not removed with
  the error (`venue.textEdit.savedState`). No link is followed: its folder must be a folder of its own, and a link at
  the state's path is unlinked, never its target. Only ENOENT counts as absent; any other error is recorded. A refused
  removal does not fail the step. The container's own saved state is left alone. Restoration off there rests on `ApplePersistenceIgnoreState YES`, read back from the container
  domain.

The step's detail and sitting.md's venue line say which keys were written through and whether the state was removed.
The next A re-run proves it. vv-1's `meta.placement` must show no window at 241,87 586x488 at `setup.activate`, and
the `setup.newDocument` window about 500 wide, not 603. The read-back table must show both clear of x 830. The
sitting's screen at the end must show only the two capture alerts and no window beyond them: that is what shows the
container's reads and writes raised no prompt.

### The placement record

Pilot B also recorded TextEdit's window `moved: true, readBack: null, matched: false`. The frame probe moves Finder
windows only and refuses every other process, so nothing had moved. `placeWindows` now offers only Finder's windows to
the probe (`FRAME_PROBE_SCENES`). Any other window under an alert is recorded where it was read, `moved: false`, with
the reason. A probe move counts as `moved` only when the window reads back somewhere else, with a reason whenever it
did not match. `sceneFrames` keeps every window where it was last read: its read-back, else where it was read. Pilot
B's read-back table had said no TextEdit window was read back, though the window stood at 213,78 on both sides.

### The Open panel

The Open panel is the one window the brief left to preferences or a NO VERDICT. Placing it needs no Accessibility write:

- The dyld shared cache's strings include `NSNavPanelAutosaveName`, `NSNavPanelExpandedSizeForOpenMode` and
  `NSNavPanelExpandedSizeForSaveMode`.
- This Mac's `com.apple.TextEdit` and `com.apple.Preview` domains hold `NSWindow Frame NSNavPanelAutosaveName`. TextEdit's
  value is `320 331 800 388 0 0 1440 875 `: the frame in AppKit's bottom-left coordinates, then the screen's visible
  frame. They also hold `NSNavPanelExpandedSizeForOpenMode` as the string `{880, 448}`.

On the runner, setup writes both keys for the panel's venue frame, 80,80 720x440: `80 560 720 440 0 0 1920 1055 ` and
`{720, 440}`. Each opening is read back: C keeps it in `meta.placement.panel`, A in `meta.placement`, and `sitting.md`
prints each against the planned frame, with whether an alert overlaps it.

Not verified live: whether the out-of-process panel (its service, not TextEdit) honours a frame written before it
opens. If it does not, the panel stands where the system puts it. The alert guard then refuses any panel cell under an
alert (NO VERDICT `alert`), and the read-back says where the panel stood. The probe was not extended, as the brief
asked.

Pilot C-2 answered it: the panel ignores the written frame. "Pilot C-2: the panels, the typing and the time" below
has what replaced it (ruling 1195).

### Re-grounding

Every layout that depends on a window's size is derived from the frame the run launched at, never from the mini's
frame scaled by guess:

- **Chrome's drag** (`plan.mjs` `CHROME_DRAG_POINTS`, `chromeDragLayout(frame)`). The page has no stylesheet (CSP
  `style-src 'none'`). The user agent lays the notes field (rows 8, cols 60) out from the content area's top left, so
  the drag's window points (24,192 to 200,237) are the same at 1000x760 and 800x760. Only `layout.window`, which turns
  window points into the screenshot's pixels, follows the frame. `groundCase(target, case, frames)` grounds the case on
  the venue's frame. The matrix's `caseRow` passes `meta.venue.frames`, and a test runs a hosted matrix with the drag
  grounded at 800x760. Without re-grounding, the mini's layout would fail its own shape check on the hosted
  screenshot (0.95 against 0.76), so the drag would never be prepared. No test here proves that the points lie within
  the field's height. In the golden tree below (an infobar under the toolbar) the field spans y 224 to 355 in the
  window, and the upper point's y 192 lies above it. So their height depends on where the content area starts, which
  the infobar moves. The prepare's harness click at each end checks it at run time: a point outside the field leaves
  the case not ready, never dragged.
- **Electron.** The size is unchanged, so `ELECTRON_FIELD_LAYOUT` is unchanged. A test asserts this.
- **Finder.** The height is unchanged at 520, so the visible rows and every row-based cell are the same.
- **TextEdit's drag** is in window fractions. It holds at any width.
- **B's scenes** are launched at the venue's frames by the same `up`.

`framedCells(scene)` lists the cells whose layout is tied to a frame, each with the kind of measure it uses (`window
fractions`, `visible rows` or `window points`). The venue's record names them for each scene whose frame differs.

Ruling 1168's pointerdown pair ("Pointer target" and "Pointer downs", inline after Apply) lies inside the hosted Chrome
frame. In the mini's golden tree (`test/native-goldens/chrome/skyshot.json`, with an infobar, so its content area
starts lowest), Apply's line is at y 375 to 397 in the window. The pair's line ends by x 523 even with every character
taken at 9 pt, inside 800 less a 15 pt scrollbar. `venue.test.mjs` checks this from the golden.

Chrome keeps the mini's height on the runner: 800x760, not the 800x600 first chosen. At 600 pt the scene page did not
fit its window. In the same golden tree the Section heading ends 663 pt down the window (607 pt without the
infobar), so `NOT_APPLICABLE.chrome.scroll`'s reason ("the scene page fits its window") would have been false on the
runner. At 760 pt the whole page fits, as it does on the mini. 22,60 800x760 still clears the alerts, which start at
x 830. The same test checks that the page's end and Apply's line lie inside the frame, and that the drag's points lie
inside the window and within the field's width.
One cost: a taller window has fewer clear places. Beside an alert wider than pilot A's (setup's test uses one at
750,220 420x180), no 800x760 frame on 1920x1080 clears it. Chrome then stays at its base, `placement` says "no clear
frame: kept", and the alert guard refuses what the alert overlaps.

### Declared venue differences

`venueRecord` produces the `venue` block. It goes into setup's runner record, `setup.json`, every lane's `meta.venue`
(A's `native-baseline` meta, B's and C's through `hostedRunOf`) and `sitting.json`. `renderVenue` prints it in
`sitting.md` under "The venue (ruling 1169)". Its shape:
`{alerts, display, frames, textEdit: {domain, container, writes, savedState, ok}, textEditDocument: {document, view,
controlWords, sha256}, differences: [{scene, mini, hosted, reason, grounding, cells}]}`. Chrome, Electron and Finder
are listed when their frame differs from the mini's. TextEdit, its scene document and the Open panel are always
listed.

### Symmetry

The `record` check reads each step's `pair` (A: `vc-i` with `vv-i`, and `cc-i` with `vc-i`; B: cua's meta with the
vendor's; C: matrix run i on each side). It compares the frames each record actually stood on (`sceneFrames`: the
venue's, each scene's read-back after a move, the Open panel's openings, A's windows). A pair whose sides differ is NO
VERDICT, `venue: <record> and its pair <pair> did not stand on one frame (<the differences>)`.

In sitting C the judge applies the same rule. `compare` judges every pair, and FAIL outranks NO VERDICT, so the
record check alone would not stop a worse cua sample on a split pair from failing the sitting. The matrix judge
(`summary.mjs` `pairProblems`) now names such a run pair, `run <n>'s vendor and cua runs did not stand on one frame
(...)`, and leaves it out of the pairable runs. Leaving it out is not enough: a cua sample is also judged on its own,
with no pair, where it proves the user's value changed, on an `own` row (background, launch), on an acceptance row and
by the interference oracle, and pressKey's vendor composing otherwise fails its row. So the judge tags every row of
such a run, on both sides, and `sampleCause` makes it NO VERDICT `venue` before any of those rules runs
(`splitFrameRuns`, review round 2). A split-frame run can never fail C.

### The key-window requirement

Pilot B's diagnostic run (45254955711) read the Electron fixture frontmost with no key window. TextEdit, Finder and
Chrome each held their own. So before a click or key cell, the scene's app must hold the scene window as its own key
window. That is not the same as being frontmost: a background cell still runs in the background.

- **The reading.** `scripts/hosted-sittings/key-window.mjs` runs `scripts/cursor-sitting/ax-state.swift window <pid>
  <x,y,w,h>` on the device, outside either engine. It reads the app's own `AXFocusedWindow` and `AXMainWindow` against
  the window the cell acts in (`run`, `other` or `none`), and `AXFrontmost`. The attributes are the app's own
  (`AXUIElementCreateApplication`), so a background app answers too. The engine's focus probe reads only the
  system-wide focused application, which says nothing about a background app's key window. Extending the probe would
  have been an engine change, so the harness reads it instead.
- **The window a cell acts in.** For a scene whose process the run launched (TextEdit, Chrome, the fixture), it is the
  process's frontmost window. After ⌘N that is the untitled document, which the sheet variant's and #212's keys and
  cleanups act in. For Finder, whose process also shows the owner's windows, it is the run's recorded window. A sheet
  is a window of its own in the window list but part of its parent in Accessibility. When Accessibility lists no
  window at the frontmost one's bounds, and a window of the process behind it holds those bounds, that window is read
  and the sheet is kept in the reading (`sheet`), but only when Accessibility shows an AXSheet child of it at the front
  window's bounds (`ax-state window <pid> <bounds> <sheet bounds>` answers `sheet`). A window merely lying inside
  another proves nothing, and without that proof the reading is not taken (review of the pilot fixes). A, C and D all read this way (`ownKeyWindow`). Review round 1 found
  that C had read the recorded window, which would have refused every key cell after ⌘N. B did too, through
  `guard-device.mjs`, whose target names the recorded window for the guard. On pilot B's vendor side (run
  45274556933) that reading said "the scene window is not on screen" while the fixture's one window stood at 102,100
  720x560 and held the focus. Only window 106 was listed for the fixture's pid, at placement and at the action, so `up`
  had recorded a document-size window the fixture lists but never shows, as Chrome for Testing did in #187's slot. The
  record's number is not in the artifacts; that much is deduced from the two readings. The reader now names the
  recorded window only for a shared process (`only`, Finder's), and Electron's `up` records the window on screen, as
  Chrome's does.
- **The grant.** The reader needs the Accessibility grant of the process that runs it. On the hosted image
  `/bin/bash` holds it and its children inherit it (#282's evidence). Whether that survives the loopback `sshd` chain
  the runs use is unverified, so setup now asks. Its `key-window trust` step runs `guard-device.mjs trust` over the
  loopback ssh, in the harness checkout, and keeps the answer in `venue.keyWindowTrust` (`{trusted, reason?, via}`).
  A reader not trusted, or not reached, is recorded with why, and setup goes on. The script's own failure on the
  device (exit 1 with `{error}`) is recorded with its error, apart from the ssh's.
- **Each reading keeps why** it was not taken (`reason`): the reader not trusted, the reader failed, Accessibility
  listing no window at the bounds, a read that failed, the window not on screen, or the window list unread. It also
  keeps `trusted` (null when the reader itself failed), `found` and `failed`. `recordKeyWindowReading` counts each
  sent cell's reading per cell: taken (`keyWindowRead`) or not, with why (`keyWindowUnread`,
  `keyWindowUnreadReasons`).
- **The rule** (`alert-guard.mjs` `keyWindowCause`). The cell passes when the scene window is the app's focused
  window. A background app may hold no focused window and keep the scene window as its main window, the one it makes
  key when activated, so that passes too. Anything else refuses the cell unsent, NO VERDICT `keyWindow`, naming
  another key window or none. A reading not taken (an untrusted reader, a failed read, the scene window not on screen,
  the window list unread) refuses nothing. The cell is sent and counted (`keyWindowUnread`), as a key cell's unread key
  is.
- **Where it applies.** It goes through the shared module in every sitting:
  - A: `macos.mjs` `pointerGuard` and `keyGuard`, with `guard-device read --key-window`. The scratch document's
    `setup.newDocument` is exempt, because a fresh TextEdit shows only its Open panel.
  - B: `native-mac.mjs` `actionGuard`.
  - C: `steps.mjs` `guardLane` for pointer cells and `sendKeys` for key cells, with `matrix-device read --key-window
    <scene>`. Nothing is checked while TextEdit's Open panel is up (`ctx.panelOpen`, from ⌘O until the panel closes),
    because the panel is then TextEdit's focused window, as its own cells need.
  - D: `accept/textedit.mjs` `fixtureRefusal`.
- **The counts.** `counts.md` gains, per cell and side, NO VERDICT `keyWindow` and the cells sent with their key window
  unread, with the reasons. `sitting.md`'s guard tally gains the same per step and cell. A new `sitting.md` section,
  "The key-window requirement", judges the requirement on the sitting's own readings: those taken (cells sent with
  their key window read, and the refusals) and those not, by reason. It says observed, observed except for the cells
  sent unread, vacuous (every reading unread) or, with no reading at all (E, F, or a run that stopped first), that no
  key-window reading was taken. Setup's grant reading over the ssh is printed as context only: D reads in the job's
  own process chain, not over ssh, and is judged on its own reads. The `observation` check counts `keyWindow` among the causes that leave proof missing, and the matrix
  summary's legend defines it.
- **Off a hosted runner** the rule runs where the alert guard runs. A, B and C read and apply it on the mini too, where
  the owner's terminal holds the grant. D's fixture guard exists only on a hosted runner, so D's check does too.
- **Inside a timed probe** the key cell's reading is taken in the user-window read the probe already makes
  (`userFront`'s `keysTo`, `drivenFront`'s `keys`). It is never a device read of its own between that read and the act,
  which would spend the probe's lead.
- **The fixture.** The Electron fixture calls `window.focus()` after `showInactive` only under `--cua-fixture-focus`,
  which the harness's `up` passes on both sides alike (`electronArgs`). Electron's `focus()` makes the window key
  (`makeKeyAndOrderFront`) and asks for activation. In the matrix, scenes come up before the activation watcher
  starts, so no row is charged for it. A launch without the switch takes nothing. That covers the matrix's
  `electron/background/launch@finder` row, which relaunches the fixture mid-run with no arguments, the activation
  watcher on and Finder in front. Whether the fixture takes the front at bring-up on the mini is unverified.
- **#528.** The native-mac action row keeps `focusAfterClick` on both sides, and the reading before the click now adds
  `ownKey`.

### Tests

Focused suites on `m5/placement` after review round 1's fixes:

- `test/hosted-sittings`, `test/native-baseline`, `test/native-matrix`: 997/997.
- `test/repl-parity`, `test/cursor-sitting`, `test/accept-textedit-{cells,readback}`,
  `test/accept-{native-cli,scripts-load,key-guard}`: 1078/1078.
- `test/accept-{window-close,onboarding,engine-lane,fixture-app}`: 126/126.

New tests:

- **`venue.test.mjs`.**
  - The hosted frames for pilot A's alerts, and an unread list falling back to the bases.
  - TextEdit's writes and their read-back. A write off a runner is refused.
  - The saved-frame string.
  - The venue record and its rendering.
  - `sceneFrames` and `frameAsymmetry`.
  - The pointerdown pair, the page's end and the drag's points inside the hosted Chrome frame.
- **Setup.** The `placement` and `textedit defaults` steps, the venue in the runner record, and `hostedRunOf` carrying
  it.
- **The matrix.**
  - `groundCase` and `framedCells`.
  - A hosted run whose Chrome drag is grounded at 800x760.
  - `key-window-run.test.mjs`: the reading holds; no key window refuses click and key cells on both engines; a
    background main window passes and another key window refuses; an unread reading is counted; nothing is read
    while the Open panel is up.
  - `matrix-device read --key-window`.
- **The record check.** A pair standing on two frames is NO VERDICT.
- **The scenes.** Launched at the venue's frames, and off a runner at their own. The pointerdown variants come up at
  the venue's frames, with the fixture's switch beside its bounds.
- **The key-window guard in A, B and D.** Refused when TextEdit holds no key window of its own, counted when unread.
- **The counts.** `keyWindow` and `keyWindowUnread` per cell and side in `counts.md`, and per step in the guard
  tally.

Added in review round 1:

- **The scenes' default io** reads the venue from the runner record under `$HOME`, with nothing injected. Its import
  was missing, so every real `up` threw a ReferenceError; the tests had always injected the venue.
- **`key-window.test.mjs`.** The frontmost window after ⌘N, a sheet read as its document, and a reason for each kind of
  unread reading. `matrix-device read --key-window` reads the frontmost window for a launched process and the recorded
  one for Finder.
- **The sheet variant and #212's save sheet** run end to end against a modelled screen (the scene document, the
  untitled document and the sheet) through the real `sceneKeyWindow`. None of their keys or cleanups is refused.
  Reading the recorded window instead fails this test.
- **A timed probe's key cell** reads its key window in the user-window read, never in a read of its own.
- **The judge** leaves out a run pair on two frames: its worse cua sample is no verdict, not a FAIL. On one frame the
  same sample fails. In review round 2: the same holds for the user's value changed, an `own` row, a launch row, an
  acceptance row, an interfering background row and pressKey's vendor composing otherwise, each of which fails on one
  frame.
- **Setup's `key-window trust`** step over the loopback ssh, for a trusted, an untrusted and an unreached reader and
  one whose script failed on the device, and `guard-device.mjs trust`.
- **The reasons** behind unread readings, per cell and side in `counts.md` and per step in the guard tally. The
  key-window section of `sitting.md` reports the requirement from the sitting's own readings, setup's grant reading
  context only: a sitting with no reading says so, never "Observed", and D's readings judge D beside an untrusted ssh
  reading.
- **The read-back of TextEdit and the Open panel** per step: planned against actual, with whether an alert overlaps.
- **The fixture** focuses its window only under `--cua-fixture-focus`, tested by running `main.js` itself under a
  stubbed `electron`.
- **The fixture.** Shown inactive, then focused once, with the bounds and page switches each read on its own.

### Pilot B's Finder take-down (run 45285337366) and ruling 1181

**What the artifacts show.** The vendor lane ran all four scenes and passed. Its Finder take-down took two attempts:

1. The teardown closed window 81. The down then failed because ShowSidebar did not read back. It did not say "window
   still open".
2. The retry's teardown began with `{activate: 'finder'}`, which runs `open -a Finder.app`. Finder had no window on
   screen, so it answered that reopen with a new window. The activation then found Finder frontmost without window 81
   ("not in the on-screen layer-0 snapshot").
3. The down read `down: true`: window 81 was gone and the keys read back.
4. The cua lane's preflight refused the new window.

The device's `activation-guards.jsonl` was not collected, so the new window is deduced, not observed. ShowSidebar's
first failure is unproven. The likeliest cause is Finder writing the key from its own process after the toggle-back,
racing the restore's single write and read; the same code read back a few seconds later.

**The fixes (6c62fa029).**

- Finder is never activated without the run's window on screen. A window minimized or on another Space is refused,
  and the lane's problem names that cause.
- There are no teardown steps once the run's window is gone.
- Every Finder key is read back after a 1 s settle and written again where Finder's late write undid it, for at most
  3 rounds. A key that never reads back fails, naming the owner's value and the `defaults` command that sets it. The
  input source's restore names the per-context preference and the owner's value the same way.
- `down finder` stays false while a window new since the sitting began stands on screen, and names it. The harness
  never closes it.
- Sitting B's cua lane needs the vendor lane to pass.

**Ruling 1181's correction: the sitting's Finder snapshot.** The owner keeps Finder windows open on the MacBook, and
the harness may neither close nor move them. So repl-parity's approved `prepare` saves its journal, then takes one
snapshot of Finder's document windows (`scenes-mac.mjs finder-baseline take --prepared-at <preparedAt>`, in
`~/Library/Caches/cua-harness/finder-baseline.json`), bound to the sitting's `preparedAt` and to the boot it was taken
in. The journal and prepare.json record it whole: each window's number, frame and whether it was on screen, never a
title. `cleanup-prepared` removes it (`scripts/repl-parity/finder-baseline.mjs`).

- **Read only for the sitting.** A native-mac lane names its sitting (`--finder-baseline <preparedAt>`, its hold id)
  to the scenes' `preflight` and `up`, and the snapshot is read only while its `preparedAt` and boot both match (the
  lane's `meta.finderBaseline` says when it was taken, or why it was ignored). A stale file, another sitting's, one
  from before a reboot (window numbers recur), or a driver naming no sitting (the goldens recorder, the matrix) reads
  none, and every Finder window on screen refuses, as before. The second lane's preflight still catches a window the
  first lane left.
- **The preflight's matching.** A window is the snapshot's by its number. One the owner closed and reopened comes back
  with a new number, and is the snapshot's when its frame is exactly that of a snapshot window Finder no longer has at
  all, each matched once. A window that is minimized, hidden or on another Space keeps its number and lends no frame
  (the review's case: Finder's default new-window frame matching a never-resized owner window). Finder brings a
  folder's window back at its saved frame. No title is read: a CG title needs the Screen Recording grant, and a
  folder's name is the owner's.
- **`down finder`** judges by number alone: a window on screen that Finder did not have at the scene's `up`
  (`finderBefore` in the scene's record), and that is not the run's, is one the run left. No frame excuses it.
- **Hosted.** The snapshot holds no window on screen, so B behaves as before.
- **Unverified:** what the chrome toggles (sidebar, status bar, path bar, sent in the run's window) do to the owner's
  other open Finder windows. It stays unverified until the owner's sitting runs once on the MacBook with a Finder
  window open, that window's chrome read before and after.
- **The venue's TextEdit preferences** stay unrestored: `writeTextEditDefaults` is the only way to write them, and it
  refuses off a GitHub-hosted runner for every key (`venue.test.mjs`).


## The input source (pilot C, run 45299196290; rulings 1181 and 1188)

**What pilot C showed.** matrix-vendor-1 ran its 571 rows in 1408 s. It still ended INCOMPLETE: the put-back's
input-source step reported `perContextRestored: false, perContextWritten: false` and the advice "unset before the run
and is set now; set … in System Settings". On a fresh runner the owner's com.apple.HIToolbox AppleGlobalTextInputProperties
TextInputGlobalPropertyPerContextInput is unset. The input sections write it off (`-dict-add … -bool false`), and the
old restore could only write true or false. Both save-sheet lanes found the record the failed run kept (`savedNow:
false`), reused it, wrote the preference off again, and failed the same way. Every hosted C run would have failed so.

**"Unset" is restorable (ruling 1181).** `scripts/native-matrix/hitoolbox.mjs` holds every read and write of the
domain.

- **Reading.** `readPerContextState` reads the exact typed key from one snapshot (`defaults export`, then `plutil
  -type` and `-extract … raw` on that one output): the dictionary's presence and the key's value come from the same
  reading. A string where the dictionary belongs, or a number where the Boolean belongs, is `{malformed: why}`, never
  "unset". A malformed owner's value is never written back: the restore holds only while it still reads as saved, and
  the failure says to set it by hand. A hosted run whose baseline reads malformed therefore writes nothing: the
  matrix refuses at its first reading, and the save refuses its own reading too (no record, `{refused}`), so no `off`
  write or selection follows a valid first reading that went malformed. The run reads only, and the rows needing a
  write are NO VERDICT `venue` (a disposable runner's precondition, not the owner's state) naming why; so are the
  live harness's Korean checks.
- **Saving.** The saved record keeps whether the dictionary existed before the run (`perContextDict`), taken with the
  value from the same typed read.
- **Unsetting.** `unsetPerContext` runs `scripts/native-matrix/unset-per-context.sh`, the one implementation, which a
  person can run by hand too. Off a GitHub-hosted runner it refuses before any defaults call, whatever the domain's
  spelling (a path may be the owner's own plist), unless run with `--manual-recovery`: the owner's own recovery, the
  mode every failure names. The tests' scratch domains pass the hosted environment or the mode.
  1. It reads the domain through cfprefsd: `defaults export com.apple.HIToolbox -`.
  2. With the dictionary, or the key in it, already absent it prints `none` and writes nothing: it is safe to repeat.
     A dictionary key that is not a dictionary stops it, nothing written.
  3. It extracts the dictionary and removes the one key with plutil (`plutil -extract AppleGlobalTextInputProperties
     xml1`, then `plutil -remove TextInputGlobalPropertyPerContextInput`). Under `set -e` an export, type check,
     extraction or removal that fails stops it before any write, and so does a removal that prints no property list:
     defaults never receives an empty value or a string.
  4. It writes back only that top-level key: `defaults write com.apple.HIToolbox AppleGlobalTextInputProperties
     '<the XML>'`. defaults parses an XML property list value, so every remaining value keeps its type: integer, real,
     date, data and nested collections. `defaults read-type` then confirms the key is still a dictionary.
  5. With `--delete-if-empty` (the record says the dictionary was absent before the run) and nothing else left in it,
     it deletes the key instead: `defaults delete com.apple.HIToolbox AppleGlobalTextInputProperties`.
- **What it never does.** No other top-level key is written: the input sources the owner may switch during a run
  stay theirs. There is no domain import and no plist file edit, which cfprefsd's cache would override.
- **Old records.** A record saved before this change has no `perContextDict`. Restoring it leaves an empty dictionary
  rather than delete one the owner may have had.
- **The tests.** `test/native-matrix/hitoolbox.test.mjs` runs the real defaults, plutil and script against a scratch
  property list standing in for the domain. It checks the typed reads (malformed included), that the other nested
  keys come back byte for byte, that an owner's change to another top-level key during the run survives, that the
  delete happens only when the run created the dictionary, that a second run writes nothing, and that an export,
  extraction, type check or removal that fails (a stand-in tool) leaves the domain unchanged. It also runs the
  failure's own command through a shell, twice.

**Read back after a settle.** `restoreInputSource` restores the source and the preference in rounds, as Finder's keys
are (`RESTORE_SETTLE_MS` 1 s, `RESTORE_ROUNDS` 3). Each round selects the source and writes the preference where
either differs, waits the settle, and reads both again. It ends at the first round that wrote nothing and read both as
the owner's, so a successful restore takes one round past its last write. A value the text input system writes back
late is therefore written again. A restore that does not hold after three rounds fails, naming the preference, the
owner's value and the exact command that sets it back; so does a restore whose read, write or probe throws, which
keeps the record. It never names a System Settings toggle, which cannot express "unset":

- on: `defaults write com.apple.HIToolbox AppleGlobalTextInputProperties -dict-add TextInputGlobalPropertyPerContextInput -bool true`
- off: the same with `-bool false`
- unset: `sh scripts/native-matrix/unset-per-context.sh --manual-recovery` from the harness checkout, with
  `--delete-if-empty` when the dictionary was absent before the run.

**A record a failed run left.** The record is removed only once both values read back. One that stays now refuses
the next run's `begin` (`scripts/native-matrix/live-device.mjs`). The refusal names the record, the owner's source and
preference, `node scripts/native-matrix/live-device.mjs input-source-restore` (it reads both back and removes the
record once they hold), and the commands to set them by hand. No lane runs over it, so a save-sheet lane after a failed
matrix run fails at begin, naming the record, instead of reusing it. Within one run the first record still wins: the
input sections and the put-back share it.

**Hosted only (ruling 1188).** The input sources are how the owner types every day, so a restore that misses changes
their typing in every app. Every selection and every HIToolbox write therefore refuses off a GitHub-hosted runner
(`assertGithubHosted`), before any defaults, plutil, probe or record is touched:

- `writePerContext` and `unsetPerContext`;
- `launchProbe` for `input-source <id>`, with or without `--at`; `input-source current` is a read and runs anywhere;
- matrix-device's `source save|select|per-context` and `probe input-source`;
- `saveInputSource`;
- the cursor sitting's selection. The owner's recorded yes no longer switches anything there; the series' own source
  check decides, as with no yes;
- the spike's `engine-device.mjs` `inputSource` selection (`scripts/spike/engine/measure/`).

The native probes themselves (`Probe.swift`'s `input-source`, `scripts/cursor-sitting/input-source.swift`) do not
check the venue: they select whatever they are asked. Every harness caller therefore checks before it runs one, and a
new caller must too. Moving the check into the probes waits for the next engine bump (#567).

Off a hosted runner the harness only reads:

- The matrix asks the device first (`source state`: whether it may write, and the owner's source, layout and
  preference). The probe cells run when the owner is on ABC with the preference off. The Latin and Korean conditions
  run when the owner's source is theirs with the preference off. The mid-switch, composition and per-context
  conditions switch a source during the row, so they never run there.
- Every row the owner's values do not allow is NO VERDICT `ownerInput` (`scripts/native-matrix/owner-input.mjs`,
  `front-key.mjs` `sampleCause`). Its cause names the preference or source and the value the row needed.
- The owner may switch during a run, so the matrix reads `source state` again at each probe sample and each Unicode
  field (`owner-input.mjs` `ownerInputNow`), never trusting the first reading. A change is kept in
  `meta.inputSource.drift` (`{at, from, to}`), and the rows it rules out are `ownerInput`. A Latin or Korean source that
  does not hold with the field in front is the owner's there too, so `ownerInput`, not a generic invalid row.
- `summary.mjs` counts `ownerInput` per side in the NO VERDICT line and per cell, so the report shows what the owner's
  machine could not judge. The per-context rows stay out of the verdict (ruling 1119), but the not-judged section
  counts their `ownerInput` and `venue` samples.
- The live harness's `input-source` check is NO VERDICT. Its paste check's Korean window measures type_text only when
  the owner is already on Korean 2-Set with the preference off; otherwise type_text is NO VERDICT with its cause. A
  measured failure in the same check (a paste that did not land, the clipboard's types changed) is the headline,
  NOT PASSED, with type_text's NO VERDICT named beside it.
- The cursor sitting's selection becomes a read (`input-source.mjs` `switchSource`): the step holds only when the
  source it needs is already current, and its result says nothing was written (`written: false`, `holds`). #187's end
  verifies that the owner's recorded source still holds, without selecting it, and a held one is no failed put-back.
- A record found there (one left before this ruling) is only read: it is removed once the owner's values read back as
  saved, and named otherwise.

**Unproven live:**

- the rewrite and the delete against the real com.apple.HIToolbox domain on a hosted runner, with the text input
  system running. The tests prove defaults and plutil on a scratch path-domain only;
- whether the text input system writes the preference late in practice. The settle covers it either way;
- the off-hosted rows on the owner's Mac.

The next hosted C pilot proves the first. The input sections' restore should read `meta.inputSource.restored: true`.
The put-back's input-source step should then read `perContextRestored: true` and remove the record, and the save-sheet
lanes should begin.

### The runner's input sources (ruling 1189)

**What pilot C also showed.** The hosted image enables U.S. alone. Every Latin and Korean selection read
`com.apple.keylayout.US` back, so all 5 probe-cell rows and all 225 unicode rows were invalid. Fixing the restore lets
C complete, but without this step its input rows could never be judged.

**The step.** A new setup step, `input sources`, runs after `textedit defaults` and before the runs
(`scripts/hosted-sittings/input-sources.mjs`, `input-sources.swift`). It is hosted only: the module asserts it
(`assertGithubHosted`), and the Swift helper's `enable` refuses off a GitHub-hosted runner itself, before any TIS call,
however it is run; its `list` is a read and runs anywhere. Each helper call is bounded (120 s); one that outlives it
is recorded, its sources missing.

- **What it enables.** com.apple.keylayout.ABC, then com.apple.inputmethod.Korean (the input method, never
  selectable itself), then com.apple.inputmethod.Korean.2SetKorean (its mode).
- **How.** TISEnableInputSource, the call System Settings makes. It never writes AppleEnabledInputSources and never
  selects a source: the runs select through the approved bundle's probe.
- **The IDs** were read from macOS's own data, not from memory:
  - KoreanIM.app's `KIM_Extension.appex` Info.plist (`TISInputSourceID` com.apple.inputmethod.Korean; `tsInputModeListKey`
    holding com.apple.inputmethod.Korean.2SetKorean).
  - The helper's read-only `list` on macOS 27. ABC is `TISTypeKeyboardLayout`, selectable. The Korean input method is
    `TISTypeKeyboardInputMethodModeEnabled`, enable-capable and not selectable. 2SetKorean is `TISTypeKeyboardInputMode`,
    selectable.
- **No restore.** The VM is thrown away after the job, as with TextEdit's preferences.

**The read-back.** A fresh process (`input-sources.swift list`) reads the sources after a 1 s settle, up to 3 times.

- A source a run selects holds only when TIS's enabled list (`TISCreateInputSourceList`, enabled only) lists it,
  enabled and selectable. The input method holds when it is listed and enabled. A mode is usable only with its input
  method.
- The preference's value (com.apple.HIToolbox AppleEnabledInputSources, read through cfprefsd) is recorded beside the
  list and never judged: the rows depend on the list.
- Both readings go into `venue.inputSources` in the runner's record, and sitting.md's venue section renders a table:
  each source's enable status, its place in TIS's list, the preference, and whether it held.

**A source that does not hold.** It does not fail the setup or the sitting.

- It is named in `venue.inputSources.missing`, and the device's `source state` passes it on (`venueMissing`,
  `scripts/hosted-sittings/runner.mjs` `venueInputMissingOf`).
- The run never selects it. Every row that selects it is NO VERDICT `venue`, its cause naming the source: the probe
  cells and the Latin rows need ABC, the Korean rows need 2-Set, and the mid-switch, composition and per-context rows
  need both. None runs under the US layout to be judged.
- `summary.mjs` counts `venue` per side in its NO VERDICT line.
- The live harness reads the same record: without Korean 2-Set, its paste check's Korean window and its
  `input-source` check save and select nothing, and type_text is NO VERDICT `venue`. A measured plain-text or Markdown
  failure in the same check stays its headline.

**Unproven until a hosted run:**

- whether TISEnableInputSource takes from the job's process on the runner, and whether the enabled list shows the
  sources in a fresh process without a logout. The step's read-back answers both: if not, the rows are NO VERDICT
  `venue`, named;
- whether a source just enabled can be selected by the approved bundle's probe at once. The matrix reads each
  selection back, as before.

**The time it adds.** The step itself takes seconds: three swift runs, each compiling its script first, about 10 s on
a runner, plus up to 3 s of settles. Each C run will also run its input rows for real, where pilot C's ended
invalid at once:
- the five probe cells, each a scheduled probe and up to three attempts;
- the 225 unicode rows, each a facade call, with source reads and selections around each group.

Pilot C's matrix-vendor-1 took 1408 s with those rows invalid. From the measured rows' cost (method rows about 0.47 s
of wall each, speed rows about 0.44 s) and the probes' launches (about 1 to 2 s each), expect roughly 3 to 6 minutes
more per run, so a full C sitting grows by about 20 to 35 minutes. That is an estimate until the next pilot measures it.


## Pilot C-2: the panels, the typing and the time (rulings 1195, 1196, 1197)

### The Open panel

**What C-2 showed.** The system centred the Open panel at 520,162 880x448, over both of replayd's capture alerts
(893,244 260x364 and 830,188 260x348). The frame setup wrote to TextEdit's autosave defaults (80,80 720x440) was
ignored. The alert guard refused every `openPanel/*/click.cancel` on both lanes. `meta.placement.panel` stayed empty:
macOS 27 lists the panel window under TextEdit's pid (the guard's detail named "the textedit window 994"), and the
placement looked only for the panel service's bundle.

**The fix (ruling 1195).** On a GitHub-hosted runner each opening's window is told from TextEdit's windows read
before its key, moved into the strip (x 0-822, below the menu bar) by `scripts/native-matrix/panel-ax.swift` (AXSize
to the venue's panel frame, then AXPosition), and read back from the window list. The harness's device side does it,
never the engine under test. Each opening is in `meta.placement.panel` with its frame before, the frame asked, the
read-back and whether it stands in the strip. A read-back outside the strip makes that opening's case NO VERDICT
`venue`. Off a hosted runner the helper refuses before any Accessibility call.

**Resized, not only moved (ruling 1199).** The system's 880-wide panel never fits the 822-point strip, so the move
also changes its size, to the venue's panel frame (80,80 720x440). Ruling 1199 accepts that, on hosted runners only. An
opening whose asked frame has another size records `resized: {from: <the system's frame>, to: <the venue's frame>}`
beside `to` and its read-back in `meta.placement.panel`. sitting.md's read-back table (`renderReadBack`) shows such a
panel as "resized from 880x448 to 720x440", adding "the size not read back" when the read-back kept another size. The
panel's cells are therefore judged on a panel smaller than the one the system draws, alike on both lanes.

**Escape on cua's lane.** In C-2 cua's Escape ran unrefused and did not close the Open panel. Its Cancel click was
then refused by the alert guard (beforeRow 74 and 76) and the run stopped at 518 of 571 rows; the vendor's Escape
closed it every time. The close is now one rule on both lanes: Escape, the Cancel click, then the device's
Accessibility cancel. The rows of an opening that neither engine step closed are NO VERDICT, and only a panel still up
after the device's cancel stops the run. The next run's `meta.panelCloses` records every step and its outcome, so it
says whether cua's Escape closes the panel once it stands in the strip. The new judged cell
`openPanel/frontmost/pressKey.escape` (ruling 1196) puts the same question to the judge on both lanes.

### The untitled document's typing (ruling 1196 B)

Both lanes failed the sheet variant's and #212's typing alike, and in the background sheet variant too. The typing
goes into TextEdit's own untitled document after ⌘N and before any ⌘S: `NEW_DOCUMENT_CELL` checks that the front window
is a new document, neither the scene's nor a panel, and `SHEET_TYPE_CELL` checks its title before typing. No panel
exists when it fails, so the keys are not missing the panel service's field. The likeliest cause is TextEdit's
autocorrection rewriting the old text's lower-case first word, which is not in the dictionary, on a fresh image
(`scripts/accept/textedit.mjs` met the same). It is unproven offline. The text is now a capitalised dictionary
sentence. The cell returns the read-back's length and hash and whether it equals the text ignoring case, its front
window and a reason. The row adds the device's front, key and top-window owner (`outcome.typing`). Whether the panel
service's field takes keys is answered by `savePanel/frontmost/typeText.name`.

### The other rows

- **Intervention fires and pre-action.** The vendor's "textedit's window was not in front" came after the sheet
  variant: the top layer-0 window was not TextEdit's. The candidates offline are a transient window above it (the
  input-source caret indicator, a completion bubble, a cursor overlay). The vendor's concurrent rows also read
  `topWindow: false` 3 times in 135. The row now reads the window order up to 4 times, 250 ms apart, and names the
  front app and the top window's owner. The next run says which window it is.
- **Per-context (54 rows a side in C-2).** The preference read on and the driven scene's Korean held after its refocus,
  but its context read ABC after the reactivation. The mini's holds 3 and 10 read the same, so this is not the hosted
  image. A likely cause is that apps launched before the preference was written do not take it up; this is unverified.
  These rows are now NO VERDICT `venue`, naming the read-back and citing #577 (P3), the ticket for running the scene
  apps after the preference is written. They were already out of every verdict.
- **Composition with TextEdit as the user window (18 rows).** The field read no ㄱ after the probe's r (`composed:
  false`, 4 reads), while the Electron field's group with TextEdit as user composed in C-2 and on the mini. The rows
  stay invalid and now name what the field read (`raw key`, `empty`, `other`, `unread`; `read` in the reading). The
  next run tells an uncomposed key from one that never arrived.
- **Vendor `speed chrome/method.drag.select#1`.** An unprepared drag ("a point of the drag is not in the field")
  skipped its timing row. Every frontmost case now writes one, its sample invalid when it was not timed.
- **The pressKey row (ruling 1197).** The vendor read ㄱ for `r k` in Chrome and Electron, 가 in TextEdit. The row now
  reads its field until it settles (500 ms unchanged or 2 s), with `reads` and `settleMs` on the row.

### After the review of 55b7f56d9..fa91a1630

- **The Save sheet in AX.** A Save sheet has a window of its own in the window list but is an AXSheet child of its
  document in AX. `panel-ax.swift` now finds it under its parent by role and frame, for the move and for the cancel. A
  sheet takes no size or position of its own, so the helper moves the parent by the sheet's offset and reads the
  sheet's frame back. The placement entry says `via: 'parent'` and records no resize. Whether macOS 27 lists the sheet
  as a top-level AX window or as a child is not yet read on a runner; the next run's `ax.kind` says.
- **An unproven placement is not sent.** On a hosted runner the panel's window is looked for up to 4 times, 250 ms
  apart. If the list stays unread or no window of the panel is found, the case and its timing row are NO VERDICT
  `venue`, unsent. Off a hosted runner, with no alert to avoid, the case runs as before.
- **The close follows the device.** Each step's outcome is the device's own reading of the panel's window: `panel
  state`, read-only and allowed anywhere, gives closed, open or unread, and an unread list is never taken as closed.
  The lane's word counts only when no window of the panel is known. A device-confirmed close is not `PanelStuck`. An
  unread list after the device's cancel stops the run as unread. If the key guard stops Escape (the front is not the
  run's), the step is recorded unsent, the click is skipped, the device's cancel is tried, and then the run stops
  with the guard's reason.
- **Placements pair by opening.** Each placement entry and each row of an opening carries its id (the case's row id, or
  `openPanel/background@<user>`). The lanes' panel frames are compared by that id, never by position, and a
  difference takes out only that opening's rows (NO VERDICT `venue`), never the run.
- **No panel cell commits anything.** The panel cases run on both lanes off a hosted runner too (the owner's sitting).
  A test runs every panel cell on both lanes, with alerts and without, and finds no Return or Enter, no typed line
  break, and no Save or OK press.

### The time

C-2's vendor matrix run took 2206 s. Before each run step the sitting projects its finish: the time so far, plus
every run step left at its family's measured mean, or the mean of every measured run when its family has none
(`projected` on the step). Past 300 of the job's 360 minutes, the step's note, the log and sitting.md say so. Nothing
is split or skipped.
