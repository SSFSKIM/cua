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
  they were asked; "Rulings" after it gives the answers, and §4, §5, §6, §7, §8 and §9 are edited where an answer
  changes them. Still open: the owner's answer on TCC rows (O0), and an adversarial review of this document, which
  T8 to T14 wait for.

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

## Rulings (1108, 2026-11-23)

| | Ruled | What it changes here |
|---|---|---|
| **R1** | **Open, with the owner (O0).** The design session asked the owner, recommending "yes, on GitHub-hosted runners only". Until the answer, H0 runs everything that needs no TCC write. A kit refuses a TCC write unless `RUNNER_ENVIRONMENT=github-hosted` **and** the owner's yes is recorded in the spec's Decision Log | H0 is split in two parts (§4). T0 starts now with the first |
| **R2** | **Re-cut**, as recommended. #211 is closed with a pointer to the new pull request, and its branch stays as the record | §3 stands |
| **R3** | **Accepted, with one limit.** A departure may be declared only where cua is more conservative than the vendor: cua refuses, or answers unconfirmed, where the vendor answered ok. Each cites its Decision Log entry and is listed on the owner's page under "what changes for a user". A departure where cua acts differently, or answers ok where the vendor refused, cannot be declared: it fails | The judge's rule in §7; T10 |
| **R4** | **Accepted: the Linux rule.** `engineVersion` moves with every engine change from now on. T9 lands before the flip, and O1 runs before the flip merges | §7, T9 |
| **R5** | **Accepted.** The staged onboarding is proven on hosted if R1 is yes. O7 is optional and does not gate, whatever R1's answer | §4 item 8, §5 |

The smaller points, all ruled:

- **Versions:** M4 as 0.29.x, the flip as 0.30.0.
- **Hold 10's evidence** is committed in T7, after a check of every image and every log for the owner's windows, names
  and paths. The repository is public.
- **#184's route A/B is closed as overtaken**, and `CUA_ENGINE_SPIKE_ROUTE` is removed (T8).
- **#438 and #446 do not gate.** The gating list of §6 is accepted.
- **Hosted evidence is macOS 26's.** The owner's page says so, and O1 and O3 are the macOS 27 witnesses. If H0 finds a
  `macos-27` label, the sittings use it.

Process:

- M4's ports T1, T2, T5 and T7, and H0's part without TCC writes, start now, beside an adversarial review of this
  document.
- T8 to T14 wait for that review.
- M4 lands as its own pull request once T1 to T7 are reviewed and green.

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
| T1 | Install on macOS: `cua install` builds, signs and approves the engine when it is selected or asked; `--engine-sign adhoc`; one meaning for `--engine` on both platforms; the selection's sentences corrected | M4.1 (ced790b0, 43f28ab7, 24685bba), redesigned for finding 7 |
| T2 | The permission flow | M4.3, M4.5-A (fda15024, 5d13a52e), the "contracts refresh" entry |
| T3 | `accept-native`: item 14 as the capability-based check, #197's dependencies, the structured reporter, #196's bounded cleanup; the owner-window flag kept, M4.10 left out | M4.2, M4.5-B and C, M4.7 (517fbfaa), M4.9 |
| T4 | The hosted gate builds, signs ad hoc and verifies the real bundle; the download proof | M4.1's hosted half, `scripts/sandbox-probe/` |
| T5 | The window-frame probe, with PR #199 landed beside it | M4.5-D, M4.6, M4.8 (75c91234); PR #199 (e7999797) |
| T6 | Docs: README (install, signing, permissions), `docs/onboarding-new-mac.md`, the macOS host rules in `src/mcp/surface.mjs`; written against today's README, not ported | M4.3's text as a draft only |
| T7 | Records: M4's Decision Log entries of 2026-10-22 to 2026-10-24 and its report, its evidence directory, and hold 10's evidence (§7) | docs only |

