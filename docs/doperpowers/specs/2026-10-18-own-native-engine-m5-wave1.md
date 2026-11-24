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

**Sitting C's last step: the key-route diagnostic (ruling 1198).** After C's counted lanes and their judges, one step
(`key-route`, kind `diagnostic`) runs a lane per engine whose only section opens TextEdit's Open panel, reads the AX
half on the device, watches one `pressKey("Escape")` with listen-only taps and closes the panel by Accessibility when
the Escape did not. Its record (`key-route/key-route.json`) and section (appended to sitting.md) are what the P1 engine
ticket on cua's key routing rests on. It is INFO, never C's verdict, save a named cleanup failure; hosted only at
every entry point (the step, the matrix cell, the device commands, the AX helper, the tap app). What only the hosted
run proves: that the tap app's own row is the one TCC asks (its readiness reports `listenAccess`), that the per-pid
taps see a CGEventPostToPid post, and the pids themselves.

**C-5: the lanes after a stopped run (ruling 1214).** Each matrix run starts when the run before it put the device
back (its put-back held), complete or not; a cua sample whose vendor sample a stopped vendor run never took, where the
row is judged against the vendor's, is NO VERDICT `vendorStopped` naming the stop, and own-effect rows are judged as
ever.

**The owner's sitting (PF §5, O1 to O6): a prerequisite this wave adds.** #560 lands first: the device side's read of
the hosted venue is bound to the runner's VM (`vm.platformUuid`, `vm.bootedAt`), beside the direct
`RUNNER_ENVIRONMENT=github-hosted` checks every hosted-only write already makes. Until #560 is on the branch the owner
sits from, the M5 harness (`scripts/hosted-sittings/`, and the scenes, matrix, baseline and native-mac lanes it drives)
never runs on the owner's MacBook or on the mini. The pre-flight's §5 "Order" carries the same line (the design
session's to add on `docs/117-progress`).

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
- [x] T10b′ part 1 (the recordings) — reviewed 2026-11-23 (6dbb411..c08c575, fixes 73f1244..72f9246, 2cb6c2da0,
  d50d4c891; four rounds). Part 2 (the hosted plumbing) — reviewed 2026-11-23 (534fda0..61f121bfa, fixes
  14711a7bf..9bc53a9c1, 58ce12e43..ac1ee65f2, eb1944dd4..00dcbc17c, 29058c799..2885a7704; four review rounds, the
  last small wave checked by the controller: diff read, hosted-sittings and native-matrix 590/590). Nothing has run on
  a runner yet: the pilot (each sitting once, smallest form) follows 1149.
- [x] Main merged in 2026-11-23: M4 and #516 (4c922d067, `engineVersion` 0.3.0), #518 (0584604ca); merge-review fixes
  311d308c2 (the pending slot authoritative) and 28fd8d1f3; reviewed clean. The flip follows by merges 8e1cac60a,
  0b98a5a6f, with T11b's docs pass fad980e0d.
- [x] Ruling 1148 on the flip — reviewed 2026-11-23 (8f27f3ce8..29e514437, fixes 933bb4eaf..ae0c3dcb5,
  785ddac81..a56de43cc, 740bc18a1; approved in round 3). The flip is pushed at 740bc18a1 `[skip ci]`. Sitting F's
  live witness is still to come.
- [x] Ruling 1149 — reviewed 2026-11-23 (ad5e3485f..c0fa3438e merged e25cae656; the independent pass over
  00dcbc17c..e25cae656 found seven Important; fixes 0e0177ad2..e47177631 on `m5/1149b`, merged e144990f1).
- [x] The O0 fence scanner (18869e364, c720408ea) and pilot A's fixes: the engine stopped in setup and prepare, and
  runtime users matched by executable (e63ab95c5..92b13bb66); `incompleteCause` alert mapped to NO VERDICT and
  symmetric warm-ups (8dd641d2d, b6154d108, 336d1314e; ruling 1153). Pilot A ran clean on run 45224977505 at
  e144990f1.
- [x] T3b — reviewed 2026-11-23 (the hosted staged onboarding; fixes 205870d2c, 5fd641971 after three rounds; merged
  5f2c43724). No relaunch at stage (c)'s retry is NO VERDICT, never FAIL (a busy-refused relaunch and one never
  attempted leave the same record). It has not yet run on a runner.
- [x] T8e — reviewed 2026-11-23 (#258's `electron/frontmost/click.selection` and #259's `electron/frontmost/click.point`
  caret cells, judged in 'reading' mode, and ruling 1154's alert guard on the matrix; fixes 450dcbe2a..8e5d62f3e, two
  rounds; merged 3a7523da8). It has not yet run on a runner.
- [ ] The hosted geometry (rulings 1160, 1164): one guard and placement module for sittings A to D, the display mode
  set after the warm-ups, the cleanup's window list and mode, and #528's diagnostics. Then A and B re-run placed.
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
- 2026-11-23, T10b′ part 2: H0's readings cannot identify replayd's capture alert (no title, text or size were
  recorded), so the hosted hold is a bound (at most two UserNotificationCenter windows) and not an identification;
  the pilot records each such window's title presence and size so a later wave can narrow it.
