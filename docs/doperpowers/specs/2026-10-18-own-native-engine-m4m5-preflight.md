# #117 M4 and M5 pre-flight: the macOS default switch

- Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`, cited as `S L<n>` at main b1b15484.
  Its Progress is reconciled on branch `docs/117-progress` (aeaaee32), which shifts lines after L75 by 8.
- M4's branch: `feat/117-m4` at a8c3bc1c (draft PR #211), cited as `M4:`. Its report is
  `docs/doperpowers/specs/2026-10-18-own-native-engine-m4-report.md` on that branch only.
- Shape precedent: `docs/doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md` (#171, flipped in #489).
- Base today: main b1b15484, plugin 0.29.1. `DEFAULT_NATIVE_ENGINES` is `{darwin: 'vendor', linux: 'cua'}`
  (`src/runtime/launch.mjs` L461).
- This pre-flight ran nothing live: no hosted run, no app launched, no Accessibility call, no board write. It read the
  repository, the branches, the tickets, the logs of one past hosted run and three non-secret files on the MacBook
  (§10).
- Venue rule used throughout (design ruling 1104): the mini is off limits. Every item is one of **hosted** (runs on a
  GitHub-hosted macOS runner as the tools stand), **hosted+** (hosted with a named change) or **MacBook** (the owner's
  MacBook with the owner present).
- Labels: `H0` is a feasibility spike on a hosted runner; `O<n>` are the owner's items (§5, one list); `T<n>` are the
  tasks of §8.
- **Revision 2 (2026-11-23).** The design session ruled on the first draft (ruling 1108). §1 keeps the questions as
  they were asked; "Rulings" after it gives the answers, and the later sections are edited where an answer changes
  them.
- **Revision 3 (2026-11-23).** Three things are folded: the owner's yes on TCC rows (ruling 1111), an adversarial
  review of revision 2 (d471260e: 8 P1 and 2 P2), and ruling 1116 on that review. "Rulings" lists where each finding
  landed. The largest changes: H0 runs in full and reports each witness on its own; if the vendor's helper cannot
  run on a runner, work stops and the design session gets the options before any MacBook time is booked (§5, §7);
  install stays pending-only; the matrix's judge gives no verdict without a valid vendor sample; every accepted gate
  has an executor and a closing condition (§6).

## 1. What the design session must rule on

Five rulings. Each has my recommendation; §2 gives the findings behind them.

| | Ruling | Recommendation |
|---|---|---|
| **R1** | **Where the vendor comparison runs, and whether a hosted runner's TCC database may be written.** Acceptance 5, 6, 7, 9 and items 12 and 13 of acceptance 8 need the vendor's engine running beside cua's. No hosted run has ever started the vendor's helper. It is launched as its own app (`com.openai.sky.CUAService`), so it does not inherit the runner's grants as the bare `cua-engine` does; it needs its own TCC rows. The spec forbids automation to edit TCC (S L249), a rule written for the owner's Macs | Allow TCC rows to be written on a GitHub-hosted runner only (the kit refuses unless `RUNNER_ENVIRONMENT=github-hosted`), and run **H0** first: one disposable kit that answers whether the vendor's helper and cua's bundle each come up granted there. If H0 passes, the whole verification system runs hosted and the owner's sitting is about an hour. If it fails for the vendor, the vendor comparison becomes one MacBook sitting (O8, 60 to 90 minutes of the machine). This needs the owner's yes, since the no-TCC-edit rule is theirs (O0) |
| **R2** | **#211: merge forward or re-cut.** | **Re-cut from main**, porting by task from a8c3bc1c, then close #211. Reasons in §3 |
| **R3** | **What the matrix must show on today's engine.** As written (S L225, L226, L242): every method equal or better than the vendor's outcome, non-interference 100%, three runs per side. The fix stream made cua refuse or answer unconfirmed in places where the vendor answers ok (the stale-point guard, `typeUnconfirmed`, `backgroundClickRefused` on a shared desktop). The judge will read those as worse | Keep the triple and the three points. Add a declared-departures file to the matrix's judge, one entry per departure citing its Decision Log entry, as the Linux gate declared its gaps (`SPEED_GAPS`, `deviations`). A row that differs and is not declared still fails. The device mode the matrix runs in (shared, the default) is stated in the report |
| **R4** | **What a Mac serves after a plugin update.** The engine's `engineVersion` has been `0.1.0` and its wire version `cua-engine-1` through about fifty-five engine changes, and the service checks the running engine only against the bundle on disk (`src/services/engine/client.mjs` L202–208). So a new plugin drives whatever engine a Mac approved last, silently. The MacBook's approved engine is the build of 2026-11-05 (§2, finding 5). After the flip that becomes every default session's engine | Take the Linux rule (#171 F5): the service names a minimum engine it drives; a default selection whose approved engine is older keeps the vendor's engine with a warning naming `cua install --engine`, until M6; an explicit selection of an older engine is refused. `engineVersion` moves with every engine change from here on, and `doctor` warns when the approved build is not this plugin's source. T9 builds it before the flip |
| **R5** | **Fresh onboarding (item 14).** It has never passed, in five or more owner sittings on the mini, and the owner paused it on 2026-10-28. On the MacBook it would mean removing and re-adding the owner's working engine grants (25 minutes) | Prove the staged behaviour on hosted by adding and removing the runner's TCC rows (needs R1's yes): no grants, Accessibility only, Screen Recording added, the relaunch. Drop the owner-run revocation from M5's gate and keep it as the check a new Mac's onboarding runs (O7, optional). If R1 is no, O7 is the only proof and I would still not gate the flip on it: the MacBook is already onboarded, and the flip changes nothing for a Mac with no engine (it keeps the vendor's with a warning) |

Two smaller points were put beside them, both in §7: the version numbers (M4 as 0.29.x, the flip as 0.30.0), and
committing hold 10's evidence, which today exists only in the coordinating session's job directory.

The table is kept as it was asked. Three of its statements were corrected later, and the later sections are the
plan: accept-native item 12 needs no vendor helper (only item 13 does); O8 is an option with a cost, not a booked
fallback; and R4's remedy is two steps, `cua install --engine` then `cua engine approve`.

## Rulings (1108, 2026-11-23)

| | Ruled | What it changes here |
|---|---|---|
| **R1** | **Answered: the owner said yes** (ruling 1111). Kits may write TCC rows on GitHub-hosted runners only, never on any Mac of the owner's. It is recorded in the spec's Decision Log (2026-11-23, "the owner: TCC rows may be written by kits on GitHub-hosted runners only"). A kit cites that entry where it writes and refuses unless `RUNNER_ENVIRONMENT=github-hosted` | H0 runs in full (§4), and the staged onboarding runs hosted (R5) |
| **R2** | **Re-cut**, as recommended. #211 is closed with a pointer to the new pull request, and its branch stays as the record | §3 stands |
| **R3** | **Accepted, with one limit.** A departure may be declared only where cua is more conservative than the vendor: cua refuses, or answers unconfirmed, where the vendor answered ok. Each cites its Decision Log entry and is listed on the owner's page under "what changes for a user". A departure where cua acts differently, or answers ok where the vendor refused, cannot be declared: it fails | The judge's rule in §7; T10 |
| **R4** | **Accepted: the Linux rule.** `engineVersion` moves with every engine change from now on. T9 lands before the flip, and O1 runs before the flip merges | §7, T9 |
| **R5** | **Accepted.** The staged onboarding is proven on hosted, R1 being yes. O7 is optional and does not gate | §4 item 8, §5, T3b |

The smaller points, all ruled:

- **Versions:** M4 as 0.29.x. Versions are allocated at merge (ruling 1111): the Linux engine's M6a also planned
  0.30.0, so whichever of M6a and the macOS flip lands first takes 0.30.0 and the other takes the next minor.
- **Hold 10's evidence** is committed in T7, after a check of every image and every log for the owner's windows, names
  and paths. The repository is public.
- **#184's route A/B is closed as overtaken**, and `CUA_ENGINE_SPIKE_ROUTE` is removed (T8).
- **#438 and #446 do not gate.** The gating list of §6 is accepted.
- **Hosted evidence is macOS 26's.** The owner's page says so, and O1 and O3 are the macOS 27 witnesses. If H0 finds a
  `macos-27` label, the sittings use it.

Process:

- M4's ports T1, T2, T5 and T7 and H0 started beside the adversarial review of revision 2.
- T8 to T14 waited for that review. It is folded here; the design session releases them.
- M4 lands as its own pull request once T1 to T7 are reviewed and green.

### The review of revision 2, and ruling 1116

The review's verdict was needs-attention; in the reviewer's judgment and the design session's, no finding changes a
ruling. Ruling 1116: all ten are folded as the reviewer framed them; findings 6 and 7 exactly as written. On findings
1 and 2 it adds a rule: **if the vendor's helper is not live on a runner, no MacBook hours are booked as the
fallback.** Work stops, and the design session gets the options with their costs:

- **(a)** the full A, B and C on the MacBook, both sides, as the judges require today;
- **(b)** cua's lanes hosted against the fixtures' ground truth, and a reduced vendor comparison on the MacBook under
  a declared change to the judge that the owner approves;
- **(c)** any other hosted route to a live vendor helper that H0's findings suggest.

The owner decides between (a) and (b) knowing the hours. Until H0 answers, §5 states both totals and books neither.

| # | Finding | Where it is folded |
|---|---|---|
| 1 | P1. A reduced matrix, or the vendor's lanes alone, on the MacBook cannot satisfy the judges: the matrix judge wants both full manifests, three runs per engine, one device and OS, and each pair in one sitting on one commit and one approved build (`scripts/native-matrix/summary.mjs` `proofProblems`) | §5 "If the vendor's helper is not live on a runner"; §7 "If H0 fails for the vendor". The reduced form survives only as option (b), which needs the owner's approval of a judge change |
| 2 | P1. A MacBook lane needs the approved engine of its own checkout first: even a vendor matrix lane calls `checkApprovedEngine` (`scripts/native-matrix/run.mjs` L248). And main has no MacBook device (`scripts/repl-parity/devices.mjs`: `mini` and `hosted-macos` only) | §5: O1 comes before every MacBook lane and repeats if the engine changes before the freeze. T10b: an owner-present MacBook transport and preflight, never the runner's SSH setup on the owner's account |
| 3 | P1. A working child relay qualifies neither the product's launch nor the probes, which the matrix starts as separate LaunchServices instances of the bundle (`scripts/native-matrix/live-device.mjs`, "The probe") | §4, H0: four witnesses recorded apart, with a routing for each that fails. A relay result never stands in for a product-launch result |
| 4 | P1. Sitting D's command could not pass: `--live-textedit` alone leaves item 6 BLOCKED, an unfiltered run includes the release gates (item 9), and the owner form of item 14 needs an operator | §7 sitting D: an exact, dependency-complete selection with both live flags and a temporary sentinel store. T3b: a hosted staged-behaviour driver, after T2 and T3 |
| 5 | P1. With no vendor helper on a runner, sitting D had no fallback: accept-native 13 needs six native calls through a newly started helper and refuses if another helper runs; item 12 makes no native call | §4 items 8 and 9; §5 O9. Item 12 stays hosted |
| 6 | P1. T1 as written turned an ordinary install into a permission request | §3 T1, §5 O1, T1, T9: install stops at a pending build; approval is the explicit `cua engine approve`; a test proves a plain install never starts approval |
| 7 | P1. The judge can answer `equal` with no valid vendor sample (`judgeMethod`) | §7 "The judge's rule", T10: a missing valid pair is NO VERDICT, never equal |
| 8 | P1. Accepted gates had no task: #212 with #218, #216, #258, #259 | §6 "Who closes each gate"; T8; T13 consumes the dispositions before the freeze; §5 O10 |
| 9 | P2. The matrix's focus reading does not send acceptance 3's keystroke | §4 item 3; T10 |
| 10 | P2. The owner's list lacked decisions the judge hands the owner, and the repeat of comparison A; acceptance 10 is M6's | §5 O5 and O11; §4's last row |

## 2. What the reading found

1. **M4 is entirely off main, and its venue is gone.** None of its deliverables landed (§3). Its live proof was taken
   on the mini on builds of 2026-10-23.
2. **M5's verification system last ran on 2026-10-23, and has never produced a passing or fully valid matrix run.**
   Hold 10 (build d0b2fa13) is the best run: one pair, FAIL as recorded, with 88 invalid rows on the vendor's lane and
   90 on cua's of about 563 (#184, 2026-10-23T22:54Z; `~/.claude/jobs/1ea561bc/tmp/117/hold10-20261023-184-188/
   matrix-summary.txt`). Expect harness work before any judged run.
3. **The engine has changed about fifty-five times since, and the vendor's engine was not run beside it after
   2026-11-01** (#187's slots on the MacBook; #258, #259). Every fix from #282 on was qualified main against fix.
4. **Hosted runs prove less than "the engine on a Mac".** A kit runs the bare `cua-engine` executable as a child of
   the job, under the runner's own grants. The image's TCC rows give Accessibility, Screen Recording and event posting
   to `/bin/bash` and the provisioner, and carry no Input Monitoring row (run 42137289452, macOS 26.6.2). Proven there:
   observation with screenshots, every input route, Korean 2-Set selected through TIS
   (`docs/evidence/2026-11-18-paste-readback/`), Chrome for Testing, Safari, Firefox, the Electron fixture, a MAWS
   build (`probe/389-maws`). Never exercised there: the signed bundle at the approved location, its launch through
   LaunchServices (`open -n -g -a`, where the bundle is its own TCC client), `cua engine approve`, cua's REPL host and
   sandbox around the service, and the vendor's helper. #175 asked this in October and was never answered.
5. **No Mac of the owner's holds an approved build of today's engine.** The MacBook's `approved.json` names build
   375d42a2, approved 2026-11-05T21:34Z, last used 2026-11-11 (`usage.json`'s time); main's source is build 6f874040.
   The mini's last approved build is d0b2fa13, from M4's branch on 2026-10-23. Nothing in the product notices (R4).
6. **Hosted runners are macOS 26; the owner's Macs are macOS 27.** M1b found Finder behaving differently on 27
   ("macOS 27 shows the status bar when ShowStatusBar is unset", #117's comment of 2026-10-21). Whether a `macos-27`
   runner label exists was not checked; H0 reads it.
7. **`cua install --engine` now means the Linux engine.** #171 gave the flag to Linux, and on macOS it is refused with
   "on macOS, cua engine build and cua engine approve install cua's engine" (`src/cli.mjs` L168). Yet the selection's
   refusal sentence on macOS tells the user to run `cua install --engine` (`launch.mjs` L503). M4's install task has
   to be redesigned around that, not merged.
8. **The MAWS acceptance scripts force a browser-only session** (`CUA_SHIM_SURFACES: 'browser'`,
   `scripts/accept/maws-features.mjs` L176, `maws-selection.mjs` L34). A browser-only session already runs on cua's
   own host. What the flip changes in MAWS is the session with both surfaces, which moves from the vendor's host to
   cua's. Neither script covers it today.

## 3. M4: its state, what counts, and the re-cut

**State.** Built and reviewed as M4.1 to M4.10, 2026-10-22 to 2026-10-24. Draft PR #211: 150 files, +12,647 −482; 89
commits ahead of main, 86 behind; CONFLICTING. By area: 7,006 lines of evidence, 2,757 of tests, 1,203 native (of
which the window-frame probe and its tests are about 1,090), 868 under `scripts/accept/`, and 170 in `src/`.

**What its proofs still show.**

| Proof | Still counts for | Does not count for |
|---|---|---|
| Hosted 40012786009, GREEN on 75c91234: Swift 531/531, the real release build, signature verified | That a hosted runner can build, ad hoc sign and verify the real bundle; the method is sound | Today's engine. The tree it tested no longer exists after any port. The re-cut head needs its own run |
| Mini, 2026-10-23: acceptance 1 PASS | That `doctor`'s engine row reads a really approved, really granted engine correctly. `doctor-engine.mjs` has changed little since | Acceptance 1 itself, which is stated for the release M5 ships (S L234). Re-read on the MacBook in O1, two minutes |
| Mini, 2026-10-23: acceptance 8, no assertion failure, two BLOCKED reasons declared or disposed of | The script's structure and its reporter (M4.5-C) | The engine: build cffaf9d8 is about fifty-five changes old. Re-run on the M5 head |
| Mini, hold 10: the Finder frame pin exact in six of six opens on d0b2fa13 | The probe's design (wait for the size to converge, then one position write), and that pinning stops the growth | Hosted runners, which are macOS 26 and fresh per job. Shown again in T5's pilot or not needed |
| Mini, 2026-10-23: the permission control (a process that is Accessibility-trusted at launch reads listen and post true with no Input Monitoring row) | An OS fact on macOS 27.0. It is why item 14 became capability-based (M4.7), and it predicts the intervention tap works on hosted, which a kit has seen once (`docs/evidence/2026-11-16-show-menu/`, a `userIntervened` row) | Nothing more |
| Item 14 | Stages 1 to 7 and both owner observations passed twice (05:41Z, 09:36Z) on builds of that day | A PASS. It has none (R5) |

**What M4 owes on today's main: all of it.** Checked against b1b15484:

- `cua install` for the macOS engine: absent (finding 7).
- The permission flow: `permissionsPending` carrying which permission, the Screen-Recording-only idle relaunch, the
  grant sentences naming "cua Engine", the "+" button and the bundle path, the foreground approve. Absent
  (`cua/permission` appears nowhere in `src/` or `native/engine/`).
- `accept-native`: no item 14, no dependency check for item selections (#197), no bounded fixture cleanup (#196).
- The hosted gate builds no bundle (`.github/ci-kit.yml` `engine-swift` builds and tests the package only).
- Docs: `docs/onboarding-new-mac.md` does not mention the engine; README has no install, signing or permission
  section for it (it has the cursor's and the configuration rows, from later tickets).
- The window-frame probe and PR #199's harness (the Finder pin, the recovery record): absent; #199 is open.

**Recommendation: re-cut.** A new branch from main, one task per group below, each copying the branch's new files and
hand-porting its changes to the files main also changed. Then #211 is closed with a pointer to the new PR, and its
branch stays as the record.

- The textual merge is small (29 conflict hunks in 16 files, by `git merge-tree`), but the semantic one is not:
  `src/services/engine/client.mjs` (6 hunks) and `Methods.swift` carry a month of fixes, and the install task collides
  with Linux's flag by meaning, not by text.
- Part of the branch serves a venue that is closed: the coordinator's current-state gates over a remote channel to
  the mini (M4.10) and the hold wiring. On the MacBook the owner is at the screen, so M4.10 has no use. A re-cut
  leaves it behind; a merge lands it. More than half of the branch's lines are the mini's evidence, which T7 keeps
  as a record.
- The reviews that cleared M4 (the last high review at 19772dec) attest a tree that will not exist after conflict
  resolution. Either route needs a fresh review; the re-cut gives it task-sized diffs against today's code.
- Either route lands as one squash, so no history is kept by merging.
- A merge would also bring the branch's Progress and its newest-first Decision Log entries into a spec whose Progress
  was just reconciled. The re-cut ports the M4 entries as a dated block.

What is ported, and from where:

| Task | Content | Source on `feat/117-m4` |
|---|---|---|
| T1 | Install on macOS: `cua install` builds and signs the engine when it is selected or asked, and **stops at a pending build**, as the design (S L210) and M4.1 do. It never approves: approval makes the prompting requests and a capture, and stays the explicit `cua engine approve`. `--engine-sign adhoc`; one meaning for `--engine` on both platforms; the selection's sentences corrected to name both steps | M4.1 (ced790b0, 43f28ab7, 24685bba; `src/cli.mjs` L224–236 there), with the flag reconciled for finding 7 |
| T2 | The permission flow | M4.3, M4.5-A (fda15024, 5d13a52e), the "contracts refresh" entry |
| T3 | `accept-native`: item 14 as the capability-based check, #197's dependencies, the structured reporter, #196's bounded cleanup; the owner-window flag kept, M4.10 left out | M4.2, M4.5-B and C, M4.7 (517fbfaa), M4.9 |
| T4 | The hosted gate builds, signs ad hoc and verifies the real bundle; the download proof | M4.1's hosted half, `scripts/sandbox-probe/` |
| T5 | The window-frame probe, with PR #199 landed beside it | M4.5-D, M4.6, M4.8 (75c91234); PR #199 (e7999797) |
| T6 | Docs: README (install, signing, permissions), `docs/onboarding-new-mac.md`, the macOS host rules in `src/mcp/surface.mjs`; written against today's README, not ported | M4.3's text as a draft only |
| T7 | Records: M4's Decision Log entries of 2026-10-22 to 2026-10-24 and its report, its evidence directory, and hold 10's evidence (§7) | docs only |

T5 is insurance: the Finder scene cost holds 4 to 9. On a fresh runner the window cannot have grown across earlier
runs, but one job that opens it many times adds 28 pt per open without the pin (#182, hold 9).

## 4. The acceptance items, mapped

"Vendor live" means the vendor's helper running with its grants on a runner. H0 finds out whether TCC rows make
that true. Where a row says "else", nothing is booked: the design session first gets the options of ruling 1116
(§5).

| Item (S L232–245) | Venue | The named change, or the owner's part |
|---|---|---|
| **1** `doctor --json`: selected `cua`, the bundle at the approved location, the identity matching, `build` equal to `approved.json`'s, three permissions true | **hosted+**, and **MacBook** for the real identity | Hosted: T1 and T4 give a pending ad hoc bundle at the approved location; the kit writes its TCC rows (R1) and runs `cua engine approve`; then the row is read. A relay that starts the bundle's executable as a child does not prove this item. MacBook, O1: the configured Apple Development identity, grants carried across a rebuild, macOS 27 |
| **2** `verify.mjs --engine cua --bind com.apple.TextEdit`: one approval, none on the second bind, only `cua-engine` and cua's Node | **hosted+**; **MacBook** for the plugin's hook | Hosted: the product path on a runner (H0). The harness answers the approval. MacBook, O2: the plugin's Elicitation hook answers it in the owner's Claude Code |
| **3** A background click in TextEdit with Finder frontmost; focus and selection stay Finder's; route not 4 | **hosted+** | The matrix on a runner (T10), with one witness added to the same click cell: after the click, a probe keystroke goes to Finder and its selection is read on a run-owned file, the document's value unchanged (S L238). Today the cell checks only that the selection collapsed, and the oracle samples window order and focus; neither sends the keystroke. The concurrent-use cell is not a substitute |
| **4** `typeText("한글 테스트 😀")` into TextEdit under the Latin and the Korean source | **hosted+** | The matrix's `acceptance4` rows (T10). The Korean source is selectable on a runner |
| **5** Comparisons A and C print PASS; the 10% beat on three rows, or the owner's parity decision | **hosted+** with vendor live; else ruling 1116's options | `native-baseline` through the loopback device `hosted.sh` already uses (it refuses `--device local`, L186), with the run's own install where it asks for an approved runtime and engine. The decision is #192 (O5) |
| **6** `native-mac` diff: 0 unexpected differences | **hosted+** with vendor live; else ruling 1116's options | The same device change. The expected file is re-declared in the pilot for what the fix stream changed on purpose |
| **7** The matrix summary: methods equal or better, finding elements, non-interference 100%, concurrent use, the two intervention cells | **hosted+** with vendor live; else ruling 1116's options | T10, with the judge's rule of §7: the declared departures as R3 was ruled, and no verdict for a row without a valid vendor sample. The dispositions of §6 |
| **8** `accept-native --engine cua` on a scratch home: items 1 to 8, 10, 11; items 12 and 13 on the vendor's engine; fresh onboarding | **hosted+**; item 13 needs vendor live, else **MacBook** (O9) | The headless subset already runs hosted (`sandbox-live`). The run takes an exact selection with both live flags (§7, sitting D): `--live-textedit` alone leaves item 6 BLOCKED, and the release gates (accept-native's own item 9) are not selected. Item 12 makes no native call and starts no helper, so it runs hosted whatever H0 finds. Item 13 makes six native calls through a helper it starts itself and refuses while another helper runs. The onboarding stages are driven on a runner by T3b, by adding and removing TCC rows. The owner-run form (O7) is optional and does not gate |
| **9** `CUA_NATIVE_ENGINE=vendor` still runs the vendor's engine and host, attested | **hosted+** with vendor live; else **MacBook** (O9) | It is what every macOS session does today. On the MacBook it is booked with item 13, not inferred from other vendor traffic |
| M5: the default shown live | **hosted** for the fallback rows; **hosted+** for the `cua` row | T11's default-selection mode, on the flip commit and on the one before |
| M5: the MAWS in-app browser on the own engine | **hosted+**; **MacBook** for the owner's real MAWS | T12: a both-surfaces mode in the two scripts; a MAWS built on the runner as `probe/389-maws` did. O4 |
| M5: the owner's own sitting; the hook observed | **MacBook** | O2, O3 |
| M5: the owner's decisions (speed misses, route-4 families, finding-elements parity, a self-activating launch family, the flip) | the owner | O5, O6 |
| **10** (after M6: no archive, no vendor rows) | not M5's | It is M6's item (S L245). It has no venue here on purpose |

**H0, the spike that decides the "vendor live" and "product path" rows.** One kit on a `probe/` branch, no product
change. The owner's yes is recorded (ruling 1111), so it runs in full. Where it writes a TCC row it cites the Decision
Log entry and refuses unless `RUNNER_ENVIRONMENT=github-hosted`.

1. cua's bundle with no rows: `cua engine build --sign adhoc` at the approved location, launched by `open -n -g -a`.
   Its `status` grants, and what an observation answers.
2. The vendor's helper with no rows: `cua install` of the pinned archive (as `sandbox-live` does), then a
   `CUA_NATIVE_ENGINE=vendor` session binding TextEdit. What it answers.
3. The child relay: a `cua serve` session on cua's own host whose relay starts the bundle's executable as a child of
   the job. One `getAXState` with a screenshot, one click. Whether the first capture raises replayd's confirmation
   with nobody to answer.
4. The four scenes brought up by `scenes-mac.mjs` over the loopback device; the display's size and scale.
5. Whether a `macos-27` runner label exists. If it does, the later steps and every sitting of §7 use it.
6. Does `tccd` honour a row the job writes (system and user database)?
7. cua's approved launch, with rows for `io.github.ssfskim.cua.engine`: its grants after a relaunch, `cua engine
   approve` with nobody at a console, then step 3's session through the product's own launch.
8. The probes, with the same rows: the bundle's `--probe focus`, its HID poster and its activation watcher, each
   started as the matrix starts it, as its own LaunchServices instance of the approved bundle. They do not inherit a
   child's grants, so step 3 says nothing about them.
9. The vendor's helper with rows for `com.openai.sky.CUAService`: one observation, one click.
10. Whether the onboarding stages can be set by rows: none, Accessibility only, Screen Recording added. This tests
    that the rows can be set and read; it does not qualify the relaunch flow, which is not ported yet (T2, then T3b).

H0 reports four witnesses, each on its own, and one never stands in for another:

| Witness | Steps | If it fails |
|---|---|---|
| **Child**: the engine as the job's child, through cua's host | 3 | Nothing in §7 runs hosted. Reported to the design session as blocked |
| **Approved launch**: the bundle launched by the product, granted by rows, approved | 6, 7 | Acceptance 1's hosted form, 2 and 8's live items have no hosted proof. Their witnesses go to the owner's sitting (O1, O2), or the gate is reported blocked. A child-relay result is not substituted |
| **Probes**: focus, post and watch as LaunchServices instances | 8 | The matrix cannot run on a runner, with or without the vendor: its oracles are these probes. Reported to the design session with the vendor's result; the options of ruling 1116 then cover cua's lanes too |
| **Vendor**: the helper granted by rows | 9 | Work stops. The design session gets options (a), (b) and (c) with their costs (§5). Nothing on the MacBook is booked |

Every combination is reported as it falls, including the vendor passing while cua's approved launch fails.

## 5. The owner's items, in one list

One list. O0 is done. O1 to O6 are the sitting every outcome needs. O7, O10 and O11 are conditional. O8a, O8b, O9
and O12 exist only if the vendor's helper is not live on a runner, and **are not booked**: they are the costs of the
options the design session would bring to the owner (ruling 1116).

**Order.** O1 comes first, before any MacBook lane: every lane there, a vendor lane included, refuses an approved
engine that is not its checkout's build. If a later fix changes the engine before the freeze, O1 is repeated at the
new head before the next lane. Hosted evidence is macOS 26's unless H0 finds a `macos-27` label, so O1 and O3 are the
witnesses for macOS 27, which the owner's Macs run.

| | What | When | Minutes | What it proves that hosted cannot |
|---|---|---|---|---|
| **O0** | May a kit write TCC rows on a GitHub-hosted runner, never on a Mac of the owner's? | **Answered yes** (ruling 1111; Decision Log, 2026-11-23) | done | – |
| **O1** | Build, then approve, the engine on the MacBook, at the head the next MacBook lane runs: `cua install --engine` (or `cua engine build`), which stops at a pending build, then **`cua engine approve`**, the explicit step that asks for the grants and takes a capture. The owner answers a keychain or capture prompt if one appears. Then `doctor --json`'s engine row is read | First in the sitting, and before the flip merges (R4) | 5 to 10; 5 more for each repeat | The owner's signing identity; the three grants carried across a rebuild on macOS 27; the LaunchServices launch; acceptance 1 as written. It also ends finding 5 |
| **O2** | In the owner's Claude Code, with the engine selected: bind TextEdit, act once, bind again | Always | 5 | The plugin's Elicitation hook answering the approval in a real session (S L237, L289) |
| **O3** | The owner drives apps of their choice on both engines and judges breadth | Always | 20 | The owner's apps and judgement, on macOS 27. Their dogfood so far ran the build of 2026-11-05 (finding 5) |
| **O4** | In the owner's running MAWS: a session with both surfaces on the own engine; `maws-features.mjs` against that session's socket | Always | 10 | The real MAWS build and its Browser panel on macOS 27, beside the scripted run on a runner |
| **O5** | The decisions the report hands the owner, each recorded before O6: missed speed beats (#192); any route-4 family; **finding-elements parity**, if the judge returns it; **a family whose app activates itself at launch**, if one is recorded (S L225, L226; `summary.mjs`'s owner list) | Always for speed; the rest only if the report raises them | 5 to 10; 5 more with both conditional ones | The owner's calls |
| **O6** | The go for the flip | After O5 | with O5 | The owner's word, as on Linux |
| **O7** | Fresh onboarding, owner-run: the owner removes cua Engine from the three privacy panes and re-adds it as the script asks | Optional; it does not gate (R5) | 25 | That a person can onboard a Mac from the docs, with real prompts |
| **O10** | A repro in the owner's MAWS of #216 (approval lost across apps), or of #212 (the save sheet) | Only if T8's hosted repro cannot reach the report (§6) | 15 each | The owner's MAWS, where both were reported |
| **O11** | Comparison A repeated on the MacBook: three runs of the vendor's engine and three of cua's on the vendor's host, with the harness's preparation and put-back. It needs T10b and O1 at the judged head | Only if sitting A's verdict is marginal on a runner | 30 | The speed rows on the owner's hardware, not a runner's virtual machine |
| **O8a** (option a) | Both sides of sittings A, B and C on the MacBook, at the frozen head, as the judges require: three runs a lane for the comparisons, the `native-mac` pair, and the full matrix three times per engine. The owner closes TextEdit, Finder windows and Chrome for Testing, ends every cua session, stays reachable for prompts and does not use the machine. The judge needs each pair in one sitting on one commit and build, and one device and OS over all, so it can be taken as three appointments of a pair each | **Not booked.** Only under option (a) | A: 60. B: 15. C: 180 to 210 (a full lane takes 24 to 35, holds 3 and 10). Preparation and put-back: 15. **270 to 300** | The vendor's engine beside cua's on one real Mac, in the form today's judges accept |
| **O8b** (option b) | cua's lanes on a runner against the fixtures' ground truth, and a reduced vendor comparison on the MacBook: comparisons A and C at three runs a lane, and the matrix's speed, finding-elements and background cells three times per side. It cannot satisfy today's judges. It needs a declared change to the judge, which the owner approves first | **Not booked.** Only under option (b) | The judge change's approval: 5. The sitting: **60 to 90** | The vendor's engine beside cua's on one real Mac, in a form the judges accept only after the change |
| **O9** (either option) | accept-native item 13 and acceptance 9's vendor attestation: six native calls through a helper the run starts, in the account's home with a scratch configuration directory. The run first checks that no vendor helper is alive, before any other vendor work, and stops if one is, never disturbing another installation's. The new copy may raise the capture confirmation, which the owner answers | **Not booked.** Under option (a) or (b) | 15 | The compat route and the vendor's attestation on a real helper |
| **O12** (either option) | The MacBook pilot: the MacBook lanes once in their smallest form before the freeze, after an O1 at the pilot's head | **Not booked.** Under option (a) or (b), before the freeze | 30, and O1's repeat | That the MacBook lanes run before the judged ones |

**If the vendor's helper is not live on a runner.** Work stops and the design session brings the options (ruling
1116). O8a, O8b, O9 and O12 above are their owner costs, so the choice is made knowing the hours. None is booked.

**The totals, neither booked.**

- **H0 passes for all four witnesses:** O1 to O6, one sitting of **about 55 to 60 minutes**. With every conditional
  item (O5's two extra decisions, O10 twice, O11) it is up to 2 hours. O7 would add 25 minutes.
- **The vendor's helper is not live on a runner:**
  - with option (a), **about 6.5 to 7 hours**: the base sitting, O12 with its O1, one repeat of O1, O8a and O9;
  - with option (b), **about 3 to 3.5 hours**: the base sitting, O12 with its O1, one repeat of O1, O8b and O9;
  - option (c) costs the owner nothing more if it works.

If a MacBook lane runs at all, T5 is required: the MacBook's Finder keeps its geometry between runs.

## 6. The open tickets

**Gate the switch.** Each needs a fix, a ruling or a measured close before the flip. The list is accepted (ruling
1108).

| Ticket | Why | What closes it |
|---|---|---|
| #192 (needs-human) | The owner's fork on missed speed beats is part of acceptance 5 | O5, after the triple |
| #184 | The triple and the route comparison are M5's own proof | The triple: the judged run (sitting C). The route A/B: **closed as overtaken** (ruling 1108), since the routes it compared were rebuilt by #200, #282 and #453 to #463; T8 removes `CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell |
| #186 (P1) | midSwitch's entered count is one short in 3 of 6 samples, so a model resuming types a character twice. It is a judged row | A fix; it is small |
| #185 (P1) | Every per-context row is invalid. The matrix cannot judge what it cannot set up | A design for the condition, or a ruling that declares those rows out with the cause |
| #189 | The expected file says `rk`; every scene composes 가 under an engaged Korean source | A ruling on the expectation. No engine change is implied |
| #190 | The notText refusal sentence differs from the expected one | Fix the sentence or the expectation |
| #420 (P2) | `type_text` drops an emoji in Chromium apps. The Unicode matrix types `😀 이모지` into the Chrome page and the Electron field (S L227) | A fix (the paste route for a character outside the BMP). If the vendor drops it too the row is equal, not a departure; a dropped character is not a refusal, so it cannot be declared (R3) |
| #258, #259 (P1) | Two recorded differences from the vendor that a model meets: an element click keeps a text field's selection, and a coordinate click landed a line low in the Electron fixture | A disposition each, written down (below). #259's last reading landed on target (2026-11-05); #283, #313 and #324 changed #258's ground. Either difference, if it still shows, is cua acting differently from the vendor, which R3 does not let anyone declare: it is fixed |
| #212 with PR #218, #216 (P1) | A safety report (a save sheet completing across an intervention) and an approval-loss report from MAWS, both on cua's engine and host. The flip makes that path every session's | A disposition each, written down (below): landed, reproduced and fixed on today's main, or ruled not reproducible by the design session on stated evidence |
| #485 | A refused background click can leave the target's window above the person's (ruling 1069 counts that as a failure) | It gates only if the matrix's non-interference cells meet it; the oracle reads the window order |
| #493 (landed, PR #498, main 435420cc) | It changes the MAWS first-use path and adds cases to both MAWS scripts | It lands before T12 |
| #500 (P1, ruling 1131) | The screenshot decoder records a CFNull label slot as absent, not unknown (against ruling 1083). On main it gives a wrong press in #453's overlay row identity and a wrong keep in #431's twin search | Its own lane: the null set in the observation, a like-with-like label comparison, a value-free null-slot counter, and one hosted measuring run before its PR |
| #501 (P1, ruling 1131) | A CFNull AXSubrole classifies as none, so a text field is not presumed secure and a secret can be typed into it as into an ordinary field (#405 fails open); a CFNull AXRole records as known | Its own lane after #500: a null subrole is unread, an unread subrole on a text field presumes secure, and a null role records as unknown |
| #502 (P1, ruling 1132) | `swift build -c release` of the engine crashes the compiler on Xcode 27.2 (CopyPropagation, `popUpAwaitOpen`), so `cua engine build` and `cua install --engine` fail on the owner's MacBook | O1 cannot start without it. A fix on its own lane: a restructure in preference to `@_optimize(none)` |
| #182, #183 with PR #199 | The Finder pin and the recovery record | T5 |