T5 is insurance: the Finder scene cost holds 4 to 9. On a fresh runner the window cannot have grown across earlier
runs, but one job that opens it many times adds 28 pt per open without the pin (#182, hold 9).

## 4. The acceptance items, mapped

"Vendor live" means the vendor's helper running with its grants, which only H0's second part can make true on
hosted, and that part waits for the owner's answer (O0).

| Item (S L232–245) | Venue | The named change, or the owner's part |
|---|---|---|
| **1** `doctor --json`: selected `cua`, the bundle at the approved location, the identity matching, `build` equal to `approved.json`'s, three permissions true | **hosted+**, and **MacBook** for the real identity | Hosted: T1 and T4 give an ad hoc bundle at the approved location; its permissions read true only with TCC rows (R1), or through a harness relay that starts the bundle's executable as a child (then the launch is not the product's). MacBook, O1: the configured Apple Development identity, grants carried across a rebuild, macOS 27 |
| **2** `verify.mjs --engine cua --bind com.apple.TextEdit`: one approval, none on the second bind, only `cua-engine` and cua's Node | **hosted+**; **MacBook** for the plugin's hook | Hosted: the product path on a runner (H0). The harness answers the approval. MacBook, O2: the plugin's Elicitation hook answers it in the owner's Claude Code |
| **3** A background click in TextEdit with Finder frontmost; focus and selection stay Finder's; route not 4 | **hosted+** | The matrix on a runner (T10). In substance this is what every kit since #282 measures with a cover window |
| **4** `typeText("한글 테스트 😀")` into TextEdit under the Latin and the Korean source | **hosted+** | The matrix's `acceptance4` rows (T10). The Korean source is selectable on a runner |
| **5** Comparisons A and C print PASS; the 10% beat on three rows, or the owner's parity decision | **hosted+** with vendor live; else **MacBook** | `native-baseline` through the loopback device `hosted.sh` already uses (it refuses `--device local`, L186), with the run's own install where it asks for an approved runtime and engine. The decision is #192 (O5) |
| **6** `native-mac` diff: 0 unexpected differences | **hosted+** with vendor live; else **MacBook** | The same device change. The expected file is re-declared in the pilot for what the fix stream changed on purpose |
| **7** The matrix summary: methods equal or better, finding elements, non-interference 100%, concurrent use, the two intervention cells | **hosted+** with vendor live; else **MacBook** | T10, with the declared departures as R3 was ruled (only cua being more conservative than the vendor; anything else that differs fails) and the dispositions of §6 |
| **8** `accept-native --engine cua --live-textedit` on a scratch home: items 1 to 8, 10, 11; items 12 and 13 on the vendor's engine; fresh onboarding | **hosted+**; 12 and 13 need vendor live; the staged onboarding is hosted if O0 is yes | The headless subset already runs hosted (`sandbox-live`). The live items need the product path (H0). The onboarding stages are driven by adding and removing the runner's TCC rows. The owner-run form (O7) is optional and does not gate, whatever O0's answer |
| **9** `CUA_NATIVE_ENGINE=vendor` still runs the vendor's engine and host, attested | **hosted+** with vendor live; else **MacBook**, two minutes | It is what every macOS session does today |
| M5: the default shown live | **hosted** for the fallback rows; **hosted+** for the `cua` row | T11's default-selection mode, on the flip commit and on the one before |
| M5: the MAWS in-app browser on the own engine | **hosted+**; **MacBook** for the owner's real MAWS | T12: a both-surfaces mode in the two scripts; a MAWS built on the runner as `probe/389-maws` did. O4 |
| M5: the owner's own sitting; the hook observed | **MacBook** | O2, O3 |
| M5: the owner's decisions (speed misses, route-4 families, the flip) | the owner | O5, O6 |

**H0, the spike that decides the "vendor live" and "product path" rows.** One kit on a `probe/` branch, no product
change. It runs in two parts (ruling 1108).

*Part 1, now: nothing here writes TCC.*

1. cua's bundle with no rows: `cua engine build --sign adhoc` at the approved location, launched by `open -n -g -a`.
   Its `status` grants, and what an observation answers.
2. The vendor's helper with no rows: `cua install` of the pinned archive (as `sandbox-live` does), then a
   `CUA_NATIVE_ENGINE=vendor` session binding TextEdit. What it answers.
3. The child relay: a `cua serve` session on cua's own host whose relay starts the bundle's executable as a child of
   the job. One `getAXState` with a screenshot, one click. Whether the first capture raises replayd's confirmation
   with nobody to answer.
4. The four scenes brought up by `scenes-mac.mjs` over the loopback device; the display's size and scale.
5. Whether a `macos-27` runner label exists. If it does, part 2 and every sitting of §7 use it.
6. Read only: whether the job could write a TCC row (the databases' protection, `csrutil status`). No row is written.

*Part 2, only after the owner's yes is in the Decision Log.* The kit refuses unless `RUNNER_ENVIRONMENT=github-hosted`
and that entry exists.

7. Does `tccd` honour a row the job writes (system and user database)?
8. cua's bundle with rows for `io.github.ssfskim.cua.engine`: its grants after a relaunch, `cua engine approve`
   with nobody at a console, then the session of step 3 through the product's own launch.
9. The vendor's helper with rows for `com.openai.sky.CUAService`: one observation, one click.
10. The onboarding stages by rows: none, Accessibility only, Screen Recording added, the relaunch (R5).

Its outcomes:

- **Both pass in part 2:** everything runs hosted.
- **cua only:** the vendor comparison goes to O8.
- **Neither, or the owner says no:** cua's rows run through the child relay of step 3, the vendor comparison goes to
  O8, item 1's permission fields are read only in O1, and the staged onboarding has no hosted form.

## 5. The owner's items, in one list

One sitting on the MacBook covers O1 to O6: about **50 to 60 minutes**. O7 and O8 are conditional. O0 is with the
owner now. Hosted evidence is macOS 26's unless H0 finds a `macos-27` label, so O1 and O3 are the witnesses for
macOS 27, which the owner's Macs run.

| | What | Minutes | What it proves that hosted cannot |
|---|---|---|---|
| **O0** | A yes or no: may a kit write TCC rows on a GitHub-hosted runner (never on a Mac of the owner's)? **Asked by the design session (ruling 1108), recommending yes.** The answer is recorded in the Decision Log before any kit writes a row | 1, by message | Nothing; it unblocks H0's second part |
| **O1** | Build and approve the release's engine on the MacBook: `cua install --engine` (T1), or `cua engine build` then `cua engine approve`. The owner answers a keychain or capture prompt if one appears. Then `doctor --json`'s engine row is read | 5 to 10 | The owner's signing identity; that the three grants carry across a rebuild on macOS 27; the LaunchServices launch; acceptance 1 as written. It also ends finding 5. **It runs before the flip merges** (R4) |
| **O2** | In the owner's Claude Code, with the engine selected: bind TextEdit, act once, bind again | 5 | The plugin's Elicitation hook answering the approval in a real session (S L237, L289) |
| **O3** | The owner drives apps of their choice on both engines and judges breadth | 20 | The owner's apps and the owner's judgement, on macOS 27. Their dogfood so far ran the build of 2026-11-05 (finding 5) |
| **O4** | In the owner's running MAWS: a session with both surfaces on the own engine; `maws-features.mjs` against that session's socket | 10 | The real MAWS build and its Browser panel on macOS 27, beside the scripted run on a runner |
| **O5** | The decision on missed speed beats (#192) and on any route-4 family, read from the report's owner page | 5 to 10 | The owner's call |
| **O6** | The go for the flip | with O5 | The owner's word, as on Linux |
| **O7** | Optional, only if the owner wants it; **it does not gate the flip, whatever O0's answer** (R5): fresh onboarding. The owner removes cua Engine from the three privacy panes and re-adds it as the script asks | 25 | That a person can onboard a Mac from the docs, with real prompts |
| **O8** | Only if H0 fails for the vendor, or the owner answers no to O0: the vendor comparison on the MacBook. The owner closes TextEdit, Finder windows and Chrome for Testing, stays reachable for prompts and does not use the machine | 60 to 90 | The vendor's engine beside cua's on one real Mac |

O8's size assumes comparisons A and C at three runs a lane (M3's whole hold, with A, B and C, took 57 minutes) and a
reduced matrix: the speed, finding-elements and background cells, three runs a side. A full matrix lane takes 24 to 35
minutes (holds 3 and 10), so the full triple alone would be three hours. If O8 happens, T5 is required: the MacBook's
Finder keeps its geometry between runs.

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
| #420 (P2) | `type_text` drops an emoji in Chromium apps. The Unicode matrix types `😀 이모지` into the Chrome page and the Electron field (S L227) | A fix (the paste route for a character outside the BMP), or a declared row if the vendor drops it too |
| #258, #259 (P1) | Two recorded differences from the vendor that a model meets: an element click keeps a text field's selection, and a coordinate click landed a line low in the Electron fixture | Re-measured in the pilot. #259's last reading landed on target (2026-11-05); #283, #313 and #324 changed #258's ground |
| #212 with PR #218, #216 (P1) | A safety report (a save sheet completing across an intervention) and an approval-loss report from MAWS, both on cua's engine and host. The flip makes that path every session's | A disposition each: land, reproduce on today's main, or rule them not reproducible |
| #485 | A refused background click can leave the target's window above the person's (ruling 1069 counts that as a failure) | It gates only if the matrix's non-interference cells meet it; the oracle reads the window order |
| #493 (in flight) | It changes the MAWS first-use path and adds cases to both MAWS scripts | It lands before T12 |
| #182, #183 with PR #199 | The Finder pin and the recovery record | T5 |

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

**The order.** H0's first part and M4's ports now; the adversarial review of this document; then the harness port
and a pilot at a development head, then a frozen head, then the judged runs,
then the flip shown live, then the owner's sitting, then the merge on the owner's yes. A judged run before the freeze
would be superseded by any pilot fix, as the Linux pre-flight argued (§8.1 there).

**Hosted sittings**, each one job so that both engines share one machine, lanes alternating:

| Sitting | Content | Proves | About |
|---|---|---|---|
| A | `native-baseline`, three runs each of vendor on vendor, cua on vendor, cua on cua; `compare` A, B and C | Acceptance 5 | 1 h |
| B | The `native-mac` pair and its diff | Acceptance 6 | 15 min |
| C | The matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use cells and the intervention cells; `summary` | Acceptance 3, 4 and 7; the three points | 3 to 3.5 h, inside a job's limit |
| D | `accept-native --engine cua --live-textedit`, `verify --bind`, the vendor-pinned items, the staged onboarding (R5) | Acceptance 1 (hosted form), 2, 8, 9 | 30 min |
| E | The default-selection mode on the flip commit, its failure on the commit before, and the fallback homes: no approved engine, no Node 24, an engine below the minimum (R4) | The flip, and that an update breaks no session | 20 min |
| F | `maws-selection` with both surfaces; `maws-features` against a MAWS built on the runner, on the flip commit, after #493 | The in-app browser on the own engine and host | 30 min |

If H0 fails for the vendor, or the owner answers no to O0, the vendor lanes of A, B and C move to O8 and cua's lanes
still run hosted, where they show cua's rows against the fixtures' ground truth but no comparison. Sitting D's staged
onboarding runs only with O0's yes.

**The judge's rule for a row that differs from the vendor's** (R3 as ruled). The declared-departures file may hold
one kind of entry only: cua refused, or answered unconfirmed, where the vendor answered ok. Each entry names the row,
both answers and the Decision Log entry that made cua conservative there. Everything else that differs fails and
cannot be declared: cua acting differently from the vendor, cua answering ok where the vendor refused, or a
difference with no entry. The judge enforces the kind, so an entry of another kind is itself a failure. The matrix
runs in the shared device mode, the default, and the report says so.

**The three-point report.** `native-matrix.mjs summary` writes `docs/evidence/<date>-own-native-engine/summary.md`.
Beside it, one page for the owner, as Linux's `m5/README.md` had:

1. Acceptance 1 to 9: verdict and link, with the venue of each. At its head: the hosted evidence is macOS 26's (or
   27's, if H0 found the label), and the macOS 27 witnesses are O1 and O3.
2. Speed: per scene, the in-cell medians and p95 on both engines, the rows that beat by 10% and the rows that missed.
   The numbers are a runner's (a virtual machine), compared on one machine; they are not the MacBook's. If a verdict
   is marginal, comparison A is repeated on the MacBook inside the sitting (15 minutes more).
3. Finding elements: the ten targets per scene, both scores.
4. Not interfering: the background cells, with the window order read as well as the front app and the focus.
5. "What changes for a user": every declared departure (R3), one line each with its Decision Log entry. These are
   the places where cua now refuses or answers unconfirmed and the vendor answered ok. Nothing else can be on it.
6. The flip shown live, and the way back.

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
- Version: M4's re-cut as a 0.29.x release, the flip as 0.30.0 (ruled, 1108).
- T9 has landed before the flip commit (R4): the flip is the first release in which a Mac's default depends on the
  engine it holds.
- The flip is two commits, as on Linux: the default-selection mode first, failing while the default is the vendor's;
  then the flip, passing.
- Rollback: `CUA_NATIVE_ENGINE=vendor` in a session's environment, or `"engine": "vendor"` in
  `~/.config/cua/engine.json` for a Mac, until M6. Reverting the flip commit restores the default for everyone.
- **Before the flip merges, O1 has run on the MacBook** (ruled, 1108). Otherwise the MacBook's default sessions keep
  the vendor's engine with a warning, since under R4 the engine of 2026-11-05 is below the minimum.

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
| T0 | H0 | The spike of §4 on a `probe/` branch, in two parts. Part 1 (steps 1 to 6, no TCC write) starts now. Part 2 (steps 7 to 10) starts when the owner's yes is in the Decision Log; the kit checks both that entry and `RUNNER_ENVIRONMENT=github-hosted` and refuses otherwise. A findings comment that closes #175 | Part 1: nothing. Part 2: O0 | The outcomes of §4, per part |
| T1 | M4 | Install on macOS (§3) | – | Unit cases for the selection and the flag on both platforms; the hosted gate (T4) |
| T2 | M4 | The permission flow | – | Swift and service tests; the fake-engine path on hosted |
| T3 | M4 | `accept-native` | T2 | Its hermetic suite |
| T4 | M4 | The hosted gate builds the bundle | T1 | `engine-swift` and `sandbox-live` green |
| T5 | M4 | The frame probe and PR #199 | – | Swift tests; the pilot's Finder opens |
| T6 | M4 | Docs | T1, T2 | Review against the commands as built |
| T7 | M4 | Records: the M4 entries, report and evidence; hold 10's evidence after the owner-content check of §7 (every image and log; the repository is public). Closes #211 with a pointer once the new pull request exists | – | Docs only; the check's result in the hold-10 README |
| T8 | M5 | The gating fixes: #186, #190, #420, and #189's and #185's rulings applied; `CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell removed, #184's A/B closed as overtaken | the review | Each by its own test and one hosted cell |
| T9 | M5 | The minimum-engine rule (R4, the Linux rule): `engineVersion` moves with this change and with every engine change after it, and a check fails a pull request that changes `native/engine/` without moving it; the service names its minimum; a default selection below it keeps the vendor's engine with a warning naming `cua install --engine`; an explicit one is refused; `doctor` warns when the approved build is not this plugin's source. **It lands before the flip commit** | the review | Unit cases for every row; sitting E's third home |
| T10 | M5 | The harnesses on a runner: `native-baseline`, `native-matrix` and the `native-mac` suite over the loopback device, with the run's own install; the declared-departures file and the judge's rule of §7 (R3 as ruled); a workflow per sitting, on `macos-27` if H0 found it | the review, T0, T4, T5 | The pilot: every sitting once, smallest form |
| T11 | M5 | The default-selection mode, then the flip, as two commits; the mirrors, tests and docs of §7; plugin 0.30.0 | T9 landed | Sitting E |
| T12 | M5 | The MAWS mode in both scripts; the runner's MAWS build | #493 | Sitting F |
| T13 | M5 | The pilot's fixes, then the frozen head, then sittings A to F | T8 to T12 | Every sitting by its own judge, at one head |
| T14 | M5 | The report and the owner's page; the owner's sitting (O1 to O6), with O1 before the flip merges; the spec folded (Acceptance, Verification "Gates", the Plan's constraints, M4, M5 and the Concrete Steps say hosted and MacBook, not the mini); the whole-branch review; the pull request | T13 | The owner's decision, recorded |

**Waves** (ruling 1108).

| Wave | Tasks | Notes |
|---|---|---|
| 0, now | T1, T2, T5, T7; T0's part 1; the adversarial review of this document | The four ports touch disjoint files. Nothing here needs the owner's answer |
| 0, as inputs land | T3 (after T2), T4 (after T1), T6 (after T1 and T2) | The rest of M4 |
| M4 lands | T1 to T7 reviewed and the gate green | Its own pull request, 0.29.x, without waiting for M5. #211 is closed with a pointer |
| when O0 is answered | T0's part 2, on a yes | On a no, §4's third outcome applies |
| 1, after the review | T8, T9, T10, T12 | T10's shape follows T0. T12 also waits for #493 |
| 2 | T11, after T9 has landed; the pilot | Every sitting once, in its smallest form |
| 3 | The pilot's fixes, the frozen head, T13 | No judged run before the freeze |
| 4 | T14: the owner's page, O1 to O6, the merge on the owner's yes | O1 before the flip merges |

**Size.** M4's re-cut is about a day: the code exists and was reviewed once. H0 is half a day. T10 is the large one,
two days with the pilot, because the matrix has never run clean and has never run on a runner. The judged sittings
are half a day of wall time. So about five working days of executors from the review to the owner's sitting, if H0
passes; add O8's preparation if it does not.

## 9. Conflicts and ambiguities in the spec

- **The venue.** Acceptance's preamble (S L234), "Gates" (S L230), the Plan's constraints (S L249) and the Concrete
  Steps (`ssh mini …`, S L295–379) name the mini. T14 revises them.
- **"TCC is never edited by automation"** (S L249) and the kits' own policy line ("Never request grants or change
  TCC", `probe-367.yml`) conflict with H0's second part. The owner decides (O0); until then no kit writes a row, and the spec's constraint
  is reworded only on a yes, to name GitHub-hosted runners as the one exception.
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

## 10. Sources, and what was not verified

Read: the spec's Purpose, Progress, Acceptance and Plan of Work whole, and its Decision Log by entry ("M2b
pre-flight", holds 1 to 3, "hold 3's route A/B", the M3 entries, and the headers of every entry dated 2026-10-30 and
later); the M2b report; the M4 report and the M4 Decision Log entries on `feat/117-m4`; #117, #175, #182 to #186,
#189, #192, #212, #216, #258, #259, #357, #420, #438, #446, #470, #478, #481, #485, #490, #493 and the open list;
PR #211 and PR #199; the workflows of `probe/282-hosted`, `probe/367-live`, `probe/389-maws` and `probe/442-measure`;
the log of run 42137289452 for the runner's TCC rows; the Linux M5 pre-flight; `launch.mjs`, `client.mjs`,
`cli.mjs`, `engine-bundle.mjs`, `Version.swift`, the two MAWS scripts.

On the MacBook, read only: `approved.json`'s and `pending.json`'s `build` and time (not the identity), the engine
directory's file times, and the bundle's version keys.

Not verified:

- Whether a hosted runner lets a job write TCC rows, and whether the vendor's helper or cua's bundle then runs. H0.
- Whether a `macos-27` runner exists.
- Whether the mini's approved engine is still d0b2fa13 (taken from M4's records; the mini was not touched).
- The mid-November hosted evidence was sampled, not read whole; "the vendor's engine runs in no hosted kit" rests on
  the workflows read and a search of the evidence READMEs.
- How the matrix and the `native-mac` suite behave on today's engine. Nobody has run them since 2026-10-23.
- The time estimates of §5 and §7 are from the mini's holds, not from a runner.
