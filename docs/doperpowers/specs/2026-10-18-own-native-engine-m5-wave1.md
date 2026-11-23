# #117 M5, first wave: T8, T9 and T11 — execution record

- Plan: the M4/M5 pre-flight, revision 3, `docs/doperpowers/specs/2026-10-18-own-native-engine-m4m5-preflight.md`
  at 8f06f132 on `docs/117-progress` (cited `PF §<n>`). Tasks T8 (§6's gates, T8a to T8e), T9 (R4, the minimum
  engine) and T11 (the default-selection mode, then the flip), §7 and §8.
- Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`. The design session owns it and its Decision
  Log; this file is the wave's living record on `feat/117-m5` until the design session folds it into the spec (the
  spec's Progress is being reconciled on `docs/117-progress` and M4's re-cut adds its own block, so this wave edits the
  spec only where the design session asks, as for T8a's Text change).
- Branch `feat/117-m5` from main b1b15484. M4's re-cut runs beside it on `feat/117-m4-recut`.
- Rulings received during the wave are in the Decision Log (1118, 1119, 1126, 1128, 1136, the scope change). M5 is
  ticket #506; M4 is #505.

## Plan of Work (this wave)

Order: T9 first, so the engine-version rule binds every engine change T8 makes; then T8a to T8d, T10, T3b, T8e;
then T11's two commits (scope change, below). Nothing here touches this Mac's GUI or Accessibility, or needs the
owner. Hosted runs are limited to what the design session clears (so far #420's kit, and T10's and T3b's lanes after
H0's pass); a witness not yet cleared is prepared and named in its gate's disposition file under
`docs/evidence/2026-11-23-own-native-engine/gates/`.

| # | Task | Scope (PF) |
|---|---|---|
| 1 | T9 | R4: `engineVersion` moves with every engine change, a check fails a change to `native/engine/` that does not move it, the service names its minimum, a default selection below it keeps the vendor's with a warning naming the remedy, an explicit one is refused, `doctor` warns; ruling 1118's wording |
| 2 | T8a | #186, #190, #420: fixes, unit witnesses, disposition files, runner witnesses prepared |
| 3 | T8b | #184's route A/B removed (`CUA_ENGINE_SPIKE_ROUTE`, `route-ab`); #189 and #185 as ruled |
| 4 | T8c | #212 with PR #218 re-cut on main; the hosted save-sheet cell prepared |
| 5 | T8d | #216: diagnosis, fix if found, the hosted twenty-cycle session prepared |
| 6 | T10 | The harnesses on a runner (PF §8 T10), the judge's declared departures and NO VERDICT rules, acceptance 3's keystroke witness, the window-order oracle (#485), the alert-frontmost rule; H0's row order and two-pass approve |
| 7 | T3b | The hosted staged-onboarding driver, relaunching at every stage |
| 8 | T8e | #258, #259: one cell each beside the vendor, on T10's harness |
| 9 | T11a | The default-selection mode, failing while the macOS default is the vendor's |
| 10 | T11b | The flip: `darwin: 'cua'`, its mirrors, tests and docs (PF §7). Stays on the branch, unmerged |

## Progress

- [x] T9 — reviewed clean 2026-11-23 (e84ba7953, fix b709b776a). The combined tree with M4's re-cut (the pending
  build named once, approval of a compatible pending build ending the fallback) and sitting E's third home are not yet
  witnessed.
- [x] T8a — reviewed clean 2026-11-23 (8198c50a3..5d59bd440, fixes 7e948e006..7d71f26e2 and f7ab700d4). Unit
  witnesses green; every runner witness waits on T10's harness or the `probe/420-qual` kit (specified, not built).
- [x] T8b — reviewed clean 2026-11-23 (99a2e812b..213b3da02, fixes fb19298b8, 1e3670839, a0bb24116). The Korean and
  per-context rows' runner witnesses wait on T10's pilot.
- [x] T8c — reviewed 2026-11-23 (d7e8ddbf3..69392a7b6, fixes b0e488cb2..16143e579 and 730dda11d..cd9e08265);
  converged after round 2: the save-sheet cell ships observation-only (`SAVE_PANEL_CONTROLS` null, no Return, no act)
  until the pilot reads the Save panel's controls, and its identification logic is reviewed when they are filled in.
- [x] T8d — reviewed 2026-11-23 (a6ef751ea..643a4dd33, fixes 430fe9bf4..8cbe919b0, four rounds); #216 stays open
  until the twenty-cycle witness runs in T10's pilot or O10.
- [x] T10a (the judge) — reviewed clean 2026-11-23 (527c85376, fixes 28122c80b, 8f4a72eb8, d7d7ff628).
- [ ] T10b′ (the harness on a runner, built; its pilot after M4 merges)
- [ ] T3b
- [ ] T8e
- [x] T11a — reviewed 2026-11-23 (61743b1da, fixes dbde89ba4, 46d5bb93b) on `feat/117-m5`.
- [x] T11b — reviewed 2026-11-23 (e1b4a8a01, fixes 9cb3921c7, d20874c8a) on `feat/117-m5-flip` (pushed, merges
  16da95398, 4d02b54a0, all `[skip ci]`); merges only after O1, M4 (#513) on main and the owner's go.

## Surprises & Discoveries

- 2026-11-23, T9: ruling 1118 assumes the approved bundle stays in place beside a pending build, but `buildEngine` on
  main, and M4's re-cut `installMacosEngine`, still replace the approved bundle. Until M4's T1 changes the layout, a
  session after `cua install` meets `engine_not_installed`, not `engine_outdated`; T9's "pending newer, no fallback"
  row is proven by unit test only.
- 2026-11-23, T9, merging with M4's re-cut (trial merge-tree against fda61df9a): `doctor-engine.mjs` conflicts once in
  `notInUseRow` (M4's `pendingBeside` against T9's `buildWords`; keep T9's, which also carries the source check and
  the minimum), and `installedRow` and `vendorRow` merge clean but would show the pending build twice (drop M4's
  clause). The design spec's Decision Log end conflicts too, both branches appending there.
- 2026-11-23, T8c, merging with M4's re-cut (trial merge-tree): `withMeta` in `Input.swift` conflicts (take M4's
  body, which keeps the `permission` marker, end it with `return error.interrupted(adding: meta.reachedEffects)`, keep
  T8c's `reachedEffects` extension), and `PER_CALL` in `service.mjs` (keep both `cua/permission` and
  `cua/interruption`).
- 2026-11-23, T9: `test/serve-lazy.test.mjs` "the record is the runtime's raw answers…" fails on the untouched base as
  well; not this wave's.

## Decision Log

- 2026-11-23, T9: `engineVersion` 0.1.0 → 0.2.0 and the macOS service's `MIN_ENGINE_VERSION` is 0.2.0
  (`src/services/engine/client.mjs`). Every build before T9 reports 0.1.0, so every approved engine on an owner's Mac
  falls below the minimum until O1 rebuilds and approves. Enforced at selection (`nativeEngineFor`), not at the
  client's connect: the client's ping already holds the running engine to the bundle the selection checked. An
  unreadable version counts as below; a `+metadata` suffix is ignored. "A pending build exists" means `pending.json`
  names a build other than `approved.json`'s (`newerPendingBuild`, `src/runtime/engine.mjs`), whatever bundle layout
  M4 settles.
- 2026-11-23, T9's review (b709b776a): the client checks the bundle's version again at every connect, before any ping
  or launch, and refuses an older one ("cua engine too old … nothing was launched"), so a bundle swapped after
  selection is not driven. Every macOS doctor row names the approved build against this plugin's engine source and any
  pending build; a stale approved build warns where cua's engine is in use, and the vendor row states the builds and
  stays `skip` (no session uses that engine). `src/runtime/engine-minimum.mjs` (`pendingEngine`, `pendingMeetsMinimum`,
  `outdatedRemedy`) reads M4's `pending/cua Engine.app` slot first, then the bundle pending.json names; the
  approve-only remedy appears only when the pending bundle meets the minimum. The gate lists paths with
  `--no-renames -z`, so a file moved out of `native/engine/` counts; `Tests/` stays exempt (the version names shipped
  builds, and `Tests/` is outside the build hash). `nativeEngineFor` and `createEngineClient` take a `minimumVersion`
  seam for the below-minimum tests. The fixture engine's version is `${MIN}+fixture`, since `0.0.0-fixture` does not
  parse and would be refused at any minimum.
- 2026-11-23, T9: the remedy names `cua install --engine` (the form that builds whatever is selected, and M4's re-cut
  sentence word for word) where ruling 1118 wrote `cua install`; with a newer pending build, `cua engine approve` alone.
- 2026-11-23, T9: the version-move check is `scripts/engine-version-check.mjs`, run by a new ci-kit gate
  `engine-version` (hosted Ubuntu, filtered to `native/engine/**`); it diffs `CI_KIT_BASE..CI_KIT_HEAD` over the files
  the build hash covers (`native/engine/` minus `Tests/` and build products) and fails unless the version rose. Its
  granularity is the pull request: one move covers every engine change a branch carries, so T8's engine changes on this
  branch ride on 0.2.0 and the build hash tells intermediate builds apart.
- 2026-11-23, ruling 1126 (T9 split): `MIN_ENGINE_VERSION` stays where today's approved builds (0.1.0) meet it; the
  enforcement, the remedy text and the `engine-version` gate stay. The raise to 0.2.0 moves into T11's flip commit,
  which merges only after O1. `engineVersion` still moves to 0.2.0 on this branch, so an M5 pull request before the
  flip moves `engineVersion` only. Supersedes T9's "MIN_ENGINE_VERSION is 0.2.0" above. Landed as a fix on T9 with a
  test that an approved 0.1.0 selects while the minimum is 0.1.0, the below-minimum rows exercised with a fixture
  minimum.
- 2026-11-23, T8a (#186): a keyed unit counts as entered once its key down is posted, the event the app inserts text
  on; the source check still runs before every event, so `inputSourceChanged`'s count is the field's committed prefix.
  The spec's Text paragraph (S L158) needs to say where a character now counts as entered.
- 2026-11-23, T8a (#190): the expected file was wrong, not cua's sentence. In Chrome both engines answer "Could not
  find the requested text to select in the element" (hold 3, both engines, both runs), since Chromium reports the
  checkbox's selection range as settable (the vendor's order of checks, F §16.2). Only the Chrome row changed.
- 2026-11-23, T8a (#420): in Chromium and Electron apps only, a non-secret text holding a character above U+FFFF takes
  the paste route (pasteboard saved and restored around it), whether or not the field would have dropped it: the
  engine cannot tell before typing. Safari, AppKit and Firefox keep typing it. Secret text is never pasted, so it is
  still typed and the read-back reports the dropped character; how secret text should behave is with the design
  session. The spec's Text paragraph (S L158: a character the layout cannot type goes as a Unicode key event) needs
  the Chromium exception.
- 2026-11-23, H0's result (#175's findings comment; kit README on `origin/probe/117-h0` 56c08949): all four witnesses
  pass, so T10, T10b and T3b are released, everything runs hosted and O8 is off. Order on a runner: system-database
  TCC rows for both bundle ids (the user database is ignored), relaunch, then the cells. Unattended approve needs two
  passes; the harness does both and the report says so. The `xcode-27` image is macOS 27.0.1 and serves the matrix's
  macOS 27 witness where a kit can select it; until #504 lands the engine is built on `macos-latest` and copied.
- 2026-11-23, ruling 1136 (the owner's yes): on GitHub-hosted runners only, kits may pre-record replayd's capture
  approval, or dismiss its alert, through the same single guarded writer as O0 (H0's kit function; reused, never a
  second writer); pre-recording before the first capture is preferred.
- 2026-11-23, H0 (ii) (run 45156038821, main b1b15484, kit `probe/117-h0` de0fac2e, README 51f79628): replayd's
  capture alert never closes by itself (10 min up on both copies; the vendor's helper stacks a second alert window);
  UserNotificationCenter is the front and key app in every sample; a second capture by the same copy raises no new
  alert; activation under an alert is unreliable. So the alert-frontmost rule below is load-bearing, and a hosted
  judged pilot gives verdicts only once (i)'s pre-record exists. (i) is on hold for the owner's direct authorization:
  nothing in this wave builds or depends on pre-record code (ruling 1136's writer is not reused yet). The guard
  pattern for later is `probe/117-h0` f28ce0db (tccWrite guarded before any store access, an injectable STORE, a spy
  test).
- 2026-11-23, ruling 1141 (spec Decision Log on `docs/117-progress` b3588b5a): pre-recording replayd's approval does
  not prevent the alert (run 45163139714: replayd read the entries and alerted anyway), so no kit writes replayd's
  store and H0's replayd code (`probe/117-h0`, `scripts/probe-117-h0/`) is not reused. The hosted condition is "alert
  up, scene activated first", under the alert-frontmost rule unchanged: front and key are sampled around each judged
  cell, a cell with the alert frontmost is NO VERDICT, and NO VERDICT never counts as a pass. The activate step checks
  that it took front and key before the cell runs; if not, NO VERDICT, not FAIL. T10's hosted qualification reports
  each cell's NO VERDICT count beside its verdicts; a cell with too few verdicts does not qualify, and the numbers go
  to the design session for the owner. In that run, keystroke ×2, Finder and TextEdit activation and the probe modes
  passed with the alert up.
- 2026-11-23, new judge rule (the design session): the judge checks that no alert was frontmost during any judged
  cell; a cell with an alert frontmost is NO VERDICT, never a pass. It belongs to T10's oracle, with a test.
- 2026-11-23, scope change (the design session, ruling 1117 releasing on H0's pass): this wave also takes T10 (with
  the alert-frontmost NO VERDICT rule and its test in the oracle, H0's row order and the two-pass approve), T3b (the
  hosted staged-onboarding driver, a relaunch at every stage per H0 step 10) and T8e after T10. Order: T8b to T8d,
  T10, T3b, T8e, T11 (the flip an unmerged commit). T10b stays parked until O11 triggers.
- 2026-11-23, M4's dependencies (the design session): T10 consumes M4's T4 and T5 and T3b consumes T2 and T3, all on
  `feat/117-m4-recut`. T10's judge and oracle work builds now with unit tests; T10's hosted pilot and T3b run after M4
  (#505) merges to main and origin/main is merged into `feat/117-m5` (a merge, no rebase). The moving M4 branch is not
  merged directly. T8e and T11 may come before T3b.
- 2026-11-23, T8d (a6ef751ea..643a4dd33, #216): not reproduced from the code. One approval memory per MCP connection
  (`src/mcp/approval-memory.mjs`), keyed by the resolved app: a decline for one app never touches another's entry; an
  approval survives end_task, new tasks, js_reset, the idle stop and a worker replacement; a new connection asks
  again. An approved app is refused again only by a new connection whose client answers no, an accept never
  remembered, or the client's own later decline (in Claude Code 2.1.330 a hook's blocking error comes back as a
  decline, aborts and limits as cancel, so a decline need not be a person's). The refusal keeps the vendor's sentence
  and adds where its answer came from (client declined / declined earlier on this connection / client cancelled), on
  cua's engine, macOS and Linux alike (`notApproved`, `policy.mjs`); never that a person declined, never a way around.
  The design session: an accept carrying its own `_meta` without `persist` stays unremembered (MAWS's shim,
  `cua-shim.mjs:11`, adds `_meta.persist` to every accepted app approval, so remembering more would widen consent for
  no known client); 216.md names it as a client contract. The hosted witness is `scripts/approval-cycles.mjs`, twenty
  cycles, run in T10's pilot; Claude Code's own answering and a reconnect are O10's.
- 2026-11-23, ruling 1144 (shared Unicode failures), for rows judged by an absolute expected string only: (1) per
  paired sample (1116), a cua sample is `equal` only against its own paired vendor sample with the same failure and
  the same read-back; the vendor passing any sample of the row while its cua pair fails makes the row FAIL. (2) The
  same failure includes the answer: vendor ok with wrong text and cua ok with the same wrong text is equal, flagged a
  shared false ok; cua refused or unconfirmed where the vendor gave a false ok is better, under the existing departure
  kind; cua false ok where the vendor refused is FAIL. (3) Every shared-limit row needs a ticket, one per distinct
  cause (a shared false ok P2 or higher, a shared honest refusal P3), which the design session registers; the judge's
  report lists them under "shared limits (vendor has them too)", apart from departures, each naming its cause. (4)
  Holds 3, 2a and 2b keep FAIL under their own rules; hold 3's `chrome/korean/typeText.lines` moves to shared limits
  only on paired evidence, never by declaration. An unpaired sample has no verdict; NO VERDICT never counts toward a
  pass. Built into the judge as T10a's fix.
- 2026-11-23, T10a (527c85376; detail in `docs/evidence/2026-11-23-own-native-engine/judge.md`): one declaration
  mechanism, `scripts/native-matrix/expected/departures.json` (the Unicode expected file, its reader and the run's
  `applyDeclarations` removed); an entry `{section, id, vendor: {answer: 'ok'}, cua: {answer: 'refused'|'unconfirmed',
  sentence}, decision}` covers a sample only with the vendor's same-run sample passing and cua's act throwing the
  declared sentence with the state unchanged (refused) or unchanged or the intended effect (unconfirmed) and the oracle
  held on both sides; any other kind blocks. Departures do not turn PASS into OWNER; they are counted and listed under
  "What changes for a user". Ruling 1116 per sample: an unpaired cua sample has no verdict. The front/key field
  contract is `scripts/native-matrix/front-key.mjs` (`frontKey` per judged row, `meta.hosted`, `meta.desktopMode`); NO
  VERDICT causes in order: unread, activation, alert, invalid, unmeasured, unpaired; "alert" is an app outside the
  cell's own apps front or key. A cell qualifies with at least three runs per side in which every sample has a
  verdict. A device mode other than shared is missing proof. Hold 3, 2a and 2b still judge FAIL; none of hold 3's 355
  cells qualifies. Open with the design session: a Unicode row both engines fail the same way (recommended `equal`
  with the same read-back, listed as a shared limit); until ruled, the absolute expected string stands. The pilot
  reports, per cell, how many runs have every sample with a verdict and how many verdict samples each run got, for the
  design session's decision on a looser qualification rule.
- 2026-11-23, T8d's review rounds: the connection owns an answer's provenance on cua's own host only (detected by
  `CUA_REPL_TRUSTED_SERVICES` in the worker env); the vendor host's replies stay byte for byte, and there a marked
  answer's provenance is unavailable (neutral clause "the approval request was declined"). `cua/approval` is per call.
  The witness's judge needs positive evidence (a completed bind, or a stamp showing accept), takes freshness from the
  ask history, requires the complete stamp, fails any second ask per app per connection, and makes blocked or
  unexecuted steps NO VERDICT.
- 2026-11-23, the flip's placement (the design session): the flip commit (MIN to 0.2.0 and `darwin: 'cua'`) merges
  only after O1 and after M4 (PR #513, which carries engineVersion 0.2.0) is on main, and must stay last on top of
  M5's work so the rest can merge without it if O1 is late. So T11a (the mode) lands on `feat/117-m5` and T11b (the
  flip) on a branch `feat/117-m5-flip` stacked on it, which follows `feat/117-m5` by merges (never a rebase) as later
  tasks land. The design session approved it and cleared pushing `feat/117-m5-flip` (merges only, no force, no
  rebase, no PR, no CI: its pushes carry `[skip ci]` until the design session opens the flip's pull request).
- 2026-11-23, T10a's review rounds (28122c80b, 8f4a72eb8, d7d7ff628): pairs are eligible only within one hold,
  commit, approved build, device and OS (hold, commit and build strings; the OS a `{name, version, build}` record
  compared field by field, validated in the result reader too); a cell qualifies only on three complete run pairs
  (both sides holding the same planned samples, every one with a verdict), partial runs shown as labelled
  diagnostics; speed and finding come from the same eligible observations on both sides; per-method timings are in
  the manifest. A departure needs `cua.errorName` of the declared kind (`answers.mjs`) and a sentence with at least
  ten literal characters in a row. Ruling 1144 applies to fixed-string rows only (pressKey included; the mid-switch
  row judged on its own prefix); frontmost rows are equal only with the same answer and every recorded effect field
  equal, and a frontmost refusal where the vendor answered ok needs an R3 entry. A proven cua user-value change fails
  first; a refusal is better than a false ok only on an actual vendor text mismatch. Shared limits are grouped per
  observation by cause and priority. `ACCEPTANCE_ROWS` names Acceptance 4's two TextEdit rows. Deferred to T10b′: the
  judge trusts `ok: true` before `userKept` (`cell-verdict.mjs` ~L114), which today's producer cannot contradict; the
  harness must not write contradictory rows. Until T10b′ records the engine's own error name and the
  unchanged/effect readings, no departure and no conservative-better case can be shown.
- 2026-11-23, T11 (detail in `docs/evidence/2026-11-23-own-native-engine/flip.md`): the default-selection mode is
  the dispatch-only ci-kit gate `default-selection` (`scripts/accept/macos-selection.mjs`,
  `macos-default-selection.mjs`) over four scratch homes (default, none, node, outdated at 0.1.0); a default home
  passes only on cua's engine and cua's host, a fallback home only when the engine and `repl.host` rows warn naming
  the reason and the remedy. Its unit test asserts FAIL against today's default, so `feat/117-m5` never goes red if
  the flip never merges; the flip turns it to PASS. Sitting E: `ci-gate 61743b1da --gates default-selection` (RED) and
  the same on the flip (GREEN). The hosted+ witness is a separate dispatch-only job
  (`scripts/accept/macos-default-selection-hosted.sh`) that builds the run's own ad hoc bundle in a disposable runner
  home and refuses until `CUA_HOSTED_APPROVE` is supplied (T10b′'s hosted approval, after M4); `--approved-home`
  refuses off a GitHub-hosted runner or outside a disposable home; the approved lane judges doctor's inspection facts
  (approved and running build equal to the checkout's, the socket's engine the approved bundle, all three grants, a
  clean launch, no route-3 advice) and accepts only the ad hoc signature's warning. The flip sets `darwin: 'cua'`
  and the minimum 0.2.0, pins `CUA_NATIVE_ENGINE=vendor` in sandbox-live's probe-secrets step and m2-mini's `accept`;
  lanes that take the default now take cua's engine; no sandbox-live baseline moves; the README says an unconfigured
  session falls back, an existing opt-in needs an approved 0.2.0 or later build (or the vendor rollback, with the
  host override unset), and a plain install stages a pending build that never approves itself. At integration: M4
  rewrites the same README and onboarding passages, so the flip needs a manual docs pass once M4 is on main; the
  project CLAUDE.md's first line goes stale at the flip (left for the owner).
- 2026-11-23: T10 splits in two executor tasks, both built now with unit tests: T10a, the judge (`summary.mjs` and
  its declared-departures file: R3's one declarable kind, NO VERDICT without a valid vendor pair, the alert-frontmost
  and failed-activation NO VERDICTs, NO VERDICT counts per cell beside the verdicts); then T10b′, the harness on a
  runner (the loopback device with the run's own install, hosted attestation fields, acceptance 3's keystroke
  witness, the window-order oracle for #485, front and key sampled around each judged cell, the activate check, H0's
  row order and the two-pass approve, a workflow per sitting). T10b′ is so named to keep it apart from the parked
  MacBook transport T10b. The hosted pilot runs after M4 merges.
- 2026-11-23: M5 is ticket #506 (a child of #117); M4 is #505.
- 2026-11-23, #420's kit ran (run 45161855631, all seven jobs green; fix 2ddec850c against main b1b154845, kit
  `probe/420-qual` a22076e63): cua's side passes 20/20 on every fix cell, with 0 wrong successes, 0 privacy flags and
  0 NO VERDICT. On Chrome for Testing 157 and both Electron 44 lanes, non-secret emoji text is exact through paste in
  the plain and password fields, and a secret is refused before any key (`concealed_input_unavailable`, cause
  `droppedCharacter`, field empty, no key, clipboard untouched). Safari, AppKit and Firefox are keyed and exact. Main
  misses all 60 Chromium rows per lane, so the kit sees the defect. The vendor pair waits on T10's lane. The head has
  moved since 2ddec850c (T8c changed Input.swift, service.mjs and the wrapper, though not the type route), so whether
  the frozen head reruns the kit is T13's call. The workflow keeps the path `probe-414-qual.yml`, since a rename needs
  a push without [skip ci].
- 2026-11-23, the design session clears #420's kit: built on `probe/420-qual` from `probe/414-qual` b7aebd311,
  pushes carrying "[skip ci]", run on GitHub-hosted macOS runners only, one hosted macOS run in flight for the lane,
  watched at 120 s or more, no ci-gate, no TCC write beyond the kit's guard (ruling 1111). The cua side runs now on
  feat/117-m5's head; the vendor pair waits on T10's lane after H0. Run ids and results go into 420.md.
- 2026-11-23, T8c (d7e8ddbf3..69392a7b6, #212 with PR #218 re-cut by hand): a `userIntervened` answer keeps the
  vendor's sentence as its opening and adds one clause, "Nothing was done…" for a refusal or "stopped part-way. What
  may have taken effect: …" for a stop part-way; the phase comes from which check stopped the request, so a stop
  part-way never says nothing was done. The engine writes the answer the model sees (#218's second rendering in
  `protocol.mjs` is dropped; the JS reader serves only the secret wrapper, in fixed phrases, and the service forwards
  `cua/interruption` per call). Effect names are camelCase, with `scroll` and `activation` added and main's newer focus
  paths (#324, #390) covered; an ended held activation is counted once all of execute's cleanups have run. Dropped from
  #218: route 4 skipping its restore after an intervention (S L152: route 4 restores the previously frontmost app and
  its key window, without exception). After review (b0e488cb2..16143e579): `cua/interruption` is a per-execution
  snapshot (#212's criterion "preserve per-action metadata even when observation follows in the same cell"; the
  answer advises `getAXState` next), carrying the account with the receipt, route, interval and activation data, kept
  across same-cell observations and later actions and out of the next execution; every other `cua/*` key stays per
  call. The effects account counts activation posts actually made (`ActivationPosts`, per thread, read as deltas,
  attempts counted), the refusal clause is "The requested input was refused before its first step" (the Chromium
  accessibility prologue can run before the guard), and teardown "may have sent the app a deactivation". The
  save-sheet cell is valid only when receipt ≤ probe post ≤ response and the structured phase agrees with the
  sentence; a missing sheet or a file in the run-owned folder fails without retry; the row is recorded before cleanup;
  the destination is a run-owned `mkdtemp` folder set through the Go To field and verified before the act (its field
  id is unread on a runner: the pilot's first run reads it and tightens the Return guard). A set_value on a
  save sheet's name field is unit-proven never to commit the sheet. The hosted cell `intervention-save-sheet` is
  standalone (not in the full matrix), judged by cua's answer ("stopped part-way" makes a sample valid; it retries
  aiming from the measured receipt; "not committed" is the sheet still open after a 2 s settle). Risk: the window
  between receipt and the last check before the write is tens of ms, unmeasured, so the cell may end NO VERDICT. The
  Save sheet's identifiers are unread on a runner; the cell needs cua Engine's Input Monitoring grant there. Who
  pressed Save in the original report stays unproven.
- 2026-11-23, T8b (99a2e812b..213b3da02): the engine never read `CUA_ENGINE_SPIKE_ROUTE`; the service and harness
  readers and the `route-ab` cell are removed, the engine's own `spikeRoute` argument stays for the M0 spike harness
  (no product path reaches it), and hold 3's `route-ab` result files no longer validate but stay as record. The
  pressKey row keeps one id (`…/pressKey.rk`) with its expected text chosen by the observed source (`rk` Latin, `가`
  engaged Korean); a declaration of a pressKey row is refused in the expected file, and the summary fails the row where
  a valid vendor sample reads otherwise (ruling 1119's "fails and cannot be declared"). The per-context rows are kept
  out of the manifest and every verdict by their condition (so hold 3's unmarked rows are excluded too), runs mark them
  `excluded`, and the summary has a "Not judged" section listing the plan's 54 per-context rows with the cause. Whether
  2-Set's layout engages after refocus on a runner is T10's question; if it never does, the Korean rows stay NO
  VERDICT. After review: the exclusion rule lives in `scripts/native-matrix/not-judged.mjs` (`NOT_JUDGED`,
  `exclusionOf`) and decides by section and condition only, so an `excluded` mark on any other row is invalid proof;
  pressKey is judged on raw outcomes with declarations ignored (a declaration on loaded pressKey evidence is missing
  proof); only the per-context preference write is recoverable (`PerContextWriteFailed`, its rows excluded with the
  cause), and every lane-integrity error stops the lane; a not-judged row no lane recorded reads "not recorded".
- 2026-11-23, T8a's review (7e948e006..7d71f26e2): ruling 1128's refusal is `concealedInputUnavailable` with a
  value-free meta word `concealedRefusal: inputSource | droppedCharacter`, which the service does not forward into
  the model-visible `cua/*` meta; the wrapper picks its fixed sentence by cause, an absent cause getting the
  input-source sentence (engines before 1128 refused only for the source) and an unknown one a neutral sentence. When
  both causes apply the dropped character is named, since no input source would type it. "0 keys posted" is proven in
  unit tests by the meta's start and end times staying null; live key and pasteboard counts are the qualification
  kit's. #186's runner oracle (`judgeMidSwitch`) holds the sentence's "after N of M characters" to the field's
  committed prefix and M to the request's length. #190's Chrome row matches the refusal whole, bare or in the server
  error's envelope; the TextEdit and Finder notText/notSettable rows still match as substrings (pre-existing, left).
  #420's own check is the `probe/420-qual` kit, specified in 420.md file by file from `origin/probe/414-qual`
  (b7aebd311) and not built: building it is a probe branch and a hosted run, outside this wave. Its R3 declaration
  needs the observed vendor/cua pair, which waits on H0's vendor witness.
- 2026-11-23, ruling 1128 (#420, secret text): in a Chromium or Electron app, concealed text holding a character
  above U+FFFF is refused before the first key, nothing posted; the sentence names the cause and the remedy, never a
  character, position or length; `CONCEALED_REASON` is corrected so a refusal never blames the input source when that
  is not the cause; declared under R3 and recorded in 420.md; the secret-text cell becomes "refused before any key, 0
  keys posted", the non-secret rows keep 20/20 through paste. #186 and #190 accepted. Lands as T8a's fix. The spec's
  Text paragraph and a Decision Log entry carry T8a's three changes (folded on this branch at the design session's
  request, as the loop's spec writer).
- 2026-11-23, version coordination (the design session): M4's re-cut also moves `engineVersion` 0.1.0 → 0.2.0 with
  the minimum at 0.1.0; whichever of M4 and M5 merges second moves to 0.3.0 at its merge (origin/main merged in, then
  the bump; no rebase). M4 builds ruling 1118's layout (c021e44a, in re-review): builds go to
  `<engine dir>/pending/cua Engine.app`; `cua engine approve` promotes the pending build and restores the previous one
  on failure. T9's pending row is re-checked against it.
- 2026-11-23, the design session on T9: the per-pull-request version move and the `cua install --engine` wording are
  accepted; the approve-only row stays unit-proven and is re-checked when M4's fix wave lands ruling 1118's layout.
  The minimum's effect on explicit `cua` sessions before O1 (MAWS's repository sets `CUA_NATIVE_ENGINE=cua`) is with
  the design session, expected as a merge-order constraint rather than a code change.
- 2026-11-23, ruling 1119 (#189): pressKey sends physical keys, composed by the active input method. With the source
  and layout observed after refocus, Korean 2-Set expects 가 and Latin expects "rk", in all three scenes. typeText
  keeps its exact-text contract. If the vendor's lane composes differently the row fails and cannot be declared.
- 2026-11-23, ruling 1119 (#185): the per-context rows are out of M5's judged matrix. Cause: a stored per-context
  preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference
  forbids. The rows still run and report as excluded / NO VERDICT; the owner's page lists them under "not judged" with
  that cause; #185 stays in the backlog with its design.
- 2026-11-23, ruling 1118: a plain `cua install` never replaces an approved engine at or above the minimum; it builds
  the new source as a pending build beside it and `cua engine approve` promotes it. Remedy wording by case: an approved
  build below the minimum falls back to the vendor's with a warning naming `cua engine approve` when a pending build
  exists, else `cua install` then `cua engine approve`; an approved build at or above the minimum with a newer pending
  build does not fall back, and `doctor` shows both builds with "a new build is pending; cua engine approve to use it".
  M4's T1 is reshaped to match; wording aligns with `feat/117-m4-recut` when it lands.
- 2026-11-23: T9 runs before T8 (accepted, 1119) so that T8's engine changes are the first to move `engineVersion` under the rule.
- 2026-11-23: this wave's decisions are recorded here, not in the spec's Decision Log, which the design session and
  M4's re-cut are both editing on other branches; the design session folds this file in.
