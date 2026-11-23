# #117 M5 wave 1, task 9: T11a (the default-selection mode) and T11b (the flip)

Execution record: `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`, tasks 9 and 10 (T11a, T11b).
Plan: the M4/M5 pre-flight rev 3, §7 "The default switch, mechanically", "If the owner says no", sitting E, §4's "M5:
the default shown live" row, §8 T11. Ruling 1126 (the minimum's raise belongs to the flip).

## Commits

| Commit | Branch | What |
|---|---|---|
| `61743b1da` | `feat/117-m5` | T11a: the macOS default-selection mode, failing while the default is the vendor's |
| `e1b4a8a01` | `feat/117-m5-flip` (local, unpushed; worktree `.doperpowers/sde/2026-10-18-own-native-engine-m5-wave1/flip`) | T11b: the flip, `darwin: 'cua'`, MIN_ENGINE_VERSION 0.2.0, mirrors, tests, docs. Subject ends `[skip ci]` |

The flip sits on its own branch from T11a's commit, at the controller's direction, so later M5 tasks land on
`feat/117-m5` under it. It follows `feat/117-m5` by merges (the controller merges `feat/117-m5` into
`feat/117-m5-flip`), never a rebase. The fix wave (below) adds one commit to each branch.

## T11a: the default-selection mode

Modeled on Linux's (`scripts/accept/linux-selection.mjs`, #171 M5 commit 3e2e5d5f2), whose selection judges it reuses.

- `scripts/accept/macos-selection.mjs` (pure): the four homes (`HOMES`), the default and fallback judges, the sitting
  verdict, `--approved-home`'s refusal.
  - `default`: a fixture approved engine at the service's minimum (`${MIN}+fixture`) → cua's engine, reason `default`,
    run on cua's own host: repl.host `cua host (cua_engine)` with pass (fix wave). In the `fixture` lane the synthetic
    bundle's engine row is recorded, not judged; in the `approved` lane it must pass, its failure named apart from a
    wrong selection.
  - `none`: no approved engine → vendor, `engine_not_installed`.
  - `node`: the fixture engine, cua run on a Node below 24 with nothing else to find → vendor, `own_host_node_unavailable`.
  - `outdated`: a fixture approved engine at 0.1.0 (what every pre-T9 build reports) → vendor, `engine_outdated`.
  - A fallback passes only when `report.engine` names the vendor's engine for that reason, the engine row and repl.host
    both warn, the engine row names the reason and its remedy (`cua engine approve`; for outdated also `cua install
    --engine`; for node `Node 24`), and repl.host starts `vendor host (<reason>)`.