**Who closes each gate.** A green matrix or a green MAWS session does not close a specific report, so each gate has
an executor, a witness and a closing condition. Each disposition is one file under
`docs/evidence/<date>-own-native-engine/gates/`, and T13 does not freeze the head until every one exists.

| Gate | Task | Witness | Closed when |
|---|---|---|---|
| #186 | T8a | A unit case at the switch boundary, and the matrix's midSwitch rows on a runner | The entered count equals the field's committed prefix in every sample |
| #190 | T8a | The notText row on a runner | The sentence and the expected file agree, by whichever is corrected |
| #420 | T8a | The emoji rows in the Chrome page and the Electron field on a runner | The text lands exactly on cua |
| #189, #185 | T8b | The design session's ruling on each, then the expected file and the harness as ruled | The Korean rows and the per-context rows are valid and judged, or ruled out with the cause in the Decision Log |
| #184's A/B | T8b | The removal's diff | `CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell are gone, and the ticket's A/B part is closed as overtaken |
| #212 with PR #218 | T8c | #218 re-cut on today's main with its tests; one hosted cell: a save sheet open, `setValue` on its name field, a probe keystroke during the action | The answer says what may have taken effect, and the engine is shown not to commit the sheet; or the design session rules it not reproducible on that evidence |
| #216 | T8d | A hosted session with both surfaces: one app approved, a second declined, the first bound again in the same connection, then across `end_task` and new tasks, twenty cycles. O10 if a runner cannot reach it | Reproduced and fixed; or not reproduced in the twenty cycles and in O10, and ruled closed |
| #258, #259 | T8e | One cell each on a runner beside the vendor, reading the selection or the caret's offset back; if the vendor is not live there, the same cell in the first MacBook lane | Equal to the vendor's, or fixed. Neither can be declared |
| #485 | T10 | The non-interference oracle reading window order in every background cell | No background cell leaves the target above the person's window; if one does, the ticket is fixed before the freeze |
| #192 | T14 | Sitting A's and C's speed rows | O5 |
| #184's triple | T13 | Sitting C | Three valid pairs judged |
| #493 | its own lane | Its pull request | Landed before T12 (done: PR #498, main 435420cc) |
| #500 | its own lane | Observation-side unit tests per consumer, which fail on main where main is wrong; the null-slot counter and #453's qual cells in one hosted run on CfT, Electron and Safari | Landed on main; the hosted run reports the null-slot rate, and #453's rows do not regress, or the design session rules on a regression |
| #501 | its own lane, after #500 | Unit tests injecting CFNull at decode for the subrole and the role, which fail on main | Landed on main |
| #502 | its own lane | A release build of the engine on the MacBook's Xcode 27.2, run by the seat (no TCC, no owner window), and `swift test` green; plus a hosted release build on Xcode 27 if the runner image offers one, otherwise a tech-debt line naming the local check as the stand-in | Landed on main before O1 |
| #182, #183 | T5 | PR #199 with the frame probe | Landed with M4 |

