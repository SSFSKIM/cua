# #117 own native engine — M1a execution report

Executor's account of milestone M1a of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (the spec), on branch `feat/117-own-native-engine` in SSFSKIM/cua, base a807827a. The spec's Progress, Decision Log, Surprises and Outcomes carry the durable record; this file is the hand-back to the dispatching session (maws-3f). Nothing in M1a ran live: no GUI on the MacBook, and the Mac mini was used only for the non-interactive Statsig read.

## Status

DONE_WITH_CONCERNS. Every M1a task is built and reviewed clean, and the whole-branch review found the branch correct. The concern is what M1a could not reach: none of the AX, input or capture logic has run against a real app yet (see Unverified). That is by design and is M1b's job.

## Commits

a807827a..HEAD, 43 commits, 125 files, +62k/−1.2k lines (most of it the recorded goldens and fixtures).

| Task | Commits | Review |
|---|---|---|
| Pre-flight | c8c0b765 | — |
| M1a.1 engine core: per-lineage tokens `t<n>`, re-resolution, `Skyshot` token shape, screenshot sizing rule, protocol deadline and peer policy, spike switches removed | 41de5400, fixes f04664ac | Approved; 4 Minor fixed; re-review clean |
| M1a.2 engine input: keys by route 2′, clicks 1 → 3, `activationFailed`, activation-point skip, owning-pid forbidden check, `concealed`, `menuBarItemUnsupported` | 7354c39c, fixes 8e695c51, 7329cc35, 2050558a | Needs fixes ×3 (visible-frame walk, reach check, hold timer, owner/route, menu-bar handling); approved at round 4 |
| M1a.2b derivations the goldens refuted (disclosable, settable, value type, document URL, header title, focus and selection reads, action descriptions, menu-bar node, absent title as null) | 85341dae, fixes 907d1213, 0862bf2d | Needs fixes ×2 (action-word table, no AXSelectable, menu-bar refusal, filterActions FUN_100782c24, menu-bar re-resolution); approved |
| M1a.3 renderer, diff, goldens (`render.mjs`, `diff.mjs`, `test/native-goldens/`) | 6fa99387, 23a05957, 50658ad0, 76d71da4; merge 0edb075d | Needs fixes ×1 (Rows/Columns half-open bounds; a comparison that absorbed part values); approved, 80/80 |
| M1a.4 `src/` integration: approval memory, `concealed` and admitted error names in the wrapper, `CUA_SKY_SERVICE`, relay `-n -g`, seatbelt deny, ci-kit `engine-swift` gate | 38425feb..146b6db8, fixes cd773dae; merge 59a43ae0 | Approved; Minors fixed; re-review approved |
| M1a.5 the service: protocol, client, policy and its generated Swift copy, numbering over tokens, result meta, untrusted-engine path | 4fa99fa3, fixes 813bd229 | Needs fixes (screenshot directory under the default sandbox, test gate, iPhone Mirroring, engineMs); approved |
| Pre-final fix wave: spike switches unreachable from model code (per-method field allowlist), deferred Minors from M1a.1/.4/.2b/.5 | bd1136f1 | Covered by the whole-branch review |
| Whole-branch review fixes: "nothing was entered" when the engine posted nothing; a new connection gets the full PING_MS | 6f110605 | Controller spot-check, 175 tests |
| sandbox-live fix: probe-secrets expects `concealed: true` on macOS | b2ccdc3b | Hosted CI (below) |

Spec and research folds between tasks: 399acecd, c0cd2560, ea45fb10, ab6921b8, 6a94aae8, f42d99cb, db53b69e, c8f9a821, 890c8e12, 3b27c9e3, 1646b9fe, fd793d87, d8a5cf2f, 70f10004, 6329965e, and the closing commit with this report.

## Reviews

- Per task: `doperpowers:task-reviewer` (opus) at each task's frontier, fixes resumed on the same executor (opus/high). Round counts are in the table.
- Whole branch: `doperpowers:reviewer-high` (fable) on a807827a..bd1136f1. Verdict: correct, 0 Critical, 0 Important, 3 Minor. Minors 1 and 2 were fixed in 6f110605. Minor 3, a replacement worker's re-ask race, is a row in `tech-debt-tracker.md`.
- Two reviewer findings were wrong and were withdrawn after checking against the decompiled code: the M1a.2 round-2 menu-bar finding, retracted by the reviewer, and a reading of decisions 6 and 8. The final ruling refuses every menu-bar click until M2a.

## Hosted CI

| Commit | Gates | Run |
|---|---|---|
| 1646b9fe | engine-swift PASS 1m43s, test PASS 7m43s | 39338269880 |
| 4fa99fa3 | engine-swift PASS 1m04s, test PASS 7m01s | 39348630686 |
| bd1136f1 | default selection: plugin, engine-swift 2m21s, test 6m17s, parity-browser PASS; **sandbox-live FAIL** | 39352248695 |
| b2ccdc3b | default selection, GREEN: plugin 0m51s, engine-swift 2m26s, sandbox-live 1m28s, test 5m42s, parity-browser 9m31s, sandbox-denials 20m57s | 39354209946 |

The sandbox-live failure on bd1136f1 was in probe-secrets' four substitution steps. Since M1a.4 the wrapper adds `concealed: true` to a substituted macOS request, but the probe's exact-fields check still compared against the bare input. b2ccdc3b updates the probe's expectation. No earlier run had triggered sandbox-live, because only engine-swift and test had been selected. The lesson is recorded in the spec's Outcomes.