- `scripts/accept/macos-default-selection.mjs` (the runner): shapes each home in a scratch root under `RUNNER_TEMP`,
  refuses a home where anything selects an engine, runs `cua doctor --json` per home (the node home under
  `--older-node`), prints PASS/FAIL per home with the host repl.host names, writes the report (`--out`: the lane and
  each home's host too), exits 0/1/2. `--approved-home` is the `approved` lane: the default home is that home, with its
  own approved bundle. It is refused (exit 2) unless `RUNNER_ENVIRONMENT=github-hosted`, the home's real path is a
  directory under the runner's temp directory (not the account home), and its approved engine is this checkout's build.
  In the `fixture` lane nothing launches (the fixture's bundle id is not the engine's, which doctor requires before
  launching); in the `approved` lane doctor launches the approved bundle to read it and stops it after
  (`src/runtime/engine.mjs` `inspectEngine`). Neither lane captures or writes TCC; no replayd code.
- Hosted wiring, both `on: [dispatch]`, `lane: hosted-macos`, prepared, not run:
  - `default-selection`, the fixture lane, labelled a selection check (not the hosted+ witness): 15 min, the older
    Node from `$RUNNER_TOOL_CACHE/node/22.*`; artifact `default-selection-out/report.json`. `ci-gate <feat/117-m5 sha>
    --gates default-selection` expects RED (every home selects vendor (default)); `ci-gate <flip sha> --gates
    default-selection` expects GREEN.
  - `default-selection-approved`, the approved lane, the hosted+ witness of sitting E's cua row (fix wave):
    `scripts/accept/macos-default-selection-hosted.sh` makes a disposable home under `$RUNNER_TEMP`, builds the run's
    own engine into it (`cua engine build --sign adhoc`), approves it with `CUA_HOSTED_APPROVE` (a command run with
    `HOME` set to that home), runs the mode with `--approved-home`, and removes the home (after `cua engine stop`) at
    exit. It refuses (exit 2) until `CUA_HOSTED_APPROVE` is given: it depends on M4's hosted bundle build and T10b′'s
    hosted approval. Artifact `default-selection-approved-out/report.json`.
- Small seams: `placeFixtureEngine(userHome, {version})`; `readDoctor({cli, env, node})`.

## T11b: the flip

- `src/runtime/launch.mjs`: `DEFAULT_NATIVE_ENGINES = {darwin: 'cua', linux: 'cua'}`, the comment naming the macOS
  fallbacks and the rollback.
- `src/services/engine/client.mjs`: `MIN_ENGINE_VERSION = '0.2.0'` (ruling 1126), its comment.
- Mirrors and readers: `scripts/repl-parity/selection.mjs` `ORACLE_DEFAULT_ENGINE='cua'` (its engine table already
  modeled the default-cua rows); `scripts/probe/pinned-engine.mjs` and `scripts/probe/lib.mjs` already read
  `defaultNativeEngine(platform)`, so only their comments change (a lane given no engine now pins cua's and is refused
  on a Mac without an approved engine, rather than measuring the vendor's fallback under the default's name).
- Gates that relied on the vendor default: `scripts/sandbox-probe/hosted-gate.sh`'s probe-secrets step now runs with
  `CUA_NATIVE_ENGINE=vendor` (probe-secrets pins the default engine when given none; on a runner with no approved
  engine the pinned cua would be refused). Every other macOS harness already pins explicitly (#117 M3's whole-M1b
  rule): own-sandbox, compat-route, experiment, textedit, native-baseline, native-matrix, repl-parity native lanes,
  cursor-sitting. accept-native, probe-lifecycle, approval-cycles and verify.mjs pin the default when given no
  `--engine`, which is now cua's: they are owner or runner lanes run with an explicit engine in the plan.
- Tests: see below.
- Docs: README (opening, Requirements, App approvals, Use's host table and a new "Native engine (macOS)" paragraph
  with the rollback, the agent cursor, the browser note, the `CUA_REPL_HOST` and `CUA_NATIVE_ENGINE` rows),
  `docs/onboarding-new-mac.md` (the table row and step 7), the plugin's descriptions (`.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`) and `package.json`'s. Plugin version not bumped.
- Rollback, in the commit message and README: `CUA_NATIVE_ENGINE=vendor`, or `"engine": "vendor"` in
  `~/.config/cua/engine.json`; reverting the flip commit restores the default for everyone.

### sandbox-live's fingerprints

No baseline under `docs/evidence/2026-10-18-hosted-macos-gate/baseline/` moves. The four `fp-cua-{kernel,worker}-
{scoped,default}.json` come from `scripts/sandbox-probe/oracle.mjs fingerprint --launcher cua`, whose `ownLaunch`
builds the kernel and worker launches from `hostSettings` and the sandbox policy directly; it never calls
`replHostFor` or `nativeEngineFor`, so the engine selection cannot reach them. `image.json` is the runner's. The
gate's other steps change as follows on a runner with no approved engine: doctor's `engine` row now warns
(`engine_not_installed`; the step judges `sandbox.launcher` only); probe-secrets is pinned to the vendor (above);
own-sandbox and the engine lane were already explicit; `cua install` on macOS does not build the engine on this branch
(M4's re-cut pins its install to the vendor already).

## Tests

- T11a, in the shared checkout before its commit: `node --test test/accept-macos-selection.test.mjs
  test/accept-linux-selection.test.mjs test/native-baseline/engine.test.mjs test/repl-parity/selection-lane.test.mjs`
  (the importers of the two changed helpers): 32/32.
- T11b, in the flip worktree at the committed tree: every test file that imports launch.mjs, the selection oracle,
  scripts/probe/{lib,pinned-engine}.mjs, doctor, the engine client, the fixture engine, the scratch-home helper or
  serve-production, names CUA_NATIVE_ENGINE or MIN_ENGINE_VERSION, plus every file importing src/mcp/{connection,
  server,surface}.mjs, src/cli.mjs, bin/cua.mjs or lazy-runtime, or asserting `macos_native_peer_requires_vendor`,
  `reason: 'default'` or the engine attestation: 103 files, `node --test --test-concurrency=4`: 1539 tests, 1524
  pass, 14 skipped, 1 fail. So the run was not all green: the one failure is the pre-existing
  `test/serve-lazy.test.mjs` "the record is the runtime's raw answers…", which fails identically at T11a and on the
  untouched base (the record's Surprises, T9). The spike tests that share
  the fake engine (spike-engine-*) pass: the fake engine's default identity is unchanged.
- Not run: the full `npm test`, ci-gate, any hosted gate (per the dispatch).

## TDD evidence

- RED (T11a, the mode against a flipped default before the flip existed): with `darwin: 'cua'` and the minimum 0.2.0
  applied in the working tree only, `node --test test/accept-macos-selection.test.mjs` failed "the mode's verdict
  against production's selection: FAIL while …" with `actual {pass: true, homes: {all null}}` against the expected
  FAIL — showing the test reads production's default and the flip turns the verdict. Reverted.
- GREEN (T11a, as committed): 4/4.
- Live, on this Mac against scratch homes (the fixture lane: no GUI, nothing launched): `/opt/homebrew/bin/node
  scripts/accept/macos-default-selection.mjs --older-node ~/.nvm/versions/node/v22.23.2/bin/node`:
  at T11a, FAIL on all four homes ("the session selects vendor (default) …"), exit 1; in the flip worktree, PASS on
  all four (`default` cua (default), `none` engine_not_installed, `node` own_host_node_unavailable, `outdated`
  engine_outdated), exit 0. The default home's engine row is `fail` (the fixture is not cua's bundle id); the fixture
  lane does not judge it. As first committed, the mode judged the selection only, as Linux's does; the fix wave adds
  the host (below).
- RED (T11b): with the flip applied, the focused set failed 104 tests across 10 files (the runtime-launch host table,
  the selection oracle, the doctor's shipped-minimum case, the service and client tests whose fake engine reported
  0.1.0, the pinned lane's default); each was updated to the new default or made to name the vendor engine where it
  tests the vendor's rows.

## Decisions

- **The mode's unit test pins the verdict, it is not left red.** The dispatch asked for "a test that asserts the mode's
  verdict against the current default, written so the flip commit turns it green". A red test at T11a would break the
  `test` gate on `feat/117-m5`, which may land without the flip if the owner says no (PF §7). So T11a's test asserts the
  mode FAILs against production's selection (default and minimum not injected), with the exact per-home problems, and
  the flip commit changes it to assert PASS; the RED/GREEN above shows the same test body flips with production.
- **The four homes.** The plan names three fallbacks; the mode adds the default home (the cua row) so one run shows the
  selection both ways, as Linux's suites did. The cua row's hosted form uses a fixture approved engine (selection-level
  proof); `--approved-home` is the hosted+ form with the run's own approved bundle, wired as its own dispatch-only
  gate (`default-selection-approved`, fix wave), which waits on M4's hosted bundle build and T10b′'s approval.
- **The outdated home is 0.1.0, fixed,** not "just below the current minimum": it is what every owner's Mac holds
  until O1, the case the flip must not break. At T11a (minimum 0.1.0) that home is not below the minimum, but every
  home fails there anyway on the vendor default.
- **The no-Node home runs cua on a cached Node 22** (`$RUNNER_TOOL_CACHE/node/22.*` on the runner; ≥22.14 <24 checked by
  the runner), with PATH free of node and an empty cua home, since ci-kit sets up Node 24. Unverified on a hosted
  runner: that its tool cache carries Node 22.
- **Fallback judge strength.** Beyond Linux's (selected, reason, warn, reason named, remedy named), it requires
  repl.host to warn and start `vendor host (<reason>)`, since on macOS the fallback keeps the vendor host too. Remedy
  words per reason: none `cua engine approve` (doctor's engine row names `cua engine build`, repl.host `cua install
  --engine`), outdated `cua install --engine` and `cua engine approve`, node `Node 24`.
- **Gate placement.** A ci-kit gate `default-selection`, `on: [dispatch]`, rather than a workflow file: ci-kit's
  dispatch-only gates (as `parity-browser-stress`) are run by `ci-gate <sha> --gates …` on any commit, which is
  exactly sitting E's "on the flip commit and on the one before".
- **Reused Linux's module** (`unsetSelectionProblems`, `defaultSelectionProblem`, `readDoctor`, `selectionRecord`) and
  gave `readDoctor` a `node` option, rather than copying it.
- **Harness pins.** Lanes that pin production's default (pinLane: accept-native, probe-lifecycle, approval-cycles,
  verify.mjs, probe-secrets) now pin cua's when given no engine, and are refused on a Mac with none approved. Kept, as
  the whole-M1b rule intends (a lane names the engine it measures); only sandbox-live's probe-secrets, which never
  passes an engine, now says `CUA_NATIVE_ENGINE=vendor`.
- **Service and client tests**: their fixture engine now reports 0.2.0 (the minimum) through a local wrapper
  (`startFake`, the session's `ENGINE`), leaving `test/helpers/fake-engine.mjs`'s 0.1.0 default alone so the spike
  tests and M4's edits to that helper are untouched.
- **surface.mjs not changed.** The macOS js rule "typeText drops characters the layout cannot key (emoji)" is the
  vendor engine's. M4's re-cut already keys macOS's rules by the connection's selected engine (`COMPUTER_RULES.vendor
  / .cua`), which makes them follow the flip with no edit; repeating it here would duplicate M4's change and
  conflict. Consequence: on this branch alone (without M4) a cua-engine session gets the vendor's typeText line. The
  flip merges only after M4, so this resolves at the merge.
- **First-call document (S L289) checked, nothing stale:** core.md is the vendor's text with no engine claim;
  agent-cursor.md is served only to sessions on cua's engine (`agentCursor()` follows the selected engine), so the flip
  needs no edit there. `package.json`'s description ("for OpenAI's computer-use runtime") was updated with the
  plugin's. The project `CLAUDE.md`'s first line ("drive OpenAI's computer-use runtime") is stale too; left for the
  owner (instructions, not product docs).
- **README wording uses M4's commands** (`cua install --engine`, then `cua engine approve`), as T9's warnings do; on
  this branch without M4, macOS `cua install --engine` still refuses ("install takes --engine on Linux only").

## Discoveries

- The selection oracle (`scripts/repl-parity/selection.mjs`) already modeled every default-cua row (T9 and earlier):
  the flip there is the constant alone.
- `scripts/probe/pinned-engine.mjs` and `lib.mjs` read `defaultNativeEngine(platform)` since Linux's M5, so they
  follow the flip with no code change; only their comments say what it now means.
- sandbox-live's fingerprints are built outside the engine selection (`oracle.mjs ownLaunch`), so no baseline under
  `docs/evidence/2026-10-18-hosted-macos-gate/baseline/` moves; the gate's only engine-dependent input was
  probe-secrets' pin.
- M4's re-cut rewrites the same README passages around an "opt-in" framing ("### cua's own macOS engine (opt-in)",
  "an opt-in until #117 switches the default", host table rows "the vendor engine (the default)"), plus
  onboarding step 7. When `feat/117-m5` (with M4 merged) is merged into the flip branch, those M4 passages must be
  re-worded to the default, and the flip's README/onboarding hunks will conflict with them: resolve that merge as a
  manual doc pass.

## Fix wave

The controller's review of T11, one commit per branch: T11a's on `feat/117-m5` (this file with it) and `9cb3921c7`
on `feat/117-m5-flip`. Nothing merged or rebased.

T11a (`scripts/accept`, `.github/ci-kit.yml`, their test):

- **The default home's judge requires cua's host.** `defaultHomeProblem` reuses Linux's engine-only predicate first.
  It then requires repl.host to read `cua host (cua_engine)` with pass. Before this, `cua (default)` beside a vendor
  repl.host row passed. `hostOf` parses the row, and each home's record and output line carry it.
- **Two lanes.** `fixture`, the default: the synthetic bundle's engine row (always `fail`, since it is not cua's
  bundle id) is recorded, not judged. `approved` (`--approved-home`): the engine row must pass too, and a failure
  reads "the default selected cua's engine on cua's host, but doctor's inspection of the approved bundle is …",
  apart from a wrong selection.
- **`--approved-home` refuses** (exit 2) unless `RUNNER_ENVIRONMENT=github-hosted`, RUNNER_TEMP is set, the home's
  real path is strictly under RUNNER_TEMP's and is not the account home, and that home's approved engine is this
  checkout's `engineBuild()`. Doctor launches and stops the bundle it inspects, so only the run's own disposable
  home may be named.
- **Gates:** `default-selection` is relabelled as the fixture lane's selection check. The new dispatch-only
  `default-selection-approved` (`scripts/accept/macos-default-selection-hosted.sh`) is prepared, not run: it waits on
  M4's hosted bundle build and T10b′'s approval, given as `CUA_HOSTED_APPROVE`.

T11b (flip worktree):

- `scripts/sandbox-probe/m2-mini.sh` `accept <sha>`: accept-native runs with `CUA_NATIVE_ENGINE=vendor`, asserted
  by its doubled test. `scripts/mini-rules.mjs`'s ACCEPT_REMOTE checks out 94366c1, whose default is the vendor's,
  so it needs no pin.
- README, Native engine (macOS): a session that selects no engine falls back. An existing opt-in on an approved
  0.1.0 build needs an approved 0.2.0 or later build before it updates, or else the way back. An install never
  approves; its build waits pending. App approvals: who asks follows the engine, and the vendor host's session file
  stays in the `session` bullet. "An install stages a pending build" describes macOS `cua install` as M4 builds it;
  without M4 this branch still refuses `--engine` on macOS.

Tests and evidence:

- RED (T11a): the new test file run against T11a's committed `macos-selection.mjs`, with stub exports for the new
  names and the real `hostOf` (copies under /tmp, the checkout untouched): `node --test
  test/accept-macos-selection.test.mjs` gave 3 pass, 3 fail. One failure was the wrong-host case: expected "doctor's
  repl.host row is pass, vendor host (explicit), not cua's host for cua's engine (cua_engine) with pass", actual
  `null`, so the old judge passed it. The approved-lane inspection case and the refusal case also failed.
- GREEN (T11a), in the shared checkout: `node --test test/accept-macos-selection.test.mjs
  test/accept-linux-selection.test.mjs test/native-baseline/engine.test.mjs test/repl-parity/selection-lane.test.mjs`
  gave `# tests 34 # pass 34 # fail 0`.
- Live, the fixture lane, shared checkout: `/opt/homebrew/bin/node scripts/accept/macos-default-selection.mjs
  --older-node ~/.nvm/versions/node/v22.23.2/bin/node --out /tmp/t11a/fix.json` failed all four homes ("the session
  selects vendor (default) …"), `default-selection: FAIL (the fixture lane: a selection check, not the hosted+
  witness; minimum 0.1.0 …)`, exit 1. The record's hosts read `vendor` (`macos_native_peer_requires_vendor`).
- The same judge in the flip tree (the two runner files copied in for the run, then restored; the tree clean after):
  every home passed: `default` cua (default) on the cua host (cua_engine); `none`, `node` and `outdated` on the
  vendor host for their reasons. Verdict `PASS (the fixture lane …; minimum 0.2.0 …)`, exit 0.
- Refusals, on this Mac: `--approved-home /tmp/t11a/x` was refused because the run is not on a GitHub-hosted runner.
  With `RUNNER_ENVIRONMENT=github-hosted RUNNER_TEMP=/tmp/t11a` it was refused because the home holds no approved
  engine. Both exit 2. `sh scripts/accept/macos-default-selection-hosted.sh` here was refused as not GitHub-hosted,
  exit 2.
- RED/GREEN (T11b): m2-mini's test against the old script failed "the sitting measures the vendor engine, not the
  default" (6/7), and against the new one passed 7/7.
- T11b focused run, flip worktree, uncommitted fix applied (the same tree as `9cb3921c7` but for a comment
  reflow, after which `node --test test/sandbox-probe/m2-mini.test.mjs test/accept-macos-selection.test.mjs` gave
  11/11): the 103 files above plus every test reading README.md or m2-mini, 107 files, `node --test
  --test-concurrency=4` gave `# tests 1623 # pass 1608 # fail 1 # skipped 14`. Not all green: the one failure is
  the pre-existing serve-lazy "the record is the runtime's raw answers…". The flip tree's
  accept-macos-selection.test.mjs is still T11b's copy; the fix-wave test reaches it when the controller merges.

## Files M4's re-cut also touches

Fetched `origin/feat/117-m4-recut` (merge base b1b154845). Files both touch:

- T11a: `.github/ci-kit.yml` (M4 rewrites `engine-swift`; T11a appends a gate at the end: no overlap).
- T11b: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json` (version line vs description), `README.md`
  (heavy overlap, above), `docs/onboarding-new-mac.md` (step 7, overlap), `scripts/sandbox-probe/hosted-gate.sh`
  (M4: the install line and the M0 root; T11b: the probe-secrets line and header: separate hunks), `src/runtime/launch.mjs`
  (M4: the nativeEngineFor comment and the engine_not_installed sentence; T11b: the DEFAULT_NATIVE_ENGINES block: separate
  hunks), `src/services/engine/client.mjs` (M4 moves engineVersion and reworks the client; T11b the MIN comment and
  value: check at merge, and the 0.3.0 coordination rule applies), `test/doctor-engine.test.mjs`,
  `test/runtime-launch.test.mjs`, `test/services-engine-client.test.mjs` (M4 edits several of the same assertions'
  messages; T11b renamed every `startFakeEngine(` call to `startFake(`: expect conflicts), `test/services-engine-service.test.mjs`.
