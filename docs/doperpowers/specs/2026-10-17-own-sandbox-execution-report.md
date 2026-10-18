# #115 own sandbox: execution report (final, 2026-10-18)

**Status: DONE.** All five milestones are merged into main. #115 and #135 are closed by PR #161.

- **Commit range:** 76c3b84 (main at dispatch) to b68bee6 (main after M4), 225 commits.
- **Spec:** `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`. Its Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective sections are the authoritative record. This report summarises them and adds what the spec does not hold.

## Milestones

| Milestone | PR | Merge | What it delivered |
|---|---|---|---|
| M0 | #153 | 90cbfe0 | Oracles and probes. The seatbelt golden generator, the signed CLI's argv capture, the app-server replay, fingerprints, the Linux XShm, app-launch and nesting probes, the GCE box, and the baselines and controls. |
| M1 | #156 | 73e787c | The policy model, the deny list and the seatbelt port. cua's own host on macOS. |
| M2 | #158 | 7e6976d | The compatibility executable for the macOS vendor host. CodexCLI.app leaves the macOS pin. |
| M3 | #160 | 108d49f (merge commit, so the attested SHA stays in history) | The Linux helper, built, attested and released as `linux-sandbox-rust-v0.163.0`, tag target da0c530. cua's own host on Linux, the confined Linux computer default, and the Linux vendor host retired. |
| M4 | #161 | b68bee6 | An explicit `cua install --prune-leftovers` and the session-sweep parent guard. The #138 switch, off. Docs, the frontmost key guard and plugin 0.15.0. |

Every milestone ran through subagent-driven execution: an opus executor at high effort, a task reviewer at the frontier, and reviewer-high on the PR's whole diff. Each merged after CI was green and the PR was MERGEABLE.

## Acceptance

The spec's acceptance 1 to 14 hold on both platforms, with three exceptions ruled by the dispatching session:

- **Latency (11).** All rows are inside the spec's limit.
  - **Linux:** the first cell is 50 to 70 ms slower, the cost of the confined kernel.
  - **macOS vendor host:** the cached first cell is about 60 ms slower, accepted on three runs. The likely cause is the compat's Node startup. The confirming runs were not taken because of #162.
  - **Own-host browser:** the cold rows are faster, by about 900 ms (miss) and 16 ms (hit).
- **#138 (13).** No sittings were run, and the line ships off. M0 measured no hangs without it, so no measurement could decide it.
- **The owner's TextEdit sitting.** Skipped. M4 does not touch the macOS computer route, M2's sitting proved it, and group B re-proved it read-only.

Final evidence is under `docs/evidence/2026-10-17-own-sandbox/m4/`:
- **Parity:** mini 479/479, 0 undeclared differences. Linux 493 cases at bf7739f, no difference beyond the declared ones.
- **own-sandbox:** 76/76 and 86/86 on the mini, 82/82 on GCE.
- **Prune:** demonstrated on both platforms.
- **Gates:** npm test 2867/0, test:mods 133/133, CI green.

## Rulings and departures

The Decision Log records these, with dates.
- Linux `default` mode denies `run/`. The kernel's cwd moves to `$CUA_HOME/kernel/<session>/`.
- Removal is explicit through the prune, never automatic at install, because of version skew.
- M4 was prepared on a branch cut from M3's head before #160 merged. Main was merged in afterwards.
- Acceptance 12 on Linux closed on a full suite at M3's final code. That run found the fixture HOME-layout defect.
- `compare --same-host` tolerates a `memoryBytes` difference under 0.1%.

## Residue for tickets

These are not yet tickets unless noted.
- **#162 (registered):** key routing. Native helper keys may reach the frontmost app. The harness guard stands in until #162 settles it.
- **The macOS vendor host's cached first cell (~60 ms):** pre-render the per-session profile in `buildLaunch`, so `cua-codex-compat` is an sh check plus exec. It is in tech-debt-tracker.md and was never measured.
- **The mini-rules frontmost regex** matches only `bundleID="…"`. Newer `lsappinfo` prints `"CFBundleIdentifier"="…"`.
- **`scripts/watch.mjs`** writes to a hardcoded M1 sitting log.
- **#157 (registered):** the M1 residue.
- **Debt in tech-debt-tracker.md:**
  - the locator waitfor race;
  - Linux helper startup (bwrap's namespace setup, the inner fork).
- **A native-suite connection closed once during `native/app/typetext` on Linux.** It was not reproduced, and the harness discards the connection's stderr.
- **The helper release's attestation names the feature branch.** A re-run from main is possible if policy wants a main-ref attestation.

## Resources

- GCE: `cua-gce` was deleted on 2026-10-18 after M4. The x64 smoke instance was deleted in M3. No cua-115 disks or instances remain in project ytdownload-505811.
- Mini: `~/cua-115` (about 11 GB, the approved runtime copy and scratch homes) was removed on 2026-10-18.
  - The pre-existing clone `~/Developer/GitHub/cua-parity` (created 2026-10-14 for #116) was left in place. Its HEAD was moved to 8782604 for M4's parity.
  - The resident checkout and agent were not touched.
- The mini's resident cua update and its prune belong to the dispatching session, coordinated with CI-opt. The order is: update the checkout and plugin, restart the shims, serve and agent with the owner present, then `cua install --prune-leftovers`.
- Local worktrees remain:
  - `/Users/new/Developer/GitHub/cua-wt-115` (the ledger under `.doperpowers/sde/`);
  - `-m4`;
  - `-m1runs`;
  - `-residue`.

## Friction routed around

- **The secret store's path.** The shell guard refuses command text that names it, so paths to it were built in code.
- **Shared-machine scheduling.** The mini's GUI groups ran only inside CI-opt holds and around MAWS's gates.
- **Releasing the hold without the executor's report.** In group B the mini executor went quiet after parity. The hold was released once nothing of ours ran on the mini, and the executor reported afterwards.
- **A closed Chrome window.** The owner's Chrome window had been closed before group B (15:31:52Z, by a click over Screen Sharing; #162), and parity waited until the dispatching session reopened it.
- **MacBook load (load averages up to about 200).** It made some local timing tests flaky. Each was rerun alone, and CI ran the full suite.