Local checks at the last code change: wrapper/service/client 175 tests (174 pass, 1 skip); npm test 3357 tests (3187 pass, 0 fail, 170 skip); Swift 204/204 at bd1136f1. The Swift count is from the executor; the hosted `engine-swift` gate re-ran it.

## Decisions taken in M1a (the spec's Decision Log has each, dated)

- **Coordinator rulings, 2026-10-19 and -20:**
  - M1a.2b was added with every predicate taken from the vendor's code with its address. Predicates that could not be found are named hypotheses.
  - Engine-fault corrections in the goldens expire at M1b's live re-recording; the expiry is written into `expected.json` and M1b's paragraph.
  - The hosted runner grants Accessibility. `permissionsPending` is covered by the fake engine on hosted CI and live on the mini.
  - iPhone Mirroring is off the forbidden list (the owner can overrule).
  - Text observation without Screen Recording is an M4 question.
  - Screenshots go in the run directory (`CUA_ENGINE_SCREENSHOTS=<run>/<session>/screenshots`, created by the engine with O_NOFOLLOW).
- **Statsig 406601636 (sizing config):** read on the mini at 2026-10-19T21:45:21Z (plist mtime 20:30:43Z, newest fetch 20:30:09Z). All 10 evaluations resolve to the rule default, with legacy absent (false). The reader is `scripts/native-baseline/read-sizing-config.sh`; the provenance is in `test/native-goldens/PROVENANCE.md`.
- **Spec corrections:**
  - Interfaces gained `activationGuardMs`, `pointUnconfirmed` and `menuBarItemUnsupported`. Part 7 and the Gates line were corrected.
  - M2a's Decisions carry three hand-offs: the menu-bar activate-and-record path, scroll-into-view, and secondary actions validated by filterActions.
  - The research gained F-helper-logic §5 item 8 (the vendor's menu-bar branch, the visible-frame walk and where it scrolls).

## Unverified

Nothing ran live. All AX, input and capture logic was tested through seams, over synthetic or recorded data. Specifically:

- **No real-engine untrusted run.** The real-engine untrusted path runs nowhere, because the hosted runner grants Accessibility.
- **Live behaviour still untested:**
  - out-of-process (Open panel) re-resolution, and the per-process invalidation watch;
  - the multi-display and fractional screenshot sizing rule;
  - the screen-change notification in an unbundled process;
  - the hold cap's effect on screen;
  - the gate and reach check on real Chromium/Electron hit-tests (how often `pointUnconfirmed` occurs);
  - the menu-bar refusal, and whether per-action deactivation closes menus (M2a);
  - the catalyst-context inference.
- **Hypotheses only a live run settles:**
  - Electron focus (`timings.focusRead`);
  - Finder's name-field selection;
  - the menu bar's role description from the listed read;
  - whether the header title needs Screen Recording.
- **Inference:** that text observation without Screen Recording matches the vendor's.
- **For M1b's comparison A:** whether the vendor's node_repl passes `CUA_ENGINE_SCREENSHOTS`, `CUA_ENGINE_APP`, nativePipe and launchServices into the trusted worker.
- **Unchecked:** the M1a.4 executor reported deterministic test failures under Node 26 (CI runs Node 24).

## M1b owner prerequisites

- **Toolchain:** Xcode's Swift toolchain on the mini.
- **Certificate:** the Apple Development certificate in the mini's login keychain. Done 2026-10-18, with the WWDR G3 intermediate added.
- **Signing identity:** `signingIdentity` (the SHA-1 of the copy the MacBook also has) in `~/.config/cua/engine.json`.
- **Partition list:** `security set-key-partition-list`, with the owner entering the password at the console.
- **Locked keychain:** `security unlock-keychain` when an SSH session finds the login keychain locked. Without it, codesign over SSH fails with errSecInternalComponent.
- **First approval:**
  - the first `cua engine approve` runs with the owner at the console;
  - the owner adds the three grants by hand: Accessibility, Screen Recording and Input Monitoring (universalAccessAuthWarn denies the prompts);
  - the owner answers the capture confirmation if replayd raises one.
- **CI hold:** maws-3f arranges it.

M1b's own first steps:

- re-read the Statsig config before recording;
- re-record the goldens live from the M1a.2b engine and delete every engine-fault correction;
- compare Finder as full text (hide the sidebar, or keep AX vocabulary in the redactor).

## Residue

- **Live AX observation on a hosted runner.** The hosted macOS runner grants the engine Accessibility, so real-engine observation could run on hosted CI instead of the mini. maws-3f said it would register this ticket.
- **Text-only fallback without Screen Recording (M4).** Whether cua observes text without Screen Recording the way the vendor appears to. It is an inference today and an install/permissions decision for M4.
- **Tech-debt rows added in M1a** (`tech-debt-tracker.md`):
  - the /tmp race in native-pipe-long-path;
  - the vendor's 100k settable rule against cua's 10k cap;
  - the persist mode not checked against the offered modes;
  - a replacement worker's re-ask race.

  Each row has its context in the tracker.

## Environment

- Swift scratch was /tmp/cua-m1a-swift (`CUA_ENGINE_SCRATCH`); it and the other /tmp scratch were deleted at the end.
- The task worktrees ../cua-117-m1a3 and ../cua-117-m1a4 and their branches were removed after merging.
- The decompiled vendor code stayed in ~/.claude/jobs/1ea561bc/tmp/117/decomp/. The repo cites F-helper-logic.md's sections and function addresses only.
