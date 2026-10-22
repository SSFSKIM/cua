# M2b hold 4: harness proof, route A/B and one matrix pair

**Preparation only; not permission to access the mini.** This runbook starts at a fresh handover **after M4** in the combined hold. M4 changes `native/`, so its newly approved build is a **required parameter**, not the old build by default. No install, rebuild, onboarding, approval, signing, or runtime/surface changes are part of this runbook. M4 owns those and must finish first, pause, and hand over.

Purpose: collect the scoped live geometry/guard/recovery evidence for [#182](https://github.com/SSFSKIM/cua/issues/182) and [#183](https://github.com/SSFSKIM/cua/issues/183), run [#184](https://github.com/SSFSKIM/cua/issues/184)'s route A/B, and validate the harness end to end with **one paired matrix run, vendor then cua**, without weakening [#117's design](../../../specs/2026-10-18-own-native-engine-design.md). A valid product FAIL is useful evidence; incomplete or invalid proof is not a pass.

**Scope correction from the coordinator:** the triple is deferred to #117 M5's whole-verification-system sitting on the final build. Repeating it now on M4's intermediate build would add no information and push this hold past four hours. This hold can give M2b a second paired run, but it does not satisfy #184's three-runs-per-engine criterion. The issue's triple obligation remains open for M5; no pooling across builds or sittings.

**Final geometry ruling (supersedes the fallback):** use M4's approved-engine `UserProbe` window-frame operation, called by the harness through the existing live-device probe launcher after Finder chrome toggles. No standalone shell AX helper, shell Accessibility grant, or drag-resize choreography. The target bind frame is **920×520 at (80,80)**; prove it from recorded frames, never assume it from the requested placement. The exact final probe/build and its tests are readiness requirements below.

Sources checked on 2026-10-22: issue bodies #182–184 (`gh issue view 184 --comments` returned no text; its JSON body was read separately); [hold 3 README](hold3/README.md), [raw summary](hold3/summary-as-recorded.md), [lane log](hold3/lanes.txt), [lane-check script](hold3/lane-check.sh), and design Decision Log “M2b hold 3.” The earlier runbook is local-only at `/Users/new/Developer/GitHub/cua-117-m2b/.doperpowers/sde/2026-10-18-own-native-engine-design/m2b-hold3-runbook.md`. Its 0f6a95a2 references and original timing are obsolete. Hold 3's actual matrix lanes took about 25 minutes, not 17; it collected one paired run plus one unpaired repeat, not a triple.

## 1. Book the whole window and close readiness gaps first

**Reserve 116 minutes (1 h 56 min) from the post-M4 handover: 91 minutes scheduled work + 25 minutes protected abort/recovery reserve.** M4's time is additional. These are hard phase budgets, not guarantees that a failed phase can be repaired inside them. Do not compress lanes, remove rows, or spend cleanup reserve on diagnosis.

| Phase | Minutes | Cumulative end after handover | Required exit |
|---|---:|---:|---|
| 0. Fresh handover, independent posture/build checks, unit-proof receipts | 10 | T+10 | Same clean commit/build; admitted and uncontended |
| 1. Six-sample route A/B and review of its Finder binds | 8 | T+18 | Routes, effect, release, frame and non-interference recorded |
| 2. One native-mac pair and frame comparison | 12 | T+30 | Equal live Finder frames; mismatch remains invalid; clean teardown |
| 3. One matrix pair: vendor then cua | 52 | T+82 | Both COMPLETE, attested, put-back ok; fixed frame recorded at every bind |
| 4. Final cleanup, readings and release handoff | 9 | T+91 | Verified restoration or explicit unresolved recovery |
| Protected recovery contingency; no new measurements | 25 | **T+116 hard end** | Mini returned or unresolved state handed to owner |

The matrix pair budgets about 25 minutes per lane plus two minutes total for boundary checks/review. A slower lane consumes measurement slack, **not** protected cleanup time. Before starting the pair require its full 52 minutes plus 9 minutes closeout plus 25 minutes reserve remaining. Drop the whole pair if that condition fails; report harness validation missing. Before any other phase apply the analogous phase-budget + 34-minute check. Stop measurements by T+82; begin closeout earlier on any abort.

Why 25 minutes reserve (approximately 20 minutes requested, rounded up to cover the implemented bound): current `live-checks.mjs` exposes a single `recoverBoundMs` of 1,255,000 ms (20 min 55 s), including eight bounded put-back steps. The old 15-minute margin does not cover even that bound. Launch settlement or multiple journals can take more; this reserve is not a promise to resolve arbitrary recovery. If cleanup cannot finish by the booked end, tell the hold coordinator immediately and hand off the still-owned state; never release the machine as clean.

### Readiness blockers — resolve before booking/starting this segment

- The scoped #182 geometry/guard/evidence and #183 recovery fixes and their targeted non-live checks must be in the pinned clean commit, on both controller and device. Record the CI/test evidence. No live modification of code to rescue a result.
- M4 supplies the approved full build hash, commit, runtime and bundle paths, live grant status and a completed cleanup. If it cannot, stop here; do not reuse an older approval.
- M4's approved build must contain the final window-frame probe, and the pinned harness must call it after chrome toggles through its existing journaled probe launcher. Handover contract: arguments `--probe window-frame --pid n --window cgID --frame x,y,w,h`; result `{pid, window, requested, readBack, matched, exitStatus}`. This is a required implementation/API contract, **not a new operator command to improvise**. Require exact owned-window selection, checked readback and `matched` success, prompt-free use of existing engine trust, and refusal evidence/tests. The ordinary drivers perform placement; no extra sizing phase or shell TCC grant is scheduled. If implementation, tests, or trusted build are absent, stop before the hold.
- **No separate live proof helper or five-cycle smoke is scheduled.** The coordinator dropped those steps: ordinary A/B, native-mac and matrix work supplies live bind/frame/clean-put-back evidence. Foreign-obstruction and stale/failed-cleanup negatives are unit-proven only (§4), with passing test evidence required at handover. The branch must emit the bind frames and ordered guard snapshots from its normal drivers; if the metadata is absent, stop and report the evidence gap, not improvise a helper on the mini.
- The coordinator explicitly grants the post-M4 hold and its end time. A booking, this document, or a successful `--hold` gate is not that authorization.

## 2. Parameters and evidence layout

Use Bash on a **clean, detached controller checkout** at the final commit. Do not run from the editable worktree with this uncommitted runbook. Commands below are operator commands for the later authorized hold; none were executed while preparing this document.

```bash
# Required handover values: export these before the block.
: "${CONTROLLER:?clean detached controller checkout}"
: "${S:?full final commit SHA, same on controller and device}"
: "${BUILD:?full approved M4 build SHA-256 from handover}"
: "${H:?approved runtime absolute path on mini}"
: "${B:?approved cua Engine.app absolute path on mini}"
: "${O:?fresh absolute controller output directory outside checkout}"
: "${SITTING:?unique post-M4 sitting id, e.g. hold4-YYYYMMDD}"
cd "$CONTROLLER"
A=(--approved-runtime "$H" --approved-engine "$B")
R='/Users/new/Library/Caches/cua-harness/native-matrix'
test ! -e "$O" || { echo 'Output directory already exists; choose a fresh O' >&2; exit 1; }
mkdir -p "$O"
test "$(git rev-parse HEAD)" = "$S"
test -z "$(git status --porcelain)"
CHECKOUT_BUILD=$(node --input-type=module -e \
  'import {engineBuild} from "./src/runtime/engine-bundle.mjs"; console.log(engineBuild())')
test "$CHECKOUT_BUILD" = "$BUILD"
```

Stop on a failed check. Do not proceed merely because an interactive shell continued. `$O` must be new: never overwrite or merge a failed attempt's evidence. Device harness checkout remains `/Users/new/Developer/GitHub/cua-parity`, **not** the owner's `/Users/new/Developer/GitHub/cua` checkout. Device run/recovery directories are not reset to evade stale-journal refusal.

Historical build, **not this hold's default**: `0c363f8f4512b24891ce22af50f6515f99af4b008bee09770245de03b8c7e80d`. It would have remained the default only if M4 had not changed native code. No command accepts a `--build` option here: the pin is checked through checkout build, installed/approved facts and per-call attestations.

Keep outputs under `$O`: `handover/`, `route-ab/`, `native-mac/{vendor,cua}/`, `matrix/{vendor,cua}/`, plus `lanes.txt`, `cleanup.txt`, and raw comparison outputs. Keep aborted attempts in distinct subdirectories outside the matrix comparison roots. Archive later to `docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold4/`; keep device-private recovery records on the device, not in the archive.

## 3. Phase 0 and every lane boundary

At fresh handover independently establish all of the following; M4's earlier reading is not a substitute:

1. CI-opt hold still belongs to this sitting; runner idle, no `Runner.Worker`, load below the current mini-rule limit (5). Terminal is frontmost on the gate's two readings; no system prompt, no `SecurityAgent`, no `claude auth status` process. Leave the journal seat alone.
2. Controller/device commits and checkout cleanliness match `$S`. Fixture dependencies and compiled tools are already ready. Do not spend this segment doing M4 installation or fixing a build.
3. Read only `approved.json`'s **build field**, bundle `CUAEngineBuild`, computed checkout build, and public grant/approval status. They must agree with `$BUILD`; signature match is a boolean, never an identity dump. Matrix preflight and every lane's native-engine/helper attestations must corroborate them. A hash or grant mismatch aborts; no rebuild/approval fallback here.
4. Record initial front app **bundle id only**, input-source id and per-context preference, Finder's three chrome preference keys and visible state, and ownership-safe recovery/posture checks. The saved process identity remains device-local. Establish no unresolved prior recovery before measurements.
5. Before **and after every lane** (route A/B, native-mac and matrix), append UTC time, `uptime`, front-app bundle id, source/preference state, foreign-engine check, **5900 ESTABLISHED connection count**, and **`pgrep -P` results for every cua-shim pid**. Hold 3's `lane-check.sh` is the reference; do not run it unchanged because it writes into `/tmp/m2b-hold3`. The proof procedure must route these readings to this sitting's `lanes.txt`, and include the omitted per-context and `uptime` readings.
6. Screen Sharing's presence must be recorded even if idle. Nonzero 5900 connections or a changed count requires a fresh coordinator ruling about interference before continuing; no silent assumption that an observer is harmless. A shim child, foreign engine, unaccounted activation, prompt, owner interaction, missing/ambiguous posture read, or contention stops measurements. Do not kill someone else's process or disconnect their session.

Wrap each normal live controller command below in the existing gate (shown explicitly in each block): `node scripts/mini-rules.mjs gated --hold -- …`. `--hold` only ignores queued jobs under an existing CI-opt hold; it still checks the busy runner, load and front app. The per-lane readings above are additional. Emergency ownership-safe cleanup is not to be blocked just because the failed lane left a scene app frontmost.

No owner Chrome/Claude Desktop contents, window titles, accessibility values, screenshots or secrets may be inspected/exported. Use harness fixtures only. Never write `~/.config/cua/engine.json`, expose signing identity, click alerts/TCC, type passwords, or hide Terminal/Tailscale to bypass a guard. Use `/usr/bin/log` if a log command is needed, not the shell builtin.

## 4. What is live-proven, and what is unit-proven only

There is no independent five-open loop, artificial foreign-window exercise, recovery-journal injection, or new proof-helper CLI in this hold. The ordinary work below proves the positive paths:

- Every Finder bind in the route A/B and matrix lanes records its **actual frame and ordered guard snapshot**, after chrome setup and the approved-engine placement. Require every recorded bind frame to be `{x: 80, y: 80, width: 920, height: 520}` in the documented normalized coordinate system. Neither a single initial frame nor “the bind returned” is enough. Keep raw frames/ordered snapshots and the row/phase identity; log the count observed, do not claim five repeated opens without five actually recorded. The sidecar also includes setup/teardown activations: label those phases rather than misclassifying a pre-pin or restored-chrome frame as a bind frame. A mismatched readback is a failed live prerequisite, never an invitation to resize manually or relax the guard.
- Route A/B must get past its Finder bind and deliver all six valid sample records. All four hold-3 attempts stopped at bind, so passage here is meaningful.
- The vendor and cua matrix lanes must both end **COMPLETE with put-back ok**, with begin metadata and the retained run-scoped front record agreeing. This proves the clean begin/restore path end to end, not the negative recovery cases.
- The native-mac pair separately proves equal recorded Finder frames across its two lanes, the condition hold 3's diff correctly refused. Visible fixture-row coverage and Finder preference/chrome restoration are checked from the ordinary evidence; do not infer them from frame size alone. A mismatch remains invalid and leaves #182's geometry proof incomplete.

On any put-back failure, **first read the windows above the run's window before retrying**: pid, process name, layer and bounds only, no titles/text. Use the fixed driver's minimal ordered snapshot, obeying its stricter redaction for owner apps; do not dump a window list with titles or weaken its redaction. Preserve the raw failure. Do not assume another app caused it, hide owner apps, or manually resize to obtain a pass.

### Evidence locations and collection

Matrix and A/B `result.json` keep `meta.activationGuards`: `{scene, beforeRow, at, ok, reason?, windowOrder, framePin?}`. `framePin` is the setup probe's owned-window identity, requested frame, CG `readBack`, `matched` and `exitStatus`; retain it beside the bind's new CG reading to distinguish successful placement from later regrowth. `windowOrder` has `runWindowFound` and the ordered prefix through the run window, with `{ownerPid, ownerName, layer, number, bounds}` for allowed entries; Claude/Chrome entries carry **ownerName only**. Do not expand that redaction. Every Finder activation and every scene-activation refusal is also appended to device `<runDir>/activation-guards.jsonl`, preserving setup/teardown evidence that may be absent from matrix metadata.

After each completed/aborted lane, once its recovery has settled, collect that sidecar with the existing SSH file-read primitive. This reads only the driver's sanitized evidence, never an owner window. For example after the A/B:

```bash
ssh mini 'cat /Users/new/Library/Caches/cua-harness/native-matrix/activation-guards.jsonl' \
  > "$O/route-ab-activation-guards.jsonl"
```

Use distinct destinations after matrix vendor and cua (`matrix-vendor-activation-guards.jsonl`, `matrix-cua-activation-guards.jsonl`). Native-mac uses `/Users/new/Library/Caches/cua-harness/repl-parity-native-mac/activation-guards.jsonl`; collect after each lane into distinct native-mac destinations. Record the lane's start/end device timestamps: this append-only sidecar may include older entries, which must not be counted as this lane's proof. Never truncate it to remove inconvenient evidence. Missing sidecar or absent bind snapshots is a reporting gap, not silent success; retain the core result snapshots even if collection fails.

### Unit-proven, not live — required passing receipts at handover

The following are exact test names present on the fix branch while preparing this runbook. This author read the tests but did **not** execute the implementation suite. The parent executor must attach successful results at the final commit before these may be called proven. The negative cases use simulated/recorded window snapshots and recovery records; this hold does not repeat them live.

| Coverage | File and test name |
|---|---|
| Fixed frame after chrome toggles; mismatched probe proof refuses | `test/native-matrix/goldens-device.test.mjs`: `Finder frame probe pins after chrome toggles on every open and journals its CG read-back`; `Finder frame probe refuses ${problem} read-back without weakening setup` (clamped, wrong-window, unmatched, failed) |
| Coherent top-window reading; real obstruction still refused | `test/repl-parity/scenes-mac.test.mjs`: `Finder activation judges one ordered snapshot, not contradictory top and per-app reads`; `Finder refuses real ${ownerName} obstruction and reports only permitted owner metadata` (parameterized cases); `Finder missing window evidence never invents a foreign owner` |
| Correct bind/refusal diagnostics | Same file: `Finder bind and refusal evidence retain the ordered prefix through the run window only`; `test/native-matrix/run.test.mjs`: `the matrix retains bind and refusal guard snapshots in row-indexed evidence` |
| Failed cleanup blocks next begin, preserving original record | `test/native-matrix/live-device.test.mjs`: `begin: failed put-back retaining an old scene app refuses a new run without replacing its recovery record` |
| Stale/unreadable record blocks before side effects | Same file: `begin: stale ${file} (${contents}) refuses without parsing or adopting it` (parameterized cases); `begin: an unreadable front record path is unresolved recovery, not permission to replace it` |
| Clean begin/put-back agrees, allows next clean run | Same file: `begin: clean metadata and put-back use the saved front record, and successful cleanup permits a new begin` |
| Exited/replaced process and refused restoration remain safe | Same file: `begin: an exited or replaced saved process is never reactivated and its failed put-back blocks the next run`; `putBack: a refused activation keeps the recovery record even when the front reading still matches` |
| Scene-app safeguard | `test/repl-parity/scenes-mac.test.mjs`: `reactivate puts the owner's app back in front only while it runs as the same process and is not a scene app` |

Retain `test/repl-parity/native-mac-diff.test.mjs`'s deliberately-mismatched-frame receipt as well: `checkPair: a list-bearing scene read in two window frames is no pair; within 1 pt it is, and other scenes' frames do not decide`. These unit proofs do not justify claiming live foreign-obstruction or failed-cleanup injection success. If the original issue criteria require that stronger live proof, report the distinction explicitly rather than silently closing the gap.

## 5. Phase 1: route A/B before the matrix pair

After the required unit-proof receipts pass and the baseline is independently established:

```bash
node scripts/mini-rules.mjs gated --hold -- \
  node scripts/native-matrix.mjs cell route-ab --device mini \
  --host cua --engine cua "${A[@]}" --sitting "$SITTING" \
  --run-number 1 --runs 1 --run "$R" --out "$O/route-ab"
```

This cell already fixes **six** samples: `forced1, natural, forced1, natural, forced1, natural`. `--samples 6` is not how the A/B is selected. Do not add `--natural-only` to the primary proof. The harness alone enables the spike route forwarding; do not export it globally.

Verify all six rows, actual `inputRoute`, act/outcome timing, button press-count delta, focus before/after, user/top window, watcher coverage and activation counters. Forced samples must report route 1; natural samples must actually report route 3 for a 1-versus-3 conclusion. A natural choice of another route is evidence of that behavior, not proof of route 3.

Held-activation control is the hold-3 rule in `route-ab.mjs`: forced sample first, fresh fixture/connection; following a natural arm, target another app (the Finder user-window observation) to release the Electron hold, then require balanced become/resign counters and, if it activated, a subsequent resignation. Failure to prove release invalidates that sample and sends nothing. Do not replace release evidence with a sleep or assume the 120-second hold expired. Preserve counters and release verdicts even when the row fails.

Delivered means exactly one new button press first observed within **2,000 ms** from act end, not merely a successful RPC; late/absent/double effects remain failed. Report effect time separately from act time. Forced-route mismatch remains invalid. A separate `--natural-only` diagnostic can characterize natural routing only; it cannot fill the missing A/B and is not scheduled in this hold.

Decision rule carried from hold 3: forced 1 delivers 3/3 within 2 seconds under valid clean interference readings → evidence to remove element-click route 3 in a later change; route 1 fails while natural route 3 delivers → evidence to retain it as a measured departure; both fail → stop measurement and diagnose from evidence. If inconclusive, element-action route 3 remains explicitly unsettled. **No implementation or build change during this evidence collection.** `set_value`/`select_text` retain the recorded route-3 rule based on delivered selection/value evidence, and command-key chords stay; a button A/B does not decide those methods.

A valid forced-arm product failure is an intended possible result, not by itself a prerequisite abort. Missing release/route/fixture proof is a stop before the matrix pair. Apply the both-fail rule above.

## 6. Phase 2: native-mac geometry parity

Prepare once, then run both lanes on that one prepared sitting. The native-mac sitting is `preparedAt`; it does not accept matrix's `--sitting` flag.

```bash
node scripts/mini-rules.mjs gated --hold -- \
  node scripts/repl-parity.mjs prepare --device mini --commit "$S" "${A[@]}"
node scripts/mini-rules.mjs gated --hold -- \
  node scripts/repl-parity.mjs run --device mini "${A[@]}" \
  --suite native-mac --host vendor --engine vendor --out "$O/native-mac/vendor"
node scripts/mini-rules.mjs gated --hold -- \
  node scripts/repl-parity.mjs run --device mini "${A[@]}" \
  --suite native-mac --host cua --engine cua --out "$O/native-mac/cua"
node scripts/repl-parity.mjs diff "$O/native-mac/vendor" "$O/native-mac/cua" \
  --expected scripts/repl-parity/expected/native-mac.json > "$O/native-mac-diff.txt"
```

Check each command separately. Require identical recorded Finder frames/visible rows and complete cleanup; retain unrelated text/product differences without waiving them. A live placement/frame mismatch means the geometry prerequisite failed: preserve its invalid pair, stop before the expensive matrix pair, and report #182 residue. No manual sizing or repair/retry loop in this hold. The deliberately-mismatched-frame comparator refusal is **unit-proven, not live**; retain its passing test receipt from readiness. Do not mutate these live records to manufacture a negative result. A frame mismatch still invalidates the pair; never turn it into an expected-difference waiver.

## 7. Phase 3: one paired matrix run for harness validation

Run **one line at a time**, with §3 checks at both boundaries and result review before the next. Do not paste this as an unconditional batch. The two lanes are vendor host/vendor engine and cua host/cua engine, not comparison A's vendor host/cua engine.

```bash
# Pair 1: vendor → cua
node scripts/mini-rules.mjs gated --hold -- node scripts/native-matrix.mjs run \
  --device mini "${A[@]}" --host vendor --engine vendor --sitting "$SITTING" \
  --run-number 1 --runs 1 --samples 10 --run "$R" --out "$O/matrix/vendor"
node scripts/mini-rules.mjs gated --hold -- node scripts/native-matrix.mjs run \
  --device mini "${A[@]}" --host cua --engine cua --sitting "$SITTING" \
  --run-number 1 --runs 1 --samples 10 --run "$R" --out "$O/matrix/cua"
```

After each lane inspect its `run-N/result.json`: full plan/manifest, complete flag, engine + helper attestations, current commit/build/runtime, clean put-back, begin/restore-record agreement, all raw and judged invalid/failing rows. Read focus/top-window/non-interference coverage, watcher liveness and accounted activations. Required cells include background, launch, concurrent/sheet/intervention, Korean/Unicode and source/refocus checks; no narrowing by `--scene`/`--user`. Row counts alone do not prove completeness (hold 3's counts differed).

After the pair verify specifically that the scoped #182 geometry/guard and #183 recovery fixes remain live-correct, **record the actual Finder frame at each vendor and cua bind** (not just at scene creation) and require 920×520 at (80,80), Finder keys/chrome restore, the sheet's untitled document closes, post-refocus Korean readings and composing/perContext preconditions are explicit, midSwitch keeps its message, and refusals are judged by message. Report the formerly fixed background Electron/Chrome cells explicitly (Electron click.button/setValue.text/selectText.text @finder; Chrome setValue.name/pressKey.tab/selectText @textedit). Valid product failures remain FAIL; missing safety, validity, attestation or cleanup proof aborts. There are no runs 2 or 3 in this hold and no time for a repair/repeat loop.

No hold-3 cleanup counting override is inherited. A failed put-back cannot be recounted as a clean hold-4 lane. A later cleanup is recorded as recovery, not an edit to its raw result. Changed build, runtime or commit means a new sitting and paired evidence; never pool hold 3 or M4 rows into this one. M5 separately runs the final-build triple, alternating lane order V→C, C→V, V→C in its own full-verification runbook.

## 8. Phase 4: abort, cleanup and final handoff

On a stop condition, record the phase/time and first failure. For an in-flight controller lane, send one normal interrupt and allow its `finally` recovery to finish; do not SIGKILL, start another lane, or race a second cleanup against it. On a put-back failure take the minimal above-window diagnostic **before retrying** (§4). Preserve journal/attempt output. Tell the coordinator immediately when recovery needs intervention.

When no lane/recovery is still running, the existing explicit cleanup is:

```bash
node scripts/native-matrix.mjs cleanup --device mini --run "$R"
# If a failed matrix lane retained its controller preparation.json, use that exact file:
# node scripts/native-matrix.mjs cleanup --device mini --run "$R" --preparation <absolute-file>
# A retained native-mac preparation uses its own recovery, not the matrix journal:
# node scripts/native-matrix/goldens.mjs cleanup --device mini --preparation <absolute-file>
```

Use only files actually retained by the failed driver and belonging to this sitting. Do not run placeholder paths. After all recovery, compare to initial readings: engine stopped; no harness scene/Chrome for Testing or owned helper left; Finder windows, in-memory chrome and preference keys restored; source and per-context preference restored; saved front process correctly reactivated without launching another. If that process exited, preserve the safe refusal and report unresolved put-back rather than inventing success. Record final `uptime`, 5900/shim/foreign-engine readings and remaining journals. Leave M4's approved build installed; no switching builds on release.

The hold coordinator, not an optimistic exit code, accepts the return of the mini. Unresolved cleanup means no new lane, no journal deletion and no claim that the hold is clean.

## 9. After release: local-only judgment and reporting (10 minutes, outside hold)

```bash
node scripts/native-matrix.mjs compare "$O/matrix/vendor" "$O/matrix/cua" \
  --out "$O/matrix-comparison.md"
node scripts/native-matrix.mjs summary "$O/matrix/vendor" "$O/matrix/cua" \
  --out "$O/matrix-summary.md"
```

Preserve exit codes: compare PASS 0, FAIL 1, OWNER 3, NO VERDICT 4. **One pair cannot pass this triple comparator:** expect missing-proof findings (or FAIL when product/validity failures also exist), and report the separate harness-validation outcome without changing the acceptance gate. Do not let a later command overwrite the recorded exit of an earlier one. Include the raw verdict, judged verdict, complete counts per engine, paired run numbers, each invalid row/reason, each product failure, A/B six-row table (route/effect/release/interference), per-bind geometry table, unit-only negative guard/recovery receipts, cleanup evidence, deviations and all omitted proof. Copy only sanitized evidence; never export device-private front records or owner contents.

Deliver a findings comment to #184 and update #117's evidence and Decision Log through the authorized tracker/document workflow. #182/#183 close only on their own verified criteria and required unit/live receipts; a clean matrix pair alone does not prove geometry or negative cases that were not measured; #184's triple stays owed to M5 even if this limited hold completes; a later complete evidence collection can finish with an evidenced FAIL, whereas #117 acceptance cannot. This runbook does not pre-authorize those outcomes.

**Total operator budget:** 116 minutes reserved on the mini after M4, plus 10 minutes local reporting = **126 minutes**. No timing from this preparation is a measured hold-4 result.