- 2026-11-23, the main merge: M5's pending reader dropped a pending-slot bundle whose build equals approved.json's,
  which M4's re-signing under another identity produces; once M4's own pending clause was dropped in the merge, doctor
  lost that pending build (fixed, 311d308c2: the dedicated slot is authoritative, the hash exclusion is the legacy
  layout's only).
- 2026-11-23, the flip: a plain `cua install` builds cua's engine there (M4's install builds whatever the setting
  selects, and the flip selects cua's), so "no approved cua engine" is every Mac's first-run state between the flip's
  install and the first approve (ruling 1148). `scripts/accept/maws-features.mjs`'s literalVendor step assumed the
  default meant the vendor's host and breaks after the flip on a Mac with an approved engine (fixed under 1149: it
  pins the vendor engine and checks its attestation).

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
- 2026-11-23, T10b′ part 1 (6dbb41172..72f9246ea; detail in `docs/evidence/2026-11-23-own-native-engine/harness.md`):
  the matrix records front and key around each judged act and the activate step's own check (re-read up to four
  times 250 ms apart); an activation that does not take front and key skips every planned sample with that check
  (NO VERDICT, cause activation), and generic invalid is kept for setup failures the check does not explain. Speed
  samples read front and key at their own call boundaries. The engine's own error name crosses the REPL boundary as
  `cua/errorName` (`src/services/sky.mjs`, darwin `handleRpc`; per call; a finite name set in
  `src/services/engine/error-names.mjs` kept equal to the Swift sources by test); the vendor host's path is sound by
  construction and the pilot verifies it. Acceptance 3's keystroke witness runs in
  `textedit/background/click.element@finder` on both lanes; both probe gate failures are failed witnesses, not
  invalid. #485's oracle reads window order before and after every background cell, keeps an unread order unread,
  and needs the user's window present to prove the target stayed below; an unread order fails the row. The writer
  refuses contradictory rows. `finder/frontmost/typeText.typeSelect` now records cua's `typeUnconfirmed` and fails
  until a departure is declared for it (T13's disposition). `meta.desktopMode` is the constant `shared`;
  `meta.hosted` comes from the runner's environment.
- 2026-11-24, ruling 1219 (the design session, after pilot C-5), the Korean `r k`: the Korean pressKey rows
  (`chrome/korean/pressKey.rk`, `electron/korean/pressKey.rk`, and TextEdit's for consistency) are judged against
  ruling 1119's oracle, 가, on each engine, not cua against the vendor (`judgeCell`'s `expected`,
  `scripts/native-matrix/cell-verdict.mjs`; `summary.mjs` passes it for the Korean condition). cua reading 가 passes;
  the vendor settling stably on ㄱ fails the vendor and is no cua block: the row is listed under "What changes for a
  user" as a declared departure where cua is right (`oracleDepartures`). A Latin pressKey row keeps ruling 1119's rule
  (the engines must compose alike). Evidence, C-5: the vendor read ㄱ for Chrome's and Electron's Korean row, settled
  after 3 and 4 reads (614 and 663 ms), and 가 for TextEdit's; cua read 가 on all three at its first read. C-2's vendor
  read the same (ㄱ for Chrome and Electron, 가 for TextEdit; cua's lane was held by the alert guard there).
- 2026-11-23, ruling 1198 (the design session, after pilot C-2): sitting C gains a key-route diagnostic as its own
  last step, after the counted lanes (matrix, save-sheet) and their judges, never among judged cells. In C-2 the
  vendor's `pressKey("Escape")` closed TextEdit's Open panel (drawn by com.apple.appkit.xpc.openAndSavePanelService)
  and cua's did not. The static reading of the pinned vendor binary says the vendor posts keys with CGEventPostToPid to
  a pid found by walking the focused element's AXParent chain with the private `_AXUIElementGetActualPid`, switching to
  an ancestor's owner when it differs from the app's and its activation policy is prohibited; cua's engine posts to
  the app's focused element's public AXUIElementGetPid (`Input.swift:1014` keyboardTarget, then `postToPid`). The
  step (`scripts/hosted-sittings/key-route.mjs`) records, per engine through its own matrix lane (the `key-route`
  cell, `scripts/native-matrix/key-route-run.mjs`): the AX ancestor table (role, GetPid, ActualPid or "unavailable",
  the owner's activation policy and isFinishedLaunching), cua's keyboardTarget mirrored (the engine unchanged), the
  static reading's predicted pid, every public route to the panel's pid against ActualPid (the window list at the
  panel's frame and under its centre, the frontmost window's owner, runningApplications of the panel service, the
  AXWindow's and the focused window's GetPid, the system-wide focused element and application, the frontmost
  application), and one Escape watched by listen-only CGEventTapCreateForPid taps on TextEdit and the panel service
  (fields 40 and 41, which tap), with the panel's state after it read by the device. Input Monitoring is granted to
  the diagnostic's own tap app alone (`io.github.ssfskim.cua.key-route-tap`, a background-only app ad-hoc signed on
  the runner and launched through LaunchServices so it is its own responsible process), through the hosted kit's
  one TCC writer under O0 (`grantDiagnosticListen`); the engines' rows are read before and after and must not change.
  Its status is INFO and never C's verdict; a cleanup failure (the engines' rows changed or unread, a panel or tap
  left, TextEdit still running) is a FAIL naming each. Off a GitHub-hosted runner it refuses before it reads, builds,
  writes or opens anything. Each lane opens its own TextEdit, so the AX half is read once per lane, before its press
  (the brief's "once before the presses" read per engine), and the panel is opened afresh between the engines.
  After its review (same day): hosted-only at every entry point, not only the sitting step: `native-matrix.mjs cell
  key-route` refuses off a hosted macOS runner before it begins or writes anything and, on one, before any scene comes
  up unless the device attests this job's run (`meta.runner`); every device command (`key-route-device.mjs`) and the
  AX helper (`key-route.swift`, exit 3) refuse off it before any read, compile or Accessibility call; the tap app,
  which `open` launches without its caller's environment, runs only with a one-use admission (a fresh nonce in the
  run's `key-route/tap.admission`, at most 60 s old) the guarded launcher writes, and a hard deadline armed first. The
  Escape's attribution reads the taps' events inside the press's own device-clock window only (50 ms before, 500 ms
  after; the rest kept apart, uncounted), prints a pid field the event did not carry as "unavailable", never 0, and
  tells a tap that failed (not launched, not ready, no Input Monitoring, a tap not created, its log unread) from one
  that saw nothing. The AX half also names the selected ancestor, compares each route with it (`matchesSelected`) and
  marks a route it could not read as unread; the taps also watch the selected ancestor's pid when no other tap does.
  The panel is closed only on a reading that says it is gone (the device's after the Escape, or the AX cancel's own),
  and the cancel is tried whatever the reading before it did. A lane's missing result, put-back not held or approved
  home not cleaned (a refused lane aside) is a named failure. The engines' TCC rows are snapshotted losslessly (every
  column the access table has, compared as a multiset and with the columns). A grant column's change (service,
  client, client_type, auth_value, auth_reason, csreq, indirect_object_identifier and every column not named below), a
  row gained or lost and the column set changing stay a named FAIL; tccd's own bookkeeping moving alone
  (`TCC_BOOKKEEPING_COLUMNS` in `tcc.mjs`: last_modified, last_reminded, pid, pid_version, boot_uuid, from tccd's
  record of a row in the sitting-2 TCC stream) is recorded and never a failure, so tccd consulting an engine's row
  during the step cannot fail sitting C. After its re-review: the tap app checks RUNNER_ENVIRONMENT in its own
  process first, before it reads, removes or creates any file (the launcher passes it with `open --env`), and
  consumes its admission only once the admission held. The panel's absence is certified only when every candidate
  window's identifier (and frame) was read. key-route.json carries each lane's attributed capture (`capture`, the one
  the section renders) beside the taps' raw events (`rawEvents`), and a tap counts as live through the press only on
  its own stop line or a kill at the stop. The deadline is the earlier of the step's cap (60 min, provisional: under 45 the cua lane got 6 to 10 min once the grace held the real recovery bound) and the
  job's limit (M5_JOB_STARTED, 360 min) less 15 min for what C does after the step. A lane's grace after SIGTERM is
  sized to the recovery's own bound (`recoverBoundMs`, about 22 min) plus the step it is in and its close (about 29
  min in all). The final inventory's reader is compiled before any hold. A lane with too little time left is skipped
  before its hold, and the whole step is skipped before anything when its set-up and cleanup do not fit, each
  recorded, INFO. A lane past its bound (20 min, provisional) whose put-back and the final inventory confirm a clean
  device is INFO with `timedOut` recorded. The begin and preparation before the device's attestation stay where they
  are: they are the matrix's ordinary hold, put back, and every key-route act comes after the attestation.