**Do not gate.**

- **#438 and #446: acceptance does not need them first** (ruled so, 1108). Both are limits of the stale-point guard, which is cua's own
  addition; the vendor has no such guard and clicks in both shapes. No acceptance cell holds a same-label twin. #438
  answers ok where the vendor does too; #446 is an honest refusal. They come after the switch.
- The rest of the guard and overlay family (#461, #464, #470 to #472, #475, #478 to #483, #486, #490, #491): each is
  measured, declared and beyond what the vendor does. They are the soak's list.
- Stated limits and P3s (#238, #239, #245, #246, #256, #257, #278, #279, #331, #340, #344 to #351, #357, #387, #392,
  #394, #416, #419, #421 to #423, #426, #427) and the enhancements (#204 to #208, #213, #214, #219).
- #194: the minimized read-back is a read gap the matrix does not judge.
- Moot under ruling 1104, to close or re-word: #166 and #198 (mini-only), #175 (H0 answers it), #197 (done in T3),
  #196 (bounded in T3), #191 (hold 10's `native-mac` pair showed 0 unexpected differences; the pilot confirms).
- #138 is a risk, not a gate: the vendor's `node_repl` hangs about 1 in 8 at its first local-time conversion under the
  sandbox, which a vendor lane on a runner may meet. The harness restarts such a lane and counts it.

## 7. M5's plan

**The order.** H0 and M4's ports now; then the gates' fixes and the harness port; a pilot at a development head; the
gates' dispositions; a frozen head; the judged runs; the flip shown live; the owner's sitting; the merge on the
owner's yes. A judged run before the freeze would be superseded by any pilot fix, as the Linux pre-flight argued
(§8.1 there). If H0's vendor witness fails, the order stops there (below).

**Hosted sittings**, each one job so that both engines share one machine, lanes alternating:

| Sitting | Content | Proves | About |
|---|---|---|---|
| A | `native-baseline`, three runs each of vendor on vendor, cua on vendor, cua on cua; `compare` A, B and C | Acceptance 5 | 1 h |
| B | The `native-mac` pair and its diff | Acceptance 6 | 15 min |
| C | The matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use cells and the intervention cells; `summary` | Acceptance 3, 4 and 7; the three points | 3 to 3.5 h, inside a job's limit |
| D | `accept-native --engine cua --live-textedit --live-secrets` with an exact item selection that carries its dependencies (1 to 8, 10, 11, 12, 13; never the release gates, accept-native's item 9), the secrets probe on a temporary sentinel store in a temporary home; `verify --bind`; acceptance 9's vendor attestation; then T3b's staged onboarding as its own step | Acceptance 1 (hosted form), 2, 8, 9 | 40 min |
| E | The default-selection mode on the flip commit, its failure on the commit before, and the fallback homes: no approved engine, no Node 24, an engine below the minimum (R4) | The flip, and that an update breaks no session | 20 min |
| F | `maws-selection` with both surfaces; `maws-features` against a MAWS built on the runner, on the flip commit, after #493 | The in-app browser on the own engine and host | 30 min |

**If H0 fails for the vendor** (ruling 1116). Nothing moves to the MacBook by default. Work on sittings A, B and C
stops, and the design session gets three options with their costs (§5): (a) both sides of A, B and C on the MacBook,
which is what the judges accept today, since the matrix judge wants both engines' full runs from one device and OS
and each pair from one sitting, commit and approved build, and the baseline wants a fresh vendor triple beside the
candidate's; (b) cua's lanes on a runner against the fixtures' ground truth and a reduced vendor comparison on the
MacBook, which no judge accepts until a declared change is approved by the owner; (c) another hosted route to a live
helper, if H0's findings show one. Moving only the vendor's lanes to the MacBook is not an option: a pair measured on
two machines is not a pair.

Whatever the option, sitting D splits as §4 says: item 12 and cua's items stay hosted; item 13 and acceptance 9's
vendor attestation are O9. Sittings E and F do not need the vendor's helper.

**MacBook lanes, if any run** (O8a, O8b, O9, O11, O12). They run through T10b's transport, with the owner
present, after O1 at the lane's own checkout. The runner's SSH setup is never used on the owner's account.

**The judge's rule for a row that differs from the vendor's** (R3 as ruled). The declared-departures file may hold
one kind of entry only: cua refused, or answered unconfirmed, where the vendor answered ok. Each entry names the row,
both answers and the Decision Log entry that made cua conservative there. Everything else that differs fails and
cannot be declared: cua acting differently from the vendor, cua answering ok where the vendor refused, or a
difference with no entry. The judge enforces the kind, so an entry of another kind is itself a failure. The matrix
runs in the shared device mode, the default, and the report says so.

**No valid pair, no verdict** (ruling 1116, exactly so). Today `judgeMethod` drops invalid samples and answers `equal`
for a passing frontmost cua sample that has no valid vendor sample to match, and the manifest check tests that a row
is present, not that it is valid; hold 10 had 88 invalid vendor rows. From T10 on:

- a row whose verdict rests on the vendor's answer is `NO VERDICT` unless each counted cua sample has a valid vendor
  sample of the same run, and NO VERDICT is missing proof, never equal;
- a declared departure needs the observed pair, the vendor's ok and cua's refusal or unconfirmed answer, and the
  row's own effect and interference checks on both sides. A declaration cannot supply an answer nobody observed;
- a test feeds the judge a vendor row that is present and invalid, and requires NO VERDICT.

**The three-point report.** `native-matrix.mjs summary` writes `docs/evidence/<date>-own-native-engine/summary.md`.
Beside it, one page for the owner, as Linux's `m5/README.md` had:

1. Acceptance 1 to 9: verdict and link, with the venue of each. At its head: the hosted evidence is macOS 26's (or
   27's, if H0 found the label), and the macOS 27 witnesses are O1 and O3.
2. Speed: per scene, the in-cell medians and p95 on both engines, the rows that beat by 10% and the rows that missed.
   The numbers are a runner's (a virtual machine), compared on one machine; they are not the MacBook's. If a verdict
   is marginal, comparison A is repeated on the MacBook (O11, 30 minutes, through T10b).
3. Finding elements: the ten targets per scene, both scores.
4. Not interfering: the background cells, with the window order read as well as the front app and the focus.
5. "What changes for a user": every declared departure (R3), one line each with its Decision Log entry. These are
   the places where cua now refuses or answers unconfirmed and the vendor answered ok. Nothing else can be on it.
6. The flip shown live, and the way back.
7. The owner's dispositions, each recorded before the go: the speed misses, any route-4 family, finding-elements
   parity if the judge returned it, a self-activating launch family if one was recorded, and O11's result if it ran.
8. The gates of §6, each with its disposition file.

**The MAWS cells.** Both scripts gain a mode that leaves `CUA_SHIM_SURFACES` at its default. In it they require the
session's host to be cua's and its engine attestation to be cua's, then run their steps unchanged, with #493's new
cases. The selection script needs no MAWS (fake peers); the features script needs one.

**The default switch, mechanically.**

- `src/runtime/launch.mjs` L461: `darwin: 'cua'`, and the comment above it. The fallback rows already exist: no
  approved engine keeps the vendor's with `engine_not_installed`, no Node 24 with `own_host_node_unavailable`
  (L439–452, L498–505). R4 adds the third.
- Its mirrors and readers: `scripts/repl-parity/selection.mjs`, `scripts/probe/pinned-engine.mjs`,
  `scripts/probe/lib.mjs`; tests `test/runtime-launch.test.mjs`, `test/repl-parity/selection-oracle.test.mjs`, the
  doctor tests.
- Every harness and gate that relied on the macOS default being the vendor's now says so explicitly. `sandbox-live`
  runs on a runner with no approved engine, so its sessions fall back with a warning: if that moves a fingerprint,
  `docs/evidence/2026-10-18-hosted-macos-gate/baseline/` is re-recorded in the same pull request.
- Docs: the README's configuration row (L1573, "`cua` on Linux, `vendor` on macOS"), its macOS sections, the plugin's
  description ("on macOS through OpenAI's computer-use runtime"), `docs/onboarding-new-mac.md`, the first-call
  document read for stale claims (S L289), and the macOS host rules where they depend on the engine.
- Version: M4's re-cut as a 0.29.x release. The flip takes 0.30.0 if it merges before the Linux engine's M6a, else
  the next minor: versions are allocated at merge (ruling 1111).
- T9 has landed before the flip commit (R4): the flip is the first release in which a Mac's default depends on the
  engine it holds.
- The flip is two commits, as on Linux: the default-selection mode first, failing while the default is the vendor's;
  then the flip, passing.
- Rollback: `CUA_NATIVE_ENGINE=vendor` in a session's environment, or `"engine": "vendor"` in
  `~/.config/cua/engine.json` for a Mac, until M6. Reverting the flip commit restores the default for everyone.
- **Before the flip merges, O1 has run on the MacBook** (ruled, 1108): the build, then the explicit
  `cua engine approve`. Otherwise the MacBook's default sessions keep the vendor's engine with a warning, since under
  R4 the engine of 2026-11-05 is below the minimum.
- A plain `cua install` after the flip builds a pending engine and asks for nothing. The warning and `doctor` name
  both steps: `cua install --engine`, then `cua engine approve` with the owner at the screen.

**If the owner says no.** The flip commit is not merged; M5's pull request lands the evidence, the harness and the
docs with the default unchanged; the decision and what would change it go into the Decision Log.

**Hold 10's evidence.** It is the only record of the last matrix run against the vendor and of acceptance 6 met, and
it lives in `~/.claude/jobs/1ea561bc/tmp/117/` on the MacBook. T7 commits it under
`docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold10/` (ruled, 1108), after an owner-content check:
every image and every log is read for the owner's windows, names and paths, because the repository is public. A file
that fails the check is left out and named in the directory's README, with the reason; nothing is edited to pass.

## 8. Milestones and tasks

Each task is one opus executor's assignment, reviewed before what consumes it runs. Estimates are executor sessions.

| T | Milestone | Scope | Depends on | Proof |
|---|---|---|---|---|
| T0 | H0 | The spike of §4 on a `probe/` branch, in full (ruling 1111). Where it writes a TCC row the kit cites the Decision Log entry and refuses unless `RUNNER_ENVIRONMENT=github-hosted`. It reports the four witnesses apart: child, approved launch, probes, vendor. A findings comment that closes #175 | – | §4's witness table, one result per witness |
| T1 | M4 | Install on macOS (§3): pending-only | – | Unit cases for the selection and the flag on both platforms; a test that a plain install, and one with `--engine`, never starts approval (no `approve` request, no prompting call, no capture, no `approved.json`); the hosted gate (T4) |
| T2 | M4 | The permission flow | – | Swift and service tests; the fake-engine path on hosted |
| T3 | M4 | `accept-native`, with item 14 in its owner form | T2 | Its hermetic suite |
| T3b | M5 | The hosted staged-onboarding driver: on a runner it sets the stages by TCC rows (none, Accessibility only, Screen Recording added) and records what the product does at each: the permission error and its `cua/permission`, the capabilities read, the relaunch and the recovery. It records what happened and never writes an operator's confirmation. Runs as sitting D's last step | T2, T3, T0's step 10 | Sitting D |
| T4 | M4 | The hosted gate builds the bundle | T1 | `engine-swift` and `sandbox-live` green |
| T5 | M4 | The frame probe and PR #199 | – | Swift tests; the pilot's Finder opens |
| T6 | M4 | Docs | T1, T2 | Review against the commands as built |
| T7 | M4 | Records: the M4 entries, report and evidence; hold 10's evidence after the owner-content check of §7 (every image and log; the repository is public). Closes #211 with a pointer once the new pull request exists | – | Docs only; the check's result in the hold-10 README |
| T8 | M5 | The gates of §6, each with its disposition file. T8a: #186, #190, #420. T8b: #189's and #185's rulings applied; `CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell removed. T8c: #212 with PR #218 re-cut on main. T8d: #216. T8e: #258 and #259 | the release; T8e also T10 | §6's table: each gate's witness and closing condition |
| T9 | M5 | The minimum-engine rule (R4, the Linux rule): `engineVersion` moves with this change and with every engine change after it, and a check fails a pull request that changes `native/engine/` without moving it; the service names its minimum; a default selection below it keeps the vendor's engine with a warning naming both steps of the remedy, `cua install --engine` then `cua engine approve`; an explicit one is refused with the same two steps; `doctor` warns when the approved build is not this plugin's source. **It lands before the flip commit** | the review | Unit cases for every row; sitting E's third home |
| T10 | M5 | The harnesses on a runner: `native-baseline`, `native-matrix` and the `native-mac` suite over the loopback device, with the run's own install. The judge: the declared-departures file (R3 as ruled) and NO VERDICT without a valid vendor sample, with its test (§7). Acceptance 3's keystroke witness in the TextEdit click cell. The oracle reading window order (#485). A workflow per sitting, on `macos-27` if H0 found it | the release, T0, T4, T5 | The judge's tests; the pilot: every sitting once, smallest form |
| T10b | M5 | A MacBook device for the harnesses: an owner-present transport and preflight. It adds no SSH daemon and no key to the owner's account, starts only on the owner's own command, refuses while any cua session, engine connection or vendor helper is alive, refuses unless the approved engine is the checkout's build, and uses only harness-owned fixtures. Built only when a MacBook lane is needed: O11, or an option of ruling 1116 | T10; the need | Its refusals by unit test; the MacBook pilot |
| T11 | M5 | The default-selection mode, then the flip, as two commits; the mirrors, tests and docs of §7; the plugin's version allocated at merge | T9 landed | Sitting E |
| T12 | M5 | The MAWS mode in both scripts; the runner's MAWS build | #493 | Sitting F |
| T13 | M5 | The pilot's fixes; then every disposition of §6 present; then the frozen head; then sittings A to F. A MacBook lane, if one is chosen, runs only after O1 at its checkout, and O1 is repeated if a fix changes the engine before the freeze | T3b, T8 to T12 | Every sitting by its own judge, at one head; no NO VERDICT row left |
| T14 | M5 | The report and the owner's page; the owner's sitting, O1 first, then O2 to O6, with each of O5's dispositions recorded before the go; the spec folded (Acceptance, Verification "Gates", the Plan's constraints, M4, M5 and the Concrete Steps say hosted and MacBook, not the mini); the whole-branch review; the pull request | T13 | The owner's decision, recorded |

**Waves** (rulings 1108, 1111 and 1116).

| Wave | Tasks | Notes |
|---|---|---|
| 0, running | T1, T2, T5, T7; T0 in full | The four ports touch disjoint files |
| 0, as inputs land | T3 (after T2), T4 (after T1), T6 (after T1 and T2) | The rest of M4 |
| M4 lands | T1 to T7 reviewed and the gate green | Its own pull request, 0.29.x, without waiting for M5. #211 is closed with a pointer |
| **H0's result** | All four witnesses pass: go on. The vendor fails: **stop**, and the design session gets options (a), (b) and (c) with §5's costs before anything is booked. Another witness fails: §4's routing | T10's shape follows it |
| 1, on the design session's release | T8, T9, T10, T12, T3b | T12 also waits for #493 |
| 2 | T11, after T9 has landed; the pilot | Every sitting once, in its smallest form |
| 3 | The pilot's fixes, §6's dispositions, the frozen head, T13 | No judged run before the freeze, and no freeze with a gate open |
| 4 | T14: the owner's page, O1 first, then O2 to O6, the merge on the owner's yes | O1 before any MacBook lane and before the flip merges |

**Size.** M4's re-cut is about a day: the code exists and was reviewed once. H0 is half a day. T10 is the large one,
three days with the pilot, because the matrix has never run clean, has never run on a runner, and its judge changes.
T8's five lanes run beside it, a day in all. The judged sittings are half a day of wall time. So about six working
days of executors from the release to the owner's sitting, if H0 passes. If the vendor's witness fails, the count
restarts from the design session's and the owner's choice.

## 9. Conflicts and ambiguities in the spec

- **The venue.** Acceptance's preamble (S L234), "Gates" (S L230), the Plan's constraints (S L249) and the Concrete
  Steps (`ssh mini …`, S L295–379) name the mini. T14 revises them.
- **"TCC is never edited by automation"** (S L249) and the kits' own policy line ("Never request grants or change
  TCC", `probe-367.yml`) conflicted with H0. The owner decided (ruling 1111): the Decision Log entry of 2026-11-23
  amends the constraint for GitHub-hosted runners alone, and on every Mac of the owner's the rule stands.
- **"Three attested runs per side, same machine."** On hosted, "same machine" is one job's virtual machine. The
  attestation fields that named the mini's hardware and approved runtime need hosted equivalents (the image version,
  the run id, the run's install).
- **"Approved engine"** (S L208) assumes one copy per Mac, approved by the owner. A runner has no owner and no
  history. On hosted the word means the run's own ad hoc build, and `--approved-engine` and `--approved-runtime`
  take the run's install.
- **Acceptance 1's "identity matching the configured identity"** is true on hosted only for `adhoc`. Its meaning, the
  owner's certificate, is read in O1.
- **M4's Proves line** (acceptance 1 and 8, S L285) cannot be met by M4 alone any more: acceptance 8's live items
  need T10. M4 lands on its unit and hosted-gate proof, and M5 carries both items.
- **The route A/B** has no place in the spec's Acceptance; it was a hold's question. It is closed as overtaken
  (ruling 1108).
- **Acceptance 10** is M6's (S L245). It is not a missing M5 venue.
- **"accept-native item 9"** in acceptance 8's text (S L243) is the release gates, from which the fresh-onboarding
  check was split; it is not acceptance 9. Sitting D never selects it.
- **Install and approval.** The spec's install text (S L210) stops at a pending build; revision 2's T1 wrongly had
  install approve. Automatic approval would be a new product decision, and nobody has made it.

## 10. Sources, and what was not verified

Read: the spec's Purpose, Progress, Acceptance and Plan of Work whole, and its Decision Log by entry ("M2b
pre-flight", holds 1 to 3, "hold 3's route A/B", the M3 entries, and the headers of every entry dated 2026-10-30 and
later); the M2b report; the M4 report and the M4 Decision Log entries on `feat/117-m4`; #117, #175, #182 to #186,
#189, #192, #212, #216, #258, #259, #357, #420, #438, #446, #470, #478, #481, #485, #490, #493 and the open list;
PR #211 and PR #199; the workflows of `probe/282-hosted`, `probe/367-live`, `probe/389-maws` and `probe/442-measure`;
the log of run 42137289452 for the runner's TCC rows; the Linux M5 pre-flight; `launch.mjs`, `client.mjs`,
`cli.mjs`, `engine-bundle.mjs`, `Version.swift`, the two MAWS scripts. For revision 3, the review's references,
each read on main: `summary.mjs` (`proofProblems`, `judgeMethod`, the owner list), `run.mjs` L248 and
`native-baseline/engine.mjs` (`checkApprovedEngine`), `devices.mjs`, `live-device.mjs` ("The probe"),
`accept-native.mjs` (items 6, 9, 12, 13) and `plan.mjs`'s TextEdit click row. `scripts/accept/onboarding.mjs` on
a8c3bc1c was taken from the review, not re-read.

On the MacBook, read only: `approved.json`'s and `pending.json`'s `build` and time (not the identity), the engine
directory's file times, and the bundle's version keys.

Not verified:

- Whether a hosted runner lets a job write TCC rows, and whether the vendor's helper, cua's bundle and its probes
  then run. H0.
- The minutes of O8a, O8b, O9, O11 and O12: taken from the mini's holds and M3's hold, never measured
  on the MacBook.
- Whether a `macos-27` runner exists.
- Whether the mini's approved engine is still d0b2fa13 (taken from M4's records; the mini was not touched).
- The mid-November hosted evidence was sampled, not read whole; "the vendor's engine runs in no hosted kit" rests on
  the workflows read and a search of the evidence READMEs.
- How the matrix and the `native-mac` suite behave on today's engine. Nobody has run them since 2026-10-23.
- The time estimates of §5 and §7 are from the mini's holds, not from a runner.
