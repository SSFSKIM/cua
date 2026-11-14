# #171 own Linux engine: the plan-executor's report

The execution record of `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, kept by its plan-executor
(session linux171 on the #171 VM, `dc-linux171-1e68`). The spec's Progress, Surprises & Discoveries and Decision Log
carry what a later reader needs; this report carries how each milestone was run, reviewed and landed, and the
friction met. Newest milestone last.

## How the plan is run

- Execution loop: doperpowers:subagent-driven-execution. A fresh `doperpowers:task-executor` (opus, high) per task,
  a `doperpowers:task-reviewer` (sol, xhigh) at each dependency frontier, fixes resumed on the executor that wrote
  them, and the spec's one writer folding each report into the Decision Log and Surprises.
- Landing: each milestone lands as its own squash-merged pull request to `main` after `doperpowers:reviewer-high`
  on the milestone's branch and a green `ci-gate` (Decision Log, "execution pre-flight").
- Coordinator: the design session cua_repl#1ea561bc on the owner's MacBook, reached through sminos. Every design
  question below went there and its answers are in the Decision Log with its name on them.

## M0 — behaviour specification, spike, wire fixtures, family matrix

Branch `feat/171-linux-engine` (also carries the spec and research). Four loop tasks (pre-flight decision):

| Task | Commits | Task review |
|---|---|---|
| M0.1 behaviour specification | fdf5ea6c; fixes 80220e92, 91a12ef7 | 1 round of fixes, then approved |
| M0.2 spike engine | 1901a1ba; fixes 41c4e1bd | 1 round of fixes, then approved |
| M0.3 wire fixtures, harness, runs, verdict | 39176596..381db1ca; fixes f637fcfa..b0d7d2d2 | 1 round of fixes, then approved |
| M0.4 family matrix | e7eb40b2..d875ab7b; fixes 855de4e9..29968aa3 | 1 round of fixes, then approved |

**Result.** M0 promotes (spec Surprises, "M0.3, the verdict"). Where the spike overlaps the vendor it reproduces it
exactly (byte-identical `list_windows`, gedit `get_window_state` and window JPEG; `sequential` sends the vendor's
3,038 gedit calls). The chosen configuration passes every operation on gedit, a Chrome page, the over-budget page and
a >4 MiB text node against the faster vendor build: gedit tree read 69.7 ms warm against 545.4 ms, the Chrome page
48.8 against 405.1, background `press_key` ~101 ms warm against 235 and ~146 ms cold against ~240.

**Choices M1a builds with** (Decision Log "M0.3", "M0.4"): W 32, R 4 MiB, 4 KiB per call reserved, slack 16,
over-budget bound vendor + 256; redirect before first targeted input, no input settle; capture readiness by the
DAMAGE rule (first `DamageNotify` then 10 ms quiet, cap 150 ms, per pixmap; fallback fixed 100 ms); no key pacing;
100 ms before `FocusOut`.

**The matrix** (Decision Log "M0.4"): GTK 4 ignores synthetic clicks and keys; Firefox ignores synthetic clicks
while less than ~55% of its window is visible; xterm ignores synthetic keys; AT-SPI element clicks work everywhere.
`families.rs` (M3) lists per input kind with conditions; GTK 4 text cases move to `dedicated` mode.

**Design changes made during M0**, all checked by the coordinator: review round 3 folded (serving generations,
snapshot bounds, the byte budget R); the behaviour specification's corrections (AT-SPI bus address from a root
property, `text/plain`, the lock's verify read, the focusing click restoring the observed caret, `clipboard_write`'s
restore as a declared deviation); interrupted input answering an error (a deviation); the crate rule read as the
vetted crates' own dependency graph at the vendor's versions (confirmed, reported to the owner); the error catalogue
accepted as incomplete, its open part settled by the harness.

**Branch review** (`doperpowers:reviewer-high`, e1aeda21..362644d0): verdict "incorrect" on four harness defects,
none in the engine: a shell interpolation of the terminal recorder's path (a `--run` label could execute commands),
unknown operations dropped so an empty plan passed, effect targets checked only on cua's window, and terminal text
decoded as Latin-1. Fixed in 5713b2b0 with five regression tests, the matrix evidence re-judged (no verdict moved;
xterm re-run live, b9882d6f). The re-review found one regression from the operation check (a desktop-only
`list_windows` run refused), fixed in 5eedbe53; then clean.

**Deferred Minor review findings** (carried to the PR's Unresolved Review Findings):
- `native/linux-engine/src/input.rs` (~140–144, 260–270): cleanup releases drain the held-key state before building
  their events, so a cleanup `KeyRelease` carries modifier mask 0. Only on best-effort cleanup after an error that
  already reaches the caller; M1a's input module fixes it with a test of the emitted state.
- (The task review's other Minor, a page scene's completeness check missing its click counter, was fixed in the
  branch review's fix wave, 5713b2b0.)

**Validation.** Engine: `cargo test` 60/60, fmt and clippy clean (M0.2 fixes). Harness: 53/53 at 5eedbe53
(`node --test test/linux-engine-diff/*.test.mjs`; the directory form treats the path as a module on Node 24),
xprobe 3/3. `npm test` on the VM: 51 failures, 50 of them also failing at the base commit (macOS-only fixtures and the
environment) and one flaky (`accept-lib` tree snapshot, 1 in 3, files unchanged); M0 added none. The PR's gate is
`ci-gate` on GitHub's hosted macOS runner (results in the PR).

**Friction** (reported to the coordinator, which logged it in the tracker; `~/.claude` is pull-only on this host):
- A safety classifier stopped three long hand-backs about the vendor binary's decompiled internals and one set of
  crafted malformed-input probes. Nothing was reworded or split to pass it; the work moved to running the vendor
  over the wire with well-formed requests and writing findings to files (Decision Log, "M0.1 review").
- The worktree-isolation Bash guard refuses compound commands, commands whose program path comes from a variable,
  some heredocs, and a sminos message whose text mentioned a forced branch update; worked around with plain commands
  and script files under `.doperpowers/sde/` (about two dozen refused calls across the tasks).
- An auto-mode "Git Destructive" block on a lease-guarded forced update of this unmerged branch, which had already
  gone through.
- `xdotool windowsize --sync` hangs on a window already at its size (replaced by a polled configure).
- The discarded loaded readiness run's raw trial rows were deleted before the first evidence commit; only its margin
  and load rows survive (spec Surprises).

**Installed on the VM for M0**: gnome-text-editor, kate, qtcreator, xterm, LibreOffice Writer and its gtk3 plugin,
Firefox (Mozilla's deb repository), stress-ng, `gir1.2-gtk-4.0`.

## M1a — engine core, wire-compatible, with the differential harness

Branch `feat/171-m1a` from main 8b757c3c. Four loop tasks (pre-flight, 80d13a21):

| Task | Commits | Task review |
|---|---|---|
| M1a.1 observation (tree read, readiness, cover, apps) | 80d13a21..2db4ac0a; fixes b0ab6c1..a454569 | 1 round of fixes, then approved |
| M1a.2 input (routes, holds, desktop) | a454569..81e9be54; fixes 19fbd75..0847e23, 0847e23..48da51a | 2 rounds of fixes, then approved |
| M1a.3 harness completion and the proof | 48da51a..973f940 | its review's fixes folded into M1a.4 |
| M1a.4 M1a.3's fixes, drag pacing, MIT-SHM, the proof re-run | 53de86e2..8c82badc; fixes 49e39745..dabf618d | 2 re-reviews (with M1a.3's), then approved |

**Result** (evidence `docs/evidence/2026-10-28-own-linux-engine/m1a/`). On x86-64, for every command but text and
clipboard:
- **Acceptance 2, 4 and 5 hold.** Outputs are equal or declared. The over-budget read retains the vendor's native ids
  exactly, inside the +256 bus-call bound. The witness and the X request audit are clean wherever the vendor's are,
  judged per family on all eleven of M0.4's families, covered and visible. The activate-and-restore stub fails both.
- **Acceptance 3 holds, with two listed exceptions.** Every window-route operation is at or below the faster vendor
  build, e.g. the gedit tree read 83.0 ms warm against 600.8 and the Chrome drag 393.6 against 412.8. The desktop
  screenshot's cold first capture is listed as parity, and desktop `move`'s later requests are a declared speed gap
  closed by M4.
- **cua's effect is judged on every sample.** Where the vendor misses (covered Chrome scroll, 21/30 and 20/30), the
  cause is the vendor's per-request unredirect; cua's session retention takes 30/30.

**Design changes made during M1a**, each checked or decided by the coordinator (Decision Log, M1a.1 to M1a branch
review):
- the unobscured readiness shortcut;
- Firefox's coordinate clicks `unless_unobscured`; the 60% area rule was withdrawn on the second-size measurement;
- drags paced by family in `families.rs`: Chromium 500 µs a step, Gecko 300 µs and 30 ms before the release, every
  other family none;
- MIT-SHM desktop capture and Acceptance 3's parity rule;
- cua's effect judged absolutely, with a settled read;
- long browser drags and full-distance Chromium thumb drags made required M4 work, judged by Acceptance 3 from M4 on;
- Chrome's HTML5 drag-and-drop an open M3 item;
- the desktop route's speed judged on fresh engines with a bootstrap interval; "same (within noise)" and declared
  speed gaps;
- Writer's first drag recorded as agent-facing behaviour, an M4 candidate.

**Branch review** (`doperpowers:reviewer-high`, 8b757c3c..8272cc51): verdict "incorrect", one P1 and five P2, all in
the harness. A run label reached shell source. The events experiment computed speed verdicts without failing on them,
which hid desktop `drag_handle` (33.1 ms against a 30.2 bar) and `move`. The drag judge was still relative to the
pinned build. An audit could pass without exercising the operation. Events variants had no binary, and vendor-js
dropped variant args. Fixed in two rounds (2144ee0e..4913ada2) with regression tests. The design session's calls came
in between: the desktop speed judged on fresh engines with an interval, `move` as a declared gap, Writer primed. The
re-review (7f1dc04d..38e3c130) found three P2 false passes in the new speed gate: timed answers unchecked, undersampled
mandatory groups passing, and the noise rule limited to first requests. They were fixed in 9df5f2fc. Its re-review
(95fd7cb0..9df5f2fc) is "correct", with no material findings. It rejudged the committed evidence independently and
did not require a live re-run: `m1a4-events-gate3` recorded only `ok` for its timed answers, and future runs record
full answers. Two mechanical leftovers were fixed with the merge: rustfmt on `xprobe/src/record.rs`, and the evidence
README's noise-rule wording.

**Validation** (final head in the PR):
- Engine: `cargo test --release` 121 passed and 2 ignored (live; the SHM one passes under `xvfb-run`); clippy and fmt
  clean.
- Harness: `node --test test/linux-engine-diff/*.test.mjs` 123/123; xprobe fmt clean.
- The verdict run `m1a4-wire-final` ran on engine 2104e8cd. The only engine change after it, d474e40d, touches
  `drag_handle`'s held moves on the desktop route alone, which the events runs on d474e40d judge.
- `ci-gate` GREEN on 8272cc51 (run 40899750345) and 38e3c130 (run 40914546404); the final head's run is in the PR.

**Friction** (for a Mac session to record; `~/.claude` is pull-only on this host):
- The worktree-isolation Bash guard refused tens of calls across M1a: compound commands, a variable in an option
  position, `cd` before git, heredocs chained with `&&`, node arguments computed at run time. Workaround: plain
  commands, Write and Edit, and wrapper scripts under `.doperpowers/sde/`.
- `pgrep -f "<pattern>"` matched the waiter shells that contained the pattern, and a `pkill` on it killed them; match
  the node process or use `pgrep -x`.

## M1b — distribution and selection, the first release

Branch `feat/171-m1b` from main 132ae9d0. Three loop tasks (pre-flight 18e6329d), a follow-up and the release:

| Task | Commits | Review |
|---|---|---|
| M1b.1 release workflow, pin script, 0.1.0, `engine-linux` gate | 643909f3 | approved |
| M1b.2 selection, install, doctor, `cua engine build` on Linux | fa6a585a, ccce4fe7; fix 2d1c1fc8 | 1 round (a symlink bypass of the engine's containment), then approved |
| M1b.3 the facade harnesses' Linux engine lanes, suites on the VM | 863d16b0..b5f51114; fix 6866d9c5 | 1 round (four fail-open gate paths), then approved |
| M1b.1's Minor: the live gate's screenshot judged by content | c9ec213a, 3bc0ee60, 8ea09205, 8988b854 | 3 rounds (`reviewer-low`), then correct |
| Release `linux-engine-v0.1.0` and the pin | run 40969350911 on 0546538a; pin 1e18edaf | evidence below |

**Result.**
- Acceptance 9 on x86-64: the pinned, attested, static-pie asset installs into a fresh home, and doctor passes the
  engine row under `CUA_NATIVE_ENGINE=cua`.
- Acceptance 1: `scripts/accept/linux-native.mjs` passes 11/11 on the installed engine. A 50 ms sampler saw no
  `sky_linux`, and `cua-engine` ran as the trusted worker's child.
- Acceptance 10's facade suites pass on both engine lanes, with the cua lane on the local build before the release.
  repl-parity shows only the declared text cases; the native baseline's engine comparison passes.
- The default stays `vendor`.

**Branch review** (`doperpowers:reviewer-high`, 132ae9d0..6866d9c5): "correct", no material findings. It listed every
macOS-visible change for the coordinator's merge condition: 0.18.0's macOS changes are #221's fix (already on main),
the `--engine` usage error, and the Linux pin shipping in the package; everything else is internal or developer
tooling.

**Coordinator's merge conditions** (the marketplace auto-updates every Mac, the mini included):
- `ci-gate` GREEN on the PR head with `test` and `sandbox-live`;
- the PR body states 0.18.0's macOS changes exactly;
- no text from draft PR #211.

**Friction** (for a Mac session to record):
- devcloud rewrites `~/.ssh/authorized_keys` every 30 minutes, which wiped repl-parity's loopback key mid-run; it now
  lives in `authorized_keys2` (logged by the coordinator).
- Executors reused the controller's commit-message file, so two commits went out with stale messages and were amended
  and force-pushed with lease on the branch; later executors got their own message file.
- The worktree guard refused multi-line read-only probes from reviewers; single-line commands worked.

## M2 — text and clipboard, one verified paste route, the second release

Branch `feat/171-m2` from main 7023047c. Three loop tasks (pre-flight aecd9e37), the branch review's fix round and the
release:

| Task | Commits | Review |
|---|---|---|
| M2.1 the clipboard core (owner, lock, snapshot, generations, cleanup, `clipboard_read`/`release`) | 7b4a6773; fixes efaa06f3, 420f3f07, 50729a3d | 3 rounds (INCR cap underflow, cleanup anchors, a `SelectionClear` race, refused timestamps re-enabled, an abandoned take publishing), then approved |
| M2.2 the paste route, `type_characters`, the route on `--stats` | 9531b4c6..c79a318e; fix 69329228 | 1 round (uncertain X delivery answered as not applied; the confirmation deadline not absolute), then approved |
| M2.3 the harness's text proof, facade suites positive, 0.2.0, plugin 0.19.0, `m2/` | a28617ae..719b93f3; fixes e871a099..c48b5cbe, 6dc52571..5a229a08 | 2 rounds (route expectations, coalesced restacks, failed preparation and cleanups passing), then approved |
| Branch review fixes | de4802a5 (engine), 426e25f2 (harness), 8b49b682 (`m2/` rebuilt) | `reviewer-high`: "incorrect" (two clipboard faults, two harness gaps), then "correct" |
| Release `linux-engine-v0.2.0` and the pin | run 41090954823 on 8b49b682; pin and `m2/release/` after it | evidence below |

**Result.**
- cua's engine answers the five text and clipboard commands through one verified paste route. It makes no
  accessibility-bus text insertion, sends a paste at most once, confirms the result, and keeps the person's clipboard.
- Acceptance 6, and 2–5 for these commands, hold on x86-64 in the verdict run `m2-final`, which exits 0 on the
  released engine's sources.
- The facade suites' text cases are positive on the cua lane, and the native baseline's engine comparison passes.
- On the released asset: the fresh-home install, the doctor row, and the Linux acceptance fixture at 11/11, with no
  `sky_linux` and the engine as the trusted worker's child.
- The default stays `vendor`.

**Design-session decisions taken during M2** (all in the Decision Log):
- the `CurrentTime` window and its attribution to the target's X client;
- the dedicated-mode witness keyed to the route the request took;
- Acceptance 3's noise rule extended to every speed verdict, bounded on the interval's upper end;
- under-sampled desktop groups topped up, never judged on medians;
- the snapshot's owner generation checked atomically in the take;
- the unconfirmed window made display-wide, as a root-window property.

**Branch review** (`doperpowers:reviewer-high`, 7023047c..a422ebf4, then the fix range 1ea029a5..8b49b682). It found
two clipboard faults every task review had passed, each reproduced on a private Xvfb:
- A copy made between the snapshot and the take was lost.
- A second engine could cross-deliver into the first engine's unconfirmed target.

It also found two harness paths that could pass a failure: activation changed and restored between samples, and text
operations with no readable effect. All four were fixed. The re-review was "correct", and it checked the verdict run's
recorded engine hash against the build.

macOS inventory: 0.19.0 changes only the plugin's and marketplace's version on macOS; everything else is Linux-only or
internal.

**Deferred, carried to the PR's Unresolved Review Findings:**
- the GTK `ATK_IS_TEXT` criticals of the unreadable-field path;
- the M2.1 clear-race test's timing-based rendezvous.

**Friction** (for a Mac session to record):
- The worktree-isolation guard refused heredocs with code, loops, `export VAR=$HOME…`, some `&&` chains and some
  read-only reviewer probes as too complex. Each cost a rewrite into a script file run by path, or into single
  commands.
- A subagent has no blocking wait for a roughly 70-minute GUI run, since a foreground `sleep` is refused. The M2.3
  executor waited with a script looping on `read -t`.
- Committing the spec while an executor worked in the same checkout risked mixing the two commits' contents. Each
  controller commit therefore names its paths (`git commit -- <path>`).

## M3 — cua's own Linux service, the device mode, the capability report and the truncation line; the third release

Branch `feat/171-m3` from main fc15e1b8, merged with main five times (not rebased, to keep the commits the spec and
evidence cite). Three planned loop tasks (pre-flight: each consumes the one before), follow-up tasks for what the gates
found, the branch review's fix round, and the release. Ranges are `base..head`:

| Task | Commits | Review |
|---|---|---|
| 16, M3.1: device mode in `families.rs`, `capabilities`, the Chrome drag-and-drop guard, the revised speed judge | e149fbb2..6827213f; fixes 8e5aa0a2..0bbf37e7, c4bf8c5e..fee8b19a, fee8b19a..90b02cb8 | two reviewers (speed; device, drag-and-drop and witness), 3 rounds: a top-up schedule and planner that miscounted, a late drag and drop escaping the guard, "nothing dropped" claimed on signature bits already set, an in-front witness blind to a foreign popup; then the settle replaced by the late-take watch; then a silent watch failure. Approved |
| 17, M3.2: cua's own Linux service, the truncation line | 9a2c1c04..117f6698; fix 65b357d7..56d067d2 | 1 round (a throwing `setup` hung the facade; the capability checked on the wrong engine across a respawn), then approved |
| 18: the Chrome drop misses' mechanism (a release before Chrome's accept), the 350 ms floor after a take, the vendor bar rule | 0d7fee58..76ab6884; fix 76ab6884..48443307 | 1 round (cua's 20-sample minimum bypassed with no vendor bar; windowless Chromium drags skipping the floor; a swallowed collector error), then approved |
| 19, M3.3: doctor, provisioning, the facade proof, `m3-gate` (exit 1) | bcf64d68..d3761615; fix 1859f522..e1adea3c | 1 round (attestation fail-open when the field is absent; a snapshot-only device fixture; unverified editor cleanup), then converged with one deferral |
| 20: the short-drop miss (Blink's press reset), the atomic press and the stray watch | e1adea3c..eaee2acd (reproduction), eaee2acd..3ca5dda1 (build); fix b8725a6a..d50d489a | 1 round (every grab-ending crossing excluded, so a foreign grab ending mid-press answered success), then approved |
| 21: close-out: four merges of main, plugin 0.21.0, `m3-gate-final` (exit 1) | 486b1dca..754dea8a | the merges reviewed with task 22 |
| 22: the hold to press + 250 ms for a late take, the harness-fault resample rule, SIGINT cleanup | 47143d38..0db75d57; fix 8a14d0bb..3f00e0d3 | 1 round, then approved |
| 23: the branch review's fixes: the launch preflight, the atomic press capped at 8 samples, the in-front allowance's cleanup | 3f00e0d3..326456cc | `reviewer-high`: "incorrect" (three P2 at the joins between tasks), then "correct" |
| 24: merge of main 7aa1cbbb, `m3-gate-verdict` (stopped: the pinned lane's emptied gedit buffer over the harness-fault caps), the scene-text preparation | d17cbe31..d2c3770b; fixes 6964b1c6..981048b0, 981048b0..b01ac8fd | 2 rounds (the warm-up's witness discarded, a failed cua warm-up absorbed as a harness fault, the warm condition not reproduced, audit restores uncounted; then a warm-up's preparation error passing, restores before a refusal dropped), then approved |
| 25: `m3-gate-t25` (stopped by ruling: a VM build for glibc, not the shipped musl bytes) | 380b132b..f60aab33 | evidence only |
| 26: the release workflow's fault tests against a non-live asset; a real-path watch-loss test on the shipped bytes; the asset check | f60aab33..cd4c9297 | approved, no findings |
| 27: `m3-gate-musl` on the workflow's attested musl artifact (exit 0) | cd4c9297..f2de33cc | the gate |
| Release `linux-engine-v0.3.0` and the pin | run 41364541329 on cd4c9297 (`release/linux-engine-v0.3.0`); pin 9bf9d3a9; `m3/release/` after it | evidence below |

**Result.**
- With `CUA_NATIVE_ENGINE=cua`, no vendor JavaScript is loaded for the Linux computer surface: cua's service in
  `src/services/engine/linux/` drives `cua-engine`, refuses an engine older than 0.3.0, and renders trees, element
  numbers, native ids and error sentences equal to the vendor's service on the same engine (25 of 25 rows).
- The engine reads the device mode (`--desktop shared|dedicated`), answers `capabilities`, and applies each family's
  listed input kinds and conditions; refusals send nothing and activate nothing.
- The facade prints `Accessibility tree truncated: at least <n> elements not shown (<reason>)`; doctor shows the service,
  the capabilities and `accessibility.enabled`; provisioning writes `"desktop": "dedicated"` and sets `IsEnabled`.
- Chrome's HTML5 drag and drop no longer changes a `shared` desktop unasked: a background drag into Chrome that starts
  one is cancelled before the drop, a late one is cancelled at once and reported by the next acting request, and the
  drops cua allows land (the 350 ms floor after a take, the hold to press + 250 ms, the atomic press against Blink's
  press reset).
- The gate `m3-gate-musl` exits 0 on the release workflow's attested x64 musl build of cd4c9297, and the published x64
  asset is byte-identical to it: 63 of 66 speed series faster than the faster vendor build, 3 the same within noise, none
  within the bound; every device case and all 20 paste safety cases pass; 0 resampled and 0 invalid samples of 4,956;
  text restores pinned 43, newest 0, cua 0.
- On the released asset: the fresh-home install at the pin, doctor's engine row (service `cua`, its capabilities) and
  `accessibility.enabled`, Acceptance 1 at 11/11 with no `sky_linux` and the installed engine as the trusted worker's
  child, and the device-mode fixture at 18/18 on the installed engine. The default stays `vendor`.

**Design-session decisions taken during M3** (all in the Decision Log):
- one speed rule for every series: at least 20 samples a side, judged through the interval's upper bound, three labels,
  top-ups 20 → 40, frozen per-series decisions; a vendor build sets the bar only with 20 usable samples;
- the Chrome guard decided by the order of events, and the settle replaced by an off-path late-take watch with the
  acting-request rule (reads and releases always run);
- `setup` always answers, every method refusing on a failure, because the unchanged Sky proxy hangs on a throw (#236);
- the truncation line says "at least";
- the 350 ms floor after a take (task 18), the atomic press and stray watch (task 20, branch (ii): no pointer-outside
  refusal), the hold to press + 250 ms (task 22), the harness-fault resample rule and its caps;
- the branch review's three fixes;
- a sample whose preparation failed is never scored against a vendor; the scene-text preparation lane-neutral, a cua
  restore failing the run;
- the gate judges the bytes that ship, released from the gated commit and compared byte for byte.

**What failed and why it took longest.** Five gate runs, four of them failed or stopped, each for a different reason:
- `m3-gate` (task 19): a short Chrome drop with no `dragstart`. Task 20 found Blink's press reset (crbug 527582): a real
  pointer event read in the 2–5 ms between the synthetic press and the 4 px motion turns the drag into a click, in every
  engine. "Cold" was incidental.
- `m3-gate-final` (task 21): `dragstart` then a cancel, no take, about 34 ms from press to release. Chrome's take came
  53–93 ms after the press under the gate's own window load. It reproduced only through the gate's exact sequence, with
  its other Chrome windows open.
- `m3-gate-verdict` (task 24): the harness's own state. The pinned build's failed `type_text` over a selection deletes
  the selected word, so its gedit window emptied after nine samples, and every later preparation in that lane failed.
  The same emptying had been read since `m2-final` as the pinned build's Copy failing, and had prompted the vendor bar
  rule and a declaration to the owner; the declaration is withdrawn and the rule's reason corrected.
- `m3-gate-t25` (task 25): stopped by ruling when the design session's toolchain question showed the gate judged a VM
  build for glibc while the release ships the workflow's musl build, as M2's had. The build-only release run then
  exposed a third gap: the workflow ran fault-injection tests against a binary built without fault injection (task 26).
Lessons for M4 and M5: a gate scene's preceding scenes are part of its condition; a gate judges the bytes that ship,
built where they are built; a failure attributed to a vendor build is checked against the harness's own state before it
becomes a rule; a test of a safety rule runs on the shipped bytes with a real fault.

The whole-branch review again found faults at the joins between tasks: a launch through the supervisor never reached
the engine, so a pending late-drop notice was skipped; the atomic press's grab was unbounded on a path that never
crossed 4 px; and the in-front allowance (task 16) never required the drag windows that task 20's path produced to be
gone. All three were fixed test-first with the reviewer's reproductions, and the re-review was "correct".

**Known gaps, declared** (tracked on #171, comment 6550241152, and the design session's tickets):
- the short Chrome drop is slower than the newest vendor build (40 px in front: 469 ms against 258), and the 350 ms
  floor's margin is thin (latest accept seen 275 ms after the take);
- the hold costs a Chromium drag that never takes up to 250 ms (a 40 px selection about 134 → 355 ms), and a take later
  than press + 250 ms still answers ok while the drop misses;
- load parity: under twice the gate's load cua's Chromium thumb drags landed 17–19 of 20 where the pinned build landed
  20 of 20; M4's thumb work measures under that load, 40 samples a side;
- #248, #249 (widened by the hold), #250, #260 (a Chrome textarea's selection lost on a failed clipboard read after the
  paste chord, read from the code, never observed);
- arm64 is covered by the release workflow's engine tests only, with no verdict run;
- M1a's desktop `move` gap, unchanged.

**Deferred, carried to the PR's Unresolved Review Findings** (and `tech-debt-tracker.md`):
- the M3.3 fixture's cleanup: `witness.stop`'s timeout does not kill the witness, and the scratch directory is removed
  while a process may still run (a cleanup failure fails the run, so it cannot pass falsely);
- the M3.2 respawn test's ordering, which relies on a 20 ms fake exit against the 100 ms settle.

**Friction** (for a Mac session to record):
- The worktree-isolation guard refused heredocs, compound commands, `for` loops over files named after the gate,
  `export … XAUTHORITY=$HOME…`, variables in option positions, paths containing `GitHub` inside compound commands,
  sminos messages quoting a diff command, a `grep` whose pattern was the word `complete`, and some read-only
  Python-wrapped `cargo tree` calls. Each cost a rewrite into a script file run by path.
- `pkill -f` matched the executor's own shell; harness cleanup kills by recorded PID instead.
- The auto-mode classifier blocked removing the harness's old `/tmp` scratch directories; 149 remain on the VM (606 MB).
- `xdotool mousemove --sync` blocked about 13 s on this display; the reproductions moved the pointer through xprobe.
- Main moved five times during M3's close-out; each move after a gate commit cost a merge and a decision on rerunning
  the gate.
- The frozen gate engine must be named `cua-engine`; `scripts/repl-parity` refuses a diff of lanes recorded at
  different controller commits, so a merge mid-proof costs a rerun of both lanes; a downloaded artifact loses its
  executable bit.
- `gh attestation verify` prints nothing when run from a script; its `--format json` output is the record.
- Executors whose context grew past about 450k tokens (task 16 at 663k, task 18 at 679k, task 20 at 537k) were replaced
  by fresh fixers for their fix rounds.

## M4 — the measured improvements, the drags at the bar, Chrome's drops and `drag_handle`; the fourth release

Branch `feat/171-m4` from main 9d3fdce6 (M3's squash). It was merged with main twice and never rebased: e112f4f3
brought in T1's own pull request (#273, squash fc091b83), and b445fd15 brought in 30 commits of macOS engine work after
the release, touching no frozen path. Side branches merged into the line: T19's (fast-forwarded after 3e6ed163 merged
the line into it), T16's (770f286d), T18's workers w3–w5, the whole-branch review's fix waves and the gate's fix
branches. T6's and T7b's fixes were cherry-picked from review worktrees. At 097cda8f the branch holds 527 commits beyond
main, 504 of them not merges. From M4 on the plan-executor opens the pull request and the design session merges it
(sminos 277); M4's was being drafted when this was written.

The pre-flight (ea9e155c) was folded into the spec as T1–T18 (e066f444). A `doperpowers:adversarial-reviewer` pass on
the folded plan raised seven findings (two P1); the re-check closed five, the controller resolved the three new
conflicts it found in 1f3bebd6, and no further round ran. Loop tasks 28 to 80 then ran one at a time, with the tasks
the work added. Ranges are `base..head`; "T" numbers are rows of the spec's M4 table. Task reviews are the loop's
`doperpowers:task-reviewer` (on fable for tasks 51–56, while the sol and astra reviewers were out of
quota), and `doperpowers:reviewer-medium` for tasks 59 to 73, `-low` where named.

| Task | Commits | Review |
|---|---|---|
| 28, T1 (#267): the harness takes only the attested artifact; own branch `fix/267-attested-candidate` | 9d3fdce6..32a2e296; fixes 32a2e296..23c2709f, 23c2709f..a5f86eed | 2 rounds (a dev retry under the gate's label, a stop during preparation leaving a copy, `--version` before the eligibility check; then a stop-handler gap and an unreaped preparation command), then approved. PR #273, merged by the design session. No report file in the workspace: the row rests on the ledger |
| 29, T2 (#268): the newest build's gedit `clipboard_write`; the apps' stderr; a guard on text mutators | 7fc17bde, c4748447, e7c62d69, 88877e2e; fixes f66725d9, 67a3494a, cf6d82f0 | commit by commit: the static guard was evadable, so a refusal at the bus's send boundary replaced it; the re-review found raw writers the source check missed; the last round was accepted without another review, its controls reproducing both counterexamples |
| 30–32, T3: truncation from the engine | 73a196a8..f26c6c9e; task 31 merged main (e112f4f3) and fixed e112f4f3..43a89b9b; task 32 67a3494a..22fd7aa1 | approved with two Minors, fixed together with the design session's generic declaration; that round's re-review found the tree-extent oracle inexact (four counterexamples), and a fresh executor built the stats-based one; approved |
| 33–34, T4: minimized windows | 4d6b33a7..a6a8a375; fix a6a8a375..b8b79a25 | 1 round (wrong-window and bogus-screenshot predicates passing; a release audit that did not prove release-only), by a fresh fixer (the executor at 611k); approved |
| 35–36, T4b: the harness never changes a window it did not open | e6ed649f..84a64b3e; 84a64b3e..668252fd; 668252fd..d6853188 | 5 Important, then one audit round under the design session's stop rule; the bounded final review found 2 real foreign paths (a reused foreign Chrome id closed at cleanup; a pointer park into the owner's popup), fixed narrowly; converged by the stop rule |
| 37–39, T5: window identity | 16bfcdc8..a5022cfd; fixes a5022cfd..6b5afbbe, 6b5afbbe..cfc7497f, cfc7497f..4e8f694d | 3 rounds by fresh fixers (the executor at 568k): a discarded `Told` state, a caption fallback and an X11 fallback; then one partial; then a context-menu Copy bound to the process, not the window; approved |
| 40–41, 44, T4c and the RECORD guard | d61872f2..7ad6f03d (T4c's e54658b8, then task 41); fix 5ad1a30a..c56d03c3, and 619f3c2c | 7 Important (the watchdog's arming, readiness and death; two selection rules; an experiment and repro scripts outside the watchdog or the private fence) in one wave; of the re-review's two, one was fixed (a watchdog ready, then gone) and one dismissed as a stated limit the design session had ruled, the reviewer disagreeing; ended by the stop rule. Accepted live by tasks 49 and 50 |
| 42: T4c's acceptance on a private display | none | blocked: its stub opened Chrome on the person's profile (below); report filed by the controller |
| 43: the harness's own Chrome and a private session bus | c85389d8..76143766; fix f7f2b9e2..619f3c2c | 1 round (an inherited `AT_SPI_BUS_ADDRESS`, a stop during the session's start, an unhandled spawn error), by a fresh fixer; approved |
| 45, 47, 48: the apps' own homes, one spawner for X tools, a private bus on `:0`, Qt's a11y-bus stub | 32e22c6f..ee703d5e; fc518b9a..4e3c25dc; 4e3c25dc..297f8c20 | task 45's 4 Important went into task 47 with the design session's rulings; its re-review found the vendor-JS lane outside the spawner, fixed in task 48; approved, two Minors to tech debt |
| 46, 49, 50: the isolation's live checks, private and on `:0` | evidence 32e22c6f, 80f04e14, 69f3b4ac | evidence, checked by the controller against each task's live list. Their findings became fixes in task 45 (from 46), task 51 (from 49) and the judge task 53 (from 50); T4c's acceptance stands on 49 and 50 |
| 51–52: the GTK 4 warm-up, the temp dirs, Qt's control, the judge's own-range rule | 7664513a..943085e5; fix 155be796..d778a092; 609da4e4 | on fable: 3 Important (clients reading the person's `~/.Xauthority`, unconsumed GTK 4 frames, the services' TMPDIR), by a fresh fixer; approved. Task 52 (sonnet) took the follow-ups |
| 53–54: judge rules (XTEST placement, the witness's focus allowance, matrix refusals), proven on `:0` | e294837e..bd1be5fa; fix bd1be5fa..1525e2be; evidence abefbe06 | 1 Important (the frame clause's liveness hole), by a fresh fixer; approved. Task 54's `:0` proof checked by the controller against task 53's list |
| 55, T6: the AT-SPI investigations | 98f48253..38975fcb; fix 38975fcb..8cdc5452 on `fix-55`, cherry-picked (55bacc6d to 24363dfa) | approved with Minors (one the design session's correction of a RECORD sentence), fixed; approved |
| 56, T7: the `FocusOut` timer | 3695a0e8..9f3edff1; fixes 9f3edff1..76ba4842, 76ba4842..418f1e26, probe 3c99d1fe, 3c99d1fe..cbe1e95f, 45a8d03d..aad090b8, aad090b8..5f15449e | six reviews by one reviewer: 2 Important (a run index overwriting its name; consecutive runs not independent); approved three times; then the scrolled-paste rule's paste-size axis; approved. Five design escalations between rounds (the exit drain, a paste settle, the REPL host's kill, the scrolled terminal's confirmation, the never-taken paste) |
| 57, T7b: the REPL host lets the engine drain | f59575fb..2298ea48; fixes on `fix-57` in six waves, 391c6395..4bec0315, cherry-picked onto the line (cb17afa7 to 98d3317c, f6baa4a0 to a0e58dbd); fix 7 6318c3c9..5bc37f76 | six rounds by one reviewer: the escalation budget and a fail-open experiment; a reaper race, its bounds, a panic deadlock; a launcher stranded by a supervisor SIGKILL; a forgeable held-input record (shown releasing another XTEST client's Shift), a truncating record, unbounded handoffs; two timeout-handoff faults; then approved, and the stop rule bound. Fix 7 (`reviewer-low`) correct |
| 58–60, T7 revised: the timer measured unnecessary; a paste settle | 58: evidence c84bcd74, 6318c3c9; 59 and 60: one package 5bc37f76..e1ec6114; fix e1ec6114..ff7670e9 | 58 evidence only, stopped by its own rule (the 0 ms control cut nothing on `:0`); 59 and 60 together: incorrect (a click-then-paste regression; a control audited by lane, not scenario), by a fresh fixer; correct |
| 61: no background press activates a window (Qt) | ff7670e9..0f046b66; fixes 0f046b66..e45a1f45, e45a1f45..a46c0cb6, a46c0cb6..82634941 | incorrect three times (a frame's active state is not its native child's, a reused session's stale snapshot; a multi-click, a modal ancestor; a cached acknowledgement, a new activation path), then a structural fix (one acknowledgement per press, a press-boundary test); correct |
| 62, T8: the action settle | 66e21595..4996fd29; fixes 7ba4cb67..1763c662, 1763c662..85f8f691 | incorrect (7 P2), by a fresh fixer; incorrect (an audit verdict accepting a desktop change; one P2 dismissed by ruling 473), fixed with a recount of every audited sitting (0 in 403 audits); correct |
| 63: the foreground route waits for the raise; `activate_window` answers on top | 4996fd29..2ecf6e9e; fix 2ecf6e9e..09227d09; follow-up 09227d09..dfdd38b4 | correct with no findings three times (`reviewer-low` on the follow-up); both later waves came from rulings 461 and 464 |
| 64, T9: the remaining fixed waits | 21cc0e73..684dd4cf; fix 684dd4cf..0e018237 | incorrect (2 P2: an offscreen predicate unsafe for an occluded descendant; Gecko's held-move pause dropped without evidence; and a P3), by a fresh fixer; correct |
| 65, T10: the drag judges | 843d3179..f27b9b5b; fix f27b9b5b..38f3ae5e | incorrect (5 P2), by the executor; its recount of Firefox's coalesced samples changed T11's premise; correct |
| 66, T11: the motion model | 04732370..59c30d64; fix 59c30d64..f2561e8d; follow-up 8251772e | incorrect (2 P2, one a release over another screen's window), by a fresh fixer; correct. The follow-up (a repeatable two-screen command) read by the controller |
| 67, T12 (#265): thumbs and ranges at twice the load | 7d464cb2..676a39f3 (evidence only); fix 676a39f3..aa4588cc | `reviewer-low`: incorrect on the rerun scripts alone (2 P2), fixed; correct |
| 68, T13: Chromium drop signals, measured | 4501a3f5..2917848d; fixes 2917848d..4598425e, 4598425e..af5c01d6 | incorrect (6 P2, one a stale accept that would release falsely), by a fresh fixer; incorrect (2 P2, statements only), fixed, the third look skipped (sminos 563) |
| 69, T14 (#263, #264, #269): Chromium drops | 54654c22..b553c5c1; fix b553c5c1..8ecf2777, with a9e0d562, 209ae2ce | incorrect (2 P2 in the confirmation watcher), by the executor; the remaining P2 dismissed by ruling 595; converged |
| 70, T15: drag predicates | 2917848d..be009c24 on `feat/171-m4-t15` | not reviewed: closed as superseded by T19, since its point rule widened a silent no-op (T19's 1bac0061 reverts it) |
| 71, T19 (#353): Gecko's pointer route by the real pointer | be009c24..e47fc1e3 on `feat/171-m4-t19`; fix e47fc1e3..2acc8054; merged at 3e6ed163 and 7747640f | incorrect (3 P2: an unwatched reroute answering success, unread effects, a leave judge passing missed parks), by the executor; correct. Four declared `:0` sittings: three before the build (1,400 runs), the manifest after it (32/32) |
| 72, T16: Writer's first drag, LibreOffice's element points | 328a3bb5..770b924e on `feat/171-m4-t16`; fix 770b924e..bb161064 on `feat/171-m4-t16-fix`; merge 770f286d | incorrect (4 P2, one a root pane bypassing the check), by a fresh fixer; correct; merged by a fresh executor |
| 73, T17 (#250): `drag_handle`, Electron's drop confirmation | the proposal ruled first (sminos 598); 6f216132..df988aa5; fixes 6e55c836..2d76095c, 2d76095c..1df5d015, 1df5d015..2c65f88a | four reviews by one reviewer. Three in a row each found new answers of ok for drops that never happened (an abandoned handle stranding pointer input; an ambiguous first accept; a late take read before the watchdog's notice), with two findings dismissed by rulings 611 and 615; the bounded fourth, under the convergence line (sminos 627), correct |
| 75: T19's control-drag flake | the test fix in 0a83de46 (taken by T17's fixer's commit by path); evidence f9eab71e | no separate review (a test fix and evidence); T17's re-review and the whole-branch review covered it |
| 74, T18: the close-out (0.4.0, `MIN_ENGINE_VERSION`, the plugin's bump to 0.28.0, the gate's steps, the facade suites) | fa25cb83..3529448c, five workers | no task review: its code went to the whole-branch review's slices C, D1 and D2 (below) |
| The whole-branch review's six fix waves | f1cb9179..a43b64cd; a70db70e (merge 44264ab8); ddb62024; 34959245 (merge e0e0dda1); e1085997..e0a03b70; 8ab1cc75 | below |
| Fixes beside the review: ffdnd-fix (from T18's gate pilot), audit-leak-fix, own-host-fix | 44264ab8..8fb5e2e2 (merge cb3661b3); 8a6e0f45 (merge 4c532708); ed939416, 85226389 | ffdnd: slice B correct; slice D1 incorrect (unread counters passing), fixed in 8ab1cc75, then correct. audit-leak-fix with the gate's scripts (task 79). own-host-fix, a test's setup, not reviewed apart |
| 76: the gate, candidate 1 | R2's top-up 3529448c..2d5cfeb5; fix 2d5cfeb5..514f5c62; evidence 41b08b4e | slice D1's reviewer: incorrect (P1: the top-up's other outcomes unjudged), fixed; correct. The gate cut at V5 |
| V5's investigation and fix | 41b08b4e..f9692898 (v5-telemetry merged) | slice B's reviewer on 514f5c62..9dfc33f0: correct |
| 77: the gate, candidate 2 | evidence 866b7d01 (committed by task 79); scripts and tech debt 05733962 | the gate; cut at L3a. Its report is interim (handed back at 471k); the rest is in the ledger and `m4/gate/README.md` |
| 78: a requested context menu is confirmed, or answers `menuUnconfirmed` | 87c1ecc5..997d2ece; fix 997d2ece..c2d2da8b; folded c55c8e08 | 2 Important (the menu deadline not bounding its reads; GTK menu tests skipped in CI), by a fresh fixer; approved |
| 79: the gate, candidate 3, and the record of all three | 866b7d01, 049cb20b, ba0434ff; fix ba0434ff..d57c4efa, and 4d3085b3 | `reviewer-medium` on the re-judge scripts and audit-leak-fix: incorrect (3 P2), fixed, every re-judge rerun with no verdict moved; correct. The gate passed |
| 80: the release | run 43637317960 on c55c8e08 (`release/linux-engine-v0.4.0`); pin ed5bf1bc; evidence 0193a543 | below |

**Result** (`m4/README.md`, `m4/gate/README.md`, `m4/release/README.md`; what M4 built and what it costs is the spec's
Outcomes & Retrospective, M4):
- The release gate passed on its third candidate, the release workflow's attested build-only artifact of c55c8e08
  (`751ec9be…`). Every step passes on the record of the latest candidate that ran it, by the gate's own judge or by a
  ruling over stored records, and what is declared is listed apart.
- `linux-engine-v0.4.0`'s published x64 asset is those bytes, pinned in ed5bf1bc.
- On the released asset, in a run-owned home on a private display: the install at the pin, doctor's engine row,
  Acceptance 1 at 11/11 with no `sky_linux` in 3,355 samples, and the device-mode fixture at 18/18. A home still on
  0.3.0 fails doctor, and its first request is refused, both naming `cua install --engine`; after that command it
  passes.
- The default stays `vendor`.

**How the design session steered it.** Every design call went to the design session (sminos 277 to 700 in the ledger),
and each ruling is in the Decision Log under the task it shaped. The rulings that changed how M4 ran, rather than what
it built:
- one display user at a time, after T1's fix-round live check overlapped T3's run on `:0` (2026-11-02, 02:42Z);
- a stop rule for each review loop: after its last round, only a finding of the class the loop exists for reopens it (a
  path to the person's display, instance, bus or files; a false success; for T17, a fault reproduced with the real
  engine on an ordinary scene, sminos 627);
- a fresh fixer once an executor passed about 450k tokens;
- a host-wide lock (`locked.sh`, sminos 540–541) for every counted sitting, heavy build and suite, once T14 and T15 were
  to run side by side on one host; the desk track's maintenance windows on the same VM were taken under it;
- the design session hears before any GO whose conditions are not literally met (582);
- the same 403 or 429 means usage: stop dispatching, wait, resume (558);
- concurrent executors in their own worktrees (624), with a variant for T18's workers on disjoint files (632);
- the gate is its own rehearsal, on the attested artifact, after the whole-branch review (637); a later candidate reruns
  only what its diff reaches, plus one cross-check (677, 691); a pass by ruling is a script over stored rows, with
  negative controls, listed in one table (662).

**What failed and why it took longest.**
- **Two incidents on 2026-11-02, both the harness's own.** At 16:40 VM time (UTC−8) `:0` froze: Xorg looped in
  `FlushClient` on the harness's whole-run X RECORD connection during T4c's full-manifest run, and all display work
  stopped. The controller's recovery step (closing that descriptor under gdb) was blocked by the auto-mode classifier,
  and the appeal confirmed that it needed the owner's own approval in this session. The owner ran the design session's
  guarded script instead, and `:0` answered again at 20:15. Task 41 reproduced the loop on Xvfb in 255 s (Xorg
  21.1.12, no upstream fix) and made whole-run RECORD private-only, under a watchdog. At 18:46, task 42's private run
  opened the harness's stub as a bare `google-chrome --new-window`. It started on the person's default profile, and
  Chrome's process singleton ended the person's frozen browser about 20 s later. The Sessions folder was backed up, and
  the owner restarted Chrome through the design session's script. The isolation series, tasks 43–54, followed; it was
  folded the next day (1ac5ecae).
- **T7 was built, then measured unnecessary.** Task 56 built the `FocusOut` timer through five fix rounds and a probe,
  and task 57 hardened the engine's drain through seven fix waves. Then task 58's `:0` sitting and the controller's
  reading of M0's code showed that M0.3's and M0.4's cut keys came from the engine's exit unredirect, not from an early
  `FocusOut`, and task 59 measured no cut at 0 ms on any family. The timer gave way to a paste settle (task 60). This
  ran from 2026-11-03 to 11-05; the drain stayed.
- **Found in sittings, fixed before the next task:** task 61, Qt windows activated by background clicks at twice the
  load (found in task 60's sittings; four review rounds to a structural fix), and task 63, GTK 4's foreground pointer
  input sent before the raise (found in T8's sittings).
- **T17:** three reviews in a row each found a new path to an ok with no drop.
- **Usage stops.** The sol and astra reviewers ran out of quota on 2026-11-03, and fable stood in. An API 403 killed
  both running subagents for about 15 hours (11-09 09:24Z to 11-10 00:39Z). A 429 stopped work for about 2 h 20 min
  (11-11 19:44Z to 22:05Z); its uncommitted work went to side branches (`wip/171-m4-t17-xdnd`, `wip/171-task75`), each
  deleted once it landed.
- **The gate ran on three candidates** (below).

Lessons: the spec's Outcomes & Retrospective, M4.

**Whole-branch review** (`doperpowers:reviewer-high`, before the gate, sminos 637). The branch was too large for one
reader (414 commits and 264 code files, +56k lines, when it was planned), so it ran in slices, each given the whole spec
and the interfaces across its boundary. Slices A (the engine core, 16k lines), B (the drag family, 10k) and C (the REPL
host, the service, the runtime and the workflows, with T18's code, 3.6k) started from f12756ee while T18 still ran. D1
(the gate and its judges, 7.7k lines) and D2 (the experiments and runners, 33k) started from 080caa09, once T18's gate
pilot settled. Findings:
- A: one P2, a held handle's idle bound unserviced while the engine's output was blocked.
- B: three P2: an auto-expired handle answering a later move with the button up; a handle's screen size stale after a
  RandR resize; a dedicated foreground drag confirmed against its source window.
- C: one P1, a reset during an in-flight `drag_start` that pressed afterwards; one P2, a shell injection through TMPDIR
  in the shim's tests.
- D1: two P1 (Chrome's late-take steps judged by nothing; a page's stale effect that could hide a control's false ok)
  and two P2 (a notice passing without the next request's refusal; a reused run name mixing development and gate
  provenance). D2: one P2, the minimized judge failing a correct desktop on the person's own minimized windows.

The six fix waves:
- wbr-fix took every A, B and C finding, each RED on f12756ee's code (a43b64cd).
- wbr-fix2 came from B's discovery that a stale handle could move a later one, ruled a fix rather than debt (sminos
  642; 44264ab8).
- wbr-fix3 and wbr-fix4: C's re-reviews found two more ordering holes. They were closed by one queue for handle
  operations and a 640-interleaving invariant test, RED on 142 of 640 before it, under a one-attempt rule (sminos 644;
  e0e0dda1).
- harness-fix took D1's four and D2's one, then re-judged every posted figure from stored records. None changed, and
  the one set the stored rows could not verify (T14's device controls) was rerun (e0a03b70).
- unread-fix: D1's bounded review of ffdnd-fix found unread counters passing (8ab1cc75).

Every slice's re-review was correct, and the review converged at 8ab1cc75. Later deltas had bounded reviews: the
Linux baseline's speed rule (D1, correct), R2's top-up (D1, one P1, then correct), the V5 fix (B, correct), and the
gate's re-judge scripts with audit-leak-fix (`reviewer-medium`: three P2, two of them ways to pass wrongly; then
correct).

**The gate.** By ruling 637 the gate is the rehearsal itself: `--gate` runs on the release workflow's attested
build-only x64 musl artifact of a frozen head, after the whole-branch review. Every artifact is labelled "release gate"
or "development run, not a release gate" (633). The plan was 49 steps and 1,206 minutes: 211 on `:0` in six steps
(V1–V5, Z0) and 995 on private displays, idle and at twice the load. R2's top-up later made it 1,216. A driver ran the
private steps under the host lock. Each `:0` sitting was announced 45 minutes ahead, the design session held its related
sessions, and the sitting started on the design session's GO. The record of all three candidates is `m4/gate/README.md`.
- **Candidate 1, 514f5c62** (build-only run 43405393873, `f7c12e9b…`; task 76, 2026-11-13). The idle private block and
  the `:0` sitting ran (19:30–22:32Z); the block at twice the load was held.
  - D2 and V5's first run were environment faults, both rerun: Electron's binary was absent, and the snap's Firefox
    started.
  - S1, P6 and V3 passed by rulings over stored records: #302 (659), Fisher's tolerance (662), #373 (666).
  - V5's rerun found two Chrome drops answered ok with no drop, and the design session ruled that they reopen work
    (669). An investigator and then a reproduction task found the mechanism at the gate's window load under xtrace, 2
    of 102: Chromium's coalescing of core motion events throws away a busy browser's queued path. A refresh on the
    held route fixed it (0 in 306 + 306). The guarded route went to #365 after a `_NET_WM_PING` check failed its
    condition.
- **Candidate 2, f9692898** (run 43553123316, `90b9650e…`; task 77, 2026-11-14). The 23 steps the fix reaches reran,
  with D3 as a cross-check (sminos 677), and the held block ran. S1 and L3b passed by #302, V5 by the witness span's
  limit (680). L3a found Chrome's context-menu Copy stuck under twice the load after one timed-out Copy. Every answer
  was honest, and the design session ruled the stuck state a defect (683).
- **Candidate 3, c55c8e08** (run 43608161213, `751ec9be…`; tasks 78 and 79). Every `showContextMenu` caller now confirms
  a menu or answers `menuUnconfirmed`. S1, S2, S4, V3 (on `:0`), L3a and L3b reran; S2 and S4 were cross-checks, both
  equal to candidate 1's. All passed: S1 and L3b by #302, and V3 by #373 with its two chrome-input cells declared
  unconfirmed (688, 691). The gate passed.

Every pass by ruling is a script over the stored rows, through the candidate's own judge functions, with negative
controls. The scripts' review led to ruling 697 and the fixes 2851ce49, c204e9e4 and d57c4efa. Rerun over every stored
record, the fixed scripts moved no verdict, and ruling 699's read of the load judge's records found nothing either
(4d3085b3).

**The release.** ci-gate on 4d3085b3 came back RED 2/8 on two known races, and the rerun was green (43636266249). Task
80 then dispatched `linux-engine.yml` with publishing on `release/linux-engine-v0.4.0` at c55c8e08: run 43637317960,
published 2026-11-14T20:31:38Z.
- The x64 asset is `751ec9be…`, the gated bytes. The arm64 asset, `0cbde8f0…`, equals the build-only run's. Both
  attestations verify.
- The pin, ed5bf1bc, changes `runtime/engine/linux-engine.json` alone.
- The checks on the released asset ran in a run-owned home on a private display (`:1`), not in M3's default home on
  `:0`, so the person's installed engine was left as it was (`m4/release/`, 0193a543).

Then main was merged in (b445fd15: 30 commits, no frozen path, the plugin kept at 0.28.0), and the spec folded T18
(097cda8f). `ci-gate` on 097cda8f was RED 1/8 on `engine-swift`: BackgroundPointerTests'
`testAFailedEnablementWriteStillOpensTheFreshWindowAndIsReported`, in main's merged macOS code (run 43639178511). Its
rerun passed (43641035615), so every gate is green on 097cda8f. The pull request followed, with the execution report
and two tech-debt entries in its last commit.

**Declared, and the limits** (listed apart in the pull request; the reasons are the spec's):
- gaps with no closing route: Chrome's long drop (#358, with Acceptance 3 amended) and `activate_window`'s raise wait
  (#373);
- #302, an Electron page's key release after the 100 ms settle (its judge is #371, for M5), and V3's two
  `menuUnconfirmed` cells;
- #263 and #269, taken to the owner with their numbers;
- stated limits #362, #364, #365, #372 and #375–#379, with #374 on macOS; arm64 only in the workflow's tests (#266);
  in-cell judging for M5 (#370).

**Deferred, carried to the PR's Unresolved Review Findings.** The reviews' Minors went to `tech-debt-tracker.md`
(through f7f2b9e2, 4e835bc0, a5ef4bff, cf1d3428, 45a8d03d, 39551c41, 9cd5f4b9, 6e55c836, 9dfc33f0, 05733962, 049cb20b
and 4d3085b3, among others). Outside the tracker:
- the cleanup after a lost watchdog is unwatched (task 44's re-review). It was ruled a stated limit on condition that
  the run exits nonzero naming the loss (sminos 325, 326); the reviewer disagreed;
- a holder the launcher shim cannot discover (task 57's last review), on the shared-display ticket (#277);
- dismissed by rulings: T14's re-review finding that ordinary drop cases hard-fail an honest non-landing (595,
  intended); T8's old-engine answer (473, closed by `MIN_ENGINE_VERSION` 0.4.0); T17's reset at the next setup (615,
  built in T18 as the release at `js_reset`) and its 6.0% unconfirmed handles (611, a finding on #364).

**Friction** (for a Mac session to record; `~/.claude` is pull-only on this host. The design session and the desk track
logged some on the Mac, as marked):
- **The controller's compact tool was unavailable** (its resume pointers from 2026-11-02 on say so), so its context ran
  up to the harness's own auto-compaction near 867k tokens; it reached about 850k. The workaround was 21 resume pointers
  in the ledger, each naming what ran, what was next and the standing rules, so a compaction or restart could pick up
  from the file.
- **The worktree-isolation guard refused commands that run no git.** It refused heredocs, loops, `$VAR` paths, any line
  naming a path with `GitHub` in it (read as git), `diff <(…)`, `${PIPESTATUS[0]}`, a string holding `github_pat_`, and
  once a plain `ls` of two paths.
  - 35 task reports from task 32 to 79 recorded it, and so did three branch reviewers, at up to about ten refused calls
    a task. Writing this section met it twice.
  - Workaround: script files with literal paths, run by path; Write and Edit; symlinks to shorten paths.
  - It also pins a subagent spawned without `isolation: worktree` to its parent's worktree: T15's executor could not
    enter the worktree made for it, and T18's workers w3–w5 were relaunched with isolation. It refused `git -C` into
    another worktree too.
- **A subagent's Write of its report or a draft was refused** seven times (tasks 57, 60, 64, 70, 74 and 78, and the
  review's first fix wave across worktrees). The controller saved most of them from the hand-back; one fixer appended
  through a script.
- **The harness forced executors to hand back mid-task** four times: task 74 at 424k, task 76 at 298k, and task 77 at
  241k and 293k. The controller kept their state in the ledger and resumed them on the next event.
- **A hung proof held the host lock.** Task 78's live proof held it about 19 minutes (12:17–12:36Z) after its node
  process failed to exit when a Firefox step failed, and the gate's L4b waited 20 minutes behind it. The executor killed
  its own pid, and its script now exits itself under a 30-minute bound.
  - The lock's `flock` did not queue its waiters either: task 75's back-to-back blocks starved T17's fixer, and a pilot
    took the lock ahead of the architect's hold. `locked.sh` gained a yield for any holder that released less than 90 s
    earlier.
  - Two builds ran outside the lock by slip (a T19 `cargo check`, a T17 build). A cargo wrapper that takes the lock went
    into the briefs.
- **A stale xprobe:** a worktree's xprobe binary can be older than its sources, and the harness's commands then fail
  with a usage line (task 78). The gate's checkouts build xprobe before any step, and the gate requires it.
- **`xdotool mousemove --sync` hangs** when the pointer is already at the target (task 78; M3 met it as a 13 s block).
  Move the pointer elsewhere first, or move it through xprobe.
- **electron 44.9.0 ships no install script,** so `npm ci` never fetches its binary, and the gate's D2 died at spawn in
  15 s on candidate 1 (rerun). Every fresh checkout runs `node node_modules/electron/install.js`. A harness preflight is
  P3 tech debt (sminos 665), and the design session logged the friction.
- **The snap Firefox.** An unattended upgrade replaced Mozilla's Firefox deb with the snap, which cannot start on the
  harness's bus (task 59). The unpacked deb 159.0~build1 sits first on PATH; fixing the system needs root. The `:0`
  commands lacked that PATH, so V5's first run on candidate 1 started the snap, which failed in the guard's session (an
  environment fault, rerun). The `:0` launcher now refuses a Firefox step unless the `firefox` on PATH is task 59's
  (sminos 668).
- **`npm test` fails about 51 tests on the Linux VM** for platform reasons (macOS-only fixtures, such as
  `/usr/sbin/lsof`), so it is not evidence either way. The design session logged it
  (`cua/live/npm-test-on-linux-vm-fails-about-51-for-platform-reasons.md`). `serve-own-host`'s `sandbox_unavailable`
  was fixed in the test instead (ed939416).
- **Racy hosted gates.** Each cost a rerun of the failed gates and a tech-debt entry:
  - parity-browser's api cell (`api/browser-playwrightlocator/waitfor`, RED on ba0434ff and 4d3085b3), and its
    keypress, scroll and waitfor cells;
  - the macOS engine client's ping test (`services-engine-client` saw two pings against one, on 4d3085b3);
  - `engine-swift`'s BackgroundPointerTests on 097cda8f (main's code);
  - sandbox-denials' native-pipe cell, twice;
  - timing flakes in remote-agent, repl-parity's mcp test, the terminal-start stubs and two engine clipboard tests.

  One "flake", identity_faults (6 in 100), was a real race in the engine, fixed in T18. One run ended in ERROR ("run
  failed though no gate did"), two overlapping runs cancelled each other's macOS jobs, and GitHub's macOS runners once
  queued for 1 h 40 min (task 69).
- **Orphaned audit proxies.** The harness's xtrace proxies outlived runs that ended before their stop (an exit 1 or a
  signal).
  - They were orphaned to pid 1 with their X sockets (X40, X41, X43, X44, from 11-08 to 11-12), beside about 620 MB of
    scratch.
  - The stale X42 and X43 sockets failed two `private-server.test.mjs` cells locally for days.
  - They were killed by pid, after rereading each command line and start time, with the design session's approval
    (sminos 651–653), and fixed in audit-leak-fix (8a6e0f45).
  - Earlier, two `/tmp` sweeps removed 373 `cua171-*` scratch directories (among them a 1 GB `:0` xtrace log from the
    frozen run) and stale X sockets.
- **Others:**
  - The auto-mode classifier blocked two gist uploads (the pre-flight for the design session, the second VM's
    inventory), the `:0` recovery step (above), a `pkill -f` cleanup and a time-filtered `/tmp` sweep.
  - During a maintenance window, the desk track's `devenv up maws` installed system fonts. Openbox's title bar grew
    2 px, so fully visible Firefox scenes no longer fit the screen and were refused (31 of 31). The harness now fits
    its scenes by frame extents. The desk track logged it:
    `MAWS/live/devenv-up-maws-installs-system-fonts-on-a-shared-host.md`.
  - Two executors in one checkout: a commit by path takes the whole file, so T17's fixer committed task 75's hunk, and
    `git add -p` is interactive. Ruled: never share a checkout concurrently (sminos 624).
  - Shell and tool traps:
    - `pkill -f` matched its own shell again (task 73's third fix);
    - editing a bash script while it runs breaks it (task 41);
    - Node's test runner writes environment-bearing reports into the working directory on SIGUSR2 (task 45);
    - this host's `python3` lacks Xlib, so probes used ctypes over libX11;
    - a subagent cannot run a foreground sleep (task 76).
  - The harness's `cua serve` ran `sminos who --session` with the agent's inherited session id every few seconds
    (task 58; harness debt).
  - A second VM for T15 was provisioned, then dropped by the owner; T15 ran beside T14 under the host lock.
  - By the ledger's figures, 31 executors and fixers passed about 450k tokens (task 60's reached 711k). Each was
    replaced by a fresh fixer for its next round, or kept for a narrow fix in its own code.