- 2026-11-23, ruling 1197 (the design session, after pilot C-2): the pressKey row (`r k`) reads its field until it
  holds the expected text, has read the same for 500 ms, or 2 s have passed since the first read, 100 ms apart, in the
  same cell on both lanes (`scripts/native-matrix/unicode-plan.mjs` `settledFieldCheck`). The row's outcome adds
  `reads` and `settleMs` (the last read's time after the first). The expectation (rk under Latin, 가 under Korean),
  `judgePressKey` and every other Unicode row's single read (`fieldCheck`, which the probe cells' checks share) are
  unchanged; the judge compares fixed-string rows by hash only, so the new fields never decide a pair. C-2's vendor
  read ㄱ for Chrome's and Electron's Korean row and 가 for TextEdit's; the next run's `reads` and `settleMs` say
  whether the value was trailing or the keys composed otherwise.
- 2026-11-23, ruling 1196 (the design session, after pilot C-2), A: four judged frontmost cells on both lanes, each its
  own case on its own panel opening, placed by ruling 1195: `openPanel/frontmost/pressKey.escape` (the panel gone) and
  `typeText.search` (`CUAMATRIXPANEL` read back from the panel's search field), `savePanel/frontmost/pressKey.escape`
  (the sheet gone) and `typeText.name` (`CUAMATRIXNAME` read back from the name field, emptied by setValue first,
  never Return). The Save scene is a new target, `savePanel` on TextEdit: one untitled document (⌘N) for the run's
  savePanel cases, ⌘S opening the sheet per case, the document closed unsaved after them. It is in the inventory, the
  plan, the summary, the judge, the manifest and the venue's grounding; the engine is unchanged. B: the sheet
  variant's and #212's typing (`SHEET_TYPE_CELL`) goes into TextEdit's own untitled document before any ⌘S, its front
  window checked as that document first, so no panel exists when it fails: it is not the panel service's field. The
  cell now returns the read-back's length and hash and how it differs, its front window and a reason, and the row adds
  the device's front, key and top-window owner; the typed text is a capitalised dictionary sentence, since TextEdit's
  autocorrection rewrites a lower-case non-dictionary first word on a fresh image (already met in `scripts/accept`).
  Unproven offline; the next run's `outcome.typing` decides.
- 2026-11-23, ruling 1195 (the design session, after pilot C-2): the system centres the Open panel (520,162 880x448
  on the runner, over replayd's centred capture alerts) and ignores the frame setup writes to the autosave defaults,
  so every `openPanel/*/click.cancel` was refused by the alert guard and `meta.placement.panel` stayed empty: macOS 27
  lists the panel under TextEdit's pid, never the service's bundle the old placement looked for. Now, on a
  GitHub-hosted runner only, each opening's window (a TextEdit window new since before its key, or the service's) is
  moved into the strip (x 0-822, below the menu bar) by the harness's device side, `scripts/native-matrix/panel-ax.swift`
  (AXSize to the venue's panel frame, since 880 wide never fits the strip, then AXPosition), and read back from the
  window list into `meta.placement.panel`. A read-back outside the strip makes that opening's case NO VERDICT `venue`.
  Off hosted the helper refuses before any AX call and nothing moves. Each case has its own opening, so a case never
  inherits another's panel. The close, one rule on both lanes (`scripts/native-matrix/panels.mjs`): Escape, then the
  Cancel click, then the device's AX cancel (the Cancel button, else the window's AXCancel action; hosted only). When
  neither engine step closed it, that opening's rows lacking an invalid reason are NO VERDICT by the refusal's cause
  (else `invalid`), and the run goes on; only a panel still up after the device's cancel stops it (`PanelStuck`, every
  later sample recorded unrun). Each step and outcome is in `meta.panelCloses`. Off hosted the device cannot close it,
  so a panel neither engine step closed stops the run, as before. In C-2 cua's Escape ran unrefused and did not close
  the panel; its Cancel click was refused (beforeRow 74 and 76) and the run stopped at 518 of 571 rows.
