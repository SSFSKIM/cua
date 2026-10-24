# #117 M4 report: install, signing, permissions, docs

Spec: docs/doperpowers/specs/2026-10-18-own-native-engine-design.md (M4, Progress M4.1–M4.8; Decision Log entries from "M4 pre-flight" onward).
Branch feat/117-m4, from main d95261fb.
Executed by plan-executor for cua_repl#1ea561bc, 2026-10-22 to 2026-10-23. The coordinator ran the mini holds through CI-opt, the owner's sittings and the #184/#188 controller.

## Status

The code is reviewed clean and hosted-green at 19772dec, the native fix head; the later commits add only evidence. One proof is still owed before the PR merges: item 14, fresh onboarding, has to PASS with the owner on the final build (d0b2fa13). That sitting is about 15 owner minutes.

| Task | What | Review / proof |
|---|---|---|
| M4.1 | Install selection, `--engine`/`--engine-sign`, hosted bundle proof | clean; download-proof.json reader PASS |
| M4.2 | Item 14 split, #197 selection dependencies, bounded #196 cleanup | clean after the whole-milestone fix c44e3074; #196 stays open as follow-up |
| M4.3 | Permission flow (SR-only idle relaunch, actionable grant steps, foreground approve opt-in), docs and model rules, exact-window probe; plugin 0.18.0 | clean; hosted Swift 507/507 |
| M4.4 | First owner hold (acceptance 1, 8, 14) | live, below |
| M4.5 | Post-hold fix wave A–D | clean; hosted 39929507105 GREEN 6/6 |
| M4.6 | Finder frame identity refinement (positive non-AXWindow exclusion) | clean; RED 40005215402, GREEN 40006079045 |
| M4.7 | Item 14 capability-based redesign | clean; hosted Node 40010114247 GREEN |
| M4.8 | Size-convergence barrier and retained geometry trace (exit 6) | clean; RED 40011313379, GREEN 40012786009 (Swift 531/531) |

Final native build: d0b2fa133f4005e3f5fdb72e2ac7c96f5845f93550e1bd1a95879bb5a462513f, approved on the mini at 2026-10-23T20:33:19Z.

## Live results (mini, 2026-10-23)

Evidence is under `docs/evidence/2026-10-22-own-native-engine-m4/`. The #184/#188 controller evidence is under the coordinator's job directory; the residue is posted on #182, #184 and #188.

- **Acceptance 1:** engine PASS (01:33Z pre-step). doctor exit 1 comes only from scratch-home rows.
- **Acceptance 8, unattended retry at 18:21–18:27Z on 5d8148fb/cffaf9d8:** no assertion failed. Main suite 4210 pass/0 fail, clean clone 4175/0. The exact marker and synthetic-secret checks PASS, the secrets probe PASS (6 teardowns, 12 streams), items 4/11 PASS and item 13 PASS 19/19. Recorded BLOCKED only for an undeclared hosted-only skip, declared since in 0351f19c (reviewed; no live rerun needed), and the #196 TextEdit off-screen windows, disposed of by PID under the coordinator's ruling.
- **Item 14, first owner sitting (05:41Z, a14f6a60):** stages 1–7 PASS. "Intervention off" FAIL, and the compound check could not say why (fixed in M4.5-A).
- **Item 14, second sitting (09:36Z, cffaf9d8):** stages 1–7 and both owner observations PASS (no prompts). "Intervention off" FAIL again, now with its operands: after the relaunch, Input Monitoring read true with no IM row.
- **Permission control (19:01Z, owner, permission-only):** a warm AX-only process (pid 7129) read listen false; a cold AX-only process (pid 8156) read listen and post true with SR false and IM absent. So macOS grants event listening to a process that is AX-trusted at launch. The owner corrected one sample: at the "OFF" step IM was switched ON, so explicit-off against absent stays untested. Item 14 was redesigned (M4.7, Decision Log): live intervention-off is asserted only in the warm AX-only stage, and after recovery input is judged against the fresh process's observed capability.
- **Item 14, third sitting (20:16Z, 517fbfaa/248035dc):** timed out unanswered (the owner wasn't connected). BLOCKED, nothing changed. Owed on the final build.
- **#184/#188 controller (2f71911e on d0b2fa13, 21:24–22:52Z):**
  - The Finder frame pin was exact in all six opens, with the identity exclusion and the M4.8 barrier. The trace shows resize 996→520 converging in about 358 ms before the position write.
  - Route A/B gave 5 valid samples: forced route 1 543/470 ms, natural route 3 443/447/411 ms, all interference-clean. Sample 5 was invalid by a release-check defect in the harness (#184).
  - The #188 diagnostic had 5 valid arms.
  - The native-mac pair showed 0 unexpected differences.
  - Matrix pair: vendor 563 rows (397 ok, 88 invalid, 78 failed); cua 562 rows (444 ok, 90 invalid, 28 failed).

## What changed in the design (Decision Log)

- Item 14's live-negative-input acceptance is replaced by the capability-based check: with AX at launch, macOS makes "intervention off after relaunch" unreachable.
- The frame probe excludes entries whose role is positively not AXWindow, and refuses on unknown identity. It waits for the size to converge before the single position write (an ordering safeguard; exit 6 if the size never converges).
- Live evidence must keep operands and structured assertion detail. Acceptance runs use a structured reporter, not raw TAP.

## Residue (not M4's)

- #196 fixture cleanup (TextEdit off-screen windows): follow-up.
- #184: the release check must accept counters already balanced, and the verdict must not claim complete with an invalid sample. A third forced-route-1 sample is owed. The final-build triple belongs to M5.
- #188: the selection-sensitive focus predicate in the harness; the forced3/held3 activation-lifetime finding.
- #200: the route-3 guard does not cover the post-dispatch window (diagnosed; follow-up after M4).
- The +28 pt Finder growth on status-bar restoration is logged on #182; it is bounded and doesn't accumulate across pinned runs.