- 2026-11-23, pilot C-2's other harness failures (the design session's item 3): every frontmost case now writes its
  timing row whatever its sample's fate (vendor `chrome/method.drag.select#1` was missing because an unprepared drag
  skipped it). The intervention rows read the window order up to 4 times, 250 ms apart, before saying TextEdit's
  window was not in front, and name the front app and the top window's owner. The per-context rows whose driven
  context read ABC after its reactivation are NO VERDICT `venue`: the preference read on and Korean was established,
  and the mini's holds read the same, so it is no engine's sample (they are out of every verdict anyway). The
  composition rows keep `invalid` (the condition held for the Electron field's group in C-2 and on the mini) and now
  name what the user's field read (`raw key`, `empty`, `other`, `unread`), also in the reading. Before each run step
  the sitting projects its finish from the measured runs (each family's mean, else all runs'); past 300 of the job's
  360 min the step's note, the log and sitting.md say so. Nothing is split.
- 2026-11-23, ruling 1189 (the design session, after pilot C, run 45299196290): a fresh hosted image enables U.S.
  alone, so every Latin and Korean selection in pilot C read the US layout back. All 230 input rows (the 5 probe-cell
  rows and the 225 unicode rows) were invalid. Setup gains an `input sources` step, after `textedit defaults`
  (`scripts/hosted-sittings/input-sources.mjs`, `input-sources.swift`). It enables com.apple.keylayout.ABC, then the
  Korean input method com.apple.inputmethod.Korean, then its mode com.apple.inputmethod.Korean.2SetKorean, through
  TISEnableInputSource, the call System Settings makes. The IDs were read from KoreanIM.app's KIM_Extension
  Info.plist (tsInputModeListKey) and from TISCreateInputSourceList on macOS 27. The step never writes the preference
  and never selects a source; it runs hosted only, behind `assertGithubHosted`, and restores nothing, since the VM is
  thrown away. Each source is read back in a fresh process after a 1 s settle, up to 3 reads: the sources a run
  selects must be listed by TIS's enabled list, enabled and selectable; the input method must be enabled. The
  preference's value (AppleEnabledInputSources) is recorded beside it and never judged. Both readings go into
  `venue.inputSources` and into sitting.md's venue section. A source that does not read back does not fail the
  sitting. It is named in `venue.inputSources.missing`; the device's `source state` passes it on (`venueMissing`);
  the run never selects it; and every row that selects it is NO VERDICT `venue`, naming it (probe cells: ABC; Latin:
  ABC; Korean: 2-Set; mid-switch, composition and per-context: both). It never runs under the US layout to be
  judged. `summary.mjs` counts `venue` per side in its NO VERDICT line.
- 2026-11-23, the input source after pilot C (run 45299196290) and ruling 1188 (the design session; detail in
  `docs/evidence/2026-11-23-own-native-engine/hosted.md`, "The input source"): matrix-vendor-1 ran its 571 rows and
  ended INCOMPLETE because the put-back could not restore the per-context preference, unset on a fresh runner, which
  the input sections had set off; both save-sheet lanes reused the saved record and failed the same way. Ruling 1181
  now covers it: "unset" is restorable. `scripts/native-matrix/hitoolbox.mjs` `unsetPerContext` reads the domain through
  cfprefsd (`defaults export`), removes only TextInputGlobalPropertyPerContextInput with plutil, and writes back only
  the one top-level key, AppleGlobalTextInputProperties (`defaults write <domain> <key> <XML>`, which keeps every
  value's type). It deletes that key only when the saved record says the dictionary was absent before the run
  (`perContextDict`) and nothing else is left in it. A record from before this change, with no `perContextDict`, leaves
  an empty dictionary. There is no domain import and no plist edit. The source and the preference are read back after
  a 1 s settle and written again where they differ, for at most 3 rounds (`RESTORE_SETTLE_MS`, `RESTORE_ROUNDS`, as
  Finder's keys). A value that will not hold fails, naming the preference, the owner's value (on, off or unset) and the
  exact command that sets it back; no System Settings toggle is named. A record left unrestored now refuses the next
  run's `begin`, naming the record, the owner's values and the commands, so no lane reuses it. Ruling 1188: every
  input-source selection and every HIToolbox write is hosted only (`assertGithubHosted`). That covers
  `writePerContext`, `unsetPerContext`, `launchProbe`'s `input-source <id>`, matrix-device's `source
  save|select|per-context` and `probe input-source`, `saveInputSource`, and the cursor sitting's selection, consent or
  not. Off a hosted runner the harness only reads. The matrix asks the device first (`source state`): its probe cells
  and the Latin and Korean conditions run when the owner's source and preference are theirs, and every other row is NO
  VERDICT `ownerInput`, its cause naming the preference and the value it needed. `summary.mjs` counts those per side.
  The live harness's input-source check and its paste check's Korean window are NO VERDICT the same way.
- 2026-11-23, ruling 1181 (the design session, accepting 6c62fa029 after pilot B, run 45285337366): pilot B's vendor
  lane passed, but its Finder take-down left a window of Finder's own: the first take-down closed the run's window and
  its down failed on ShowSidebar's read-back; the retry's teardown activated Finder (`open -a`) with no window on
  screen, Finder answered with a new window, the down then read `down: true`, and the cua lane's preflight refused that
  window. Fixed in 6c62fa029: Finder is never activated without the run's window on screen (`activateScene`; a window
  minimized or on another Space is refused, its cause named in the lane's problem, never skipped), no teardown steps
  once the run's window is gone, every Finder key read back after a 1 s settle and written again where Finder's late
  write undid it (a key that never reads back fails naming the owner's value and the command that sets it; the input
  source's restore names the per-context preference the same way), `down finder` false while a window new since the
  sitting began stands on screen, and B's cua lane needs the vendor lane. Accepted with conditions: the venue's
  TextEdit preferences stay unrestored while `assertGithubHosted` is the only way to write them (a test refuses each
  key off a runner). Corrected: "any window that is not the run's" cannot hold on the MacBook, where the owner keeps
  Finder windows the harness may not close or move. So the sitting takes one Finder snapshot before its first lane
  (repl-parity's approved `prepare`, `scenes-mac.mjs finder-baseline take`; removed by `cleanup-prepared`), and the
  preflight and `down finder` count only windows new since it, each named by number and frame
  (`scripts/repl-parity/finder-baseline.mjs`). A window is the snapshot's by its number, or, for one the owner closed
  and reopened (a new number), by exactly the frame of a snapshot window that is gone, each matched once; no title is
  read (CG titles need the Screen Recording grant, and a folder's name is the owner's). On a hosted runner the
  snapshot holds no window on screen, so B behaves as before. A driver with no sitting-level prepare (the goldens
  recorder, the matrix) has no snapshot and refuses every Finder window on screen, as before. Amended after the
  review of 055008501..7e5f1a1a3: the snapshot is bound to the sitting's `preparedAt` and the boot it was taken in, and
  read only when a native-mac lane names its sitting to `preflight` and `up` (`--finder-baseline`), so a stale file
  excuses nothing; a frame is lent only by a snapshot window Finder no longer has at all (a minimized, hidden or
  other-Space window keeps its number); and `down finder` judges by number alone against the windows Finder had at the
  scene's `up` (`finderBefore`). prepare saves its journal before taking the snapshot, and records it whole (numbers
  and frames).
- 2026-11-23, TextEdit's preferences reach the file it reads (the design session, after pilot A's re-run, run
  45277221729): vv-1's launch window stood again at 241,87 586x488, the frame every vv run reads, with
  NSRequiresOpenUntitledWindowAtLaunch NO in force, and its ⌘N document took 603x505 at 242,107, the default 75
  characters, though setup had read WidthInChars 60 back from the domain; warm.getScreenshot was refused under alert
  31. Read as two causes: the warm-ups end TextEdit by pid, so its saved application state restores their window at
  the next launch; and TextEdit is sandboxed, so it reads its container's plist, which `defaults write
  com.apple.TextEdit` from outside need not reach. Hosted only, in the `textedit defaults` step: (a)
  `ApplePersistenceIgnoreState YES` joins the writes (AppKit's restoration off; the parity scenes' launch argument
  already); (b) each key is read back from the domain and from
  `~/Library/Containers/com.apple.TextEdit/Data/Library/Preferences/com.apple.TextEdit`, written through that path
  when the container does not hold it, and only the container's read-back puts it in force (else the setup fails);
  the record keeps both read-backs and whether it was written through (`venue.textEdit.writes[].container`); the
  container is reached only through `/usr/bin/defaults`, which asks cfprefsd to do the file's I/O: no harness process
  opens, stats or removes anything under ~/Library/Containers, since that can raise App Data protection's dialog
  (`kTCCServiceSystemPolicyAppDataDetailed`, seen live on the mini,
  `docs/evidence/2026-10-17-own-sandbox/m0/mini-vendor-computer-superseded/README.md`), a window over the scenes nobody
  may answer; (c) after the writes, TextEdit's saved state outside its container
  (`~/Library/Saved Application State/com.apple.TextEdit.savedState`) is removed, recorded as removed, absent, or not
  removed with the error (`venue.textEdit.savedState`; a refused removal does not fail the step); the container's own
  saved state is left alone, and restoration off there rests on `ApplePersistenceIgnoreState YES`, read back from the
  container domain. The next A re-run proves it: setup's `textedit defaults` detail says how many keys were written
  through and whether the state was removed; vv-1's `meta.placement` must show no window at 241,87 586x488 at
  `setup.activate` (no restored window), and `setup.newDocument`'s window about 500 wide, not 603; sitting.md's
  read-back table shows both clear of x 830; and the sitting's screen at the end shows only the two capture alerts and
  no window beyond them, which is what shows the container's reads and writes raised no prompt.
- 2026-11-23, pilot B's TextEdit scene and the placement record (the design session, after pilot B, run 45274556933):
  the parity TextEdit document, the run's RTF opened as a file, stood at 213,78 627x877 on both sides (an opened RTF
  with no view size takes Letter's 612-point width plus a 15-point scroller; WidthInChars sizes new documents only),
  its right edge 840 over alert 31, and the guard refused textedit/action on both sides; sitting C's matrix brings it up
  the same way. Ruled: on a hosted runner the document carries TextEdit's own view size, `\vieww9600\viewh15840` (480
  x 792 pt; `venue.mjs` `TEXTEDIT_DOCUMENT_VIEW`), declared in the venue record (`venue.textEditDocument`: the view,
  the control words, each layout's sha256 as the mini and a runner write it) and its table (row `textedit document`,
  the cells resting on it, the wide page's hscroll among them), carried to the device in the runner record and
  inserted by `up textedit` after the font table; the mini's bytes are unchanged. Width: 242 (the furthest cascade
  origin read) + 30 (one more step) + 480 + 25 (padding and scroller) = 777, inside the strip's 822; height: Letter's
  792, which pilot B's 877-point window suggests TextEdit took unasked. The control words change the view size only:
  the patched file is the original with them inserted, and AppKit's `textutil` renders both to the same text and HTML
  in each layout (the text, the bold line's run, the font), which covers what every cell reads (the text area's value
  and valueMarkdown, the matrix's text fields, the typing read-back); `textutil -convert rtf` gives the view size back,
  so AppKit's reader takes it. Both hashes are in `test/native-goldens/PROVENANCE.md`. The placement record:
  `placeWindows` offered TextEdit's window to the frame probe, which moves Finder windows only, and recorded it
  `moved: true, readBack: null, matched: false`; now only Finder's windows are offered (`FRAME_PROBE_SCENES`), any other
  window under an alert is recorded where it was read, not moved, with why, and a probe move is `moved` only when its
  window read back elsewhere (`reason` when not matched). `sceneFrames` keeps every window where it was last read (its
  read-back, else where it was read), so the read-back table no longer drops a window whose move read nothing back.
  The vendor side's Electron key-window reading ("the scene window is not on screen" while the fixture's one window
  stood at 102,100 720x560 and held the focus): native-mac's guard target names the recorded window, and the reader
  looked for that number; on the vendor side it was not on screen at placement or at the action (only window 106 was
  listed for the fixture's pid, the cua side's recorded 164 was), so `up` had recorded a document-size window the
  fixture lists but never shows, as Chrome for Testing did in #187's slot (the record's number is not in the
  artifacts: deduced from the two readings). Fixed at both ends: the reader names the recorded window only for a
  shared process (`only`, Finder's) and reads a launched process at its frontmost window, as key-window.mjs's rule
  and the matrix already do; and Electron's `up` records the window on screen (`onScreenOnly`), as Chrome's does.
  Unproven until the next B and C runs: that TextEdit sizes the opened window from the view size; they must read the
  scene window about 505 wide (480 + padding and scroller) and about 877 high, its right edge left of 822, the same on
  both sides, with textedit/action sent, and every Electron action's ownKey read (`keyWindowRead`, no unread).
- 2026-11-23, #560 (the design session): the hosted venue's device-side read is not bound to the runner's VM, so
  #560 lands before the owner's sitting (O1 to O6), and until then the M5 harness never runs on the owner's MacBook or
  on the mini (Plan of Work, "The owner's sitting"). Every hosted-only write checks `RUNNER_ENVIRONMENT=github-hosted`
  itself at the point of writing, not the runner record alone; the audit and the checks it added are in
  `docs/evidence/2026-11-23-own-native-engine/hosted.md` (#560's paragraph).
- 2026-11-23, ruling 1168's cell after the #538 probe (the design session): the cell proves reach, not path. Blink's
  `DispatchSimulatedClick(kFromAccessibility)`, which Chromium's AXPress reaches, dispatches a trusted pointerdown
  (pointerId 1, `"mouse"`, button 0) on the node itself, so the pointerdown-only button counts cua's AXPress as it
  counts the vendor's posted click, on Chrome and on Electron alike. The cell measures what a user sees, whether such a
  button responds: both +1 closes #534 per 1168, citing the cell. The row carries cua's `cua/inputRoute` from `_meta`
  and the summary shows it, unjudged. No page fingerprint is added (no new fixture build hash, CSP hash or PROVENANCE
  change). A stricter #534 that judges the path was declined; the AX press's "virtual" pointerdown (react-aria's term)
  is #551 (P3, deferred). #534 closes only when the cell passes live on Chrome and Electron, citing C's run and the
  Blink source. Source and detail in `docs/evidence/2026-11-23-own-native-engine/gates/534.md`.
- 2026-11-23, TextEdit's launch window (the design session, after pilot A placed, run 45272465181): NO VERDICT
  `venue`, not a FAIL. The scratch document stood at 242,107 387x505 on both sides, but the untitled document AppKit
  opens at launch, which no cell acts on, stood at 241,87 586x488 on the runner's first TextEdit launch (vv-1, WidthInChars
  ignored) and at 213,78 387x505 on the next (vc-1). The key-window requirement was observed: 62 cells read, none
  refused, none unread. Ruled (a): the venue also writes `NSRequiresOpenUntitledWindowAtLaunch NO` to com.apple.TextEdit,
  hosted only, read back like the others (a bool reads back `0`), the same on both sides. It is the parity scenes'
  launch argument (`scripts/repl-parity/scenes-mac.mjs`), so the documents a run makes are TextEdit's only windows, and
  the strict frame rule stays and judges the windows the cells use. The A re-run proves it. If it disturbs the bind or
  NEW_DOCUMENT, fallback (b) applies without a further ruling: the launch window leaves the symmetry check, is still
  read back for alert overlap, and the record says so. Unproven: `open -a TextEdit` (setup.activate) is a reopen event,
  which AppKit may answer with an untitled document whatever the launch key says.
- 2026-11-23, the goldens' Electron recording (the design session): not re-recorded. Fixture build 1357256d7cf8 differs
  from the recording's 23c8b77691d0 only in a read-only accessibility record and two switches; with neither, its tree,
  window and page are the recording's, but the harness's `up` always passes `--cua-fixture-focus`, so a live Electron
  scene is key where the recording's was inactive. That is safe only while no live sitting reads the Electron recording
  as an expected value, which is enforced: every sitting step's controller-side process carries `CUA_LIVE_SITTING`,
  under which the goldens' readers refuse the Electron scene (`test/native-goldens/live-guard.mjs`); the unit suites a
  step runs (sitting D's accept-native `npm test`, which compares the recording with itself offline) drop it, and the
  device side reads no golden. A later cell that needs it live takes a hosted (English) re-record with it, run
  unmarked (its `goldens.mjs check` reads every scene). Detail in `test/native-goldens/PROVENANCE.md`.
- 2026-11-23, ruling 1168 (#534; the design session): sitting C gains `chrome/frontmost/click.pointerdown` and
  `electron/frontmost/click.pointerdown`. Each is a button whose only handler is `pointerdown`, sitting inline after
  Apply or "Fixture button" in matrix-only page variants (the shared page and fixture are unchanged, so sitting B and
  the goldens are untouched), clicked by element on both sides and judged on its counter rising by exactly one.
  Outcomes: the vendor +1 with cua 0 or +2 is worse, so C FAILs, no departure excuses it, and #534 goes to the design
  session as blocking #506; both +1 closes #534, citing the cell; any vendor count other than +1 is NO VERDICT
  (`reference`: "the reference side did not register the pointerdown"), since the vendor posts a real click and its
  miss means the scene is broken. There is no runtime visibility check: neither engine's observation carries
  element frames; the inline pair adds no page height, so it is inside the hosted Chrome frame by construction; and an unreachable
  button already lands in the named NO VERDICT, so an engine probe would only re-label it, which is not worth an
  engine version move. Detail in `docs/evidence/2026-11-23-own-native-engine/gates/534.md`.
- 2026-11-23, ruling 1169 (the design session, after pilot A's re-run, run 45252131587): the re-run proved the
  plumbing (the mode switch read back exactly with no prompt and held to the end; the guard refused vv-1's first
  capture unsent, and the chained runs and comparisons skipped, NO VERDICT). The alerts re-centred on the switch, to
  about x 830–1153, y 188–608, and the approved engine's `--probe window-frame` moves Finder windows only
  (WindowFrameProbe.swift's header). Placement is therefore: Chrome for Testing and the Electron fixture at launch
  (`--window-position`/`--window-size`, the BrowserWindow's frame; no Accessibility write), Chrome on hosted
  runners at 22,60 800×760 (1169's 800×600 taken as a ceiling on width: every alert lies at x ≥ 830, so the
  mini's height costs nothing and keeps the scene page inside its window, `NOT_APPLICABLE.chrome.scroll`'s reason; the
  design session accepted it); TextEdit by a hosted-only `defaults write` to its own preferences on the throwaway runner, the frame read
  back and a target still overlapping NO VERDICT alert; Finder by the existing probe at about 800×520 on hosted
  runners; the Open panel placed only if that needs no Accessibility write, else its cells NO VERDICT alert and
  counted. Extending the probe to other windows the harness launched stays with the design session, brought only if
  TextEdit's or the panel's placement fails live. Each hosted frame that differs from the mini's is a declared venue
  difference in the record (the frame, the alert geometry as the reason, the cells whose layout rests on it); a cell
  whose points or drag paths were grounded on the mini's frame is re-grounded on the hosted frame, never scaled, and
  reviewed with the module; both sides use the same frame in every run.
- 2026-11-23, rulings 1160 and 1164 (the design session, after the display probe, run 45233464944): both hosted
  images run at 1024×768 (mode 3) and offer 1920×1080 (mode 10) as their widest mode. At 1024×768 no scene can be
  placed clear of the alerts, and at 1920×1080 an alert re-centred with the display leaves Chrome's 1000×760 frame
  no room. So setup switches to mode 10 `.forSession` after the warm-ups, which raise the same alerts as before (one
  per copy, recorded) at 1024×768. The record holds the alert bounds before the switch, the mode read back, and the
  alert bounds read fresh after it; placement uses only the fresh bounds. A UNC window that appears after the
  warm-ups, or whose bounds change after the switch, is recorded, and a target it overlaps is NO VERDICT alert.
  Nothing is re-placed mid-run. If the alerts re-centre on the switch: no listed mode is about 2300 wide, so the
  fallback is a hosted Chrome frame of about 800×600. Narrowing the guard to front and key (option 3) needs the
  design session again, after the vendor's static gaps (0x1006f54b0, 0x101401098) are closed. The guard and
  placement are one module that sittings A, B, C and D all call (every pointer event, ruling 1154). The cleanup
  records the window list and the mode, so the alerts' survival and the mode's hold are shown.
- 2026-11-23, rulings 1153 and 1154 (the design session, after pilot A's second run; detail in
  `docs/evidence/2026-11-23-own-native-engine/hosted.md`, "Pilot A, run 45220897246"): a capture alert never closes on
  the hosted runner. It is covered by the next activation, so H0 (ii)'s 604 s and that run's "about 15 s" are the same
  alert, not two readings of its lifetime. Setup therefore warms each copy up with its first capture, symmetrically,
  on hosted runners only, outside every judged cell. It then waits at most 60 s, watch-only, for the alert to leave the
  front, and records each warm-up's alert and the time until it cleared. A run stopped with the alert in front
  (`incompleteCause` alert) is NO VERDICT, never FAIL, and is never retried. The coordinate guard, built with T8e,
  goes on every pointer event's location: drag down and up, double-click, and scroll. If the point is inside a
  UserNotificationCenter window's bounds, read fresh at that sample and the same on both sides, it refuses to send and
  records NO VERDICT alert. It also refuses when the alert holds the front, or the key for a keyboard cell. A screen
  or region capture that intersects the alert is NO VERDICT alert; window captures are exempt. Setup moves any scene
  window that overlaps an alert clear of it for both sides. NO VERDICT alert is counted per side and per cell. More
  than a few go to the design session before any verdict.
- 2026-11-23, pilot A's first run (the design session's steer): prepare refused "approved home in use", because
  approve leaves the approved engine running. Setup and prepare now stop it with `cua engine stop`, with no exception
  carved out for the engine. A home's users are matched by executable path under the home, not by argv, so the
  loopback ssh client and its shell no longer count (e63ab95c5..92b13bb66).
- 2026-11-23, ruling 1149 (the design session): "no lane reaches the fallback" is asserted in the runs, not only
  arranged: every parity, acceptance and hosted-sitting run checks the cua side's `_meta['cua/nativeEngine']`, and a
  cua side attesting the vendor's engine makes the row or run NO VERDICT naming that cause, never a pass. Accepted
  scoping (the controller's, confirmed): Linux's lanes keep the trusted worker's engine-process witness as their
  attestation (#171 owns that contract; the never-a-pass rule binds it); a lane with no NO VERDICT state complies by a
  refusal naming the cause; sittings A, B and C map a wrong-engine attestation to NO VERDICT in the hosted checks; the
  repl-parity selection lane keeps its oracle's FAIL, selection being what it judges. maws-features' literalVendor
  step pins `CUA_NATIVE_ENGINE=vendor` and checks the vendor attestation.
- 2026-11-23, ruling 1148 (the design session): build-on-install stays at the flip, and "no approved cua engine" is
  designed as the normal first-run state. With the vendor runtime present the session keeps the vendor engine and
  says so once per connection, on the first successful js or js_reset result (a text item after the runtime's own,
  and the same string in `_meta['cua/engineNotice']`), and doctor says the same: reason first (not built; build
  failed: <cause>; build <id> built, awaiting approve; a pending build below the minimum), then the remedy (approve,
  or `cua install --engine` then approve). Without the runtime the macOS lane refuses with the same reason and remedy.
  A failed build's install warning names the cause and what serves meanwhile, and the install succeeds. The line stays
  off judged and parity output. Built on `feat/117-m5-flip` only (the notice exists only where cua's engine is the
  default); its remedy function also serves launch.mjs's explicit `engine_not_installed` refusal, and the repl-parity
  selection lane asserts the notice.
- 2026-11-23, T10b′ part 2's review (the controller): the O0 authorization the TCC writer needs is pinned at
  preparation, not looked up by the writer. The workflow's pin step fetches the design spec at the entry's own commit
  (db775127652e; `decision_commit` may name a later one only if it is in that commit's history or reachable from a
  `docs/117-progress` tip this run fetched) into a run-owned file; the writer reads only that file, runs no git, and
  needs the entry as a bullet of its own inside `## Decision Log`, outside any code fence. The hosted guard
  (`RUNNER_ENVIRONMENT=github-hosted`, macOS) is checked before anything is read, proven by a spy that throws if the
  Decision Log is read off-host (ruling 1137). A sample taken while the capture alert held a key is NO VERDICT
  (`alert`) by its explicit hold mark, whatever a later reading shows (1141); a fixture whose cleanup the alert held is
  reset before the next sample or the run stops collecting, and that stop is NO VERDICT. Sitting exits follow the
  judge's codes: 0 PASS, 1 FAIL, 3 OWNER, 4 NO VERDICT, 5 INCOMPLETE; a pilot whose judges give only the expected NO
  VERDICT reads "PILOT COMPLETED WITHOUT ACCEPTANCE PROOF".
- 2026-11-23, main moved twice (the design session): #518 (#501, plugin 0.29.10, engine Fetch/StalePoint/Walk) is
  merged in after M4's merge, and so will #519 be; the plugin version stays main's and the next free one is taken only
  at the pull request.
- 2026-11-23, after M4 merged (d38630f9; the design session): origin/main is merged into `feat/117-m5` (no rebase),
  conflicts resolved by the logged merge notes, and every Decision Log entry from both sides kept (#502, #500 with
  #507, M4's block); `engineVersion` moves to 0.3.0 in that merge commit so the pilot tests the version that ships,
  the minimum staying 0.1.0 here and the flip raising it to 0.2.0; then `feat/117-m5` is merged into
  `feat/117-m5-flip` and T11b's docs get a manual pass against M4's text. The pilot: each sitting once in its smallest
  form at the merged head, on GitHub-hosted macOS, at most one hosted macOS run in flight, watched at 120 s or more;
  it reports each sitting's runner minutes and whether full C or D would exceed one job's 360-minute cap (if so, a
  split is proposed, not run). The TCC writer's guard is proven by a spy-store unit test (ruling 1137):
  RUNNER_ENVIRONMENT unset, not hosted, not macOS, or the O0 entry missing gives zero store calls; it never runs on
  this Mac. No replayd writes (1141). Every cell reports its NO VERDICT counts (1141) and shared limits (1144), and
  those counts go to the design session before anyone proposes loosening "every sample with a verdict".
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
